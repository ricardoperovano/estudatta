/** Desfaz t("K", { v0: a, v1: b }) em chaves técnicas, reconstruindo o template literal. */
import fs from "node:fs"; import path from "node:path";
const junk = new Set(fs.readFileSync(0, "utf8").split("\n").filter(Boolean));
function walk(d, out=[]) { for (const e of fs.readdirSync(d,{withFileTypes:true})) { const f=path.join(d,e.name); if (e.isDirectory()) walk(f,out); else if (/\.(ts|tsx)$/.test(e.name) && !f.includes("/i18n/")) out.push(f);} return out; }
let n = 0;
const re = /\b(t|tx)\(\s*("(?:[^"\\]|\\.)*")\s*,\s*\{\s*((?:v\d+:\s*[^,{}]+(?:\([^()]*\))?[^,{}]*,?\s*)+)\}\s*\)/g;
for (const file of walk("src")) {
  let s = fs.readFileSync(file, "utf8"); const before = s;
  s = s.replace(re, (m, fn, lit, vals) => {
    const k = JSON.parse(lit); if (!junk.has(k)) return m;
    const map = {}; for (const part of vals.split(/,\s*(?=v\d+:)/)) { const mm = part.match(/^(v\d+):\s*([\s\S]+?)\s*$/); if (mm) map[mm[1]] = mm[2].replace(/,\s*$/, ""); }
    n++;
    const body = k.replace(/`/g, "\\`").replace(/\{\{(v\d+)\}\}/g, (_, v) => "${" + (map[v] ?? v) + "}");
    return "`" + body + "`";
  });
  s = s.replace(/\{(t|tx)\(("(?:[^"\\]|\\.)*")\)\}/g, (m, fn, lit) => (junk.has(JSON.parse(lit)) ? (n++, lit) : m));
  s = s.replace(/\b(t|tx)\(("(?:[^"\\]|\\.)*")\)/g, (m, fn, lit) => (junk.has(JSON.parse(lit)) ? (n++, lit) : m));
  if (s !== before) fs.writeFileSync(file, s);
}
console.error(`desfeitas: ${n}`);
