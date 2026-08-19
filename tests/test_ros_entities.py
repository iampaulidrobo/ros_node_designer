import tempfile
import unittest
from pathlib import Path

from generator.package_generator import PackageGenerator
from model.graph import ConnectionError, Graph
from model.node import NodeKind


class RosEntityTests(unittest.TestCase):
    def test_graph_can_create_generic_ros_entities(self) -> None:
        graph = Graph()
        node = graph.create_node(NodeKind.NODE, "talker", "/chatter", "std_msgs/String")
        self.assertEqual(node.kind, NodeKind.NODE)
        self.assertEqual(node.label, "Node")

    def test_graph_allows_node_to_topic_and_topic_to_node_connections(self) -> None:
        graph = Graph()
        source = graph.create_node(NodeKind.NODE, "talker", "/chatter", "std_msgs/String")
        topic = graph.create_node(NodeKind.TOPIC, "topic", "/chatter", "std_msgs/String")
        target = graph.create_node(NodeKind.NODE, "listener", "/chatter", "std_msgs/String")

        connection = graph.add_connection(source.id, topic.id)
        self.assertEqual(connection.from_id, source.id)
        self.assertEqual(connection.to_id, topic.id)

        connection = graph.add_connection(topic.id, target.id)
        self.assertEqual(connection.from_id, topic.id)
        self.assertEqual(connection.to_id, target.id)
        self.assertIn(connection, graph.connections)

    def test_graph_rejects_node_to_node_and_cross_entity_connections(self) -> None:
        graph = Graph()
        source = graph.create_node(NodeKind.NODE, "talker", "/chatter", "std_msgs/String")
        other = graph.create_node(NodeKind.NODE, "listener", "/chatter", "std_msgs/String")
        topic = graph.create_node(NodeKind.TOPIC, "topic", "/chatter", "std_msgs/String")
        service = graph.create_node(NodeKind.SERVICE, "service", "/service", "std_msgs/String")

        with self.assertRaises(ConnectionError):
            graph.add_connection(source.id, other.id)
        with self.assertRaises(ConnectionError):
            graph.add_connection(topic.id, service.id)
        graph.add_connection(source.id, topic.id)
        graph.add_connection(topic.id, other.id)

    def test_topic_allows_one_publisher_and_many_subscribers(self) -> None:
        graph = Graph()
        publisher = graph.create_node(NodeKind.NODE, "talker", "/chatter", "std_msgs/String")
        subscriber_a = graph.create_node(NodeKind.NODE, "listener_a", "/chatter", "std_msgs/String")
        subscriber_b = graph.create_node(NodeKind.NODE, "listener_b", "/chatter", "std_msgs/String")
        topic = graph.create_node(NodeKind.TOPIC, "topic", "/chatter", "std_msgs/String")

        graph.add_connection(publisher.id, topic.id)
        graph.add_connection(topic.id, subscriber_a.id)
        graph.add_connection(topic.id, subscriber_b.id)

        another_publisher = graph.create_node(NodeKind.NODE, "talker_2", "/chatter", "std_msgs/String")
        with self.assertRaises(ConnectionError):
            graph.add_connection(another_publisher.id, topic.id)

    def test_generator_supports_ros2_package_layout(self) -> None:
        graph = Graph()
        graph.create_node(NodeKind.NODE, "talker", "/chatter", "std_msgs/String")
        with tempfile.TemporaryDirectory() as tmpdir:
            generator = PackageGenerator(graph, "demo_pkg")
            root = generator.generate(tmpdir)
            package_xml = Path(root, "package.xml").read_text(encoding="utf-8")
            cmake = Path(root, "CMakeLists.txt").read_text(encoding="utf-8")
            self.assertIn("ament_cmake", package_xml)
            self.assertIn("ament_target_dependencies", cmake)
            # Every find_package()/ament_target_dependencies() argument must be a
            # real CMake call -- a bare package name on its own line is a parse error.
            self.assertNotRegex(cmake, r"^\s+std_msgs\s*$")

    def test_generator_only_emits_executables_for_node_entities(self) -> None:
        """Topic/service/action boxes are wiring only -- not code-gen targets."""
        graph = Graph()
        talker = graph.create_node(NodeKind.NODE, "talker", "/chatter", "std_msgs/String")
        topic = graph.create_node(NodeKind.TOPIC, "chatter_topic", "/chatter", "std_msgs/String")
        listener = graph.create_node(NodeKind.NODE, "listener", "/chatter", "std_msgs/String")
        graph.add_connection(talker.id, topic.id)
        graph.add_connection(topic.id, listener.id)

        with tempfile.TemporaryDirectory() as tmpdir:
            generator = PackageGenerator(graph, "demo_pkg")
            root = generator.generate(tmpdir)
            src_files = {p.name for p in Path(root, "src").iterdir()}
            self.assertEqual(src_files, {"talker.cpp", "listener.cpp"})

            talker_src = Path(root, "src", "talker.cpp").read_text(encoding="utf-8")
            listener_src = Path(root, "src", "listener.cpp").read_text(encoding="utf-8")
            self.assertIn("create_publisher", talker_src)
            self.assertIn("create_subscription", listener_src)
            self.assertIn("rclcpp/rclcpp.hpp", talker_src)
            self.assertIn("rclcpp/rclcpp.hpp", listener_src)
            self.assertNotIn("ros/ros.h", talker_src)
            self.assertNotIn("ros/ros.h", listener_src)


if __name__ == "__main__":
    unittest.main()
