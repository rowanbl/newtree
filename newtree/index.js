import routeModules from "virtual:core/routes";
import stateModules from "virtual:core/states";
import { registerStates, states, defineState } from "./states.js";
import { start as startRouter, navigate, fail } from "./router.js";
import { onRoute, onScroll, onResize } from "./lifecycle.js";
registerStates(stateModules);
import { reactive, effect } from "./reactive.js";
import { effect as effect2 } from "./reactive.js";
function start(target = "#app") {
  const root = typeof target === "string" ? document.querySelector(target) : target;
  if (!root) throw new Error(`[core] nothing matches ${target}`);
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
  effect2 as watch
};
