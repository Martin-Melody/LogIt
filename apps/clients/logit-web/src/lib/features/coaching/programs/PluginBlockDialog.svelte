<!-- Canvas Q4: a block from a plugin in a program day. Pick one of your workout-block plugins,
     then fill in its own settings (each plugin asks for its own). Clients are asked to allow it
     (PG8); until they do, it shows on their phone as a note. Also edits one. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import OptionSelect from "$lib/components/option-select.svelte";
  import { parseBlockDeclaration, fieldOptions, type BlockDeclaration, type BlockField, type BlockValue } from "@logit/core/domain/blockPlugin";
  import { restText, parseRestText, type ProgramPluginBlock } from "@logit/core/domain/CoachProgram";
  import type { ServedManifest } from "@logit/core/api/pluginsApi";
  import { fetchSource, plugins } from "$lib/features/plugins/pluginData.svelte";

  let { open = $bindable(false), dayName, editing = null, onsave }: {
    open?: boolean;
    dayName: string;
    editing?: ProgramPluginBlock | null;
    onsave: (b: Pick<ProgramPluginBlock, "pluginId" | "name" | "values" | "settingsText" | "entries">) => void;
  } = $props();

  let decls = $state<Record<string, BlockDeclaration | null>>({});
  let picked = $state<string | null>(null);
  let values = $state<Record<string, BlockValue>>({});
  /** How many entries it starts with: 6 rounds, 5 hangs. */
  let count = $state(1);
  let error = $state<string | null>(null);

  const blocks = $derived(plugins.installed.filter((p) => p.manifest.family === "workout-block" && p.enabled));
  const decl = $derived(picked ? (decls[picked] ?? null) : null);

  $effect(() => {
    if (!open) return;
    picked = editing?.pluginId ?? null;
    values = { ...(editing?.values ?? {}) };
    count = editing?.entries ?? 1;
    error = null;
    void plugins.loadInstalls().catch(() => {});
  });
  $effect(() => {
    for (const p of blocks) if (!(p.manifest.id in decls)) void load(p.manifest as unknown as ServedManifest);
  });
  async function load(m: ServedManifest) {
    decls = { ...decls, [m.id]: undefined as unknown as null };
    try {
      decls = { ...decls, [m.id]: parseBlockDeclaration(JSON.parse(await fetchSource(m)), m.id) };
      // Picked while it was loading: its defaults now.
      if (picked === m.id && editing?.pluginId !== m.id && !Object.keys(values).length) choose(m.id);
    } catch {
      decls = { ...decls, [m.id]: null };
    }
  }

  function choose(id: string) {
    picked = id;
    const d = decls[id];
    if (d && editing?.pluginId !== id) values = Object.fromEntries(d.blockFields.filter((f) => f.default !== undefined).map((f) => [f.key, f.default!]));
  }

  function setNumber(f: BlockField, text: string) {
    const n = Number(text.replace(",", "."));
    values = { ...values, [f.key]: text.trim() === "" || !Number.isFinite(n) ? null : n };
  }
  function setDuration(f: BlockField, text: string, el: HTMLInputElement) {
    const s = parseRestText(text);
    if (s === null) {
      el.setCustomValidity("Use 10:00 or 90");
      el.reportValidity();
      return;
    }
    el.setCustomValidity("");
    values = { ...values, [f.key]: s ?? null };
  }

  function save() {
    if (!picked || !decl) return;
    const missing = decl.blockFields.find((f) => !f.optional && (values[f.key] == null || values[f.key] === ""));
    if (missing) {
      error = `${missing.label} is needed.`;
      return;
    }
    const kept = Object.fromEntries(Object.entries(values).filter(([k, v]) => v != null && v !== "" && decl.blockFields.some((f) => f.key === k)));
    const words = decl.blockFields.filter((f) => kept[f.key] != null).map((f) => {
      const v = kept[f.key]!;
      return `${f.label} ${f.type === "duration" && typeof v === "number" ? restText(v) : f.type === "toggle" ? (v ? "yes" : "no") : Array.isArray(v) ? v.join(", ") : String(v)}${f.unit && f.type !== "duration" ? ` ${f.unit}` : ""}`;
    });
    if (count > 1) words.unshift(`${count} ${decl.entry.many.toLowerCase()}`);
    onsave({ pluginId: picked, name: decl.name, values: kept, entries: count > 1 ? count : undefined, settingsText: words.length ? words.join(" · ") : undefined });
    open = false;
  }

  const fieldCls = "h-9 w-full rounded-[9px] border border-input bg-background px-2.5 text-[13px]";
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{editing ? "Block" : "Add a block from a plugin"} on {dayName}</Dialog.Title>
      <Dialog.Description>Blocks that run their own screen in the workout, like a timer or a sport drill.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-1.5" role="radiogroup" aria-label="Block">
        {#each blocks as p (p.manifest.id)}
          {@const d = decls[p.manifest.id]}
          <button type="button" role="radio" aria-checked={picked === p.manifest.id} disabled={d === null}
            onclick={() => choose(p.manifest.id)}
            class="flex flex-col gap-0.5 rounded-[10px] border px-3.5 py-2.5 text-left transition-colors {picked === p.manifest.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'} disabled:opacity-50">
            <span class="flex items-center gap-2 text-[13px] font-semibold">{p.manifest.name}<span class="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{typeof p.manifest.author === "string" ? `by ${p.manifest.author}` : "Plugin"}</span></span>
            <span class="text-xs text-muted-foreground">{d === null ? "Couldn't read this plugin" : (d?.description ?? p.manifest.description ?? "")}</span>
          </button>
        {:else}
          <p class="rounded-[10px] bg-muted px-3.5 py-3 text-[13px] text-muted-foreground">No workout-block plugins added yet. Find one in the community plugins, add it, and it shows here.</p>
        {/each}
      </div>

      {#if decl}
        <div class="flex flex-col gap-3 rounded-[10px] bg-muted/50 px-3.5 py-3">
          <span class="text-[13px] font-semibold">{decl.name} settings</span>
          <div class="flex items-center justify-between gap-3">
            <Label>How many {decl.entry.many.toLowerCase()}</Label>
            <span class="flex items-center gap-1.5">
              <Button variant="outline" size="icon" class="size-8" aria-label="One {decl.entry.one.toLowerCase()} fewer" disabled={count <= 1} onclick={() => (count -= 1)}>−</Button>
              <span class="w-6 text-center tabular-nums" aria-live="polite">{count}</span>
              <Button variant="outline" size="icon" class="size-8" aria-label="One {decl.entry.one.toLowerCase()} more" disabled={count >= 50} onclick={() => (count += 1)}>+</Button>
            </span>
          </div>
          {#each decl.blockFields as f (f.key)}
            {@const v = values[f.key]}
            <div class="flex flex-col gap-1.5">
              <Label for="pb-{f.key}">{f.label}{#if f.optional} <span class="font-normal text-muted-foreground">optional</span>{/if}</Label>
              {#if f.type === "choice"}
                <OptionSelect value={typeof v === "string" ? v : ""} aria-label={f.label} options={fieldOptions(decl, f).map((o) => ({ value: o, label: o }))} onValueChange={(o) => (values = { ...values, [f.key]: o })} />
              {:else if f.type === "toggle"}
                <Switch id="pb-{f.key}" checked={v === true} onCheckedChange={(c) => (values = { ...values, [f.key]: c })} />
              {:else if f.type === "duration"}
                <input id="pb-{f.key}" class={fieldCls} value={typeof v === "number" ? restText(v) : ""} placeholder="10:00" onchange={(e) => setDuration(f, e.currentTarget.value, e.currentTarget)} />
              {:else if f.type === "text"}
                <input id="pb-{f.key}" class={fieldCls} value={typeof v === "string" ? v : ""} onchange={(e) => (values = { ...values, [f.key]: e.currentTarget.value.trim() })} />
              {:else if f.type === "tags"}
                <input id="pb-{f.key}" class={fieldCls} value={Array.isArray(v) ? v.join(", ") : ""} placeholder="Comma between them" onchange={(e) => (values = { ...values, [f.key]: e.currentTarget.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              {:else}
                <input id="pb-{f.key}" class={fieldCls} inputmode="decimal" value={typeof v === "number" ? v : ""} placeholder={f.unit ?? ""} onchange={(e) => setNumber(f, e.currentTarget.value)} />
              {/if}
            </div>
          {:else}
            <p class="text-xs text-muted-foreground">Nothing else to set: they fill in each {decl.entry.one.toLowerCase()} in the workout.</p>
          {/each}
          <p class="text-xs text-muted-foreground">These come from the plugin itself, so each block asks for its own settings.</p>
        </div>
      {/if}
      <p class="text-xs text-muted-foreground">Clients are asked to allow it; until they do, it shows on their phone as a note.</p>
      {#if error}<p class="text-xs text-destructive">{error}</p>{/if}
    </div>
    <Dialog.Footer class="sm:justify-between">
      <Button variant="outline" href="/plugins?family=workout-block">Find more in the community</Button>
      <span class="flex gap-2">
        <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
        <Button disabled={!decl} onclick={save}>{editing ? "Save block" : "Add block"}</Button>
      </span>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
