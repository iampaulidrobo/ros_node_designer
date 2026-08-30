/**
 * Manual smoke script for Graph + PackageGenerator, run via `node out/smoke.js`
 * after `npx tsc -p tsconfig.json`. Not part of the extension bundle (esbuild's
 * entry point is src/extension.ts only) -- this is a standalone check.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Graph, ConnectionValidationError } from "./model/Graph";
import { PackageGenerator } from "./generator/packageGenerator";

let failures = 0;

function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  [PASS] ${label}`);
  } else {
    failures += 1;
    console.log(`  [FAIL] ${label}`);
  }
}

function expectThrow(label: string, expectedMessage: string, fn: () => void): void {
  try {
    fn();
    failures += 1;
    console.log(`  [FAIL] ${label} (did not throw)`);
  } catch (err) {
    const ok = err instanceof ConnectionValidationError && err.message === expectedMessage;
    check(`${label} -> "${(err as Error).message}"`, ok);
  }
}

console.log("=== 1. Connection validation rules ===");
{
  const g = new Graph();
  const a = g.createNode("node", "Talker", "/chatter", "std_msgs/String");
  const b = g.createNode("node", "Listener", "/chatter", "std_msgs/Bool");
  const t = g.createNode("topic", "Chatter Topic", "/chatter", "std_msgs/String");
  const t2 = g.createNode("topic", "Other Topic", "/other", "std_msgs/String");
  const c = g.createNode("node", "SecondPublisher", "/chatter", "std_msgs/String");

  // Valid: node -> topic (publisher), matching message types.
  g.addConnection(a.id, t.id);
  check("valid publisher connection accepted", g.connections.length === 1);

  // Self-loop rejected.
  expectThrow("self-loop rejected", "A node cannot connect to itself.", () => {
    g.addConnection(a.id, a.id);
  });

  // Invalid pair (topic -> topic) rejected.
  expectThrow(
    "invalid entity pair rejected",
    "Connections are only allowed between a node and a topic, service, or action.",
    () => {
      g.addConnection(t.id, t2.id);
    }
  );

  // Message type mismatch rejected (t2 has no publisher yet, so this isolates the
  // message-type rule from the one-publisher-per-topic rule).
  expectThrow(
    "message type mismatch rejected",
    "Message types do not match: 'std_msgs/Bool' → 'std_msgs/String'.",
    () => {
      g.addConnection(b.id, t2.id);
    }
  );

  // Duplicate publisher on the same topic rejected.
  expectThrow("duplicate publisher rejected", "A topic can only have one publisher node.", () => {
    g.addConnection(c.id, t.id);
  });

  // Duplicate identical connection rejected. (Using a NODE<->SERVICE pair here,
  // not NODE->TOPIC: a repeated NODE->TOPIC connection always trips the
  // one-publisher-per-topic rule first, since the existing identical
  // connection itself counts as an existing publisher.)
  const svc = g.createNode("service", "SetParams", "/set_params", "std_msgs/String");
  g.addConnection(a.id, svc.id);
  expectThrow("duplicate connection rejected", "That connection already exists.", () => {
    g.addConnection(a.id, svc.id);
  });
}

console.log("=== 2. Round-trip JSON save/load (snake_case schema) ===");
{
  const g = new Graph();
  const pub = g.createNode("node", "Talker", "/chatter", "std_msgs/String", 10, 20);
  const topic = g.createNode("topic", "Chatter", "/chatter", "std_msgs/String", 200, 20);
  g.addConnection(pub.id, topic.id);

  const json = g.toJSON();
  const parsed = JSON.parse(json);
  check("serialized node uses snake_case keys", "node_name" in parsed.nodes[0] && "message_type" in parsed.nodes[0]);
  check("serialized connection uses from/to keys", "from" in parsed.connections[0] && "to" in parsed.connections[0]);
  check("no camelCase leaked into JSON", !("nodeName" in parsed.nodes[0]) && !("messageType" in parsed.nodes[0]));

  const reloaded = Graph.fromJSON(json);
  check("round-trip preserves node count", reloaded.nodes.length === g.nodes.length);
  check("round-trip preserves connection count", reloaded.connections.length === g.connections.length);
  check(
    "round-trip preserves field values",
    reloaded.getNode(pub.id)?.nodeName === "Talker" && reloaded.getNode(pub.id)?.x === 10
  );

  // Hand-edited file with a now-invalid connection should be silently dropped, not crash.
  const tampered = JSON.parse(json);
  tampered.nodes[1].message_type = "std_msgs/Bool"; // topic's type no longer matches publisher
  const lenient = Graph.fromDict(tampered);
  check("invalid connection from hand-edited file is dropped on load", lenient.connections.length === 0);

  // Id counter must advance past the max numeric id seen.
  const nextId = reloaded.nextId();
  check("id counter advances past loaded ids", parseInt(nextId, 10) > Math.max(...reloaded.nodes.map((n) => parseInt(n.id, 10))));
}

console.log("=== 3. Package generation (1 publisher + 1 subscriber over a topic) ===");
{
  const g = new Graph();
  const pub = g.createNode("node", "Talker Node", "/chatter", "std_msgs/String");
  const sub = g.createNode("node", "Listener Node", "/chatter", "std_msgs/String");
  const topic = g.createNode("topic", "Chatter", "/chatter", "std_msgs/String");
  g.addConnection(pub.id, topic.id); // Talker -> topic: publisher
  g.addConnection(topic.id, sub.id); // topic -> Listener: subscriber

  const templatesDir = path.join(__dirname, "..", "templates");
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "ros-node-designer-smoke-"));
  const generator = new PackageGenerator(g, "My Demo Package!", templatesDir);
  check("package name sanitized", generator.packageName === "My_Demo_Package");

  const pkgRoot = generator.generate(outDir);
  check("package root exists", fs.existsSync(pkgRoot));

  const talkerCpp = fs.readFileSync(path.join(pkgRoot, "src", "Talker_Node.cpp"), "utf8");
  const listenerCpp = fs.readFileSync(path.join(pkgRoot, "src", "Listener_Node.cpp"), "utf8");
  const cmake = fs.readFileSync(path.join(pkgRoot, "CMakeLists.txt"), "utf8");
  const packageXml = fs.readFileSync(path.join(pkgRoot, "package.xml"), "utf8");
  const launch = fs.readFileSync(path.join(pkgRoot, "launch", "demo.launch.py"), "utf8");
  const readme = fs.readFileSync(path.join(pkgRoot, "README.md"), "utf8");

  check("publisher source used publisher template", talkerCpp.includes('node->create_publisher<std_msgs::msg::String>("/chatter", 10);'));
  check("publisher populates sample field with node name substituted", talkerCpp.includes('msg.data = "Hello from Talker_Node";'));
  check("publisher has no stray {{ }} placeholders left", !/\{\{[A-Z_]+\}\}/.test(talkerCpp));
  check("subscriber source used subscriber template", listenerCpp.includes('node->create_subscription<std_msgs::msg::String>('));
  check("subscriber has no stray {{ }} placeholders left", !/\{\{[A-Z_]+\}\}/.test(listenerCpp));

  check("CMakeLists declares both executables", cmake.includes("add_executable(Talker_Node src/Talker_Node.cpp)") && cmake.includes("add_executable(Listener_Node src/Listener_Node.cpp)"));
  check("CMakeLists excludes std_msgs from extra find_package (only std_msgs used)", !cmake.includes("find_package(std_msgs REQUIRED)\nfind_package(std_msgs"));
  check(
    "CMakeLists FIND_PACKAGE_DEPS empty for std_msgs-only design (only the 3 hardcoded find_package calls)",
    (cmake.match(/find_package\(/g) || []).length === 3
  );
  check("CMakeLists install targets list both executables", cmake.includes("  Talker_Node") && cmake.includes("  Listener_Node"));

  check("package.xml has no extra <depend> for std_msgs-only design", !packageXml.includes("<depend>"));

  check("launch file lists both nodes comma-joined", launch.includes('Node(package="My_Demo_Package", executable="Talker_Node", name="Talker_Node", output="screen"),\n        Node(package="My_Demo_Package", executable="Listener_Node"'));

  check("README summarizes both nodes with roles", readme.includes("**Talker_Node** (Publisher)") && readme.includes("**Listener_Node** (Subscriber)"));

  console.log("\n--- src/Talker_Node.cpp ---\n" + talkerCpp);
  console.log("\n--- CMakeLists.txt ---\n" + cmake);
}

console.log("=== 4. Executable name de-duplication ===");
{
  const g = new Graph();
  g.createNode("node", "worker", "/a", "std_msgs/String");
  g.createNode("node", "worker", "/b", "std_msgs/String");
  g.createNode("node", "worker", "/c", "std_msgs/String");
  const templatesDir = path.join(__dirname, "..", "templates");
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "ros-node-designer-smoke-dedup-"));
  const generator = new PackageGenerator(g, "dedup_pkg", templatesDir);
  const pkgRoot = generator.generate(outDir);
  const files = fs.readdirSync(path.join(pkgRoot, "src")).sort();
  check("de-duplicated executable names: worker.cpp, worker_2.cpp, worker_3.cpp", JSON.stringify(files) === JSON.stringify(["worker.cpp", "worker_2.cpp", "worker_3.cpp"]));
}

console.log("=== 5. Empty design rejected ===");
{
  const g = new Graph();
  const templatesDir = path.join(__dirname, "..", "templates");
  try {
    new PackageGenerator(g, "empty_pkg", templatesDir).generate(os.tmpdir());
    failures += 1;
    console.log("  [FAIL] empty design should have thrown");
  } catch (err) {
    check(`empty design rejected -> "${(err as Error).message}"`, (err as Error).message === "The design is empty -- add at least one node.");
  }
}

console.log("=== 6. Non-std_msgs dependency filtering (geometry_msgs) ===");
{
  const g = new Graph();
  g.createNode("node", "Driver", "/cmd_vel", "geometry_msgs/Twist");
  const templatesDir = path.join(__dirname, "..", "templates");
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "ros-node-designer-smoke-geo-"));
  const generator = new PackageGenerator(g, "geo_pkg", templatesDir);
  const pkgRoot = generator.generate(outDir);
  const cmake = fs.readFileSync(path.join(pkgRoot, "CMakeLists.txt"), "utf8");
  const packageXml = fs.readFileSync(path.join(pkgRoot, "package.xml"), "utf8");
  check("CMakeLists adds find_package(geometry_msgs REQUIRED)", cmake.includes("find_package(geometry_msgs REQUIRED)"));
  check("CMakeLists still hardcodes std_msgs (not duplicated)", (cmake.match(/find_package\(std_msgs REQUIRED\)/g) || []).length === 1);
  check("ament_target_dependencies uses geometry_msgs for that executable", cmake.includes("ament_target_dependencies(Driver rclcpp geometry_msgs)"));
  check("package.xml adds <depend>geometry_msgs</depend>", packageXml.includes("<depend>geometry_msgs</depend>"));
  check("package.xml does not re-add <depend>std_msgs</depend> (hardcoded already)", (packageXml.match(/<depend>std_msgs<\/depend>/g) || []).length === 0);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
