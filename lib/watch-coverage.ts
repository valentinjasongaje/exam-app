/**
 * Which parts of a video were actually played, as a bitmap of 10-second
 * stretches ("buckets"), stored base64 on StudyVideo.watchedBuckets.
 * Skipping ahead doesn't count; rewatching a part doesn't count twice.
 */
import { BUCKET_SECONDS } from "./watch-coverage-shared";
export { BUCKET_SECONDS };
/** Share of the video that must be played to count it as watched. */
export const AUTO_COMPLETE_SHARE = 0.9;

export function bucketCount(durationMinutes: number) {
  return Math.max(1, Math.ceil((durationMinutes * 60) / BUCKET_SECONDS));
}

export function decode(b64: string | null, n: number) {
  const bytes = new Uint8Array(Math.ceil(n / 8));
  if (b64) {
    const raw = Buffer.from(b64, "base64");
    bytes.set(raw.subarray(0, bytes.length));
  }
  return bytes;
}

export function encode(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

export function setBuckets(bytes: Uint8Array, indices: number[], n: number) {
  for (const i of indices) {
    if (Number.isInteger(i) && i >= 0 && i < n) bytes[i >> 3] |= 1 << (i & 7);
  }
}

export function countSet(bytes: Uint8Array, n: number) {
  let c = 0;
  for (let i = 0; i < n; i++) if (bytes[i >> 3] & (1 << (i & 7))) c++;
  return c;
}
