export async function asyncMap<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R> | R
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i++) out.push(await fn(items[i]!, i));
  return out;
}
export async function asyncFilter<T>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<unknown> | unknown
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < items.length; i++) if (await fn(items[i]!, i)) out.push(items[i]!);
  return out;
}
export async function asyncFind<T>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<unknown> | unknown
): Promise<T | undefined> {
  for (let i = 0; i < items.length; i++) if (await fn(items[i]!, i)) return items[i];
}
export async function asyncSome<T>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<unknown> | unknown
) {
  return (await asyncFind(items, fn)) !== undefined;
}
export async function asyncEvery<T>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<unknown> | unknown
) {
  for (let i = 0; i < items.length; i++) if (!(await fn(items[i]!, i))) return false;
  return true;
}
export async function asyncFlatMap<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<readonly R[]> | readonly R[]
): Promise<R[]> {
  return (await asyncMap(items, fn)).flat();
}
export async function asyncForEach<T>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<unknown> | unknown
): Promise<void> {
  for (let i = 0; i < items.length; i++) await fn(items[i]!, i);
}
