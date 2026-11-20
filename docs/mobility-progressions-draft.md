# Mobility drill progressions

Status: drafted by Claude 2026-11-20, reviewed by Martin the same day (his answers below). Not built.
The links and cues are coaching judgements; change them freely as the data is built.

## How Progress will work

Progress (the default for mobility) becomes:

1. **Build each area up to about 10 minutes a week**, all its drills together (Martin: per area).
   Research: flexibility gains peak around 10 min of stretching a week per muscle group and don't
   grow past it (Ingram et al. 2024, *Sports Medicine*); how intense the stretch is didn't change
   the result, so the depth rating no longer holds progress back (it's kept as a note).
2. Then, in this order:
   - **Add load** if the drill takes it (loaded full-range training improves range of motion about
     as much as stretching: Alizadeh et al. 2023).
   - **A harder cue on the same drill**, one step at a time ("knee closer to the wall"). Martin:
     harder can just be a cue on the same drill.
   - **A harder drill.** A drill can have several (Martin: it's a tree, not a chain; Lizard pose is
     the start of many advanced stretches), so the card offers them and remembers the pick.
   - **Pick one yourself** from the same area when the catalog has nothing (your own drills,
     community packs, gaps), remembered as your next step.
3. **Same every time** (built, PR #100) and **Keep it the same** on a drill turn all of this off.

Data per drill: `takesLoad`, `harderCues: string[]` (in order), `harder: string[]` and
`easier: string[]` (drill ids, any number). Community mobility packs can declare the same.

## The drills

**Load** = can sensibly take added weight. **Harder cues** are steps on the same drill, in order.
**Harder / Easier** list drills already in the library; "not in the library yet" names ones to add.

### Hip flexors

| Drill | Easier | Harder | Load | Harder cues |
|---|---|---|---|---|
| Hip flexor lunge stretch | | Lizard pose, Couch stretch | no | Squeeze the back glute; reach the same-side arm up |
| Lizard pose | Hip flexor lunge stretch | Couch stretch, Pigeon pose, Frog stretch | no | Elbows down to the floor; back knee lifted |
| Couch stretch | Lizard pose, Standing quad stretch | | no | Knee closer to the wall; torso upright; hands off the floor |
| Standing hip flexor raise | | | yes (ankle weight) | Pause at the top |

Not in the library yet: front split (after Lizard and Couch).

### Adductors

| Drill | Easier | Harder | Load | Harder cues |
|---|---|---|---|---|
| Butterfly stretch | | Frog stretch, Pancake fold | no | Feet closer in; fold forward from the hips |
| Frog stretch | Butterfly stretch, Lizard pose | Pancake fold | no | Knees wider; hips back towards the heels |
| Pancake fold | Frog stretch, Butterfly stretch | | yes (plate held forward) | Legs wider; chest to the floor |
| Cossack squat | | | yes (goblet kettlebell) | Lower; heel down; pause at the bottom |

Not in the library yet: middle split.

### Hamstrings

| Drill | Easier | Harder | Load | Harder cues |
|---|---|---|---|---|
| Elephant walk | | Standing hamstring stretch | no | Straighter knees |
| Standing hamstring stretch | Elephant walk | Seated pike stretch, Jefferson curl | no | Foot higher; toes pulled back |
| Seated pike stretch | Standing hamstring stretch | Jefferson curl | yes (plate held) | Reach past the toes; flat back |
| Jefferson curl | Seated pike stretch | | yes (kettlebell, start light) | Stand on a box for more range |

Loaded spinal flexion: Jefferson curl only goes up in small jumps.

### Glutes

| Drill | Easier | Harder | Load | Harder cues |
|---|---|---|---|---|
| Seated figure-4 | | Pigeon pose | no | Lean forward |
| Pigeon pose | Seated figure-4, Lizard pose | | no | Front shin more parallel to the front; fold forward |

### Hips

| Drill | Easier | Harder | Load | Harder cues |
|---|---|---|---|---|
| Hip CARs | | | yes (ankle weight) | Slower; bigger circles |
| 90/90 hip switch | | Shin box get-up | no | Hands off the floor |
| Shin box get-up | 90/90 hip switch | | no | Without hands |

### Ankles and calves

| Drill | Easier | Harder | Load | Harder cues |
|---|---|---|---|---|
| Half-kneeling ankle rock | | Deep squat hold | yes (kettlebell on the knee) | Foot further from the wall |
| Deep squat hold | Half-kneeling ankle rock | | yes (goblet counterweight) | Heels down, feet narrower |
| Tibialis raise | | | yes (tib bar or plate) | Feet further from the wall |
| Straight-leg calf stretch | | Downward dog | no | Back foot further back |
| Downward dog | Straight-leg calf stretch | | no | Heels down; one leg at a time |

Not in the library yet: loaded calf stretch off a step.

### Quads

| Drill | Easier | Harder | Load | Harder cues |
|---|---|---|---|---|
| Standing quad stretch | | Couch stretch | no | Tuck the pelvis; knee behind the hip |

### Lower back

| Drill | Easier | Harder | Load | Harder cues |
|---|---|---|---|---|
| Cat-cow | | | no | Slower, one segment at a time |
| Child's pose | | | no | Walk the hands further; side reach |
| Sphinx / cobra | | | no | Sphinx, then cobra with straighter arms |
| Scorpion stretch | | | no | Foot further across |

Not linked: Child's pose → Jefferson curl (loaded flexion); a big step, not for everyone.

### T-spine

| Drill | Easier | Harder | Load | Harder cues |
|---|---|---|---|---|
| Open book | | Thread the needle, Bretzel stretch | no | Knee pinned down; follow the hand with the eyes |
| Thread the needle | Open book | Bretzel stretch | no | Reach further through; hold the end |
| Bretzel stretch | Thread the needle, Open book | | no | Pull the top heel in; shoulders flat |
| Thoracic rotation | | | no | Hips still; slower |

### Shoulders

| Drill | Easier | Harder | Load | Harder cues |
|---|---|---|---|---|
| Wall slides | | | no | Low back and wrists stay on the wall |
| Shoulder CARs | | | no | Slower; bigger circles |
| Band pass-throughs | | | no | Narrower grip |
| Doorway pec stretch | | | no | Arm higher; step through further |
| Sleeper stretch | | | no | Gentle only |
| Dead hang | | | yes (weighted belt) | Longer; one arm at a time when ready |

Not in the library yet: one-arm hang.

### Neck and wrists

| Drill | Easier | Harder | Load | Harder cues |
|---|---|---|---|---|
| Chin tucks | | | no | |
| Neck CARs | | | no | |
| Neck side stretch | | | no | |
| Wrist prep rocks | | | no | More weight over the hands |
| Wrist flexor stretch | | | no | Fingers pointing back |

Neck drills never get load or a harder suggestion; they keep the same holds once at 10 minutes.

### Full body

| Drill | Easier | Harder | Load | Harder cues |
|---|---|---|---|---|
| World's greatest stretch | | | no | Elbow to the floor; longer hold at the end |

## Martin's review (2026-11-20)

1. The chains look good, but it's a tree: one drill (Lizard pose) can be the start of many advanced
   stretches, so don't limit a movement to one easier and one harder. → `harder` / `easier` are lists.
2. "Takes load" is right.
3. Harder can definitely just be a cue on the same drill. → `harderCues`, offered before a new drill.
4. Per area is fine.
