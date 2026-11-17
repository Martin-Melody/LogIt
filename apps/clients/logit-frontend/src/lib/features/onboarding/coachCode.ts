/**
 * A coach's invite code from what was typed or scanned: the code itself, or an invite link
 * (".../c/DARA-B7KQ"). Null when there's nothing that looks like one.
 */
export function codeFromInvite(raw: string): string | null {
  const text = raw.trim();
  const fromLink = text.match(/\/c\/([A-Za-z0-9-]+)/);
  const code = fromLink ? fromLink[1]! : /^[A-Za-z0-9-]{4,}$/.test(text) ? text : null;
  return code ? code.toUpperCase() : null;
}
