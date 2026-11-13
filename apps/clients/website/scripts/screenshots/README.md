# App screenshots for the website

The phone screens on logit.ie (`static/screens/*.webp`) are the real app, running in a browser in
dark mode with made-up sample data: "Alex" on an upper/lower split with 10 weeks of training,
3 weeks of food, bodyweight, habits and goals, plus a few fake lifters on the social feed.
Nothing here touches real data or the real API.

## 1. Start the app (and, for social screens, a throwaway API)

```bash
cd apps/clients/logit-frontend && npm run dev -- --port 5199
# social only, in another terminal: a local API with its own SQLite file
cd services/api/src/Logit.Api && DOTNET_ROLL_FORWARD=Major \
  ConnectionStrings__Default="Data Source=/tmp/logit-shots.db" \
  dotnet run --no-launch-profile --urls http://127.0.0.1:5119
```

## 2. Make the sample data

```bash
cd apps/clients/website/scripts/screenshots
node gen-seed.mjs          # writes seed.json (dates are relative to TODAY in the file)
node seed-social.mjs       # social only: users, follows, posts, likes, comments
```

`gen-seed.mjs` fixes `TODAY` and `START` near the top. Move them when regenerating so the
screens show current dates.

## 3. Capture

```bash
node capture.mjs out "/|home" "/sessions|sessions" "/progress|prog-list|click:Exercises;scroll:720" \
  "/session/current|workout|role:Start Lower B;role:Mark complete"
# social: log in to the local API first, in the same run
node capture.mjs out "/auth|login|click:Connect to a different server;fill:input[type=url]::http://127.0.0.1:5119;clickx:Save;wait:1000;fill:#username::alex;fill:#password::screenshot-pass-123;submit;wait:5000" "/social|feed"
```

Each run is a fresh browser. A workout started in one shot stays open in later shots of the
same run (the nav shows "Resume"), so capture the workout screen in a run of its own, last.

## 4. Put them on the site

```bash
python3 to-webp.py out home sessions workout feed feed-plugin=feed2
```

## Things that tripped this up before

- Diary days are stored under the id `nday_<YYYY-MM-DD>`, or the app doesn't find them.
- A habit's `icon` is shown as text, so it has to be an emoji.
- Split-day targets should be the current weights, or the workout suggests old ones.
- Random rep drops in the history make lifts show as "Regressing"; keep the history clean.
- The app ignores a preset API address on the sign-in screen; use "Connect to a different server".
