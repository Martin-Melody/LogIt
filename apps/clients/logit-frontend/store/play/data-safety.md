# Play Console — Data safety form answers

App Content → Data safety. Answers reflect the shipped mobile binary + the
managed (logit.ie) sync backend. Self-hosted servers are the operator's
responsibility.

## Does your app collect or share any of the required user data types?
YES — but only when the user creates an optional account. With no account,
nothing is collected.

## Is all of the user data collected by your app encrypted in transit?
YES (HTTPS).

## Do you provide a way for users to request that their data be deleted?
YES — in-app: Settings → Account → Delete account. Also by email.
Deletion URL (for the form): https://logit.ie/privacy

---

## Data types — collected / shared / purpose

| Data type | Collected | Shared | Ephemeral? | Purpose | Optional? |
|---|---|---|---|---|---|
| Email address | Yes | No | No | Account management | Yes (only with account) |
| Name (display name / username) | Yes | No | No | Account management, App functionality (shown on social posts) | Yes |
| User IDs | Yes | No | No | Account management, App functionality | Yes |
| Health & fitness (workouts, body weight) | Yes | No | No | App functionality (sync) | Yes |
| Health & fitness (food diary, meal photos) | Yes | No | No | App functionality (sync) | Yes |
| Photos (meal photos only) | Yes | No | No | App functionality (sync) | Yes |
| App activity (in-app social posts, comments, likes) | Yes | No | No | App functionality | Yes |
| App info & performance (crash logs) | No | — | — | — | — |
| Device or other IDs | No | — | — | — | — |
| Location | No | — | — | — | — |
| Approximate/precise diagnostics, analytics | No | — | — | — | — |

Notes for the reviewer / form free-text:
- No third-party analytics, advertising, or attribution SDKs are present.
- Server request logs (incl. IP) are kept transiently for security/abuse
  prevention and are not used to track users across apps or services — this is
  "ephemeral processing", not collection, under Play's definition.
- Food lookups with no local match are sent to the Open Food Facts public API
  with no account data attached.
- "Shared" = No everywhere: data is not transferred to third parties. Stripe
  (payments) is only used on the website, not in the app.

## Account creation
The app supports account creation. Provide test credentials in
"App access" (create a throwaway account on the managed server).
