# App store submission runbook

Status as of 2026-09-03: Android release build is **green and signed**; iOS
platform is **scaffolded but not buildable here** (needs a Mac / cloud macOS).
No developer accounts exist yet. No custom domain yet.

Store assets and copy live in `apps/clients/logit-frontend/store/`.

---

## 0. Blockers to resolve before you can submit

1. **User-generated content (social feed) has no report/block.** Google Play
   (UGC policy) and Apple (guideline 1.2) both require: a way to report
   objectionable posts/comments, a way to block a user, and published contact
   info. The in-app feed (`src/routes/social/`) currently has none.
   → Either build report + block, **or** feature-gate the social feed out of the
   store build for v1. Decide before filling the content-rating form.

2. **Privacy policy must be live at a public URL.** Pages exist at
   `apps/clients/logit-marketing` `/privacy` and `/terms`. Deploy logit-marketing
   (`wrangler pages deploy`, see `docs/deployment.md`) and use the resulting
   `https://<project>.pages.dev/privacy` URL until `logit.ie` is bought. Update
   the placeholder URLs in `store/play/listing-en-GB.md` and
   `store/play/data-safety.md`, and set `VITE_MARKETING_URL` for the app build so
   the in-app Settings → About links resolve.

3. **Upload keystore password is a dev placeholder.** `~/.keystores/logit-upload.jks`
   was generated with password `logit-upload-dev`. Before first submission,
   regenerate it with a strong password and store the password + the `.jks` file
   somewhere safe (password manager + offline backup). If this key is lost you
   can reset the upload key via Play support (Play App Signing holds the real
   signing key), but don't rely on that.
   ```
   keytool -genkeypair -v -keystore ~/.keystores/logit-upload.jks \
     -alias logit-upload -keyalg RSA -keysize 2048 -validity 10000
   ```
   Then update `apps/clients/logit-frontend/android/keystore.properties`.

---

## 1. Google Play (Android) — do this first, it's buildable now

### Accounts
- Create a Google Play Console account: https://play.google.com/console — $25
  one-time. Personal vs organisation: **organisation** avoids the new-personal-
  account testing requirement below, but needs a D-U-N-S number. Personal is
  fine, just slower.
- **New personal accounts:** Google requires a **closed test with at least 12
  testers, opted in for 14 continuous days**, before you can apply for
  production access. Plan for this — line up ~15 people early.

### Build the artifact
```
cd apps/clients/logit-frontend
# ensure the bundled food DB is present (gitignored):
ls static/assets/databases/food.zip   # ~20 MB; rebuild via scripts/build-food-db if missing
VITE_MARKETING_URL=https://<live-url> npm run build
npx cap sync android
cd android && ./gradlew bundleRelease
# -> app/build/outputs/bundle/release/app-release.aab   (signed with the upload key)
```
Release build uses R8 (`minifyEnabled true` + `shrinkResources true`); keep-rules
are in `android/app/proguard-rules.pro`. **Always install the release APK on a
real device and smoke-test before uploading** — R8 breakage only shows in release
builds:
```
cd android && ./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```
Smoke test: cold launch → splash dismisses cleanly; offline onboarding; log a
workout; rest-timer notification fires; barcode scan asks camera permission and
works; create account + login against the API; Android back button navigates
back and exits at the root.

### Play Console setup (per app, once)
- Create app: name "LogIt", default language en-GB, app (not game), free.
- **Store listing:** copy from `store/play/listing-en-GB.md`. Assets:
  - App icon: `store/play/icon-512.png` (512×512)
  - Feature graphic: `store/play/feature-graphic.png` (1024×500)
  - Phone screenshots: `store/play/phone-screenshots/` (2–8, min 320px, 16:9 or
    9:16). Regenerate with `scripts/capture-screenshots.mjs` (see below) if stale.
- **Privacy policy:** the live `/privacy` URL.
- **Data safety:** `store/play/data-safety.md`.
- **Content rating:** `store/play/content-rating.md` (after resolving blocker #1).
- **Target audience:** 13+ (not designed for children).
- **Ads:** contains ads? **No**.
- **App access:** the app works without login, but reviewers need to see the
  account/sync path — create a throwaway account on the managed server and
  provide the credentials.
- **Government apps / financial / health declarations:** health & fitness tracker,
  not a medical device — answer accordingly.
- Upload the AAB to a **Closed testing** track first (also satisfies the 14-day
  requirement). Promote to Production when eligible.

---

## 2. Apple (iOS) — deferred, needs a Mac or cloud macOS build

The `ios/` Xcode project is scaffolded (`npx cap add ios` already run) with:
- `appId` / bundle id `ie.logit.app`, display name "LogIt"
- Camera + photo-library usage strings and `ITSAppUsesNonExemptEncryption=false`
  in `ios/App/App/Info.plist`
- App icon + splash generated into `ios/App/App/Assets.xcassets`

Not done / needs a Mac:
- **Capacitor 8 defaulted this project to Swift Package Manager**, but
  `@capacitor-mlkit/barcode-scanning` and `@capacitor-mlkit/text-recognition`
  are **CocoaPods-only** (no `Package.swift`). On the Mac, either:
  - migrate the iOS project to CocoaPods (`npx cap add ios` supports
    `--packagemanager Cocoapods` on a fresh add; or follow Capacitor's SPM→Pods
    notes), then `pod install`; or
  - drop the two ML Kit plugins on iOS and ship without native barcode/label
    scanning on iOS for v1 (the app already falls back to the Open Food Facts
    API for barcode lookup, but on-device label OCR would be gone).
- `sudo gem install cocoapods` → `npx cap sync ios`
- Open `ios/App/App.xcworkspace` in Xcode, set the signing team, set deployment
  target (14.0+), archive.
- Apple Developer Program: https://developer.apple.com/programs/ — $99/yr.
- App Store Connect: create the app, fill the App Privacy questionnaire (mirror
  `store/play/data-safety.md`), upload via Xcode/Transporter → TestFlight →
  submit for review.
- **Guideline 3.1.1 (anti-steering):** the binary must contain **no** link or
  button to an external purchase/upgrade page. The app is already built this way
  (tier status is informational only) — keep it that way.
- **Guideline 1.2 (UGC):** same report/block requirement as Play blocker #1.

---

## 3. Screenshots

`scripts/capture-screenshots.mjs` (if present) drives the dev server through the
key screens at a phone viewport and writes PNGs to
`store/play/phone-screenshots/`. Otherwise capture manually from a device or the
dev server (`npm run dev`, mobile viewport) covering: onboarding, splits, active
session, history, progress charts, nutrition diary, habits.

---

## 4. Post-launch follow-ups

- Buy `logit.ie`; point `VITE_MARKETING_URL`, `VITE_API_URL`, `VITE_WEB_URL`, and
  the Play/ASC privacy URLs at the real domain; attach the domain to the
  Cloudflare Pages project (`TODO.md`).
- Apply the nutrition DB migrations to the deployed database (dual SQLite +
  Postgres — see `project_hosting_deployment` / `docs/deployment.md`).
- Revisit AAB size: `food.zip` is ~20 MB of the ~60 MB bundle — Play Asset
  Delivery (install-time asset pack) could move it out of the base.
- Consider `androidScheme: "https"` in `capacitor.config.ts` (origin change =
  one-time local-data reset; fine pre-launch, not after).
