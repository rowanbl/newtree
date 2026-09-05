import { reactive, collect } from "./reactive.js";
import { env } from "virtual:core/env";
const states = {};
const factories = new Map();
const singletons = new Set();
const resets = new Map();
const stateEffects = new Map();
function defineState(name, value) {
  singletons.add(name);
  states[name] = reactive(value);
  return states[name];
}
defineState("route", { path: "/", params: {} });
defineState("error", { status: 0, message: "", details: null });
defineState("env", env);
function registerStates(modules) {
  for (const [file, mod] of Object.entries(modules)) {
    const name = file.split("/").pop().replace(/\.[^.]+$/, "");
    if (!mod || mod.default === void 0) {
      throw new Error(`[core] ${file} must \`export default\` an object, or a function returning one`);
    }
    if (typeof mod.default === "function") {
      if (mod.state?.resetOnEnter || mod.state?.resetOnLeave) {
        factories.set(name, mod.default);
        resets.set(name, normalizeReset(mod.state, file));
        const value = defineState(name, mod.default());
        activate(name, value);
        continue;
      }
      factories.set(name, mod.default);
      guard(name);
      continue;
    }
    if (mod.state?.resetOnEnter || mod.state?.resetOnLeave) {
      throw new Error(`[core] ${file} needs a default factory when route reset is configured`);
    }
    const value = defineState(name, mod.default);
    activate(name, value);
  }
}
function createScope(parent, names) {
  const scoped = Object.create(parent);
  const effects = [];
  for (const name of names) {
    const factory = factories.get(name);
    if (!factory) throw new Error(missing(name));
    const state = reactive(factory());
    Object.defineProperty(scoped, name, { value: state, enumerable: true, configurable: true });
    effects.push(...collect(() => ready(state)));
  }
  return {
    states: scoped,
    dispose() {
      for (const e of effects) e.stop();
    }
  };
}
function ready(state) {
  try {
    state.ready?.()?.catch?.((e) => console.error("[core] ready() failed", e));
  } catch (e) {
    console.error("[core] ready() failed", e);
  }
}
function activate(name, state) {
  stateEffects.get(name)?.forEach((entry) => entry.stop());
  stateEffects.set(name, collect(() => ready(state)));
}
function normalizeReset(config, file) {
  const list = (key) => {
    const value = config[key] ?? [];
    const paths = Array.isArray(value) ? value : [value];
    if (paths.some((path) => typeof path !== "string" || !path.startsWith("/"))) {
      throw new Error(`[core] ${file} ${key} needs an absolute path or list of absolute paths`);
    }
    return paths;
  };
  return { enter: list("resetOnEnter"), leave: list("resetOnLeave") };
}
function matches(pattern, path) {
  return pattern.endsWith("/*") ? path === pattern.slice(0, -2) || path.startsWith(pattern.slice(0, -1)) : path === pattern;
}
function routeStates(from, to) {
  for (const [name, config] of resets) {
    const entering = config.enter.some((pattern) => matches(pattern, to) && (!from || !matches(pattern, from)));
    const leaving = config.leave.some((pattern) => from && matches(pattern, from) && !matches(pattern, to));
    if (!entering && !leaving) continue;
    const target = states[name];
    const fresh = factories.get(name)();
    for (const key of Reflect.ownKeys(target)) if (!Object.hasOwn(fresh, key)) delete target[key];
    Object.assign(target, fresh);
    activate(name, target);
  }
}
function guard(name) {
  Object.defineProperty(states, name, {
    configurable: true,
    get() {
      throw new Error(
        `[core] states.${name} is scoped \u2014 add states="${name}" to an ancestor element`
      );
    }
  });
}
const missing = (name) => singletons.has(name) ? `[core] states="${name}" needs a factory: ${name}.js should \`export default () => ({ ... })\`` : `[core] states="${name}" \u2014 no ${name}.js in the states directory`;
export {
  createScope,
  defineState,
  registerStates,
  routeStates,
  states
};
