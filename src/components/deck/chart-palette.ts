/**
 * Chart colours for the deck, checked for colour-blind separation and contrast on a white
 * surface. Revenue is blue everywhere; its four streams are one blue ramp, darkest for the
 * main stream, so the order of the streams reads from the colour.
 */
export const SERIES_COLORS = {
  revenue: "#2a78d6",
  costs: "#eda100",
  profit: "#0e7a5a",
} as const;

export const STREAM_COLORS = {
  parser: "#104281",
  storage: "#256abf",
  ads: "#5598e7",
  subscriptions: "#86b6ef",
} as const;

export const CHART_INK = {
  grid: "#e3e9e6",
  baseline: "#b9c5bf",
  muted: "#5b6b64",
  surface: "#ffffff",
} as const;
