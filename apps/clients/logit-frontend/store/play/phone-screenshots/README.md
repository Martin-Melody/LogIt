# Phone screenshots

Play takes 2–8 phone screenshots; these are 1080 × 1920 (9:16), a caption above a real app screen.

To remake them after the app changes:

1. Capture the app screens with the website's pipeline (sample data, dark mode):
   `apps/clients/website/scripts/screenshots/README.md`, e.g.
   `node capture.mjs <dir> "/|home" "/sessions|sessions" "/progress|progress" "/nutrition|nutrition" "/habits|habits"`
   and, in a run of its own, `node capture.mjs <dir> "/|workout|role:Start Day 3;wait:3000"`.
2. `node ../make-screenshots.mjs <dir>` (captions are at the top of that script).
