# Friends overhaul

Status: **mock-ups drawn 2026-11-24, waiting for approval; not built.** Mock-ups:
the "LogIt friends overhaul — mock-ups" design canvas (Social, training now,
messages, groups, privacy).

Stories, training now, cheers, messages, groups with events, effort boards and
the privacy settings to go with them. Photo storage (step 1) is built separately.

## Decisions

**The rule for all of it (Martin, 23 Nov):** copy how Instagram does it rather
than invent our own. Where Instagram has nothing (groups, boards), copy the app
people know for it (Strava clubs, Facebook groups).

- **No separate "training partner" link.** People who follow each other are
  friends; Close friends is the inner circle. The old "Train with someone?" sheet
  becomes "Invite a friend" (link or QR).
- **Placement, as on Instagram.** Social gets a row of story circles above the
  feed (a ring for an unseen story, a green dot for training now) and a Messages
  button. Groups also show in Messages next to chats.
- **Stories** follow the account (public: anyone; private: approved followers),
  with Close friends and Hide story from. They last 24 hours and are made from a
  workout (a record, the whole workout) or a photo.
- **Training now** is Instagram's activity status: accounts you follow and people
  you message see it; one switch turns it off, and then you don't see others'.
- **Cheers** are story reactions: anyone who can see you training can send one,
  with one tap. A small pill and a light buzz mid-workout; a push straight away
  when the app is closed.
- **Messages** are Instagram's inbox: chats, groups and coach threads in one list.
  People you don't follow land in Requests.
- **Groups** (24 Nov) are a page first, like a Strava club or Facebook group:
  a pinned note, upcoming events with Going, this week's board and members, with
  the group chat one tap away. A gym, team or club, joined by link or QR. Basic
  events come with groups; sport-specific parts (meet attempts) come from plugins.
- **Boards** score effort and consistency only (23 Nov): planned workouts done,
  weeks kept, volume against your own usual. Never raw strength. Friends and group
  members only. No medals, points or levels.
- **Privacy** (24 Nov) all sits under Settings › Privacy: private account, message
  controls, story and training now, comments, mentions, "Show me on boards" (off:
  you still see boards, nobody sees you; changeable per group and offered when
  joining a group), close friends, muted, blocked. Profile contents stay in
  Profile › Customise.
- **Notifications** follow the push rules already built: messages, cheers and
  coaching straight away; likes, comments and follows gathered.
- **Home cards** (24 Nov): Pinned meetup (pin an event to Home, else the next one
  you're going to, with a countdown), Friends (new stories, who's training now)
  and Social (latest unread). Each shows only when it has something and sits in
  the normal Customise home list.
- **The whole app is 16+** (23 Nov).

## Open

- Should "Show me on boards" start on (as drawn, like Strava) or off?
- My additions on the canvas, to confirm or drop: an event reminder the evening
  before (only for people going), photos in message requests blurred until
  accepted (Instagram does this).

## Build order

1. Photo storage (built: PR #116).
2. Friends: training now, cheers, Invite a friend, the Privacy hub.
3. Messages: chats, requests, message controls, photos in messages.
4. Stories: viewer, adding a story, audience settings.
5. Groups: page, events, chat, board, per-group settings.
6. Boards on Social, and the Home cards.
7. Federation (`docs/social-federation-design.md`).

## Rules so federation fits later

From the "Friends overhaul" section of `docs/social-federation-design.md`:

1. **Photos from another instance are stored by absolute address.** Local photos
   are `/photos/…`, which the apps resolve against their own server (`photoSrc`).
2. **Filter before sending, never after.** Anything a setting turns off is not
   sent anywhere (boards, training now, story audiences, read receipts).
3. **Every new item has a permanent id and a home instance**: stories, messages,
   groups, events, cheers, RSVPs. A group belongs to exactly one instance.
4. **Social writes go through one place on the server**, the point federation
   will deliver from.
