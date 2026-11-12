// Which view each group was last shown in ("By round" / "By exercise"), kept for the app's
// lifetime so the choice survives the group being re-mounted (a reorder, leaving the page).
export const groupViews = new Map<string, "rounds" | "exercises">();
