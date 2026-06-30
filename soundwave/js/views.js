/**
 * SoundWave — Views (Home, Search, Playlist, Liked, Profile)
 */
const Views = (() => {
  let currentView       = 'home';
  let currentPlaylistId = null;
  const $  = id  => document.getElementById(id);
  const esc = s  => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  /* ── View switching ─────────────────────────────────────────── */
  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    $(`${name}View`)?.classList.add('active');
    currentView = name;
    $('topbarSearch').style.display = name==='search' ? 'flex' : 'none';
    document.querySelectorAll('.nav-item').forEach(el =>
      el.classList.toggle('active', el.dataset.view === name)
    );
    $('mainContent').scrollTop = 0;
  }

  function refreshCurrentView() {
    if (currentView==='home')     renderHome();
    else if (currentView==='search')   renderSearch($('searchInput').value);
    else if (currentView==='playlist') renderPlaylist(currentPlaylistId);
    else if (currentView==='liked')    renderLiked();
    else if (currentView==='profile')  {}
  }

  /* ── HOME ───────────────────────────────────────────────────── */
  function showHome() { showView('home'); renderHome(); }

  function renderHome() {
    const view  = $('homeView');
    const songs = Store.getAllSongs();
    const state = Store.getState();
    const hour  = new Date().getHours();
    const greet = hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';
    view.innerHTML = '';

    // Greeting
    const h = document.createElement('h2');
    h.className = 'greeting'; h.textContent = greet;
    view.appendChild(h);

    // Quick access
    const pls   = Store.getAllPlaylists();
    const liked = Store.getLikedSongs();
    if (songs.length || pls.length) appendQuickAccess(view, pls, liked);

    // Recently played
    const recentSongs = state.recentlyPlayed.map(id=>Store.getSong(id)).filter(Boolean);
    if (recentSongs.length) {
      const sec = createSection('Recently played');
      const grid = document.createElement('div'); grid.className='card-grid';
      recentSongs.slice(0,8).forEach(s => grid.appendChild(UI.buildMusicCard(s,{onPlay:song=>playSongInContext(song,recentSongs)})));
      sec.appendChild(grid); view.appendChild(sec);
    }

    // All songs
    if (songs.length) {
      const sec = createSection('Your library');
      sec.appendChild(UI.buildSongListHeader(true));
      const list = document.createElement('div'); list.className='song-list';
      songs.slice(0,30).forEach((s,i) => list.appendChild(
        UI.buildSongRow(s,i,{onPlay:song=>playSongInContext(song,songs),currentId:state.currentSongId})
      ));
      sec.appendChild(list); view.appendChild(sec);
    } else {
      view.appendChild(buildEmptyState(
        'Your library is empty',
        'Upload music to start your collection',
        'Upload Music',
        () => document.getElementById('fileInput').click()
      ));
    }
  }

  function appendQuickAccess(view, pls, liked) {
    const items = [];
    if (liked.length) items.push({ label:'Liked Songs', color:'linear-gradient(135deg,#450af5,#8e8ee5)',
      icon:'<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="#fff"/>',
      action:()=>showLiked()
    });
    pls.slice(0,5).forEach(pl => items.push({ label:pl.name, action:()=>showPlaylist(pl.id) }));
    if (!items.length) return;
    const grid = document.createElement('div'); grid.className='quick-grid';
    items.slice(0,6).forEach(item => {
      const el = document.createElement('div'); el.className='quick-item';
      el.innerHTML=`
        <div class="quick-item-art" style="background:${item.color||'var(--accent)'}">
          ${item.icon?`<svg viewBox="0 0 24 24">${item.icon}</svg>`:`<svg viewBox="0 0 24 24"><path d="M9 19V6l12-3v13M9 19c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12-3c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z" fill="#fff"/></svg>`}
        </div>
        <span>${esc(item.label)}</span>`;
      el.addEventListener('click', item.action);
      grid.appendChild(el);
    });
    view.appendChild(grid);
  }

  /* ── SEARCH ─────────────────────────────────────────────────── */
  function showSearch() { showView('search'); renderSearch(''); }

  function renderSearch(query) {
    const view = $('searchView');
    view.innerHTML = '';

    // YouTube import button
    const ytBtn = document.createElement('button');
    ytBtn.id = 'youtubeImportBtn';
    ytBtn.className = 'upload-btn';
    ytBtn.style.cssText = 'margin:16px 0;display:inline-flex;';
    ytBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" fill="#ff0000"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="#fff"/></svg> Import from YouTube`;
    view.appendChild(ytBtn);

    if (!query.trim()) {
      const sec = createSection('Browse categories');
      const cats = [
        {label:'Your Uploads',    color:'#8d67ab'},
        {label:'Liked Songs',     color:'#450af5'},
        {label:'Recently Added',  color:'#e91429'},
        {label:'Hip-Hop',         color:'#ba5d07'},
        {label:'Electronic',      color:'#0d73ec'},
        {label:'Rock',            color:'#477d95'},
        {label:'Pop',             color:'#148a08'},
        {label:'Jazz',            color:'#e61e32'},
        {label:'Classical',       color:'#503750'},
        {label:'R&B',             color:'#9cf0e1'},
        {label:'Latin',           color:'#e8115b'},
        {label:'Country',         color:'#8c5e00'},
      ];
      const grid = document.createElement('div'); grid.className='search-categories';
      cats.forEach(cat => {
        const card = document.createElement('div'); card.className='category-card';
        card.innerHTML=`<div class="category-card-bg" style="background:${cat.color}"></div>
          <span class="category-card-label">${esc(cat.label)}</span>`;
        card.addEventListener('click',()=>{
          if (cat.label==='Liked Songs') showLiked();
          else if (cat.label==='Your Uploads') showHome();
          else {
            $('searchInput').value = cat.label;
            renderSearch(cat.label);
          }
        });
        grid.appendChild(card);
      });
      sec.appendChild(grid); view.appendChild(sec);
      return;
    }

    const results = Store.searchSongs(query);
    const state   = Store.getState();

    if (!results.length) {
      view.appendChild(buildEmptyState(`No results for "${query}"`, 'Try different keywords or check spelling'));
      return;
    }

    const sec = createSection(`Results for "${query}"`);
    sec.appendChild(UI.buildSongListHeader(true));
    const list = document.createElement('div'); list.className='song-list';
    results.forEach((s,i) => list.appendChild(
      UI.buildSongRow(s,i,{onPlay:song=>playSongInContext(song,results),currentId:state.currentSongId})
    ));
    sec.appendChild(list); view.appendChild(sec);
  }

  /* ── PLAYLIST ────────────────────────────────────────────────── */
  function showPlaylist(id) {
    currentPlaylistId = id;
    showView('playlist');
    renderPlaylist(id);
    UI.renderSidebar();
  }

  function renderPlaylist(id) {
    const pl   = Store.getPlaylist(id);
    if (!pl) { showHome(); return; }
    const songs = Store.getPlaylistSongs(id);
    const state = Store.getState();
    const view  = $('playlistView');
    view.innerHTML = '';

    // Hero
    const hero = document.createElement('div');
    hero.className = 'playlist-hero';
    hero.innerHTML = `
      <div class="playlist-hero-art" id="plHeroArt">
        <svg viewBox="0 0 24 24"><path d="M9 19V6l12-3v13M9 19c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12-3c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>
        <div class="edit-cover-overlay" id="editCoverOverlay">
          <svg viewBox="0 0 24 24" width="28" height="28"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" fill="none"/></svg>
          <span>Change image</span>
        </div>
      </div>
      <div class="playlist-hero-info">
        <div class="playlist-hero-type">Playlist</div>
        <div class="playlist-hero-title" contenteditable="true" id="plTitle" spellcheck="false">${esc(pl.name)}</div>
        <div class="playlist-hero-sub" id="plDesc" contenteditable="true" spellcheck="false">${esc(pl.description||'Add a description…')}</div>
        <div class="playlist-hero-meta">${songs.length} songs${songs.length?' • '+totalDuration(songs):''}</div>
      </div>`;
    view.appendChild(hero);

    // Art
    const artEl = hero.querySelector('#plHeroArt');
    if (songs.length) UI.renderArtImg(songs[0], artEl, 80);

    // Edit cover
    hero.querySelector('#editCoverOverlay').addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type='file'; inp.accept='image/*';
      inp.onchange = async e => {
        const file = e.target.files[0]; if(!file) return;
        await Store.saveCoverBlob('pl_'+id, file);
        Store.updatePlaylist(id,{hasCover:true});
        artEl.innerHTML=`<img src="${URL.createObjectURL(file)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`;
      };
      inp.click();
    });

    // Editable title/desc
    const titleEl = hero.querySelector('#plTitle');
    titleEl.addEventListener('blur', () => {
      const n = titleEl.textContent.trim();
      if (n && n!==pl.name) { Store.updatePlaylist(id,{name:n}); UI.renderSidebar(); UI.toast('Renamed'); }
    });
    titleEl.addEventListener('keydown', e => { if(e.key==='Enter'){e.preventDefault();titleEl.blur();} });

    const descEl = hero.querySelector('#plDesc');
    descEl.addEventListener('blur', () => {
      const n = descEl.textContent.trim();
      if (n !== (pl.description||'Add a description…')) Store.updatePlaylist(id,{description:n});
    });

    // Actions bar
    const actions = document.createElement('div');
    actions.className = 'playlist-actions';
    actions.innerHTML = `
      <button class="play-all-btn" id="plPlayAll">
        <svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>
      </button>
      <button class="icon-btn ctrl-btn" id="plShuffle" title="Shuffle play" style="width:40px;height:40px;">
        <svg viewBox="0 0 24 24"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
      </button>
      <button class="icon-btn ctrl-btn" id="plMore" title="More" style="width:40px;height:40px;">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>
      </button>`;
    view.appendChild(actions);

    actions.querySelector('#plPlayAll').addEventListener('click',() => {
      if (!songs.length) { UI.toast('Playlist is empty'); return; }
      playSongInContext(songs[0], songs);
    });
    actions.querySelector('#plShuffle').addEventListener('click',() => {
      if (!songs.length) return;
      const shuffled = [...songs].sort(()=>Math.random()-0.5);
      playSongInContext(shuffled[0], shuffled);
    });
    actions.querySelector('#plMore').addEventListener('click', e => {
      UI.showContextMenu(e, [
        { label:'Add songs', icon:'<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
          action:()=>showAddSongsModal(id) },
        { type:'sep' },
        { label:'Delete playlist', icon:'<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
          action:()=>{ if(confirm(`Delete "${pl.name}"?`)){ Store.deletePlaylist(id); UI.renderSidebar(); showHome(); UI.toast('Playlist deleted'); } } },
      ]);
    });

    // Song list
    view.appendChild(UI.buildSongListHeader(true));
    if (!songs.length) {
      view.appendChild(buildEmptyState('No songs yet','Add songs to get started','Add Songs',()=>showAddSongsModal(id)));
    } else {
      const list = document.createElement('div'); list.className='song-list';
      songs.forEach((s,i) => {
        const row = UI.buildSongRow(s,i,{onPlay:song=>playSongInContext(song,songs),currentId:state.currentSongId});
        row.addEventListener('contextmenu', e => {
          e.preventDefault();
          UI.showContextMenu(e,[
            { label:'Remove from playlist', icon:'<path d="M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
              action:()=>{ Store.removeFromPlaylist(id,s.id); UI.toast('Removed'); renderPlaylist(id); UI.renderSidebar(); }},
            { type:'sep' },
            { label: s.liked?'Remove from Liked':'Add to Liked', icon:'<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="2" fill="none"/>',
              action:()=>{ Store.toggleLike(s.id); refreshCurrentView(); UI.renderSidebar(); }},
            { label:'Add to queue', icon:'<path d="M3 6h18M3 12h18M3 18h12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
              action:()=>{ Store.addToQueue(s.id); UI.toast('Added to queue'); UI.renderQueue(); }},
          ]);
        });
        list.appendChild(row);
      });
      view.appendChild(list);
    }
  }

  function showAddSongsModal(playlistId) {
    const pl   = Store.getPlaylist(playlistId);
    const avail= Store.getAllSongs().filter(s=>!pl.songIds.includes(s.id));
    if (!avail.length) { UI.toast('All songs already in playlist'); return; }
    UI.showModal(`Add songs to "${pl.name}"`,`
      <div style="max-height:360px;overflow-y:auto;" id="addSongsModalList">
        ${avail.map(s=>`
          <div class="library-item" data-sid="${s.id}" style="padding:8px 12px;">
            <div class="library-item-info">
              <div class="library-item-name">${esc(s.title)}</div>
              <div class="library-item-sub">${esc(s.artist)}</div>
            </div>
            <button class="btn-primary" style="padding:5px 14px;font-size:12px;">Add</button>
          </div>`).join('')}
      </div>`);
    document.querySelectorAll('#addSongsModalList .library-item').forEach(el => {
      el.querySelector('button').addEventListener('click',()=>{
        Store.addToPlaylist(playlistId, el.dataset.sid);
        el.remove();
        UI.toast(`Added`);
        renderPlaylist(playlistId);
        UI.renderSidebar();
      });
    });
  }

  /* ── LIKED ───────────────────────────────────────────────────── */
  function showLiked() { showView('liked'); renderLiked(); }

  function renderLiked() {
    const songs = Store.getLikedSongs();
    const state = Store.getState();
    const view  = $('likedView');
    view.innerHTML = '';

    const hero = document.createElement('div');
    hero.className = 'playlist-hero';
    hero.innerHTML = `
      <div class="playlist-hero-art liked-hero" style="background:linear-gradient(135deg,#450af5,#c4efd9);">
        <svg viewBox="0 0 24 24" width="80" height="80"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="#fff"/></svg>
      </div>
      <div class="playlist-hero-info">
        <div class="playlist-hero-type">Playlist</div>
        <div class="playlist-hero-title">Liked Songs</div>
        <div class="playlist-hero-meta">${songs.length} songs${songs.length?' • '+totalDuration(songs):''}</div>
      </div>`;
    view.appendChild(hero);

    const actions = document.createElement('div');
    actions.className = 'playlist-actions';
    actions.innerHTML = `
      <button class="play-all-btn" id="likedPlayAll">
        <svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>
      </button>
      <button class="icon-btn ctrl-btn" id="likedShuffle" style="width:40px;height:40px;" title="Shuffle">
        <svg viewBox="0 0 24 24"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
      </button>`;
    view.appendChild(actions);
    actions.querySelector('#likedPlayAll').addEventListener('click',()=>{
      if (!songs.length) { UI.toast('No liked songs yet'); return; }
      playSongInContext(songs[0],songs);
    });
    actions.querySelector('#likedShuffle').addEventListener('click',()=>{
      if (!songs.length) return;
      const s=[...songs].sort(()=>Math.random()-0.5);
      playSongInContext(s[0],s);
    });

    if (!songs.length) {
      view.appendChild(buildEmptyState('Songs you like will appear here','Heart a song to add it here'));
    } else {
      view.appendChild(UI.buildSongListHeader(true));
      const list = document.createElement('div'); list.className='song-list';
      songs.forEach((s,i) => list.appendChild(
        UI.buildSongRow(s,i,{onPlay:song=>playSongInContext(song,songs),currentId:state.currentSongId})
      ));
      view.appendChild(list);
    }
  }

  /* ── PROFILE ─────────────────────────────────────────────────── */
  function showProfile(profile, user) {
    showView('profile');
    const view  = $('profileView');
    const songs = Store.getAllSongs();
    const pls   = Store.getAllPlaylists();
    const liked = Store.getLikedSongs();
    const name  = profile?.display_name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Guest';
    const email = user?.email || 'Guest';
    const plan  = profile?.plan || 'free';
    const usedMB  = Math.round((profile?.storage_used||0)/1048576);
    const limitGB = Math.round((profile?.storage_limit||1073741824)/1073741824);
    const pct   = Math.min(100, Math.round((profile?.storage_used||0)/(profile?.storage_limit||1)*100));
    const barClass = pct>90?'danger':pct>70?'warning':'';

    view.innerHTML = `
      <div class="profile-hero">
        <div class="profile-avatar-large">${name.slice(0,2).toUpperCase()}</div>
        <div class="profile-info">
          <h2>${esc(name)}</h2>
          <p>${esc(email)} · <span class="badge badge-${plan}">${plan}</span></p>
          <div class="profile-stats">
            <div class="profile-stat"><div class="profile-stat-num">${songs.length}</div><div class="profile-stat-label">Songs</div></div>
            <div class="profile-stat"><div class="profile-stat-num">${pls.length}</div><div class="profile-stat-label">Playlists</div></div>
            <div class="profile-stat"><div class="profile-stat-num">${liked.length}</div><div class="profile-stat-label">Liked</div></div>
          </div>
        </div>
      </div>

      <div class="profile-sections">
        <div class="profile-section">
          <h3>Storage</h3>
          <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-secondary);margin-bottom:6px;">
            <span>${usedMB} MB used</span><span>${limitGB} GB total</span>
          </div>
          <div class="storage-bar-bg"><div class="storage-bar-fill ${barClass}" style="width:${pct}%"></div></div>
          <p style="font-size:12px;color:var(--text-muted);margin-top:8px;">${pct}% of your storage used</p>
        </div>

        <div class="profile-section">
          <h3>Account</h3>
          <button class="profile-action-btn" id="profileEditName">
            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
            Edit Display Name
          </button>
          <button class="profile-action-btn" id="profileChangePass">
            <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
            Change Password
          </button>
          <button class="profile-action-btn" id="profileExport">
            <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
            Export Library
          </button>
          <button class="profile-action-btn danger" id="profileDeleteAccount">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
            Delete Account
          </button>
        </div>
      </div>
    `;

    $('profileEditName')?.addEventListener('click', () => {
      UI.showModal('Edit Display Name',`
        <div class="form-group">
          <label class="form-label">Display Name</label>
          <input class="form-input" id="newDisplayName" value="${esc(name)}" />
        </div>
        <div class="modal-actions">
          <button class="btn-ghost" onclick="UI.closeModal()">Cancel</button>
          <button class="btn-primary" id="saveDisplayName">Save</button>
        </div>`);
      $('saveDisplayName').addEventListener('click', async () => {
        const newName = $('newDisplayName').value.trim();
        if (!newName) return;
        if (window._supabase && user) {
          await window._supabase.from('profiles').update({ display_name:newName }).eq('id',user.id);
        }
        UI.closeModal(); UI.toast('Name updated — refresh to see changes');
      });
    });

    $('profileChangePass')?.addEventListener('click', () => {
      UI.showModal('Change Password',`
        <div class="form-group">
          <label class="form-label">New Password</label>
          <input class="form-input" id="newPass" type="password" placeholder="Min 8 characters" />
        </div>
        <div class="form-group">
          <label class="form-label">Confirm New Password</label>
          <input class="form-input" id="newPassConf" type="password" placeholder="Repeat password" />
        </div>
        <div id="passError" class="auth-error hidden"></div>
        <div class="modal-actions">
          <button class="btn-ghost" onclick="UI.closeModal()">Cancel</button>
          <button class="btn-primary" id="savePass">Update Password</button>
        </div>`);
      $('savePass').addEventListener('click', async () => {
        const pw = $('newPass').value, conf = $('newPassConf').value;
        if (pw.length < 8) { $('passError').textContent='Min 8 characters'; $('passError').classList.remove('hidden'); return; }
        if (pw !== conf)   { $('passError').textContent='Passwords do not match'; $('passError').classList.remove('hidden'); return; }
        if (window._supabase) {
          const { error } = await window._supabase.auth.updateUser({ password: pw });
          if (error) { $('passError').textContent=error.message; $('passError').classList.remove('hidden'); return; }
        }
        UI.closeModal(); UI.toast('Password updated');
      });
    });

    $('profileExport')?.addEventListener('click', () => {
      const data = { songs:Store.getAllSongs(), playlists:Store.getAllPlaylists(), exported:new Date().toISOString() };
      const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `soundwave_library_${Date.now()}.json`;
      a.click();
    });

    $('profileDeleteAccount')?.addEventListener('click', () => {
      if (!confirm('Delete your account? All your data will be permanently removed.')) return;
      if (!confirm('This cannot be undone. Are you sure?')) return;
      UI.toast('Account deletion requested — contact support@soundwave.app');
    });
  }

  /* ── Helpers ────────────────────────────────────────────────── */
  function playSongInContext(song, contextSongs) {
    const ids = contextSongs.map(s=>s.id);
    Store.setQueue(ids, Math.max(0, ids.indexOf(song.id)));
    AudioEngine.playSong(song);
  }

  function totalDuration(songs) {
    const s = songs.reduce((a,s)=>a+(s.duration||0),0);
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
    return h>0?`${h} hr ${m} min`:`${m} min`;
  }

  function createSection(title) {
    const sec = document.createElement('div');
    sec.style.marginBottom='32px';
    sec.innerHTML=`<div class="section-header"><h2 class="section-title">${esc(title)}</h2></div>`;
    return sec;
  }

  function buildEmptyState(title, sub, btnLabel, btnAction) {
    const div = document.createElement('div');
    div.className='empty-state';
    div.innerHTML=`
      <svg viewBox="0 0 24 24"><path d="M9 19V6l12-3v13M9 19c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12-3c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>
      <h3>${esc(title)}</h3>
      <p>${esc(sub||'')}</p>
      ${btnLabel?`<button class="btn-primary" id="emptyActionBtn">${esc(btnLabel)}</button>`:''}`;
    if (btnLabel && btnAction) {
      setTimeout(()=>{ div.querySelector('#emptyActionBtn')?.addEventListener('click', btnAction); },0);
    }
    return div;
  }

  return {
    showHome, showSearch, showPlaylist, showLiked, showProfile,
    showView, refreshCurrentView,
    renderHome, renderSearch, renderPlaylist, renderLiked,
    playSongInContext,
    getCurrentView:      () => currentView,
    getCurrentPlaylistId:() => currentPlaylistId,
  };
})();
