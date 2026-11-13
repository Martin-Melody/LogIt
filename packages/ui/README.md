# @logit/ui

The look LogIt shares across the phone app (`logit-frontend`), the web dashboard (`logit-web`)
and the website (`website`).

- `@logit/ui/theme.css`: colour variables for light and dark mode, the Tailwind colour names
  (`bg-card`, `text-muted-foreground`, `text-highlight`, …), Inter, the corner radius and base
  styles. Import it straight after Tailwind in each app's `layout.css`:

  ```css
  @import "tailwindcss";
  @import "@logit/ui/theme.css";
  ```

- `@logit/ui/Logo.svelte`: the staircase mark.

Change colours, fonts or the radius here, never in an app's own stylesheet, or the apps drift
apart again (they had: four copies of the theme had different colours by 2026-11).

App-only styling stays in each app: the phone app's page transitions and tour popovers, the
website's page layout.
