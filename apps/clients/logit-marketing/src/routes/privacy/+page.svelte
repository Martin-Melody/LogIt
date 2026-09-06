<script lang="ts">
  import { PRIVACY_EMAIL } from "$lib/site";
  const UPDATED = "3 September 2026";
  const CONTACT = PRIVACY_EMAIL;
</script>

<svelte:head>
  <title>Privacy Policy — LogIt</title>
  <meta
    name="description"
    content="How LogIt handles your data: local-first, no tracking, no ads, no data sales."
  />
</svelte:head>

<article class="mx-auto max-w-2xl px-4 py-12 flex flex-col gap-6 text-sm leading-relaxed">
  <header class="flex flex-col gap-1">
    <h1 class="text-2xl font-semibold">Privacy Policy</h1>
    <p class="text-xs text-muted-foreground">Last updated {UPDATED}</p>
  </header>

  <p>
    LogIt is a workout, nutrition, and habit tracker. It is built to work fully offline, on your
    device, with no account. This policy explains what data LogIt handles, when any of it leaves
    your device, and the choices you have.
  </p>

  <section class="flex flex-col gap-2">
    <h2 class="text-base font-semibold">The short version</h2>
    <ul class="flex flex-col gap-1.5 text-muted-foreground">
      <li>· You can use the whole app with no account. Nothing is sent anywhere in that mode.</li>
      <li>· There are no third-party analytics, advertising, or tracking SDKs in the app.</li>
      <li>· We never sell your data or share it for advertising.</li>
      <li>· If you create an account, your data syncs to a server so you can use it across devices — the one we host, or one you host yourself.</li>
      <li>· You can export or delete your data at any time.</li>
    </ul>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="text-base font-semibold">Using LogIt without an account</h2>
    <p class="text-muted-foreground">
      By default, everything you log — workouts, sets, splits, food diary, meal photos, body
      weight, habits, and app settings — is stored only in a local database on your device. It is
      not transmitted to us or anyone else. Uninstalling the app removes this data.
    </p>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="text-base font-semibold">If you create an account</h2>
    <p class="text-muted-foreground">
      Creating an account is optional and enables sync and social features. When you sign in, the
      following is stored on the server:
    </p>
    <ul class="flex flex-col gap-1.5 text-muted-foreground">
      <li>· <strong>Account details:</strong> your email address, a securely hashed password, and a display name / username.</li>
      <li>· <strong>Your training and health data:</strong> workouts, splits, food diary entries and any meal photos you attach, body weight, habits, and goals — so it is available on your other devices.</li>
      <li>· <strong>Social content</strong> (only if you post): posts, comments, and likes you create in the in-app feed, shown to other users along with your username.</li>
      <li>· <strong>Technical data</strong> needed to run the service: your authentication tokens and basic server request logs (including IP address), kept for security and troubleshooting and rotated regularly.</li>
    </ul>
    <p class="text-muted-foreground">
      Data in transit is encrypted with HTTPS. We use your email only for account-related
      messages (verification, password reset, and important service notices) — not marketing.
    </p>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="text-base font-semibold">Camera and photos</h2>
    <p class="text-muted-foreground">
      LogIt uses the camera to scan barcodes and to read nutrition labels. That scanning runs
      entirely on your device. If you attach a photo to a meal, that photo is stored with your
      diary; it is uploaded to the server only if you are signed in with sync enabled.
    </p>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="text-base font-semibold">Coaching (LogIt Studio)</h2>
    <p class="text-muted-foreground">
      If you connect with a coach, they can see your training and nutrition data and send you
      plans. Nothing is shared with a coach until you explicitly accept their invite, and you can
      end the connection at any time from Settings.
    </p>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="text-base font-semibold">Third parties</h2>
    <p class="text-muted-foreground">
      When you search for a food by name or barcode and no match is found in the app's bundled
      database, the query is sent to the <a href="https://world.openfoodfacts.org" class="underline hover:text-foreground">Open Food Facts</a>
      public API to look it up. No account information is included in that request. The managed
      service is hosted on Amazon Web Services (eu-west-1, Ireland); payments for paid plans are
      processed by Stripe on the website (not in the app). We do not use advertising or analytics
      providers.
    </p>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="text-base font-semibold">Self-hosting</h2>
    <p class="text-muted-foreground">
      LogIt is open source and you can run your own server. If you use a self-hosted server (yours
      or someone else's), the operator of that server is responsible for the data on it and this
      policy does not apply to it.
    </p>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="text-base font-semibold">Your rights and choices</h2>
    <ul class="flex flex-col gap-1.5 text-muted-foreground">
      <li>· <strong>Export:</strong> export your data from within the app at any time.</li>
      <li>· <strong>Delete:</strong> delete your account and its server-side data from Settings → Account → Delete account, or by emailing us. Local data is removed by uninstalling the app.</li>
      <li>· <strong>Access / correction:</strong> contact us to request a copy of, or corrections to, your account data.</li>
    </ul>
    <p class="text-muted-foreground">
      Depending on where you live (for example the EU/EEA and UK under the GDPR), you may have
      additional rights, including the right to complain to a data protection authority.
    </p>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="text-base font-semibold">Children</h2>
    <p class="text-muted-foreground">
      LogIt is not directed to children under 13 (or the minimum age required in your country),
      and we do not knowingly collect data from them.
    </p>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="text-base font-semibold">Changes</h2>
    <p class="text-muted-foreground">
      If this policy changes materially, we will update the date above and, where appropriate,
      notify account holders by email.
    </p>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="text-base font-semibold">Contact</h2>
    <p class="text-muted-foreground">
      Questions or requests: <a href={`mailto:${CONTACT}`} class="underline hover:text-foreground">{CONTACT}</a>.
    </p>
  </section>
</article>
