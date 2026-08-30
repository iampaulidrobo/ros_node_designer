/**
 * Central registry of supported ROS message types.
 * This single source of truth is consumed by both the webview UI (to populate the
 * message-type dropdown) and the generator (to emit correct C++ includes, types and
 * ament dependencies). Adding a new message type is a one-line change here.
 */
export interface MessageTypeInfo {
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
    rosType: "std_msgs/String",
    include: "std_msgs/msg/string.hpp",
    cppType: "std_msgs::msg::String",
    package: "std_msgs",
    sampleField: 'msg.data = "Hello from {node}";',
  },
  {
    rosType: "std_msgs/Bool",
    include: "std_msgs/msg/bool.hpp",
    cppType: "std_msgs::msg::Bool",
    package: "std_msgs",
    sampleField: "msg.data = true;",
  },
  {
    rosType: "std_msgs/Int32",
    include: "std_msgs/msg/int32.hpp",
    cppType: "std_msgs::msg::Int32",
    package: "std_msgs",
    sampleField: "msg.data = count++;",
  },
  {
    rosType: "std_msgs/Float32",
    include: "std_msgs/msg/float32.hpp",
    cppType: "std_msgs::msg::Float32",
    package: "std_msgs",
    sampleField: "msg.data = 0.0f;",
  },
  {
    rosType: "geometry_msgs/Twist",
    include: "geometry_msgs/msg/twist.hpp",
    cppType: "geometry_msgs::msg::Twist",
    package: "geometry_msgs",
    sampleField: "",
  },
  {
    rosType: "geometry_msgs/PoseStamped",
    include: "geometry_msgs/msg/pose_stamped.hpp",
    cppType: "geometry_msgs::msg::PoseStamped",
    package: "geometry_msgs",
    sampleField: "",
  },
  {
    rosType: "sensor_msgs/Image",
    include: "sensor_msgs/msg/image.hpp",
    cppType: "sensor_msgs::msg::Image",
    package: "sensor_msgs",
    sampleField: "",
  },
  {
    rosType: "sensor_msgs/LaserScan",
    include: "sensor_msgs/msg/laser_scan.hpp",
    cppType: "sensor_msgs::msg::LaserScan",
    package: "sensor_msgs",
    sampleField: "",
  },
  {
    rosType: "sensor_msgs/Imu",
    include: "sensor_msgs/msg/imu.hpp",
    cppType: "sensor_msgs::msg::Imu",
    package: "sensor_msgs",
    sampleField: "",
  },
  {
    rosType: "nav_msgs/Odometry",
    include: "nav_msgs/msg/odometry.hpp",
    cppType: "nav_msgs::msg::Odometry",
    package: "nav_msgs",
    sampleField: "",
  },
];

const REGISTRY: Map<string, MessageTypeInfo> = new Map(
  REGISTRY_LIST.map((info) => [info.rosType, info])
);

/** Return the supported ROS message types in display order. */
export function listMessageTypes(): string[] {
  return REGISTRY_LIST.map((info) => info.rosType);
}

/** Look up metadata for a message type. Throws if the type is not registered. */
export function getInfo(rosType: string): MessageTypeInfo {
  const info = REGISTRY.get(rosType);
  if (!info) {
    throw new Error(`Unknown ROS message type: '${rosType}'`);
  }
  return info;
}

/** The message type new nodes start with. */
export function defaultMessageType(): string {
  return "std_msgs/String";
}
