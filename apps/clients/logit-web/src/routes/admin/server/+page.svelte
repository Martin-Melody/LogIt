<script lang="ts">
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import { onMount } from "svelte";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { apiClient } from "@logit/core/api/client";
  import { ago, shortDate, weekdayDate } from "$lib/features/coaching/format";
  import { adminApi, at, webOriginMismatch, type ServerInfo } from "$lib/features/admin/adminApi";
  import { adminState } from "$lib/features/admin/adminState.svelte";

  let info = $state<ServerInfo | null>(null);
  let error = $state<string | null>(null);
  let busy = $state<string | null>(null);
  let emailResult = $state<{ ok: boolean; text: string } | null>(null);

  const apiUrl = apiClient.getBaseUrl();
  const here = typeof location === "undefined" ? "" : location.origin;
  const REPO = "https://github.com/Martin-Melody/LogIt";

  async function load() {
    try {
      info = await adminApi.server();
      adminState.emailConfigured = info.emailConfigured;
      adminState.webOrigin = info.webOrigin;
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load the server's details";
    }
  }
  onMount(load);

  async function setMode(mode: "open" | "invite") {
    if (!info || info.registrationMode === mode) return;
    busy = "mode";
    try {
      await adminApi.setRegistration(mode);
      toast.success(mode === "invite" ? "Sign-ups are invite-only" : "Anyone can sign up");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change sign-ups");
    } finally {
      busy = null;
    }
  }

  async function setRelay(on: boolean) {
    busy = "push";
    try {
      await adminApi.setPushRelay(on);
      toast.success(on ? "Pushes now go through getlogit.app" : "Push notifications are off");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change push notifications");
    } finally {
      busy = null;
    }
  }

  async function testEmail() {
    busy = "email";
    emailResult = null;
    try {
      const r = await adminApi.sendTestEmail();
      emailResult = { ok: true, text: `Sent to ${r.sentTo}. If it isn't there in a minute, check spam.` };
    } catch (e) {
      emailResult = { ok: false, text: e instanceof Error ? e.message : "Couldn't send the test email" };
    } finally {
      busy = null;
    }
  }

  async function downloadBackup() {
    busy = "backup";
    try {
      const blob = await adminApi.backup();
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: `logit-backup-${new Date().toISOString().slice(0, 10)}.db` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("Backup downloaded. Keep it somewhere other than this server.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't make a backup");
    } finally {
      busy = null;
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy. Select the text and copy it yourself.");
    }
  }

  function size(bytes: number | null): string {
    if (bytes === null) return "size unknown";
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 / 1024)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }

  const dayName = (date: string) => weekdayDate(at(`${date}T00:00:00Z`));
  const errorDays = $derived(info ? info.errors.filter((d) => d.count > 0).reverse() : []);
  const errorTotal = $derived(errorDays.reduce((n, d) => n + d.count, 0));
  const maxErrors = $derived(Math.max(1, ...(info?.errors.map((d) => d.count) ?? [1])));

  const card = "flex flex-col gap-3 rounded-[14px] border bg-card px-5 py-[18px]";
  const btn = "inline-flex h-[34px] items-center whitespace-nowrap rounded-[9px] px-3 text-[13px] font-medium disabled:opacity-50";
  const code = "rounded bg-muted px-1.5 py-0.5 font-mono text-xs";
  const row = "flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-border py-2.5 text-sm first:border-t-0 first:pt-0";
</script>

<div class="flex max-w-[1000px] flex-col gap-[18px]">
  <header>
    <h1 class="text-[26px] font-bold tracking-tight">Server</h1>
    <p class="mt-0.5 text-sm text-muted-foreground">Settings and health for this LogIt server. Things marked in amber need a look.</p>
  </header>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if !info}
    <Skeleton class="h-40" /><Skeleton class="h-40" /><Skeleton class="h-56" />
  {:else}
    {@const mismatch = webOriginMismatch(info.webOrigin)}
    <section aria-labelledby="signups" class="{card} border-border">
      <h2 id="signups" class="text-[15px] font-semibold">Who can sign up</h2>
      <RadioGroup.Root value={info.registrationMode} disabled={busy === "mode"} onValueChange={(v) => setMode(v as "open" | "invite")} class="flex flex-wrap gap-2.5" aria-labelledby="signups">
        {#each [["invite", "Only people with an invite", "You hand out codes from Invites. Good for family, a gym or a team."], ["open", "Anyone who knows the address", "Open sign-up. Sign-ups are still limited per address so bots can't flood it."]] as [mode, title, text] (mode)}
          {@const on = info.registrationMode === mode}
          <label class="flex flex-[1_1_260px] cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors {on ? 'border-primary/60 bg-muted' : 'border-border hover:bg-muted/50'}">
            <RadioGroup.Item value={mode} class="mt-0.5" />
            <span><span class="block text-sm font-medium">{title}</span><span class="block text-[13px] text-muted-foreground">{text}</span></span>
          </label>
        {/each}
      </RadioGroup.Root>
      <p class="text-[13px] text-muted-foreground">
        {#if info.registrationModeSource === "console"}Set here. It wins over <code class={code}>REGISTRATION_MODE</code> in .env.{:else}From <code class={code}>REGISTRATION_MODE</code> in .env. A change here is saved on the server and wins over it.{/if}
      </p>
    </section>

    <section aria-labelledby="addresses" class="{card} {mismatch ? 'border-warning/40' : 'border-border'}">
      <h2 id="addresses" class="text-[15px] font-semibold">Addresses</h2>
      <div>
        <div class={row}><span class="w-[150px] text-muted-foreground">The app connects to</span><code class="{code} text-[13px]">{apiUrl}</code><button type="button" class="{btn} ml-auto bg-muted hover:bg-accent" onclick={() => copy(apiUrl)}>Copy</button></div>
        <div class={row}><span class="w-[150px] text-muted-foreground">Dashboard</span><span><code class="{code} text-[13px]">{here}</code> <span class="text-[13px] text-muted-foreground">· where you are now</span></span></div>
        <div class={row}>
          <span class="w-[150px] text-muted-foreground">Links in emails</span>
          <span class="min-w-0 flex-[1_1_300px]">
            <code class="{code} text-[13px]">{info.webOrigin ?? "not set"}</code>
            {#if mismatch}
              <span class="mt-1.5 block text-[13px] text-warning">Emails would link to {info.webOrigin ?? "nowhere"}, not to where you're using the dashboard. Set <code class={code}>WEB_ORIGIN={here}</code> in .env and run <code class={code}>docker compose up -d</code>.</span>
            {/if}
          </span>
        </div>
      </div>
    </section>

    <section aria-labelledby="email" class="{card} {info.emailConfigured ? 'border-border' : 'border-warning/40'}">
      <div class="flex flex-wrap items-baseline justify-between gap-2.5">
        <h2 id="email" class="text-[15px] font-semibold">Email <span class="ml-1.5 text-[13px] font-medium {info.emailConfigured ? 'text-success' : 'text-warning'}">{info.emailConfigured ? `Set up${info.emailFrom ? `, sends from ${info.emailFrom}` : ""}` : "Not set up"}</span></h2>
        <button type="button" class="{btn} bg-muted hover:bg-accent" disabled={!info.emailConfigured || busy === "email"} onclick={testEmail}>Send me a test email</button>
      </div>
      {#if emailResult}<p class="text-[13px] {emailResult.ok ? 'text-success' : 'text-destructive'}" role="status">{emailResult.text}</p>{/if}
      {#if !info.emailConfigured}
        <p class="text-[13px] text-muted-foreground">Without email, people can't reset a forgotten password themselves (you can, from their page), and plugin authors don't hear back about reviews.</p>
        <ol class="flex list-decimal flex-col gap-1 pl-5 text-[13px] text-muted-foreground">
          <li>In .env next to docker-compose.yml, fill in <code class={code}>SMTP_HOST</code>, <code class={code}>SMTP_PORT</code>, <code class={code}>SMTP_USER</code>, <code class={code}>SMTP_PASSWORD</code> and <code class={code}>SMTP_FROM_ADDRESS</code> from your email provider.</li>
          <li>Run <code class={code}>docker compose up -d</code>, then send yourself a test email from here.</li>
        </ol>
      {/if}
    </section>

    <section aria-labelledby="push" class="{card} border-border">
      <div class="flex flex-wrap items-start justify-between gap-x-5 gap-y-2.5">
        <div class="flex max-w-[62ch] flex-col gap-1.5">
          <h2 id="push" class="text-[15px] font-semibold">Push notifications</h2>
          {#if info.push.mode === "firebase"}
            <p class="text-[13px] leading-relaxed text-muted-foreground">This server sends pushes through Firebase with its own key, and passes on pushes from self-hosted servers that turned them on.</p>
          {:else}
            <p class="text-[13px] leading-relaxed text-muted-foreground">Phones get pushes only through LogIt's Firebase project. Turn this on and this server hands each push to getlogit.app, which passes it to Google and keeps nothing.</p>
          {/if}
        </div>
        {#if info.push.mode === "relay"}
          <button type="button" role="switch" aria-checked={info.push.relayOn} aria-labelledby="push" disabled={busy === "push"}
            class="{btn} border {info.push.relayOn ? 'border-border bg-muted hover:bg-accent' : 'border-primary bg-primary font-semibold text-primary-foreground'}"
            onclick={() => setRelay(!info!.push.relayOn)}>{info.push.relayOn ? "Turn off" : "Turn on"}</button>
        {/if}
      </div>
      {#if info.push.mode === "relay"}
        <dl class="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt class="text-muted-foreground">What's sent</dt><dd>The phone's push token and the text shown, like "Ava liked your post"</dd>
          <dt class="text-muted-foreground">Never sent</dt><dd>Messages, comments, workouts, or anything else from this server</dd>
          <dt class="text-muted-foreground">Status</dt>
          <dd>{info.push.relayOn ? "On. Each person chooses which kinds they get in the app's settings." : "Off. Members see their notifications in the app's inbox."}</dd>
        </dl>
      {/if}
    </section>

    <section aria-labelledby="errors" class="{card} border-border">
      <h2 id="errors" class="text-[15px] font-semibold">Server errors, last 14 days <span class="font-normal text-muted-foreground">{errorTotal ? `${errorTotal} in total` : "none"}</span></h2>
      <div class="grid grid-cols-[repeat(14,minmax(14px,1fr))] gap-[5px]" aria-hidden="true">
        {#each info.errors as d, i (d.date)}
          <span class="h-6 rounded-[5px] {i === info.errors.length - 1 ? 'outline-2 outline-offset-1 outline-foreground' : ''}" title="{dayName(d.date)}: {d.count}"
            style="background: {d.count ? `color-mix(in oklch, var(--destructive) ${[35, 60, 90][Math.min(2, Math.ceil((d.count / maxErrors) * 3) - 1)]}%, transparent)` : 'var(--muted)'}"></span>
        {/each}
      </div>
      {#if errorDays.length}
        <ul class="flex flex-col gap-1 text-[13px]">
          {#each errorDays as d (d.date)}
            <li>{dayName(d.date)}: {d.count} error{d.count === 1 ? "" : "s"}{#if d.topRoute}, most from <code class={code}>{d.topRoute}</code>{/if}</li>
          {/each}
        </ul>
        <p class="text-[13px] text-muted-foreground">The details are in <code class={code}>docker compose logs api</code>. Search for the reference the app showed, or for <code class={code}>500</code>.</p>
      {:else}
        <p class="text-[13px] text-muted-foreground">Nothing failed on the server. If someone sees an error in the app, it'll be counted here.</p>
      {/if}
    </section>

    <section aria-labelledby="backups" class="{card} {info.selfHosted ? 'border-warning/40' : 'border-border'}">
      <div class="flex flex-wrap items-baseline justify-between gap-2.5">
        <h2 id="backups" class="text-[15px] font-semibold">Backups</h2>
        {#if info.canDownloadBackup}<button type="button" class="{btn} bg-primary font-semibold text-primary-foreground" disabled={busy === "backup"} onclick={downloadBackup}>{busy === "backup" ? "Making a copy…" : "Download a backup"}</button>{/if}
      </div>
      {#if info.selfHosted}
        <p class="text-[13px] leading-relaxed text-muted-foreground">LogIt doesn't back this server up. Everything people sync (workouts, plans, posts, coaching) is in one database on this machine. If the disk fails, the machine is reinstalled or someone runs <code class={code}>docker compose down -v</code>, it's gone. Phones keep their own copy of each person's training, but not of everything else.</p>
        <p class="text-[13px] leading-relaxed text-muted-foreground">Keep copies somewhere else: another disk, another computer, or cloud storage.</p>
        {#if info.canDownloadBackup}
          <p class="text-[13px] leading-relaxed text-muted-foreground">To make one every night, add this to the server's crontab (<code class={code}>crontab -e</code>) with your <code class={code}>ADMIN_KEY</code> from .env, and point the path somewhere that isn't this disk:</p>
          <pre class="overflow-x-auto rounded-[10px] bg-muted px-3.5 py-3 font-mono text-xs">0 3 * * * curl -sf -H "X-Admin-Key: YOUR_ADMIN_KEY" http://localhost:8080/admin/api/server/backup -o /mnt/backup/logit-$(date +\%F).db</pre>
        {:else}
          <p class="text-[13px] leading-relaxed text-muted-foreground">This server uses Postgres. To make a copy, run this next to docker-compose.yml (or every night from cron), and keep the file somewhere that isn't this disk:</p>
          <pre class="overflow-x-auto rounded-[10px] bg-muted px-3.5 py-3 font-mono text-xs">docker compose exec -T postgres pg_dump -U logit logit &gt; logit-$(date +%F).sql</pre>
        {/if}
      {:else}
        <p class="text-[13px] text-muted-foreground">This server is backed up by its hosting setup (deploy/production/README.md), not from here.</p>
      {/if}
    </section>

    <section aria-labelledby="this" class="{card} border-border">
      <h2 id="this" class="text-[15px] font-semibold">This server</h2>
      <div>
        <div class={row}>
          <span class="w-[150px] text-muted-foreground">Version</span>
          <span class="min-w-0 flex-[1_1_240px]">{#if info.version.commit}Built from <code class={code}>{info.version.commit.slice(0, 7)}</code>{:else}Built{/if} on {shortDate(at(info.version.builtAt))}</span>
          <a class="{btn} bg-muted hover:bg-accent" href={info.version.commit ? `${REPO}/compare/${info.version.commit}...main` : `${REPO}/commits/main`} target="_blank" rel="noopener">What's new since</a>
        </div>
        <div class={row}><span class="w-[150px] text-muted-foreground">Database</span><span>{info.database.provider} · {size(info.database.sizeBytes)}</span></div>
        <div class={row}><span class="w-[150px] text-muted-foreground">Running since</span><span>{shortDate(at(info.startedAt))} ({ago(at(info.startedAt))})</span></div>
        <div class={row}><span class="w-[150px] text-muted-foreground">Holds</span><span>{info.holds.people} {info.holds.people === 1 ? "person" : "people"} · {info.holds.workouts.toLocaleString()} workout{info.holds.workouts === 1 ? "" : "s"} · {info.holds.posts} post{info.holds.posts === 1 ? "" : "s"}</span></div>
      </div>
      {#if !info.version.commit}<p class="text-[13px] text-muted-foreground">To show the exact version, build with <code class={code}>LOGIT_COMMIT=$(git rev-parse --short HEAD) docker compose up -d --build</code>.</p>{/if}
    </section>
  {/if}
</div>
