// Runs on `wrangler deploy` (see [build] in wrangler.toml), after `vite build`.
// Renames dist/index.html → dist/app.html so page URLs never match a static
// file: they reach the Worker, which serves app.html with the first screen's
// data inlined. Scripts, images and fonts are still served straight from the
// asset store without invoking the Worker.
import { existsSync, renameSync } from "node:fs";

const from = "dist/index.html";
const to = "dist/app.html";
if (existsSync(from)) {
  renameSync(from, to);
  console.log(`[prepare-worker-assets] ${from} -> ${to}`);
} else if (!existsSync(to)) {
  console.error("[prepare-worker-assets] dist/index.html not found — run the Vite build first");
  process.exit(1);
}
