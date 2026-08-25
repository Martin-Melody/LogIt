<div class="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-6">
  <div>
    <a href="/" class="text-xs text-muted-foreground hover:text-foreground">&larr; Home</a>
    <h1 class="text-2xl font-semibold mt-1 mb-2">Self-hosting LogIt</h1>
    <p class="text-sm text-muted-foreground">
      Run your own sync server and web dashboard. Free, no account with us required, and your
      data stays on infrastructure you control.
    </p>
  </div>

  <section class="flex flex-col gap-2 border-t border-border pt-6">
    <h2 class="text-base font-semibold">Requirements</h2>
    <ul class="text-sm text-muted-foreground list-disc pl-5 flex flex-col gap-1">
      <li>
        <a href="https://docs.docker.com/get-docker/" class="underline hover:text-foreground">
          Docker
        </a>
        and Docker Compose (bundled with modern Docker installs)
      </li>
      <li>Somewhere to run it — your own machine for local use, or any server/VPS to make it reachable from your phone</li>
    </ul>
  </section>

  <section class="flex flex-col gap-2 border-t border-border pt-6">
    <h2 class="text-base font-semibold">1. Get the files</h2>
    <pre class="bg-muted border border-border rounded p-3 text-xs overflow-x-auto"><code>git clone https://github.com/Martin-Melody/LogIt.git
cd LogIt</code></pre>
  </section>

  <section class="flex flex-col gap-2 border-t border-border pt-6">
    <h2 class="text-base font-semibold">2. Configure secrets</h2>
    <pre class="bg-muted border border-border rounded p-3 text-xs overflow-x-auto"><code>cp .env.example .env</code></pre>
    <p class="text-sm text-muted-foreground">Edit <code class="bg-muted rounded px-1">.env</code> and fill in:</p>
    <ul class="text-sm text-muted-foreground list-disc pl-5 flex flex-col gap-1">
      <li><code class="bg-muted rounded px-1">JWT_SECRET</code> — generate with <code class="bg-muted rounded px-1">openssl rand -base64 48</code></li>
      <li><code class="bg-muted rounded px-1">ADMIN_KEY</code> — any value you choose, used to access the admin endpoints</li>
    </ul>
    <p class="text-xs text-muted-foreground border border-border rounded p-3">
      <code class="bg-muted rounded px-1">.env</code> is gitignored and never committed — keep
      these values private, they're what protects everyone's accounts on your server.
    </p>
  </section>

  <section class="flex flex-col gap-2 border-t border-border pt-6">
    <h2 class="text-base font-semibold">3. Start it</h2>
    <pre class="bg-muted border border-border rounded p-3 text-xs overflow-x-auto"><code>docker compose up -d</code></pre>
    <p class="text-sm text-muted-foreground">
      This starts two services: the sync API (port <code class="bg-muted rounded px-1">8080</code>)
      and the web analytics dashboard (port <code class="bg-muted rounded px-1">3000</code>).
      Workout data is stored in SQLite, persisted in a Docker volume so it survives restarts.
    </p>
  </section>

  <section class="flex flex-col gap-2 border-t border-border pt-6">
    <h2 class="text-base font-semibold">4. Connect the mobile app</h2>
    <p class="text-sm text-muted-foreground">
      In the LogIt mobile app, go to <strong class="text-foreground">Settings → Connect account</strong>
      and enter your server's address (e.g. <code class="bg-muted rounded px-1">http://192.168.1.10:8080</code>
      on your local network, or your server's public URL/domain if it's reachable from the
      internet). Create an account there — it lives only on your server, nothing is sent
      anywhere else.
    </p>
  </section>

  <section class="flex flex-col gap-2 border-t border-border pt-6">
    <h2 class="text-base font-semibold">5. Use the web dashboard</h2>
    <p class="text-sm text-muted-foreground">
      Open <code class="bg-muted rounded px-1">http://&lt;your-server&gt;:3000</code>, log in
      with the same account, and you'll see the same richer analytics view described on the
      <a href="/" class="underline hover:text-foreground">home page</a> — activity heatmap,
      personal records, and a per-exercise deep dive.
    </p>
  </section>

  <section class="flex flex-col gap-2 border-t border-border pt-6">
    <h2 class="text-base font-semibold">Updating</h2>
    <pre class="bg-muted border border-border rounded p-3 text-xs overflow-x-auto"><code>git pull
docker compose up -d --build</code></pre>
    <p class="text-xs text-muted-foreground border border-border rounded p-3">
      If a release changes the database schema, migrations run automatically on startup — no
      manual step needed. Back up your Docker volume before major version jumps regardless, the
      same way you'd back up any database you care about.
    </p>
  </section>

  <section class="flex flex-col gap-2 border-t border-border pt-6">
    <h2 class="text-base font-semibold">Need more control?</h2>
    <p class="text-sm text-muted-foreground">
      The <code class="bg-muted rounded px-1">docker-compose.yml</code> at the repo root is the
      whole self-host story — read it directly if you want to run the two services differently
      (behind your own reverse proxy, on separate machines, with a different database, etc.).
      Each service also has its own <code class="bg-muted rounded px-1">Dockerfile</code> if
      you'd rather build and run them without Compose at all.
    </p>
  </section>

  <footer class="border-t border-border pt-6 text-xs text-muted-foreground">
    Questions or issues:
    <a href="https://github.com/Martin-Melody/LogIt/issues" class="underline hover:text-foreground">
      open one on GitHub
    </a>.
  </footer>
</div>
