<script lang="ts">
  import Logo from "@logit/ui/Logo.svelte";
  import { CONTACT_EMAIL, DASHBOARD_URL, GITHUB_URL } from "$lib/site";

  const columns = [
    { title: "Product", links: [
      { href: "/#features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: DASHBOARD_URL, label: "Web dashboard" },
    ] },
    { title: "Open source", links: [
      { href: "/open-source", label: "Overview" },
      { href: "/self-hosting", label: "Self-hosting" },
      { href: "/docs/plugins", label: "Plugin docs" },
      { href: GITHUB_URL, label: "GitHub" },
    ] },
    { title: "Legal", links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "/delete-account", label: "Delete your account" },
    ] },
  ];
</script>

<footer class="border-t border-border bg-sidebar px-4 py-11 sm:px-6">
  <div class="mx-auto flex max-w-[1080px] flex-wrap justify-between gap-9 text-sm">
    <div class="flex flex-col gap-2.5">
      <span class="flex items-center gap-2 text-base font-semibold text-foreground"><Logo size={22} strokeWidth={1.8} />LogIt</span>
      <a href="mailto:{CONTACT_EMAIL}" class="text-muted-foreground hover:text-foreground">{CONTACT_EMAIL}</a>
    </div>
    <div class="flex flex-wrap gap-x-14 gap-y-8">
      {#each columns as col (col.title)}
        <div class="flex flex-col gap-2.5">
          <span class="font-semibold text-foreground">{col.title}</span>
          {#each col.links as link (link.href)}
            <a href={link.href} class="text-muted-foreground hover:text-foreground">{link.label}</a>
          {/each}
        </div>
      {/each}
    </div>
  </div>
</footer>
