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
            <span class="topbar-title">LOGIT <span>ADMIN</span></span>
            <div class="stats">
              <div class="stat"><span class="stat-val" id="stat-users">—</span><span class="stat-label">Users</span></div>
              <div class="stat"><span class="stat-val" id="stat-posts">—</span><span class="stat-label">Posts</span></div>
              <div class="stat"><span class="stat-val" id="stat-tokens">—</span><span class="stat-label">Active logins</span></div>
              <div class="stat"><span class="stat-val" id="stat-workouts">—</span><span class="stat-label">Workouts</span></div>
              <div class="stat" style="cursor:pointer" onclick="toggleReports()"><span class="stat-val" id="stat-reports">—</span><span class="stat-label">Open reports</span></div>
            </div>
            <button class="topbar-logout" onclick="logout()">Sign out</button>
          </div>

          <!-- Reports panel -->
          <div id="reports-panel" style="display:none;padding:16px 20px;border-bottom:1px solid var(--border);max-height:40vh;overflow-y:auto">
            <h3 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Open reports</h3>
            <div id="reports-list"></div>
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
              document.getElementById('login-error').textContent = 'Invalid key.';
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
            await Promise.all([loadStats(), loadUsers(), loadReports()]);
          }

          async function loadStats() {
            const s = await api('/stats');
            document.getElementById('stat-users').textContent = s.userCount.toLocaleString();
            document.getElementById('stat-posts').textContent = s.postCount.toLocaleString();
            document.getElementById('stat-tokens').textContent = s.activeTokens.toLocaleString();
            document.getElementById('stat-workouts').textContent = s.workoutCount.toLocaleString();
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
