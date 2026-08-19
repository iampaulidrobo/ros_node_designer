"""ROS Node Designer -- application entry point.

A visual code generator for simple ROS1 (Noetic) publisher/subscriber nodes.
This tool does *not* execute ROS; it produces a compile-ready catkin package.

Run with:
    pip install PySide6
    python main.py
"""

from __future__ import annotations

import sys

from PySide6.QtWidgets import QApplication

from gui.main_window import MainWindow


def main() -> int:
    """Launch the Qt application and return its exit code."""
    app = QApplication(sys.argv)
    app.setApplicationName("ROS Node Designer")
    window = MainWindow()
    window.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
