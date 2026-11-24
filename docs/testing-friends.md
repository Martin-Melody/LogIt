# Testing the friends overhaul

The friends overhaul (`docs/friends-overhaul.md`) is one web of features that all lean on the
same follows, blocks and privacy switches: a cheer depends on training now, training now on
follows and "Show when you're training", a story on the account's privacy and Close friends,
a board on "Show me on boards". This plan is written before each part is built, so every part is
checked against the same flows and the same ethos, and each journey becomes a multi-account
Playwright test once it passes by hand. It extends `docs/testing-social.md` (P12 Social regular in
`docs/testing-personas.md`).

## The ethos check (every screen, every feature)

A feature passes only if all of these hold. Most come from `PRODUCT.md`; the rest are the
decisions of 23–24 Nov.

1. **Copied, not invented.** It works the way Instagram does it (Strava clubs or Facebook groups
   where Instagram has nothing). A rule nobody asked for is a finding.
2. **Taps you on the shoulder only when a person did something for you, or your own plan says
   it's time.** Never "X is training, go train", streaks, "come back", or anything sent to get the
   app opened. A push says who and what, never the content. Likes, comments, follows are gathered;
   messages, cheers and coaching arrive straight away; quiet mode and Pause all are honoured.
3. **Private by default where it matters, and nothing leaves unless the person chose it.**
   Filtered before sending, never after (federation rule 2). A private account, a block, every
   switch in Settings › Privacy holds on every screen and in every push, on phone and web.
4. **Effort, not strength.** Boards score planned workouts done, weeks kept, volume against your
   own usual. No raw weights, no medals, points, levels or confetti.
5. **Looks and behaves like LogIt.** Our own components (PRODUCT.md principle 7), real buttons,
   everything that changes animates, every sheet swipes down, back goes to the previous screen,
   44 px targets mid-workout. Could this screen belong to another app? Then it isn't done.
6. **Works offline and self-hosted.** Nothing breaks without a connection; what can't happen
   offline says so plainly. A self-hosted server does the same, pushes through the relay if its
   admin turned it on.
7. **Fits federation later** (the four rules in `docs/social-federation-design.md`): permanent
   ids and a home instance for new items, photos from other servers by absolute address, social
   writes through one place.
8. **16+.** Nothing here assumes or shows to under-16s; the age line holds at sign-up.

## The cast

| | Who | Account · where | Settings |
|---|---|---|---|
| Ava | Trains 4 days a week, posts stories | Pro · phone + web | public |
| Ben | Ava's friend; they follow each other | Free · phone | public |
| Cara | Private account; follows Ava | Free · phone | private, training now off |
| Dev | Stranger who messages people; later blocked | Free · phone | public |
| Conor | Runs Iron Club (organiser) | Pro · phone + web | public |
| Niamh | Ava's coach | Studio · web + phone | public |
| Sam | On a self-hosted server, relay on | own server · phone | public |
| Ops | Admin | admin console | reviews reports |

Two or three are signed in side by side (separate browsers or the emulator plus a browser), so
"does the other person see it, and how soon" is checked every time.

## Who sees what: the wiring table

Each cell is what must happen. A journey checks a row; the privacy sweep (F9) checks a column.

| | Private account | Block | Their switch off | Your switch off | Quiet / Pause | Account deleted |
|---|---|---|---|---|---|---|
| **Training now** (green dot) | still shows to the accounts they follow | never, both ways | "Show when you're training" off: gone at once | yours off: you see nobody's | no effect (not a push) | gone |
| **Cheer** | allowed if you can see them training | impossible | "Cheers" off: refused, plainly | — | push held / dropped like any push; the pill still shows in the app | their cheers stay in your Inbox as "Deleted account" |
| **Story** | approved followers only | never | Hide story from / Close friends | — | — | gone at once |
| **Message** | message controls decide (requests) | never; existing thread hidden | "Don't receive" for others | read receipts off both ways | push held / dropped | thread stays, as "Deleted account" |
| **Group page, events, chat** | membership is what counts | blocked member's messages hidden for you | per-group notifications | — | group pushes held / dropped | leaves every group |
| **Board (group / friends)** | members / friends only | not on your board, you're not on theirs | "Show me on boards" off (global or this group) | — | — | gone from every board |
| **Home cards** | follow the rows above | follow the rows above | follow the rows above | card hidden in Customise | — | — |
| **Push** | follows the rows above | none | per-kind switches | — | held (quiet) / dropped (pause) | device tokens gone |

## Journeys

Each journey: steps, then what must be true. Run by hand first (findings into
`docs/bug-hunt-findings.md`), then as `tests/friends-*.spec.ts`.

**F1 Training now and cheers** (built: PR #118). Ben follows Ava; Ava starts Push A.
- Ben's Social shows Ava's circle with the green dot within a minute; Cara (Ava doesn't follow her)
  and Dev never do. Home's Friends card shows her too (when built).
- Ben taps it: "Ava is training · Push A · n min in", Cheer, View profile. Cheer → "Cheered Ava
  on"; a second tap changes nothing for Ava.
- Ava, in the workout: the pill "Ben is cheering you on", the cheer sound, a buzz; never over a set
  row or the rest bar. Three friends in a row: "Ben and 2 others".
- Ava's phone locked between sets for 25 minutes: her dot stays (finding F1-a below).
- Ava finishes: the dot goes within a minute everywhere. Ava discards instead: same.
- App closed: the cheer is a push ("Ben · is cheering you on"), only while she's still training.
- Switches: Ava turns "Show when you're training" off mid-workout → gone at once; Ben turns his
  off → he sees nobody; Ava sets Cheers to Off → Ben's Cheer says so; a block either way removes
  the dot and stops cheers.
- Offline: Ava trains offline → nobody sees her (fine); Ben cheers offline → a plain "Couldn't
  send that".

**F2 Invite a friend.** After her first workout Ava sees "Invite a friend" once; shares the link
and shows the QR. Ben (no app) opens the link → installs → signs up → they follow each other.
Ben with the app → straight to "Follow each other?" → yes. Cara (private) invites Ava: accepting
the invite counts as Cara's approval, so they follow each other at once. "Not now" never shows the sheet again;
Social › Find people always has it. No contacts uploaded.

**F3 Messages and requests.** Ben messages Ava → straight to her chats (she follows him). Dev
messages Ava → Requests, no push, no badge on Social; Ava accepts → it moves to chats and Dev
sees "Seen" only from then. Photo in a request stays blurred until accepted. Ava sets "Everyone
else: Don't receive" → Dev can't start a thread. Read receipts off → neither side sees "Seen".
Shared workout / record card opens the right thing. Niamh (coach) can always message Ava; her
thread shows "Coach". Block Dev → thread gone both ways. Push: who, never what; quiet mode holds
it; Pause drops it. Offline: a message waits and sends when back, with a visible "Not sent yet".

**F4 Stories.** Ava finishes a workout with a record → "Add to your story?" offered (only after a
record or the week's last workout, not every session). Your story vs Close friends. Ben sees the
ring, opens it, cheers or replies (reply = a message). Cara (private, Ava public) sees it; when
Ava is private, only approved followers. Hide story from Dev → Dev never sees it. 24 h later it's
gone everywhere, including from the Home Friends card and any message that quoted it.

**F5 Groups, events, chat.** Conor creates Iron Club, pins a note, adds "Deadlift day". Ava joins
from the QR: the join sheet shows what members see and "Show me on the board". Ava taps Going →
on the event's list; the Home meetup card appears with the countdown; Pin to Home picks another
event. Conor moves the time → one push to everyone going. Chat from the page and from Messages.
Per-group notifications: every message / events and mentions / off. Leave the group → off the
board, the going lists and the chat; Home card gone.

**F6 Boards.** The week's board: done of planned, weeks kept, volume against own usual; order by
share done then weeks. Ava with nothing planned this week shows as "Rest week", not at the bottom.
"Show me on boards" off globally → off every board, still sees them; on globally, off for Iron
Club → off only there. A beginner can top the board. Nobody's raw weights appear anywhere.

**F7 Home cards and customising.** Meetup / Friends / Social cards appear only when they have
something, in Customise the moment you join a group or follow someone. Edit Home in place: drag,
−, Add a card with previews; back leaves edit mode; order survives a restart and syncs to the
other phone (per account).

**F8 Notifications for friends.** Every new type through the push rules: cheer (straight away),
message (straight away), message request (none), event change (straight away to those going),
group chat (per-group setting), story reply (as a message). Quiet mode: held, one summary after;
a cheer held overnight is dropped, not summarised (a cheer is only useful mid-workout).

**F9 The privacy sweep.** Ava turns every switch in Settings › Privacy off / to its strictest one at
a time; Ben, Cara and Dev check every screen in the wiring table's column for that switch: Social
row, story ring, Messages, group page, boards, Home cards, pushes, the web dashboard.

**F10 Leaving and safety.** Block, report (a story, a message, a group, an event), leave a group,
delete an account: everything in the wiring table's last column, nothing dead left behind (no
broken avatar, no empty notification, no event "going" list with a ghost).

**F11 Self-hosted.** Sam's server: everything above works on his own server; pushes only with the
relay on; nothing reaches getlogit.app except a push's token and text.

**F12 Across servers** (after federation): Ava on getlogit.app follows Sam on his server; F1, F3,
F4 across the two; Close friends and expiry honoured; blocking and defederation remove everything.

**F13 Gym and PT pages** (once approved): "I train here" = joining the gym's group; members you
don't follow are a count; classes link out; the floor plan as My gym in a workout; asking a coach
shows the five sharing switches before anything is sent.

## Test layers

- **API tests** for every rule in the wiring table (who sees, who may act, what a switch removes),
  written with the feature (as `TrainingNowTests` for F1).
- **Unit tests** for the pure helpers (summaries, "n min in", board order).
- **Multi-account Playwright** per journey (`tests/friends-<journey>.spec.ts`), two or three
  contexts side by side, against a local self-hosted API, run in CI.
- **Phone run** per build step: the emulator with real Firebase pushes (the push PR's recipe) plus
  Martin's phone; locked screen, app closed, offline, quiet hours.
- **Ethos review** per PR: the eight checks above, written into the PR description.

## Findings so far

From checking PR #118 against F1 and F8 (both fixed on that PR):

- **F1-a** A phone that locks between sets stops the app's 5-minute refresh, so after 20 minutes
  the green dot disappears mid-workout. Fix: refresh whenever the app comes back to the front,
  and keep it fresh for 45 minutes.
- **F8-a** A cheer that arrives in quiet mode would be held and summarised the next morning
  ("1 cheer"), which is useless. Fix: a cheer push goes out only while the person is still
  training; otherwise it stays in the Inbox only.

## Decided (Martin, 24 Nov)

1. Deleted accounts in messages and cheers stay as "Deleted account" (Instagram's "Instagram user").
2. Accepting an invite from a private account counts as approving the follow (they chose to invite).
3. Someone with nothing planned this week shows on boards as "Rest week", not at the bottom.
4. The Home layout is per account and syncs between phones.
5. A blocked member's messages in a group chat are hidden for you only, as on Instagram.
6. Any group can add a place; a gym is a group with a place, not a separate kind.
