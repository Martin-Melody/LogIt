# LogIt's own plugins

Plugins LogIt publishes through the same mechanism as everyone else (not built into the
app), so each one is an example to copy. Ids start with `app.getlogit.`, which only admin
accounts can publish under, so apps can show them as LogIt's.

| Plugin | Family | What it does |
| --- | --- | --- |
| `app.getlogit.rounds` | workout-block | Timed rounds with rest and notes, for BJJ, wrestling, boxing and bag work |
| `app.getlogit.hangboard` | workout-block | Hangs with edge size, grip, added weight and time |
| `app.getlogit.boulder` | workout-block | Bouldering problems by grade: flashed, sent or a project, and tries |
| `app.getlogit.climbing-week` | widget | "Climbing this week": sessions, hardest send and flash, tries on projects (reads Bouldering blocks) |
| `app.getlogit.climbing-checkin` | question-pack | Check-in questions for climbers: finger pain, skin, project highpoint |

Together the last three are the coaching test case (canvas W9): a block clients log, a card a coach
puts on a client's Overview (+ Card) that only reads workouts the client shares, and questions for
their check-in form.

To publish one: sign in to the web app as an admin, Plugins › Build › New, pick its family,
use the folder name as the id, paste the file, then Publish. A listed release still goes
through review like anyone's.

`packages/core/src/plugins/firstParty.test.ts` checks every file here like the plugin builder does.
