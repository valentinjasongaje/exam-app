/**
 * Deterministic seeded shuffle. Given the same seed, always produces the
 * same order — so an attempt's question/choice order can be re-derived on
 * every render (start, resume, review) from a single stored integer
 * instead of persisting the shuffled order itself.
 */

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Derives an independent-looking sub-seed for a question's choice shuffle. */
export function choiceSeedFor(attemptSeed: number, questionOrder: number): number {
  return (attemptSeed + questionOrder * 2654435761) | 0;
}
