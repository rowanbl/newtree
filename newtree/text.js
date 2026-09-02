const STYLE_ID = "newtree-text";
const DURATION = 550;
const STAGGER = .3;
const EASING = "linear(0,.1052,.3155,.532,.7112,.8414,.9265,.9765,1.0023,1.013,1.0151,1.0133,1.01,1.0068,1.0041,1.0022,1.001,1)";
let segmenter;

const styles = `
.nt-text{position:relative;display:inline-grid;max-width:100%;vertical-align:baseline;line-height:inherit}
.nt-text-run{grid-area:1/1;display:block;width:max-content;max-width:100%;justify-self:var(--nt-text-edge,start);white-space:pre-wrap;overflow-wrap:anywhere;pointer-events:none}
.nt-text-unit{display:inline-block;transform-origin:center}
.nt-text-unit.nt-text-in,.nt-text-unit.nt-text-out{animation-duration:${DURATION}ms;animation-timing-function:${EASING};animation-fill-mode:both;animation-delay:var(--nt-delay,0ms)}
.nt-text-unit.nt-text-in{animation-name:nt-text-in}
.nt-text-unit.nt-text-out{animation-name:nt-text-out}
.nt-text-run.nt-text-leaving{position:absolute;inset-block-start:0}
.nt-text-run.nt-text-leaving .nt-text-unit:not(.nt-text-out){visibility:hidden}
@keyframes nt-text-in{from{transform:translateY(.1em) scale(.88);opacity:0;filter:blur(.08em)}to{transform:none;opacity:1;filter:blur(0)}}
@keyframes nt-text-out{from{transform:none;opacity:1;filter:blur(0)}to{transform:translateY(-.1em) scale(.88);opacity:0;filter:blur(.08em)}}
@media(prefers-reduced-motion:reduce){.nt-text-unit{animation:none!important}}
`;

function installStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = styles;
  document.head.append(style);
}

function split(value) {
  const text = String(value ?? "");
  segmenter ??= typeof Intl !== "undefined" && Intl.Segmenter
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : false;
  return segmenter ? [...segmenter.segment(text)].map(({ segment }) => segment) : Array.from(text);
}

function sharedEdges(previous, next) {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
  let end = 0;
  while (end < previous.length - start && end < next.length - start && previous.at(-1 - end) === next.at(-1 - end)) end++;
  return { start, end };
}

function run(units, state = "", start = 0, end = units.length) {
  const node = document.createElement("span");
  node.className = `nt-text-run${state === "out" ? " nt-text-leaving" : ""}`;
  node.setAttribute("aria-hidden", "true");
  const changedCount = Math.max(0, end - start);
  const sweep = DURATION * STAGGER * Math.max(changedCount - 1, 0) / (changedCount || 1);
  units.forEach((unit, index) => {
    if (/^[\r\n]+$/.test(unit)) {
      node.append(document.createElement("br"));
      return;
    }
    const span = document.createElement("span");
    const changed = index >= start && index < end;
    span.className = `nt-text-unit${changed && state ? ` nt-text-${state}` : ""}`;
    const position = Math.max(0, index - start);
    const delay = changedCount > 1 ? sweep * position / (changedCount - 1) : 0;
    span.style.setProperty("--nt-delay", `${delay}ms`);
    span.textContent = unit;
    node.append(span);
  });
  return node;
}

function stopSizeAnimation(element) {
  element.__ntTextAnimation?.cancel();
  element.__ntTextAnimation = null;
  if (element.__ntTextFlexShrink === undefined) return;
  element.style.flexShrink = element.__ntTextFlexShrink;
  delete element.__ntTextFlexShrink;
}

/** Update an element's text, preserving shared graphemes and rolling only its changed run. */
export function updateText(element, value, { animate = true } = {}) {
  installStyles();
  const nextValue = String(value ?? "");
  const previousValue = element.__ntTextValue ?? element.textContent ?? "";
  if (nextValue === previousValue) return;
  const previous = split(previousValue);
  const next = split(nextValue);
  const { start, end } = sharedEdges(previous, next);
  const outgoing = previous.slice(start, previous.length - end);
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const previousBox = element.getBoundingClientRect();
  const generation = (element.__ntTextGeneration ?? 0) + 1;
  element.__ntTextGeneration = generation;
  stopSizeAnimation(element);

  element.__ntTextValue = nextValue;
  element.setAttribute("aria-label", nextValue);
  element.classList.add("nt-text");
  const incomingEnd = next.length - end;
  const current = run(next, animate && !reduce ? "in" : "", start, incomingEnd);
  element.replaceChildren(current);
  const nextBox = element.getBoundingClientRect();
  const leftTravel = Math.abs(nextBox.left - previousBox.left);
  const rightTravel = Math.abs(nextBox.right - previousBox.right);
  const alignment = getComputedStyle(element).textAlign;
  const fallbackEdge = alignment === "center" ? "center" : /^(right|end)$/.test(alignment) ? "end" : "start";
  const currentEdge = element.style.getPropertyValue("--nt-text-edge") || fallbackEdge;
  const edge = Math.abs(leftTravel - rightTravel) < .5 ? currentEdge : rightTravel < leftTravel ? "end" : "start";
  element.style.setProperty("--nt-text-edge", edge);
  const sizeChanged = Math.abs(previousBox.width - nextBox.width) > .5 || Math.abs(previousBox.height - nextBox.height) > .5;
  const changedCount = Math.max(outgoing.length, incomingEnd - start);
  const transitionDuration = DURATION + DURATION * STAGGER * Math.max(changedCount - 1, 0) / (changedCount || 1);
  if (animate && !reduce && previousBox.width && sizeChanged) {
    current.style.maxWidth = `${nextBox.width}px`;
    element.__ntTextFlexShrink = element.style.flexShrink;
    element.style.flexShrink = "0";
    const sizeAnimation = element.animate(
      {
        width: [`${previousBox.width}px`, `${nextBox.width}px`],
        height: [`${previousBox.height}px`, `${nextBox.height}px`],
      },
      { duration: transitionDuration, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" },
    );
    element.__ntTextAnimation = sizeAnimation;
    sizeAnimation.onfinish = () => {
      if (element.__ntTextGeneration !== generation) return;
      sizeAnimation.cancel();
      element.__ntTextAnimation = null;
      current.style.maxWidth = "";
      element.style.flexShrink = element.__ntTextFlexShrink;
      delete element.__ntTextFlexShrink;
    };
  }
  if (!animate || reduce || !outgoing.length) return;

  const leaving = run(previous, "out", start, previous.length - end);
  if (element.__ntTextAnimation) leaving.style.maxWidth = `${previousBox.width}px`;
  if (edge === "end") leaving.style.insetInlineEnd = "0";
  else if (edge === "center") {
    leaving.style.insetInlineStart = "50%";
    leaving.style.translate = "-50% 0";
  } else leaving.style.insetInlineStart = "0";
  element.append(leaving);
  const timeout = transitionDuration + 40;
  setTimeout(() => leaving.remove(), timeout);
}

const cycles = new Set();
let observingCycles = false;

function syncCycles() {
  for (const cycle of cycles) (document.hidden ? cycle.pause : cycle.resume)();
}

function pauseCycles() {
  for (const cycle of cycles) cycle.pause();
}

function observeCycle(cycle) {
  cycles.add(cycle);
  if (observingCycles) return;
  observingCycles = true;
  document.addEventListener("visibilitychange", syncCycles);
  window.addEventListener("pageshow", syncCycles);
  window.addEventListener("pagehide", pauseCycles);
}

function unobserveCycle(cycle) {
  cycles.delete(cycle);
  if (cycles.size || !observingCycles) return;
  observingCycles = false;
  document.removeEventListener("visibilitychange", syncCycles);
  window.removeEventListener("pageshow", syncCycles);
  window.removeEventListener("pagehide", pauseCycles);
}

/** Drive updateText from a pipe-separated list, with shared page lifecycle handling. */
export function cycleText(element) {
  let timer = null;
  let index = 0;
  let values = [];
  let delay = 2200;
  let first = true;
  let connected = false;
  let disposed = false;
  const pause = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const resume = () => {
    pause();
    if (!disposed && connected && !document.hidden && element.isConnected && values.length > 1)
      timer = setTimeout(() => {
        timer = null;
        index = (index + 1) % values.length;
        updateText(element, values[index]);
        resume();
      }, delay);
  };
  const lifecycle = { pause, resume };
  observeCycle(lifecycle);

  return {
    connect() {
      if (disposed) return;
      connected = true;
      resume();
    },
    update(value, nextDelay) {
      values = String(value ?? "").split("|").map((item) => item.trim()).filter(Boolean);
      delay = Math.max(0, Number(nextDelay) || 2200);
      index = Math.min(index, Math.max(0, values.length - 1));
      updateText(element, values[index] ?? "", { animate: !first });
      first = false;
      resume();
    },
    destroy() {
      disposed = true;
      connected = false;
      pause();
      unobserveCycle(lifecycle);
    },
  };
}
