# Play Console — Content rating questionnaire (IARC)

App Content → Content ratings. Category: **Utility, Productivity, Communication,
or Other** (or "Health & Fitness" style — pick the non-game reference app type).

Answers:
- Violence — No
- Sexuality / nudity — No
- Profanity / crude humour — No
- Controlled substances (drugs, alcohol, tobacco) — No
- Gambling / simulated gambling — No
- Frightening / disturbing content — No
- User-generated content / user interaction: **YES**
  - The app has an optional social feed where users can post text and images and
    comment on each other's posts, and can search for and follow other users.
  - Content is not moderated in real time; users can report/block? — see below.
  - Users can share their location? — No.
  - Personal info shared with other users: username / display name and anything
    the user chooses to post.
- Digital purchases — **No** (no in-app purchases in the mobile app).
- Data collection/sharing — see data-safety.md.

Expected outcome: PEGI 3 / ESRB Everyone / "Rated for 3+", possibly with a
"Users interact" / "Shares info" notice because of the social feed.

## Gap to close before enabling the social feed prominently
Google requires apps with UGC to have: a content policy, in-app reporting of
objectionable content and users, and the ability to block users. Confirm the
in-app feed has report + block before submitting, or disable the social feed for
the first release. (Check: `src/routes/social/` — CommentSheet, post actions.)
