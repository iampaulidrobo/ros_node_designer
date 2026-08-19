"""Editable properties panel for the currently selected node."""

from __future__ import annotations

from typing import Optional

from PySide6.QtCore import Signal
from PySide6.QtWidgets import (
    QComboBox,
    QFormLayout,
    QLabel,
    QLineEdit,
    QVBoxLayout,
    QWidget,
)

from model.node import Node
from utils.message_types import list_message_types


class PropertyPanel(QWidget):
    """Shows and edits ``node_name``, ``topic`` and ``message_type``.

    Signals:
        node_changed: Emitted with the node's id whenever a field is edited, so
            the canvas can repaint and re-validate connections.
    """

    node_changed = Signal(str)

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self._node: Optional[Node] = None
        self._updating = False

        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)

        self._title = QLabel("No entity selected")
        self._title.setObjectName("panelTitle")
        layout.addWidget(self._title)

        form = QFormLayout()
        form.setContentsMargins(0, 8, 0, 0)
        form.setSpacing(10)

        self._name_edit = QLineEdit()
        self._name_edit.textEdited.connect(self._on_name_edited)
        form.addRow("Entity name", self._name_edit)

        self._topic_edit = QLineEdit()
        self._topic_edit.textEdited.connect(self._on_topic_edited)
        form.addRow("Topic / Service / Action", self._topic_edit)

        self._type_combo = QComboBox()
        self._type_combo.addItems(list_message_types())
        self._type_combo.currentTextChanged.connect(self._on_type_changed)
        form.addRow("Message type", self._type_combo)

        layout.addLayout(form)
        layout.addStretch(1)
        self._set_enabled(False)

    # ------------------------------------------------------------------ #
    # Selection binding
    # ------------------------------------------------------------------ #
    def set_node(self, node: Optional[Node]) -> None:
        """Bind the panel to a node (or clear it when ``None``)."""
        self._node = node
        self._updating = True
        try:
            if node is None:
                self._title.setText("No entity selected")
                self._name_edit.clear()
                self._topic_edit.clear()
                self._set_enabled(False)
                return
            self._title.setText(node.node_name)
            self._name_edit.setText(node.node_name)
            self._topic_edit.setText(node.topic)
            self._type_combo.setCurrentText(node.message_type)
            self._set_enabled(True)
        finally:
            self._updating = False

    def _set_enabled(self, enabled: bool) -> None:
        for widget in (self._name_edit, self._topic_edit, self._type_combo):
            widget.setEnabled(enabled)

    # ------------------------------------------------------------------ #
    # Field handlers
    # ------------------------------------------------------------------ #
    def _on_name_edited(self, text: str) -> None:
        if self._updating or self._node is None:
            return
        self._node.node_name = text
        self.node_changed.emit(self._node.id)

    def _on_topic_edited(self, text: str) -> None:
        if self._updating or self._node is None:
            return
        self._node.topic = text
        self.node_changed.emit(self._node.id)

    def _on_type_changed(self, text: str) -> None:
        if self._updating or self._node is None:
            return
        self._node.message_type = text
        self.node_changed.emit(self._node.id)
