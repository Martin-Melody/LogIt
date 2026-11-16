/**
 * Does a widget's returned view use only the parts LogIt knows how to draw? The renderers
 * ignore what they don't understand, so without this a typo ("stat_grid") just shows an empty
 * card. The builder runs it on the preview output; problems name the exact path.
 */

const NODE_KINDS = new Set([
  "text",
  "stat-grid",
  "list",
  "progress-rings",
  "bar",
  "line",
  "muscle-map",
  "calendar-heatmap",
  "button-row",
  "checklist",
  "gauge",
]);

const HEADER_ICONS = new Set(["add", "edit", "prev", "next"]);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function checkWidgetAction(action: unknown, where: string): string[] {
  if (!isObj(action)) return [`${where}: an action must be an object`];
  const keys = Object.keys(action);
  if (keys.length !== 1) return [`${where}: an action has exactly one of navigate, startEmptyWorkout, startPlannedWorkout, resumeWorkout, cycleDay, toggleHabit`];
  const [key] = keys as [string];
  const value = action[key];
  switch (key) {
    case "navigate":
      return isStr(value) && value.startsWith("/") && !value.startsWith("//")
        ? []
        : [`${where}.navigate: must be a LogIt page like "/sessions"`];
    case "startEmptyWorkout":
    case "startPlannedWorkout":
    case "resumeWorkout":
      return value === true ? [] : [`${where}.${key}: must be true`];
    case "cycleDay":
      return value === 1 || value === -1 ? [] : [`${where}.cycleDay: must be 1 or -1`];
    case "toggleHabit":
      return isStr(value) && value.length > 0 ? [] : [`${where}.toggleHabit: must be a habit id`];
    default:
      return [`${where}: "${key}" isn't an action LogIt knows`];
  }
}

function checkNode(node: unknown, where: string): string[] {
  if (!isObj(node)) return [`${where}: must be an object`];
  const kind = node.kind;
  if (!isStr(kind) || !NODE_KINDS.has(kind)) {
    return [`${where}.kind: "${String(kind)}" isn't a part LogIt knows (${[...NODE_KINDS].join(", ")})`];
  }
  const p: string[] = [];
  const arr = (field: string): unknown[] => {
    const v = node[field];
    if (!Array.isArray(v)) {
      p.push(`${where}.${field}: must be a list`);
      return [];
    }
    return v;
  };
  switch (kind) {
    case "text":
      if (!isStr(node.text)) p.push(`${where}.text: must be text`);
      break;
    case "stat-grid":
      arr("stats").forEach((s, i) => {
        if (!isObj(s) || !isStr(s.label) || !isStr(s.value)) p.push(`${where}.stats[${i}]: needs a text label and a text value`);
      });
      break;
    case "list":
      arr("items").forEach((it, i) => {
        if (!isObj(it) || !isStr(it.label)) p.push(`${where}.items[${i}]: needs a text label`);
        else if (it.action !== undefined) p.push(...checkWidgetAction(it.action, `${where}.items[${i}].action`));
      });
      break;
    case "progress-rings":
      arr("rings").forEach((r, i) => {
        if (!isObj(r) || !isStr(r.label) || !isNum(r.value) || !isNum(r.max)) p.push(`${where}.rings[${i}]: needs a label and number value and max`);
      });
      break;
    case "bar":
      arr("bars").forEach((b, i) => {
        if (!isObj(b) || !isStr(b.label) || !isNum(b.value)) p.push(`${where}.bars[${i}]: needs a label and a number value`);
      });
      break;
    case "line":
      arr("points").forEach((pt, i) => {
        if (!isObj(pt) || !isNum(pt.x) || !isNum(pt.y)) p.push(`${where}.points[${i}]: needs number x and y`);
      });
      break;
    case "muscle-map":
      if (!isObj(node.values)) p.push(`${where}.values: must be an object of muscle → number`);
      break;
    case "calendar-heatmap":
      if (!isStr(node.month) || !/^\d{4}-\d{2}$/.test(node.month)) p.push(`${where}.month: must be "YYYY-MM"`);
      arr("days").forEach((d, i) => {
        if (!isObj(d) || !isNum(d.day) || !isNum(d.value)) p.push(`${where}.days[${i}]: needs number day and value`);
        else if (d.action !== undefined) p.push(...checkWidgetAction(d.action, `${where}.days[${i}].action`));
      });
      break;
    case "button-row":
      arr("buttons").forEach((b, i) => {
        if (!isObj(b) || !isStr(b.label)) p.push(`${where}.buttons[${i}]: needs a text label`);
        else p.push(...checkWidgetAction(b.action, `${where}.buttons[${i}].action`));
      });
      break;
    case "checklist":
      arr("items").forEach((it, i) => {
        if (!isObj(it) || !isStr(it.id) || !isStr(it.label) || typeof it.checked !== "boolean") {
          p.push(`${where}.items[${i}]: needs an id, a label and checked true/false`);
        } else if (it.action !== undefined) p.push(...checkWidgetAction(it.action, `${where}.items[${i}].action`));
      });
      break;
    case "gauge":
      if (!isStr(node.label) || !isNum(node.value) || !isNum(node.target)) p.push(`${where}: a gauge needs a label and number value and target`);
      break;
  }
  return p;
}

/** Problems with a widget's view; empty when LogIt can draw all of it. */
export function checkWidgetView(view: unknown): string[] {
  if (!isObj(view)) return ["compute() must return an object like { title, body: [...] }"];
  const p: string[] = [];
  if (!isStr(view.title) || view.title.trim() === "") p.push("title: needs some text");
  if (!Array.isArray(view.body)) p.push("body: must be a list of parts (can be empty)");
  else view.body.forEach((n, i) => p.push(...checkNode(n, `body[${i}]`)));
  if (view.action !== undefined) p.push(...checkWidgetAction(view.action, "action"));
  if (view.empty !== undefined) {
    if (!isObj(view.empty) || !isStr(view.empty.text)) p.push("empty: needs text");
    else if (view.empty.action !== undefined) p.push(...checkWidgetAction(view.empty.action, "empty.action"));
  }
  if (view.headerActions !== undefined) {
    if (!Array.isArray(view.headerActions)) p.push("headerActions: must be a list");
    else
      view.headerActions.forEach((h, i) => {
        if (!isObj(h) || !isStr(h.icon) || !HEADER_ICONS.has(h.icon) || !isStr(h.label)) {
          p.push(`headerActions[${i}]: needs an icon (add, edit, prev or next) and a label`);
        } else p.push(...checkWidgetAction(h.action, `headerActions[${i}].action`));
      });
  }
  if (view.swipe !== undefined) {
    if (!isObj(view.swipe)) p.push("swipe: must be { left, right }");
    else p.push(...checkWidgetAction(view.swipe.left, "swipe.left"), ...checkWidgetAction(view.swipe.right, "swipe.right"));
  }
  return p;
}
