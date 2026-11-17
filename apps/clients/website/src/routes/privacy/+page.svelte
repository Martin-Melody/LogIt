<script lang="ts">
  import TextPage from "$lib/site/TextPage.svelte";
  import { PRIVACY_EMAIL } from "$lib/site";

  const UPDATED = "17 November 2026";
</script>

<svelte:head>
  <title>Privacy policy · LogIt</title>
  <meta name="description" content="How LogIt handles your data: on your phone first, no tracking, no ads, no data sales." />
</svelte:head>

<TextPage title="Privacy policy" updated={UPDATED}>
  <p class="lead">
    LogIt is a workout, nutrition and habit tracker. It works fully offline, on your device, with
    no account. This policy explains what data LogIt handles, when any of it leaves your device,
    and the choices you have.
  </p>

  <h2>The short version</h2>
  <ul>
    <li>You can use the whole app with no account. Nothing is sent anywhere in that mode.</li>
    <li>There are no third-party analytics, advertising or tracking SDKs in the app.</li>
    <li>We never sell your data or share it for advertising.</li>
    <li>If you create an account, your data syncs to a server so you can use it across devices: the one we host, or one you host yourself.</li>
    <li>You can export your data or delete your account at any time.</li>
  </ul>

  <h2>Using LogIt without an account</h2>
  <p>
    By default, everything you log (workouts, sets, splits, food diary, meal photos, body weight,
    habits, goals and app settings) is stored only in a local database on your device. It is not
    sent to us or anyone else. Uninstalling the app removes it.
  </p>

  <h2>If you create an account</h2>
  <p>Creating an account is optional. It turns on the social feed and, with Pro or Studio, sync. When you sign in, the following is stored on the server:</p>
  <ul>
    <li><strong>Account details:</strong> your email address, a securely hashed password, and a display name and username.</li>
    <li><strong>Your training and health data</strong> (with Pro or Studio): workouts, splits, food diary entries and any meal photos you attach, body weight, habits and goals, so they are available on your other devices.</li>
    <li><strong>Social content</strong> (only if you post): posts, comments and likes you create, shown to other users with your username.</li>
    <li><strong>Technical data</strong> needed to run the service: authentication tokens and basic server request logs (including IP address), kept for security and troubleshooting and rotated regularly.</li>
  </ul>
  <p>
    Training, food and body-weight data can count as health data under the GDPR. We use it only to
    provide the features you turn on, and never for advertising or profiling. Data in transit is
    encrypted with HTTPS. We use your email only for account messages (verification, password
    reset and important service notices), not marketing.
  </p>

  <h2>Subscriptions</h2>
  <p>
    Pro and Studio are bought in the app through Google Play. Google processes the payment; we
    receive the state of your subscription (which plan, when it renews or ends), not your card
    details. Google's own privacy policy applies to the payment.
  </p>

  <h2>Camera and photos</h2>
  <p>
    LogIt uses the camera to scan barcodes and read nutrition labels. That scanning runs entirely
    on your device. A photo you attach to a meal is stored with your diary, and is uploaded only if
    you sync.
  </p>

  <h2>Music controls (Android)</h2>
  <p>
    If you switch on the music bar, Android asks you to give LogIt <em>Notification access</em>. Android
    only lets an app see and control other apps' music through that access. LogIt uses it only to show
    what's playing (title, artist, cover, app) and to play, pause, skip and seek. It does not read,
    store or send your notifications, and what's playing never leaves your device. You can turn the
    access off any time in Android's settings.
  </p>
  <p>
    Playlist links you save in Settings › Music are kept on your device and are not synced.
  </p>

  <h2>Diagnostics</h2>
  <p>
    The app keeps a log on your device to help fix problems (Settings › Diagnostics). It leaves
    your device only if you choose <em>Send to LogIt</em>; we delete sent reports after 30 days, or
    sooner if you delete your account.
  </p>

  <h2>Coaching (LogIt Studio)</h2>
  <p>
    If you connect with a coach, they can see your training and nutrition data and send you plans.
    Nothing is shared with a coach until you accept their invite, and you can end the connection at
    any time from Settings.
  </p>

  <h2>Plugins</h2>
  <p>
    Installing a community plugin downloads it once from the registry or link you chose. Plugins
    run on your device in a sandbox with no network access, so they cannot send your data anywhere.
  </p>

  <h2>Third parties</h2>
  <ul>
    <li>
      <strong>Open Food Facts:</strong> when a food search or barcode has few or no matches in the
      app's built-in database, or you tap "Search online for more products", the search words or
      barcode are sent to the <a href="https://world.openfoodfacts.org">Open Food Facts</a> public API
      (world.openfoodfacts.org and search.openfoodfacts.org). No account information is included.
      In a web browser, food searches go through the LogIt server on their way to Open Food Facts,
      because Open Food Facts' search doesn't accept requests straight from web pages. The server
      passes on only the search words, and keeps recent answers for a few hours (not who asked) so
      a repeated search isn't sent again.
    </li>
    <li>
      <strong>Spotify and YouTube:</strong> when you save a playlist link in Settings › Music, the link
      is sent to Spotify's or YouTube's public oEmbed service (open.spotify.com or www.youtube.com) to
      look up the playlist's name and cover. Only the link is sent, with no account information.
      Opening a playlist hands the link to the Spotify or YouTube Music app on your phone.
    </li>
    <li><strong>Hosting:</strong> the managed service runs on servers in the European Union. <!-- TODO(launch): name the VPS provider once chosen. --></li>
    <li><strong>Google Play:</strong> app distribution and subscription payments.</li>
  </ul>
  <p>We do not use advertising or analytics providers.</p>

  <h2>Self-hosting</h2>
  <p>
    LogIt is open source and you can run your own server. If you use a self-hosted server (yours or
    someone else's), whoever runs it is responsible for the data on it, and this policy does not
    apply to it.
  </p>

  <h2>Your rights and choices</h2>
  <ul>
    <li><strong>Export:</strong> export your data from within the app at any time.</li>
    <li><strong>Delete:</strong> see <a href="/delete-account">Delete your account</a>. Local data is removed by uninstalling the app.</li>
    <li><strong>Access and correction:</strong> contact us for a copy of, or corrections to, your account data.</li>
  </ul>
  <p>
    Depending on where you live (for example the EU/EEA and UK under the GDPR), you may have more
    rights, including the right to complain to a data protection authority. In Ireland that is the
    Data Protection Commission.
  </p>

  <h2>Children</h2>
  <p>LogIt is not directed to children under 13 (or the minimum age in your country), and we do not knowingly collect data from them.</p>

  <h2>Changes</h2>
  <p>If this policy changes materially, we will update the date above and, where appropriate, tell account holders by email.</p>

  <h2>Contact</h2>
  <p>Questions or requests: <a href="mailto:{PRIVACY_EMAIL}">{PRIVACY_EMAIL}</a>.</p>
</TextPage>
