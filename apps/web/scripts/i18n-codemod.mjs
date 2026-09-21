/**
 * Codemod de internacionalização: envolve os textos em português do código com t("…").
 *
 *   node scripts/i18n-codemod.mjs            # reescreve src/**\/*.{ts,tsx}
 *   node scripts/i18n-codemod.mjs --dry      # só relata
 *   node scripts/i18n-codemod.mjs --keys     # imprime as chaves encontradas (uma por linha)
 *
 * Regras (heurísticas; o resultado passa por tsc/eslint/prettier depois):
 *  - Texto JSX (com letras) vira {t("…")}; sequências "texto {expr} texto" viram uma chave só com
 *    {{v0}}, {{v1}}… e o objeto de valores.
 *  - Atributos JSX com valor de texto (fora de uma lista de atributos técnicos) viram {t("…")}.
 *  - Literais de string "com cara de frase" (acento, ou maiúscula inicial com espaço, ou pontuação
 *    final) em qualquer expressão viram t("…"); template literals idem, com {{v}}.
 *  - Ignora imports, chaves de objeto, className/cn(), queryKey, comparações, rotas e testes.
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";

const traverse = traverseMod.default ?? traverseMod;
const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry");
const KEYS_ONLY = args.has("--keys");
// --loose: segunda passada, pega palavras soltas ("matéria", "em dia", "+ Criar objetivo") que a
// heurística normal deixa passar; strings técnicas continuam de fora
const LOOSE = args.has("--loose");
const ROOT = path.resolve(process.cwd(), "src");

const SKIP_FILES = /(\.test\.tsx?$|\.d\.ts$|\/i18n\/|\/api\/schema|\/pwa\/sw\.ts$|\/lib\/languages\.ts$)/;
const SKIP_ATTRS = new Set([
  "className", "class", "to", "href", "src", "id", "key", "type", "name", "value", "defaultValue", "htmlFor", "variant", "size",
  "mode", "align", "side", "role", "target", "rel", "autoComplete", "inputMode", "aria-hidden", "aria-live", "aria-current",
  "aria-labelledby", "aria-describedby", "aria-controls", "aria-haspopup", "viewBox", "d", "fill", "stroke", "weight", "color",
  "as", "ref", "style", "width", "height", "pattern", "accept", "method", "action", "encType", "lang", "dir", "tabIndex",
  "orientation", "collisionPadding", "sideOffset", "max", "min", "step", "maxLength", "minLength", "rows", "cols", "loading",
  "decoding", "crossOrigin", "referrerPolicy", "sizes", "srcSet", "download", "form", "list", "wrap", "spellCheck",
]);
// propriedades de objeto cujo valor é texto mesmo quando é uma palavra só ("Teoria")
const TEXT_PROPS = new Set(["label", "title", "description", "hint", "body", "text", "summary", "subtitle", "placeholder", "message", "detail", "cta", "kicker", "name", "short", "long", "tip", "caption", "heading", "emptyLabel", "help", "success", "error", "info", "ok", "confirm", "cancel", "yes", "no"]);
const SKIP_CALLEES = new Set(["cn", "clsx", "twMerge", "cva", "console.log", "console.warn", "console.error", "console.info", "console.debug", "localStorage.getItem", "localStorage.setItem", "localStorage.removeItem", "sessionStorage.getItem", "sessionStorage.setItem", "document.querySelector", "document.querySelectorAll", "document.getElementById", "CSS.escape", "new URL", "fetch", "new RegExp", "Intl.DateTimeFormat", "Intl.NumberFormat", "format", "parseISO", "matchMedia", "addEventListener", "removeEventListener", "dispatchEvent", "new CustomEvent", "new BroadcastChannel", "postMessage", "setAttribute", "getAttribute", "hasAttribute", "closest", "matches", "startsWith", "endsWith", "includes", "indexOf", "split", "replace", "replaceAll", "join", "padStart", "padEnd", "test", "exec", "get", "set", "has", "delete", "encodeURIComponent", "decodeURIComponent", "atob", "btoa", "import", "require", "navigate", "nav", "useSearchParams", "createElement", "open", "assign", "querySelector"]);
const SKIP_OBJ_KEYS = new Set(["queryKey", "className", "class", "to", "href", "path", "src", "url", "id", "key", "type", "kind", "code", "value", "field", "status", "method", "category", "mood", "target", "icon", "variant", "size", "role", "route", "screen", "step", "event", "action", "channel", "tone", "theme", "sort", "order", "dir", "lang", "locale", "timezone", "format", "mime", "ext", "op", "kindOf", "storageKey", "storage", "queue", "table", "index", "collection"]);

const ACCENT = /[áéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ]/;

function looksLikeText(s, ctx = {}) {
  const v = s.trim();
  if (!v || v === "Estudatta") return false;
  if (!/[A-Za-zÀ-ÿ]/.test(v)) return false;
  if (!/[a-zà-ÿ]/.test(v)) return false; // tudo maiúsculo: GET, POST, ISO…
  if (/^(https?:|mailto:|tel:|\/|#|\.|@|data:|blob:)/.test(v)) return false;
  if (/^[\w.-]+@[\w.-]+$/.test(v)) return false;
  if (/^[A-Za-z]+\/[A-Za-z_]+$/.test(v)) return false; // America/Sao_Paulo
  if (/^[a-z0-9_.:-]+$/.test(v) && !ACCENT.test(v)) return false; // identificadores, classes
  if (/^[a-z][\w-]*(\s[a-z][\w-]*)*$/.test(v) && !ACCENT.test(v) && !/\s/.test(v)) return false;
  if (/^(\d|[\d:./,-]+)$/.test(v)) return false;
  // classes utilitárias: "bg-error-tint text-error", "flex gap-2"
  if (/^[a-z][\w:/[\]-]*( [a-z][\w:/[\]-]*)+$/.test(v) && v.split(" ").every((w) => /[-:]/.test(w))) return false;
  if (ACCENT.test(v)) return true;
  if (LOOSE) {
    if (/^(estudatta|[\w.-]*estudatta\.com\.br[\w/]*|XP|min|admin|ok|id|url|csv|pdf|json|http)$/i.test(v)) return false;
    if (/^#[0-9a-f]{3,8}$/i.test(v) || /^[\d\s.,:;+\-×%()/|→·]+$/.test(v)) return false;
    if (/^[a-z][a-z0-9_]*(;[a-z][a-z0-9_]*)+$/.test(v)) return false; // cabeçalho CSV
    if (/^[A-Za-z][\w-]*$/.test(v) && !/\s/.test(v) && /^[a-z]/.test(v) && !ctx.jsx && !ctx.pluralArg) return false; // identificador
    return /[A-Za-zÀ-ÿ]{2,}/.test(v);
  }
  if (ctx.textProp) return /^[A-ZÀ-Ý]/.test(v) || /\s/.test(v);
  if (/^[A-ZÀ-Ý]/.test(v) && /\s/.test(v)) return true;
  if (/^[A-ZÀ-Ý][a-zà-ÿ]{2,}[.?!…:]?$/.test(v) && ctx.jsx) return true; // "Salvar" num botão
  if (/[.?!…]$/.test(v) && /\s/.test(v)) return true;
  if (/^[a-zà-ÿ]/.test(v) && /\s/.test(v) && v.split(/\s+/).length >= 3 && ctx.jsx) return true; // "em dia", "faz a diferença"
  return false;
}

function decodeEntities(s) {
  return s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&hellip;/g, "…").replace(/&mdash;/g, "—").replace(/&middot;/g, "·");
}
const collapse = (s) => decodeEntities(s).replace(/\s+/g, " ");
const jsStr = (s) => JSON.stringify(s);

function calleeName(node) {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression") return `${calleeName(node.object)}.${node.property.name ?? ""}`;
  if (node.type === "NewExpression") return `new ${calleeName(node.callee)}`;
  return "";
}

function exprSource(src, node) {
  return src.slice(node.start, node.end);
}

const allKeys = new Set();
let filesChanged = 0;
let replacementsTotal = 0;

function processFile(file) {
  const src = fs.readFileSync(file, "utf8");
  const isTsx = file.endsWith(".tsx");
  let ast;
  try {
    ast = parse(src, { sourceType: "module", plugins: ["typescript", isTsx ? "jsx" : null].filter(Boolean), errorRecovery: true });
  } catch (e) {
    console.error("parse falhou:", file, e.message);
    return;
  }
  // nome da função de tradução: "t", ou "tx" se o arquivo já usa "t" para outra coisa
  let hasLocalT = false;
  traverse(ast, {
    Identifier(p) {
      if (p.node.name === "t" && (p.isBindingIdentifier() || p.parent.type === "VariableDeclarator" || p.parent.type === "CatchClause" || p.listKey === "params")) hasLocalT = true;
    },
  });
  const T = hasLocalT ? "tx" : "t";
  const edits = []; // {start,end,text}
  const done = new Set();
  const add = (start, end, text) => {
    const k = `${start}:${end}`;
    if (done.has(k)) return;
    done.add(k);
    edits.push({ start, end, text });
  };
  const keyOf = (s) => {
    allKeys.add(s);
    return s;
  };

  // --- JSX: filhos de cada elemento, agrupando texto + {expr} simples ---
  const handledJsx = new Set();
  function isSimpleExpr(n) {
    if (!n) return false;
    if (n.type === "JSXEmptyExpression") return false;
    // evita JSX e lógica com JSX dentro da frase
    let hasJsx = false;
    traverse(n, { noScope: true, JSXElement() { hasJsx = true; }, JSXFragment() { hasJsx = true; } }, undefined, {});
    return !hasJsx;
  }
  function flushRun(run) {
    if (!run.length) return;
    const texts = run.filter((c) => c.type === "JSXText");
    const joined = run.map((c) => (c.type === "JSXText" ? c.value : "\u0000")).join("");
    if (!texts.length) return;
    // texto puro sem letras (ex.: "·") não vira chave
    if (!/[A-Za-zÀ-ÿ]/.test(joined.replace(/\u0000/g, ""))) return;
    const exprs = run.filter((c) => c.type !== "JSXText");
    // separadores: se o "texto" é só pontuação em volta de expressões, não traduz
    const onlySep = texts.every((c) => !/[A-Za-zÀ-ÿ]/.test(c.value));
    if (onlySep) return;
    const first = run[0];
    const last = run[run.length - 1];
    // preserva espaço significativo nas bordas (mesma linha)
    const rawFirst = first.type === "JSXText" ? first.value : "";
    const rawLast = last.type === "JSXText" ? last.value : "";
    const lead = /^[ \t]+/.test(rawFirst) && !/\n/.test(rawFirst.match(/^\s*/)[0]) ? " " : "";
    const trail = /[ \t]+$/.test(rawLast) && !/\n/.test(rawLast.match(/\s*$/)[0]) ? " " : "";
    let i = 0;
    const vals = [];
    let key = run
      .map((c) => {
        if (c.type === "JSXText") return c.value;
        const name = `v${i++}`;
        vals.push(`${name}: ${exprSource(src, c.expression)}`);
        return `{{${name}}}`;
      })
      .join("");
    key = collapse(key).trim();
    if (!looksLikeText(key.replace(/\{\{v\d+\}\}/g, "x"), { jsx: true })) {
      // frase que só tem pontuação/números além das variáveis
      return;
    }
    keyOf(key);
    const call = vals.length ? `${T}(${jsStr(key)}, { ${vals.join(", ")} })` : `${T}(${jsStr(key)})`;
    add(first.start, last.end, `${lead}{${call}}${trail}`);
    run.forEach((c) => handledJsx.add(c));
  }

  traverse(ast, {
    JSXElement(p) {
      let run = [];
      for (const child of p.node.children) {
        if (child.type === "JSXText") {
          if (/^\s*$/.test(child.value)) {
            // espaço em branco: quebra a sequência se tiver quebra de linha
            if (/\n/.test(child.value)) { flushRun(run); run = []; } else run.push(child);
          } else run.push(child);
        } else if (child.type === "JSXExpressionContainer" && isSimpleExpr(child.expression) && child.expression.type !== "StringLiteral" && child.expression.type !== "TemplateLiteral") {
          run.push(child);
        } else {
          flushRun(run);
          run = [];
        }
      }
      flushRun(run);
    },
    JSXFragment(p) {
      let run = [];
      for (const child of p.node.children) {
        if (child.type === "JSXText") {
          if (/^\s*$/.test(child.value)) { if (/\n/.test(child.value)) { flushRun(run); run = []; } else run.push(child); } else run.push(child);
        } else if (child.type === "JSXExpressionContainer" && isSimpleExpr(child.expression) && child.expression.type !== "StringLiteral" && child.expression.type !== "TemplateLiteral") run.push(child);
        else { flushRun(run); run = []; }
      }
      flushRun(run);
    },
    JSXAttribute(p) {
      const name = p.node.name.name;
      if (typeof name !== "string" || SKIP_ATTRS.has(name) || name.startsWith("data-")) return;
      const v = p.node.value;
      if (!v) return;
      if (v.type === "StringLiteral") {
        if (!looksLikeText(v.value, { jsx: true, textProp: true })) return;
        const key = keyOf(collapse(v.value).trim());
        add(v.start, v.end, `{${T}(${jsStr(key)})}`);
      }
    },
  });

  // --- Strings e templates em expressões ---
  traverse(ast, {
    StringLiteral(p) {
      const n = p.node;
      if (handledJsx.has(n)) return;
      const parent = p.parent;
      if (!parent) return;
      if (parent.type.startsWith("Import") || parent.type.startsWith("Export")) return;
      if (parent.type === "JSXAttribute") return; // já tratado
      if (parent.type === "TSLiteralType" || parent.type === "TSEnumMember") return;
      if (parent.type === "ObjectProperty" && parent.key === n) return;
      if (parent.type === "MemberExpression" && parent.property === n) return;
      if (parent.type === "BinaryExpression" && ["===", "!==", "==", "!="].includes(parent.operator)) return;
      if (parent.type === "SwitchCase") return;
      if (parent.type === "TSAsExpression") return;
      if (p.parentPath?.parentPath?.node?.type === "BinaryExpression" && ["===", "!=="].includes(p.parentPath.parentPath.node.operator)) return;
      // dentro de chamadas técnicas
      let q = p.parentPath;
      let textProp = false;
      while (q) {
        const node = q.node;
        if (node.type === "CallExpression" || node.type === "NewExpression") {
          const cn = calleeName(node.callee);
          if (SKIP_CALLEES.has(cn) || SKIP_CALLEES.has(`new ${cn}`) || /\.(startsWith|endsWith|includes|indexOf|split|replace|replaceAll|test|matches|closest|querySelector|querySelectorAll|getItem|setItem|removeItem|setAttribute|getAttribute|hasAttribute|toggle|add|remove|contains|has|get|set|delete|join|padStart|padEnd|localeCompare|open)$/.test(cn) || /^(cn|clsx|cva|t|describe|it|test|expect|vi)$/.test(cn)) return;
          if (node.callee.type === "Identifier" && node.callee.name === "t") return;
          break;
        }
        if (node.type === "ObjectProperty" && node.key) {
          const k = node.key.name ?? node.key.value;
          if (SKIP_OBJ_KEYS.has(k)) return;
          if (TEXT_PROPS.has(k) && node.value === (q.parentPath === p.parentPath ? n : node.value)) textProp = TEXT_PROPS.has(k);
          if (q.parentPath?.node?.type === "ObjectExpression" && q.parentPath?.parentPath?.node?.type === "ArrayExpression") {
            // objeto em array: { value: "x", label: "Y" }
          }
          break;
        }
        if (node.type === "ArrayExpression" && q.parentPath?.node?.type === "ObjectProperty" && SKIP_OBJ_KEYS.has(q.parentPath.node.key.name)) return;
        if (node.type === "ArrayExpression" && q.parentPath?.node?.type === "CallExpression" && /queryKey|invalidateQueries|setQueryData|getQueryData|removeQueries/.test(exprSource(src, q.parentPath.node).slice(0, 60))) return;
        if (node.type === "JSXAttribute") { if (SKIP_ATTRS.has(node.name.name)) return; textProp = true; break; }
        if (node.type === "VariableDeclarator" || node.type === "ReturnStatement" || node.type === "ArrowFunctionExpression" || node.type === "FunctionDeclaration" || node.type === "JSXExpressionContainer" || node.type === "ConditionalExpression" || node.type === "LogicalExpression" || node.type === "TemplateLiteral" || node.type === "AssignmentExpression" || node.type === "ThrowStatement" || node.type === "AwaitExpression" || node.type === "ArrayExpression" || node.type === "SpreadElement") {
          q = q.parentPath;
          continue;
        }
        break;
      }
      // objetos { value: "…", label: "…" }: só label/… são texto
      if (parent.type === "ObjectProperty") {
        const k = parent.key.name ?? parent.key.value;
        textProp = TEXT_PROPS.has(k);
        if (!textProp && !ACCENT.test(n.value) && !/\s/.test(n.value)) return;
      }
      const inJsx = parent.type === "JSXExpressionContainer" || parent.type === "ConditionalExpression" || parent.type === "LogicalExpression";
      const pluralArg = parent.type === "CallExpression" && parent.callee.type === "Identifier" && /^(plural|pluralize|pl)$/.test(parent.callee.name);
      if (!looksLikeText(n.value, { jsx: inJsx || textProp, textProp, pluralArg })) return;
      const key = keyOf(collapse(n.value).trim());
      const call = `${T}(${jsStr(key)})`;
      if (parent.type === "JSXExpressionContainer") add(n.start, n.end, call);
      else add(n.start, n.end, call);
    },
    TemplateLiteral(p) {
      const n = p.node;
      if (p.parent.type === "TaggedTemplateExpression") return;
      const textParts = n.quasis.map((q) => q.value.cooked ?? "");
      const joined = textParts.join(" ");
      if (!/[A-Za-zÀ-ÿ]/.test(joined)) return;
      // dentro de chamadas técnicas (className, seletores, URLs)
      let q = p.parentPath;
      while (q) {
        const node = q.node;
        if (node.type === "CallExpression" || node.type === "NewExpression") {
          const cn = calleeName(node.callee);
          if (SKIP_CALLEES.has(cn) || /^(cn|clsx|cva|t)$/.test(cn) || /\.(startsWith|endsWith|includes|indexOf|split|replace|replaceAll|test|matches|closest|querySelector|querySelectorAll|getItem|setItem|removeItem|setAttribute|getAttribute|join|open|assign|push|navigate)$/.test(cn)) return;
          break;
        }
        if (node.type === "JSXAttribute") { if (SKIP_ATTRS.has(node.name.name)) return; break; }
        if (node.type === "ObjectProperty") { const k = node.key.name ?? node.key.value; if (SKIP_OBJ_KEYS.has(k)) return; break; }
        if (["VariableDeclarator", "ReturnStatement", "ArrowFunctionExpression", "JSXExpressionContainer", "ConditionalExpression", "LogicalExpression", "AssignmentExpression", "ThrowStatement", "ArrayExpression", "BinaryExpression"].includes(node.type)) { q = q.parentPath; continue; }
        break;
      }
      if (/^[\/#]|https?:|\/api\//.test(textParts[0])) return;
      const probe = textParts.join("x");
      if (!looksLikeText(probe, { jsx: true })) return;
      const vals = [];
      let key = "";
      n.quasis.forEach((qs, i) => {
        key += qs.value.cooked ?? "";
        if (i < n.expressions.length) {
          key += `{{v${i}}}`;
          vals.push(`v${i}: ${exprSource(src, n.expressions[i])}`);
        }
      });
      key = collapse(key);
      const lead = /^\s/.test(key) ? " " : "";
      const trail = /\s$/.test(key) ? " " : "";
      key = key.trim();
      keyOf(key);
      const call = vals.length ? `${T}(${jsStr(key)}, { ${vals.join(", ")} })` : `${T}(${jsStr(key)})`;
      add(n.start, n.end, lead || trail ? `(${lead ? '" " + ' : ""}${call}${trail ? ' + " "' : ""})` : call);
    },
  });

  if (!edits.length) return;
  // remove edições aninhadas (template dentro de JSX já coberto etc.)
  edits.sort((a, b) => a.start - b.start || b.end - a.end);
  const flat = [];
  let lastEnd = -1;
  for (const e of edits) {
    if (e.start < lastEnd) continue;
    flat.push(e);
    lastEnd = e.end;
  }
  let out = src;
  for (const e of [...flat].reverse()) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  if (!/from "@\/i18n"/.test(out)) {
    // depois do bloco de comentário inicial e antes do primeiro import
    const m = out.match(/^(\s*(\/\*[\s\S]*?\*\/\s*)?(\/\/[^\n]*\n\s*)*)/);
    const at = m ? m[0].length : 0;
    out = out.slice(0, at) + (T === "t" ? 'import { t } from "@/i18n";\n' : 'import { t as tx } from "@/i18n";\n') + out.slice(at);
  }
  replacementsTotal += flat.length;
  filesChanged++;
  if (!DRY && !KEYS_ONLY) fs.writeFileSync(file, out);
  else if (DRY) console.log(`${path.relative(process.cwd(), file)}: ${flat.length}`);
}

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(e.name) && !SKIP_FILES.test(full)) processFile(full);
  }
}
walk(ROOT);
if (KEYS_ONLY) for (const k of [...allKeys].sort()) console.log(k);
else console.error(`${filesChanged} arquivos, ${replacementsTotal} substituições, ${allKeys.size} chaves`);
