import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1");
const roots = ["src", "base44", "docs"];
const extensions = new Set([".js", ".jsx", ".ts", ".tsx", ".json", ".jsonc", ".md"]);
const mojibake = /\uFFFD|Ã[\u0080-\u00BF]|Â[\u0080-\u00BF]|â(?:€|™|œ|ž)|ðŸ/u;
const conflicts = /^(?:<<<<<<<|=======|>>>>>>>)(?: .*)?$/m;
const failures = [];
let scanned = 0;

function scan(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      scan(path);
      continue;
    }
    if (!extensions.has(extname(path))) continue;
    scanned += 1;
    const source = readFileSync(path, "utf8");
    if (source.includes("\u0000")) failures.push(`${relative(root, path)}: contenu binaire inattendu`);
    if (mojibake.test(source)) failures.push(`${relative(root, path)}: sequence de caracteres corrompus`);
    if (conflicts.test(source)) failures.push(`${relative(root, path)}: marqueur de conflit Git`);
  }
}

for (const directory of roots) scan(join(root, directory));

assert.deepEqual(failures, [], failures.join("\n"));
console.log(`SOURCE_INTEGRITY=PASS files=${scanned}`);
