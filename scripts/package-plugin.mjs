import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const outDir = join(root, "plugin-example");
const files = ["manifest.json", "main.js", "styles.css", "versions.json"];
const keep = new Set(files);

await mkdir(outDir, { recursive: true });

for (const entry of await readdir(outDir)) {
  if (!keep.has(entry)) await rm(join(outDir, entry), { recursive: true, force: true });
}

for (const file of files) {
  await copyFile(join(root, file), join(outDir, file));
}

console.log(`Packaged Obsidian plugin files into ${outDir}`);
