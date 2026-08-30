import * as fs from "fs";
import * as path from "path";
import { Graph } from "../model/Graph";
import { RosNode } from "../model/RosNode";
import { getInfo } from "../utils/messageTypes";
import { sanitizeIdentifier } from "../utils/naming";

/** Render a `{{KEY}}` template read from `templatesDir/templateName`. */
function render(templatesDir: string, templateName: string, context: Record<string, string>): string {
  let text = fs.readFileSync(path.join(templatesDir, templateName), "utf8");
  for (const [key, value] of Object.entries(context)) {
    text = text.split(`{{${key}}}`).join(value);
  }
  return text;
}

/** Best-effort default location for the templates/ directory, relative to this
 * module's compiled output. The extension host overrides this explicitly with
 * `path.join(context.extensionPath, 'templates')`. */
function defaultTemplatesDir(): string {
  return path.join(__dirname, "..", "..", "templates");
}

interface ResolvedNode {
  node: RosNode;
  /** Unique C++ executable / launch node name. */
  executable: string;
  /** e.g. "publisher.cpp". */
  sourceFile: string;
  /** publishes to its topic, vs. subscribes to it. */
  isPublisher: boolean;
}

/** Turns a design graph into a ROS 2 (ament_cmake) package on disk. */
export class PackageGenerator {
  readonly packageName: string;
  private readonly graph: Graph;
  private readonly resolved: ResolvedNode[];
  private readonly templatesDir: string;

  /**
   * `templatesDir` defaults to the `templates/` directory shipped next to this
   * extension's compiled output (see `defaultTemplatesDir`); the extension host
   * always passes an explicit `path.join(context.extensionPath, 'templates')` so
   * templates are read as files at runtime rather than bundled into the JS.
   */
  constructor(graph: Graph, packageName: string, templatesDir: string = defaultTemplatesDir()) {
    this.graph = graph;
    this.packageName = sanitizeIdentifier(packageName, "ros_pkg");
    this.templatesDir = templatesDir;
    this.resolved = this.resolveNodes();
  }

  private resolveNodes(): ResolvedNode[] {
    const resolved: ResolvedNode[] = [];
    const used = new Set<string>();
    for (const node of this.graph.nodes) {
      if (node.type !== "node") continue;
      const base = sanitizeIdentifier(node.nodeName, "node");
      let name = base;
      let suffix = 1;
      while (used.has(name)) {
        suffix += 1;
        name = `${base}_${suffix}`;
      }
      used.add(name);
      resolved.push({
        node,
        executable: name,
        sourceFile: `${name}.cpp`,
        isPublisher: this.isPublisher(node),
      });
    }
    return resolved;
  }

  private isPublisher(node: RosNode): boolean {
    for (const connection of this.graph.connectionsFor(node.id)) {
      if (connection.fromId === node.id) {
        const other = this.graph.getNode(connection.toId);
        if (other && other.type === "topic") {
          return true;
        }
      }
      if (connection.toId === node.id) {
        const other = this.graph.getNode(connection.fromId);
        if (other && other.type === "topic") {
          return false;
        }
      }
    }
    return true;
  }

  /** Write the package under outputDir and return its root path. Throws if the design has no nodes. */
  generate(outputDir: string): string {
    if (this.resolved.length === 0) {
      throw new Error("The design is empty -- add at least one node.");
    }

    const root = path.join(outputDir, this.packageName);
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "launch"), { recursive: true });

    for (const item of this.resolved) {
      fs.writeFileSync(path.join(root, "src", item.sourceFile), this.renderSource(item), "utf8");
    }

    fs.writeFileSync(path.join(root, "CMakeLists.txt"), this.renderCMake(), "utf8");
    fs.writeFileSync(path.join(root, "package.xml"), this.renderPackageXml(), "utf8");
    fs.writeFileSync(path.join(root, "launch", "demo.launch.py"), this.renderLaunch(), "utf8");
    fs.writeFileSync(path.join(root, "README.md"), this.renderReadme(), "utf8");

    return root;
  }

  private renderSource(item: ResolvedNode): string {
    const node = item.node;
    const info = getInfo(node.messageType);
    const baseCtx: Record<string, string> = {
      NODE_NAME: item.executable,
      TOPIC: node.topic,
      MSG_INCLUDE: info.include,
      MSG_TYPE: info.cppType,
      MSG_TYPE_STR: info.rosType,
    };

    if (!item.isPublisher) {
      return render(this.templatesDir, "subscriber.cpp.tmpl", baseCtx);
    }

    const usesCounter = info.sampleField.includes("count++");
    const populate = info.sampleField
      ? "    " + info.sampleField.replace("{node}", item.executable)
      : "    // default-constructed message (all fields zeroed)";

    return render(this.templatesDir, "publisher.cpp.tmpl", {
      ...baseCtx,
      COUNTER_DECL: usesCounter ? "  int count = 0;\n" : "",
      MSG_POPULATE: populate,
    });
  }

  /** Unique ament packages required by the design's message types. */
  private messagePackages(): string[] {
    const packages = new Set(this.resolved.map((r) => getInfo(r.node.messageType).package));
    return Array.from(packages).sort();
  }

  /** Message packages not already hardcoded as rclcpp/std_msgs depends. */
  private extraMessagePackages(): string[] {
    return this.messagePackages().filter((d) => d !== "std_msgs" && d !== "rclcpp");
  }

  private renderCMake(): string {
    const findPkg = this.extraMessagePackages().map((d) => `find_package(${d} REQUIRED)\n`).join("");

    const blocks: string[] = this.resolved.map((item) => {
      const pkg = getInfo(item.node.messageType).package;
      return (
        `add_executable(${item.executable} src/${item.sourceFile})\n` +
        `ament_target_dependencies(${item.executable} rclcpp ${pkg})\n`
      );
    });

    return render(this.templatesDir, "CMakeLists.txt.ros2.tmpl", {
      PACKAGE_NAME: this.packageName,
      FIND_PACKAGE_DEPS: findPkg,
      AMENT_DEPENDS: "",
      EXECUTABLES: blocks.join("\n"),
      INSTALL_TARGETS: this.resolved.map((item) => `  ${item.executable}`).join("\n"),
    });
  }

  private renderPackageXml(): string {
    return render(this.templatesDir, "package.xml.ros2.tmpl", {
      PACKAGE_NAME: this.packageName,
      DEPENDENCIES: this.extraMessagePackages().map((d) => `  <depend>${d}</depend>\n`).join(""),
    });
  }

  private renderLaunch(): string {
    const tags = this.resolved
      .map(
        (item) =>
          `        Node(package="${this.packageName}", executable="${item.executable}", ` +
          `name="${item.executable}", output="screen")`
      )
      .join(",\n");

    return render(this.templatesDir, "demo.launch.py.tmpl", {
      PACKAGE_NAME: this.packageName,
      NODE_TAGS: tags,
    });
  }

  private renderReadme(): string {
    const lines = this.resolved.map((item) => {
      const node = item.node;
      const role = item.isPublisher ? "Publisher" : "Subscriber";
      const verb = item.isPublisher ? "publishes to" : "subscribes to";
      return (
        `- **${item.executable}** (${role}) ${verb} \`${node.topic}\` ` +
        `using \`${node.messageType}\` (source: \`src/${item.sourceFile}\`)`
      );
    });
    const first = this.resolved.length > 0 ? this.resolved[0].executable : "node";

    return render(this.templatesDir, "README.md.tmpl", {
      PACKAGE_NAME: this.packageName,
      NODE_SUMMARY: lines.join("\n"),
      FIRST_EXECUTABLE: first,
    });
  }
}
