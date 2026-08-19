"""Graphics item that renders a :class:`model.node.Node` on the canvas.

Publishers expose an output port on their right edge; subscribers expose an
input port on their left edge. Because only publishers have outputs and only
subscribers have inputs, the port geometry alone already enforces the
Publisher -> Subscriber direction rule; the :class:`model.graph.Graph` performs
the remaining checks (message-type match, duplicates).
"""

from __future__ import annotations

from typing import Optional

from PySide6.QtCore import QPointF, QRectF, Qt, Signal
from PySide6.QtGui import QBrush, QColor, QFont, QPainter, QPainterPath, QPen
from PySide6.QtWidgets import (
    QGraphicsEllipseItem,
    QGraphicsItem,
    QGraphicsObject,
    QStyleOptionGraphicsItem,
    QWidget,
)

from model.node import Node, NodeType

NODE_WIDTH = 200.0
NODE_HEIGHT = 96.0
HEADER_HEIGHT = 28.0
PORT_RADIUS = 7.0

_NODE_ACCENT = QColor("#3b82f6")
_TOPIC_ACCENT = QColor("#14b8a6")
_SERVICE_ACCENT = QColor("#f59e0b")
_ACTION_ACCENT = QColor("#8b5cf6")
_BODY_COLOR = QColor("#2b2f36")
_TEXT_COLOR = QColor("#e6e6e6")
_SUBTEXT_COLOR = QColor("#a8b0ba")
_SELECT_COLOR = QColor("#5aa9ff")


class PortItem(QGraphicsEllipseItem):
    """A small circular anchor used to start/finish a connection.

    Attributes:
        port_type: ``"out"`` (publisher output) or ``"in"`` (subscriber input).
        node_item: The owning :class:`NodeItem`.
    """

    def __init__(self, port_type: str, node_item: "NodeItem") -> None:
        super().__init__(-PORT_RADIUS, -PORT_RADIUS, PORT_RADIUS * 2, PORT_RADIUS * 2, node_item)
        self.port_type = port_type
        self.node_item = node_item
        accent = _NODE_ACCENT if port_type == "out" else _ACTION_ACCENT
        self.setBrush(QBrush(accent))
        self.setPen(QPen(QColor("#14171b"), 2))
        self.setZValue(2)
        self.setAcceptHoverEvents(True)
        self.setAcceptedMouseButtons(Qt.LeftButton)
        self.setCursor(Qt.CrossCursor)

    def hoverEnterEvent(self, event) -> None:  # noqa: N802 (Qt naming)
        self.setBrush(QBrush(_SELECT_COLOR))
        super().hoverEnterEvent(event)

    def hoverLeaveEvent(self, event) -> None:  # noqa: N802
        accent = _NODE_ACCENT if self.port_type == "out" else _ACTION_ACCENT
        self.setBrush(QBrush(accent))
        super().hoverLeaveEvent(event)


class NodeItem(QGraphicsObject):
    """Draggable visual representation of a single node.

    Signals:
        moved: Emitted whenever the item's position changes so connection lines
            can be redrawn.
    """

    moved = Signal()

    def __init__(self, node: Node) -> None:
        super().__init__()
        self.node = node
        self.setPos(node.x, node.y)
        self.setFlags(
            QGraphicsItem.ItemIsMovable
            | QGraphicsItem.ItemIsSelectable
            | QGraphicsItem.ItemSendsGeometryChanges
        )
        self.setZValue(1)
        self.setCursor(Qt.SizeAllCursor)

        self.out_port: Optional[PortItem] = None
        self.in_port: Optional[PortItem] = None
        self.out_port = PortItem("out", self)
        self.out_port.setPos(NODE_WIDTH, NODE_HEIGHT / 2)
        self.in_port = PortItem("in", self)
        self.in_port.setPos(0.0, NODE_HEIGHT / 2)

    # ------------------------------------------------------------------ #
    # Qt geometry / painting
    # ------------------------------------------------------------------ #
    def boundingRect(self) -> QRectF:  # noqa: N802
        # Extend slightly so ports/selection outline are not clipped.
        return QRectF(-PORT_RADIUS, 0, NODE_WIDTH + 2 * PORT_RADIUS, NODE_HEIGHT)

    def paint(  # noqa: N802
        self,
        painter: QPainter,
        option: QStyleOptionGraphicsItem,
        widget: Optional[QWidget] = None,
    ) -> None:
        painter.setRenderHint(QPainter.Antialiasing)
        accent = {
            NodeType.NODE: _NODE_ACCENT,
            NodeType.TOPIC: _TOPIC_ACCENT,
            NodeType.SERVICE: _SERVICE_ACCENT,
            NodeType.ACTION: _ACTION_ACCENT,
        }[self.node.type]
        body_rect = QRectF(0, 0, NODE_WIDTH, NODE_HEIGHT)

        # Body
        painter.setBrush(QBrush(_BODY_COLOR))
        border = _SELECT_COLOR if self.isSelected() else QColor("#14171b")
        painter.setPen(QPen(border, 2))
        if self.node.type is NodeType.TOPIC:
            painter.drawEllipse(body_rect)
        elif self.node.type is NodeType.SERVICE:
            path = QPainterPath()
            path.moveTo(20, 0)
            path.lineTo(NODE_WIDTH - 20, 0)
            path.lineTo(NODE_WIDTH, NODE_HEIGHT / 2)
            path.lineTo(NODE_WIDTH - 20, NODE_HEIGHT)
            path.lineTo(20, NODE_HEIGHT)
            path.lineTo(0, NODE_HEIGHT / 2)
            path.closeSubpath()
            painter.drawPath(path)
        elif self.node.type is NodeType.ACTION:
            path = QPainterPath()
            path.moveTo(NODE_WIDTH / 2, 0)
            path.lineTo(NODE_WIDTH, NODE_HEIGHT / 2)
            path.lineTo(NODE_WIDTH / 2, NODE_HEIGHT)
            path.lineTo(0, NODE_HEIGHT / 2)
            path.closeSubpath()
            painter.drawPath(path)
        else:
            painter.drawRoundedRect(body_rect, 8, 8)

        # Header
        header_rect = QRectF(0, 0, NODE_WIDTH, HEADER_HEIGHT)
        painter.setBrush(QBrush(accent))
        painter.setPen(Qt.NoPen)
        painter.drawRoundedRect(header_rect, 8, 8)
        painter.drawRect(QRectF(0, HEADER_HEIGHT - 8, NODE_WIDTH, 8))

        painter.setPen(QPen(QColor("#0d0f12")))
        header_font = QFont()
        header_font.setBold(True)
        header_font.setPointSize(10)
        painter.setFont(header_font)
        title = self.node.type.value.upper()
        painter.drawText(
            QRectF(10, 0, NODE_WIDTH - 20, HEADER_HEIGHT),
            Qt.AlignVCenter | Qt.AlignLeft,
            title,
        )

        # Body text
        painter.setPen(QPen(_TEXT_COLOR))
        name_font = QFont()
        name_font.setBold(True)
        name_font.setPointSize(11)
        painter.setFont(name_font)
        painter.drawText(
            QRectF(10, HEADER_HEIGHT + 4, NODE_WIDTH - 20, 22),
            Qt.AlignVCenter | Qt.AlignLeft,
            self._elide(self.node.node_name),
        )

        painter.setPen(QPen(_SUBTEXT_COLOR))
        sub_font = QFont()
        sub_font.setPointSize(9)
        painter.setFont(sub_font)
        painter.drawText(
            QRectF(10, HEADER_HEIGHT + 28, NODE_WIDTH - 20, 18),
            Qt.AlignVCenter | Qt.AlignLeft,
            self._elide(self.node.topic),
        )
        painter.drawText(
            QRectF(10, HEADER_HEIGHT + 46, NODE_WIDTH - 20, 18),
            Qt.AlignVCenter | Qt.AlignLeft,
            self._elide(self.node.message_type),
        )

    @staticmethod
    def _elide(text: str, limit: int = 26) -> str:
        return text if len(text) <= limit else text[: limit - 1] + "\u2026"

    # ------------------------------------------------------------------ #
    # Interaction
    # ------------------------------------------------------------------ #
    def itemChange(self, change: QGraphicsItem.GraphicsItemChange, value):  # noqa: N802
        if change == QGraphicsItem.ItemPositionHasChanged:
            self.node.x = self.pos().x()
            self.node.y = self.pos().y()
            self.moved.emit()
        return super().itemChange(change, value)

    def refresh(self) -> None:
        """Repaint after the underlying model changed via the property panel."""
        self.update()

    def output_scene_pos(self) -> QPointF:
        """Scene coordinate of the output port (publishers only)."""
        if self.out_port is not None:
            return self.out_port.scenePos()
        return self.scenePos() + QPointF(NODE_WIDTH, NODE_HEIGHT / 2)

    def input_scene_pos(self) -> QPointF:
        """Scene coordinate of the input port (subscribers only)."""
        if self.in_port is not None:
            return self.in_port.scenePos()
        return self.scenePos() + QPointF(0.0, NODE_HEIGHT / 2)
