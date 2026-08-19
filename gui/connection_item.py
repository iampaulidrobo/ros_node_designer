"""Graphics item that draws a link between a publisher and a subscriber."""

from __future__ import annotations

from PySide6.QtCore import QPointF, Qt
from PySide6.QtGui import QColor, QPainter, QPainterPath, QPen
from PySide6.QtWidgets import QGraphicsPathItem, QStyleOptionGraphicsItem

from model.connection import Connection

from .node_item import NodeItem

_LINE_COLOR = QColor("#7f8a99")
_SELECT_COLOR = QColor("#5aa9ff")


class ConnectionItem(QGraphicsPathItem):
    """A curved wire from a source node's output to a dest node's input.

    Attributes:
        connection: The backing :class:`model.connection.Connection`.
        source_item: The publisher :class:`NodeItem`.
        dest_item: The subscriber :class:`NodeItem`.
    """

    def __init__(
        self,
        connection: Connection,
        source_item: NodeItem,
        dest_item: NodeItem,
    ) -> None:
        super().__init__()
        self.connection = connection
        self.source_item = source_item
        self.dest_item = dest_item
        self.setZValue(0)
        self.setFlags(QGraphicsPathItem.ItemIsSelectable)
        self.update_path()

    def update_path(self) -> None:
        """Recompute the bezier path from current node positions."""
        start = self.source_item.output_scene_pos()
        end = self.dest_item.input_scene_pos()
        dx = max(40.0, abs(end.x() - start.x()) * 0.5)
        path = QPainterPath(start)
        path.cubicTo(
            QPointF(start.x() + dx, start.y()),
            QPointF(end.x() - dx, end.y()),
            end,
        )
        self.setPath(path)

    def paint(  # noqa: N802
        self,
        painter: QPainter,
        option: QStyleOptionGraphicsItem,
        widget=None,
    ) -> None:
        painter.setRenderHint(QPainter.Antialiasing)
        color = _SELECT_COLOR if self.isSelected() else _LINE_COLOR
        painter.setPen(QPen(color, 2.5, Qt.SolidLine, Qt.RoundCap))
        painter.setBrush(Qt.NoBrush)
        painter.drawPath(self.path())
