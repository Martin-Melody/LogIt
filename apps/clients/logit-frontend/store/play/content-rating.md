# Play Console: content rating and the other App content declarations

Rewritten 2026-11-19. App content (left menu, "Policy and programs") lists these; all must be done
before the first release, even to a closed test.

## Content rating (IARC questionnaire)
- Category: **All other app types** (not a game; not "Reference, news or educational").
- Violence, sexuality, language, controlled substances, gambling, horror: **No** to all.
- Users can interact or exchange content: **Yes**
  - Social feed (posts, comments, likes, follows) and coach/client messages.
  - Users can report posts, comments and people, and block people (built 2026-11).
- Shares the user's current location with other users: **No**
- Allows users to purchase digital goods: **Yes** (Pro and Studio subscriptions through Google Play)
- Unrestricted internet access (a browser): **No**
- Expected result: PEGI 3 / "Rated for 3+" with "Users interact" and "In-app purchases" notices.

## Target audience and content
- Target age groups: **18 and over** (simplest), or 16–17 and 18+ if you want teens. Don't include
  under-13 groups: that brings in the Families policy (and the privacy policy says the app isn't for
  under-13s).
- Could the app unintentionally appeal to children? **No**

## Ads
- Does your app contain ads? **No**

## Health apps declaration
- Tick: **Activity and fitness**, **Nutrition and weight management**.
- Not: medical devices, clinical, mental health, sleep (the habit tracker isn't a sleep tracker).
- It is not a medical device and doesn't diagnose or treat; the listing and terms say so.

## Financial features
- **No** (subscriptions through Google Play aren't a financial feature; coach payments happen on the
  website through the coach's Stripe account, not in the app).

## Government apps
- **No**

## Data safety
- See `data-safety.md`.

## News app
- **No**

## Permissions Play asks about
- **Exact alarms (SCHEDULE_EXACT_ALARM)**: Play may ask why. Answer: the rest timer between sets
  rings at the exact second the rest ends; the user starts it, and it's the app's core feature.
  (The app falls back to an inexact alarm if the user doesn't allow it.)
- **Notification access (music bar)**: only if the store asks about the
  NotificationListenerService: the app shows and controls what's playing during a workout; nothing
  is read beyond the media session, stored or sent.
- **Camera**: barcode and nutrition-label scanning, on the phone.
