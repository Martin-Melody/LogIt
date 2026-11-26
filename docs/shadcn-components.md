# shadcn-svelte components: where they belong in LogIt

Survey of 2026-11-26 (main aea85d1), from Martin's list of shadcn-svelte components worth using.
Rule: PRODUCT.md principle 8 (check shadcn-svelte before building any UI piece).

Apps: **app** = `apps/clients/logit-frontend` (phone + web app), **web** = `apps/clients/logit-web`
(dashboard), **site** = `apps/clients/website` (getlogit.app). Counts are files or lines outside
`components/ui`, from grep, so treat them as rough.

Adding one: `cd apps/clients/<app> && npx shadcn-svelte@latest add <name>`, then restyle to DESIGN.md
(radius, 44px touch targets, Chalk Grey primary). Keep the look of `choice.ts`, sheets and Set row.

## Status (2026-11-26, branch docs/shadcn-first)

Section 1 is done: Spinner, Skeleton, Separator, Tabs (segmented + line looks), Table, Checkbox,
RadioGroup, Slider, Select / NativeSelect (web), DateField / TimeField, AlertDialog (web confirms).
`packages/ui/src/theme.css` maps shadcn's `data-open:`/`data-checked:`/`data-active:`/`data-horizontal:`
variants onto bits-ui's `data-state`/`data-orientation`, so components added with the CLI work as-is.
Left on purpose: the app's ConfirmDialog stays a bottom sheet (it must swipe down, principle 5);
filter chips that said `role="tablist"` wait for Toggle Group; tooltips go with the web power tools below.

## Web: design with these in mind

Some components on the list don't fit a current screen, but designing the web dashboard around them is
where the polish comes from (Martin, 2026-11-26): ⌘K Command (go + find + do), Context Menu on every row
that has a ⋯ menu, Hover Card on names, Breadcrumb on deep pages, Kbd + a shortcuts sheet, Tooltip on
icon-only buttons and sidebar items, Resizable in the plugin builder. Coaches first, then admins, then
everyone. Mock-ups: the "LogIt web: coach power tools" Design canvas.

## 1. Already installed, mostly not used (cheapest wins)

| Component | Where it's hand-rolled now | Notes |
|---|---|---|
| **Spinner** | app: 84 `<Loader2 class="animate-spin">` (auth, social, groups, settings, messages…) vs 1 use of `ui/spinner`. web: 1 | Same icon, adds `role="status"` + label. Mechanical swap. |
| **Tabs** | app: 10 hand-made `role="tablist"` (social feed, group, tag, profile, ExerciseView, foods, exercises, UserSearchSheet, ShareCardSheet, FoodSearchPanel). web: 18 (plugins, social, profile, messages, client page, payments, check-ins, library, ProgramEditor weeks, admin…) | Hand-made ones miss arrow-key moves and `aria-controls`. Two looks exist: underline and segmented; make both Tabs variants. |
| **Table** (web) | 20 raw `<table>`: sessions, plugins, habits, clients, coaching links/library, admin invites/subscriptions/discover/growth, QuestionDetail, PlanBilling, DaysGrid, DayEditor. 2 use `ui/table` | Pure markup swap. **Data Table** (TanStack) for the admin ones if they need sorting. |
| **Separator** | app: 18 `<hr>`/`h-px` (sessions, nutrition, splits, social, inbox, MusicSheet, CommentList, ProfileView…). web: 5 | Web has it installed, app needs `add separator`. |
| **Skeleton** | app: 22 `animate-pulse` blocks (nutrition, plans, insights, groups, events, messages, onboarding, PendingCard, invite sheets). web uses Skeleton 59× | App needs `add skeleton`. |
| **Select** | app: **8 native `<select>`**, which breaks principle 7 (exercises/[kind]/[id], clients check-in + program editors, AddMobilityDialog, NewLibraryItemSheet ×2, ExerciseView). web: 25 | Fix the app ones first (Android draws them as a radio dialog). Web: `add select`. |
| **Alert Dialog** | web: `window.confirm` in ProgramEditor (×3) and my-coach check-in leave guard. app: `ConfirmDialog` (70 uses) is built on Dialog | Rebuild `ConfirmDialog`'s inside on Alert Dialog (`role="alertdialog"`, no close on outside tap), same props. Leave guards: `nav.cancel()`, then `goto` after the dialog. |
| **Checkbox / Radio Group / Date Picker / Time** (app) | still native, against principle 7: 12 checkboxes (sounds, places, splits day, GoalEditor, MachineEditor, ImportExport, library…), 5 radios (places, SaveAsSplitDaySheet, WhereTodaySheet), `type="date"`/`time` in SessionEditor and the client program editor | `add checkbox`; RadioGroup/DateField/TimeField already exist. |
| **Tooltip** (web) | icon-only buttons with `title=` (3) and none at all on most icon buttons | Desktop only; on the phone, icon buttons get `aria-label` instead. |
| **Scroll Area** (web) | installed, 0 uses. Long `<pre>` logs in admin, DmChat message list | Only where the native scrollbar looks wrong. |

## 2. New components with a clear home

| Component | Where | Notes |
|---|---|---|
| **Slider** | app: volume in settings/sounds, MusicSheet (both `type="range"`) | sheetDrag already skips `input[type=range]`; give the Slider `data-no-sheet-drag`. |
| **Collapsible** | ~27 hand-made `aria-expanded` toggles. app: nutrition day, FoodNutrients, FoodEditor micros, SupersetGroup, CommentList + forum folds, groups events, settings account password form, privacy hidden list, clients, ShareRecipeSheet, SessionCalendar. web: archived habits/plans, PrivacyCard, Comments, forum, admin email help, ClientTraining | Gives the open/close animation for free (principle 5). |
| **Accordion** | app nutrition/nutrients (`open === r.id`, one open at a time) | That's exactly a single-type Accordion. |
| **Empty** | ~92 "No … yet" messages, each styled differently: sessions, splits, habits, inbox, messages, insights, exercises, goals, TodayWidget, clients… | One component = one look + an action button (principle: real buttons). |
| **Message + Bubble + Attachment** | app: messages/[relationshipId], messages/chat, MessageCard, MessagePhoto, VoiceMessage. web: DmChat.svelte (hand-built `m.mine ? self-end : self-start` rows, story replies, photos) | Bubble does grouping/reactions; Message does avatar/alignment. Attachment for the photo being sent ("Sending photo" box) and post attachments (NewPostSheet, PostAttachment). |
| **Input OTP** | web welcome: coach code "8 letters and numbers, like K7M2-Q9XH". app: onboarding/coach "Coach's code" field | Paste-friendly boxes with the dash built in. |
| **Questionnaire** | coach check-ins: app checkins/[scheduleId], web my-coach/checkin/[scheduleId]. Possibly onboarding (759 lines in onboarding/+page.svelte) | Step-by-step, skippable questions with progress. Needs dev dep `@shadcn-svelte/primitives`. Check-ins first; onboarding only if it keeps the 6 onboarding principles. |
| **Code Block** | web: plugin builder, admin plugins/diagnostics/server (cron + docker snippets people copy), PluginDetail, PluginPreview. site: open-source page, docs Demo.svelte. app: settings/diagnostics | Copy button + line numbers. Site already has `shiki` for highlighting. |
| **Combobox / Command** | web NamePicker and app ExerciseSearchInput: both hand-made "search box with a list, arrow keys, Enter adds" | That is Combobox (Command inside a Popover). |
| **Command** (+ **Kbd**) | web has no quick search. A ⌘K palette over clients, programs, plugins, settings would fit the dashboard | New feature, needs a mockup. Kbd also for "Ctrl+C" hints (PublishDialog). |
| **Popover** | NamePicker list, any "more info" bubble on web | Comes with Combobox. |
| **Calendar / Range Calendar / Date Picker** | app SessionCalendar (hand-made month grid with ChevronLeft/Right), web nutrition month grid, web 9 native `type="date"`. Insights RangePicker only has presets; Range Calendar could add a custom range | SessionCalendar draws streaks in the cells, so use Calendar's day snippet, not a plain swap. |
| **Breadcrumb** (web) | deep pages use "← Back" links (7 files): clients/[id]/checkins/[scheduleId], plan/programs, coaching programs, plugins/builder/[id], forum | Dashboard only; the app keeps back = previous screen. |
| **Navigation Menu** (site) | SiteHeader hand-made mobile menu (`aria-expanded`) | |
| **Sidebar** (site) | docs layout hand-made mobile sidebar (`mobileOpen`) | web already uses Sidebar. |
| **Resizable** (web) | plugin builder: code editor beside preview | |
| **Context Menu** (web) | DmChat messages and forum posts: right-click for reply/edit/delete/report | Phone keeps the long-press ActionSheet. |
| **Hover Card** (web) | @names and avatars in social, forum, comments → small profile card | Nice-to-have. |
| **Aspect Ratio** | VideoEmbed, CurrentPhotoWidget, story photos (`aspect-[9/16]` in DmChat, AddStorySheet, ProfileView) | Small cleanup. |
| **Toggle / Toggle Group** | 119 `aria-pressed` buttons in the app (segment/chip from choice.ts), 22 on web | Toggle Group adds arrow keys + roving focus. Keep choice.ts's look as the variants. |
| **Input Group** | search boxes with an icon inside (4 in the app), number boxes with a unit (kg, min, kcal) | |
| **Item** | list rows everywhere: settings rows, FollowList, EventRow, people rows, clients | Gradual, screen by screen; not worth a big-bang swap. |
| **Pagination** (web) | admin people/invites/subscriptions and the sessions table have none today | Only when those lists get long. |

## 3. Careful / later

- **Drawer** (vaul-svelte, already a web dependency): the app's sheets are `Dialog.Content sheet` + `sheetDrag`
  (sheet.ts, 26 files). Drawer does drag-to-dismiss itself. Swap the inside of the sheet and keep `handleBack`
  (back closes the newest sheet). Biggest and riskiest change here: phone test every sheet.
- **Carousel**: no current screen needs one. Candidates: multi-photo posts if D8 happens, website screenshots.
- **Chart**: both apps have it. Sparkline.svelte and goal charts are hand-drawn; check before adding new charts.
