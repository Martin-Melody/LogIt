<script lang="ts">
  import TextPage from "$lib/site/TextPage.svelte";
  import { CONTACT_EMAIL, DASHBOARD_URL, PLAY_CANCEL_PATH } from "$lib/site";

  const UPDATED = "13 November 2026";
  // TODO(launch): confirm both numbers (docs/launch-checklist.md).
  const EMAIL_DAYS = 30;
  const BACKUP_DAYS = 30;
</script>

<svelte:head>
  <title>Delete your account · LogIt</title>
  <meta name="description" content="How to delete your LogIt account and what gets deleted." />
</svelte:head>

<TextPage title="Delete your LogIt account" updated={UPDATED}>
  <p class="lead">
    Deleting your account removes it and everything stored with it on our servers. Data on your
    phone stays until you uninstall the app.
  </p>

  <div class="my-6 rounded-[14px] border border-highlight/35 bg-highlight/10 px-5 py-4 text-[15px] leading-relaxed text-foreground">
    <strong class="text-highlight">Paying for Pro or Studio?</strong> Cancel in Google Play first
    ({PLAY_CANCEL_PATH}). Deleting your account doesn't stop Google charging you.
  </div>

  <h2>Three ways to do it</h2>
  <div class="my-4 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
    <div class="rounded-[14px] border border-border bg-card p-5">
      <p class="!mt-0 !mb-1.5 font-semibold text-heading">In the app</p>
      <p class="!m-0 text-[15px] text-muted-foreground">Settings › Account › Delete account. Enter your password to confirm.</p>
    </div>
    <div class="rounded-[14px] border border-border bg-card p-5">
      <p class="!mt-0 !mb-1.5 font-semibold text-heading">On the web</p>
      <p class="!m-0 text-[15px] text-muted-foreground">Pro and Studio: sign in at <a href="{DASHBOARD_URL}/account">app.getlogit.app</a>, open Account, then Delete account.</p>
    </div>
    <div class="rounded-[14px] border border-border bg-card p-5">
      <p class="!mt-0 !mb-1.5 font-semibold text-heading">By email</p>
      <p class="!m-0 text-[15px] text-muted-foreground">Email <a href="mailto:{CONTACT_EMAIL}?subject=Delete%20my%20account">{CONTACT_EMAIL}</a> from your account's address. We'll do it within {EMAIL_DAYS} days.</p>
    </div>
  </div>

  <h2>What gets deleted</h2>
  <ul>
    <li>Your account, email address and profile</li>
    <li>Synced workouts, splits, food diary, meal photos, body weight, habits and goals</li>
    <li>Your posts, comments, likes and follows</li>
    <li>Coach and client connections, and any diagnostic reports you sent</li>
  </ul>

  <h2>What's kept, and for how long</h2>
  <ul>
    <li>Server backups roll over after {BACKUP_DAYS} days; after that your data is gone from those too.</li>
    <li>Google keeps its own record of Play purchases. We don't control that.</li>
    <li>Everything on your phone, until you uninstall LogIt or clear its data.</li>
  </ul>

  <p>Questions: <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a></p>
</TextPage>
