// 图标引用完整性检查:HTML / app.js 中用到的 #icon-* 是否都有对应 symbol
import fs from "node:fs";

const html = fs.readFileSync("index.html", "utf8");
const appJs = fs.readFileSync("app.js", "utf8");

const defined = new Set([...html.matchAll(/id="(icon-[a-z-]+)"/g)].map((m) => m[1]));
const usedInHtml = [...html.matchAll(/href="#(icon-[a-z-]+)"/g)].map((m) => m[1]);
const usedInJs = [...appJs.matchAll(/icon\("([a-z-]+)"/g)].map((m) => `icon-${m[1]}`);
const used = new Set([...usedInHtml, ...usedInJs]);

const missing = [...used].filter((name) => !defined.has(name));
console.log(`defined ${defined.size} symbols, used ${used.size} references`);
if (missing.length) {
  console.log("MISSING:", missing);
  process.exit(1);
}
console.log("all icon references resolve");