# LogIt's own plugins

Plugins LogIt publishes through the same mechanism as everyone else (not built into the
app), so each one is an example to copy. Ids start with `app.getlogit.`, which only admin
accounts can publish under, so apps can show them as LogIt's.

| Plugin | Family | What it does |
| --- | --- | --- |
| `app.getlogit.rounds` | workout-block | Timed rounds with rest and notes, for BJJ, wrestling, boxing and bag work |
| `app.getlogit.weight-finder` | workout-block | Work up to the weight that fits, a jump at a time, with "how many more could you have done?"; each jump counts as a set of the lift |
| `app.getlogit.find-your-weights` | phase-pack | A first week of Weight finder on each lift; the program after it plans from what it found, once the coach checks it |
| `app.getlogit.hangboard` | workout-block | Hangs with edge size, grip, added weight and time |
| `app.getlogit.boulder` | workout-block | Bouldering problems by grade: flashed, sent or a project, and tries |
| `app.getlogit.climbing-week` | widget | "Climbing this week": sessions, hardest send and flash, tries on projects (reads Bouldering blocks) |
| `app.getlogit.climbing-checkin` | question-pack | Check-in questions for climbers: finger pain, skin, project highpoint |
| `app.getlogit.amrap-tm` | progression-algorithm | AMRAP training max: a four-week wave; the next cycle's max comes from the last set of week 3 |
| `app.getlogit.rep-total` | progression-algorithm | Rep total: reach, say, 50 pull-ups in as few sets as it takes; the total rises when you do |
| `app.getlogit.macros-by-weight` | nutrition-algorithm | Protein and fat in g per kg of body weight; carbs fill the rest |
| `app.getlogit.reverse-diet` | nutrition-algorithm | After a cut, a step above what you eat each week until weight starts to rise |
| `app.getlogit.diet-breaks` | nutrition-algorithm | During a cut, a week or two at maintenance every few weeks (counted from your first weigh-in) |
| `app.getlogit.carb-cycling` | nutrition-algorithm | More carbs on training days, fewer on rest days, the same weekly total |
| `app.getlogit.protein-days` | widget | Days within the protein target, week by week (reads `nutritionDays`) |
| `app.getlogit.kettlebell` | exercise-pack | Swings, snatches, get-ups, complexes and the rest, with muscles |
| `app.getlogit.calisthenics` | exercise-pack | Rings, levers, planches and their easier versions |
| `app.getlogit.strongman` | exercise-pack | Yoke, log, stones, farmer's walk, sandbag and more |
| `app.getlogit.desk-mobility` | mobility-pack | Neck, upper back, hips and wrists for people who sit all day |
| `app.getlogit.home-dumbbells` | program-pack | Three full-body days a week with dumbbells and a bench, eight weeks |
| `app.getlogit.meet-prep` | program-pack | Twelve weeks to a powerlifting meet; pairs with AMRAP training max |
| `app.getlogit.batch-cooking` | recipe-pack | Chilli, bolognese, curry, meatballs, dhal and bowls, made to portion |
| `app.getlogit.veg-high-protein` | meal-plan-pack | A vegetarian week at around 150 g of protein a day |
| `app.getlogit.studio-roster` | card-pack | Months with you, programs ending soon, new this month |
| `app.getlogit.roster-adherence` | card-pack | Every client's sessions against plan and check-ins on time, furthest behind first |

Not made yet, each waiting on something LogIt doesn't have: **Bodyweight ladder** (a progression
output that can change the exercise), **Check-in trends** and **Body recomposition** (a widget data
slice for check-in answers and measurements, and a decision on what a plugin may read from them),
**Powerlifting meet** (events and a meet date a plugin can read).

`packages/core/src/plugins/seedPlugins.test.ts` checks what the code ones do.

Together the last three are the coaching test case (canvas W9): a block clients log, a card a coach
puts on a client's Overview (+ Card) that only reads workouts the client shares, and questions for
their check-in form.

To publish one: sign in to the web app as an admin, Plugins › Build › New, pick its family,
use the folder name as the id, paste the file, then Publish. A listed release still goes
through review like anyone's.

`packages/core/src/plugins/firstParty.test.ts` checks every file here like the plugin builder does.
