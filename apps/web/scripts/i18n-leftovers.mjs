import fs from "node:fs"; import path from "node:path";
import { parse } from "@babel/parser"; import traverseMod from "@babel/traverse";
const traverse = traverseMod.default ?? traverseMod;
const PT = /[áéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ]|\b(você|não|para|com|de|em|ou|que|sem|até|da|do|dos|das|um|uma)\b/;
function walk(d, out=[]) { for (const e of fs.readdirSync(d,{withFileTypes:true})) { const f=path.join(d,e.name); if (e.isDirectory()) walk(f,out); else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) && !f.includes("/i18n/") && !f.endsWith(".d.ts")) out.push(f);} return out; }
for (const file of walk("src")) {
  const src = fs.readFileSync(file, "utf8");
  const ast = parse(src, { sourceType: "module", plugins: ["typescript", "jsx"], errorRecovery: true });
  const report = (node, text) => { const line = src.slice(0, node.start).split("\n").length; console.log(`${file}:${line}: ${JSON.stringify(text).slice(0, 110)}`); };
  function insideT(p) { let q = p.parentPath; while (q) { if ((q.node.type === "CallExpression") && q.node.callee.type === "Identifier" && /^(t|tx)$/.test(q.node.callee.name)) return true; if (q.node.type === "CallExpression" || q.node.type === "JSXElement") break; q = q.parentPath; } return false; }
  traverse(ast, {
    StringLiteral(p) { const v = p.node.value; if (!/[A-Za-zÀ-ÿ]{3,}/.test(v) || !PT.test(v)) return; if (p.parent.type.startsWith("Import")||p.parent.type.startsWith("Export")) return; if (p.parent.type==="ObjectProperty"&&p.parent.key===p.node) return; if (p.parent.type==="TSLiteralType") return; if (insideT(p)) return; if (/^(https?:|\/|#|[a-z0-9_.:/-]+$)/.test(v)) return; report(p.node, v); },
    TemplateLiteral(p) { const t = p.node.quasis.map(q=>q.value.cooked).join("|"); if (!/[A-Za-zÀ-ÿ]{3,}/.test(t) || !PT.test(t)) return; if (insideT(p)) return; report(p.node, t); },
    JSXText(p) { const v = p.node.value.trim(); if (v && /[A-Za-zÀ-ÿ]{2,}/.test(v)) report(p.node, v); },
  });
}
