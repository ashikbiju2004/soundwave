/**
 * SoundWave — Admin Panel Module
 * Full user management, song moderation, stats, settings, audit logs
 */
const Admin = (() => {
  const $ = id => document.getElementById(id);
  let currentTab  = 'overview';
  let allUsers    = [];
  let allSongs    = [];
  let userPage    = 1;
  let songPage    = 1;
  const PAGE_SIZE = 20;

  /* ── Show Panel ─────────────────────────────────────────────── */
  function showPanel() {
    const view = $('adminView');
    if (!view) return;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    view.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === 'admin'));
    renderPanel();
    loadStats();
  }

  function renderPanel() {
    const view = $('adminView');
    view.innerHTML = `
      <div class="admin-header">
        <h1>Admin Panel <span class="admin-badge">Admin</span></h1>
        <button class="upload-btn" id="adminRefreshBtn">
          <svg viewBox="0 0 24 24"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
          Refresh
        </button>
      </div>

      <!-- Stats -->
      <div class="admin-stats" id="adminStats">
        ${['Total Users','Total Songs','Total Plays','Storage Used','Banned Users','New Today'].map(l=>`
          <div class="stat-card">
            <div class="stat-card-num" id="stat_${l.replace(/\s/g,'_')}">—</div>
            <div class="stat-card-label">${l}</div>
          </div>`).join('')}
      </div>

      <!-- Tabs -->
      <div class="admin-tabs">
        ${['overview','users','songs','playlists','logs','settings'].map(t=>`
          <button class="admin-tab-btn${t===currentTab?' active':''}" data-tab="${t}">
            ${t.charAt(0).toUpperCase()+t.slice(1)}
          </button>`).join('')}
      </div>

      <!-- Tab panels -->
      <div id="adminTabPanels">
        <div class="admin-tab-panel${currentTab==='overview'?' active':''}" id="tab_overview"></div>
        <div class="admin-tab-panel${currentTab==='users'?' active':''}"    id="tab_users"></div>
        <div class="admin-tab-panel${currentTab==='songs'?' active':''}"    id="tab_songs"></div>
        <div class="admin-tab-panel${currentTab==='playlists'?' active':''}" id="tab_playlists"></div>
        <div class="admin-tab-panel${currentTab==='logs'?' active':''}"     id="tab_logs"></div>
        <div class="admin-tab-panel${currentTab==='settings'?' active':''}" id="tab_settings"></div>
      </div>
    `;

    // Tab click handlers
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentTab = btn.dataset.tab;
        document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        $(`tab_${currentTab}`)?.classList.add('active');
        loadTab(currentTab);
      });
    });

    $('adminRefreshBtn').addEventListener('click', () => { loadStats(); loadTab(currentTab); });

    // Load initial tab
    loadTab(currentTab);
  }

  /* ── Stats ───────────────────────────────────────────────────── */
  async function loadStats() {
    if (!window._supabase) return renderLocalStats();
    try {
      const { data } = await window._supabase.rpc('admin_get_stats');
      if (!data) return;
      const map = {
        'Total_Users':  data.total_users,
        'Total_Songs':  data.total_songs,
        'Total_Plays':  data.total_plays,
        'Storage_Used': (data.storage_used_gb || 0) + ' GB',
        'Banned_Users': data.banned_users,
        'New_Today':    data.new_users_today,
      };
      Object.entries(map).forEach(([k,v]) => {
        const el = $(`stat_${k}`);
        if (el) el.textContent = v ?? '—';
      });
    } catch(e) { console.warn('[Admin] Stats load failed:', e); renderLocalStats(); }
  }

  function renderLocalStats() {
    const songs = Store.getAllSongs();
    const pls   = Store.getAllPlaylists();
    const map = {
      'Total_Users':'1','Total_Songs': songs.length,
      'Total_Plays':'—','Storage_Used':'Local',
      'Banned_Users':'0','New_Today':'—',
    };
    Object.entries(map).forEach(([k,v]) => {
      const el = $(`stat_${k}`);
      if (el) el.textContent = v;
    });
  }

  /* ── Tab loader ───────────────────────────────────────────────── */
  function loadTab(tab) {
    switch(tab) {
      case 'overview':   renderOverview();   break;
      case 'users':      loadUsers();        break;
      case 'songs':      loadSongs();        break;
      case 'playlists':  loadPlaylists();    break;
      case 'logs':       loadLogs();         break;
      case 'settings':   renderSettings();   break;
    }
  }

  /* ── Overview ────────────────────────────────────────────────── */
  function renderOverview() {
    const panel = $('tab_overview');
    if (!panel) return;
    const songs = Store.getAllSongs();
    const liked = Store.getLikedSongs();
    const pls   = Store.getAllPlaylists();

    panel.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
        <div class="setting-card">
          <div class="setting-card-title">Quick Actions</div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
            <button class="profile-action-btn" id="adminPushCloudBtn">
              <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
              Push All to Cloud
            </button>
            <button class="profile-action-btn" id="adminPullCloudBtn">
              <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
              Pull From Cloud
            </button>
            <button class="profile-action-btn" id="adminExportBtn">
              <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
              Export Library JSON
            </button>
          </div>
        </div>
        <div class="setting-card">
          <div class="setting-card-title">Library Summary</div>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;font-size:13px;">
            <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary)">Total Songs</span><strong>${songs.length}</strong></div>
            <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary)">Liked Songs</span><strong>${liked.length}</strong></div>
            <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary)">Playlists</span><strong>${pls.length}</strong></div>
            <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary)">Total Duration</span><strong>${totalDuration(songs)}</strong></div>
          </div>
        </div>
      </div>

      <div class="setting-card">
        <div class="setting-card-title">Most Played</div>
        <div id="mostPlayedList" style="margin-top:12px;"></div>
      </div>
    `;

    $('adminPushCloudBtn')?.addEventListener('click', async () => {
      if (window.CloudSync) { UI.toast('Uploading…'); await CloudSync.pushAllToCloud(); }
      else UI.toast('Cloud sync not configured');
    });
    $('adminPullCloudBtn')?.addEventListener('click', async () => {
      if (window.CloudSync) { UI.toast('Syncing…'); await CloudSync.pullFromCloud(); }
      else UI.toast('Cloud sync not configured');
    });
    $('adminExportBtn')?.addEventListener('click', exportLibrary);

    // Most played
    const list = $('mostPlayedList');
    const top  = [...songs].sort((a,b)=>(b.play_count||0)-(a.play_count||0)).slice(0,5);
    if (!top.length) { list.innerHTML='<p style="color:var(--text-muted);font-size:13px;">No plays yet</p>'; return; }
    top.forEach((s,i) => {
      const row = document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;';
      row.innerHTML=`<span style="color:var(--text-muted);width:20px;text-align:center;">${i+1}</span>
        <div style="flex:1;overflow:hidden;"><div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${UI.escHtml(s.title)}</div>
        <div style="color:var(--text-secondary);font-size:11px;">${UI.escHtml(s.artist)}</div></div>
        <span style="color:var(--text-muted)">${s.play_count||0} plays</span>`;
      list.appendChild(row);
    });
  }

  /* ── Users ───────────────────────────────────────────────────── */
  async function loadUsers() {
    const panel = $('tab_users');
    if (!panel) return;
    panel.innerHTML = '<div style="padding:20px;color:var(--text-muted);font-size:13px;">Loading users…</div>';

    if (!window._supabase) {
      panel.innerHTML = `<div class="empty-state"><p>Connect Supabase to manage users</p></div>`;
      return;
    }

    try {
      const { data, error } = await window._supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      allUsers = data || [];
      renderUsersTable(allUsers);
    } catch(e) {
      panel.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`;
    }
  }

  function renderUsersTable(users) {
    const panel = $('tab_users');
    const start = (userPage-1)*PAGE_SIZE;
    const page  = users.slice(start, start+PAGE_SIZE);

    panel.innerHTML = `
      <div class="admin-toolbar">
        <div class="admin-search-wrap">
          <svg viewBox="0 0 24 24"><path d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
          <input type="text" id="userSearch" placeholder="Search by name or email…" />
        </div>
        <select class="admin-filter-select" id="userRoleFilter">
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="user">User</option>
        </select>
        <select class="admin-filter-select" id="userStatusFilter">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="banned">Banned</option>
        </select>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr>
            <th>User</th><th>Email</th><th>Role</th><th>Plan</th>
            <th>Storage</th><th>Songs</th><th>Status</th><th>Joined</th><th>Actions</th>
          </tr></thead>
          <tbody id="usersTableBody"></tbody>
        </table>
      </div>
      <div class="admin-pagination">
        <div class="admin-pagination-info">Showing ${start+1}–${Math.min(start+PAGE_SIZE,users.length)} of ${users.length}</div>
        <div class="admin-pagination-btns" id="usersPagination"></div>
      </div>
    `;

    const tbody = $('usersTableBody');
    page.forEach(u => {
      const name    = u.display_name || u.email?.split('@')[0] || '—';
      const usedMB  = Math.round((u.storage_used||0)/1048576);
      const limitGB = ((u.storage_limit||1073741824)/1073741824).toFixed(0);
      const joined  = new Date(u.created_at).toLocaleDateString();
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><div style="display:flex;align-items:center;gap:8px;">
          <div class="tbl-avatar">${name.slice(0,2).toUpperCase()}</div>
          <span>${escHtml(name)}</span></div></td>
        <td style="color:var(--text-secondary)">${escHtml(u.email||'')}</td>
        <td><span class="badge badge-${u.role}">${u.role}</span></td>
        <td><span class="badge badge-${u.plan}">${u.plan}</span></td>
        <td style="font-size:12px;color:var(--text-secondary)">${usedMB}MB / ${limitGB}GB</td>
        <td>—</td>
        <td><span class="badge ${u.is_banned?'badge-banned':'badge-active'}">${u.is_banned?'Banned':'Active'}</span></td>
        <td style="font-size:12px;color:var(--text-secondary)">${joined}</td>
        <td><div class="tbl-actions">
          <button class="tbl-action-btn" title="Edit" data-uid="${u.id}" data-action="edit">
            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
          </button>
          <button class="tbl-action-btn ${u.is_banned?'success':'danger'}" title="${u.is_banned?'Unban':'Ban'}" data-uid="${u.id}" data-action="${u.is_banned?'unban':'ban'}">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><path d="M4.93 4.93l14.14 14.14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
          </button>
          <button class="tbl-action-btn danger" title="Delete user" data-uid="${u.id}" data-action="delete">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
          </button>
        </div></td>
      `;
      tbody.appendChild(tr);
    });

    // Action handlers
    tbody.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleUserAction(btn.dataset.action, btn.dataset.uid));
    });

    // Search filter
    $('userSearch').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      const filtered = allUsers.filter(u =>
        (u.display_name||'').toLowerCase().includes(q) ||
        (u.email||'').toLowerCase().includes(q)
      );
      renderUsersTableBody(filtered);
    });

    // Role filter
    $('userRoleFilter').addEventListener('change', e => {
      const filtered = e.target.value ? allUsers.filter(u => u.role===e.target.value) : allUsers;
      renderUsersTableBody(filtered);
    });

    // Status filter
    $('userStatusFilter').addEventListener('change', e => {
      const filtered = e.target.value==='banned' ? allUsers.filter(u=>u.is_banned)
                     : e.target.value==='active'  ? allUsers.filter(u=>!u.is_banned)
                     : allUsers;
      renderUsersTableBody(filtered);
    });

    renderPagination('usersPagination', users.length, userPage, p => { userPage=p; renderUsersTable(users); });
  }

  function renderUsersTableBody(users) {
    // Quick re-render tbody only (for search/filter)
    userPage = 1;
    renderUsersTable(users);
  }

  async function handleUserAction(action, uid) {
    if (!window._supabase) return;
    if (action === 'edit') { showEditUserModal(uid); return; }
    if (action === 'delete') {
      if (!confirm('Delete this user? This is irreversible.')) return;
      await window._supabase.from('profiles').delete().eq('id', uid);
      UI.toast('User deleted');
      loadUsers();
      return;
    }
    if (action === 'ban') {
      const reason = prompt('Ban reason:');
      if (reason === null) return;
      await window._supabase.rpc('admin_ban_user', { target_id: uid, reason });
      UI.toast('User banned');
      loadUsers();
      return;
    }
    if (action === 'unban') {
      await window._supabase.rpc('admin_unban_user', { target_id: uid });
      UI.toast('User unbanned');
      loadUsers();
    }
  }

  function showEditUserModal(uid) {
    const user = allUsers.find(u => u.id === uid);
    if (!user) return;
    UI.showModal('Edit User', `
      <div class="form-group">
        <label class="form-label">Display Name</label>
        <input class="form-input" id="euName" value="${escHtml(user.display_name||'')}" />
      </div>
      <div class="form-group">
        <label class="form-label">Role</label>
        <select class="form-input" id="euRole">
          <option value="user"  ${user.role==='user' ?'selected':''}>User</option>
          <option value="admin" ${user.role==='admin'?'selected':''}>Admin</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Plan</label>
        <select class="form-input" id="euPlan">
          <option value="free"  ${user.plan==='free' ?'selected':''}>Free</option>
          <option value="pro"   ${user.plan==='pro'  ?'selected':''}>Pro</option>
          <option value="admin" ${user.plan==='admin'?'selected':''}>Admin</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Storage Limit (GB)</label>
        <input class="form-input" id="euStorage" type="number" min="1" max="1000"
          value="${Math.round((user.storage_limit||1073741824)/1073741824)}" />
      </div>
      <div class="modal-actions">
        <button class="btn-ghost" onclick="UI.closeModal()">Cancel</button>
        <button class="btn-primary" id="euSave">Save Changes</button>
      </div>
    `);
    document.getElementById('euSave').addEventListener('click', async () => {
      const newRole    = document.getElementById('euRole').value;
      const newPlan    = document.getElementById('euPlan').value;
      const newName    = document.getElementById('euName').value.trim();
      const storageGB  = parseInt(document.getElementById('euStorage').value)||1;

      if (newRole !== user.role) {
        await window._supabase.rpc('admin_set_role', { target_id: uid, new_role: newRole });
      }
      await window._supabase.from('profiles').update({
        display_name: newName,
        plan: newPlan,
        storage_limit: storageGB * 1073741824,
      }).eq('id', uid);

      UI.closeModal();
      UI.toast('User updated');
      loadUsers();
    });
  }

  /* ── Songs tab ───────────────────────────────────────────────── */
  async function loadSongs() {
    const panel = $('tab_songs');
    if (!panel) return;

    if (!window._supabase) {
      // Local mode — show local songs
      allSongs = Store.getAllSongs();
      renderSongsTable(allSongs);
      return;
    }

    panel.innerHTML = '<div style="padding:20px;color:var(--text-muted);font-size:13px;">Loading songs…</div>';
    try {
      const { data, error } = await window._supabase
        .from('songs')
        .select('*, profiles(display_name,email)')
        .order('added_at', { ascending: false });
      if (error) throw error;
      allSongs = data || [];
      renderSongsTable(allSongs);
    } catch(e) {
      panel.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`;
    }
  }

  function renderSongsTable(songs) {
    const panel  = $('tab_songs');
    const start  = (songPage-1)*PAGE_SIZE;
    const page   = songs.slice(start, start+PAGE_SIZE);

    panel.innerHTML = `
      <div class="admin-toolbar">
        <div class="admin-search-wrap">
          <svg viewBox="0 0 24 24"><path d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
          <input type="text" id="songSearch" placeholder="Search songs…" />
        </div>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr>
            <th>#</th><th>Title</th><th>Artist</th><th>Album</th>
            <th>Owner</th><th>Duration</th><th>Plays</th><th>Added</th><th>Actions</th>
          </tr></thead>
          <tbody id="songsTableBody"></tbody>
        </table>
      </div>
      <div class="admin-pagination">
        <div class="admin-pagination-info">Showing ${start+1}–${Math.min(start+PAGE_SIZE,songs.length)} of ${songs.length}</div>
        <div class="admin-pagination-btns" id="songsPagination"></div>
      </div>
    `;

    const tbody = $('songsTableBody');
    page.forEach((s, i) => {
      const owner = s.profiles?.display_name || s.profiles?.email || 'local';
      const added = new Date(s.added_at||s.addedAt||Date.now()).toLocaleDateString();
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="color:var(--text-muted)">${start+i+1}</td>
        <td><div style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500;">${escHtml(s.title)}</div></td>
        <td style="color:var(--text-secondary)">${escHtml(s.artist)}</td>
        <td style="color:var(--text-secondary);font-size:12px;">${escHtml(s.album||'')}</td>
        <td style="font-size:12px;color:var(--text-secondary)">${escHtml(owner)}</td>
        <td style="font-size:12px;color:var(--text-secondary)">${UI.formatDuration(s.duration||0)}</td>
        <td style="font-size:12px;color:var(--text-secondary)">${s.play_count||0}</td>
        <td style="font-size:12px;color:var(--text-secondary)">${added}</td>
        <td><div class="tbl-actions">
          <button class="tbl-action-btn" title="Play" data-sid="${s.id}" data-action="play">
            <svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>
          </button>
          <button class="tbl-action-btn danger" title="Delete" data-sid="${s.id}" data-action="delete">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
          </button>
        </div></td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleSongAction(btn.dataset.action, btn.dataset.sid));
    });

    $('songSearch').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      renderSongsTable(allSongs.filter(s =>
        s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
      ));
    });

    renderPagination('songsPagination', songs.length, songPage, p => { songPage=p; renderSongsTable(songs); });
  }

  async function handleSongAction(action, sid) {
    if (action === 'play') {
      const song = Store.getSong(sid) || allSongs.find(s=>s.id===sid);
      if (song) { Store.setQueue([sid],0); AudioEngine.playSong(song); }
      return;
    }
    if (action === 'delete') {
      if (!confirm('Delete this song?')) return;
      if (window._supabase) {
        await window._supabase.rpc('admin_delete_song', { song_id: sid }).catch(()=>{});
      }
      Store.deleteSong(sid);
      UI.toast('Song deleted');
      loadSongs();
      UI.renderSidebar();
    }
  }

  /* ── Playlists tab ────────────────────────────────────────────── */
  async function loadPlaylists() {
    const panel = $('tab_playlists');
    if (!panel) return;

    let playlists = Store.getAllPlaylists();

    if (window._supabase) {
      try {
        const { data } = await window._supabase
          .from('playlists')
          .select('*, profiles(display_name,email)')
          .order('created_at', { ascending: false });
        if (data) playlists = data;
      } catch {}
    }

    panel.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr>
            <th>Name</th><th>Owner</th><th>Songs</th><th>Created</th><th>Actions</th>
          </tr></thead>
          <tbody id="plsTableBody"></tbody>
        </table>
      </div>
    `;

    const tbody = $('plsTableBody');
    playlists.forEach(pl => {
      const owner   = pl.profiles?.display_name || pl.profiles?.email || 'local';
      const created = new Date(pl.created_at||pl.createdAt||Date.now()).toLocaleDateString();
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:500">${escHtml(pl.name)}</td>
        <td style="color:var(--text-secondary);font-size:12px">${escHtml(owner)}</td>
        <td>${pl.song_count ?? pl.songIds?.length ?? 0}</td>
        <td style="color:var(--text-secondary);font-size:12px">${created}</td>
        <td><div class="tbl-actions">
          <button class="tbl-action-btn danger" title="Delete" data-plid="${pl.id}" data-action="delete">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
          </button>
        </div></td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this playlist?')) return;
        Store.deletePlaylist(btn.dataset.plid);
        if (window._supabase) {
          await window._supabase.from('playlists').delete().eq('id', btn.dataset.plid).catch(()=>{});
        }
        UI.toast('Playlist deleted');
        loadPlaylists();
        UI.renderSidebar();
      });
    });
  }

  /* ── Logs tab ─────────────────────────────────────────────────── */
  async function loadLogs() {
    const panel = $('tab_logs');
    if (!panel) return;

    if (!window._supabase) {
      panel.innerHTML = '<div class="empty-state"><p>Connect Supabase to view audit logs</p></div>';
      return;
    }

    panel.innerHTML = '<div style="padding:20px;color:var(--text-muted);font-size:13px;">Loading logs…</div>';
    try {
      const { data, error } = await window._supabase
        .from('admin_logs')
        .select('*, profiles(display_name,email)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;

      const logs = data || [];
      if (!logs.length) {
        panel.innerHTML = '<div class="empty-state"><p>No admin actions yet</p></div>';
        return;
      }

      panel.innerHTML = `<div id="logsList"></div>`;
      const list = $('logsList');

      logs.forEach(log => {
        const iconMap = {
          ban_user:    { icon:'M18 6L6 18M6 6l12 12', cls:'ban' },
          unban_user:  { icon:'M22 11.08V12a10 10 0 1 1-5.93-9.14', cls:'role' },
          change_role: { icon:'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', cls:'role' },
          delete_song: { icon:'M3 6h18M19 6l-1 14H6L5 6', cls:'delete' },
        };
        const ico = iconMap[log.action] || { icon:'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2', cls:'info' };
        const admin = log.profiles?.display_name || log.profiles?.email || 'Unknown';
        const time  = new Date(log.created_at).toLocaleString();

        const el = document.createElement('div');
        el.className = 'log-entry';
        el.innerHTML = `
          <div class="log-icon ${ico.cls}">
            <svg viewBox="0 0 24 24"><path d="${ico.icon}" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
          </div>
          <div class="log-body">
            <div class="log-action">${escHtml(log.action.replace(/_/g,' '))}</div>
            <div class="log-detail">by ${escHtml(admin)} · target: ${escHtml(log.target_id||'—')}</div>
          </div>
          <div class="log-time">${time}</div>
        `;
        list.appendChild(el);
      });
    } catch(e) {
      panel.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`;
    }
  }

  /* ── Settings tab ─────────────────────────────────────────────── */
  async function renderSettings() {
    const panel = $('tab_settings');
    if (!panel) return;

    let settings = {};
    if (window._supabase) {
      try {
        const { data } = await window._supabase.from('app_settings').select('*');
        (data||[]).forEach(r => { settings[r.key] = r.value; });
      } catch {}
    }

    panel.innerHTML = `
      <div class="settings-grid">

        <div class="setting-card">
          <div class="setting-card-title">User Registration</div>
          <div class="setting-card-desc">Allow new users to create accounts</div>
          <label class="toggle-switch">
            <input type="checkbox" id="setAllowReg" ${settings['allow_registration']!==false?'checked':''}>
            <div class="toggle-track"></div>
            <div class="toggle-thumb"></div>
          </label>
        </div>

        <div class="setting-card">
          <div class="setting-card-title">Maintenance Mode</div>
          <div class="setting-card-desc">Show maintenance page to non-admin users</div>
          <label class="toggle-switch">
            <input type="checkbox" id="setMaintenance" ${settings['maintenance_mode']===true?'checked':''}>
            <div class="toggle-track"></div>
            <div class="toggle-thumb"></div>
          </label>
        </div>

        <div class="setting-card">
          <div class="setting-card-title">Default Storage (GB)</div>
          <div class="setting-card-desc">Storage limit for new free accounts</div>
          <input class="form-input" id="setDefaultStorage" type="number" min="1" max="100"
            value="${settings['default_storage_gb']||1}" style="margin-top:8px;" />
          <button class="btn-primary" id="saveStorageSetting" style="margin-top:10px;padding:8px 16px;font-size:13px;">Save</button>
        </div>

        <div class="setting-card">
          <div class="setting-card-title">Max File Size (MB)</div>
          <div class="setting-card-desc">Maximum audio file upload size</div>
          <input class="form-input" id="setMaxFile" type="number" min="1" max="500"
            value="${settings['max_file_size_mb']||50}" style="margin-top:8px;" />
          <button class="btn-primary" id="saveMaxFile" style="margin-top:10px;padding:8px 16px;font-size:13px;">Save</button>
        </div>

        <div class="setting-card">
          <div class="setting-card-title">App Name</div>
          <div class="setting-card-desc">Display name shown in the app</div>
          <input class="form-input" id="setAppName" type="text"
            value="${escHtml(settings['app_name']||'SoundWave')}" style="margin-top:8px;" />
          <button class="btn-primary" id="saveAppName" style="margin-top:10px;padding:8px 16px;font-size:13px;">Save</button>
        </div>

      </div>

      <div class="danger-zone" style="margin-top:24px;">
        <h4>Danger Zone</h4>
        <p>These actions are irreversible. Proceed with extreme caution.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn-danger" id="clearAllLogsBtn">Clear Audit Logs</button>
          <button class="btn-danger" id="deleteAllSongsBtn">Delete All Songs</button>
        </div>
      </div>
    `;

    // Toggle settings
    const saveSetting = async (key, value) => {
      if (!window._supabase) { UI.toast('Supabase not connected'); return; }
      await window._supabase.from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() });
      UI.toast('Setting saved');
    };

    $('setAllowReg').addEventListener('change',   e => saveSetting('allow_registration', e.target.checked));
    $('setMaintenance').addEventListener('change', e => saveSetting('maintenance_mode',  e.target.checked));
    $('saveStorageSetting').addEventListener('click', () => saveSetting('default_storage_gb', parseInt($('setDefaultStorage').value)||1));
    $('saveMaxFile').addEventListener('click',    () => saveSetting('max_file_size_mb', parseInt($('setMaxFile').value)||50));
    $('saveAppName').addEventListener('click',    () => saveSetting('app_name', $('setAppName').value.trim()||'SoundWave'));

    $('clearAllLogsBtn').addEventListener('click', async () => {
      if (!confirm('Clear all audit logs?')) return;
      if (window._supabase) await window._supabase.from('admin_logs').delete().neq('id',0);
      UI.toast('Logs cleared');
    });

    $('deleteAllSongsBtn').addEventListener('click', async () => {
      if (!confirm('Delete ALL songs from the platform? This cannot be undone.')) return;
      if (!confirm('Are you absolutely sure?')) return;
      if (window._supabase) await window._supabase.from('songs').delete().neq('id','');
      UI.toast('All songs deleted');
      loadSongs();
    });
  }

  /* ── Pagination ──────────────────────────────────────────────── */
  function renderPagination(containerId, total, current, onPage) {
    const container = $(containerId);
    if (!container) return;
    const pages = Math.ceil(total / PAGE_SIZE);
    if (pages <= 1) return;
    container.innerHTML = '';
    for (let i = 1; i <= Math.min(pages, 10); i++) {
      const btn = document.createElement('button');
      btn.className = `page-btn${i===current?' active':''}`;
      btn.textContent = i;
      btn.addEventListener('click', () => onPage(i));
      container.appendChild(btn);
    }
  }

  /* ── Helpers ──────────────────────────────────────────────────── */
  function exportLibrary() {
    const data = {
      songs:     Store.getAllSongs(),
      playlists: Store.getAllPlaylists(),
      exported:  new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `soundwave_library_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function totalDuration(songs) {
    const s = songs.reduce((a,s) => a+(s.duration||0), 0);
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
    return h>0 ? `${h}h ${m}m` : `${m}m`;
  }

  function escHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { showPanel };
})();
