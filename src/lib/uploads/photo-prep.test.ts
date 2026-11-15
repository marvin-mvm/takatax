import { describe, expect, it } from "vitest";

import {
  PHOTO_DEFAULTS,
  applyStretch,
  brightness,
  fitWithin,
  glareFraction,
  qualityFlags,
  sharpness,
  toGray,
} from "./photo-prep";

const W = 120;
const H = 120;
const image = (fn: (x: number, y: number) => number) => {
  const gray = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) gray[y * W + x] = fn(x, y);
  return gray;
};

// Dark "text strokes" on paper, and the same page blurred.
const sharpText = image((x, y) => (y % 8 < 2 && x % 40 < 30 ? 30 : 220));
function blur(source: Uint8Array, radius: number) {
  const out = new Uint8Array(source.length);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy >= 0 && yy < H && xx >= 0 && xx < W) {
            sum += source[yy * W + xx] ?? 0;
            n++;
          }
        }
      out[y * W + x] = sum / n;
    }
  return out;
}

describe("photo checks", () => {
  it("scores sharp text far above a blurred copy", () => {
    const sharp = sharpness(sharpText, W, H);
    const blurred = sharpness(blur(sharpText, 4), W, H);
    expect(sharp).toBeGreaterThan(PHOTO_DEFAULTS.minSharpness);
    expect(blurred).toBeLessThan(sharp / 20);
  });

  it("flags dark and glary photos", () => {
    const dark = image(() => 40);
    const glare = image((x) => (x < 30 ? 255 : 200));
    expect(brightness(dark)).toBe(40);
    expect(glareFraction(glare)).toBeCloseTo(0.25, 2);
    expect(qualityFlags({ sharpness: 10, brightness: 40, glare: 0.3 })).toEqual([
      "blurry",
      "too_dark",
      "glare",
    ]);
  });

  it("converts colour to gray and fits photos within 2,000 px", () => {
    expect([...toGray(new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]), 2, 1)]).toEqual([76, 29]);
    expect(fitWithin(4000, 3000, 2000)).toEqual([2000, 1500]);
    expect(fitWithin(800, 600, 2000)).toEqual([800, 600]);
  });

  it("darkens faded print but leaves a well-exposed page alone", () => {
    const faded = new Uint8ClampedArray([150, 150, 150, 255, 230, 230, 230, 255]);
    expect(applyStretch(faded, 150, 230)).toBe(true);
    expect(faded[0]).toBeLessThan(100);
    expect(faded[4]).toBe(255);
    expect(applyStretch(new Uint8ClampedArray(8), 0, 255)).toBe(false);
  });
});
