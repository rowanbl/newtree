import { expect, test } from "@playwright/test";

const fixture = "/tests/fixtures/text.html";

test.beforeEach(async ({ page }) => {
  await page.goto(fixture);
  await page.waitForFunction(() => window.newtreeText);
});

test("animates only the changed graphemes", async ({ page }) => {
  const changed = await page.evaluate(() => {
    const element = document.createElement("span");
    element.textContent = "fr";
    document.body.append(element);
    window.newtreeText.updateText(element, "fred");
    return [...element.querySelectorAll(".nt-text-in")].map((node) => node.textContent).join("");
  });

  expect(changed).toBe("ed");
});

test("entry and exit glyphs share timing without a doubled midpoint", async ({ page }) => {
  const result = await page.evaluate(() => {
    const element = document.createElement("span");
    element.textContent = "12 crunchwraps made";
    document.body.append(element);
    window.newtreeText.updateText(element, "4 websites built");
    const incoming = element.querySelector(".nt-text-in");
    const outgoing = element.querySelector(".nt-text-out");
    const inAnimation = incoming.getAnimations()[0];
    const outAnimation = outgoing.getAnimations()[0];
    const duration = inAnimation.effect.getTiming().duration;
    inAnimation.currentTime = duration / 2;
    outAnimation.currentTime = duration / 2;
    const inStyle = getComputedStyle(incoming);
    const outStyle = getComputedStyle(outgoing);
    return {
      inTiming: inAnimation.effect.getTiming(),
      outTiming: outAnimation.effect.getTiming(),
      midpointOpacity: Number(inStyle.opacity) + Number(outStyle.opacity),
      inOrigin: inStyle.transformOrigin,
      outOrigin: outStyle.transformOrigin,
      inWidth: incoming.offsetWidth,
      outWidth: outgoing.offsetWidth,
    };
  });

  expect(result.inTiming.duration).toBe(result.outTiming.duration);
  expect(result.inTiming.delay).toBe(result.outTiming.delay);
  expect(result.inTiming.easing).toBe(result.outTiming.easing);
  expect(result.midpointOpacity).toBeLessThanOrEqual(1.05);
  expect(Math.abs(Number.parseFloat(result.inOrigin) - result.inWidth / 2)).toBeLessThan(0.3);
  expect(Math.abs(Number.parseFloat(result.outOrigin) - result.outWidth / 2)).toBeLessThan(0.3);
});

test("contracts without undershooting and keeps a stable right edge", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:flex-end;gap:4px;width:600px";
    const element = document.createElement("span");
    element.textContent = "12 crunchwraps made";
    const suffix = document.createElement("span");
    suffix.textContent = "this year";
    row.append(element, suffix);
    document.body.append(row);

    const start = element.getBoundingClientRect().width;
    window.newtreeText.updateText(element, "4 websites built");
    const expected = element.querySelector(".nt-text-run:not(.nt-text-leaving)").getBoundingClientRect().width;
    const target = [...element.getAnimations()].find((animation) => animation.effect?.target === element);
    const samples = [];
    for (let time = 0; time <= 400; time += 16) {
      if (target) target.currentTime = time;
      const box = element.getBoundingClientRect();
      samples.push({ width: box.width, gap: suffix.getBoundingClientRect().left - box.right });
    }
    target?.finish();
    const end = element.getBoundingClientRect().width;
    return { start, end, expected, samples };
  });

  const floor = Math.min(result.start, result.end) - 0.75;
  expect(Math.min(...result.samples.map(({ width }) => width))).toBeGreaterThanOrEqual(floor);
  expect(Math.max(...result.samples.map(({ gap }) => Math.abs(gap - 4)))).toBeLessThan(0.75);
  expect(result.end).toBeCloseTo(result.expected, 0);
});

test("interrupted size transitions continue from the rendered width", async ({ page }) => {
  const result = await page.evaluate(() => {
    const element = document.createElement("span");
    element.textContent = "a considerably longer label";
    document.body.append(element);
    window.newtreeText.updateText(element, "short");
    const first = element.__ntTextAnimation;
    first.currentTime = 140;
    const rendered = element.getBoundingClientRect().width;
    window.newtreeText.updateText(element, "a medium label");
    const restarted = element.__ntTextAnimation;
    restarted.currentTime = 0;
    return { rendered, restarted: element.getBoundingClientRect().width };
  });

  expect(result.restarted).toBeCloseTo(result.rendered, 0);
});

test("multiline updates animate height without collapsing", async ({ page }) => {
  const result = await page.evaluate(() => {
    const element = document.createElement("span");
    element.style.maxWidth = "180px";
    element.textContent = "one line";
    document.body.append(element);
    const start = element.getBoundingClientRect().height;
    window.newtreeText.updateText(element, "one line\nsecond line\nthird line");
    const animation = element.__ntTextAnimation;
    const heights = [];
    for (let time = 0; time <= 400; time += 16) {
      animation.currentTime = time;
      heights.push(element.getBoundingClientRect().height);
    }
    animation.finish();
    return { start, end: element.getBoundingClientRect().height, heights };
  });

  expect(result.end).toBeGreaterThan(result.start * 2.5);
  expect(Math.min(...result.heights)).toBeGreaterThanOrEqual(result.start - 0.75);
});

test("a cycle mounted from a detached fragment starts and cleans up", async ({ page }) => {
  const labels = await page.evaluate(async () => {
    const fragment = document.createDocumentFragment();
    const element = document.createElement("span");
    element.textContent = "one";
    fragment.append(element);
    const cycle = window.newtreeText.cycleText(element);
    cycle.update("one|two|three", 40);
    document.body.append(fragment);
    cycle.connect();
    const seen = [element.getAttribute("aria-label")];
    for (let index = 0; index < 5; index++) {
      await new Promise((resolve) => setTimeout(resolve, 45));
      const label = element.getAttribute("aria-label");
      if (seen.at(-1) !== label) seen.push(label);
    }
    cycle.destroy();
    return seen;
  });

  expect(labels).toEqual(expect.arrayContaining(["one", "two", "three"]));
});
