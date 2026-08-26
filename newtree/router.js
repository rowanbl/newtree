import { states } from "./states.js";
import { emitRoute } from "./lifecycle.js";
let root = null;
let routes = [];
let errors = /* @__PURE__ */ new Map();
let outlet = null;
let current = null;
let token = 0;
let onErrorPage = false;
function start(el, manifest) {
  root = el;
  routes = manifest.routes;
  errors = new Map(Object.entries(manifest.errors));
  const shell = manifest.shell;
  addEventListener("popstate", render);
  document.addEventListener("click", intercept);
  return Promise.resolve(shell?.()).then((mod) => {
    if (mod) useShell(mod.default);
    return render();
  });
}
function navigate(to, { replace = false } = {}) {
  const url = new URL(to, location.href);
  const here = url.pathname + url.search === location.pathname + location.search;
  if (here && !onErrorPage) return Promise.resolve();
  if (!here) history[replace ? "replaceState" : "pushState"]({}, "", url);
  return render();
}
function fail(status = 500, message = "", details = null) {
  return showError(++token, status, message, details);
}
function useShell(v) {
  const inst = v.create({}, {});
  root.replaceChildren(...inst.nodes);
  const slot = root.querySelector("slot");
  if (slot) {
    outlet = document.createComment("page");
    slot.replaceWith(outlet);
  }
}
async function render() {
  const mine = ++token;
  const path = location.pathname;
  const hit = routes.find((r) => r.re.test(path));
  states.route.path = path;
  states.route.params = hit ? params(hit, path) : {};
  if (!hit) return showError(mine, 404, `No view for ${path}`);
  try {
    const mod = await hit.load();
    if (mine !== token) return;
    swap(mod.default.create({}, states.route.params));
    onErrorPage = false;
    emitRoute({ path, params: states.route.params, root, outlet });
    scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    return showError(mine, 500, e?.message ?? String(e));
  }
}
async function showError(mine, status, message, details = null) {
  states.error.status = status;
  states.error.message = message;
  states.error.details = details;
  onErrorPage = true;
  const load = resolveError(status);
  if (!load) return swap(plain(`${status} \u2014 ${message}`));
  try {
    const mod = await load();
    if (mine !== token) return;
    swap(mod.default.create({}, {}));
    scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    swap(plain(`${status} \u2014 ${message}`));
  }
}
function resolveError(status) {
  const candidates = [String(status), `${Math.floor(status / 100)}0x`, "error"];
  for (const name of candidates) {
    if (errors.has(name)) return errors.get(name);
  }
  return null;
}
function swap(inst) {
  current?.destroy();
  current = inst;
  if (outlet) outlet.before(...inst.nodes);
  else root.replaceChildren(...inst.nodes);
}
const plain = (message) => ({ nodes: [document.createTextNode(message)], destroy() {
} });
function intercept(event) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const a = event.target.closest?.("a[href]");
  if (!a || a.target || a.hasAttribute("download") || a.getAttribute("rel") === "external") return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return;
  event.preventDefault();
  navigate(url.pathname + url.search + url.hash);
}
function params(route, path) {
  const match = route.re.exec(path) ?? [];
  return Object.fromEntries(route.keys.map((key, i) => [key, decodeURIComponent(match[i + 1] ?? "")]));
}
export {
  fail,
  navigate,
  start
};
