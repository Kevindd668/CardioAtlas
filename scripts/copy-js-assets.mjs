import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const copies = [
  ["src/style.css", "build-js/style.css"],
  ["src/data/anatomy-registry.json", "build-js/data/anatomy-registry.json"],
  ["src/data/explode-config.json", "build-js/data/explode-config.json"],
];

for (const [from, to] of copies) {
  const target = resolve(root, to);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(resolve(root, from), target);
  console.log(`copied ${from} -> ${to}`);
}
