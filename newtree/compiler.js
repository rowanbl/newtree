const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);
const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);
function compile(source, {
  filename = "view",
  runtime = "/src/core/runtime.js",
  resolve,
  stateNames,
  assetExists,
  envIs
} = {}) {
  const file = { filename, resolve, stateNames, assetExists, envIs, components: new Map(), usesClass: false };
  const body = gen(parse(blade(source)), [], file, true);
  const imports = [...file.components].map(([name, spec]) => `import ${name} from ${JSON.stringify(spec)}`);
  return [
    `import { view } from ${JSON.stringify(runtime)}`,
    ...imports,
    "",
    `export default ${body}`,
    ""
  ].join("\n");
}
function parse(src) {
  const root = { children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const text = (value) => {
    if (value) top().children.push({ text: value });
  };
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt < 0) {
      text(src.slice(i));
      break;
    }
    if (lt > i) text(src.slice(i, lt));
    i = lt;
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith("</", i)) {
      const gt = src.indexOf(">", i);
      const closing = src.slice(i + 2, gt < 0 ? src.length : gt).trim();
      const subcomponent = /^\(([a-zA-Z][\w:.-]*)\)$/.exec(closing);
      const name = subcomponent ? `(${subcomponent[1].toLowerCase()})` : closing.toLowerCase();
      i = gt < 0 ? src.length : gt + 1;
      for (let d = stack.length - 1; d > 0; d--) {
        if (stack[d].name === name) {
          stack.length = d;
          break;
        }
      }
      continue;
    }
    const subcomponent = /^<\(([a-zA-Z][\w:.-]*)\)/.exec(src.slice(i));
    const open = subcomponent ?? /^<([a-zA-Z][\w:.-]*)/.exec(src.slice(i));
    if (!open) {
      text("<");
      i++;
      continue;
    }
    const tag = open[1];
    const el = subcomponent
      ? { tag: "newtree-slot", name: `(${tag.toLowerCase()})`, subcomponent: tag, attrs: [], children: [] }
      : { tag, name: tag.toLowerCase(), attrs: [], children: [] };
    let j = i + open[0].length;
    let selfClosing = false;
    while (j < src.length) {
      while (/\s/.test(src[j])) j++;
      if (src[j] === ">") {
        j++;
        break;
      }
      if (src.startsWith("/>", j)) {
        selfClosing = true;
        j += 2;
        break;
      }
      const nameMatch = /^[^\s"'>/=]+/.exec(src.slice(j));
      if (!nameMatch) {
        j++;
        continue;
      }
      const name = nameMatch[0];
      j += name.length;
      let value = null;
      const save = j;
      while (/\s/.test(src[j])) j++;
      if (src[j] === "=") {
        j++;
        while (/\s/.test(src[j])) j++;
        const quote = src[j];
        if (quote === '"' || quote === "'") {
          const end = src.indexOf(quote, j + 1);
          value = src.slice(j + 1, end < 0 ? src.length : end);
          j = end < 0 ? src.length : end + 1;
        } else {
          const bare = /^[^\s>]*/.exec(src.slice(j));
          value = bare[0];
          j += bare[0].length;
        }
      } else {
        j = save;
      }
      el.attrs.push({ name, value });
    }
    top().children.push(el);
    i = j;
    if (selfClosing || VOID.has(el.name)) continue;
    if (RAW_TEXT.has(el.name)) {
      const rest = src.slice(i);
      const close = new RegExp(`</${el.name}\\s*>`, "i").exec(rest);
      el.raw = close ? rest.slice(0, close.index) : rest;
      i += close ? close.index + close[0].length : rest.length;
      continue;
    }
    stack.push(el);
  }
  return root.children;
}
function blade(source) {
  const escaped = (value) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return source.replace(
    /@if\s*\(\s*asset_exists\(\s*(['"])([\s\S]*?)\1\s*\)\s*\)([\s\S]*?)@else([\s\S]*?)@endif/g,
    (_, _quote, file, yes, no) => `<AssetIf file="${escaped(file)}"><Then>${yes}</Then><Else>${no}</Else></AssetIf>`
  ).replace(
    /@asset\(\s*(['"])([\s\S]*?)\1\s*(?:,\s*([^)]*?))?\s*\)/g,
    (_, _quote, file, attrs = "") => `<Asset file="${escaped(file)}" ${attrs}/>`
  );
}
function gen(nodes, scope, file, root = false) {
  const ctx = { html: "", parts: [], blocks: [], els: 0, scope, file };
  walk(nodes, ctx);
  const flag = root && file.usesClass ? "\n  usesClass: true," : "";
  return `view({
  html: ${JSON.stringify(ctx.html)},
  parts: [${join(ctx.parts)}],
  blocks: [${join(ctx.blocks)}],${flag}
})`;
}
function join(list) {
  return list.length ? `
    ${list.join(",\n    ")},
  ` : "";
}
function walk(nodes, ctx) {
  for (const node of nodes) {
    if (node.text !== void 0) emitText(node.text, ctx);
    else emitElement(node, ctx);
  }
}
function emitText(str, ctx) {
  for (const seg of holes(str)) {
    if (seg.text !== void 0) {
      ctx.html += seg.text;
      continue;
    }
    const i = ctx.parts.length;
    if (seg.expr.startsWith(":")) {
      const slot = seg.expr.slice(1).trim();
      if (slot === "class") throw fail(ctx, `{:class} belongs in a class attribute, not in text`);
      if (slot !== "content") throw fail(ctx, `unknown {:${slot}} \u2014 text takes {:content}`);
      ctx.parts.push(`{ k: 's' }`);
    } else {
      ctx.parts.push(`{ k: 't', f: ${fn(seg.expr, ctx)} }`);
    }
    ctx.html += `<!--:${i}-->`;
  }
}
function emitElement(el, ctx) {
  if (el.subcomponent) {
    throw fail(ctx, `<(${el.subcomponent})> must be a direct child of a component`);
  }
  const cond = take(el, "if");
  if (cond !== void 0) {
    const i = ctx.blocks.length;
    ctx.html += `<!--#${i}-->`;
    ctx.blocks.push(`{ k: 'if', f: ${fn(cond, ctx)}, v: ${gen([el], ctx.scope, ctx.file)} }`);
    return;
  }
  const loop = take(el, "each");
  if (loop !== void 0) {
    const m = /^\s*([A-Za-z_$][\w$]*)\s*(?:,\s*([A-Za-z_$][\w$]*)\s*)?\sof\s([\s\S]+)$/.exec(loop);
    if (!m) throw fail(ctx, `each="${loop}" should read like each="item of states.cart.items"`);
    const [, item, index, list] = m;
    const inner = [...ctx.scope, item, ...index ? [index] : []];
    const i = ctx.blocks.length;
    ctx.html += `<!--#${i}-->`;
    ctx.blocks.push(
      `{ k: 'each', item: ${JSON.stringify(item)}, index: ${JSON.stringify(index ?? null)}, f: ${fn(list, ctx)}, v: ${gen([el], inner, ctx.file)} }`
    );
    return;
  }
  const provide = take(el, "states");
  if (provide !== void 0) {
    const names = provide.split(",").map((s) => s.trim()).filter(Boolean);
    if (!names.length) throw fail(ctx, `states="" needs at least one name`);
    for (const name of names) knownState(name, ctx, `states="${name}"`);
    const i = ctx.blocks.length;
    ctx.html += `<!--#${i}-->`;
    ctx.blocks.push(
      `{ k: 'states', names: ${JSON.stringify(names)}, v: ${gen([el], ctx.scope, ctx.file)} }`
    );
    return;
  }
  if (el.tag === "env" && ctx.file.envIs) {
    const type = el.attrs.find((attr) => attr.name === "type")?.value;
    if (type != null && !type.includes("{")) {
      if (ctx.file.envIs(type)) walk(el.children, ctx);
      return;
    }
  }
  if (/^[A-Z]/.test(el.tag) || el.tag === "env") {
    if (el.tag === "env") el.tag = "Env";
    if (el.tag === "AssetIf") return emitAssetIf(el, ctx);
    if (el.tag === "Asset") return emitAsset(el, ctx);
    if (el.tag === "Svg") return emitSvg(el, ctx);
    return emitComponent(el, ctx);
  }
  let attrs = "";
  const binds = [];
  let svgFallback = null;
  for (const a of el.attrs) {
    if (isEvent(a)) {
      binds.push({ k: "e", n: eventName(a.name), f: fn(a.value, ctx, true) });
    } else if (a.name === "fallback") {
      svgFallback = fn(attrExpr(a.value, ctx), ctx);
    } else if (a.name === "asset") {
      binds.push({ k: "asset", n: "src", f: fn(attrExpr(a.value, ctx), ctx) });
    } else if (a.name === "svg") {
      binds.push({ k: "svg", f: fn(attrExpr(a.value, ctx), ctx) });
    } else if (a.name === "cycle") {
      binds.push({ k: "cycle", f: fn(attrExpr(a.value, ctx), ctx) });
    } else if (a.name === "lazy") {
      binds.push({ k: "lazy", f: fn(attrExpr(a.value, ctx), ctx) });
    } else if (a.value != null && a.value.includes("{")) {
      binds.push({ k: "a", n: a.name, f: fn(attrExpr(a.value, ctx), ctx) });
    } else {
      attrs += a.value == null ? ` ${a.name}` : ` ${a.name}="${escapeAttr(a.value)}"`;
    }
  }
  for (const bind of binds) {
    if (bind.k === "svg" && svgFallback) bind.g = svgFallback;
  }
  let marker = "";
  if (binds.length) {
    const e = ctx.els++;
    marker = ` data-v="${e}"`;
    for (const b of binds) {
      const fallback = b.g ? `, g: ${b.g}` : "";
      ctx.parts.push(`{ k: '${b.k}', e: ${e}, n: ${JSON.stringify(b.n)}, f: ${b.f}${fallback} }`);
    }
  }
  ctx.html += `<${el.tag}${attrs}${marker}>`;
  if (el.raw !== void 0) ctx.html += el.raw;
  else walk(el.children, ctx);
  if (!VOID.has(el.name)) ctx.html += `</${el.tag}>`;
}
function emitAssetIf(el, ctx) {
  const file = take(el, "file");
  if (file === void 0) throw fail(ctx, "@if(asset_exists(...)) needs an asset path");
  const branch = (name) => (el.children.find((node) => node.name === name)?.children ?? []).filter((node) => node.text === void 0 || !/^\s*$/.test(node.text));
  const yes = branch("then");
  const no = branch("else");
  if (!file.includes("{") && ctx.file.assetExists) {
    walk(ctx.file.assetExists(file) ? yes : no, ctx);
    return;
  }
  if (yes.length === 1 && yes[0].tag === "Asset") {
    emitAsset(yes[0], ctx, gen(no, ctx.scope, ctx.file));
    return;
  }
  throw fail(ctx, "a dynamic @if(asset_exists(...)) must contain one @asset(...) in its true branch");
}
function emitAsset(el, ctx, fallback = "null") {
  const file = take(el, "file");
  if (file === void 0) throw fail(ctx, "@asset(...) needs an asset path");
  const attrs = el.attrs.map((a) => {
    if (isEvent(a)) throw fail(ctx, "@asset(...) does not support event handlers");
    return `{ n: ${JSON.stringify(a.name)}, f: ${fn(attrExpr(a.value, ctx), ctx)} }`;
  });
  const i = ctx.blocks.length;
  ctx.html += `<!--#${i}-->`;
  ctx.blocks.push(`{ k: 'svgfile', f: ${fn(attrExpr(file, ctx), ctx)}, attrs: [${attrs.join(", ")}], fallback: ${fallback} }`);
}
function emitSvg(el, ctx) {
  const file = take(el, "file");
  if (file === void 0) throw fail(ctx, '<Svg> needs file="group/path.svg"');
  const attrs = [];
  for (const a of el.attrs) {
    if (isEvent(a)) throw fail(ctx, "<Svg> does not support event handlers");
    attrs.push(`{ n: ${JSON.stringify(a.name)}, f: ${fn(attrExpr(a.value, ctx), ctx)} }`);
  }
  const fallback = el.children.length ? gen(el.children, ctx.scope, ctx.file) : "null";
  const i = ctx.blocks.length;
  ctx.html += `<!--#${i}-->`;
  ctx.blocks.push(
    `{ k: 'svgfile', f: ${fn(attrExpr(file, ctx), ctx)}, attrs: [${attrs.join(", ")}], fallback: ${fallback} }`
  );
}
function emitComponent(el, ctx) {
  const spec = ctx.file.resolve?.(el.tag);
  if (!spec) throw fail(ctx, `no component named <${el.tag}> \u2014 expected components/${el.tag}.comp`);
  ctx.file.components.set(el.tag, spec);
  const props = [];
  const events = [];
  let cls = "null";
  for (const a of el.attrs) {
    if (isEvent(a)) {
      events.push(`{ n: ${JSON.stringify(eventName(a.name))}, f: ${fn(a.value, ctx, true)} }`);
      continue;
    }
    const source = fn(attrExpr(a.value, ctx), ctx);
    if (a.name === "class") cls = source;
    props.push(`{ n: ${JSON.stringify(a.name)}, f: ${source} }`);
  }
  const slots = el.children.filter((child) => child.subcomponent);
  const children = slots.length
    ? el.children.filter((child) => !child.subcomponent && (child.text === void 0 || !/^\s*$/.test(child.text)))
    : el.children;
  const content = children.length ? gen(children, ctx.scope, ctx.file) : "null";
  const i = ctx.blocks.length;
  ctx.html += `<!--#${i}-->`;
  ctx.blocks.push(
    `{ k: 'comp', name: ${JSON.stringify(el.tag)}, v: () => ${el.tag}, props: [${props.join(", ")}], events: [${events.join(", ")}], cls: ${cls}, content: ${content}, slots: [${slots.map((slot) => emitSlot(slot, ctx)).join(", ")}] }`
  );
}
function emitSlot(el, ctx) {
  const props = el.attrs.map((attr) => `{ n: ${JSON.stringify(attr.name)}, f: ${fn(attrExpr(attr.value, ctx), ctx)} }`);
  return `{ name: ${JSON.stringify(el.subcomponent)}, props: [${props.join(", ")}], v: ${gen(el.children, ctx.scope, ctx.file)} }`;
}
function fn(expr, ctx, statement = false) {
  for (const [, , name] of expr.matchAll(/(^|[^\w$.])states\s*\.\s*([A-Za-z_$][\w$]*)/g)) {
    knownState(name, ctx, `states.${name}`);
  }
  const decl = ctx.scope.length ? `const { ${ctx.scope.join(", ")} } = $scope; ` : "";
  const body = statement ? `{ ${decl}${expr}
 }` : `{ ${decl}return (${expr}) }`;
  try {
    new Function("states", "$scope", "event", "params", "props", body);
  } catch (e) {
    throw fail(ctx, `${e.message} in \`${expr.trim()}\``);
  }
  return `(states, $scope, event, params, props) => ${body}`;
}
function attrExpr(value, ctx) {
  if (value == null) return "true";
  if (!value.includes("{")) return JSON.stringify(value);
  const segs = holes(value).map((s) => s.expr === void 0 ? s : { expr: attrHole(s.expr, ctx) });
  if (segs.length === 1 && segs[0].expr !== void 0) return segs[0].expr;
  const parts = segs.map((s) => s.text !== void 0 ? escapeTemplate(s.text) : "${" + s.expr + "}");
  return "`" + parts.join("") + "`";
}
function attrHole(expr, ctx) {
  if (!expr.startsWith(":")) return expr;
  const name = expr.slice(1).trim();
  if (name === "content") throw fail(ctx, `{:content} belongs in text, not in an attribute`);
  if (name !== "class") throw fail(ctx, `unknown {:${name}} \u2014 attributes take {:class}`);
  ctx.file.usesClass = true;
  return `(props.class ?? '')`;
}
function holes(str) {
  const out = [];
  let buf = "";
  let i = 0;
  while (i < str.length) {
    const c = str[i];
    if (c === "\\" && (str[i + 1] === "{" || str[i + 1] === "}")) {
      buf += str[i + 1];
      i += 2;
      continue;
    }
    if (c === "{") {
      let depth = 1;
      let j = i + 1;
      for (; j < str.length; j++) {
        if (str[j] === "{") depth++;
        else if (str[j] === "}" && --depth === 0) break;
      }
      if (depth !== 0) {
        buf += c;
        i++;
        continue;
      }
      if (buf) {
        out.push({ text: buf });
        buf = "";
      }
      out.push({ expr: str.slice(i + 1, j).trim() });
      i = j + 1;
      continue;
    }
    buf += c;
    i++;
  }
  if (buf) out.push({ text: buf });
  return out;
}
const isEvent = (a) => /^on[a-z]/i.test(a.name) && a.value != null;
const eventName = (name) => name.slice(2).toLowerCase();
function knownState(name, ctx, label) {
  const known = ctx.file.stateNames;
  if (!known || name === "route" || name === "error" || known.has(name)) return;
  throw fail(ctx, `${label} \u2014 no ${name}.js in the states directory`);
}
function take(el, name) {
  const i = el.attrs.findIndex((a) => a.name === name);
  if (i < 0) return void 0;
  return el.attrs.splice(i, 1)[0].value ?? "";
}
const escapeAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const escapeTemplate = (s) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
function fail(ctx, message) {
  return new Error(`[core] ${ctx.file.filename}: ${message}`);
}
export {
  compile
};
