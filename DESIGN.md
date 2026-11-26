---
name: LogIt
description: A workout log that works out your next weight. Dark-first, monochrome slate, colour only where it means something.
colors:
  background: "oklch(0.145 0.01 260)"
  foreground: "oklch(0.92 0.01 260)"
  card: "oklch(0.18 0.01 260)"
  primary: "oklch(0.85 0.015 260)"
  primary-foreground: "oklch(0.18 0.01 260)"
  muted: "oklch(0.22 0.01 260)"
  muted-foreground: "oklch(0.65 0.015 260)"
  accent: "oklch(0.24 0.015 260)"
  border: "oklch(1 0 0 / 6%)"
  input: "oklch(1 0 0 / 10%)"
  ring: "oklch(0.6 0.02 260)"
  plan-blue: "oklch(0.746 0.16 232.661)"
  done-green: "oklch(0.765 0.177 163.223)"
  record-amber: "oklch(0.828 0.189 84.429)"
  destructive: "oklch(0.62 0.18 25)"
  macro-protein: "oklch(0.696 0.17 162.48)"
  macro-carbs: "oklch(0.769 0.188 70.08)"
  macro-fat: "oklch(0.645 0.246 16.439)"
typography:
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  number:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    fontFeature: "tnum"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  sheet: "16px"
  full: "9999px"
spacing:
  row-x: "12px"
  page-x: "16px"
  touch: "44px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 16px"
  button-outline:
    backgroundColor: "{colors.input}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "40px"
  set-input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.number}"
    rounded: "{rounded.md}"
    height: "40px"
  set-input-planned:
    backgroundColor: "{colors.background}"
    textColor: "{colors.plan-blue}"
    typography: "{typography.number}"
    rounded: "{rounded.md}"
    height: "40px"
  chip:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.full}"
    height: "44px"
    padding: "0 14px"
  chip-selected:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    height: "44px"
  segment-track:
    backgroundColor: "{colors.muted}"
    rounded: "{rounded.lg}"
    height: "44px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "12px 0"
---

# Design System: LogIt

## Overview

**Creative North Star: "The Training Log"**

LogIt looks like the notebook a serious lifter has kept for years: plain, tidy and all about their own numbers. Every screen answers "what did I do, and what do I do next?" in rows of weights and reps you can scan in a second between sets. Nothing on screen is there to look sporty or to get the app opened. The look comes from the numbers and the way they line up, not from decoration.

The palette is a cool slate monochrome, dark first. The primary colour is a pale grey, not a brand colour. Colour turns up only when it means something: blue for the plan, green for done, amber for a record, red for delete. The workout screen is a ledger: full-width sections with hairline dividers, a fixed column grid (set number, last time, kg, reps, tick), and last time printed beside this time on every row.

Density is moderate. The text is small (14px body, 12px secondary), but everything you tap is 40–44px, and the numbers you log are the largest and boldest things in a row. Components are plain and solid: flat grey surfaces, full-width buttons, a light-grey primary, almost no shadows.

When a mockup or new screen gets judged, the test is: **could this screen belong to another workout app?** If the answer is yes, it isn't LogIt yet. (Martin, 2026-11-23, on the Home + Workout mockups: "looked like another app".)

**Key Characteristics:**
- Monochrome slate, dark first; colour is meaning, never decoration.
- The workout is a table, not a stack of cards.
- Last time sits beside this time; history is always one glance away.
- Planned numbers are blue, what you actually did is white.
- Plain words, sentence case, no hype, no emoji.
- Flat surfaces, 44px touch targets, short motion that respects reduced-motion.

## Colors

A cool slate monochrome (hue 260, almost no chroma), with four meaning colours and nothing else.

### Primary
- **Chalk Grey** (`primary`): the main button fill (Start, Finish, Save) and selected chips. It's a pale grey with dark text, not a brand hue, which keeps the app sober. The round Start button in the bottom nav is the one place it's used big.

### Neutral
- **Gym Floor** (`background`): the page itself, near-black with a cool tint.
- **Log Page** (`card`): one step lighter, for cards, sheets and popovers.
- **Slate Step** (`muted`) / **Raised Slate** (`accent`): segment tracks, quiet fills, done set rows, hover.
- **Pencil Grey** (`muted-foreground`): secondary text, column headings, last-time numbers, icons at rest.
- **Hairline** (`border`, 6% white) and **Field Edge** (`input`, 10% white): dividers and input outlines. In dark mode, borders are barely there; spacing and tone separate things.
- **Chalk** (`foreground`): main text and the numbers you've logged.

### Meaning colours
- **Plan Blue** (`plan-blue`, the theme's `--info`): a number the app planned for you and you haven't changed yet. It shows as a blue placeholder in the kg and reps boxes and turns white once you type over it. Also the edge of a box that was re-planned mid-workout.
- **Done Green** (`done-green`, `--success`): done days on the week strip, a successful save, the answer row after a set.
- **Record Amber** (`record-amber`, `--highlight` / `--warning`): personal records, trophies, favourites, the streak flame, and warnings (a lighter plan).
- **Delete Red** (`destructive`): delete and discard only.
- **Macro colours** (`macro-protein`, `macro-carbs`, `macro-fat`): nutrition bars only, the same everywhere.

### Named Rules
**The Colour Means Something Rule.** Blue is the plan, green is done, amber is a record or a warning, red is delete. Never use them for decoration, and never bring in a new hue for a new feature.

**The Pale Primary Rule.** LogIt has no brand accent. Primary actions are pale grey on dark. A coloured primary button reads as another app.

The light theme in `packages/ui/src/theme.css` mirrors every token. It is the source of truth for both themes; the values here are the dark ones.

## Typography

**Font:** Inter (variable, bundled), falling back to system-ui.

**Character:** a single plain sans-serif. Hierarchy comes from weight and size, and the numbers use tabular figures so columns line up like a ledger.

### Hierarchy
- **Headline** (700, 24px, tight tracking): the one big name on a screen, like today's day on the Home Today card ("Upper"). 20px for smaller states ("Rest day").
- **Title** (600, 15px): exercise names, row titles, card titles, sheet section headings.
- **Body** (400, 14px): sentences, explanations, buttons (500).
- **Number** (600, 15px, tabular): kg and reps in the set boxes and anything you compare down a column.
- **Label** (400, 12–13px, Pencil Grey): last time, column headings (#, Last, kg, Reps), metadata. 11px for tags, day letters and the all-caps group labels.

### Named Rules
**The Tabular Rule.** Every number that can sit above or below another number uses tabular figures.

**The One Label Rule.** Groups in a list (Settings sections, "LAST WEEK · 4 WORKOUTS" in Sessions, "SUPERSET" in a plan) get one small all-caps label (11–12px, Pencil Grey, slight tracking). Card and page titles are sentence case ("Recent sessions", not "Recent Sessions"). Nothing else is all caps.

## Layout

- Phone first, one column, about 390px wide. Pages pad 16px at the sides; workout rows pad 12px.
- **The workout screen is full width.** Each exercise is a section across the whole screen, divided by a hairline, with a drag handle, a collapse chevron, the name with last time under it, a set count and a ⋯ menu. Sets are rows in a five-column grid: set number (2rem), last time, kg (5.5rem), reps (3.25rem), tick (2.75rem).
- Home and other screens stack cards with 12px gaps.
- The app header is the page title on the left and 44px icon buttons on the right. The bottom nav has five items with a raised round Start button in the middle.
- On wide screens (the web dashboard, settings), a sidebar appears and content sits in a max-width column.
- Touch floor: 44px for anything tapped mid-workout, 40px at the very least anywhere (decision D10).

## Elevation & Depth

Flat. Depth comes from tone (Gym Floor → Log Page → Slate Step) and hairlines, not shadows. Small shadows appear in two places only: the selected segment in a segmented control (`shadow-sm`), and the round Start button in the bottom nav (`shadow-lg`). Sheets rise from the bottom with a grab bar; they're separated by their lighter tone and a dimmed backdrop.

### Named Rules
**The Flat Floor Rule.** If a surface needs a shadow to stand out, use a lighter tone instead.

## Shapes

Gently rounded. The base radius is 10px; set boxes and buttons use 8px; cards use 14px; bottom sheets 16px at the top only. Chips are full pills, day dots on the week strip are circles, and the set tick is a circle. Nothing is sharp-cornered, and nothing is a blob.

## Components

Every component below is a shadcn-svelte component (or bits-ui, when shadcn-svelte has none) styled to these rules. Check shadcn-svelte before drawing or building a new one (PRODUCT.md principle 8, docs/shadcn-components.md).

### Buttons
- **Character:** plain and solid, sentence case, verb first ("Start Upper", "Add a set").
- **Primary:** Chalk Grey fill, dark text, 8px radius, 40px tall (44px for full-width page actions).
- **Outline / secondary:** transparent with a 10% white edge, or a Slate Step fill.
- **Add buttons** (Add a set, Warm-up ramp, Session note): a dashed outline with a plus, so they read as "add here" and not as content.
- **States:** a 3px ring on keyboard focus; 50% opacity when disabled. Every action is a real button, never a text link.

### Chips and segmented controls
- **Chips** (filters, wrapping choices, machines): 44px pills with a hairline edge and Pencil Grey text; selected = Chalk Grey fill with dark text.
- **Segmented** (theme, units, set type, a fixed row of options): a Slate Step track 44px tall; the selected option is raised in the page colour with a small shadow.

### Tags
- Small rounded tags (11px, 600, 6px radius, about 20px tall) say what changed: "+2 kg" (Slate Step fill), "Same weight" (Plan Blue tint), "−2.25 kg" (Record Amber tint), "First time" (hairline outline). They sit at the start of a one-line explanation ("A set goes up at 7 reps").

### Cards
- 14px radius, Log Page fill, hairline border, 12px vertical padding. Used on Home and lists, **not** for exercises inside a workout.

### Set row (signature component)
- The heart of LogIt. A five-column grid: set number (also the drag handle), last time in Pencil Grey, a kg box, a reps box, and a round tick.
- Boxes are 40px, 8px radius, page-coloured with a Field Edge outline, number type centred.
- **Planned values show as blue placeholders.** Type over them and they turn Chalk. A re-planned box gets a blue edge and the old number struck through underneath.
- A done set fills its tick and its row takes a faint Slate Step tint.
- Swipe left for set options; swipe right or tick to close.

### The workout screen (merged design, built 2026-11-23)
- **Stages:** the exercise you're on is lifted out as a card (Log Page fill, Field Edge border, 14px radius); finished ones fold to one line with what was done; the rest sit under a small "Up next" label, folded, their plan in Plan Blue (`stage.ts`).
- **Reason line:** a tag and one sentence ("+2 kg · A set goes up at 7 reps") as one full-width button with a chevron, opening Why this weight? (three numbers, then the steps).
- **Header:** minimise chevron, the day's name with "time · x of y sets", Finish, ⋮, and a 3px progress line along the bottom.
- **Bottom bar:** during a workout the nav steps aside for Add to workout and a music button; a running rest takes Add's place in the music bar's shape (−15 / +15 / Skip, the next set in blue). Minimised, the workout is a pill above the nav everywhere else.
- **Every block kind** (strength, superset rounds with A/B letters, mobility, cardio, plugin) uses the same header and the same row grammar; their settings live in the ⋯ sheet.

### Menu sheets
- One shape for every menu (`ActionSheet`): a title and subtitle, then 54px rows with an icon, a label and a value on the right; destructive rows in Delete Red. A row closes the sheet before it acts.

### Bottom sheets
- Everything that pops up mid-workout is a bottom sheet: 16px top corners, a grab bar, drag down to close, Android back closes the newest one, max 90% of the screen height.

### Navigation
- Five-item bottom nav (Home, Social, Start, Profile, More). The middle Start button is a raised Chalk Grey circle; when a workout is running it pulses, says "Resume" (or "Workout" while you're on it) and gets a green dot. Labels are 11px; the active item is Chalk, the rest Pencil Grey.

### Motion
- Short and plain: 140–220ms, ease-out (`reveal` 160ms, `popIn` 140ms, `sheetUp` 220ms in `src/lib/transitions.ts`). Things that appear or change animate; nothing bounces. Reduced-motion turns it all to instant.

## Do's and Don'ts

### Do:
- **Do** start a redesign from screenshots of the real screens and the real components in `packages/ui` and `src/lib/components`, then change only what the brief asks.
- **Do** show last time next to this time wherever a number is logged.
- **Do** keep the planned-in-blue, done-in-white convention for every block kind (strength, cardio, mobility, plugins).
- **Do** use the theme tokens (`bg-card`, `text-muted-foreground`, `text-info`) rather than raw Tailwind colours.
- **Do** keep everything tapped mid-workout at 44px.

### Don't:
- **Don't** design a screen that could belong to any other workout app. Generic fitness-app patterns (summary chips, coloured stat tiles, a stack of rounded exercise cards) are the anti-reference.
- **Don't** turn the workout's exercises into separate rounded cards; they're full-width sections of one log.
- **Don't** add a brand accent colour, gradients or glows.
- **Don't** add XP, levels, leagues or confetti-style rewards. The streak is a small amber flame with "10-week streak", the same wherever it appears.
- **Don't** use all-caps anywhere except the small group labels above lists.
- **Don't** add shadows to cards or rows.
