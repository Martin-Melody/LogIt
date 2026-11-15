<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import * as Alert from "$lib/components/ui/alert";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import type { CoachProgram } from "@logit/core/domain/CoachProgram";
  import { getWebCoachProgramRepo } from "$lib/deps";
  import ProgramEditor from "$lib/features/coaching/ProgramEditor.svelte";

  // One client's own copy of a program. Edits here reach only them.

  const clientId = $derived(page.params.id!);
  const programId = $derived(page.params.programId!);
  const username = $derived(page.url.searchParams.get("u") ?? "");

  let program = $state<CoachProgram | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let confirmDelete = $state(false);

  $effect(() => {
    void programId;
    loading = true;
    getWebCoachProgramRepo()
      .getMyProgram(programId)
      .then((row) => (program = row?.program ?? null))
      .catch((e) => (error = e instanceof Error ? e.message : "Couldn't load the program"))
      .finally(() => (loading = false));
  });

  async function save(next: CoachProgram) {
    await getWebCoachProgramRepo().saveProgram(next, username || undefined);
    program = next;
    toast.success("Saved");
  }

  async function remove() {
    confirmDelete = false;
    try {
      await getWebCoachProgramRepo().deleteProgram(programId);
      await goto(`/clients/${clientId}?tab=programs`);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't delete it";
    }
  }
</script>

<div class="flex flex-col gap-4">
  <div class="flex items-center justify-between gap-3">
    <a href="/clients/{clientId}?tab=programs" class="text-[13px] text-muted-foreground hover:text-foreground">‹ Back to the client</a>
    {#if program}
      <button type="button" onclick={() => (confirmDelete = true)} class="h-[30px] rounded-lg border border-border px-2.5 text-xs text-destructive hover:bg-muted">Delete</button>
    {/if}
  </div>
  {#if error}<Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
  {#if loading}
    <Skeleton class="h-10 w-72" /><Skeleton class="h-80" />
  {:else if !program}
    <p class="text-[13px] text-muted-foreground">This program doesn't exist any more.</p>
  {:else}
    <section class="flex flex-col gap-3.5 rounded-[10px] border border-border bg-card px-[22px] py-5">
      <p class="text-xs text-muted-foreground">@{username}'s copy</p>
      {#key program.id}
        <ProgramEditor {program} mode="copy" onSave={save} />
      {/key}
    </section>
  {/if}
</div>

<AlertDialog.Root bind:open={confirmDelete}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Delete this program?</AlertDialog.Title>
      <AlertDialog.Description>It's removed from @{username}'s phone too. Use "End program" on the client's page instead if you'd like to keep it in their history.</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={remove}>Delete</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
