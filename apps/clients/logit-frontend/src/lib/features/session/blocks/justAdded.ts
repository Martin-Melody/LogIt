/** Blocks added during the workout, so they open on arrival instead of collapsed (bug hunt 13.3).
 * Filled by the session builder's add, emptied by the block as it mounts. */
export const justAdded = new Set<string>();
