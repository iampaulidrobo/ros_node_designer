import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { Graph } from "./model/Graph";
import { PackageGenerator } from "./generator/packageGenerator";

const PROJECT_FILTER: { [name: string]: string[] } = {
  "ROS Designer Project": ["json"],
};

let currentPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("rosNodeDesigner.open", () => {
      openOrRevealPanel(context);
    }),
    vscode.commands.registerCommand("rosNodeDesigner.newProject", () => {
      dispatchToolbarAction(context, "newProject");
    }),
    vscode.commands.registerCommand("rosNodeDesigner.saveProject", () => {
      dispatchToolbarAction(context, "saveProject");
    }),
    vscode.commands.registerCommand("rosNodeDesigner.openProject", () => {
      dispatchToolbarAction(context, "openProject");
    })
  );
}

export function deactivate(): void {
  // Nothing to clean up: the panel disposes itself and drops its subscriptions.
}

/** Open the designer panel if none exists yet, otherwise just reveal the existing one. */
function openOrRevealPanel(context: vscode.ExtensionContext): vscode.WebviewPanel {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Active);
    return currentPanel;
  }

  const webviewDir = vscode.Uri.file(path.join(context.extensionPath, "dist", "webview"));

  const panel = vscode.window.createWebviewPanel(
    "rosNodeDesigner",
    "ROS Node Designer",
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [webviewDir],
    }
  );

  panel.webview.html = getWebviewHtml(panel.webview, context);

  panel.onDidDispose(() => {
    currentPanel = undefined;
  });

  panel.webview.onDidReceiveMessage((message) => {
    handleWebviewMessage(context, panel, message);
  });

  currentPanel = panel;
  return panel;
}

/** Command-palette entry points: open the panel if needed, then ask the webview to
 * trigger the same toolbar action a user could click directly. */
function dispatchToolbarAction(
  context: vscode.ExtensionContext,
  action: "newProject" | "saveProject" | "openProject"
): void {
  const panel = openOrRevealPanel(context);
  panel.webview.postMessage({ type: "triggerAction", action });
}

async function handleWebviewMessage(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel,
  message: any
): Promise<void> {
  try {
    switch (message?.type) {
      case "saveProject":
        await handleSaveProject(panel, message.payload as string);
        break;
      case "openProject":
        await handleOpenProject(panel);
        break;
      case "generatePackage":
        await handleGeneratePackage(context, panel, message.payload);
        break;
      default:
        break;
    }
  } catch (err: any) {
    panel.webview.postMessage({ type: "error", message: err?.message ?? String(err) });
  }
}

async function handleSaveProject(panel: vscode.WebviewPanel, payload: string): Promise<void> {
  const uri = await vscode.window.showSaveDialog({ filters: PROJECT_FILTER });
  if (!uri) {
    return;
  }
  try {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(payload, "utf8"));
    panel.webview.postMessage({ type: "projectSaved", path: uri.fsPath });
  } catch (err: any) {
    panel.webview.postMessage({ type: "error", message: err?.message ?? String(err) });
  }
}

async function handleOpenProject(panel: vscode.WebviewPanel): Promise<void> {
  const uris = await vscode.window.showOpenDialog({
    filters: PROJECT_FILTER,
    canSelectMany: false,
  });
  if (!uris || uris.length === 0) {
    return;
  }
  try {
    const bytes = await vscode.workspace.fs.readFile(uris[0]);
    const text = Buffer.from(bytes).toString("utf8");
    panel.webview.postMessage({ type: "projectLoaded", payload: text });
  } catch (err: any) {
    panel.webview.postMessage({ type: "error", message: err?.message ?? String(err) });
  }
}

async function handleGeneratePackage(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel,
  payload: { graphJson: string; suggestedName: string }
): Promise<void> {
  const packageName = await vscode.window.showInputBox({
    prompt: "ROS 2 package name",
    value: payload?.suggestedName || "my_ros_package",
  });
  if (packageName === undefined) {
    return; // user cancelled
  }

  const outDirs = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: "Select Output Folder",
  });
  if (!outDirs || outDirs.length === 0) {
    return; // user cancelled
  }

  try {
    const graph = Graph.fromJSON(payload.graphJson);
    const templatesDir = path.join(context.extensionPath, "templates");
    const generator = new PackageGenerator(graph, packageName, templatesDir);
    const outputPath = generator.generate(outDirs[0].fsPath);

    const reveal = "Reveal in Explorer";
    vscode.window.showInformationMessage(`ROS 2 package generated at ${outputPath}`, reveal).then((choice) => {
      if (choice === reveal) {
        vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(outputPath));
      }
    });

    panel.webview.postMessage({ type: "packageGenerated", path: outputPath });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    vscode.window.showErrorMessage(msg);
    panel.webview.postMessage({ type: "error", message: msg });
  }
}

/**
 * The webview React app is built by webview-ui's Vite config with
 * vite-plugin-singlefile, which inlines its JS and CSS directly into a single
 * dist/webview/index.html -- no separate asset files to resolve via
 * asWebviewUri. We just load that HTML and inject a CSP meta tag.
 */
function getWebviewHtml(webview: vscode.Webview, context: vscode.ExtensionContext): string {
  const htmlPath = path.join(context.extensionPath, "dist", "webview", "index.html");
  let html = fs.readFileSync(htmlPath, "utf8");

  const csp =
    `default-src 'none'; ` +
    `img-src ${webview.cspSource} data:; ` +
    `font-src ${webview.cspSource} data:; ` +
    `style-src ${webview.cspSource} 'unsafe-inline'; ` +
    `script-src 'unsafe-inline';`;
  const cspTag = `<meta http-equiv="Content-Security-Policy" content="${csp}" />`;

  html = html.replace("<head>", `<head>
  ${cspTag}`);
  return html;
}
