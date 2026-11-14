# Website design decisions (getlogit.app)

Decided 2026-11-13, after three rounds of homepage mockups. The mockups are on the Design canvas
"LogIt homepage directions" (claude.ai artifact XtUYa9XfEWW74NahsR1e8V); the approved one is artboard **K**.

## Who the site is for

- **LogIt is sold as a great workout app first.** Privacy and customising are the bonus, not the pitch.
- **Not aimed at developers.** Plugins, self-hosting and open source stay on the site, but low down and short,
  with links to `/docs` and `/open-source` for anyone who wants more. A terminal / code-editor look was tried
  (round 1, "Terminal") and rejected for reading as developer-first.

## Look

- **Same colours as the app, always.** The site uses the dark tokens from `packages/ui/src/theme.css` and
  nothing else. That is the point of the shared styling system. Round 2 tried warm amber, copper and a
  custom cyan palette and they were all rejected for not matching the app.
- **Inter**, from the same theme file. No second typeface.
- With the colours and font fixed, the character comes from **layout, scale and motion**: a very large tight
  headline (about 108 px on desktop, `-0.057em` tracking), real app UI, and a few deliberate animations.
- **Topographic lines stay** (the `topo-hero.svg` / `topo-tile.svg` from `scripts/topo/generate.mjs`), behind
  the hero and the header, and flipped behind the closing call to action.
- Themed "costume" looks were rejected: paper logbook, gym plates, Swiss scoreboard, serif journal.

## Copy

- **Don't state the obvious or explain the interface.** For example, "The blue numbers are your next workout"
  was rejected as insulting the reader's intelligence. Say what the app does in plain words and let the
  screens and widgets show the rest.
- Lifter vocabulary is fine without explaining it (AMRAP, RPE, 1RM, PPL, 5×5).
- The headline stays **"Log every set. Know the next one."**

## Homepage structure (top to bottom)

1. **Hero** (from mockup J): the header sits over the topographic lines; big left-aligned headline, one
   sentence, the Play badge and "iPhone: coming later". On the right, two phones (workout in front, session
   behind) rise in and are cut off by the bottom edge of the hero. On a phone only the front one shows.
2. **App widgets** (from mockup I): the app's own components rebuilt in Svelte with the shared tokens, not
   screenshots: a deadlift set block (set 1 ticks off, rest timer running), a PR card, the session stats card,
   the weekly streak, progression rows with sparklines, today's macros, and a goal date range. They animate
   when scrolled into view.
3. **"Built around your training week."** Three numbered steps joined by a line:
   01 Plan (Home screen), 02 Lift (a rebuilt circuit card and a cardio entry), 03 Look back (Sessions screen).
   Each has a heading, a paragraph and four concrete points. This replaced a clickable feature list whose
   first tab, "History", felt like it was thrown in without context.
4. **"And outside the gym."** Food, Habits and Friends cards, each topped with its screenshot.
5. **"Yours to keep, and to change."** Privacy, arranging the app, plugins, open source, in four short items.
6. **Plans** summary and **FAQ**, kept from the previous homepage.
7. **Closing call to action**: "Free on Android. No ads, no account." with the Play badge.

Removed from the previous homepage: the stats band (its facts are now in step 5), the five zigzag feature
sections, the large plugins section, the screenshot gallery, the "Everything LogIt does" grid and the
self-hosting code block. "Plugins" is no longer in the header nav.

## Motion

- Hero: headline, text and buttons rise in on load; the phones rise in a moment later.
- Widgets: staggered entrance when scrolled into view, then the set tick, rest bar, sparklines and macro
  bars play. Without JavaScript, or with reduced motion, everything shows in its final state.
- Nothing loops except the rest timer bar, which stops under reduced motion.

## Process

UI changes to the site (and the app) are mocked up first and approved before they are built.
