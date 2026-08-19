"""Application-wide Qt style sheet (a compact dark theme)."""

DARK_STYLESHEET = """
QMainWindow, QWidget {
    background-color: #1b1e24;
    color: #e6e6e6;
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    font-size: 13px;
}
QToolBar {
    background-color: #22262e;
    border: none;
    padding: 6px;
    spacing: 6px;
}
QToolBar QToolButton {
    background-color: #2f3540;
    border: 1px solid #3a414d;
    border-radius: 6px;
    padding: 6px 12px;
    color: #e6e6e6;
}
QToolBar QToolButton:hover {
    background-color: #3a414d;
    border-color: #5aa9ff;
}
QToolBar QToolButton:pressed {
    background-color: #5aa9ff;
    color: #0d0f12;
}
QDockWidget {
    titlebar-close-icon: none;
    color: #e6e6e6;
}
QDockWidget::title {
    background-color: #22262e;
    padding: 6px 10px;
    font-weight: bold;
}
#panelTitle {
    font-size: 15px;
    font-weight: bold;
    color: #5aa9ff;
}
QLineEdit, QComboBox {
    background-color: #2b2f36;
    border: 1px solid #3a414d;
    border-radius: 5px;
    padding: 5px 8px;
    color: #e6e6e6;
}
QLineEdit:focus, QComboBox:focus {
    border-color: #5aa9ff;
}
QComboBox QAbstractItemView {
    background-color: #2b2f36;
    selection-background-color: #5aa9ff;
    selection-color: #0d0f12;
}
QLineEdit:disabled, QComboBox:disabled {
    color: #6b7280;
    background-color: #23262d;
}
QStatusBar {
    background-color: #22262e;
    color: #a8b0ba;
}
QLabel {
    color: #cfd4db;
}
QMenu {
    background-color: #22262e;
    border: 1px solid #3a414d;
}
QMenu::item:selected {
    background-color: #5aa9ff;
    color: #0d0f12;
}
"""
