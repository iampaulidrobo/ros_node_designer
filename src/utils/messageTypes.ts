import { NodeType } from "../model/NodeType";

/**
 * Central registry of supported ROS interface types -- topic messages (.msg),
 * service types (.srv) and action types (.action).
 * This single source of truth is consumed by both the webview UI (to populate the
 * message-type dropdown) and the generator (to emit correct C++ includes, types and
 * ament dependencies). Adding a new type is a one-line change here.
 */
export type MessageKind = "msg" | "srv" | "action";

export interface MessageTypeInfo {
  /** Which entity kind this interface applies to. */
  kind: MessageKind;
  /** Fully-qualified type, e.g. "std_msgs/String". */
  rosType: string;
  /** C++ header path, e.g. "std_msgs/msg/string.hpp". */
  include: string;
  /** C++ class name, e.g. "std_msgs::msg::String". */
  cppType: string;
  /** The ament package the message lives in, e.g. "std_msgs". */
  package: string;
  /**
   * Optional C++ statement that populates a scalar field so generated publishers
   * actually send meaningful data. "{node}" is substituted with the node name.
   * Empty for complex messages, which are default-constructed instead.
   */
  sampleField: string;
}

// Order here defines the order shown in the UI dropdown.
const REGISTRY_LIST: MessageTypeInfo[] = [
  {
    kind: "msg",
    rosType: "std_msgs/String",
    include: "std_msgs/msg/string.hpp",
    cppType: "std_msgs::msg::String",
    package: "std_msgs",
    sampleField: 'msg.data = "Hello from {node}";',
  },
  {
    kind: "msg",
    rosType: "std_msgs/Bool",
    include: "std_msgs/msg/bool.hpp",
    cppType: "std_msgs::msg::Bool",
    package: "std_msgs",
    sampleField: "msg.data = true;",
  },
  {
    kind: "msg",
    rosType: "std_msgs/Int32",
    include: "std_msgs/msg/int32.hpp",
    cppType: "std_msgs::msg::Int32",
    package: "std_msgs",
    sampleField: "msg.data = count++;",
  },
  {
    kind: "msg",
    rosType: "std_msgs/Float32",
    include: "std_msgs/msg/float32.hpp",
    cppType: "std_msgs::msg::Float32",
    package: "std_msgs",
    sampleField: "msg.data = 0.0f;",
  },
  {
    kind: "msg",
    rosType: "geometry_msgs/Twist",
    include: "geometry_msgs/msg/twist.hpp",
    cppType: "geometry_msgs::msg::Twist",
    package: "geometry_msgs",
    sampleField: "",
  },
  {
    kind: "msg",
    rosType: "geometry_msgs/PoseStamped",
    include: "geometry_msgs/msg/pose_stamped.hpp",
    cppType: "geometry_msgs::msg::PoseStamped",
    package: "geometry_msgs",
    sampleField: "",
  },
  {
    kind: "msg",
    rosType: "sensor_msgs/Image",
    include: "sensor_msgs/msg/image.hpp",
    cppType: "sensor_msgs::msg::Image",
    package: "sensor_msgs",
    sampleField: "",
  },
  {
    kind: "msg",
    rosType: "sensor_msgs/LaserScan",
    include: "sensor_msgs/msg/laser_scan.hpp",
    cppType: "sensor_msgs::msg::LaserScan",
    package: "sensor_msgs",
    sampleField: "",
  },
  {
    kind: "msg",
    rosType: "sensor_msgs/Imu",
    include: "sensor_msgs/msg/imu.hpp",
    cppType: "sensor_msgs::msg::Imu",
    package: "sensor_msgs",
    sampleField: "",
  },
  {
    kind: "msg",
    rosType: "nav_msgs/Odometry",
    include: "nav_msgs/msg/odometry.hpp",
    cppType: "nav_msgs::msg::Odometry",
    package: "nav_msgs",
    sampleField: "",
  },
  {
    kind: "srv",
    rosType: "example_interfaces/AddTwoInts",
    include: "example_interfaces/srv/add_two_ints.hpp",
    cppType: "example_interfaces::srv::AddTwoInts",
    package: "example_interfaces",
    sampleField: "",
  },
  {
    kind: "srv",
    rosType: "std_srvs/SetBool",
    include: "std_srvs/srv/set_bool.hpp",
    cppType: "std_srvs::srv::SetBool",
    package: "std_srvs",
    sampleField: "",
  },
  {
    kind: "srv",
    rosType: "std_srvs/Trigger",
    include: "std_srvs/srv/trigger.hpp",
    cppType: "std_srvs::srv::Trigger",
    package: "std_srvs",
    sampleField: "",
  },
  {
    kind: "action",
    rosType: "example_interfaces/Fibonacci",
    include: "example_interfaces/action/fibonacci.hpp",
    cppType: "example_interfaces::action::Fibonacci",
    package: "example_interfaces",
    sampleField: "",
  },
];

const REGISTRY: Map<string, MessageTypeInfo> = new Map(
  REGISTRY_LIST.map((info) => [info.rosType, info])
);

/** Return the supported ROS interface types in display order, optionally filtered to one kind. */
export function listMessageTypes(kind?: MessageKind): string[] {
  return REGISTRY_LIST.filter((info) => !kind || info.kind === kind).map((info) => info.rosType);
}

/** Look up metadata for an interface type. Throws if the type is not registered. */
export function getInfo(rosType: string): MessageTypeInfo {
  const info = REGISTRY.get(rosType);
  if (!info) {
    throw new Error(`Unknown ROS interface type: '${rosType}'`);
  }
  return info;
}

/** The interface type new nodes of the given kind start with (defaults to a topic message). */
export function defaultMessageType(kind: MessageKind = "msg"): string {
  const match = REGISTRY_LIST.find((info) => info.kind === kind);
  if (!match) {
    throw new Error(`No registered interface types for kind '${kind}'`);
  }
  return match.rosType;
}

/**
 * Which interface kind an entity type's message-type field should be restricted to.
 * A "node" entity has no fixed kind -- it must be able to match whichever topic,
 * service or action it ends up connected to, so it offers every registered type.
 */
export function messageKindForEntityType(type: NodeType): MessageKind | undefined {
  if (type === "topic") return "msg";
  if (type === "service") return "srv";
  if (type === "action") return "action";
  return undefined;
}
