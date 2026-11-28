<!-- Messages sent for you (canvas MS3): only where something happens without a click from you.
     Each is sent as you, marked "Sent automatically", never to sample clients. Saves as you go,
     like the rest of the profile. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { coachApi, type AutoMessages } from "@logit/core/api/coachApi";
  import { Switch } from "$lib/components/ui/switch";
  import { Textarea } from "$lib/components/ui/textarea";
  import { toast } from "$lib/components/ui/sonner";
  import SavedReplyPicker from "./SavedReplyPicker.svelte";

  const ITEMS = [
    { key: "onStart", title: "When someone starts straight away", sub: "Through a link set to pay and start", hint: "Welcome aboard {first name}! Fill in the start-up form when you get a minute." },
    { key: "onAsk", title: "When someone asks", sub: "An automatic first reply, so they know you've seen it", hint: "Thanks {first name}, I read every request myself and reply within 2 days." },
    { key: "onWaitingList", title: "When someone joins your waiting list", sub: "When your client limit puts them there by itself", hint: "Thanks {first name}, I'm full right now. You're on my waiting list and I'll be in touch." },
  ] as const;

  let s = $state<AutoMessages | null>(null);
  let saved = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  // "{first name}" stays as written; it's filled in when the message goes.
  const fill = { firstName: "{first name}", coachName: "{coach name}" };

  onMount(async () => {
    s = await coachApi.getAutoMessages().catch(() => ({ onStart: { on: false, text: "" }, onAsk: { on: false, text: "" }, onWaitingList: { on: false, text: "" } }));
    saved = JSON.stringify(s);
  });

  $effect(() => {
    const snap = JSON.stringify(s);
    if (!s || snap === saved) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const cur = s!;
      // Switched on with nothing written: wait for the text.
      if ((Object.values(cur) as { on: boolean; text: string }[]).some((m) => m.on && !m.text.trim())) return;
      try {
        await coachApi.saveAutoMessages(cur);
        saved = JSON.stringify(cur);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save");
      }
    }, 800);
  });
</script>

<section class="flex flex-col gap-2 border-t border-border pt-6" aria-labelledby="auto-title">
  <h2 id="auto-title" class="text-base font-semibold">Messages sent for you</h2>
  <p class="text-[13px] text-muted-foreground">Sent as you, marked "Sent automatically" for both of you. Type / for a saved reply; {"{first name}"} becomes their name.</p>
  {#if s}
    {#each ITEMS as it (it.key)}
      {@const m = s[it.key]}
      <div class="flex flex-col gap-2 border-t border-border py-3.5 first-of-type:border-t-0">
        <label class="flex items-center gap-3">
          <span class="flex-1"><span class="block text-sm font-medium">{it.title}</span><span class="text-xs text-muted-foreground">{it.sub}</span></span>
          <Switch checked={m.on} onCheckedChange={(v) => { s![it.key] = { ...m, on: v, text: v && !m.text ? it.hint : m.text }; }} aria-label={it.title} />
        </label>
        {#if m.on}
          <SavedReplyPicker bind:draft={s[it.key].text} {fill} />
          <Textarea rows={3} maxlength={2000} bind:value={s[it.key].text} aria-label="{it.title}: message" />
        {/if}
      </div>
    {/each}
  {/if}
</section>
