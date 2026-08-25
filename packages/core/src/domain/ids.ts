import { nanoid } from "nanoid";

export function createId(prefix?: string): string {
  const id = nanoid();
  return prefix ? `${prefix}_${id}` : id;
}
