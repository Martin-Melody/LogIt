# Testing social and notifications

Part of the persona plan (`docs/testing-personas.md`, P12 Social regular), written out in full
because every social feature involves at least two people and every notification has a trigger,
a recipient and several places it has to show up. Each journey is run by hand first (bug hunt,
findings in `docs/bug-hunt-findings.md`), then kept as a multi-account Playwright test so it
stays fixed.

## The cast

| | Who | Account · where | Settings |
|---|---|---|---|
| Ava | Posts a lot, PRs and photos | Pro · phone + web | public, in Discover |
| Ben | Follows Ava, comments, replies | Free · phone | public |
| Cara | Private account | Free · phone | private, hidden from Discover |
| Dev | Stranger; later blocked and reported | Free · phone | public |
| Ops | Admin | admin console | reviews Dev's report |

Two or three of them are signed in side by side (separate browsers), so "does the other person
see it, and how soon" is checked every time.

## Notifications: every trigger

Notifications are in-app only (the bell list and the unread badge; no phone push). For each row
check: the recipient gets exactly one, the text is right, tapping it opens the right place, the
badge counts it and clears when read, and **nobody is notified about their own action**.

| Type | Trigger | Recipient | Opens |
|---|---|---|---|
| Follow | Ben follows Ava (public) | Ava | Ben's profile |
| FollowRequest | Ben asks to follow Cara (private) | Cara | follow requests |
| FollowAccepted | Cara accepts Ben | Ben | Cara's profile |
| Like | Ben likes Ava's post | Ava | the post |
| Comment | Ben comments on Ava's post | Ava | the post, at the comment |
| Reply | Ava replies to Ben's comment | Ben | the post, at the reply |
| Mention | Ben writes @ava in a post or comment | Ava | the post |
| Repost | Ben reposts Ava's post | Ava | the post |
| Quote | Ben quotes Ava's post | Ava | Ben's quote |

Edge cases: like → unlike → like again (one notification, not three); ten likes from different
people (grouped or ten?); a deleted post's notifications (no dead link); a blocked person's
actions (none); a notification that arrives while the bell page is open; the badge on both the
phone and the web; reading on one device clears the other.

## Journeys

**S1 First post.** Ava makes an account, posts a PR from a finished workout and a text post
(photo posts don't exist yet, see finding 5.14).
Check: the feed shows both, the PR card has the right lift and weight, the photo loads on the
other person's phone, edit and delete work, deleting removes it everywhere.

**S2 Following and the feed.** Ben finds Ava (search, Discover, a shared link), follows,
sees her posts in his feed in the right order; infinite scroll; pull to refresh; unfollow
removes them; followers / following lists on both sides.

**S3 Talking.** Ben likes and comments, Ava replies, Ben likes the reply, both edit and delete
their own comments, neither can edit the other's; counts stay right after each step and after a
reload; @mentions link to the profile.

**S4 Reposts and quotes.** Ben reposts and quotes Ava; both show in Ben's followers' feeds;
deleting the original handles both.

**S5 Private account.** Cara is private: Ben sees only her name and "Request to follow";
request → accept → he sees everything; decline; Cara removes a follower; Cara goes public with
requests waiting; Cara is not in Discover.

**S6 Discover.** Suggestions for a new account, "Not interested", undo; Discover posts; someone
who hid themselves never appears. (Private and "show in Discover" are separate settings: a private
account can be suggested, and people ask to follow it.)

**S7 Safety.** Ava blocks Dev: neither sees the other's posts, comments or profile, existing
follows end, Dev's old comments on Ava's posts disappear for her, no notifications either way;
unblock. Ben reports Dev's post: Ops sees it in the admin console, deletes it, it disappears
for everyone.

**S8 Notifications end to end.** Every row of the table above, on phone and web, including the
badge clearing across devices.

**S9 Leaving.** Ava deletes her account: her posts, comments, likes and follows go; nobody is
left with a dead notification or a broken profile link.

## Also re-checked

The 2026-09-04 phone findings (`docs/bugs/social-smoke-test-findings.md`), still marked not
fixed: pull to refresh never wired up; the bell and badge not updating while the app is open;
"Sync now" not gated and reporting success when every push was refused; the "Connected" dot
meaning only "the API answers"; the "Coaching" label.

## Each round checks

Same as every persona round: works end to end; what one person does shows up right for the
other; nothing blank, scary or untrue on screen; console errors and failed requests.

## Decided 2026-11-22

- **Push notifications are wanted** (Martin): today a like or comment is only seen after opening
  LogIt. Needs Firebase Cloud Messaging on Android (a Firebase project linked to `logit-play`,
  `google-services.json` in the app, the server sending through FCM), a per-type on/off in
  Settings, and the Android 13+ notification permission asked at a sensible moment.
- First in round 5, from Martin's own use: notifications not arriving in the app, and follow
  status being wrong.
