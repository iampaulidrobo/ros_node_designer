# ROS Node Designer (v0.1)

A modern PySide6 desktop app for **visually designing** simple ROS1 (Noetic)
publisher/subscriber graphs and **generating a compile-ready catkin package**.

It does **not** run ROS. It is purely a visual code generator: drag out nodes,
wire publishers to subscribers, and export a complete `catkin` package.

## Features

- QMainWindow + QGraphicsView drag-and-drop canvas with a grid, pan-free
  zoom (mouse wheel) and rubber-band selection.
- Two node types: **Publisher** and **Subscriber**, each with editable
  **Node Name**, **Topic** and **Message Type**.
- Message-type dropdown: `std_msgs/String`, `std_msgs/Bool`, `std_msgs/Int32`,
  `std_msgs/Float32`, `geometry_msgs/Twist`, `geometry_msgs/PoseStamped`,
  `sensor_msgs/Image`, `sensor_msgs/LaserScan`, `sensor_msgs/Imu`,
  `nav_msgs/Odometry`.
- Connections are only allowed **Publisher → Subscriber**. The port layout makes
  the other three directions physically impossible to draw, and a mismatched
  message type is rejected with an error dialog.
- Project persistence to JSON (**Save/Open**).
- One-click **Generate Package** producing `package.xml`, `CMakeLists.txt`,
  `launch/demo.launch`, per-node C++ sources and a `README.md`.

## Install & run

```bash
pip install PySide6
python main.py
```

## Using the app

1. Click **Add Publisher** / **Add Subscriber** — nodes appear at the centre of
   the view.
2. Select a node and edit its **Node Name / Topic / Message Type** in the
   Properties panel on the right.
3. Drag from a publisher's right-hand port onto a subscriber's left-hand port to
   connect them. Types must match or the connection is refused.
4. **Save Project** / **Open Project** store the design as JSON.
5. **Generate Package**, enter a package name and pick an output folder.
6. Delete a selected node or wire with the `Delete` key.

## Generated package layout

```
<package_name>/
    package.xml
    CMakeLists.txt
    launch/
        demo.launch
    src/
        <node_name>.cpp      # one file & executable per node
        ...
    README.md
```

> **Design note.** The spec's example shows `publisher.cpp` / `subscriber.cpp`.
> To keep *arbitrary* designs compiling without manual edits, one `.cpp` is
> emitted per node, named after that node. A single publisher named `publisher`
> therefore produces `src/publisher.cpp` exactly as in the example; extra nodes
> get their own files and executables.

### Building the generated package

```bash
cp -r <package_name> ~/catkin_ws/src/
cd ~/catkin_ws && catkin_make && source devel/setup.bash
roslaunch <package_name> demo.launch
```

## Project architecture

Clean separation between GUI, model and generation. The model, generator and
utils layers have **no Qt dependency** and are unit-testable on their own.

```
ros_node_designer/
    main.py                      # entry point
    gui/
        main_window.py           # QMainWindow, toolbar, actions
        canvas.py                # QGraphicsView editor + drag-to-connect
        property_panel.py        # editable properties for the selected node
        node_item.py             # NodeItem + PortItem graphics
        connection_item.py       # bezier wire graphics
        style.py                 # dark theme QSS
    model/
        graph.py                 # source-of-truth graph + validation + JSON
        node.py                  # Node dataclass + NodeType enum
        connection.py            # Connection dataclass
    generator/
        package_generator.py     # template-driven catkin package generator
        templates/               # *.tmpl files ({{KEY}} placeholders)
    utils/
        message_types.py         # single registry of supported ROS messages
        naming.py                # identifier sanitisation
    resources/                   # (reserved for future icons)
```

## Extending

- **New message type:** add one `MessageTypeInfo(...)` line in
  `utils/message_types.py`. It automatically appears in the dropdown and the
  generator emits the correct include, C++ type and catkin dependency.
- **New node type / output format:** the generator is template-based
  (`generator/templates/`), so new templates plus a small mapping keep GUI and
  generation decoupled.

## Scope (v0.1)

Intentionally excluded: ROS2, services, actions, parameters, TF, custom
messages and AI features. This is a clean, extensible foundation.
