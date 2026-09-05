export const state = {
  resetOnEnter: ["/workspace"],
  resetOnLeave: ["/workspace/*"],
};

let creates = 0;

export default () => ({
  value: "clean",
  generation: ++creates,
});
