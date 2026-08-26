import { reactive, collect } from "./reactive.js";
import { env } from "virtual:core/env";
const states = {};
const factories = /* @__PURE__ */ new Map();
const singletons = /* @__PURE__ */ new Set();
function defineState(name, value) {
  singletons.add(name);
  states[name] = reactive(value);
  return states[name];
}
defineState("route", { path: "/", params: {} });
defineState("error", { status: 0, message: "", details: null });
defineState("env", env);
function registerStates(modules) {
  const created = [];
  for (const [file, mod] of Object.entries(modules)) {
    const name = file.split("/").pop().replace(/\.[^.]+$/, "");
    if (!mod || mod.default === void 0) {
      throw new Error(`[core] ${file} must \`export default\` an object, or a function returning one`);
    }
    if (typeof mod.default === "function") {
      factories.set(name, mod.default);
      guard(name);
      continue;
    }
    created.push(defineState(name, mod.default));
  }
  for (const state of created) ready(state);
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
  states
};
