# SEO plan

Started 2026-11-26. Covers getlogit.app (marketing site, docs, public Social pages) and
app.getlogit.app (the dashboard).

The idea: a new domain won't rank for "workout tracker". It can rank for specific things people
search for (an exercise, a calculator, a program, "Hevy alternative") and for the forum's own
threads. Step 1 makes sure Google can find and read everything we already have; steps 2–4 add the
pages people actually search for.

---

## Already live before this plan (#136, #138)

- Title, description and canonical on every page; one shared share image (`static/og.png`).
- Structured data on forum posts (`DiscussionForumPosting`) and social posts.
- Sitemaps for posts, profiles (only accounts that have posted) and groups, from the API.
- Invite, shared-algorithm and search pages are `noindex`.
- www → getlogit.app redirect; pages rendered on Cloudflare (forum ~190 ms, 16 KB).

## Step 1: the gaps (branch `feat/seo`)

- [x] `/sitemap.xml` is a sitemap index (pages, posts, profiles, groups); robots.txt points only to it.
- [x] `/sitemap-pages.xml`: home, pricing, docs, open-source, self-hosting… (51 pages), built from the
      route files, so new pages are listed without touching it.
- [x] Every docs page has a description. "Using LogIt" pages use the app's feature `summary`
      (`packages/core/src/guide/features.ts`); developer pages have `description:` in their frontmatter.
- [x] `/docs/plugins` renamed "Building plugins" (it shared the title "Plugins" with `/docs/add-plugins`).
- [x] Home page structured data: `MobileApplication` (Android, free) + `Organization`.
- [x] Empty pages kept out of search: profiles with no posts, tags on fewer than 3 posts, groups with no
      forum post and no upcoming event. The groups sitemap (API `/public/group-index`) uses the same rule.
- [x] app.getlogit.app and api.getlogit.app send `X-Robots-Tag: noindex` (Caddyfile).

## Step 2: free tools (mock up first)

Calculators people search for, each with "track this in LogIt":
- One-rep max (Epley/Brzycki, plus a % table).
- DOTS / Wilks score (DOTS is already `packages/core/src/domain/dots.ts`).
- Plates per side for a target weight.
- Calories and macros (maintenance, cut, bulk).

## Step 3: exercise and program pages (mock up first)

- `/exercises/<name>`: how to do it, muscles worked, machine versions, similar exercises. From the
  built-in catalogue. `HowTo` structured data.
- `/programs/<name>`: the built-in programs (`packages/core/src/domain/builtinPrograms.ts`) with the
  weekly layout and "Start this in LogIt".

## Step 4: comparison pages and share images

- Honest "Hevy alternative" / "Strong alternative" pages from `docs/research/tracking-apps.md`.
- Per-page share images (forum thread, post, profile, group) rendered on Cloudflare, so links shared on
  Instagram or WhatsApp show the actual post instead of the same picture.

## Martin: things only you can do

- [ ] **Google Search Console**: add `getlogit.app` as a domain property (TXT record in Cloudflare DNS),
      then submit `https://getlogit.app/sitemap.xml`. Without it we can't see what's indexed or why not.
- [ ] **Bing Webmaster Tools**: import from Search Console (also covers DuckDuckGo and Yahoo).
- [ ] **Play Store listing keywords** (store search, not web): for an Android-first app this likely
      brings more installs than the website.
- [ ] **Links from other sites**: awesome-selfhosted, AlternativeTo, GitHub topics on the repo.
- [ ] **Test content on prod**: the "test post" forum thread and the `hetznertest` / `martin-dev`
      profiles are in the sitemaps. Delete or make private what shouldn't be public.

## Checking it worked

- Search Console → Pages: indexed count should climb toward ~51 + social pages over a few weeks.
- `curl -sI https://app.getlogit.app/login | grep -i x-robots` shows `noindex` after the next deploy.
- https://search.google.com/test/rich-results on the home page and a forum thread.
