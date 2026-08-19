"""Top-level application window: toolbar, canvas, property panel and actions."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from PySide6.QtCore import Qt
from PySide6.QtGui import QAction, QKeySequence
from PySide6.QtWidgets import (
    QDockWidget,
    QFileDialog,
    QInputDialog,
    QMainWindow,
    QMessageBox,
)

from generator.package_generator import PackageGenerator
from model.graph import Graph
from model.node import Node

from .canvas import Canvas
from .property_panel import PropertyPanel
from .style import DARK_STYLESHEET


class MainWindow(QMainWindow):
    """The ROS Node Designer main window."""

    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("ROS Node Designer \u2014 v0.1")
        self.resize(1200, 760)
        self.setStyleSheet(DARK_STYLESHEET)

        self._current_path: Optional[Path] = None

        self.canvas = Canvas(self)
        self.setCentralWidget(self.canvas)

        self.property_panel = PropertyPanel(self)
        dock = QDockWidget("Properties", self)
        dock.setWidget(self.property_panel)
        dock.setAllowedAreas(Qt.LeftDockWidgetArea | Qt.RightDockWidgetArea)
        self.addDockWidget(Qt.RightDockWidgetArea, dock)

        self._build_toolbar()
        self.statusBar().showMessage(
            "Add nodes, topics, services or actions and connect them on the canvas."
        )

        # Wire signals.
        self.canvas.selection_changed.connect(self._on_selection_changed)
        self.property_panel.node_changed.connect(self.canvas.refresh_node)

    # ------------------------------------------------------------------ #
    # Toolbar
    # ------------------------------------------------------------------ #
    def _build_toolbar(self) -> None:
        toolbar = self.addToolBar("Main")
        toolbar.setMovable(False)

        def add_action(text: str, slot, shortcut: Optional[str] = None) -> QAction:
            action = QAction(text, self)
            if shortcut:
                action.setShortcut(QKeySequence(shortcut))
            action.triggered.connect(slot)
            toolbar.addAction(action)
            return action

        add_action("Add Node", self.canvas.add_node)
        add_action("Add Topic", self.canvas.add_topic)
        add_action("Add Service", self.canvas.add_service)
        add_action("Add Action", self.canvas.add_action)
        toolbar.addSeparator()
        add_action("Generate Package", self._generate_package)
        toolbar.addSeparator()
        add_action("Save Project", self._save_project, "Ctrl+S")
        add_action("Open Project", self._open_project, "Ctrl+O")

    # ------------------------------------------------------------------ #
    # Selection
    # ------------------------------------------------------------------ #
    def _on_selection_changed(self, node: Optional[Node]) -> None:
        self.property_panel.set_node(node)

    # ------------------------------------------------------------------ #
    # Save / open
    # ------------------------------------------------------------------ #
    def _save_project(self) -> None:
        path, _ = QFileDialog.getSaveFileName(
            self, "Save Project", str(self._suggested_dir()), "ROS Designer Project (*.json)"
        )
        if not path:
            return
        if not path.endswith(".json"):
            path += ".json"
        try:
            Path(path).write_text(self.canvas.graph.to_json(), encoding="utf-8")
        except OSError as exc:
            QMessageBox.critical(self, "Save failed", str(exc))
            return
        self._current_path = Path(path)
        self.statusBar().showMessage(f"Saved to {path}")

    def _open_project(self) -> None:
        path, _ = QFileDialog.getOpenFileName(
            self, "Open Project", str(self._suggested_dir()), "ROS Designer Project (*.json)"
        )
        if not path:
            return
        try:
            graph = Graph.from_json(Path(path).read_text(encoding="utf-8"))
        except (OSError, ValueError, KeyError) as exc:
            QMessageBox.critical(self, "Open failed", f"Could not read project:\n{exc}")
            return
        self.canvas.load_graph(graph)
        self._current_path = Path(path)
        self.statusBar().showMessage(f"Opened {path}")

    def _suggested_dir(self) -> Path:
        return self._current_path.parent if self._current_path else Path.home()

    # ------------------------------------------------------------------ #
    # Code generation
    # ------------------------------------------------------------------ #
    def _generate_package(self) -> None:
        if not self.canvas.graph.nodes:
            QMessageBox.information(
                self, "Nothing to generate", "Add at least one node first."
            )
            return

        package_name, ok = QInputDialog.getText(
            self, "Generate Package", "Package name:", text="my_ros_package"
        )
        if not ok or not package_name.strip():
            return

        output_dir = QFileDialog.getExistingDirectory(
            self, "Choose output directory", str(Path.home())
        )
        if not output_dir:
            return

        try:
            generator = PackageGenerator(self.canvas.graph, package_name.strip())
            root = generator.generate(output_dir)
        except (ValueError, OSError, KeyError) as exc:
            QMessageBox.critical(self, "Generation failed", str(exc))
            return

        QMessageBox.information(
            self,
            "Package generated",
            f"Created ROS 2 package at:\n{root}\n\n"
            "Use your preferred ROS 2 build workflow for the generated package.",
        )
        self.statusBar().showMessage(f"Generated package at {root}")
