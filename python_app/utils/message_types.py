"""Central registry of supported ROS message types.

This single source of truth is consumed by both the GUI (to populate the
message-type dropdown) and the generator (to emit correct C++ includes, types
and catkin dependencies). Adding a new message type is a one-line change here.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List


@dataclass(frozen=True)
class MessageTypeInfo:
    """Everything the generator needs to know about a ROS message type.

    Attributes:
        ros_type: Fully-qualified type, e.g. ``"std_msgs/String"``.
        include: C++ header path, e.g. ``"std_msgs/String.h"``.
        cpp_type: C++ class name, e.g. ``"std_msgs::String"``.
        package: The catkin package the message lives in, e.g. ``"std_msgs"``.
        sample_field: Optional C++ statement that populates a scalar field so
            generated publishers actually send meaningful data. ``{node}`` is
            substituted with the node name. Empty for complex messages, which
            are default-constructed instead.
    """

    ros_type: str
    include: str
    cpp_type: str
    package: str
    sample_field: str = ""


# Order here defines the order shown in the GUI dropdown.
_REGISTRY: Dict[str, MessageTypeInfo] = {
    info.ros_type: info
    for info in [
        MessageTypeInfo(
            "std_msgs/String", "std_msgs/msg/string.hpp", "std_msgs::msg::String", "std_msgs",
            'msg.data = "Hello from {node}";',
        ),
        MessageTypeInfo(
            "std_msgs/Bool", "std_msgs/msg/bool.hpp", "std_msgs::msg::Bool", "std_msgs",
            "msg.data = true;",
        ),
        MessageTypeInfo(
            "std_msgs/Int32", "std_msgs/msg/int32.hpp", "std_msgs::msg::Int32", "std_msgs",
            "msg.data = count++;",
        ),
        MessageTypeInfo(
            "std_msgs/Float32", "std_msgs/msg/float32.hpp", "std_msgs::msg::Float32", "std_msgs",
            "msg.data = 0.0f;",
        ),
        MessageTypeInfo(
            "geometry_msgs/Twist", "geometry_msgs/msg/twist.hpp",
            "geometry_msgs::msg::Twist", "geometry_msgs",
        ),
        MessageTypeInfo(
            "geometry_msgs/PoseStamped", "geometry_msgs/msg/pose_stamped.hpp",
            "geometry_msgs::msg::PoseStamped", "geometry_msgs",
        ),
        MessageTypeInfo(
            "sensor_msgs/Image", "sensor_msgs/msg/image.hpp",
            "sensor_msgs::msg::Image", "sensor_msgs",
        ),
        MessageTypeInfo(
            "sensor_msgs/LaserScan", "sensor_msgs/msg/laser_scan.hpp",
            "sensor_msgs::msg::LaserScan", "sensor_msgs",
        ),
        MessageTypeInfo(
            "sensor_msgs/Imu", "sensor_msgs/msg/imu.hpp",
            "sensor_msgs::msg::Imu", "sensor_msgs",
        ),
        MessageTypeInfo(
            "nav_msgs/Odometry", "nav_msgs/msg/odometry.hpp",
            "nav_msgs::msg::Odometry", "nav_msgs",
        ),
    ]
}


def list_message_types() -> List[str]:
    """Return the supported ROS message types in display order."""
    return list(_REGISTRY.keys())


def get_info(ros_type: str) -> MessageTypeInfo:
    """Look up metadata for a message type.

    Raises:
        KeyError: if the type is not registered.
    """
    return _REGISTRY[ros_type]


def default_message_type() -> str:
    """The message type new nodes start with."""
    return "std_msgs/String"
