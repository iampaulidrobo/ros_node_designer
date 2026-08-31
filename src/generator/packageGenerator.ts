import * as fs from "fs";
import * as path from "path";
import { Graph } from "../model/Graph";
import { RosNode } from "../model/RosNode";
import { getInfo, MessageTypeInfo } from "../utils/messageTypes";
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

/** PascalCase a sanitized identifier, e.g. "add_two_ints" -> "AddTwoInts". */
function pascalCase(ident: string): string {
  return ident
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

type EntityKind = "topic" | "service" | "action";
type Role = "publish" | "subscribe" | "server" | "client";

/** One publisher/subscriber/service-or-action-server/service-or-action-client that
 * a "node" entity is wired up to. A node can have any number of these, of any kind. */
interface Interface {
  entity: RosNode;
  kind: EntityKind;
  role: Role;
  info: MessageTypeInfo;
  /** Unique-within-this-node identifier used to build member/method names. */
  ident: string;
}

interface ResolvedNode {
  node: RosNode;
  /** Unique C++ executable / launch node name. */
  executable: string;
  /** e.g. "talker.cpp". */
  sourceFile: string;
  interfaces: Interface[];
}

/** The C++ generated for one interface: what it needs, and the code it contributes. */
interface InterfaceCode {
  includes: string[];
  requiresActionSupport: boolean;
  /** Statements placed in the constructor body. */
  ctor: string;
  /** An optional private helper method the constructor calls into. */
  method?: string;
  /** Private member variable declarations. */
  members: string[];
}

/** Turns a design graph into a ROS 2 (ament_cmake) package on disk. Each "node"
 * entity becomes one rclcpp::Node subclass with a member (publisher, subscription,
 * service, client, action server or action client) for every topic, service or
 * action it's wired to -- a node may have any number of each, mirroring how real
 * ROS 2 nodes are built, so this scales to large, multi-interface designs. */
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
        interfaces: this.resolveInterfaces(node),
      });
    }
    return resolved;
  }

  /**
   * A "node" entity can host any number of publishers, subscribers, service or
   * action servers, and service or action clients -- one per connection, and
   * they don't need to share a message type since the node itself isn't typed.
   * The connection direction mirrors ownership: node -> entity means the node
   * owns it (publishes the topic / serves the service or action); entity ->
   * node means the node consumes it (subscribes / calls / sends goals).
   */
  private resolveInterfaces(node: RosNode): Interface[] {
    const interfaces: Interface[] = [];
    const used = new Set<string>();
    for (const connection of this.graph.connectionsFor(node.id)) {
      const outgoing = connection.fromId === node.id;
      const other = this.graph.getNode(outgoing ? connection.toId : connection.fromId);
      if (!other || other.type === "node") continue;

      const kind = other.type as EntityKind;
      const role: Role =
        kind === "topic" ? (outgoing ? "publish" : "subscribe") : outgoing ? "server" : "client";

      const base = sanitizeIdentifier(other.nodeName || other.topic, kind);
      let ident = base;
      let suffix = 1;
      while (used.has(ident)) {
        suffix += 1;
        ident = `${base}_${suffix}`;
      }
      used.add(ident);

      interfaces.push({ entity: other, kind, role, info: getInfo(other.messageType), ident });
    }
    return interfaces;
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

  // --- per-interface C++ generation ------------------------------------------

  private renderPublish(iface: Interface, executable: string): InterfaceCode {
    const { info, entity } = iface;
    const pubVar = `pub_${iface.ident}_`;
    const timerVar = `timer_${iface.ident}_`;
    const counterVar = `count_${iface.ident}_`;
    const usesCounter = info.sampleField.includes("count++");
    const populate = info.sampleField
      ? "      " + info.sampleField.replace("{node}", executable).replace(/\bcount\b/g, counterVar)
      : "      // default-constructed message (all fields zeroed)";

    return {
      includes: [info.include],
      requiresActionSupport: false,
      ctor: [
        `    ${pubVar} = create_publisher<${info.cppType}>("${entity.topic}", 10);`,
        `    ${timerVar} = create_wall_timer(1s, [this]() {`,
        `      auto msg = ${info.cppType}();`,
        populate,
        `      ${pubVar}->publish(msg);`,
        `      RCLCPP_INFO(get_logger(), "[${executable}] published on '${entity.topic}'");`,
        `    });`,
      ].join("\n"),
      members: [
        `  rclcpp::Publisher<${info.cppType}>::SharedPtr ${pubVar};`,
        `  rclcpp::TimerBase::SharedPtr ${timerVar};`,
        ...(usesCounter ? [`  int ${counterVar} = 0;`] : []),
      ],
    };
  }

  private renderSubscribe(iface: Interface, executable: string): InterfaceCode {
    const { info, entity } = iface;
    const subVar = `sub_${iface.ident}_`;
    return {
      includes: [info.include],
      requiresActionSupport: false,
      ctor: [
        `    ${subVar} = create_subscription<${info.cppType}>(`,
        `      "${entity.topic}", 10,`,
        `      [this](const ${info.cppType}::SharedPtr msg) {`,
        `        // TODO: process the incoming message (fields depend on ${info.rosType}).`,
        `        (void)msg;`,
        `        RCLCPP_INFO(get_logger(), "[${executable}] received a message on '${entity.topic}'");`,
        `      });`,
      ].join("\n"),
      members: [`  rclcpp::Subscription<${info.cppType}>::SharedPtr ${subVar};`],
    };
  }

  private renderServiceServer(iface: Interface, executable: string): InterfaceCode {
    const { info, entity } = iface;
    const srvVar = `srv_${iface.ident}_`;
    return {
      includes: [info.include],
      requiresActionSupport: false,
      ctor: [
        `    ${srvVar} = create_service<${info.cppType}>(`,
        `      "${entity.topic}",`,
        `      [this](const std::shared_ptr<${info.cppType}::Request> request,`,
        `             std::shared_ptr<${info.cppType}::Response> response) {`,
        `        // TODO: fill in \`response\` based on \`request\` (fields depend on ${info.rosType}).`,
        `        (void)request;`,
        `        (void)response;`,
        `        RCLCPP_INFO(get_logger(), "[${executable}] handled a request on '${entity.topic}'");`,
        `      });`,
      ].join("\n"),
      members: [`  rclcpp::Service<${info.cppType}>::SharedPtr ${srvVar};`],
    };
  }

  /** Service clients call from the constructor, as soon as the node starts up. */
  private renderServiceClient(iface: Interface, executable: string): InterfaceCode {
    const { info, entity } = iface;
    const cliVar = `cli_${iface.ident}_`;
    const methodName = `call${pascalCase(iface.ident)}`;
    return {
      includes: [info.include],
      requiresActionSupport: false,
      ctor: [`    ${cliVar} = create_client<${info.cppType}>("${entity.topic}");`, `    ${methodName}();`].join("\n"),
      method: [
        `  void ${methodName}()`,
        `  {`,
        `    while (!${cliVar}->wait_for_service(1s)) {`,
        `      if (!rclcpp::ok()) {`,
        `        RCLCPP_ERROR(get_logger(), "Interrupted while waiting for service '${entity.topic}'");`,
        `        return;`,
        `      }`,
        `      RCLCPP_INFO(get_logger(), "Waiting for service '${entity.topic}'...");`,
        `    }`,
        ``,
        `    auto request = std::make_shared<${info.cppType}::Request>();`,
        `    // TODO: populate \`request\` (fields depend on ${info.rosType}).`,
        ``,
        `    ${cliVar}->async_send_request(`,
        `      request,`,
        `      [this](rclcpp::Client<${info.cppType}>::SharedFuture future) {`,
        `        auto response = future.get();`,
        `        // TODO: use \`response\` (fields depend on ${info.rosType}).`,
        `        (void)response;`,
        `        RCLCPP_INFO(get_logger(), "[${executable}] received a response from '${entity.topic}'");`,
        `      });`,
        `  }`,
      ].join("\n"),
      members: [`  rclcpp::Client<${info.cppType}>::SharedPtr ${cliVar};`],
    };
  }

  private renderActionServer(iface: Interface, executable: string): InterfaceCode {
    const { info, entity } = iface;
    const v = iface.ident;
    const srvVar = `action_server_${v}_`;
    return {
      includes: [info.include],
      requiresActionSupport: true,
      ctor: [
        `    auto handle_goal_${v} = [](const rclcpp_action::GoalUUID&, std::shared_ptr<const ${info.cppType}::Goal>) {`,
        `      // TODO: accept or reject the goal (fields depend on ${info.rosType}).`,
        `      return rclcpp_action::GoalResponse::ACCEPT_AND_EXECUTE;`,
        `    };`,
        `    auto handle_cancel_${v} = [](const std::shared_ptr<rclcpp_action::ServerGoalHandle<${info.cppType}>>) {`,
        `      return rclcpp_action::CancelResponse::ACCEPT;`,
        `    };`,
        `    auto handle_accepted_${v} = [this](const std::shared_ptr<rclcpp_action::ServerGoalHandle<${info.cppType}>> goal_handle) {`,
        `      std::thread([this, goal_handle]() {`,
        `        // TODO: execute the goal, optionally publish feedback via`,
        `        // goal_handle->publish_feedback(...), then finish with`,
        `        // goal_handle->succeed(result) (fields depend on ${info.rosType}).`,
        `        auto result = std::make_shared<${info.cppType}::Result>();`,
        `        goal_handle->succeed(result);`,
        `        RCLCPP_INFO(get_logger(), "[${executable}] completed a goal on '${entity.topic}'");`,
        `      }).detach();`,
        `    };`,
        `    ${srvVar} = rclcpp_action::create_server<${info.cppType}>(`,
        `      this, "${entity.topic}", handle_goal_${v}, handle_cancel_${v}, handle_accepted_${v});`,
      ].join("\n"),
      members: [`  rclcpp_action::Server<${info.cppType}>::SharedPtr ${srvVar};`],
    };
  }

  /** Action clients send their goal from the constructor, deferred one tick via a
   * one-shot timer since sending a goal immediately can race the client's own
   * discovery of the server. */
  private renderActionClient(iface: Interface, executable: string): InterfaceCode {
    const { info, entity } = iface;
    const v = iface.ident;
    const cliVar = `action_client_${v}_`;
    const timerVar = `timer_${v}_`;
    const methodName = `sendGoal${pascalCase(v)}`;
    return {
      includes: [info.include],
      requiresActionSupport: true,
      ctor: [
        `    ${cliVar} = rclcpp_action::create_client<${info.cppType}>(this, "${entity.topic}");`,
        `    ${timerVar} = create_wall_timer(100ms, [this]() {`,
        `      ${timerVar}->cancel();`,
        `      ${methodName}();`,
        `    });`,
      ].join("\n"),
      method: [
        `  void ${methodName}()`,
        `  {`,
        `    if (!${cliVar}->wait_for_action_server(5s)) {`,
        `      RCLCPP_ERROR(get_logger(), "Action server '${entity.topic}' not available");`,
        `      return;`,
        `    }`,
        ``,
        `    auto goal_msg = ${info.cppType}::Goal();`,
        `    // TODO: populate \`goal_msg\` (fields depend on ${info.rosType}).`,
        ``,
        `    auto options = rclcpp_action::Client<${info.cppType}>::SendGoalOptions();`,
        `    options.feedback_callback =`,
        `      [this](rclcpp_action::ClientGoalHandle<${info.cppType}>::SharedPtr, const std::shared_ptr<const ${info.cppType}::Feedback>) {`,
        `        RCLCPP_INFO(get_logger(), "[${executable}] received feedback on '${entity.topic}'");`,
        `      };`,
        `    options.result_callback =`,
        `      [this](const rclcpp_action::ClientGoalHandle<${info.cppType}>::WrappedResult&) {`,
        `        RCLCPP_INFO(get_logger(), "[${executable}] goal on '${entity.topic}' finished");`,
        `      };`,
        ``,
        `    ${cliVar}->async_send_goal(goal_msg, options);`,
        `    RCLCPP_INFO(get_logger(), "[${executable}] sent a goal to '${entity.topic}' [${info.rosType}]");`,
        `  }`,
      ].join("\n"),
      members: [
        `  rclcpp_action::Client<${info.cppType}>::SharedPtr ${cliVar};`,
        `  rclcpp::TimerBase::SharedPtr ${timerVar};`,
      ],
    };
  }

  private renderInterfaceCode(iface: Interface, executable: string): InterfaceCode {
    if (iface.kind === "topic") {
      return iface.role === "subscribe"
        ? this.renderSubscribe(iface, executable)
        : this.renderPublish(iface, executable);
    }
    if (iface.kind === "service") {
      return iface.role === "client"
        ? this.renderServiceClient(iface, executable)
        : this.renderServiceServer(iface, executable);
    }
    return iface.role === "client"
      ? this.renderActionClient(iface, executable)
      : this.renderActionServer(iface, executable);
  }

  private renderSource(item: ResolvedNode): string {
    const chunks = item.interfaces.map((iface) => this.renderInterfaceCode(iface, item.executable));

    const includeSet = new Set<string>();
    for (const c of chunks) {
      for (const inc of c.includes) includeSet.add(inc);
    }
    const msgIncludes = Array.from(includeSet)
      .sort()
      .map((inc) => `#include <${inc}>`)
      .join("\n");
    const needsAction = chunks.some((c) => c.requiresActionSupport);
    const actionInclude = needsAction ? "#include <rclcpp_action/rclcpp_action.hpp>\n" : "";

    const ctorBody =
      chunks.length > 0
        ? chunks.map((c) => c.ctor).join("\n\n")
        : "    // No publishers, subscribers, services or actions wired up yet.";

    const privateSection =
      chunks.length > 0
        ? chunks.map((c) => [...(c.method ? [c.method] : []), ...c.members].join("\n")).join("\n\n")
        : "  // (no interfaces)";

    return render(this.templatesDir, "ros_node.cpp.tmpl", {
      NODE_NAME: item.executable,
      CLASS_NAME: item.executable,
      ACTION_INCLUDE: actionInclude,
      MSG_INCLUDES: msgIncludes,
      CTOR_BODY: ctorBody,
      PRIVATE_SECTION: privateSection,
    });
  }

  /** Unique ament packages required across every node's interfaces in the whole design. */
  private messagePackages(): string[] {
    const packages = new Set<string>();
    for (const item of this.resolved) {
      for (const iface of item.interfaces) packages.add(iface.info.package);
    }
    return Array.from(packages).sort();
  }

  /** Message packages not already hardcoded as rclcpp/std_msgs depends, plus rclcpp_action when needed. */
  private extraMessagePackages(): string[] {
    const packages = new Set(this.messagePackages().filter((d) => d !== "std_msgs" && d !== "rclcpp"));
    if (this.resolved.some((item) => item.interfaces.some((i) => i.kind === "action"))) {
      packages.add("rclcpp_action");
    }
    return Array.from(packages).sort();
  }

  private renderCMake(): string {
    const findPkg = this.extraMessagePackages().map((d) => `find_package(${d} REQUIRED)\n`).join("");

    const blocks: string[] = this.resolved.map((item) => {
      const packages = Array.from(new Set(item.interfaces.map((i) => i.info.package))).sort();
      const needsAction = item.interfaces.some((i) => i.kind === "action");
      const deps = ["rclcpp", ...(needsAction ? ["rclcpp_action"] : []), ...packages].join(" ");
      return (
        `add_executable(${item.executable} src/${item.sourceFile})\n` +
        `ament_target_dependencies(${item.executable} ${deps})\n`
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

  private describeRole(iface: Interface): string {
    if (iface.kind === "topic") return iface.role === "subscribe" ? "Subscriber" : "Publisher";
    if (iface.kind === "service") return iface.role === "client" ? "Service client" : "Service server";
    return iface.role === "client" ? "Action client" : "Action server";
  }

  private renderReadme(): string {
    const lines = this.resolved.map((item) => {
      if (item.interfaces.length === 0) {
        return `- **${item.executable}** -- no publishers, subscribers, services or actions wired up yet (source: \`src/${item.sourceFile}\`)`;
      }
      const parts = item.interfaces
        .map((iface) => `${this.describeRole(iface)} of \`${iface.entity.topic}\` (\`${iface.entity.messageType}\`)`)
        .join("; ");
      return `- **${item.executable}**: ${parts} (source: \`src/${item.sourceFile}\`)`;
    });
    const first = this.resolved.length > 0 ? this.resolved[0].executable : "node";

    return render(this.templatesDir, "README.md.tmpl", {
      PACKAGE_NAME: this.packageName,
      NODE_SUMMARY: lines.join("\n"),
      FIRST_EXECUTABLE: first,
    });
  }
}
