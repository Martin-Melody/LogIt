// What you bring (Phase 6.15, canvas EQ4): the kit that goes in your bag. The stack pin and dip
// belt change plans (more load past a stack, weight on pull-ups and dips); straps change how sets
// are compared; the rest are for the coach.
export const BRING = [
  { id: "pin", label: "Stack pin", text: "Loads plates past a machine's stack. Asked once per machine: some gyms don't allow it." },
  { id: "dip-belt", label: "Dip belt", text: "Weighted pull-ups and dips: the plan adds weight once bodyweight reps run out." },
  { id: "belt", label: "Lifting belt", text: "Noted for your coach. Doesn't change the plan." },
  { id: "straps", label: "Lifting straps", text: "Noted on your heavy pulls, so a strapped deadlift isn't compared with one without." },
  { id: "wraps", label: "Wrist wraps", text: "Noted for your coach." },
  { id: "sleeves", label: "Knee sleeves", text: "Noted for your coach." },
  { id: "bands", label: "Resistance bands", text: "Band-assisted pull-ups and band work at any gym." },
  { id: "ankle-strap", label: "Ankle strap", text: "Cable kickbacks and leg raises at any cable machine." },
] as const;
export type BringItem = (typeof BRING)[number]["id"];

export function parseKit(json: string | null | undefined): BringItem[] {
  try {
    const v = JSON.parse(json ?? "[]") as unknown;
    return Array.isArray(v) ? (v.filter((x) => BRING.some((b) => b.id === x)) as BringItem[]) : [];
  } catch {
    return [];
  }
}

/** "stack pin, dip belt, lifting straps". */
export const kitText = (kit: BringItem[]) => kit.map((k) => BRING.find((b) => b.id === k)!.label.toLowerCase()).join(", ");
