import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// The webview panel loads this build's output from disk via webview.asWebviewUri,
// with a strict CSP, so we bundle everything (JS+CSS) into a single self-contained
// HTML-adjacent asset set with no external requests.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: "../dist/webview",
    emptyOutDir: true,
    assetsDir: "assets",
    cssCodeSplit: false,
  },
});
