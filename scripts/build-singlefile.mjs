import { readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");
const htmlPath = join(dist, "index.html");
let html = readFileSync(htmlPath, "utf8");
const m = html.match(/<script[^>]*src="\.\/assets\/(index-[^"]+\.js)"[^>]*><\/script>/);
if (!m) throw new Error("cannot find built app script in dist/index.html");
const js = readFileSync(join(dist, "assets", m[1]), "utf8");
if (js.includes("</script>")) throw new Error("bundle contains </script>");
const glb = readFileSync(join(root, "public", "models", "processed", "heart-anatomy-master.glb"));
const b64 = glb.toString("base64");
const inline =
  `<script>window.__CARDIOTWIN_GLB__=${JSON.stringify(b64)};</script>\n` +
  `<script>\n${js}\n</script>`;
html = html.replace(m[0], "");
html = html.replace("</body>", () => `${inline}\n</body>`);
html = html.replace("</head>", `  <!-- Single-file offline build: GLB base64-inlined, no runtime fetch -->\n</head>`);
const outName = process.argv[2] || "cardiotwin-v3.html";
if (outName === "cardiotwin-v3.html") {
  throw new Error("refusing to overwrite the V3.0 baseline; pass an explicit V3.1 output name");
}
const out = join(root, outName);
writeFileSync(out, html);
console.log(JSON.stringify({ out, bytes: statSync(out).size, glbBytes: glb.length }));
