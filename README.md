# ROS Node Designer (VS Code Extension)

A visual editor, built as a VS Code webview extension, for designing a ROS 2
pub/sub node graph and generating a compile-ready ROS 2 (`ament_cmake`)
package from that graph.

## Running it (F5)

1. One-time setup: `npm install` at the repo root. A `postinstall` hook also
   installs `webview-ui/`'s dependencies, so that's the only install you need
   to run. (Re-run it only when dependencies change — the build step below
   never reinstalls on its own.)
2. Open this folder in VS Code and press **F5** (or run the "Run ROS Node
   Designer Extension" launch configuration). This builds the extension host
   and the webview bundle first (via the default build task), then launches
   an Extension Development Host window.
3. In the new window, run the command **ROS Node Designer: Open Designer**
   from the Command Palette.

## Layout

- `src/` -- the extension host (TypeScript, bundled with esbuild to
  `dist/extension.js`): commands, webview panel wiring, file save/open, and
  the package generator.
- `webview-ui/` -- the React + React Flow webview app (bundled with Vite to
  `dist/webview/`), which renders the node graph editor.
- `templates/` -- the ROS 2 package templates used by the generator, copied
  verbatim from the original prototype and read from disk at generation time
  (not bundled into the extension's JS).
