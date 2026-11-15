/**
 * Photo preparation in the browser before upload, ported from Takatax2 (web/photo-prep): fix
 * rotation, shrink to 2,000 px, gently boost contrast, and measure blur, darkness and glare so
 * the app can ask for a retake before any upload or AI cost.
 *
 * The pixel math is pure and unit-tested; `preparePhoto` needs a browser (canvas).
 * Thresholds are starting points: tune them on real Filipino receipts.
 */

export const PHOTO_DEFAULTS = {
  maxEdge: 2000,
  quality: 0.85,
  analysisWidth: 512,
  contrast: true,
  minSharpness: 80,
  minBrightness: 70,
  maxGlare: 0.12,
};

export type PhotoFlag = "blurry" | "too_dark" | "glare" | "unreadable";

export const PHOTO_FLAG_TEXT: Record<PhotoFlag, string> = {
  blurry: "looks blurry",
  too_dark: "is too dark",
  glare: "has glare",
  unreadable: "could not be opened",
};

export interface Measurements {
  sharpness: number;
  brightness: number;
  glare: number;
}

/** RGBA bytes -> grayscale bytes (ITU-R BT.601 luma). */
export function toGray(rgba: ArrayLike<number>, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = ((rgba[p] ?? 0) * 299 + (rgba[p + 1] ?? 0) * 587 + (rgba[p + 2] ?? 0) * 114) / 1000;
  }
  return gray;
}

/** Variance of the Laplacian: high for sharp edges (text), low for blur. */
export function sharpness(gray: Uint8Array, width: number, height: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap =
        4 * (gray[i] ?? 0) -
        (gray[i - 1] ?? 0) -
        (gray[i + 1] ?? 0) -
        (gray[i - width] ?? 0) -
        (gray[i + width] ?? 0);
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Mean gray level, 0 (black) to 255 (white). */
export function brightness(gray: Uint8Array): number {
  let sum = 0;
  for (const value of gray) sum += value;
  return gray.length ? sum / gray.length : 0;
}

/** Share of near-white (blown out) pixels, 0 to 1. */
export function glareFraction(gray: Uint8Array, cutoff = 250): number {
  let n = 0;
  for (const value of gray) if (value >= cutoff) n++;
  return gray.length ? n / gray.length : 0;
}

export function qualityFlags(m: Measurements, options = PHOTO_DEFAULTS): PhotoFlag[] {
  const flags: PhotoFlag[] = [];
  if (m.sharpness < options.minSharpness) flags.push("blurry");
  if (m.brightness < options.minBrightness) flags.push("too_dark");
  if (m.glare > options.maxGlare) flags.push("glare");
  return flags;
}

/** Scales (w, h) down so the long edge is at most `maxEdge`. Never scales up. */
export function fitWithin(width: number, height: number, maxEdge: number): [number, number] {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

/** Gray levels at the 1% and 99% points, for the contrast stretch. */
export function contrastLevels(gray: Uint8Array, lowPct = 0.01, highPct = 0.99): [number, number] {
  const histogram = new Uint32Array(256);
  for (const value of gray) histogram[value] = (histogram[value] ?? 0) + 1;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  let foundLo = false;
  for (let v = 0; v < 256; v++) {
    acc += histogram[v] ?? 0;
    if (!foundLo && acc > gray.length * lowPct) {
      lo = v;
      foundLo = true;
    }
    if (acc >= gray.length * highPct) {
      hi = v;
      break;
    }
  }
  return [lo, hi];
}

/** Darkens faded print on light paper, in place. Skipped when it would not help. */
export function applyStretch(
  rgba: Uint8ClampedArray,
  lo: number,
  hi: number,
  maxGain = 2.5,
): boolean {
  const range = hi - lo;
  if (range >= 230 || range < 16) return false;
  const gain = Math.min(255 / range, maxGain);
  for (let p = 0; p < rgba.length; p += 4) {
    for (let c = 0; c < 3; c++) rgba[p + c] = 255 - (hi - (rgba[p + c] ?? 0)) * gain;
  }
  return true;
}

export interface PreparedPhoto {
  /** The file to upload: a re-encoded JPEG for photos, the original for PDFs. */
  blob: Blob;
  mimeType: string;
  flags: PhotoFlag[];
  measurements: Measurements | null;
  originalBytes: number;
  preparedBytes: number;
}

/** Prepares one file. PDFs and other non-images pass through untouched. */
export async function preparePhoto(file: File, options = PHOTO_DEFAULTS): Promise<PreparedPhoto> {
  const passThrough = (flags: PhotoFlag[] = []): PreparedPhoto => ({
    blob: file,
    mimeType: file.type || "application/octet-stream",
    flags,
    measurements: null,
    originalBytes: file.size,
    preparedBytes: file.size,
  });
  if (!file.type.startsWith("image/") || typeof createImageBitmap === "undefined")
    return passThrough();

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // For example HEIC on browsers that cannot decode it: upload as is, the server converts it.
    return passThrough(["unreadable"]);
  }

  const [aw, ah] = fitWithin(bitmap.width, bitmap.height, options.analysisWidth);
  const small = document.createElement("canvas");
  small.width = aw;
  small.height = ah;
  const sctx = small.getContext("2d", { willReadFrequently: true });
  if (!sctx) return passThrough();
  sctx.drawImage(bitmap, 0, 0, aw, ah);
  const gray = toGray(sctx.getImageData(0, 0, aw, ah).data, aw, ah);
  const measurements = {
    sharpness: sharpness(gray, aw, ah),
    brightness: brightness(gray),
    glare: glareFraction(gray),
  };

  const [w, h] = fitWithin(bitmap.width, bitmap.height, options.maxEdge);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d", { willReadFrequently: options.contrast });
  if (!ctx) return passThrough();
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const flags = qualityFlags(measurements, options);
  if (options.contrast && flags.length === 0) {
    const [lo, hi] = contrastLevels(gray);
    const image = ctx.getImageData(0, 0, w, h);
    if (applyStretch(image.data, lo, hi)) ctx.putImageData(image, 0, 0);
  }
  const blob = await new Promise<Blob>((resolve, reject) =>
    out.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode image"))),
      "image/jpeg",
      options.quality,
    ),
  );
  return {
    blob,
    mimeType: "image/jpeg",
    flags,
    measurements,
    originalBytes: file.size,
    preparedBytes: blob.size,
  };
}
