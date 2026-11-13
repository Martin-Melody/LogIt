<script lang="ts">
  import TextPage from "$lib/site/TextPage.svelte";
  import { CONTACT_EMAIL, PLAY_CANCEL_PATH } from "$lib/site";

  const UPDATED = "13 November 2026";
</script>

<svelte:head>
  <title>Terms of service · LogIt</title>
  <meta name="description" content="The terms that apply to using LogIt." />
</svelte:head>

<TextPage title="Terms of service" updated={UPDATED}>
  <p class="lead">
    These terms apply when you use the LogIt app or the managed service. If you do not agree with
    them, do not use the service. The LogIt software itself is open source and separately licensed
    (see the project's LICENSE file).
  </p>

  <h2>The service</h2>
  <p>
    LogIt is a workout, nutrition and habit tracker. The app works offline with no account. An
    optional account adds a social feed; the paid Pro and Studio plans add cloud sync, the web
    dashboard and coaching features.
  </p>

  <h2>Your account</h2>
  <ul>
    <li>You are responsible for keeping your login details secure and for activity under your account.</li>
    <li>You must give accurate account information and be old enough to form a binding contract in your country (at least 13, or older where required).</li>
    <li>You can delete your account at any time; see <a href="/delete-account">Delete your account</a>.</li>
  </ul>

  <h2>Acceptable use</h2>
  <p>You agree not to:</p>
  <ul>
    <li>break the law, infringe others' rights, or post abusive, harassing or unlawful content in the social feed;</li>
    <li>try to disrupt, overload or gain unauthorised access to the managed service or other users' data;</li>
    <li>scrape other users' content to build a competing dataset;</li>
    <li>publish plugins that try to get around the sandbox or mislead people about what they do.</li>
  </ul>
  <p>We may suspend or remove accounts, content or plugins that break these terms.</p>

  <h2>Your content</h2>
  <p>
    You keep ownership of the data and content you create. By posting to the social feed you give
    us the limited licence needed to store and show that content to other users as part of running
    the feature. You are responsible for what you post.
  </p>

  <h2>Plugins</h2>
  <p>
    Community plugins are made and maintained by their authors, not by LogIt. Plugins in the
    community registry are reviewed before they are listed, and code plugins run in a sandbox, but
    we cannot guarantee a plugin's suggestions are right for you.
  </p>

  <h2>Health disclaimer</h2>
  <p>
    LogIt is a tracking and planning tool, not medical advice. Programmes, calorie and macro
    targets, and progression suggestions are estimates. Talk to a qualified professional before
    starting a new training or nutrition programme, especially if you have a health condition or
    injury. You use the app at your own risk.
  </p>

  <h2>Paid plans</h2>
  <p>
    Pro and Studio are subscriptions bought in the app through Google Play and billed in advance,
    monthly or yearly, until cancelled. You can cancel at any time ({PLAY_CANCEL_PATH}); your plan
    stays active until the end of the period you paid for. Payments and refunds are handled by
    Google Play under its terms. Except where the law requires otherwise, payments are not
    refundable. We will tell you before a price change applies to your next renewal.
  </p>

  <h2>Availability and changes</h2>
  <p>
    The managed service is provided "as is" and "as available". We may change, suspend or stop
    features. If we stop the managed service we will give reasonable notice and a way to export
    your data, which you can also self-host at any time.
  </p>

  <h2>Liability</h2>
  <p>
    As far as the law allows, LogIt and its maintainer are not liable for indirect or
    consequential losses, or loss of data, arising from use of the app or service. Nothing in these
    terms limits liability that cannot be limited by law.
  </p>

  <h2>Contact</h2>
  <p>Questions about these terms: <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>.</p>
</TextPage>
