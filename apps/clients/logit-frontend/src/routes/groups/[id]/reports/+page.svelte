<!-- A group's reports (design canvas D3), for its organisers and moderators: reported messages in
     its chat with why, and Remove / Mute / Keep it. Who reported them is never shown. Reports
     also go to LogIt; "Keep it" only clears one from this list. -->
<script lang="ts">
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { muteItems } from "$lib/features/groups/muteItems";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Check } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { photoSrc } from "@logit/core/api/photosApi";
  import { groupsApi, type Group, type GroupReport } from "@logit/core/api/groupsApi";
  import { forumApi } from "@logit/core/api/forumApi";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import ActionSheet from "$lib/components/ActionSheet.svelte";
  import PersonAvatar from "$lib/components/social/PersonAvatar.svelte";
  import { shortAgo } from "$lib/features/friends/dmTime";
  import { back } from "$lib/navigation";
  import { VolumeX } from "lucide-svelte";

  const id = $derived(page.params.id!);
  let group = $state<Group | null>(null);
  let reports = $state<GroupReport[] | null>(null);
  let error = $state(false);
  let muting = $state<GroupReport | null>(null);
  const REASONS: Record<string, string> = { Spam: "Spam", Harassment: "Harassment", HateSpeech: "Hate speech", Violence: "Violence", SexualContent: "Sexual content", SelfHarm: "Self-harm", Misinformation: "False information", Other: "Something else" };

  async function load() {
    try {
      [group, reports] = await Promise.all([groupsApi.get(id), groupsApi.reports(id)]);
      error = false;
    } catch {
      error = true;
    }
  }
  onMount(load);

  async function act(r: GroupReport, remove: boolean) {
    reports = (reports ?? []).filter((x) => x.messageId !== r.messageId);
    try {
      if (remove && r.kind === "post") await forumApi.moderate(r.messageId, { remove: true });
      else if (remove && r.kind === "comment") await forumApi.removeComment(r.messageId);
      else if (remove) await groupsApi.removeMessage(id, r.messageId);
      else await groupsApi.keep(id, r.messageId);
      toast.success(remove ? "Message removed" : "Kept. It's off the group's list.");
    } catch {
      reports = [r, ...(reports ?? [])];
      toast.error("Couldn't do that. Try again.");
    }
  }

  async function mute(r: GroupReport, minutes: number) {
    if (!r.sender) return;
    try {
      await groupsApi.mute(id, r.sender.username, minutes);
      toast.success(`${r.sender.displayName} is muted in the chat`);
    } catch {
      toast.error("Only organisers can mute other moderators or organisers.");
    }
  }
</script>

<PageHeader>
  <BackButton onclick={() => back(`/groups/${id}`)} />
  <span class="flex min-w-0 flex-col">
    <h1 class="page-title">Reports</h1>
    {#if group && reports}<span class="truncate text-[12px] text-muted-foreground">{group.name} · {reports.length ? `${reports.length} to look at` : "all clear"}</span>{/if}
  </span>
</PageHeader>

<div class="flex flex-col pb-24">
  {#if error}
    <p class="px-4 py-10 text-center text-sm text-muted-foreground">Couldn't load the reports. Only the group's organisers and moderators see them.</p>
  {:else if !reports}
    <div class="flex justify-center py-16"><Spinner class="size-5 text-muted-foreground" /></div>
  {:else if reports.length === 0}
    <div class="flex flex-col items-center gap-2 px-6 py-14 text-center text-muted-foreground"><Check class="size-6" /><p class="text-sm">Nothing to look at. Reported messages in the group's chat show up here.</p></div>
  {:else}
    {#each reports as r (r.messageId)}
      <div class="flex flex-col gap-2.5 border-b border-border px-4 py-3.5">
        <span class="text-[12px] text-muted-foreground">{r.kind === "post" ? "A post · " : r.kind === "comment" ? "A comment · " : ""}{r.reasons.map((x) => REASONS[x] ?? x).join(", ")}{r.count > 1 ? ` · ${r.count} reports` : ""} · {shortAgo(r.latestAtMs, Date.now())} ago</span>
        <div class="flex items-start gap-2.5">
          <PersonAvatar name={r.sender?.displayName ?? null} src={r.sender?.avatarUrl} size={32} />
          <span class="flex min-w-0 flex-col gap-1">
            <span class="text-[13px] font-semibold">{r.sender ? r.sender.displayName || r.sender.username : "Deleted account"}</span>
            {#if r.title}<a href="/social/forum/{r.postId}" class="text-[14px] font-semibold text-inherit">{r.title}</a>{/if}
            {#if r.kind === "comment" && r.postId}<a href="/social/forum/{r.postId}" class="text-[12px] text-muted-foreground">Open the post</a>{/if}
            {#if r.body}<span class="w-fit max-w-full whitespace-pre-wrap break-words rounded-2xl bg-muted px-3 py-2 text-[14px]">{r.body}</span>{/if}
            {#if r.photoUrl}<img src={photoSrc(r.photoUrl)} alt="Reported" class="max-h-48 w-fit rounded-xl border border-border object-contain" />{/if}
          </span>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <button type="button" class="h-10 rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground" onclick={() => act(r, true)}>Remove</button>
          <button type="button" disabled={!r.sender} class="h-10 rounded-lg border border-border text-[13px] font-semibold disabled:opacity-50" onclick={() => (muting = r)}>Mute</button>
          <button type="button" class="h-10 rounded-lg border border-border text-[13px] font-semibold" onclick={() => act(r, false)}>Keep it</button>
        </div>
      </div>
    {/each}
    <p class="mx-4 mt-4 text-[12px] leading-relaxed text-muted-foreground">Who reported a message is never shown. Reports also go to LogIt; Keep it only clears one from this list.</p>
  {/if}
</div>

<ActionSheet
  open={!!muting}
  onOpenChange={(v) => { if (!v) muting = null; }}
  title={muting?.sender ? `Mute ${muting.sender.displayName} in the chat` : ""}
  items={muteItems(muting, (r, min) => void mute(r, min))}
/>
