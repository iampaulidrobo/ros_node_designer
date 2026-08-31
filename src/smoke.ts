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
  const a = g.createNode("node", "Talker", "", "");
  const b = g.createNode("node", "Listener", "", "");
  const t = g.createNode("topic", "Chatter Topic", "/chatter", "std_msgs/String");
  const t2 = g.createNode("topic", "Other Topic", "/other", "std_msgs/String");
  const c = g.createNode("node", "SecondPublisher", "", "");

  // Valid: node -> topic (publisher).
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

  check("t2 (unrelated topic) still has no owner yet", !g.connections.some((conn) => conn.toId === t2.id));

  // A node has no fixed type of its own, so it can own/consume interfaces of
  // completely different, unrelated message types at the same time.
  const svc = g.createNode("service", "SetParams", "/set_params", "example_interfaces/AddTwoInts");
  g.addConnection(a.id, svc.id);
  check(
    "a node can own interfaces of different, unrelated message types",
    g.connections.length === 2 && a.type === "node"
  );

  // Duplicate publisher on the same topic rejected.
  expectThrow("duplicate publisher rejected", "A topic can only have one publisher node.", () => {
    g.addConnection(c.id, t.id);
  });

  // Duplicate server on the same service rejected.
  expectThrow("duplicate service server rejected", "A service can only have one server node.", () => {
    g.addConnection(c.id, svc.id);
  });

  // Duplicate server on the same action rejected.
  const act = g.createNode("action", "Fibonacci", "/fibonacci", "example_interfaces/Fibonacci");
  g.addConnection(a.id, act.id);
  expectThrow("duplicate action server rejected", "An action can only have one server node.", () => {
    g.addConnection(c.id, act.id);
  });

  // Multiple *consumers* of the same entity are fine (many subscribers/clients).
  g.addConnection(t.id, b.id);
  check("a second subscriber on the same topic is allowed", g.connections.some((conn) => conn.fromId === t.id && conn.toId === b.id));

  // Duplicate identical connection rejected.
  expectThrow("duplicate connection rejected", "That connection already exists.", () => {
    g.addConnection(a.id, svc.id);
  });
}

console.log("=== 2. Round-trip JSON save/load (snake_case schema) ===");
{
  const g = new Graph();
  const pub = g.createNode("node", "Talker", "", "", 10, 20);
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

  // Hand-edited file adding a second publisher on an already-owned topic should
  // be silently dropped on load, not crash.
  const tampered = JSON.parse(json);
  const rogueId = String(Math.max(...tampered.nodes.map((n: { id: string }) => parseInt(n.id, 10))) + 1);
  tampered.nodes.push({ id: rogueId, type: "node", node_name: "Rogue", topic: "", message_type: "", x: 0, y: 0 });
  tampered.connections.push({ from: rogueId, to: topic.id });
  const lenient = Graph.fromDict(tampered);
  check(
    "invalid hand-edited connection (second publisher on an owned topic) is dropped on load",
    lenient.connections.length === 1
  );

  // Id counter must advance past the max numeric id seen.
  const nextId = reloaded.nextId();
  check("id counter advances past loaded ids", parseInt(nextId, 10) > Math.max(...reloaded.nodes.map((n) => parseInt(n.id, 10))));
}

console.log("=== 3. Package generation (1 publisher + 1 subscriber over a topic) ===");
{
  const g = new Graph();
  const pub = g.createNode("node", "Talker Node", "", "");
  const sub = g.createNode("node", "Listener Node", "", "");
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

  check("publisher class extends rclcpp::Node", talkerCpp.includes("class Talker_Node : public rclcpp::Node"));
  check("publisher creates a publisher for its topic", talkerCpp.includes('create_publisher<std_msgs::msg::String>("/chatter", 10);'));
  check("publisher populates sample field with node name substituted", talkerCpp.includes('msg.data = "Hello from Talker_Node";'));
  check("publisher has no stray {{ }} placeholders left", !/\{\{[A-Z_]+\}\}/.test(talkerCpp));
  check("subscriber class extends rclcpp::Node", listenerCpp.includes("class Listener_Node : public rclcpp::Node"));
  check("subscriber creates a subscription", listenerCpp.includes("create_subscription<std_msgs::msg::String>("));
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

  check("README summarizes both nodes with roles", readme.includes("**Talker_Node**: Publisher of `/chatter`") && readme.includes("**Listener_Node**: Subscriber of `/chatter`"));

  console.log("\n--- src/Talker_Node.cpp ---\n" + talkerCpp);
  console.log("\n--- CMakeLists.txt ---\n" + cmake);
}

console.log("=== 4. Executable name de-duplication ===");
{
  const g = new Graph();
  g.createNode("node", "worker", "", "");
  g.createNode("node", "worker", "", "");
  g.createNode("node", "worker", "", "");
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
  const driver = g.createNode("node", "Driver", "", "");
  const topic = g.createNode("topic", "CmdVel", "/cmd_vel", "geometry_msgs/Twist");
  g.addConnection(driver.id, topic.id);

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

console.log("=== 7. Service server + client generation ===");
{
  const g = new Graph();
  const server = g.createNode("node", "Adder Server", "", "");
  const client = g.createNode("node", "Adder Client", "", "");
  const svc = g.createNode("service", "AddTwoInts", "/add_two_ints", "example_interfaces/AddTwoInts");
  g.addConnection(server.id, svc.id); // server -> service: owns/serves it
  g.addConnection(svc.id, client.id); // service -> client: calls it

  const templatesDir = path.join(__dirname, "..", "templates");
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "ros-node-designer-smoke-srv-"));
  const generator = new PackageGenerator(g, "srv_pkg", templatesDir);
  const pkgRoot = generator.generate(outDir);

  const serverCpp = fs.readFileSync(path.join(pkgRoot, "src", "Adder_Server.cpp"), "utf8");
  const clientCpp = fs.readFileSync(path.join(pkgRoot, "src", "Adder_Client.cpp"), "utf8");
  const cmake = fs.readFileSync(path.join(pkgRoot, "CMakeLists.txt"), "utf8");
  const readme = fs.readFileSync(path.join(pkgRoot, "README.md"), "utf8");

  check("server creates a service", serverCpp.includes("create_service<example_interfaces::srv::AddTwoInts>("));
  check("server has no stray {{ }} placeholders left", !/\{\{[A-Z_]+\}\}/.test(serverCpp));
  check(
    "client calls the service from its own constructor",
    clientCpp.includes("class Adder_Client : public rclcpp::Node") &&
      clientCpp.includes('create_client<example_interfaces::srv::AddTwoInts>("/add_two_ints")') &&
      clientCpp.includes("callAddTwoInts();")
  );
  check("client has no stray {{ }} placeholders left", !/\{\{[A-Z_]+\}\}/.test(clientCpp));
  check("CMakeLists finds example_interfaces", cmake.includes("find_package(example_interfaces REQUIRED)"));
  check(
    "README labels roles as service server/client",
    readme.includes("Service server of `/add_two_ints`") && readme.includes("Service client of `/add_two_ints`")
  );
}

console.log("=== 8. Action server + client generation ===");
{
  const g = new Graph();
  const server = g.createNode("node", "Fibonacci Server", "", "");
  const client = g.createNode("node", "Fibonacci Client", "", "");
  const act = g.createNode("action", "Fibonacci", "/fibonacci", "example_interfaces/Fibonacci");
  g.addConnection(server.id, act.id); // server -> action: serves it
  g.addConnection(act.id, client.id); // action -> client: sends goals to it

  const templatesDir = path.join(__dirname, "..", "templates");
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "ros-node-designer-smoke-action-"));
  const generator = new PackageGenerator(g, "action_pkg", templatesDir);
  const pkgRoot = generator.generate(outDir);

  const serverCpp = fs.readFileSync(path.join(pkgRoot, "src", "Fibonacci_Server.cpp"), "utf8");
  const clientCpp = fs.readFileSync(path.join(pkgRoot, "src", "Fibonacci_Client.cpp"), "utf8");
  const cmake = fs.readFileSync(path.join(pkgRoot, "CMakeLists.txt"), "utf8");
  const packageXml = fs.readFileSync(path.join(pkgRoot, "package.xml"), "utf8");
  const readme = fs.readFileSync(path.join(pkgRoot, "README.md"), "utf8");

  check("server creates an action server", serverCpp.includes("rclcpp_action::create_server<example_interfaces::action::Fibonacci>("));
  check("server has no stray {{ }} placeholders left", !/\{\{[A-Z_]+\}\}/.test(serverCpp));
  check(
    "client sends its goal from a timer kicked off in the constructor",
    clientCpp.includes("class Fibonacci_Client : public rclcpp::Node") &&
      clientCpp.includes('rclcpp_action::create_client<example_interfaces::action::Fibonacci>(this, "/fibonacci")') &&
      clientCpp.includes("sendGoalFibonacci();")
  );
  check("client has no stray {{ }} placeholders left", !/\{\{[A-Z_]+\}\}/.test(clientCpp));
  check("CMakeLists finds rclcpp_action", cmake.includes("find_package(rclcpp_action REQUIRED)"));
  check("CMakeLists links rclcpp_action per action executable", cmake.includes("ament_target_dependencies(Fibonacci_Server rclcpp rclcpp_action example_interfaces)"));
  check("package.xml depends on rclcpp_action", packageXml.includes("<depend>rclcpp_action</depend>"));
  check(
    "README labels roles as action server/client",
    readme.includes("Action server of `/fibonacci`") && readme.includes("Action client of `/fibonacci`")
  );
}

console.log("=== 9. One node with multiple interfaces of different kinds (scales to big projects) ===");
{
  const g = new Graph();
  const hub = g.createNode("node", "Hub", "", "");
  const chatter = g.createNode("topic", "Chatter", "/chatter", "std_msgs/String");
  const status = g.createNode("topic", "Status", "/status", "std_msgs/Bool");
  const addSvc = g.createNode("service", "AddTwoInts", "/add_two_ints", "example_interfaces/AddTwoInts");
  const resetSvc = g.createNode("service", "Reset", "/reset", "std_srvs/Trigger");
  const fib = g.createNode("action", "Fibonacci", "/fibonacci", "example_interfaces/Fibonacci");

  g.addConnection(hub.id, chatter.id); // Hub publishes /chatter
  g.addConnection(status.id, hub.id); // Hub subscribes to /status
  g.addConnection(hub.id, addSvc.id); // Hub serves /add_two_ints
  g.addConnection(resetSvc.id, hub.id); // Hub calls /reset
  g.addConnection(hub.id, fib.id); // Hub serves the /fibonacci action

  const templatesDir = path.join(__dirname, "..", "templates");
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "ros-node-designer-smoke-multi-"));
  const generator = new PackageGenerator(g, "multi_pkg", templatesDir);
  const pkgRoot = generator.generate(outDir);

  const hubCpp = fs.readFileSync(path.join(pkgRoot, "src", "Hub.cpp"), "utf8");
  const cmake = fs.readFileSync(path.join(pkgRoot, "CMakeLists.txt"), "utf8");
  const readme = fs.readFileSync(path.join(pkgRoot, "README.md"), "utf8");

  check("single generated file has no stray {{ }} placeholders", !/\{\{[A-Z_]+\}\}/.test(hubCpp));
  check("one node's file contains a publisher", hubCpp.includes('create_publisher<std_msgs::msg::String>("/chatter", 10);'));
  check("...and a subscriber", hubCpp.includes("create_subscription<std_msgs::msg::Bool>("));
  check("...and a service server", hubCpp.includes("create_service<example_interfaces::srv::AddTwoInts>("));
  check("...and a service client", hubCpp.includes('create_client<std_srvs::srv::Trigger>("/reset")'));
  check("...and an action server", hubCpp.includes("rclcpp_action::create_server<example_interfaces::action::Fibonacci>("));

  const memberNames = [...hubCpp.matchAll(/::SharedPtr (\w+);/g)].map((m) => m[1]);
  check(
    "every interface got a distinct member name (no collisions)",
    memberNames.length >= 5 && new Set(memberNames).size === memberNames.length
  );

  const hubDepsLine = cmake.split("\n").find((l) => l.startsWith("ament_target_dependencies(Hub")) || "";
  check("Hub's CMake deps include rclcpp_action", hubDepsLine.includes("rclcpp_action"));
  check("Hub's CMake deps include std_msgs", hubDepsLine.includes("std_msgs"));
  check("Hub's CMake deps include example_interfaces", hubDepsLine.includes("example_interfaces"));
  check("Hub's CMake deps include std_srvs", hubDepsLine.includes("std_srvs"));

  check(
    "README lists every interface for the one node",
    readme.includes("Publisher of `/chatter`") &&
      readme.includes("Subscriber of `/status`") &&
      readme.includes("Service server of `/add_two_ints`") &&
      readme.includes("Service client of `/reset`") &&
      readme.includes("Action server of `/fibonacci`")
  );

  console.log("\n--- src/Hub.cpp ---\n" + hubCpp);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
