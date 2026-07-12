/**
 * Maps over items with at most `limit` in flight at once, preserving
 * input order in the result array regardless of completion order. Used
 * for batch imports so many exams can commit (Blob upload + DB write)
 * concurrently without unboundedly spiking network/connection-pool load.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
