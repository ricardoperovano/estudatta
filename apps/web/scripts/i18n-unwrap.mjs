/** Desfaz t("…") em chaves técnicas (classes, CSS, rotas, nomes de componente) que uma passada
 *  agressiva do codemod envolveu por engano. Uso: node scripts/i18n-unwrap.mjs < lista-de-chaves */
import fs from "node:fs"; import path from "node:path";
const junk = new Set(fs.readFileSync(0, "utf8").split("\n").filter(Boolean));
function walk(d, out=[]) { for (const e of fs.readdirSync(d,{withFileTypes:true})) { const f=path.join(d,e.name); if (e.isDirectory()) walk(f,out); else if (/\.(ts|tsx)$/.test(e.name) && !f.includes("/i18n/")) out.push(f);} return out; }
let n = 0;
for (const file of walk("src")) {
  let s = fs.readFileSync(file, "utf8"); const before = s;
  s = s.replace(/\{(t|tx)\(("(?:[^"\\]|\\.)*")\)\}/g, (m, fn, lit) => { const k = JSON.parse(lit); if (!junk.has(k)) return m; n++; return lit; });
  s = s.replace(/\b(t|tx)\(("(?:[^"\\]|\\.)*")\)/g, (m, fn, lit) => { const k = JSON.parse(lit); if (!junk.has(k)) return m; n++; return lit; });
  if (s !== before) fs.writeFileSync(file, s);
}
console.error(`desfeitas: ${n}`);
