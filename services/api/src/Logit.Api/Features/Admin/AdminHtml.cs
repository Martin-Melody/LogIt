namespace Logit.Api.Features.Admin;

public static class AdminHtml
{
    public const string Page = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Logit Admin</title>
          <style>
            *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

            :root {
              --bg: #0f0f0f;
              --surface: #1a1a1a;
              --border: #2a2a2a;
              --border2: #333;
              --text: #e8e8e8;
              --muted: #888;
              --primary: #e8e8e8;
              --accent: #4f8cff;
              --danger: #e05252;
              --success: #52c07a;
              --warn: #e0a952;
              --pro: #c9a84c;
              --studio: #8e6fd1;
              --radius: 4px;
              --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }

            body { background: var(--bg); color: var(--text); font-family: var(--font); font-size: 13px; height: 100dvh; display: flex; flex-direction: column; overflow: hidden; }

            /* ── Login ── */
            #login { display: flex; align-items: center; justify-content: center; flex: 1; }
            .login-box { border: 1px solid var(--border2); border-radius: var(--radius); padding: 32px; width: 320px; }
            .login-box h1 { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
            .login-box p { color: var(--muted); font-size: 12px; margin-bottom: 20px; }
            .login-box label { font-size: 11px; color: var(--muted); display: block; margin-bottom: 5px; }
            .login-box input { width: 100%; background: var(--surface); border: 1px solid var(--border2); border-radius: var(--radius); color: var(--text); font-size: 13px; padding: 8px 10px; outline: none; }
            .login-box input:focus { border-color: var(--accent); }
            .login-box button { width: 100%; margin-top: 12px; }
            #login-error { color: var(--danger); font-size: 12px; margin-top: 8px; }

            /* ── App shell ── */
            #app { display: none; flex-direction: column; flex: 1; overflow: hidden; }
            #app.visible { display: flex; }

            /* ── Top bar ── */
            .topbar { border-bottom: 1px solid var(--border); padding: 0 16px; height: 44px; display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
            .topbar-title { font-size: 13px; font-weight: 600; color: var(--muted); letter-spacing: .05em; }
            .topbar-title span { color: var(--text); }
            .stats { display: flex; gap: 20px; margin-left: auto; }
            .stat { display: flex; flex-direction: column; align-items: flex-end; }
            .stat-val { font-size: 13px; font-weight: 600; }
            .stat-label { font-size: 10px; color: var(--muted); letter-spacing: .04em; text-transform: uppercase; }
            .stat-button { background: var(--surface); border: 1px solid var(--border2); border-radius: 6px; padding: 3px 9px; }
            .mode-pill { margin-left: 12px; font-size: 11px; font-weight: 600; border-radius: 999px; padding: 2px 8px; }
            .mode-pill.invite { color: #FFB900; background: rgba(255,185,0,.1); border: 1px solid rgba(255,185,0,.3); }
            .mode-pill.open { color: var(--muted); border: 1px solid var(--border2); }
            /* ── Invites ── */
            .inv-form { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; margin: 12px 0 14px; }
            .inv-form .field-group { display: flex; flex-direction: column; gap: 4px; }
            .inv-form .field-label { font-size: 11px; color: var(--muted); }
            .inv-table { width: 100%; border-collapse: collapse; }
            .inv-table th { text-align: left; font-size: 10px; letter-spacing: .06em; color: var(--muted); font-weight: 600; padding: 8px 10px; text-transform: uppercase; }
            .inv-table td { padding: 8px 10px; border-top: 1px solid var(--border); vertical-align: middle; }
            .inv-table tr.dim td { color: var(--muted); }
            .inv-table a { color: var(--text); text-decoration: underline; text-decoration-color: var(--border2); text-underline-offset: 2px; }
            .inv-table a:hover { text-decoration-color: var(--text); }
            .inv-table tr.fresh td { background: rgba(82,192,122,.06); }
            .code { font-family: ui-monospace, Menlo, monospace; letter-spacing: .08em; }
            .badge-status { font-size: 11px; border-radius: 999px; padding: 2px 8px; background: var(--surface); color: var(--muted); }
            .badge-status.active { color: var(--success); background: rgba(82,192,122,.12); }
            .inv-created { display: flex; flex-wrap: wrap; gap: 24px; border: 1px solid rgba(82,192,122,.4); border-radius: 8px; padding: 16px; margin-bottom: 14px; background: var(--surface); }
            .inv-created .big { font-family: ui-monospace, Menlo, monospace; font-size: 30px; font-weight: 600; letter-spacing: .1em; margin: 6px 0; }
            .inv-msg { flex: 1 1 380px; min-width: 0; }
            .inv-msg pre { background: var(--bg); border: 1px solid var(--border2); border-radius: 6px; padding: 12px 14px; font-family: var(--font); font-size: 12px; line-height: 1.6; white-space: pre-wrap; margin-top: 4px; }
            .topbar-logout { color: var(--muted); font-size: 11px; cursor: pointer; border: none; background: none; padding: 0; }
            .topbar-logout:hover { color: var(--text); }

            /* ── Main layout ── */
            .main { display: flex; flex: 1; overflow: hidden; }

            /* ── User list ── */
            .list-panel { width: 100%; border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; transition: width .15s; }
            .list-panel.has-detail { width: 55%; }

            .list-toolbar { padding: 10px 12px; border-bottom: 1px solid var(--border); display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
            .search { flex: 1; background: var(--surface); border: 1px solid var(--border2); border-radius: var(--radius); color: var(--text); font-size: 12px; padding: 6px 10px; outline: none; }
            .search:focus { border-color: var(--accent); }
            .count { color: var(--muted); font-size: 11px; white-space: nowrap; }

            .table-wrap { overflow-y: auto; flex: 1; }
            table { width: 100%; border-collapse: collapse; }
            thead th { position: sticky; top: 0; background: var(--bg); border-bottom: 1px solid var(--border); padding: 7px 12px; text-align: left; font-size: 10px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); white-space: nowrap; }
            tbody tr { border-bottom: 1px solid var(--border); cursor: pointer; transition: background .1s; }
            tbody tr:hover { background: var(--surface); }
            tbody tr.active { background: #1e2535; }
            td { padding: 8px 12px; vertical-align: middle; white-space: nowrap; }

            .user-cell { display: flex; align-items: center; gap: 8px; }
            .avatar { width: 26px; height: 26px; border-radius: 50%; background: var(--border2); border: 1px solid var(--border2); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: var(--muted); flex-shrink: 0; overflow: hidden; }
            .avatar img { width: 100%; height: 100%; object-fit: cover; }
            .username { font-weight: 500; }
            .email { color: var(--muted); font-size: 11px; }
            .tier-badge { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 3px; border: 1px solid; }
            .tier-free { color: var(--muted); border-color: var(--border2); }
            .tier-pro { color: var(--pro); border-color: var(--pro); }
            .tier-studio { color: var(--studio); border-color: var(--studio); }
            .num { color: var(--muted); text-align: right; font-variant-numeric: tabular-nums; }
            .relation-item { display: flex; align-items: center; justify-content: space-between; border: 1px solid var(--border); border-radius: var(--radius); padding: 6px 10px; margin-bottom: 6px; font-size: 12px; }
            .relation-status { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 3px; border: 1px solid; text-transform: uppercase; letter-spacing: .03em; }
            .status-active { color: var(--success); border-color: var(--success); }
            .status-pending { color: var(--warn); border-color: var(--warn); }
            .status-revoked { color: var(--muted); border-color: var(--border2); }

            /* ── Detail panel ── */
            .detail-panel { width: 45%; display: none; flex-direction: column; overflow: hidden; background: var(--surface); }
            .detail-panel.visible { display: flex; }

            .detail-header { padding: 12px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
            .detail-avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--border2); border: 1px solid var(--border2); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: var(--muted); overflow: hidden; flex-shrink: 0; }
            .detail-avatar img { width: 100%; height: 100%; object-fit: cover; }
            .detail-name { font-weight: 600; font-size: 14px; }
            .detail-meta { font-size: 11px; color: var(--muted); }
            .detail-close { margin-left: auto; border: none; background: none; color: var(--muted); cursor: pointer; font-size: 18px; line-height: 1; padding: 2px 4px; }
            .detail-close:hover { color: var(--text); }

            .detail-stats { display: grid; grid-template-columns: repeat(4, 1fr); border-bottom: 1px solid var(--border); }
            .detail-stat { padding: 10px 12px; border-right: 1px solid var(--border); }
            .detail-stat:last-child { border-right: none; }
            .detail-stat-val { font-size: 16px; font-weight: 700; }
            .detail-stat-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; margin-top: 2px; }

            .detail-body { flex: 1; overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 16px; }

            .field-group { display: flex; flex-direction: column; gap: 3px; }
            .field-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; font-weight: 600; }
            .field-input { background: var(--bg); border: 1px solid var(--border2); border-radius: var(--radius); color: var(--text); font-size: 12px; padding: 6px 8px; outline: none; width: 100%; font-family: var(--font); resize: vertical; }
            .field-input:focus { border-color: var(--accent); }
            .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            select.field-input { cursor: pointer; }

            .posts-section h3 { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 8px; }
            .post-item { border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 10px; margin-bottom: 6px; }
            .post-type { font-size: 10px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
            .post-body { font-size: 12px; color: var(--text); margin-top: 3px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
            .post-footer { display: flex; justify-content: space-between; margin-top: 4px; color: var(--muted); font-size: 10px; }

            /* ── Actions ── */
            .detail-actions { border-top: 1px solid var(--border); padding: 12px 16px; display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; }
            #save-msg { font-size: 11px; color: var(--success); align-self: center; margin-left: 4px; }
            #save-err { font-size: 11px; color: var(--danger); align-self: center; margin-left: 4px; }

            /* ── Buttons ── */
            button, .btn { font-family: var(--font); font-size: 12px; font-weight: 500; padding: 6px 12px; border-radius: var(--radius); border: 1px solid var(--border2); cursor: pointer; transition: opacity .1s, background .1s; background: var(--surface); color: var(--text); }
            button:hover, .btn:hover { opacity: .85; }
            button:disabled, .btn:disabled { opacity: .4; cursor: default; }
            .btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
            .btn-danger { background: var(--danger); border-color: var(--danger); color: #fff; }
            .btn-warn { background: transparent; border-color: var(--warn); color: var(--warn); }
            .btn-sm { padding: 4px 8px; font-size: 11px; }

            /* ── Empty / loading ── */
            .empty { display: flex; align-items: center; justify-content: center; color: var(--muted); padding: 60px 20px; font-size: 12px; }
          </style>
        </head>
        <body>

        <!-- Login -->
        <div id="login">
          <div class="login-box">
            <h1>Logit Admin</h1>
            <p>Enter your admin key to continue.</p>
            <label for="key-input">Admin key</label>
            <input id="key-input" type="password" placeholder="••••••••••••" autocomplete="off" />
            <button class="btn-primary" onclick="tryLogin()" style="width:100%;margin-top:12px;">Continue</button>
            <p id="login-error"></p>
          </div>
        </div>

        <!-- App -->
        <div id="app">
          <div class="topbar">
            <span class="topbar-title">LOGIT <span>ADMIN</span><span id="signup-mode" class="mode-pill" style="display:none"></span></span>
            <div class="stats">
              <div class="stat"><span class="stat-val" id="stat-users">—</span><span class="stat-label">Users</span></div>
              <div class="stat"><span class="stat-val" id="stat-posts">—</span><span class="stat-label">Posts</span></div>
              <div class="stat"><span class="stat-val" id="stat-tokens">—</span><span class="stat-label">Active logins</span></div>
              <div class="stat"><span class="stat-val" id="stat-workouts">—</span><span class="stat-label">Workouts</span></div>
              <button type="button" class="stat stat-button" id="stat-invites-wrap" style="display:none" onclick="toggleInvites()"><span class="stat-val" id="stat-invites">—</span><span class="stat-label">Invites</span></button>
              <div class="stat" style="cursor:pointer" onclick="toggleReports()"><span class="stat-val" id="stat-reports">—</span><span class="stat-label">Open reports</span></div>
              <div class="stat" id="stat-diagnostics-wrap" style="cursor:pointer" onclick="toggleDiagnostics()"><span class="stat-val" id="stat-diagnostics">—</span><span class="stat-label">Diagnostics</span></div>
            </div>
            <button class="topbar-logout" onclick="logout()">Sign out</button>
          </div>

          <!-- Reports panel -->
          <div id="reports-panel" style="display:none;padding:16px 20px;border-bottom:1px solid var(--border);max-height:40vh;overflow-y:auto">
            <h3 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Open reports</h3>
            <div id="reports-list"></div>
          </div>

          <!-- Invites panel -->
          <div id="invites-panel" style="display:none;padding:16px 20px;border-bottom:1px solid var(--border);max-height:70vh;overflow-y:auto">
            <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px">
              <h3 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Invites</h3>
              <span id="invites-note" style="font-size:12px;color:var(--muted)"></span>
            </div>
            <form class="inv-form" onsubmit="event.preventDefault(); createInvite();">
              <div class="field-group" style="flex:1 1 240px">
                <label class="field-label" for="inv-note">Who it's for (optional)</label>
                <input class="field-input" id="inv-note" maxlength="200" placeholder="e.g. Sarah, or gym group" />
              </div>
              <div class="field-group">
                <label class="field-label" for="inv-uses">Uses</label>
                <select class="field-input" id="inv-uses"><option value="1">1 person</option><option value="5">5 people</option><option value="10">10 people</option><option value="25">25 people</option></select>
              </div>
              <div class="field-group">
                <label class="field-label" for="inv-exp">Expires</label>
                <select class="field-input" id="inv-exp"><option value="7">In 7 days</option><option value="30">In 30 days</option><option value="">Never</option></select>
              </div>
              <button type="submit" class="btn-primary" id="inv-create">Create invite</button>
              <span id="inv-err" style="color:var(--danger);font-size:12px"></span>
            </form>
            <div id="inv-created" class="inv-created" style="display:none"></div>
            <div style="overflow-x:auto;border:1px solid var(--border);border-radius:6px">
              <table class="inv-table">
                <thead><tr><th>Code</th><th>For</th><th>Used</th><th>Expires</th><th>Status</th><th>Signed up</th><th><span style="position:absolute;left:-9999px">Actions</span></th></tr></thead>
                <tbody id="inv-rows"></tbody>
              </table>
              <div id="inv-empty" class="empty" style="display:none;padding:14px">No invites yet.</div>
            </div>
          </div>

          <!-- Diagnostics reports panel -->
          <div id="diagnostics-panel" style="display:none;padding:16px 20px;border-bottom:1px solid var(--border);max-height:60vh;overflow-y:auto">
            <h3 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Diagnostics reports (kept 30 days)</h3>
            <div id="diagnostics-list"></div>
            <pre id="diagnostics-log" style="display:none;margin-top:12px;padding:10px;background:var(--surface,#111);border:1px solid var(--border);border-radius:6px;font-size:11px;line-height:1.45;white-space:pre-wrap;word-break:break-all;max-height:50vh;overflow:auto"></pre>
          </div>

          <div class="main">
            <!-- User list -->
            <div class="list-panel" id="list-panel">
              <div class="list-toolbar">
                <input class="search" id="search" type="search" placeholder="Search users…" oninput="onSearch()" />
                <span class="count" id="user-count"></span>
              </div>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Tier</th>
                      <th style="text-align:right">Posts</th>
                      <th style="text-align:right">Followers</th>
                      <th style="text-align:right">Workouts</th>
                      <th>Last active</th>
                      <th>Joined</th>
                    </tr>
                  </thead>
                  <tbody id="user-table"></tbody>
                </table>
                <div id="table-empty" class="empty" style="display:none">No users found.</div>
              </div>
            </div>

            <!-- Detail panel -->
            <div class="detail-panel" id="detail-panel">
              <div class="detail-header">
                <div class="detail-avatar" id="d-avatar"></div>
                <div>
                  <div class="detail-name" id="d-name"></div>
                  <div class="detail-meta" id="d-meta"></div>
                </div>
                <button class="detail-close" onclick="closeDetail()">×</button>
              </div>
              <div class="detail-stats">
                <div class="detail-stat"><div class="detail-stat-val" id="ds-posts">—</div><div class="detail-stat-label">Posts</div></div>
                <div class="detail-stat"><div class="detail-stat-val" id="ds-followers">—</div><div class="detail-stat-label">Followers</div></div>
                <div class="detail-stat"><div class="detail-stat-val" id="ds-following">—</div><div class="detail-stat-label">Following</div></div>
                <div class="detail-stat"><div class="detail-stat-val" id="ds-tokens">—</div><div class="detail-stat-label">Active logins</div></div>
                <div class="detail-stat"><div class="detail-stat-val" id="ds-sessions">—</div><div class="detail-stat-label">Workouts</div></div>
                <div class="detail-stat"><div class="detail-stat-val" id="ds-splits">—</div><div class="detail-stat-label">Splits</div></div>
                <div class="detail-stat"><div class="detail-stat-val" id="ds-exercises">—</div><div class="detail-stat-label">Exercises</div></div>
                <div class="detail-stat"><div class="detail-stat-val" id="ds-lastactive">—</div><div class="detail-stat-label">Last active</div></div>
              </div>
              <div class="detail-body">
                <div class="field-row">
                  <div class="field-group">
                    <label class="field-label">Username</label>
                    <input class="field-input" id="f-username" readonly style="opacity:.5;cursor:default" />
                  </div>
                  <div class="field-group">
                    <label class="field-label">Tier</label>
                    <select class="field-input" id="f-tier">
                      <option value="Free">Free</option>
                      <option value="Pro">Pro</option>
                      <option value="Studio">Studio</option>
                    </select>
                  </div>
                </div>
                <div class="field-group">
                  <label class="field-label">Display name</label>
                  <input class="field-input" id="f-displayname" />
                </div>
                <div class="field-group">
                  <label class="field-label">Email</label>
                  <input class="field-input" id="f-email" type="email" />
                </div>
                <div class="field-group">
                  <label class="field-label">Bio</label>
                  <textarea class="field-input" id="f-bio" rows="3"></textarea>
                </div>
                <div class="posts-section" id="coaching-section" style="display:none">
                  <h3>Coaching</h3>
                  <div id="d-coaching"></div>
                </div>
                <div class="posts-section">
                  <h3>Recent posts</h3>
                  <div id="d-posts"></div>
                </div>
              </div>
              <div class="detail-actions">
                <button class="btn-primary" onclick="saveUser()">Save changes</button>
                <button class="btn-warn" onclick="revokeSessions()">Revoke sessions</button>
                <button class="btn-danger" onclick="deleteUser()">Delete account</button>
                <span id="save-msg"></span>
                <span id="save-err"></span>
              </div>
            </div>
          </div>
        </div>

        <script>
          let KEY = sessionStorage.getItem('admin_key') || '';
          let users = [];
          let selectedId = null;
          let searchTimer = null;

          // ── Auth ──────────────────────────────────────────────────────────
          async function tryLogin() {
            const k = document.getElementById('key-input').value.trim();
            if (!k) return;
            const res = await fetch('/admin/api/stats', { headers: { 'X-Admin-Key': k } });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              document.getElementById('login-error').textContent =
                res.status === 429 ? (body.error || 'Too many wrong keys. Try again later.') : 'Invalid key.';
              return;
            }
            KEY = k;
            sessionStorage.setItem('admin_key', k);
            document.getElementById('login').style.display = 'none';
            document.getElementById('app').classList.add('visible');
            await loadAll();
          }

          function logout() {
            sessionStorage.removeItem('admin_key');
            KEY = '';
            document.getElementById('login').style.display = 'flex';
            document.getElementById('app').classList.remove('visible');
            document.getElementById('key-input').value = '';
          }

          document.getElementById('key-input').addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });

          // Auto-login if key in session
          if (KEY) {
            fetch('/admin/api/stats', { headers: { 'X-Admin-Key': KEY } }).then(r => {
              if (r.ok) {
                document.getElementById('login').style.display = 'none';
                document.getElementById('app').classList.add('visible');
                loadAll();
              } else {
                sessionStorage.removeItem('admin_key');
                KEY = '';
              }
            });
          }

          // ── Data ──────────────────────────────────────────────────────────
          async function api(path, opts = {}) {
            const res = await fetch('/admin/api' + path, {
              ...opts,
              headers: { 'X-Admin-Key': KEY, 'Content-Type': 'application/json', ...(opts.headers || {}) },
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              throw new Error(body.error || `HTTP ${res.status}`);
            }
            if (res.status === 204) return null;
            return res.json();
          }

          async function loadAll() {
            await Promise.all([loadStats(), loadUsers(), loadReports(), loadServer()]);
          }

          // ── Server settings + invites ─────────────────────────────────────
          let server = null;
          let invites = [];
          let freshInviteId = null;

          // SQLite hands dates back without a time zone; they are UTC.
          function utc(iso) { return iso && !/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso + 'Z' : iso; }
          function shortDate(iso) { return new Date(utc(iso)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }

          async function loadServer() {
            server = await api('/server');
            const pill = document.getElementById('signup-mode');
            const invite = server.registrationMode === 'invite';
            pill.textContent = invite ? 'Sign-ups: invite-only' : 'Sign-ups: open';
            pill.className = 'mode-pill ' + (invite ? 'invite' : 'open');
            pill.style.display = '';
            document.getElementById('stat-invites-wrap').style.display = invite ? '' : 'none';
            document.getElementById('invites-note').textContent = invite
              ? 'New accounts need an invite code. To let anyone sign up, set REGISTRATION_MODE=open in .env and restart.'
              : 'Sign-ups are open, so invites aren\'t needed. Set REGISTRATION_MODE=invite in .env to require them.';
            // Self-hosted servers have no plans or diagnostics reports: hide those controls.
            if (server.selfHosted) {
              document.getElementById('stat-diagnostics-wrap').style.display = 'none';
              const tier = document.getElementById('f-tier');
              if (tier) tier.closest('.field-group').style.display = 'none';
            }
            if (invite) await loadInvites();
          }

          async function loadInvites() {
            invites = await api('/invites');
            document.getElementById('stat-invites').textContent = invites.filter(i => i.status === 'active').length;
            renderInvites();
          }

          function toggleInvites() {
            const p = document.getElementById('invites-panel');
            p.style.display = p.style.display === 'none' ? 'block' : 'none';
          }

          function inviteMessage(i) {
            const uses = i.maxUses === 1 ? 'works once' : `works for ${i.maxUses} people`;
            const until = i.expiresAt ? `, until ${shortDate(i.expiresAt)}` : '';
            return `You're invited to my LogIt server.\n\n` +
              `1. Install LogIt from Google Play.\n` +
              `2. Go to Settings › Account, tap “Connect to a different server” and enter:\n` +
              `   ${location.origin}\n` +
              `3. Tap Sign up and use invite code ${i.code}\n` +
              `   (${uses}${until}).`;
          }

          async function copyText(text, btn) {
            try {
              await navigator.clipboard.writeText(text);
            } catch {
              // No clipboard API over plain http: copy through a hidden text box instead.
              const t = document.createElement('textarea');
              t.value = text; document.body.appendChild(t); t.select();
              document.execCommand('copy'); t.remove();
            }
            if (btn) { const old = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = old), 1500); }
          }

          function renderInvites() {
            const rows = document.getElementById('inv-rows');
            document.getElementById('inv-empty').style.display = invites.length ? 'none' : 'block';
            rows.innerHTML = invites.map(i => {
              const active = i.status === 'active';
              const label = { active: 'Active', used: 'Used', expired: 'Expired', revoked: 'Revoked' }[i.status] || i.status;
              const users = i.usedBy.length ? i.usedBy.map(u => `<a href="#" onclick="event.preventDefault(); selectUser('${u.id}')">@${esc(u.username)}</a>`).join(', ') : '—';
              const actions = active
                ? `<button type="button" onclick="copyText(inviteMessage(invites.find(x => x.id === '${i.id}')), this)">Copy message</button>
                   <button type="button" style="border:none;background:none;color:var(--danger)" onclick="revokeInvite('${i.id}')">Revoke</button>`
                : '';
              return `<tr class="${active ? '' : 'dim'} ${i.id === freshInviteId ? 'fresh' : ''}">
                <td class="code">${esc(i.code)}</td>
                <td>${esc(i.note) || '—'}</td>
                <td>${i.useCount} of ${i.maxUses}</td>
                <td>${i.expiresAt ? shortDate(i.expiresAt) : '—'}</td>
                <td><span class="badge-status ${active ? 'active' : ''}">${label}</span></td>
                <td>${users}</td>
                <td style="text-align:right;white-space:nowrap">${actions}</td>
              </tr>`;
            }).join('');
          }

          async function createInvite() {
            const btn = document.getElementById('inv-create');
            const err = document.getElementById('inv-err');
            err.textContent = '';
            btn.disabled = true;
            try {
              const exp = document.getElementById('inv-exp').value;
              const note = document.getElementById('inv-note').value.trim();
              const made = await api('/invites', {
                method: 'POST',
                body: JSON.stringify({ note: note || null, maxUses: Number(document.getElementById('inv-uses').value), expiresInDays: exp ? Number(exp) : null }),
              });
              freshInviteId = made.id;
              document.getElementById('inv-note').value = '';
              await loadInvites();
              const i = invites.find(x => x.id === made.id) || { ...made, note };
              const box = document.getElementById('inv-created');
              const uses = i.maxUses === 1 ? 'Works once' : `Works for ${i.maxUses} people`;
              box.innerHTML = `<div style="flex:0 1 260px">
                  <div style="color:var(--success);font-size:12px;font-weight:600">Invite created${i.note ? ' for ' + esc(i.note) : ''}</div>
                  <div class="big">${esc(i.code)}</div>
                  <div style="color:var(--muted);font-size:12px">${uses}${i.expiresAt ? ' · until ' + shortDate(i.expiresAt) : ' · no expiry'}</div>
                  <div style="display:flex;gap:8px;margin-top:10px">
                    <button type="button" class="btn-primary" id="inv-copy-msg">Copy message</button>
                    <button type="button" id="inv-copy-code">Copy code only</button>
                  </div>
                </div>
                <div class="inv-msg">
                  <div style="font-size:11px;color:var(--muted)">The message, ready to paste into WhatsApp, a text or an email</div>
                  <pre>${esc(inviteMessage(i))}</pre>
                </div>`;
              box.style.display = 'flex';
              document.getElementById('inv-copy-msg').onclick = e => copyText(inviteMessage(i), e.currentTarget);
              document.getElementById('inv-copy-code').onclick = e => copyText(i.code, e.currentTarget);
            } catch (e) {
              err.textContent = e.message;
            } finally {
              btn.disabled = false;
            }
          }

          async function revokeInvite(id) {
            const i = invites.find(x => x.id === id);
            if (!confirm(`Revoke invite ${i ? i.code : ''}? Nobody will be able to sign up with it.`)) return;
            await api('/invites/' + id, { method: 'DELETE' });
            if (freshInviteId === id) document.getElementById('inv-created').style.display = 'none';
            await loadInvites();
          }

          async function loadStats() {
            const s = await api('/stats');
            document.getElementById('stat-users').textContent = s.userCount.toLocaleString();
            document.getElementById('stat-posts').textContent = s.postCount.toLocaleString();
            document.getElementById('stat-tokens').textContent = s.activeTokens.toLocaleString();
            document.getElementById('stat-workouts').textContent = s.workoutCount.toLocaleString();
            document.getElementById('stat-diagnostics').textContent = s.diagnosticsCount.toLocaleString();
          }

          function esc(v) {
            return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
          }
          async function toggleDiagnostics() {
            const p = document.getElementById('diagnostics-panel');
            const open = p.style.display === 'none';
            p.style.display = open ? 'block' : 'none';
            if (open) await loadDiagnostics();
          }
          async function loadDiagnostics() {
            const { reports } = await api('/diagnostics');
            document.getElementById('stat-diagnostics').textContent = reports.length.toLocaleString();
            const el = document.getElementById('diagnostics-list');
            if (!reports.length) { el.innerHTML = '<div class="empty">No diagnostics reports.</div>'; return; }
            el.innerHTML = reports.map(r => `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
                <div><strong>@${esc(r.user.username)}</strong> · ${esc(r.platform)} · ${esc(r.appVersion)} · ${new Date(r.createdAt).toLocaleString()} · ${(r.chars / 1024).toFixed(0)} KB · ref ${esc(r.id.slice(0, 8))}</div>
                ${r.note ? `<div style="font-size:12px;margin-top:2px">${esc(r.note)}</div>` : ''}
                <div style="margin-top:6px;display:flex;gap:6px">
                  <button class="btn-warn" onclick="viewDiagnostics('${esc(r.id)}')">View log</button>
                  <button class="btn-danger" onclick="deleteDiagnostics('${esc(r.id)}')">Delete</button>
                </div>
              </div>`).join('');
          }
          async function viewDiagnostics(id) {
            const r = await api(`/diagnostics/${id}`);
            const pre = document.getElementById('diagnostics-log');
            pre.textContent = r.log;
            pre.style.display = 'block';
            pre.scrollIntoView({ block: 'nearest' });
          }
          async function deleteDiagnostics(id) {
            await api(`/diagnostics/${id}`, { method: 'DELETE' });
            document.getElementById('diagnostics-log').style.display = 'none';
            await loadDiagnostics();
          }

          let reports = [], reportPreviews = {};
          async function loadReports() {
            const data = await api('/reports?status=Open');
            reports = data.reports; reportPreviews = data.previews || {};
            document.getElementById('stat-reports').textContent = reports.length.toLocaleString();
            renderReports();
          }
          function toggleReports() {
            const p = document.getElementById('reports-panel');
            p.style.display = p.style.display === 'none' ? 'block' : 'none';
          }
          function renderReports() {
            const el = document.getElementById('reports-list');
            if (!reports.length) { el.innerHTML = '<div class="empty">No open reports.</div>'; return; }
            el.innerHTML = reports.map(r => {
              const pv = reportPreviews[r.targetId];
              const preview = pv ? `<div style="color:var(--muted);font-size:12px;margin-top:2px">${pv.kind} by @${pv.author}: ${(pv.body||'').slice(0,140).replace(/</g,'&lt;')}${pv.deleted ? ' <em>(already deleted)</em>' : ''}</div>` : '';
              return `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
                <div><strong>${r.reason}</strong> · ${r.targetType} · reported by @${r.reporter.username} · ${new Date(r.createdAt).toLocaleString()}</div>
                ${r.note ? `<div style="font-size:12px;margin-top:2px">${r.note.replace(/</g,'&lt;')}</div>` : ''}
                ${preview}
                <div style="margin-top:6px;display:flex;gap:6px">
                  <button class="btn-danger" onclick="resolveReport('${r.id}','delete-target')">Delete ${r.targetType.toLowerCase()}</button>
                  <button class="btn-warn" onclick="resolveReport('${r.id}','dismiss')">Dismiss</button>
                </div>
              </div>`;
            }).join('');
          }
          async function resolveReport(id, action) {
            await api(`/reports/${id}/resolve`, { method: 'POST', body: JSON.stringify({ action }) });
            await loadReports();
          }

          async function loadUsers(search = '') {
            const q = search ? `?search=${encodeURIComponent(search)}` : '';
            const data = await api(`/users${q}`);
            users = data.users;
            renderTable();
          }

          function onSearch() {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => loadUsers(document.getElementById('search').value), 250);
          }

          // ── Table ─────────────────────────────────────────────────────────
          function renderTable() {
            const tbody = document.getElementById('user-table');
            const empty = document.getElementById('table-empty');
            document.getElementById('user-count').textContent = `${users.length} user${users.length === 1 ? '' : 's'}`;

            if (users.length === 0) {
              tbody.innerHTML = '';
              empty.style.display = 'flex';
              return;
            }
            empty.style.display = 'none';

            tbody.innerHTML = users.map(u => `
              <tr onclick="selectUser('${u.id}')" class="${u.id === selectedId ? 'active' : ''}">
                <td><div class="user-cell">
                  <div class="avatar">${avatar(u)}</div>
                  <div>
                    <div class="username">@${esc(u.username)}</div>
                    ${u.displayName ? `<div class="email">${esc(u.displayName)}</div>` : ''}
                  </div>
                </div></td>
                <td><span class="email">${esc(u.email)}</span></td>
                <td><span class="tier-badge tier-${u.tier.toLowerCase()}">${u.tier}</span></td>
                <td class="num">${u.postCount}</td>
                <td class="num">${u.followerCount}</td>
                <td class="num">${u.sessionCount}</td>
                <td class="email">${u.lastActive ? fmtDate(u.lastActive) : 'Never'}</td>
                <td class="email">${fmtDate(u.createdAt)}</td>
              </tr>`).join('');
          }

          function avatar(u) {
            if (u.avatarUrl) return `<img src="${esc(u.avatarUrl)}" alt="" />`;
            const name = u.displayName || u.username || '?';
            return esc(name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase());
          }

          // ── Detail ────────────────────────────────────────────────────────
          async function selectUser(id) {
            selectedId = id;
            renderTable(); // update active row

            document.getElementById('list-panel').classList.add('has-detail');
            document.getElementById('detail-panel').classList.add('visible');

            clearMsg();

            const u = await api(`/users/${id}`);
            if (!u) return;

            // Header
            document.getElementById('d-avatar').innerHTML = u.avatarUrl
              ? `<img src="${esc(u.avatarUrl)}" alt="" />`
              : esc((u.displayName || u.username || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase());
            document.getElementById('d-name').textContent = u.displayName || u.username;
            document.getElementById('d-meta').textContent = `@${u.username} · joined ${fmtDate(u.createdAt)}`;

            // Stats
            document.getElementById('ds-posts').textContent = u.postCount;
            document.getElementById('ds-followers').textContent = u.followerCount;
            document.getElementById('ds-following').textContent = u.followingCount;
            document.getElementById('ds-tokens').textContent = u.activeTokens;
            document.getElementById('ds-sessions').textContent = u.sessionCount;
            document.getElementById('ds-splits').textContent = u.splitCount;
            document.getElementById('ds-exercises').textContent = u.exerciseCount;
            document.getElementById('ds-lastactive').textContent = u.lastActive ? fmtDate(u.lastActive) : 'Never';

            // Fields
            document.getElementById('f-username').value = u.username;
            document.getElementById('f-displayname').value = u.displayName || '';
            document.getElementById('f-email').value = u.email;
            document.getElementById('f-bio').value = u.bio || '';
            document.getElementById('f-tier').value = u.tier;

            // Coaching relationships
            const coachingSection = document.getElementById('coaching-section');
            const coachingEl = document.getElementById('d-coaching');
            const relations = [
              ...u.coachingClients.map(r => ({ ...r, role: 'Coaches' })),
              ...u.coaches.map(r => ({ ...r, role: 'Coached by' })),
            ];
            if (relations.length === 0) {
              coachingSection.style.display = 'none';
            } else {
              coachingSection.style.display = 'block';
              coachingEl.innerHTML = relations.map(r => `
                <div class="relation-item">
                  <span>${r.role} <strong>@${esc(r.username)}</strong>${r.displayName ? ` (${esc(r.displayName)})` : ''}</span>
                  <span class="relation-status status-${r.status.toLowerCase()}">${r.status}</span>
                </div>`).join('');
            }

            // Posts
            const postsEl = document.getElementById('d-posts');
            if (u.recentPosts.length === 0) {
              postsEl.innerHTML = '<p style="color:var(--muted);font-size:11px">No posts yet.</p>';
            } else {
              postsEl.innerHTML = u.recentPosts.map(p => `
                <div class="post-item">
                  <div class="post-type">${esc(p.type)}</div>
                  ${p.body ? `<div class="post-body">${esc(p.body)}</div>` : ''}
                  <div class="post-footer">
                    <span>${fmtDate(p.createdAt)}</span>
                    <span>♥ ${p.likeCount} · 💬 ${p.commentCount}</span>
                  </div>
                </div>`).join('');
            }
          }

          function closeDetail() {
            selectedId = null;
            document.getElementById('list-panel').classList.remove('has-detail');
            document.getElementById('detail-panel').classList.remove('visible');
            renderTable();
          }

          // ── Actions ───────────────────────────────────────────────────────
          async function saveUser() {
            clearMsg();
            try {
              await api(`/users/${selectedId}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  displayName: document.getElementById('f-displayname').value,
                  email: document.getElementById('f-email').value,
                  bio: document.getElementById('f-bio').value,
                  tier: document.getElementById('f-tier').value,
                }),
              });
              document.getElementById('save-msg').textContent = 'Saved.';
              setTimeout(() => document.getElementById('save-msg').textContent = '', 2000);
              await loadUsers(document.getElementById('search').value);
              renderTable();
            } catch (e) {
              document.getElementById('save-err').textContent = e.message;
            }
          }

          async function revokeSessions() {
            if (!confirm('Revoke all active sessions for this user? They will be signed out on all devices.')) return;
            clearMsg();
            try {
              const res = await api(`/users/${selectedId}/tokens`, { method: 'DELETE' });
              document.getElementById('save-msg').textContent = `${res.revokedCount} session(s) revoked.`;
              document.getElementById('ds-tokens').textContent = '0';
              await loadStats();
            } catch (e) {
              document.getElementById('save-err').textContent = e.message;
            }
          }

          async function deleteUser() {
            const name = document.getElementById('d-name').textContent;
            if (!confirm(`Permanently delete "${name}" and all their data? This cannot be undone.`)) return;
            clearMsg();
            try {
              await api(`/users/${selectedId}`, { method: 'DELETE' });
              closeDetail();
              users = users.filter(u => u.id !== selectedId);
              selectedId = null;
              renderTable();
              await loadStats();
            } catch (e) {
              document.getElementById('save-err').textContent = e.message;
            }
          }

          // ── Helpers ───────────────────────────────────────────────────────
          function clearMsg() {
            document.getElementById('save-msg').textContent = '';
            document.getElementById('save-err').textContent = '';
          }

          function esc(s) {
            return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
          }

          function fmtDate(iso) {
            const d = new Date(iso);
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          }
        </script>
        </body>
        </html>
        """;
}
