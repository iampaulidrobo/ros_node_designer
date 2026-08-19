"""Template-based ROS 2 package generator.

Given a :class:`model.graph.Graph` and a package name, this produces a complete,
ROS 2 package scaffold on disk. It has no Qt dependency and can be driven from a
script or tests.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List

from model.graph import Graph
from model.node import Node, NodeType
from utils.message_types import get_info
from utils.naming import sanitize_identifier

_TEMPLATE_DIR = Path(__file__).resolve().parent / "templates"


def _render(template_name: str, context: Dict[str, str]) -> str:
    """Render a ``{{KEY}}`` template from the templates directory."""
    text = (_TEMPLATE_DIR / template_name).read_text(encoding="utf-8")
    for key, value in context.items():
        text = text.replace("{{" + key + "}}", value)
    return text


@dataclass
class _ResolvedNode:
    """A node paired with the derived names the generator needs."""

    node: Node
    executable: str          # unique C++ executable / launch node name
    source_file: str         # e.g. "publisher.cpp"
    is_publisher: bool       # publishes to its topic, vs. subscribes to it


class PackageGenerator:
    """Turns a design graph into a ROS 2 package on disk."""

    def __init__(self, graph: Graph, package_name: str) -> None:
        self.graph = graph
        self.package_name = sanitize_identifier(package_name, fallback="ros_pkg")
        self._resolved: List[_ResolvedNode] = self._resolve_nodes()

    # ------------------------------------------------------------------ #
    # Name resolution
    # ------------------------------------------------------------------ #
    def _resolve_nodes(self) -> List[_ResolvedNode]:
        """Assign unique, valid C++ identifiers to every ROS node in the design.

        Topic/service/action boxes are graph entities used for wiring and
        validation only -- they don't get an executable of their own.
        """
        resolved: List[_ResolvedNode] = []
        used: set[str] = set()
        for node in self.graph.nodes:
            if node.type is not NodeType.NODE:
                continue
            base = sanitize_identifier(node.node_name, fallback="node")
            name = base
            suffix = 1
            while name in used:
                suffix += 1
                name = f"{base}_{suffix}"
            used.add(name)
            resolved.append(
                _ResolvedNode(
                    node=node,
                    executable=name,
                    source_file=f"{name}.cpp",
                    is_publisher=self._is_publisher(node),
                )
            )
        return resolved

    def _is_publisher(self, node: Node) -> bool:
        """Whether ``node`` publishes to its topic, based on connection direction.

        A connection always points publisher -> subscriber (see
        :class:`model.connection.Connection`), so an outgoing edge to a topic
        means this node publishes; an incoming edge means it subscribes. A
        node not yet wired to any topic defaults to publisher so an
        in-progress design still generates something runnable.
        """
        for connection in self.graph.connections_for(node.id):
            if connection.from_id == node.id:
                other = self.graph.get_node(connection.to_id)
                if other is not None and other.type is NodeType.TOPIC:
                    return True
            if connection.to_id == node.id:
                other = self.graph.get_node(connection.from_id)
                if other is not None and other.type is NodeType.TOPIC:
                    return False
        return True

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #
    def generate(self, output_dir: str | Path) -> Path:
        """Write the package under ``output_dir`` and return its root path.

        Raises:
            ValueError: if the design contains no nodes.
        """
        if not self._resolved:
            raise ValueError("The design is empty -- add at least one node.")

        root = Path(output_dir) / self.package_name
        (root / "src").mkdir(parents=True, exist_ok=True)
        (root / "launch").mkdir(parents=True, exist_ok=True)

        # Source files ------------------------------------------------------
        for item in self._resolved:
            (root / "src" / item.source_file).write_text(
                self._render_source(item), encoding="utf-8"
            )

        # Build / package metadata -----------------------------------------
        (root / "CMakeLists.txt").write_text(
            self._render_cmake(), encoding="utf-8"
        )
        (root / "package.xml").write_text(
            self._render_package_xml(), encoding="utf-8"
        )
        (root / "launch" / "demo.launch.py").write_text(
            self._render_launch(), encoding="utf-8"
        )
        (root / "README.md").write_text(
            self._render_readme(), encoding="utf-8"
        )
        return root

    # ------------------------------------------------------------------ #
    # Per-node source rendering
    # ------------------------------------------------------------------ #
    def _render_source(self, item: _ResolvedNode) -> str:
        node = item.node
        info = get_info(node.message_type)
        base_ctx = {
            "NODE_NAME": item.executable,
            "TOPIC": node.topic,
            "MSG_INCLUDE": info.include,
            "MSG_TYPE": info.cpp_type,
            "MSG_TYPE_STR": info.ros_type,
        }

        if not item.is_publisher:
            return _render("subscriber.cpp.tmpl", base_ctx)

        uses_counter = "count++" in info.sample_field
        populate = (
            "    " + info.sample_field.format(node=item.executable)
            if info.sample_field
            else "    // default-constructed message (all fields zeroed)"
        )
        base_ctx.update(
            {
                "COUNTER_DECL": "  int count = 0;\n" if uses_counter else "",
                "MSG_POPULATE": populate,
            }
        )
        return _render("publisher.cpp.tmpl", base_ctx)

    # ------------------------------------------------------------------ #
    # Dependency aggregation
    # ------------------------------------------------------------------ #
    def _message_packages(self) -> List[str]:
        """Unique catkin packages required by the design's message types."""
        packages = {get_info(r.node.message_type).package for r in self._resolved}
        return sorted(packages)

    def _extra_message_packages(self) -> List[str]:
        """Message packages not already hardcoded as rclcpp/std_msgs depends.

        rclcpp and std_msgs get an explicit, always-present ``find_package()``
        / ``<build_depend>`` / ``<exec_depend>`` in the ROS 2 templates, so
        listing them again here would be a redundant, invalid duplicate.
        """
        return [d for d in self._message_packages() if d not in ("std_msgs", "rclcpp")]

    # ------------------------------------------------------------------ #
    # File rendering
    # ------------------------------------------------------------------ #
    def _render_cmake(self) -> str:
        deps = self._message_packages()
        find_pkg = "".join(f"find_package({d} REQUIRED)\n" for d in self._extra_message_packages())
        catkin_depends = "".join(f" {d}" for d in deps)

        blocks: List[str] = []
        for item in self._resolved:
            package = get_info(item.node.message_type).package
            blocks.append(
                f"add_executable({item.executable} src/{item.source_file})\n"
                f"ament_target_dependencies({item.executable} rclcpp {package})\n"
            )
        return _render(
            "CMakeLists.txt.ros2.tmpl",
            {
                "PACKAGE_NAME": self.package_name,
                "FIND_PACKAGE_DEPS": find_pkg,
                "AMENT_DEPENDS": catkin_depends,
                "EXECUTABLES": "\n".join(blocks),
                "INSTALL_TARGETS": "\n".join(f"  {item.executable}" for item in self._resolved),
            },
        )

    def _render_package_xml(self) -> str:
        return _render(
            "package.xml.ros2.tmpl",
            {
                "PACKAGE_NAME": self.package_name,
                "DEPENDENCIES": "".join(
                    f"  <depend>{d}</depend>\n" for d in self._extra_message_packages()
                ),
            },
        )

    def _render_launch(self) -> str:
        tags = ",\n".join(
            f'        Node(package="{self.package_name}", executable="{item.executable}", '
            f'name="{item.executable}", output="screen")'
            for item in self._resolved
        )
        return _render(
            "demo.launch.py.tmpl",
            {"PACKAGE_NAME": self.package_name, "NODE_TAGS": tags},
        )

    def _render_readme(self) -> str:
        lines: List[str] = []
        for item in self._resolved:
            node = item.node
            role = "Publisher" if item.is_publisher else "Subscriber"
            verb = "publishes to" if item.is_publisher else "subscribes to"
            lines.append(
                f"- **{item.executable}** ({role}) {verb} `{node.topic}` "
                f"using `{node.message_type}` "
                f"(source: `src/{item.source_file}`)"
            )
        first = self._resolved[0].executable if self._resolved else "node"
        return _render(
            "README.md.tmpl",
            {
                "PACKAGE_NAME": self.package_name,
                "NODE_SUMMARY": "\n".join(lines),
                "FIRST_EXECUTABLE": first,
            },
        )
