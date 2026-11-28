# Testing the coaching overhaul

The coaching overhaul was PRs #143–#186, merged as #187; section 12 covers the stack after it. This is the hand test before they merge: one
pass on the lab with two people, the coach on the web and phone, a client on the phone. Each
section says which PRs it covers, so a failure points at a branch. Tick as you go; write what
went wrong under the line.

## Setup

| | Who | Where |
|---|---|---|
| **Coach** | your own account (`martin`, Studio on the lab) | web `logit.melodyresidence.org` + dev APK |
| **Client** | a demo account (`ava_demo`; passwords in `~/.secrets/logit-lab-demo-accounts.txt`) | a second phone, or the web app in a private window |
| **Sample clients** | Coaching › Practise on sample clients | the coach's web app, Practice view |

- The lab runs Stripe in **test mode** (a `stripe-listen` container forwards payment events).
  Pay with card `4242 4242 4242 4242`, any future date, any CVC; `4000 0000 0000 0341` attaches
  and then fails on renewal. Connecting your Stripe account is your step (Stripe shows a captcha);
  in test mode, use test data where Stripe offers it.
- The phone shares the lab account, so whatever the web changes shows on the phone after a sync.
- Everywhere: real buttons, everything animates, sheets swipe down, back goes to the previous
  screen, right-click or ⋯ on every row, ⌘K reaches every page. A screen that breaks one of
  these is a finding.

## 1. Practice first (#146, #157, #184)

- [ ] Today shows "Practise on sample clients"; starting it fills Clients, Messages and
      check-ins with samples, marked as samples, kept apart from real clients.
- [ ] A sample client reacts while the web app is open (asks, answers a form).
- [ ] Leaving Practice leaves nothing behind in the real view.
- [ ] The walkthroughs (? menu) run start to finish on the web.

## 2. Profile, links and asking (#148–#150, #154)

- [ ] Coach: Profile has a Coaching section (about, packages, "Good fit for", taking clients,
      your questions, client limit and what happens when full).
- [ ] Today shows one "Set up coaching" card that ticks only real steps.
- [ ] Coach: Invite links → make one, download the QR poster, open it full screen.
- [ ] Client: open the link → the coach's profile, not a bare invite page. Ask → answer the
      coach's questions → sent. It shows in the client's Messages › Requests › Sent.
- [ ] Client already coached by someone: sees "You're coached by X", can still ask.

## 3. Answering a request (#151, #152, #155)

- [ ] Coach: the request is a conversation in Messages with a pinned card, and on Today under
      Decide.
- [ ] Offer a spot (no payment through LogIt) → client sees the offer, the agreement and the
      18+ line, takes the spot → is now a client.
- [ ] Also try: Waiting list, Not a fit (with and without block), edit / withdraw an offer,
      Closed filter → Reopen.
- [ ] Client limit reached → the profile says full and new asks go to the waiting list.

## 4. Forms and check-ins (#153, #176, #183)

- [ ] Coach: Check-ins › Forms → New form from a template; answer types include body weight,
      measurement and photos that save into the client's history.
- [ ] Start-up form arrives after the client starts; answers show on the client's Overview.
- [ ] Client sends a check-in on the phone. Coach: Today → Start reviewing → the queue, oldest
      first, with the client's week beside it (weight, lifts, food, habits).
- [ ] Reply with a saved reply (type `/`), Ctrl+Enter sends and goes to the next. J / K move,
      R replies. The client sees the reply as a check-in reply card.

## 5. Programs (#160–#168, #166)

- [ ] Programs › Programs: start from a LogIt template, build a week (supersets, circuits, a
      mobility drill), Every week, Rules (a progression rule, or a community one).
- [ ] Assign to the client → the phone shows it, today's day starts with the planned weights.
- [ ] Swap an exercise for the client "from now on"; swap from a message.
- [ ] Plan the next block; update the client's copy; their own changes survive.
- [ ] Replace a wrong program: history reads as if they'd been on the right one.
- [ ] A plugin block (e.g. Boulder) → the client is asked once to allow the coach's plugin.

## 6. Nutrition (#169–#173)

- [ ] Coach: Nutrition → a meal plan with training/rest day types, timed meals, a recipe.
- [ ] Give it to the client → their Nutrition tab, goal suggestion.
- [ ] Client phone: today's meals at their times, swap a food, log amounts, grocery list.

## 7. Messages and Today (#174, #175, #177, #178)

- [ ] Messages is one list (clients, DMs, requests) with All / Unread / Requests and a client
      panel on wide screens. Saved replies: add, edit, duplicate, delete.
- [ ] Today: Needs you grouped Review / Reply / Decide; the week ahead; on a Monday, Last week.
- [ ] Client page: five tabs; Overview as cards; + Card adds one; ⋯ menu has Send a form,
      Change package, Cards, Pause, End.
- [ ] Your month (Today ⋯ or ⌘K): wins, records, worth a look; Edit cards adds, removes,
      reorders and Standard layout puts them back.

## 8. Sending a month and the coach's phone (#179, #180)

- [ ] Coach: client Overview → month → Send it to the client. Client gets a push "… sent you
      your November" and the card opens Progress › Summary.
- [ ] Coach's phone: Clients shows Needs you; a check-in opens the quick sheet; reply with a
      saved reply; swap an exercise in their program.

## 9. Pause, end, away, leaving (#155, #156, #159, #143)

- [ ] Coach: Pause the client → check-ins stop, client sees a paused card. Resume.
- [ ] Away: set dates → clients see it on your profile and in their thread.
- [ ] End coaching → the client sees an ended card; Manage coaching on their side goes.
- [ ] Client stops coaching from their side → the coach sees it in the thread.
- [ ] Do **not** delete your own account on the lab; deleting with clients is covered by tests.

## 9b. Payments, Stripe test mode (#143, #152, #156)

- [ ] Coach: Payments → connect Stripe (test data) → make a package with a price.
- [ ] Offer a spot with that package → client takes it → Stripe Checkout (test card) → back in
      LogIt as a paying client; the coach gets "paid".
- [ ] Payments › Clients: the client's plan, next payment, Manage.
- [ ] Client: Manage coaching → update card / receipts open Stripe's page; Stop paying → runs
      to the end of the paid period.
- [ ] End coaching with a refund of the unused days → the refund shows in the client's receipts.

## 10. Plugins (#181, #182, #185)

- [ ] Coaching › Plugins lists only what coaches use; Community shows packs.
- [ ] Publish one seed as admin (Plugins › Build › New, id = folder name in
      `plugins/first-party`), e.g. `app.getlogit.roster-adherence`, install it, add its card in
      Edit cards. Try `app.getlogit.batch-cooking` in Nutrition › Recipes.
- [ ] A form pack (`app.getlogit.climbing-checkin`) appears as "From …" in the form editor.

## 11. Gates and menus (#183, #184, #144, #145)

- [ ] A Pro (not Studio) coach with real clients sees the "Studio ended" page, not errors.
- [ ] No browser-native selects, checkboxes or time inputs anywhere in coaching.
- [ ] Every row (clients, conversations, check-ins, cards, habits, plugins) has a right-click
      and ⋯ menu with the same items, and a key to open it.

## 12. After the merge: messages, invites, programs that start from the client (#188–#204)

The stack on top of main. Each line names its PR.

**Messages and invites (#188, #189)**
- [ ] Me › Messages: chips All / Friends / Coaches / Requests; a coach's conversation opens the
      coaching pane; My coach has a Message button, no chat. Phone: the same chips.
- [ ] Coach: ⋯ › Invite to coaching in a chat sends a card (headline, packages, an offer if picked).
- [ ] Profile › Messages sent for you: turn one on; ask as a client; it arrives marked "Sent automatically".

**Sets, estimates, wording (#190–#192)**
- [ ] A plugin block whose entries are sets (the Weight finder) shows in the exercise's history.
- [ ] A lift never logged starts from a related one ("From your deadlift 200 × 5"), on the light side.
- [ ] Programs › Progressions and › Swaps; nothing says "Rule" any more.

**Builder (#193–#197, #204)**
- [ ] Edit weeks: Deload, Test, your own type; the client's Home names the week.
- [ ] + Add: pick three curls, As a tri-set; drag the group by its grip; it stays a superset on the phone.
- [ ] Group header → settings (name, Circuit, rests); + Exercise into it; Ungroup.
- [ ] An exercise measuring Time (plank) runs as a timed hold on the phone; cardio intervals show as "Planned".
- [ ] ⋯ › Replace from week… and Only in some weeks…; Show: Week N; Every week shows "–" outside.
- [ ] See every week: an example lifter's numbers, Change their lifts, week types in the headings.
- [ ] An old program whose weeks differ now opens in the builder.

**Phases and starting points (#198–#200)**
- [ ] + Phase: Find your weights (week 1), then a progression. On the phone, week 1 runs each lift
      as the Weight finder ("How many more could you have done?").
- [ ] After week 1, Today › Decide: "… found their weights" → Check them → change one → Looks right.
- [ ] Taking a spot: "Your training from before" with the real count; off hides older workouts from the coach.
- [ ] Client › Training: Starting point (lifts, how they train, weekly sets, start-up answers, kit, experience).
- [ ] Assign to one client → Next: check it fits → swap one in their copy → Find your weights first.
- [ ] Phone: swapping asks why; the coach gets a message.

**How-tos (#201, #202)**
- [ ] A new lifter's Home: Before your first session; step through; Got it · next.
- [ ] In the workout: How to beside the name; the first-set hint says "Find your working weight".
- [ ] Programs › Exercises › How-tos: Write yours (a picture, a YouTube link with ?t=, cues, a note);
      the client's How to shows it; Use LogIt's puts it back. Builder: How-tos → Never hides them.

**Equipment (#203)**
- [ ] Phone: Settings › Workout › What you bring → stack pin on.
- [ ] A machine with no settings: when the plan asks for more than you've done, "Is X the most this
      machine goes?" → the machine editor, Past the top.
- [ ] At the top with the pin: Not today → this session at the top with more reps.
- [ ] Coach: client › Training shows "… outgrows their gym in week N · Decide"; pick a harder
      version; the phone shows it as the coach's plan at the top.

**Builder round 2 (#206)**
- [ ] A superset/tri-set header: kind, name, "3 rounds · … · same every week", Edit… opens the
      circuit-style dialog; switch to Circuit, set one exercise to 0:40, + round → saved and shown.
- [ ] Members: "8 reps each round"; each still opens on its own. Drag one out, in and within
      (grip), and Alt+↑/↓ does the same; a group left with one exercise stops being a group.
- [ ] + Add: pick two → As a circuit → its settings open; Save → a circuit with both.
- [ ] An old circuit block: Edit… turns it into a circuit of its exercises.
- [ ] Strength on a progression: Sets, Rep range, Rest (blank = theirs), Tempo, Warm-ups; no Load
      or per-set table. On Fixed: the set table and Calculate warm-ups (needs a kg load).
- [ ] No Measures or Each side on a bench press; Each side on a Bulgarian split squat.
- [ ] Mobility: Progression (theirs, LogIt's, Same every time, plugins).
- [ ] Swaps: the section follows the rule; the first list on Programs › Swaps asks once.
- [ ] Phone: a planned rest is the set's rest; blank uses their settings; Warm-ups Off drops them.

**Weeks as stretches (#207)**
- [ ] New program: name, 8 weeks, Weeks 1–3 Find your weights, + Next stretch → Hypertrophy 4–7
      on Adaptive, + Next stretch → Deload; Start building → the bar shows the three.
- [ ] The edge between two: drag it, or focus and ←/→; a stretch keeps at least a week.
- [ ] Click a stretch → its editor; widening it over another asks first ("Weeks 6–7 of Hypertrophy
      become Deload weeks"); Remove gives its weeks to the program's progression.
- [ ] Edit weeks lists stretches; + Stretch. Length + on a program whose last stretch ran to the end
      makes it longer.
- [ ] An old program (Full-Body) shows Find your weights · 2–3 · Deload · 5 · Test, nothing changed.
- [ ] Phone Home: "week 5 of 8 · Hypertrophy".

**Editing some weeks (#209)**
- [ ] Click the Deload in the bar: it's outlined; Editing says Week 4 · Deload; exercises that
      don't run then are listed under the day.
- [ ] ⋯ on Squat → Take out of week 4 → Every week shows Squat weeks 1–3 and 5–6; Add to week 4
      makes it one again.
- [ ] Swap for week 4… → Dumbbell bench in week 4 only. + Add while editing → "In: Week 4 / Every week".

**Find your max (#210)**
- [ ] A stretch → Find your max → the barbell lifts are ticked; Save → the bar says "Find your max".
- [ ] On the phone in that week: ticked lifts are a Max finder (three singles, "How much more was
      there?"), the others as usual.
- [ ] The week after: Today › Decide "… found their maxes" → started / now / %; Send puts it in the
      conversation; Done clears it.

**Numbers by stretch (#211)**
- [ ] Pick a stretch, open an exercise: change sets and reps → the table under it shows only that
      stretch changed; Every week says "differs by stretch".
- [ ] Change its progression while editing the stretch → only that stretch's row changes.
- [ ] Put the numbers back to every week's → "differs by stretch" goes.
- [ ] Phone, in that stretch: the workout has those sets and reps; See every week shows them.

## Findings

Write them here, with the section number.
