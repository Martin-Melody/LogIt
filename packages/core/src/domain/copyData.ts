/** A deep copy of plain data (programs, plans): JSON-shaped, so it also copies objects a UI
 * framework wrapped in a Proxy, which structuredClone refuses ("could not be cloned"). */
export function copyData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
