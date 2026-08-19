"""The interactive editing canvas.

Owns the :class:`model.graph.Graph` (single source of truth) and keeps the
graphics scene in sync with it. Handles node creation, drag-to-connect wiring,
selection reporting and deletion.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from PySide6.QtCore import QPointF, Qt, Signal
from PySide6.QtGui import QColor, QMouseEvent, QPainter, QPen
from PySide6.QtWidgets import (
    QGraphicsLineItem,
    QGraphicsScene,
    QGraphicsView,
    QMessageBox,
)

from model.connection import Connection
from model.graph import ConnectionError, Graph
from model.node import Node, NodeType
from utils.message_types import default_message_type

from .connection_item import ConnectionItem
from .node_item import NodeItem, PortItem

_SCENE_RECT = (-2000, -2000, 4000, 4000)
_BG_COLOR = QColor("#1b1e24")
_GRID_COLOR = QColor("#262b33")


class Canvas(QGraphicsView):
    """Drag-and-drop editor surface for the pub/sub design.

    Signals:
        selection_changed: Emitted with the currently selected :class:`Node`
            (or ``None``) so the property panel can update.
    """

    selection_changed = Signal(object)

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.graph = Graph()
        self._node_items: Dict[str, NodeItem] = {}
        self._connection_items: List[ConnectionItem] = []

        self._scene = QGraphicsScene(self)
        self._scene.setSceneRect(*_SCENE_RECT)
        self.setScene(self._scene)

        self.setRenderHint(QPainter.Antialiasing)
        self.setDragMode(QGraphicsView.RubberBandDrag)
        self.setBackgroundBrush(_BG_COLOR)
        self.setTransformationAnchor(QGraphicsView.AnchorUnderMouse)

        # Temporary line shown while dragging a new connection.
        self._temp_line: Optional[QGraphicsLineItem] = None
        self._drag_source: Optional[PortItem] = None

        self._scene.selectionChanged.connect(self._on_selection_changed)

    # ------------------------------------------------------------------ #
    # Background grid
    # ------------------------------------------------------------------ #
    def drawBackground(self, painter: QPainter, rect) -> None:  # noqa: N802
        super().drawBackground(painter, rect)
        step = 25
        left = int(rect.left()) - (int(rect.left()) % step)
        top = int(rect.top()) - (int(rect.top()) % step)
        pen = QPen(_GRID_COLOR, 1)
        painter.setPen(pen)
        x = left
        while x < rect.right():
            painter.drawLine(x, int(rect.top()), x, int(rect.bottom()))
            x += step
        y = top
        while y < rect.bottom():
            painter.drawLine(int(rect.left()), y, int(rect.right()), y)
            y += step

    # ------------------------------------------------------------------ #
    # Node creation
    # ------------------------------------------------------------------ #
    def _default_position(self) -> QPointF:
        """Centre of the current viewport, in scene coordinates."""
        return self.mapToScene(self.viewport().rect().center())

    def add_entity(self, node_type: NodeType) -> NodeItem:
        """Create a new node of the given type at the viewport centre."""
        existing = sum(1 for n in self.graph.nodes if n.type is node_type)
        pos = self._default_position()
        label = node_type.label
        node = self.graph.create_node(
            node_type=node_type,
            node_name=f"{label} #{existing + 1}",
            topic=f"/{label.lower()}_{existing + 1}",
            message_type=default_message_type(),
            x=pos.x(),
            y=pos.y(),
        )
        return self._add_node_item(node)

    def add_node(self) -> NodeItem:
        return self.add_entity(NodeType.NODE)

    def add_topic(self) -> NodeItem:
        return self.add_entity(NodeType.TOPIC)

    def add_service(self) -> NodeItem:
        return self.add_entity(NodeType.SERVICE)

    def add_action(self) -> NodeItem:
        return self.add_entity(NodeType.ACTION)

    def add_publisher(self) -> NodeItem:
        return self.add_entity(NodeType.NODE)

    def add_subscriber(self) -> NodeItem:
        return self.add_entity(NodeType.NODE)

    def _add_node_item(self, node: Node) -> NodeItem:
        item = NodeItem(node)
        item.moved.connect(self._update_connections_for_moved)
        self._scene.addItem(item)
        self._node_items[node.id] = item
        return item

    # ------------------------------------------------------------------ #
    # Connection creation via drag-and-drop
    # ------------------------------------------------------------------ #
    def _port_at(self, scene_pos: QPointF) -> Optional[PortItem]:
        for item in self._scene.items(scene_pos, Qt.IntersectsItemShape, Qt.AscendingOrder):
            if isinstance(item, PortItem):
                return item
        return None

    def mousePressEvent(self, event: QMouseEvent) -> None:  # noqa: N802
        if event.button() == Qt.LeftButton:
            scene_pos = self.mapToScene(event.pos())
            port = self._port_at(scene_pos)
            if port is not None:
                self._drag_source = port
                self._temp_line = QGraphicsLineItem()
                self._temp_line.setPen(QPen(QColor("#5aa9ff"), 2, Qt.DashLine))
                self._temp_line.setZValue(3)
                self._scene.addItem(self._temp_line)
                start = port.scenePos()
                self._temp_line.setLine(start.x(), start.y(), scene_pos.x(), scene_pos.y())
                event.accept()
                return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event: QMouseEvent) -> None:  # noqa: N802
        if self._temp_line is not None and self._drag_source is not None:
            start = self._drag_source.scenePos()
            end = self.mapToScene(event.pos())
            self._temp_line.setLine(start.x(), start.y(), end.x(), end.y())
            event.accept()
            return
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:  # noqa: N802
        if self._temp_line is not None and self._drag_source is not None:
            scene_pos = self.mapToScene(event.pos())
            target_port = self._port_at(scene_pos)
            source_port = self._drag_source
            # Clean up the temporary line first.
            self._scene.removeItem(self._temp_line)
            self._temp_line = None
            self._drag_source = None

            if target_port is not None and source_port is not None:
                self._try_create_connection(source_port.node_item, target_port.node_item)
            event.accept()
            return
        super().mouseReleaseEvent(event)

    def _try_create_connection(self, source: NodeItem, dest: NodeItem) -> None:
        try:
            connection = self.graph.add_connection(source.node.id, dest.node.id)
        except ConnectionError as exc:
            QMessageBox.warning(self, "Invalid connection", str(exc))
            return
        self._add_connection_item(connection)

    def _add_connection_item(self, connection: Connection) -> ConnectionItem:
        source = self._node_items[connection.from_id]
        dest = self._node_items[connection.to_id]
        item = ConnectionItem(connection, source, dest)
        self._scene.addItem(item)
        self._connection_items.append(item)
        return item

    def _update_connections_for_moved(self) -> None:
        for conn_item in self._connection_items:
            conn_item.update_path()

    # ------------------------------------------------------------------ #
    # Selection & property-panel integration
    # ------------------------------------------------------------------ #
    def _on_selection_changed(self) -> None:
        selected = [
            item for item in self._scene.selectedItems() if isinstance(item, NodeItem)
        ]
        node = selected[0].node if len(selected) == 1 else None
        self.selection_changed.emit(node)

    def refresh_node(self, node_id: str) -> None:
        """Called by the property panel after a node's fields change.

        Repaints the node and drops any connection that the change just made
        invalid (e.g. the message type no longer matches its peer).
        """
        item = self._node_items.get(node_id)
        if item is not None:
            item.refresh()
        self._prune_invalid_connections()
        self._update_connections_for_moved()

    def _prune_invalid_connections(self) -> None:
        survivors: List[ConnectionItem] = []
        for conn_item in self._connection_items:
            src = self.graph.get_node(conn_item.connection.from_id)
            dst = self.graph.get_node(conn_item.connection.to_id)
            valid = (
                src is not None
                and dst is not None
                and src.message_type == dst.message_type
            )
            if valid:
                survivors.append(conn_item)
            else:
                self.graph.remove_connection(conn_item.connection)
                self._scene.removeItem(conn_item)
        self._connection_items = survivors

    # ------------------------------------------------------------------ #
    # Deletion
    # ------------------------------------------------------------------ #
    def keyPressEvent(self, event) -> None:  # noqa: N802
        if event.key() in (Qt.Key_Delete, Qt.Key_Backspace):
            self.delete_selected()
            event.accept()
            return
        super().keyPressEvent(event)

    def delete_selected(self) -> None:
        """Remove selected connections and nodes (and their wires)."""
        for item in list(self._scene.selectedItems()):
            if isinstance(item, ConnectionItem):
                self.graph.remove_connection(item.connection)
                if item in self._connection_items:
                    self._connection_items.remove(item)
                self._scene.removeItem(item)
        for item in list(self._scene.selectedItems()):
            if isinstance(item, NodeItem):
                self._remove_node_item(item)
        self.selection_changed.emit(None)

    def _remove_node_item(self, item: NodeItem) -> None:
        node_id = item.node.id
        for conn_item in list(self._connection_items):
            if node_id in (conn_item.connection.from_id, conn_item.connection.to_id):
                self._connection_items.remove(conn_item)
                self._scene.removeItem(conn_item)
        self.graph.remove_node(node_id)
        self._node_items.pop(node_id, None)
        self._scene.removeItem(item)

    # ------------------------------------------------------------------ #
    # Project load / new
    # ------------------------------------------------------------------ #
    def clear_all(self) -> None:
        self._scene.clear()
        self._node_items.clear()
        self._connection_items.clear()
        self.graph.clear()
        self.selection_changed.emit(None)

    def load_graph(self, graph: Graph) -> None:
        """Replace the current design with a loaded graph."""
        self.clear_all()
        self.graph = graph
        for node in graph.nodes:
            self._add_node_item(node)
        for connection in graph.connections:
            self._add_connection_item(connection)
        self.selection_changed.emit(None)

    # ------------------------------------------------------------------ #
    # Zoom
    # ------------------------------------------------------------------ #
    def wheelEvent(self, event) -> None:  # noqa: N802
        factor = 1.15 if event.angleDelta().y() > 0 else 1 / 1.15
        self.scale(factor, factor)
