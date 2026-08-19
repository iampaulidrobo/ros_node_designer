"""The design graph: the single source of truth for a project.

Holds all nodes and connections, enforces the connection rules, and provides
JSON serialization for Save/Open. Contains no GUI code.
"""

from __future__ import annotations

import itertools
import json
from typing import Dict, List, Optional, Tuple

from .connection import Connection
from .node import Node, NodeType


class ConnectionError(Exception):
    """Raised when a proposed connection violates the design rules."""


class Graph:
    """In-memory representation of an entire ROS Node Designer project."""

    def __init__(self) -> None:
        self._nodes: Dict[str, Node] = {}
        self._connections: List[Connection] = []
        self._id_counter = itertools.count(1)

    # ------------------------------------------------------------------ #
    # Identity helpers
    # ------------------------------------------------------------------ #
    def next_id(self) -> str:
        """Return a fresh unique node id as a string."""
        while True:
            candidate = str(next(self._id_counter))
            if candidate not in self._nodes:
                return candidate

    # ------------------------------------------------------------------ #
    # Node management
    # ------------------------------------------------------------------ #
    @property
    def nodes(self) -> List[Node]:
        return list(self._nodes.values())

    @property
    def connections(self) -> List[Connection]:
        return list(self._connections)

    def get_node(self, node_id: str) -> Optional[Node]:
        return self._nodes.get(node_id)

    def add_node(self, node: Node) -> Node:
        """Add a pre-built node to the graph."""
        if node.id in self._nodes:
            raise ValueError(f"Node id '{node.id}' already exists")
        self._nodes[node.id] = node
        return node

    def create_node(
        self,
        node_type: NodeType,
        node_name: str,
        topic: str,
        message_type: str,
        x: float = 0.0,
        y: float = 0.0,
    ) -> Node:
        """Create, register and return a new node with an auto-assigned id."""
        node = Node(
            id=self.next_id(),
            type=node_type,
            node_name=node_name,
            topic=topic,
            message_type=message_type,
            x=x,
            y=y,
        )
        return self.add_node(node)

    def remove_node(self, node_id: str) -> None:
        """Remove a node and any connections referencing it."""
        self._nodes.pop(node_id, None)
        self._connections = [
            c for c in self._connections if node_id not in (c.from_id, c.to_id)
        ]

    # ------------------------------------------------------------------ #
    # Connection management
    # ------------------------------------------------------------------ #
    def validate_connection(self, from_id: str, to_id: str) -> Tuple[bool, str]:
        """Check whether a connection is allowed.

        Returns a ``(ok, message)`` tuple. When ``ok`` is ``False`` the message
        explains why so the GUI can surface it to the user.
        """
        src = self.get_node(from_id)
        dst = self.get_node(to_id)

        if src is None or dst is None:
            return False, "Both endpoints must be valid nodes."
        if from_id == to_id:
            return False, "A node cannot connect to itself."
        allowed_pairs = {
            (NodeType.NODE, NodeType.TOPIC),
            (NodeType.TOPIC, NodeType.NODE),
            (NodeType.NODE, NodeType.SERVICE),
            (NodeType.SERVICE, NodeType.NODE),
            (NodeType.NODE, NodeType.ACTION),
            (NodeType.ACTION, NodeType.NODE),
        }
        if (src.type, dst.type) not in allowed_pairs:
            return False, "Connections are only allowed between a node and a topic, service, or action."

        if src.type is NodeType.NODE and dst.type is NodeType.TOPIC:
            has_publisher = any(
                c.to_id == to_id
                and self.get_node(c.from_id) is not None
                and self.get_node(c.from_id).type is NodeType.NODE
                for c in self._connections
            )
            if has_publisher:
                return False, "A topic can only have one publisher node."
        if src.message_type != dst.message_type:
            return (
                False,
                "Message types do not match: "
                f"'{src.message_type}' \u2192 '{dst.message_type}'.",
            )
        if any(c.from_id == from_id and c.to_id == to_id for c in self._connections):
            return False, "That connection already exists."
        return True, ""

    def add_connection(self, from_id: str, to_id: str) -> Connection:
        """Validate and add a connection, raising :class:`ConnectionError`."""
        ok, message = self.validate_connection(from_id, to_id)
        if not ok:
            raise ConnectionError(message)
        connection = Connection(from_id=from_id, to_id=to_id)
        self._connections.append(connection)
        return connection

    def remove_connection(self, connection: Connection) -> None:
        if connection in self._connections:
            self._connections.remove(connection)

    def connections_for(self, node_id: str) -> List[Connection]:
        """All connections touching the given node (as source or destination)."""
        return [c for c in self._connections if node_id in (c.from_id, c.to_id)]

    # ------------------------------------------------------------------ #
    # Serialization
    # ------------------------------------------------------------------ #
    def to_dict(self) -> Dict[str, object]:
        return {
            "nodes": [n.to_dict() for n in self._nodes.values()],
            "connections": [c.to_dict() for c in self._connections],
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent)

    @classmethod
    def from_dict(cls, data: Dict[str, object]) -> "Graph":
        graph = cls()
        for raw in data.get("nodes", []):  # type: ignore[union-attr]
            graph.add_node(Node.from_dict(raw))
        for raw in data.get("connections", []):  # type: ignore[union-attr]
            conn = Connection.from_dict(raw)
            # Trust the file but skip anything that no longer validates so a
            # hand-edited project can never crash the app.
            ok, _ = graph.validate_connection(conn.from_id, conn.to_id)
            if ok:
                graph._connections.append(conn)
        # Keep the id counter ahead of any numeric ids we just loaded.
        numeric = [int(n.id) for n in graph.nodes if n.id.isdigit()]
        if numeric:
            graph._id_counter = itertools.count(max(numeric) + 1)
        return graph

    @classmethod
    def from_json(cls, text: str) -> "Graph":
        return cls.from_dict(json.loads(text))

    def clear(self) -> None:
        self._nodes.clear()
        self._connections.clear()
        self._id_counter = itertools.count(1)
