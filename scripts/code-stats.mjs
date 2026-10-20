// Counts the app's files and lines and saves them in js/code-stats.js, which
// the Admin Control Centre shows under "Code health".
// Run it before each release:  node scripts/code-stats.mjs
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const skip = new Set([".git", "node_modules"]);
const kinds = { ".js": "JavaScript", ".html": "HTML", ".css": "CSS", ".sql": "SQL", ".ts": "TypeScript" };
const stats = {};

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { walk(path); continue; }
    const kind = kinds[extname(name)];
    if (!kind || name === "code-stats.js") continue;
    const lines = readFileSync(path, "utf8").split("\n").filter((line) => line.trim()).length;
    stats[kind] ??= { files: 0, lines: 0 };
    stats[kind].files += 1;
    stats[kind].lines += lines;
  }
}
walk(root);

const tests = (readFileSync(join(root, "tests/app.test.js"), "utf8").match(/^test\(/gm) || []).length;
const out = `// Made by scripts/code-stats.mjs. Run "node scripts/code-stats.mjs" to update.
export const CODE_STATS = ${JSON.stringify({ counted: new Date().toISOString().slice(0, 10), tests, byLanguage: stats }, null, 2)};
`;
writeFileSync(join(root, "js/code-stats.js"), out);
console.log(out);
