/**
 * SoundWave — UI helpers
 */
const UI = (() => {
  const $  = id  => document.getElementById(id);
  const esc = s  => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  /* ── Toast ──────────────────────────────────────────────────── */
  function toast(msg, ms=3000) {
    document.querySelectorAll('.toast').forEach(t=>t.remove());
    const el = document.createElement('div');
    el.className='toast'; el.textContent=msg;
    document.body.appendChild(el);
    setTimeout(()=>el.remove(), ms+300);
  }

  /* ── Time format ────────────────────────────────────────────── */
  function formatTime(s) {
    if (!s||isNaN(s)||!isFinite(s)) return '0:00';
    const m=Math.floor(s/60), sec=Math.floor(s%60);
    return `${m}:${sec.toString().padStart(2,'0')}`;
  }
  function formatDuration(s) { return formatTime(s); }

  /* ── Cover art ──────────────────────────────────────────────── */
  const coverCache = {};

  async function getCoverUrl(song) {
    if (!song) return null;
    if (coverCache[song.id]) return coverCache[song.id];
    if (song.hasCover) {
      const blob = await Store.getCoverBlob(song.id);
      if (blob) { const u=URL.createObjectURL(blob); coverCache[song.id]=u; return u; }
    }
    if (song.thumbnail) return song.thumbnail;
    return null;
  }

  function artPlaceholderSVG(size=40) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}"><path d="M9 19V6l12-3v13M9 19c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12-3c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`;
  }

  async function renderArtImg(song, container, size=40) {
    container.innerHTML = artPlaceholderSVG(size*0.5);
    const url = await getCoverUrl(song);
    if (url) {
      const img=document.createElement('img');
      img.src=url; img.style.cssText='width:100%;height:100%;object-fit:cover;';
      container.innerHTML=''; container.appendChild(img);
    }
  }

  /* ── Player bar ─────────────────────────────────────────────── */
  function updatePlayerSong(song) {
    $('playerTitle').textContent  = song ? song.title  : 'No song playing';
    $('playerArtist').textContent = song ? song.artist : '—';
    if (song) { renderArtImg(song, $('playerArt'), 56); updateLikeButton(song.liked); }
    else $('playerArt').innerHTML = artPlaceholderSVG(24);
  }

  function updatePlayPause(playing) {
    $('playIcon').style.display  = playing ? 'none' : '';
    $('pauseIcon').style.display = playing ? '' : 'none';
  }

  function updateProgress(current, duration) {
    const pct = duration ? Math.min((current/duration)*100,100) : 0;
    $('progressFill').style.width  = `${pct}%`;
    $('progressThumb').style.left  = `${pct}%`;
    $('currentTime').textContent   = formatTime(current);
    $('totalTime').textContent     = formatTime(duration);
  }

  function updateVolume(vol) {
    const pct = Math.round(vol*100);
    $('volFill').style.width  = `${pct}%`;
    $('volThumb').style.left  = `${pct}%`;
  }

  function updateLikeButton(liked) {
    const btn  = $('playerLikeBtn');
    const path = btn?.querySelector('path');
    btn?.classList.toggle('liked', !!liked);
    if (path) path.setAttribute('fill', liked ? 'var(--accent)' : 'none');
  }

  function updateShuffleBtn(on)   { $('shuffleBtn')?.classList.toggle('active', on); }

  function updateRepeatBtn(mode) {
    const btn = $('repeatBtn');
    if (!btn) return;
    btn.classList.toggle('active', mode!=='none');
    btn.title = {none:'Repeat off',all:'Repeat all',one:'Repeat one'}[mode]||'Repeat';
  }

  /* ── Sidebar ─────────────────────────────────────────────────── */
  function renderSidebar() {
    const filter    = document.querySelector('.filter-chip.active')?.dataset.filter||'all';
    const container = $('libraryList');
    if (!container) return;
    container.innerHTML = '';

    if (filter==='all'||filter==='liked') {
      const liked = Store.getLikedSongs();
      container.appendChild(createLibraryItem({
        name:'Liked Songs', sub:`Playlist • ${liked.length} songs`,
        artClass:'liked-art',
        artIcon:'<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="currentColor"/></svg>',
        onClick:()=>Views.showLiked(),
      }));
    }

    if (filter==='all'||filter==='playlists') {
      Store.getAllPlaylists().forEach(pl => {
        const songs = Store.getPlaylistSongs(pl.id);
        container.appendChild(createLibraryItem({
          name:pl.name, sub:`Playlist • ${songs.length} songs`,
          artIcon: artPlaceholderSVG(20),
          songs, onClick:()=>Views.showPlaylist(pl.id),
        }));
      });
    }
  }

  function createLibraryItem({ name, sub, artClass, artIcon, songs, onClick }) {
    const el = document.createElement('div');
    el.className='library-item';
    el.innerHTML=`
      <div class="library-item-art${artClass?' '+artClass:''}">${artIcon}</div>
      <div class="library-item-info">
        <div class="library-item-name">${esc(name)}</div>
        <div class="library-item-sub">${esc(sub)}</div>
      </div>`;
    if (songs?.length) {
      const artEl = el.querySelector('.library-item-art');
      getCoverUrl(songs[0]).then(url => {
        if (url) artEl.innerHTML=`<img src="${url}" style="width:100%;height:100%;object-fit:cover;">`;
      });
    }
    el.addEventListener('click', onClick);
    return el;
  }

  /* ── Context menu ────────────────────────────────────────────── */
  function showContextMenu(e, items) {
    e.preventDefault();
    const menu=$('contextMenu'), list=$('contextMenuList');
    list.innerHTML='';
    items.forEach(item => {
      if (item.type==='sep') { const li=document.createElement('li'); li.className='menu-sep'; list.appendChild(li); return; }
      const li=document.createElement('li');
      li.innerHTML=`${item.icon?`<svg viewBox="0 0 24 24">${item.icon}</svg>`:''}${esc(item.label)}`;
      li.addEventListener('click',()=>{ item.action(); hideContextMenu(); });
      list.appendChild(li);
    });
    menu.classList.remove('hidden');
    const mw=200, x=Math.min(e.clientX,window.innerWidth-mw-8), y=Math.min(e.clientY,window.innerHeight-list.children.length*42-8);
    menu.style.left=`${x}px`; menu.style.top=`${y}px`;
  }

  function hideContextMenu() { $('contextMenu').classList.add('hidden'); }

  /* ── Modal ────────────────────────────────────────────────────── */
  function showModal(title, bodyHTML, { onConfirm }={}) {
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML    = bodyHTML;
    $('modalOverlay').classList.remove('hidden');
    const confirmBtn = $('modalBody').querySelector('[data-confirm]');
    if (confirmBtn && onConfirm) confirmBtn.addEventListener('click',()=>{ onConfirm(); closeModal(); });
  }

  function closeModal() { $('modalOverlay').classList.add('hidden'); $('modalBody').innerHTML=''; }

  /* ── Song row builder ─────────────────────────────────────────── */
  function buildSongRow(song, index, { onPlay, currentId }={}) {
    const isPlaying = song.id === currentId;
    const row = document.createElement('div');
    row.className=`song-row${isPlaying?' playing':''}`;
    row.dataset.id = song.id;
    row.innerHTML=`
      <div class="song-row-num">
        <span class="num-text">${isPlaying?'':index+1}</span>
        <span class="song-row-play-ico">
          ${isPlaying
            ?'<div class="now-playing-bars"><div class="bar"></div><div class="bar"></div><div class="bar"></div></div>'
            :'<svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>'}
        </span>
      </div>
      <div class="song-row-info">
        <div class="song-row-art">${artPlaceholderSVG(18)}</div>
        <div class="song-row-text">
          <div class="song-row-title">${esc(song.title)}</div>
          <div class="song-row-artist">${esc(song.artist)}</div>
        </div>
      </div>
      <div class="song-row-album">${esc(song.album)}</div>
      <div class="song-row-duration">${formatDuration(song.duration)}</div>
      <button class="icon-btn song-row-like${song.liked?' liked':''}" title="${song.liked?'Unlike':'Like'}">
        <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="2" ${song.liked?'fill="var(--accent)"':'fill="none"'}/></svg>
      </button>`;

    renderArtImg(song, row.querySelector('.song-row-art'), 18);

    row.addEventListener('click', e => { if (!e.target.closest('.song-row-like')) onPlay?.(song); });

    row.querySelector('.song-row-like').addEventListener('click', e => {
      e.stopPropagation();
      const updated = Store.toggleLike(song.id);
      const liked   = updated?.liked;
      const btn     = e.currentTarget;
      btn.classList.toggle('liked', !!liked);
      btn.querySelector('path').setAttribute('fill', liked?'var(--accent)':'none');
      if (Store.getState().currentSongId===song.id) updateLikeButton(liked);
      renderSidebar();
      if (window.CloudSync && window._supabase) CloudSync.pushLikedState(song.id, liked).catch(()=>{});
    });

    row.addEventListener('contextmenu', e => showSongContextMenu(e, song));
    return row;
  }

  function buildSongListHeader() {
    const div=document.createElement('div'); div.className='song-list-header';
    div.innerHTML='<div>#</div><div>Title</div><div>Album</div><div style="text-align:right">Duration</div><div></div>';
    return div;
  }

  /* ── Song context menu ────────────────────────────────────────── */
  function showSongContextMenu(e, song) {
    const pls   = Store.getAllPlaylists();
    const items = [
      { label: song.liked?'Remove from Liked Songs':'Add to Liked Songs',
        icon:'<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="2" fill="none"/>',
        action:()=>{ Store.toggleLike(song.id); const s=Store.getSong(song.id); if(Store.getState().currentSongId===song.id) updateLikeButton(s?.liked); renderSidebar(); Views.refreshCurrentView(); }},
      { label:'Add to queue',
        icon:'<path d="M3 6h18M3 12h18M3 18h12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
        action:()=>{ Store.addToQueue(song.id); toast('Added to queue'); renderQueue(); }},
      { type:'sep' },
    ];

    if (pls.length) {
      items.push({ label:'Add to playlist →',
        icon:'<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
        action:()=>showAddToPlaylistModal(song) });
    }
    items.push({ label:'Edit info',
      icon:'<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
      action:()=>showEditSongModal(song) });
    items.push({ type:'sep' });
    items.push({ label:'Delete song',
      icon:'<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
      action:()=>{ if(confirm(`Delete "${song.title}"?`)){ Store.deleteSong(song.id); toast(`Deleted`); renderSidebar(); Views.refreshCurrentView(); if(window.CloudSync) CloudSync.deleteSongFromCloud(song.id).catch(()=>{}); }}});

    showContextMenu(e, items);
  }

  function showAddToPlaylistModal(song) {
    const pls = Store.getAllPlaylists();
    showModal('Add to playlist', `
      <div id="plPickList" style="max-height:300px;overflow-y:auto;">
        ${pls.map(pl=>`<div class="library-item" data-plid="${pl.id}" style="padding:10px 12px;cursor:pointer;">
          <div class="library-item-info"><div class="library-item-name">${esc(pl.name)}</div>
          <div class="library-item-sub">${pl.songIds.length} songs</div></div></div>`).join('')}
      </div>
      <button class="btn-ghost" id="createNewPl" style="margin-top:10px;font-size:13px;">+ Create new playlist</button>`);
    document.querySelectorAll('#plPickList .library-item').forEach(el=>{
      el.addEventListener('click',()=>{
        Store.addToPlaylist(el.dataset.plid, song.id);
        toast(`Added to "${Store.getPlaylist(el.dataset.plid)?.name}"`);
        closeModal(); renderSidebar();
      });
    });
    document.getElementById('createNewPl').addEventListener('click',()=>{ closeModal(); showCreatePlaylistModal(song.id); });
  }

  function showCreatePlaylistModal(preSongId=null) {
    showModal('Create playlist', `
      <div class="form-group"><label class="form-label">Name</label>
        <input class="form-input" id="newPlName" placeholder="My Playlist" /></div>
      <div class="form-group"><label class="form-label">Description (optional)</label>
        <input class="form-input" id="newPlDesc" placeholder="Add a description" /></div>
      <div class="modal-actions">
        <button class="btn-ghost" onclick="UI.closeModal()">Cancel</button>
        <button class="btn-primary" data-confirm>Create</button>
      </div>`,
      { onConfirm:()=>{
        const name = document.getElementById('newPlName').value.trim()||'My Playlist';
        const desc = document.getElementById('newPlDesc').value.trim();
        const pl   = Store.createPlaylist(name, desc);
        if (preSongId) Store.addToPlaylist(pl.id, preSongId);
        toast(`Created "${name}"`);
        renderSidebar(); Views.showPlaylist(pl.id);
        if (window.CloudSync) CloudSync.pushPlaylist(pl).catch(()=>{});
      }});
    setTimeout(()=>document.getElementById('newPlName')?.focus(), 100);
  }

  function showEditSongModal(song) {
    showModal('Edit song info', `
      <div class="form-group"><label class="form-label">Title</label>
        <input class="form-input" id="etTitle" value="${esc(song.title)}" /></div>
      <div class="form-group"><label class="form-label">Artist</label>
        <input class="form-input" id="etArtist" value="${esc(song.artist)}" /></div>
      <div class="form-group"><label class="form-label">Album</label>
        <input class="form-input" id="etAlbum" value="${esc(song.album)}" /></div>
      <div class="modal-actions">
        <button class="btn-ghost" onclick="UI.closeModal()">Cancel</button>
        <button class="btn-primary" data-confirm>Save</button>
      </div>`,
      { onConfirm:()=>{
        Store.updateSong(song.id,{
          title:  document.getElementById('etTitle').value.trim()||song.title,
          artist: document.getElementById('etArtist').value.trim()||song.artist,
          album:  document.getElementById('etAlbum').value.trim()||song.album,
        });
        const s=Store.getSong(song.id);
        if (Store.getState().currentSongId===song.id) updatePlayerSong(s);
        toast('Song updated'); Views.refreshCurrentView(); renderSidebar();
      }});
  }

  /* ── Queue panel ──────────────────────────────────────────────── */
  function renderQueue() {
    const state   = Store.getState();
    const current = Store.getCurrentQueueSong();
    const nowEl   = document.getElementById('queueNowPlaying');
    const listEl  = document.getElementById('queueList');
    if (!nowEl||!listEl) return;

    nowEl.innerHTML='';
    if (current) nowEl.appendChild(buildQueueItem(current,true));

    listEl.innerHTML='';
    const upNext = state.queue.slice(state.queueIndex+1);
    if (!upNext.length) {
      listEl.innerHTML='<div style="padding:16px;color:var(--text-muted);font-size:13px;">Nothing in queue</div>';
    } else {
      upNext.forEach(id=>{ const s=Store.getSong(id); if(s) listEl.appendChild(buildQueueItem(s,false)); });
    }
  }

  function buildQueueItem(song, active) {
    const el=document.createElement('div');
    el.className=`queue-item${active?' active':''}`;
    el.innerHTML=`
      <div class="queue-item-art">${artPlaceholderSVG(18)}</div>
      <div class="queue-item-info">
        <div class="queue-item-title">${esc(song.title)}</div>
        <div class="queue-item-artist">${esc(song.artist)}</div>
      </div>
      <div class="queue-item-dur">${formatTime(song.duration)}</div>`;
    renderArtImg(song, el.querySelector('.queue-item-art'), 18);
    el.addEventListener('click',()=>{
      if (!active) {
        const idx = Store.getState().queue.indexOf(song.id);
        if (idx>=0) { Store.getState().queueIndex=idx; AudioEngine.playSong(song); }
      }
    });
    return el;
  }

  /* ── Card builder ─────────────────────────────────────────────── */
  function buildMusicCard(song, { onPlay }={}) {
    const card=document.createElement('div'); card.className='music-card';
    card.innerHTML=`
      <div class="card-art">${artPlaceholderSVG(40)}
        <button class="card-play-btn"><svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg></button>
      </div>
      <div class="card-title">${esc(song.title)}</div>
      <div class="card-sub">${esc(song.artist)}</div>`;
    renderArtImg(song, card.querySelector('.card-art'), 40);
    card.querySelector('.card-play-btn').addEventListener('click',e=>{ e.stopPropagation(); onPlay?.(song); });
    card.addEventListener('click',()=>onPlay?.(song));
    card.addEventListener('contextmenu',e=>showSongContextMenu(e,song));
    return card;
  }

  return {
    toast, formatTime, formatDuration, escHtml:esc, escHtml:esc,
    getCoverUrl, artPlaceholderSVG, renderArtImg,
    updatePlayerSong, updatePlayPause, updateProgress, updateVolume,
    updateLikeButton, updateShuffleBtn, updateRepeatBtn,
    renderSidebar, renderQueue,
    showContextMenu, hideContextMenu,
    showModal, closeModal,
    showSongContextMenu, showAddToPlaylistModal,
    showCreatePlaylistModal, showEditSongModal,
    buildSongRow, buildSongListHeader, buildMusicCard,
    escHtml: esc,
  };
})();
