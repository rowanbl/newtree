import { effect } from "./reactive.js";
import { states as globalStates, createScope } from "./states.js";
import { loadAsset, loadAssetRaw } from "virtual:core/assets";
import { mountBehavior } from "./behaviors.js";
const EMPTY = Object.freeze({});
const AS_PROPERTY = new Set(["value", "checked", "selected", "indeterminate"]);
function view(def) {
  let tpl = null;
  return {
    usesClass: !!def.usesClass,
    create(scope = {}, params = {}, opts = {}) {
      const states = opts.states ?? globalStates;
      if (!tpl) {
        tpl = document.createElement("template");
        tpl.innerHTML = def.html;
      }
      const frag = tpl.content.cloneNode(true);
      const props = opts.props ?? EMPTY;
      const call = (f, event) => f(states, scope, event, params, props);
      const els = [];
      for (const el of frag.querySelectorAll("[data-v]")) {
        els[+el.getAttribute("data-v")] = el;
        el.removeAttribute("data-v");
      }
      const textAt = [];
      const blockAt = [];
      const walker = document.createTreeWalker(frag, NodeFilter.SHOW_COMMENT);
      const comments = [];
      while (walker.nextNode()) comments.push(walker.currentNode);
      for (const c of comments) {
        const m = /^([:#])(\d+)$/.exec(c.data);
        if (m) (m[1] === ":" ? textAt : blockAt)[+m[2]] = c;
      }
      const effects = [];
      const children = [];
      def.parts.forEach((p, i) => {
        if (p.k !== "t") return;
        const node = document.createTextNode("");
        textAt[i].replaceWith(node);
        effects.push(effect(() => {
          node.data = display(call(p.f));
        }));
      });
      def.parts.forEach((p, i) => {
        const el = els[p.e];
        if (p.k === "a") {
          effects.push(effect(() => setAttribute(els[p.e], p.n, call(p.f))));
        } else if (p.k === "asset") {
          let version = 0;
          effects.push(effect(() => {
            const name = call(p.f);
            const mine = ++version;
            if (!name) {
              el.removeAttribute(p.n);
              return;
            }
            loadAsset(String(name)).then((url) => {
              if (mine === version) setAttribute(el, p.n, url);
            }).catch((error) => {
              if (mine === version) el.removeAttribute(p.n);
              console.error(`[core] could not load asset ${name}`, error);
            });
          }));
        } else if (p.k === "svg") {
          let version = 0;
          const fallback = () => {
            el.replaceChildren(document.createTextNode(p.g ? display(call(p.g)) : ""));
            el.setAttribute("data-svg-fallback", "");
          };
          effects.push(effect(() => {
            const name = call(p.f);
            const mine = ++version;
            if (!name) {
              fallback();
              return;
            }
            loadAssetRaw(String(name)).then((markup) => {
              if (mine === version) {
                const svg = replaceWithSvg(el, markup);
                els[p.e] = svg;
                const nodeIndex = nodes.indexOf(el);
                if (nodeIndex >= 0) nodes[nodeIndex] = svg;
              }
            }).catch((error) => {
              if (mine === version) fallback();
            });
          }));
        } else if (p.k === "cycle") {
          let timer = null;
          let exitTimer = null;
          let onVisibility = null;
          const pause = () => {
            if (timer) clearInterval(timer);
            if (exitTimer) clearTimeout(exitTimer);
            timer = null;
            exitTimer = null;
          };
          const stop = () => {
            pause();
            if (onVisibility) document.removeEventListener("visibilitychange", onVisibility);
            onVisibility = null;
          };
          effects.push(effect(() => {
            stop();
            const words = String(call(p.f) ?? "").split("|").map((word) => word.trim()).filter(Boolean);
            if (!words.length) {
              el.replaceChildren();
              return;
            }
            let index = 0;
            el.replaceChildren(cyclingWord(words[index], "is-in"));
            if (words.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
            const advance = () => {
              if (!el.isConnected) {
                stop();
                return;
              }
              el.querySelectorAll(".cycling-text-item.is-out").forEach((word) => word.remove());
              const leaving = el.querySelector(".cycling-text-item.is-in");
              leaving?.classList.replace("is-in", "is-out");
              index = (index + 1) % words.length;
              el.append(cyclingWord(words[index], "is-in"));
              exitTimer = setTimeout(() => leaving?.remove(), 300);
            };
            const resume = () => {
              pause();
              if (!document.hidden && el.isConnected) timer = setInterval(advance, 2200);
            };
            onVisibility = resume;
            document.addEventListener("visibilitychange", onVisibility);
            resume();
          }));
          children.push({ destroy: stop });
        } else if (p.k === "lazy") {
          let observer = null;
          let cancelled = false;
          effects.push(effect(() => {
            observer?.disconnect();
            cancelled = false;
            const source = call(p.f);
            if (!source) return;
            const load = () => {
              const image = new Image();
              image.src = source;
              const ready = image.decode ? image.decode() : new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = reject;
              });
              ready.then(() => {
                if (!cancelled) {
                  setAttribute(el, "src", source);
                  el.classList.add("is-loaded");
                }
              }).catch(() => {
              });
            };
            observer = new IntersectionObserver(([entry]) => {
              if (!entry.isIntersecting) return;
              observer.disconnect();
              load();
            }, { rootMargin: "300px" });
            observer.observe(el);
          }));
          children.push({ destroy() {
            cancelled = true;
            observer?.disconnect();
          } });
        } else if (p.k === "e") {
          el.addEventListener(p.n, (event) => call(p.f, event));
        } else if (p.k === "s" && opts.content) {
          const inst = opts.content.create(opts.contentScope ?? {}, opts.contentParams ?? {}, {
            states: opts.contentStates ?? states,
            props: opts.contentProps
          });
          textAt[i].before(...inst.nodes);
          children.push(inst);
        }
      });
      const inherited = {
        states,
        props,
        content: opts.content,
        contentScope: opts.contentScope,
        contentParams: opts.contentParams,
        contentProps: opts.contentProps
      };
      def.blocks.forEach((b, i) => {
        const anchor = blockAt[i];
        if (b.k === "svgfile") {
          children.push(svgFile(b, anchor, scope, params, props, states));
          return;
        }
        if (b.k === "comp") {
          children.push(component(b, anchor, scope, params, props, effects, states));
          return;
        }
        if (b.k === "states") {
          const scoped = createScope(states, b.names);
          const inst = b.v.create(scope, params, { ...inherited, states: scoped.states });
          anchor.before(...inst.nodes);
          children.push({
            destroy() {
              inst.destroy();
              scoped.dispose();
            }
          });
          return;
        }
        let instances = [];
        const clear = () => {
          for (const inst of instances) inst.destroy();
          instances = [];
        };
        effects.push(effect(() => {
          const value = call(b.f);
          clear();
          if (b.k === "if") {
            if (value) instances = [mount(b.v, scope, params, inherited, anchor)];
            return;
          }
          const list = value == null ? [] : Array.from(value);
          instances = list.map((item, index) => {
            const inner = { ...scope, [b.item]: item };
            if (b.index) inner[b.index] = index;
            return mount(b.v, inner, params, inherited, anchor);
          });
        }));
        children.push({ destroy: clear });
      });
      const nodes = [...frag.childNodes];
      return {
        nodes,
        destroy() {
          for (const e of effects) e.stop();
          for (const c of children) c.destroy();
          for (const n of nodes) n.remove();
        }
      };
    }
  };
}
function cyclingWord(value, state) {
  const word = document.createElement("span");
  word.className = `cycling-text-item ${state}`;
  word.textContent = value;
  return word;
}
function mount(child, scope, params, inherited, anchor) {
  const inst = child.create(scope, params, { ...inherited });
  anchor.before(...inst.nodes);
  return inst;
}
function svgFile(b, anchor, scope, params, props, states) {
  const call = (f) => f(states, scope, void 0, params, props);
  let current = null;
  let disposed = false;
  loadAssetRaw(String(call(b.f))).then((markup) => {
    if (disposed) return;
    const svg = svgFromMarkup(markup);
    for (const attr of b.attrs) setAttribute(svg, attr.n, call(attr.f));
    anchor.before(svg);
    current = { destroy: () => svg.remove() };
  }).catch(() => {
    if (disposed || !b.fallback) return;
    current = b.fallback.create(scope, params, { states, props });
    anchor.before(...current.nodes);
  });
  return {
    destroy() {
      disposed = true;
      current?.destroy();
    }
  };
}
function component(b, anchor, scope, params, props, effects, states) {
  const child = typeof b.v === "function" ? b.v() : b.v;
  const call = (f, event) => f(states, scope, event, params, props);
  const own = {};
  for (const p of b.props) {
    Object.defineProperty(own, p.n, { enumerable: true, get: () => call(p.f) });
  }
  const slots = createSlots(b.slots, b.content, scope, params, props, states);
  const inst = child.create({}, params, {
    states,
    props: own,
    content: b.content,
    contentScope: scope,
    contentParams: params,
    contentProps: props,
    contentStates: states,
    slots
  });
  anchor.before(...inst.nodes);
  trimPreSpacer(anchor);
  queueMicrotask(() => trimPreSpacer(anchor));
  const root = inst.nodes.find((n) => n.nodeType === Node.ELEMENT_NODE);
  if (root) {
    for (const ev of b.events) {
      root.addEventListener(ev.n, (event) => call(ev.f, event));
    }
    if (b.cls && !child.usesClass) {
      let previous = [];
      effects.push(effect(() => {
        const next = String(call(b.cls) ?? "").split(/\s+/).filter(Boolean);
        root.classList.remove(...previous);
        root.classList.add(...next);
        root.__extraClass = next.join(" ");
        previous = next;
      }));
    }
  }
  const cleanup = root ? mountBehavior(b.name, root, { states, params, props: own, slots }) : null;
  return {
    nodes: inst.nodes,
    destroy() {
      cleanup?.();
      slots.destroy();
      inst.destroy();
    }
  };
}
function trimPreSpacer(anchor) {
  const spacer = anchor.previousSibling;
  if (anchor.parentElement?.closest("pre") && spacer?.nodeType === Node.TEXT_NODE && spacer.nodeValue === "\n" && spacer.previousSibling?.nodeType === Node.ELEMENT_NODE) spacer.remove();
}
function createSlots(definitions = [], content, scope, params, props, states) {
  const createSlot = (definition) => {
    const own = {};
    let inst = null;
    for (const prop of definition.props) {
      Object.defineProperty(own, prop.n, { enumerable: true, get: () => prop.f(states, scope, void 0, params, props) });
    }
    return {
      name: definition.name,
      props: own,
      mount(target) {
        if (!inst) inst = definition.v.create(scope, params, { states, props });
        target.replaceChildren(...inst.nodes);
        return this;
      },
      destroy() {
        inst?.destroy();
      }
    };
  };
  const entries = definitions.map(createSlot);
  const contentSlot = content ? createSlot({ name: "content", props: [], v: content }) : null;
  return {
    all: entries,
    content: contentSlot,
    get(name) {
      return entries.filter((entry) => entry.name === name);
    },
    destroy() {
      entries.forEach((entry) => entry.destroy());
    }
  };
}
function setAttribute(el, name, value) {
  if (AS_PROPERTY.has(name) && name in el) {
    el[name] = value;
    return;
  }
  if (name === "class") {
    const merged = `${value ?? ""} ${el.__extraClass ?? ""}`.replace(/\s+/g, " ").trim();
    if (merged) el.setAttribute("class", merged);
    else el.removeAttribute("class");
    return;
  }
  if (value === false || value == null) el.removeAttribute(name);
  else el.setAttribute(name, value === true ? "" : String(value));
}
function svgFromMarkup(markup) {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  const svg = template.content.querySelector("svg");
  if (!svg) throw new Error("[core] an svg asset did not contain an <svg> root");
  return svg;
}
function replaceWithSvg(host, markup) {
  const svg = svgFromMarkup(markup);
  for (const attr of host.attributes) svg.setAttribute(attr.name, attr.value);
  host.replaceWith(svg);
  return svg;
}
const display = (value) => value == null ? "" : String(value);
export {
  view
};
