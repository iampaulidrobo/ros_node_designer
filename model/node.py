"""Data model for a generic ROS entity in the design graph."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict


class NodeType(str, Enum):
    """A generic ROS design element."""

    NODE = "node"
    TOPIC = "topic"
    SERVICE = "service"
    ACTION = "action"

    @property
    def label(self) -> str:
        return self.value.replace("_", " ").title()

    def __str__(self) -> str:  # pragma: no cover - convenience only
        return self.value


NodeKind = NodeType


@dataclass
class Node:
    """A generic ROS entity in the design."""

    id: str
    type: NodeType
    node_name: str
    topic: str
    message_type: str
    x: float = 0.0
    y: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type.value,
            "node_name": self.node_name,
            "topic": self.topic,
            "message_type": self.message_type,
            "x": self.x,
            "y": self.y,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Node":
        return cls(
            id=str(data["id"]),
            type=NodeType(data["type"]),
            node_name=data["node_name"],
            topic=data["topic"],
            message_type=data["message_type"],
            x=float(data.get("x", 0.0)),
            y=float(data.get("y", 0.0)),
        )

    @property
    def kind(self) -> NodeType:
        return self.type

    @property
    def label(self) -> str:
        return self.type.label
