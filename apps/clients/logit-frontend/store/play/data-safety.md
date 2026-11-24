# Play Console: Data safety form answers

App content › Data safety. Rewritten 2026-11-19 against the current app and the getlogit.app
server (accounts, free phone backup, social, coaching and messages, subscriptions, diagnostics).
Self-hosted servers are their operator's responsibility and aren't covered.

Play's terms: "collected" = leaves the phone to us; "shared" = given to a third party for its own
use. Service providers that process data for us (Hetzner hosting, Cloudflare, Resend email, Google
Play billing) are not "sharing" under Play's definition.

## Overview questions
- Does your app collect or share any of the required user data types? **Yes**
- Is all of the user data collected by your app encrypted in transit? **Yes** (HTTPS only)
- Do you provide a way for users to request that their data is deleted? **Yes**
  - Delete account URL: https://getlogit.app/delete-account
  - In the app: Settings › Account › Delete account (deletes the server account and the phone's data)

## Data types

Every type below is collected **only with an account** (the app works fully without one), so mark
each as **optional** ("users can choose whether this data is collected") unless noted.

| Section › type | Collected | Shared | Processed ephemerally | Required or optional | Purposes |
|---|---|---|---|---|---|
| Personal info › Name (display name, username) | Yes | No | No | Optional | App functionality, Account management |
| Personal info › Email address | Yes | No | No | Optional | App functionality, Account management, Developer communications (password resets, payment notices) |
| Personal info › User IDs | Yes | No | No | Optional | App functionality, Account management |
| Financial info › Purchase history (Pro/Studio subscription status from Google Play) | Yes | No | No | Optional | App functionality, Account management |
| Health and fitness › Fitness info (workouts, bodyweight, habits, goals) | Yes | No | No | Optional | App functionality |
| Health and fitness › Health info (food diary, calories, macros) | Yes | No | No | Optional | App functionality |
| Messages › Other in-app messages (coach and client messages, comments) | Yes | No | No | Optional | App functionality |
| Photos and videos › Photos (profile photo, meal photos, photos in posts) | Yes | No | No | Optional | App functionality |
| App activity › Other user-generated content (posts, likes, follows, check-in answers) | Yes | No | No | Optional | App functionality |
| App info and performance › Diagnostics (the log sent from Settings › Diagnostics) | Yes | No | No | Optional (only when the user taps Send) | **App functionality** (fixing the problem they reported). If the form's help text files bug-fixing under Analytics, tick Analytics instead; nothing else |
| App info and performance › Crash logs (**test builds only**: closed/internal tracks send each crash with the ~30 log lines before it, also without an account; production builds don't) | Yes | No | No | Required in test builds; none in production | App functionality. When the production release goes out, untick this again if nothing else sends crashes |
| Device or other IDs (a random ID the app makes, so a free account knows which phone holds its backup; the Firebase push token, so the server can send this phone push notifications, only if notifications are allowed) | Yes | No | No | Optional | App functionality |

Not collected: location, contacts, calendar, audio, files and docs, web browsing, installed apps,
advertising ID, crash reports in production builds (no crash SDK; test builds send their own, see above), app interactions/analytics, payment card details
(Google Play and Stripe handle cards; LogIt never sees them).

## Notes for the free-text boxes
- No advertising, analytics or attribution SDKs.
- The camera is used for barcode and nutrition-label scanning; that runs on the phone and the image
  isn't uploaded (a meal photo is uploaded only if the user attaches one and has an account).
- Food searches with few local matches are sent to Open Food Facts' public API without any account
  information (search words or barcode only).
- Music controls use Android notification access only to show and control what's playing; nothing
  from it leaves the phone.
- Server logs with IP addresses are used briefly for security (sign-in rate limits) and not kept
  as user data.

## App access (Play asks how to reach features behind a sign-in)
"Some functionality is restricted": provide a reviewer account on getlogit.app with Pro (or Studio)
given by hand in the admin console, so the reviewer sees sync, the web dashboard and coaching.
Create it yourself (e.g. `playreview`), give it Studio in Admin › People, and type the username and
password only into Play Console, never into the repo.
