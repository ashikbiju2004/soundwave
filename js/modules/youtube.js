/**
 * SoundWave — YouTube Import Module
 * Searches YouTube and embeds a player via YouTube IFrame API.
 * No audio download (respects ToS) — plays via embedded iframe player.
 *
 * Setup: Get a free YouTube Data API v3 key at
 *   https://console.cloud.google.com → Enable YouTube Data API v3
 * Replace YOUTUBE_API_KEY below.
 */
const YOUTUBE_API_KEY = 'AIzaSyDilNoEMubCBx1kEayPqErI88clr1dA4-c';

const YouTube = (() => {
  let ytPlayer = null;
  let ytReady  = false;
  let panelOpen = false;
  let currentVideoId = null;

  // ── Load YouTube IFrame API ──────────────────────────────────
  function loadAPI() {
    if (window.YT) { ytReady = true; return Promise.resolve(); }
    return new Promise(resolve => {
      window.onYouTubeIframeAPIReady = () => { ytReady = true; resolve(); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    });
  }

  // ── Search ───────────────────────────────────────────────────
  async function search(query) {
    if (YOUTUBE_API_KEY === 'YOUR_YOUTUBE_API_KEY') {
      return getMockResults(query);
    }
    const url = `https://www.googleapis.com/youtube/v3/search?` +
      new URLSearchParams({
        part: 'snippet', q: query, type: 'video',
        videoCategoryId: '10', maxResults: 20,
        key: YOUTUBE_API_KEY,
      });
    const res = await fetch(url);
    if (!res.ok) throw new Error('YouTube API error: ' + res.status);
    const data = await res.json();
    return (data.items || []).map(item => ({
      id:        item.id.videoId,
      title:     item.snippet.title,
      artist:    item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.medium?.url || '',
      duration:  '',
    }));
  }

  function getMockResults(query) {
    // Shown only when no API key is configured
    return Array.from({ length: 6 }, (_, i) => ({
      id: 'dQw4w9WgXcQ',
      title: `${query} — Result ${i + 1}`,
      artist: 'YouTube Artist',
      thumbnail: `https://picsum.photos/seed/${query}${i}/320/180`,
      duration: `${3 + i}:${String(i * 7 % 60).padStart(2,'0')}`,
    }));
  }

  // ── Show Panel ───────────────────────────────────────────────
  async function showPanel() {
    if (panelOpen) return;
    panelOpen = true;

    const existing = document.getElementById('ytPanel');
    if (existing) existing.remove();

    await loadAPI();
    injectStyles();

    const panel = document.createElement('div');
    panel.id = 'ytPanel';
    panel.className = 'yt-panel';
    panel.innerHTML = `
      <div class="yt-panel-header">
        <div class="yt-panel-title">
          <svg viewBox="0 0 24 24" width="22" height="22"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" fill="#ff0000"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="#fff"/></svg>
          YouTube Import
        </div>
        <button class="icon-btn" id="closeYtPanel">
          <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
        </button>
      </div>

      <div class="yt-search-bar">
        <svg viewBox="0 0 24 24" width="16" height="16"><path d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
        <input type="text" id="ytSearchInput" placeholder="Search songs, artists, albums…" />
        <button class="btn-primary" id="ytSearchBtn" style="padding:6px 16px;font-size:13px;">Search</button>
      </div>

      ${YOUTUBE_API_KEY === 'YOUR_YOUTUBE_API_KEY' ? `
        <div class="yt-api-notice">
          <svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 8v4M12 16h.01" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
          Add your YouTube API key in js/modules/youtube.js to enable real search
        </div>` : ''}

      <div id="ytResults" class="yt-results"></div>

      <div id="ytPlayerWrap" class="yt-player-wrap hidden">
        <div id="ytPlayerInner"></div>
        <div class="yt-player-info">
          <div id="ytPlayerTitle" class="yt-player-title"></div>
          <div id="ytPlayerArtist" class="yt-player-artist"></div>
        </div>
        <div class="yt-player-actions">
          <button class="btn-ghost" id="ytAddToLiked" style="font-size:13px;">♥ Add to Liked (as YouTube track)</button>
          <button class="btn-primary" id="ytAddToPlaylist" style="padding:8px 16px;font-size:13px;">+ Add to Playlist</button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add('open'));

    document.getElementById('closeYtPanel').onclick = closePanel;

    const input = document.getElementById('ytSearchInput');
    const btn   = document.getElementById('ytSearchBtn');

    btn.onclick = () => doSearch(input.value.trim());
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(input.value.trim()); });

    // Auto search trending
    doSearch('top music 2025');
  }

  async function doSearch(query) {
    if (!query) return;
    const results = document.getElementById('ytResults');
    results.innerHTML = `<div class="yt-loading"><div class="yt-spinner"></div><span>Searching…</span></div>`;
    try {
      const items = await search(query);
      renderResults(items);
    } catch(e) {
      results.innerHTML = `<div class="yt-empty">Search failed: ${e.message}</div>`;
    }
  }

  function renderResults(items) {
    const container = document.getElementById('ytResults');
    container.innerHTML = '';
    if (!items.length) {
      container.innerHTML = '<div class="yt-empty">No results found</div>';
      return;
    }
    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'yt-result-card';
      card.innerHTML = `
        <div class="yt-thumb" style="background-image:url('${item.thumbnail}')">
          <div class="yt-play-ico">▶</div>
          ${item.duration ? `<div class="yt-duration">${item.duration}</div>` : ''}
        </div>
        <div class="yt-card-info">
          <div class="yt-card-title">${escHtml(item.title)}</div>
          <div class="yt-card-artist">${escHtml(item.artist)}</div>
        </div>
      `;
      card.addEventListener('click', () => playVideo(item));
      container.appendChild(card);
    });
  }

  function playVideo(item) {
    currentVideoId = item.id;
    const wrap = document.getElementById('ytPlayerWrap');
    wrap.classList.remove('hidden');
    document.getElementById('ytPlayerTitle').textContent  = item.title;
    document.getElementById('ytPlayerArtist').textContent = item.artist;

    // Destroy old player
    if (ytPlayer) { ytPlayer.destroy(); ytPlayer = null; }

    // Pause local audio
    AudioEngine.pause();

    // Create YouTube player
    const container = document.getElementById('ytPlayerInner');
    container.innerHTML = '<div id="ytIframeTarget"></div>';

    if (ytReady) {
      ytPlayer = new YT.Player('ytIframeTarget', {
        height: '200', width: '100%',
        videoId: item.id,
        playerVars: { autoplay: 1, controls: 1, rel: 0, modestbranding: 1 },
      });
    } else {
      container.innerHTML = `<iframe width="100%" height="200"
        src="https://www.youtube.com/embed/${item.id}?autoplay=1&rel=0"
        frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    }

    // Add to liked as YouTube track
    document.getElementById('ytAddToLiked').onclick = () => {
      addYouTubeTrack(item, true);
    };
    document.getElementById('ytAddToPlaylist').onclick = () => {
      UI.showCreatePlaylistModal();
    };
  }

  function addYouTubeTrack(item, liked = false) {
    // Store YouTube tracks as special entries (no audio blob — stream only)
    const ytSong = {
      id: 'yt_' + item.id,
      title: item.title,
      artist: item.artist,
      album: 'YouTube',
      duration: 0,
      youtubeId: item.id,
      thumbnail: item.thumbnail,
      liked,
      addedAt: Date.now(),
      isYouTube: true,
    };
    // Merge into store metadata (no blob)
    const existing = Store.getSong(ytSong.id);
    if (!existing) {
      Store.getAllSongs().unshift(ytSong);
      Store.save();
    }
    if (liked) Store.updateSong(ytSong.id, { liked: true });
    UI.toast(`"${item.title}" added`);
    UI.renderSidebar();
  }

  function closePanel() {
    panelOpen = false;
    if (ytPlayer) { ytPlayer.stopVideo(); ytPlayer.destroy(); ytPlayer = null; }
    const panel = document.getElementById('ytPanel');
    if (panel) { panel.classList.remove('open'); setTimeout(() => panel.remove(), 300); }
  }

  function escHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function injectStyles() {
    if (document.getElementById('ytStyles')) return;
    const style = document.createElement('style');
    style.id = 'ytStyles';
    style.textContent = `
      .yt-panel {
        position:fixed; right:0; top:0; bottom:var(--player-h);
        width:380px; background:#0d0d0d;
        border-left:1px solid var(--border);
        z-index:60; display:flex; flex-direction:column;
        transform:translateX(100%); transition:transform 0.3s ease;
        overflow:hidden;
      }
      .yt-panel.open { transform:translateX(0); }
      .yt-panel-header {
        display:flex; align-items:center; justify-content:space-between;
        padding:16px 16px 12px; border-bottom:1px solid var(--border); flex-shrink:0;
      }
      .yt-panel-title {
        display:flex; align-items:center; gap:8px;
        font-size:16px; font-weight:700;
      }
      .yt-search-bar {
        display:flex; align-items:center; gap:8px;
        padding:12px 16px; border-bottom:1px solid var(--border); flex-shrink:0;
      }
      .yt-search-bar input {
        flex:1; background:var(--bg-highlight); border:1px solid var(--border);
        border-radius:8px; padding:8px 12px; color:#fff; font-size:13px; outline:none;
      }
      .yt-api-notice {
        display:flex; align-items:center; gap:6px;
        padding:8px 16px; background:rgba(245,158,11,0.08);
        border-bottom:1px solid rgba(245,158,11,0.15);
        font-size:11px; color:#f59e0b; flex-shrink:0;
      }
      .yt-results { flex:1; overflow-y:auto; padding:8px; }
      .yt-result-card {
        display:flex; gap:10px; padding:8px; border-radius:8px;
        cursor:pointer; transition:background 0.15s; margin-bottom:4px;
      }
      .yt-result-card:hover { background:var(--bg-highlight); }
      .yt-thumb {
        width:100px; height:56px; flex-shrink:0; border-radius:6px;
        background-size:cover; background-position:center; background-color:#222;
        position:relative; overflow:hidden;
      }
      .yt-play-ico {
        position:absolute; inset:0; display:flex; align-items:center;
        justify-content:center; background:rgba(0,0,0,0); font-size:18px;
        color:rgba(255,255,255,0); transition:all 0.15s;
      }
      .yt-result-card:hover .yt-play-ico { background:rgba(0,0,0,0.5); color:#fff; }
      .yt-duration {
        position:absolute; bottom:4px; right:4px; background:rgba(0,0,0,0.8);
        color:#fff; font-size:10px; padding:1px 5px; border-radius:3px;
      }
      .yt-card-info { flex:1; overflow:hidden; }
      .yt-card-title {
        font-size:13px; font-weight:500; white-space:nowrap;
        overflow:hidden; text-overflow:ellipsis; color:#fff;
      }
      .yt-card-artist { font-size:11px; color:var(--text-secondary); margin-top:3px; }
      .yt-loading {
        display:flex; align-items:center; gap:10px;
        padding:24px; color:var(--text-muted); font-size:13px;
      }
      .yt-spinner {
        width:18px; height:18px; border:2px solid var(--border);
        border-top-color:#ff0000; border-radius:50%; animation:spin 0.8s linear infinite;
      }
      .yt-empty { padding:24px; color:var(--text-muted); font-size:13px; text-align:center; }
      .yt-player-wrap {
        border-top:1px solid var(--border); flex-shrink:0; padding:12px;
      }
      .yt-player-wrap.hidden { display:none; }
      #ytPlayerInner iframe, #ytPlayerInner > * {
        width:100%!important; border-radius:8px; overflow:hidden;
      }
      .yt-player-info { padding:10px 0 6px; }
      .yt-player-title  { font-size:14px; font-weight:700; }
      .yt-player-artist { font-size:12px; color:var(--text-secondary); }
      .yt-player-actions {
        display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px;
      }
    `;
    document.head.appendChild(style);
  }

  return { showPanel, closePanel };
})();
