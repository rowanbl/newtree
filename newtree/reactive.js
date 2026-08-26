const RAW = /* @__PURE__ */ Symbol("raw");
const ITERATE = /* @__PURE__ */ Symbol("iterate");
const targetMap = /* @__PURE__ */ new WeakMap();
const proxies = /* @__PURE__ */ new WeakMap();
let active = null;
let collecting = null;
const queue = /* @__PURE__ */ new Set();
let scheduled = false;
function track(target, key) {
  if (!active) return;
  let keys = targetMap.get(target);
  if (!keys) targetMap.set(target, keys = /* @__PURE__ */ new Map());
  let subs = keys.get(key);
  if (!subs) keys.set(key, subs = /* @__PURE__ */ new Set());
  if (subs.has(active)) return;
  subs.add(active);
  active.deps.push(subs);
}
function trigger(target, key) {
  const subs = targetMap.get(target)?.get(key);
  if (!subs) return;
  for (const e of subs) {
    if (e !== active && !e.disposed) queue.add(e);
  }
  if (queue.size && !scheduled) {
    scheduled = true;
    queueMicrotask(flush);
  }
}
function flush() {
  scheduled = false;
  const runs = [...queue];
  queue.clear();
  for (const e of runs) if (!e.disposed) e.run();
}
const handlers = {
  get(target, key, receiver) {
    if (key === RAW) return target;
    const value = Reflect.get(target, key, receiver);
    if (typeof key === "symbol") return value;
    track(target, key);
    return reactive(value);
  },
  set(target, key, value, receiver) {
    const isArray = Array.isArray(target);
    const wasLength = isArray ? target.length : 0;
    const had = Object.hasOwn(target, key);
    const old = target[key];
    const raw = value !== null && typeof value === "object" ? value[RAW] ?? value : value;
    if (!Reflect.set(target, key, raw, receiver)) return false;
    if (!had) trigger(target, ITERATE);
    if (old !== raw) trigger(target, key);
    if (isArray && target.length !== wasLength) trigger(target, "length");
    return true;
  },
  deleteProperty(target, key) {
    const had = Object.hasOwn(target, key);
    const ok = Reflect.deleteProperty(target, key);
    if (ok && had) {
      trigger(target, key);
      trigger(target, ITERATE);
    }
    return ok;
  },
  has(target, key) {
    track(target, key);
    return Reflect.has(target, key);
  },
  ownKeys(target) {
    track(target, ITERATE);
    return Reflect.ownKeys(target);
  }
};
function reactive(value) {
  if (value === null || typeof value !== "object") return value;
  if (value[RAW]) return value;
  const cached = proxies.get(value);
  if (cached) return cached;
  const proxy = new Proxy(value, handlers);
  proxies.set(value, proxy);
  return proxy;
}
function effect(fn) {
  const e = {
    deps: [],
    disposed: false,
    run() {
      if (e.disposed) return;
      cleanup(e);
      const prev = active;
      active = e;
      try {
        return fn();
      } finally {
        active = prev;
      }
    },
    stop() {
      e.disposed = true;
      cleanup(e);
    }
  };
  collecting?.push(e);
  e.run();
  return e;
}
function collect(fn) {
  const previous = collecting;
  const created = collecting = [];
  try {
    fn();
  } finally {
    collecting = previous;
  }
  return created;
}
function cleanup(e) {
  for (const subs of e.deps) subs.delete(e);
  e.deps.length = 0;
}
export {
  collect,
  effect,
  reactive
};
