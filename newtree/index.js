import routeModules from "virtual:core/routes";
import { registerStates, states, defineState } from "./states.js";
import { registerBehaviors } from "./behaviors.js";
import { start as startRouter, navigate, fail } from "./router.js";
import { onRoute, onScroll, onResize } from "./lifecycle.js";
import { reactive, effect } from "./reactive.js";
import { effect as effect2 } from "./reactive.js";
import { updateText } from "./text.js";
let initialization = null;

function initialize() {
  initialization ??= Promise.all([
    import("virtual:core/states"),
    import("virtual:core/behaviors"),
  ]).then(([stateModules, behaviorModules]) => {
    registerStates(stateModules.default);
    registerBehaviors(behaviorModules.default);
  });

  return initialization;
}

async function start(target = "#app") {
  const root = typeof target === "string" ? document.querySelector(target) : target;
  if (!root) throw new Error(`[core] nothing matches ${target}`);

  await initialize();

  return startRouter(root, routeModules);
}
export {
  defineState,
  effect,
  fail,
  navigate,
  onRoute,
  onResize,
  onScroll,
  reactive,
  start,
  states,
  updateText,
  effect2 as watch
};
