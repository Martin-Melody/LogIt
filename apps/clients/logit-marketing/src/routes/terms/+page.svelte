<script lang="ts">
  const UPDATED = "3 September 2026";
  const CONTACT = "martinmel218@gmail.com";
</script>

<svelte:head>
  <title>Terms of Service — LogIt</title>
  <meta name="description" content="The terms that apply to using LogIt." />
</svelte:head>

<article class="mx-auto max-w-2xl px-4 py-12 flex flex-col gap-6 text-sm leading-relaxed">
  <header class="flex flex-col gap-1">
    <h1 class="text-2xl font-semibold">Terms of Service</h1>
    <p class="text-xs text-muted-foreground">Last updated {UPDATED}</p>
  </header>

  <p>
    These terms apply when you use the LogIt app or the managed service at the LogIt website. If
    you do not agree with them, do not use the service. The LogIt software itself is open source
    and separately licensed (see the project's LICENSE file).
  </p>

  <section class="flex flex-col gap-2">
    <h2 class="text-base font-semibold">The service</h2>
    <p class="text-muted-foreground">
      LogIt is a workout, nutrition, and habit tracker. The app works offline with no account. An
      optional account adds cloud sync, a social feed, and coaching features. Paid plans for the
      managed hosting are billed through the website.
    </p>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="text-base font-semibold">Your account</h2>
    <ul class="flex flex-col gap-1.5 text-muted-foreground">
      <li>· You are responsible for keeping your login credentials secure and for activity under your account.</li>
      <li>· You must provide accurate account information and be old enough to form a binding contract in your country (at least 13, or older where required).</li>
      <li>· You may delete your account at any time from within the app.</li>
    </ul>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="text-base font-semibold">Acceptable use</h2>
    <p class="text-muted-foreground">You agree not to:</p>
    <ul class="flex flex-col gap-1.5 text-muted-foreground">
      <li>· break the law, infringe others' rights, or post abusive, harassing, or unlawful content in the social feed;</li>
      <li>· attempt to disrupt, overload, reverse-engineer for abuse, or gain unauthorised access to the managed service or other users' data;</li>
      <li>· use the service to build a competing dataset by scraping other users' content.</li>
    </ul>
    <p class="text-muted-foreground">
      We may suspend or remove accounts or content that violate these terms.
    </p>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="text-base font-semibold">Your content</h2>
    <p class="text-muted-foreground">
      You keep ownership of the data and content you create. By posting to the social feed, you
      grant us the limited licence needed to store and display that content to other users as part
      of operating the feature. You are responsible for the content you post.
    </p>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="text-base font-semibold">Health disclaimer</h2>
    <p class="text-muted-foreground">
      LogIt is a tracking and planning tool, not medical advice. Training programmes, calorie and
      macro targets, and progression suggestions are estimates. Consult a qualified professional
      before starting a new training or nutrition programme, especially if you have a health
      condition or injury. You use the app at your own risk.
    </p>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="text-base font-semibold">Paid plans</h2>
    <p class="text-muted-foreground">
      Paid plans are billed in advance on a recurring basis through the website until cancelled.
      You can cancel anytime; access continues until the end of the current billing period.
      Except where required by law, payments are non-refundable. Prices may change with notice
      before your next renewal.
    </p>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="text-base font-semibold">Availability and changes</h2>
    <p class="text-muted-foreground">
      The managed service is provided "as is" and "as available". We may change, suspend, or
      discontinue features. If we discontinue the managed service, we will give reasonable notice
      and a way to export your data — which you can also self-host at any time.
    </p>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="text-base font-semibold">Liability</h2>
    <p class="text-muted-foreground">
      To the extent permitted by law, LogIt and its maintainer are not liable for indirect or
      consequential losses, or for loss of data, arising from use of the app or service. Nothing
      in these terms limits liability that cannot be limited by law.
    </p>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="text-base font-semibold">Contact</h2>
    <p class="text-muted-foreground">
      Questions about these terms: <a href={`mailto:${CONTACT}`} class="underline hover:text-foreground">{CONTACT}</a>.
    </p>
  </section>
</article>
