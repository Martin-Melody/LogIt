<!-- Writing formatted text: TipTap, stored as Markdown (what `value` holds). Shown anywhere with
     @logit/ui's RichText. For longer writing people keep: forum posts, a coach's agreement and
     About text, group rules. Not for chats, feed posts or form answers.
     Typing Markdown works too: "- " starts a list, "## " a heading, **bold**. -->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { slide } from "svelte/transition";
  import { Editor } from "@tiptap/core";
  import StarterKit from "@tiptap/starter-kit";
  import { Markdown } from "@tiptap/markdown";
  import { Placeholder } from "@tiptap/extensions";
  import BoldIcon from "@lucide/svelte/icons/bold";
  import ItalicIcon from "@lucide/svelte/icons/italic";
  import Heading2Icon from "@lucide/svelte/icons/heading-2";
  import ListIcon from "@lucide/svelte/icons/list";
  import ListOrderedIcon from "@lucide/svelte/icons/list-ordered";
  import QuoteIcon from "@lucide/svelte/icons/quote";
  import LinkIcon from "@lucide/svelte/icons/link";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { cn } from "$lib/utils";

  let {
    value = $bindable(""),
    label,
    placeholder = "",
    maxlength,
    class: className,
  }: {
    value?: string;
    /** The box's accessible name, e.g. "Post". */
    label: string;
    placeholder?: string;
    /** Longest Markdown allowed; a count shows near the end. */
    maxlength?: number;
    class?: string;
  } = $props();

  let element: HTMLDivElement;
  let editor = $state<Editor | null>(null);
  // Bumped on every change, so the buttons' pressed states follow the cursor.
  let version = $state(0);
  let linking = $state(false);
  let href = $state("");

  onMount(() => {
    editor = new Editor({
      element,
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] },
          // Markdown has no underline.
          underline: false,
          link: { openOnClick: false, autolink: true, defaultProtocol: "https", protocols: ["http", "https", "mailto"] },
        }),
        Markdown,
        Placeholder.configure({ placeholder }),
      ],
      content: value,
      contentType: "markdown",
      editorProps: {
        attributes: {
          "aria-label": label,
          "aria-multiline": "true",
          role: "textbox",
          class:
            "min-h-28 px-3 py-2 text-sm leading-relaxed outline-none [&_p]:my-1 [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_a]:text-sky-700 [&_a]:underline dark:[&_a]:text-sky-300 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:text-muted-foreground [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
        },
      },
      onUpdate: ({ editor: e }) => {
        value = e.isEmpty ? "" : e.getMarkdown();
      },
      onTransaction: () => {
        version++;
      },
    });
  });

  onDestroy(() => editor?.destroy());

  // A value set from outside (cleared after posting, a draft loaded) replaces what's shown.
  $effect(() => {
    const v = value;
    if (editor && v !== (editor.isEmpty ? "" : editor.getMarkdown())) editor.commands.setContent(v, { contentType: "markdown" });
  });

  function active(name: string, attrs?: Record<string, unknown>): boolean {
    void version;
    return !!editor?.isActive(name, attrs);
  }

  function openLink() {
    href = (editor?.getAttributes("link").href as string | undefined) ?? "";
    linking = !linking;
  }

  function applyLink(e: Event) {
    e.preventDefault();
    const url = href.trim();
    const chain = editor?.chain().focus().extendMarkRange("link");
    if (!url) chain?.unsetLink().run();
    else chain?.setLink({ href: /^(https?:|mailto:)/i.test(url) ? url : `https://${url}` }).run();
    linking = false;
  }

  const tools = $derived([
    { label: "Bold", icon: BoldIcon, on: active("bold"), run: () => editor?.chain().focus().toggleBold().run() },
    { label: "Italic", icon: ItalicIcon, on: active("italic"), run: () => editor?.chain().focus().toggleItalic().run() },
    { label: "Heading", icon: Heading2Icon, on: active("heading", { level: 2 }), run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: "Bulleted list", icon: ListIcon, on: active("bulletList"), run: () => editor?.chain().focus().toggleBulletList().run() },
    { label: "Numbered list", icon: ListOrderedIcon, on: active("orderedList"), run: () => editor?.chain().focus().toggleOrderedList().run() },
    { label: "Quote", icon: QuoteIcon, on: active("blockquote"), run: () => editor?.chain().focus().toggleBlockquote().run() },
  ]);
  const left = $derived(maxlength ? maxlength - value.length : null);
</script>

<div class={cn("flex flex-col rounded-lg border border-input bg-background focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50", className)}>
  <!-- The buttons keep the cursor where it is (mousedown would take focus out of the text). -->
  <div role="toolbar" aria-label="Formatting" class="flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1">
    {#each tools as t (t.label)}
      <Button type="button" variant="ghost" size="icon-sm" aria-label={t.label} aria-pressed={t.on} title={t.label}
        class={t.on ? "bg-muted text-foreground" : "text-muted-foreground"} onmousedown={(e: MouseEvent) => e.preventDefault()} onclick={t.run}>
        <t.icon class="size-4" />
      </Button>
    {/each}
    <Button type="button" variant="ghost" size="icon-sm" aria-label="Link" aria-pressed={active("link")} aria-expanded={linking} title="Link"
      class={active("link") ? "bg-muted text-foreground" : "text-muted-foreground"} onclick={openLink}>
      <LinkIcon class="size-4" />
    </Button>
  </div>
  {#if linking}
    <form transition:slide={{ duration: 150 }} class="flex items-center gap-2 border-b border-border px-2 py-1.5" onsubmit={applyLink}>
      <Input bind:value={href} placeholder="https://…" aria-label="Link address" class="h-8 flex-1" />
      <Button type="submit" size="sm">{href.trim() ? "Add link" : "Remove link"}</Button>
      <Button type="button" size="sm" variant="ghost" onclick={() => (linking = false)}>Cancel</Button>
    </form>
  {/if}
  <div bind:this={element}></div>
  {#if left !== null && left < 500}
    <p class="px-3 pb-1.5 text-right text-xs {left < 0 ? 'text-destructive' : 'text-muted-foreground'}">{left < 0 ? `${-left} too long` : `${left} left`}</p>
  {/if}
</div>
