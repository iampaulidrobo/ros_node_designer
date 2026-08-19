"""Pure-data model layer (no GUI dependencies)."""

from .connection import Connection
from .graph import ConnectionError, Graph
from .node import Node, NodeType

__all__ = ["Connection", "ConnectionError", "Graph", "Node", "NodeType"]
