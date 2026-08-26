import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "vite";
import { compile } from "./compiler.js";
const ROUTES = "virtual:core/routes";
const STATES = "virtual:core/states";
const ASSETS = "virtual:core/assets";
const ENV = "virtual:core/env";
function core(options = {}) {
  const views = options.views ?? "src/views";
  const states = options.states ?? "src/js/states";
  const viewExt = options.viewExtension ?? ".view";
  const runtime = options.runtime ?? "/src/core/runtime.js";
  const assets = options.assets ?? { icons: "src/icons" };
  const publicEnv = options.publicEnv ?? ["API_URL", "PROJECT_URL", "APP_URL", "APP_ENV"];
  const sources = options.sources ?? [
    { dir: options.components ?? "src/components", ext: options.componentExtension ?? ".comp" },
    { dir: options.layouts ?? "src/layouts", ext: options.layoutExtension ?? ".layout" }
  ];
  const tagExtensions = sources.map((s) => s.ext);
  const compiled = (file) => file.endsWith(viewExt) || tagExtensions.some((e) => file.endsWith(e));
  let root = process.cwd();
  let index = null;
  let stateIndex = null;
  let environment = null;
  function scanStates() {
    const dir = path.resolve(root, states);
    if (!fs.existsSync(dir)) return /* @__PURE__ */ new Set();
    return new Set(
      fs.readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3))
    );
  }
  function stateNames() {
    stateIndex = scanStates();
    return stateIndex;
  }
  function assetExists(id) {
    const slash = id.indexOf("/");
    const group = assets[id.slice(0, slash)];
    if (!group || slash < 1) return false;
    const base = path.resolve(root, group);
    const target = path.resolve(base, id.slice(slash + 1));
    return (target === base || target.startsWith(base + path.sep)) && fs.existsSync(target);
  }
  function viewFiles() {
    const dir = path.resolve(root, views);
    if (!fs.existsSync(dir)) return [];
    const found = [];
    const walk = (current) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(viewExt)) found.push(full);
      }
    };
    walk(dir);
    return found;
  }
  function routeMeta(file) {
    const relative = path.relative(path.resolve(root, views), file).split(path.sep).join("/");
    let route = relative.slice(0, -viewExt.length);
    route = route === "index" ? "" : route.replace(/\/index$/, "");
    route = route ? `/${route}` : "/";
    const keys = [];
    const source = route.split("/").filter(Boolean).map((part) => {
      if (/^\[[^\]]+\]$/.test(part)) {
        keys.push(part.slice(1, -1));
        return "([^/]+)";
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("/");
    return { keys, source: `^/${source}/?$`, score: route.split("/").filter(Boolean).reduce((n, part) => n + (part.startsWith("[") ? 1 : 2), 0) };
  }
  function scan() {
    const found = /* @__PURE__ */ new Map();
    for (const source of sources) {
      const dir = path.resolve(root, source.dir);
      if (!fs.existsSync(dir)) continue;
      const walk = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const full = path.join(current, entry.name);
          if (entry.isDirectory()) {
            walk(full);
            continue;
          }
          if (!entry.name.endsWith(source.ext)) continue;
          const name = entry.name.slice(0, -source.ext.length);
          const previous = found.get(name);
          if (previous) {
            throw new Error(`[core] two files claim <${name}>:
  ${rel(previous)}
  ${rel(full)}`);
          }
          found.set(name, full);
        }
      };
      walk(dir);
    }
    return found;
  }
  const rel = (file) => "/" + path.relative(root, file).split(path.sep).join("/");
  function resolveComponent(name) {
    if (!index?.has(name)) index = scan();
    const file = index.get(name);
    return file ? rel(file) : null;
  }
  return {
    name: "core",
    configResolved(config) {
      root = config.root;
      index = null;
      const values = loadEnv(config.mode, root, "");
      const selected = Object.fromEntries(publicEnv.flatMap((key) => values[key] === void 0 ? [] : [[key, values[key]]]));
      const demo = config.command === "serve" || selected.APP_ENV === "demo";
      environment = {
        mode: config.mode,
        values: selected,
        flags: { development: config.command === "serve", production: config.command === "build", demo }
      };
    },
    resolveId(id) {
      if (id === ROUTES || id === STATES || id === ASSETS || id === ENV) return "\0" + id;
    },
    load(id) {
      if (id === "\0" + ROUTES) {
        const files = viewFiles();
        const sourceRoot = `/${views.replace(/^\/+|\/+$/g, "")}/`;
        const viewPath = (file) => sourceRoot + path.relative(path.resolve(root, views), file).split(path.sep).join("/");
        const isError = (file) => path.relative(path.resolve(root, views, "errors"), file) && file.startsWith(path.resolve(root, views, "errors") + path.sep);
        const shell = files.find((file) => path.basename(file, viewExt) === "_shell");
        const routes = files.filter((file) => !isError(file) && path.basename(file, viewExt) !== "_shell").map((file) => {
          const meta = routeMeta(file);
          return `{ load: () => import(${JSON.stringify(viewPath(file))}), re: new RegExp(${JSON.stringify(meta.source)}), keys: ${JSON.stringify(meta.keys)}, score: ${meta.score} }`;
        });
        const errors = files.filter(isError).map((file) => {
          const name = path.basename(file, viewExt);
          return `${JSON.stringify(name)}: () => import(${JSON.stringify(viewPath(file))})`;
        });
        return `export default { routes: [${routes.join(",")}], errors: {${errors.join(",")}}, shell: ${shell ? `() => import(${JSON.stringify(viewPath(shell))})` : "null"} }`;
      }
      if (id === "\0" + STATES) {
        return [
          `const mods = import.meta.glob(${JSON.stringify(`/${states}/*.js`)}, { eager: true })`,
          `export default mods`
        ].join("\n");
      }
      if (id === "\0" + ASSETS) {
        const groups = Object.entries(assets).map(([name, dir]) => {
          const root2 = `/${dir.replace(/^\/+|\/+$/g, "")}/`;
          const pattern = `${root2}**/*.svg`;
          return `${JSON.stringify(name)}: { root: ${JSON.stringify(root2)}, files: import.meta.glob(${JSON.stringify(pattern)}, { query: '?url', import: 'default' }), raw: import.meta.glob(${JSON.stringify(pattern)}, { query: '?raw', import: 'default' }) }`;
        });
        return [
          `const groups = { ${groups.join(", ")} }`,
          "export function loadAsset(id) {",
          "  const slash = id.indexOf('/')",
          "  const group = groups[id.slice(0, slash)]",
          "  const path = id.slice(slash + 1)",
          "  const load = group?.files[`${group.root}${path}`]",
          "  return load ? load() : Promise.reject(new Error(`unknown asset: ${id}`))",
          "}",
          "export function loadAssetRaw(id) {",
          "  const slash = id.indexOf('/')",
          "  const group = groups[id.slice(0, slash)]",
          "  const path = id.slice(slash + 1)",
          "  const load = group?.raw[`${group.root}${path}`]",
          "  return load ? load() : Promise.reject(new Error(`unknown asset: ${id}`))",
          "}"
        ].join("\n");
      }
      if (id === "\0" + ENV) {
        return [
          `const config = ${JSON.stringify(environment ?? { mode: "development", values: {}, flags: { development: true, production: false, demo: true } })}`,
          "export const env = Object.freeze({",
          "  mode: config.mode, values: Object.freeze(config.values),",
          "  get: (key, fallback = undefined) => config.values[key] ?? fallback,",
          "  is: (type) => Boolean(config.flags[type]) || config.values.APP_ENV === type,",
          "})"
        ].join("\n");
      }
    },
    transform(code, id) {
      const file = id.split("?")[0];
      if (!compiled(file)) return null;
      return {
        code: compile(code, {
          filename: path.relative(root, file).split(path.sep).join("/"),
          runtime,
          resolve: resolveComponent,
          stateNames: stateNames(),
          assetExists,
          envIs: environment?.flags.production ? (type) => Boolean(environment.flags[type]) || environment.values.APP_ENV === type : null
        }),
        map: null
      };
    },
    handleHotUpdate(ctx) {
      if (!compiled(ctx.file)) return;
      index = null;
      ctx.server.ws.send({ type: "full-reload" });
      return [];
    }
  };
}
export {
  core as default
};
