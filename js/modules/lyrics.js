/**
 * SoundWave — Lyrics Module
 *
 * Sources (in priority order):
 *  1. LRClib (free, no key needed) — synced lyrics
 *  2. Musixmatch (requires API key) — rich lyrics
 *
 * Setup Musixmatch (optional):
 *  1. Get a free key at https://developer.musixmatch.com
 *  2. Replace MUSIXMATCH_KEY below
 *  Note: Free tier = 30% of lyrics. For full lyrics use LRClib (free & unlimited).
 */

const MUSIXMATCH_KEY = 'YOUR_MUSIXMATCH_API_KEY';  // optional

const Lyrics = (() => {
  let currentSongId = null;
  let lrcLines = [];       // [{time: seconds, text: string}]
  let activeLine = -1;
  let syncInterval = null;
  let panelOpen = false;

  // ── Fetch ─────────────────────────────────────────────────────────
  async function fetchLyrics(title, artist, duration = 0) {
    // Try LRClib first (free, synced)
    try {
      const lrc = await fetchLRClib(title, artist, duration);
      if (lrc) return { source: 'lrclib', ...lrc };
    } catch(e) { console.warn('[Lyrics] LRClib failed:', e); }

    // Try Musixmatch
    if (MUSIXMATCH_KEY !== 'YOUR_MUSIXMATCH_API_KEY') {
      try {
        const mx = await fetchMusixmatch(title, artist);
        if (mx) return { source: 'musixmatch', ...mx };
      } catch(e) { console.warn('[Lyrics] Musixmatch failed:', e); }
    }

    return null;
  }

  async function fetchLRClib(title, artist, duration) {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    if (duration > 0) params.set('duration', Math.round(duration));

    const res = await fetch(`https://lrclib.net/api/get?${params}`);
    if (!res.ok) return null;
    const data = await res.json();

    return {
      synced: !!data.syncedLyrics,
      lrc: data.syncedLyrics || null,
      plain: data.plainLyrics || null,
      title: data.trackName,
      artist: data.artistName,
    };
  }

  async function fetchMusixmatch(title, artist) {
    // Note: Musixmatch requires server-side proxy to avoid CORS.
    // Use a Netlify function (see /netlify/functions/lyrics.js)
    const params = new URLSearchParams({ title, artist });
    const res = await fetch(`/.netlify/functions/lyrics?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    return { synced: false, plain: data.lyrics, lrc: null };
  }

  // ── LRC Parser ────────────────────────────────────────────────────
  function parseLRC(lrcText) {
    if (!lrcText) return [];
    const lines = [];
    const regex = /\[(\d+):(\d+\.\d+)\](.*)/g;
    let match;
    while ((match = regex.exec(lrcText)) !== null) {
      const min = parseInt(match[1]);
      const sec = parseFloat(match[2]);
      const text = match[3].trim();
      if (text) lines.push({ time: min * 60 + sec, text });
    }
    return lines.sort((a, b) => a.time - b.time);
  }

  // ── Show Panel ────────────────────────────────────────────────────
  async function showPanel(song) {
    panelOpen = true;
    currentSongId = song?.id;

    const existing = document.getElementById('lyricsPanel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'lyricsPanel';
    panel.className = 'lyrics-panel';
    panel.innerHTML = `
      <div class="lyrics-header">
        <div>
          <div class="lyrics-song-title">${UI.escHtml(song?.title || '')}</div>
          <div class="lyrics-song-artist">${UI.escHtml(song?.artist || '')}</div>
        </div>
        <button class="icon-btn" id="closeLyricsBtn">
          <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="lyrics-body" id="lyricsBody">
        <div class="lyrics-loading">
          <div class="lyrics-spinner"></div>
          <p>Finding lyrics…</p>
        </div>
      </div>
      <div class="lyrics-footer" id="lyricsFooter"></div>
    `;

    document.body.appendChild(panel);
    injectLyricsStyles();
    requestAnimationFrame(() => panel.classList.add('open'));

    document.getElementById('closeLyricsBtn').onclick = closePanel;

    if (!song) { showNoLyrics('No song playing'); return; }

    // Fetch
    const result = await fetchLyrics(song.title, song.artist, song.duration);
    if (!result) { showNoLyrics('No lyrics found'); return; }

    if (result.synced && result.lrc) {
      lrcLines = parseLRC(result.lrc);
      renderSyncedLyrics(lrcLines);
      startSync();
    } else if (result.plain) {
      lrcLines = [];
      renderPlainLyrics(result.plain);
    } else {
      showNoLyrics('No lyrics available');
    }

    document.getElementById('lyricsFooter').innerHTML =
      `<span>Source: ${result.source === 'lrclib' ? 'LRClib' : 'Musixmatch'}</span>`;
  }

  function renderSyncedLyrics(lines) {
    const body = document.getElementById('lyricsBody');
    if (!body) return;
    body.innerHTML = '';
    lines.forEach((line, i) => {
      const el = document.createElement('div');
      el.className = 'lyric-line';
      el.dataset.index = i;
      el.dataset.time = line.time;
      el.textContent = line.text;
      el.addEventListener('click', () => AudioEngine.seek(line.time));
      body.appendChild(el);
    });
    // padding at top/bottom for scroll
    body.insertAdjacentHTML('afterbegin', '<div style="height:40%"></div>');
    body.insertAdjacentHTML('beforeend', '<div style="height:40%"></div>');
  }

  function renderPlainLyrics(text) {
    const body = document.getElementById('lyricsBody');
    if (!body) return;
    body.innerHTML = '';
    text.split('\n').forEach(line => {
      const el = document.createElement('div');
      el.className = 'lyric-line plain';
      el.textContent = line || '\u00A0';
      body.appendChild(el);
    });
  }

  function showNoLyrics(msg) {
    const body = document.getElementById('lyricsBody');
    if (!body) return;
    body.innerHTML = `
      <div class="lyrics-empty">
        <svg viewBox="0 0 24 24" width="48" height="48"><path d="M9 19V6l12-3v13M9 19c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12-3c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>
        <p>${msg}</p>
      </div>
    `;
  }

  // ── Sync ──────────────────────────────────────────────────────────
  function startSync() {
    stopSync();
    syncInterval = setInterval(syncHighlight, 250);
  }

  function stopSync() {
    if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
  }

  function syncHighlight() {
    if (!panelOpen || !lrcLines.length) return;
    const t = AudioEngine.getCurrentTime();
    let active = -1;
    for (let i = 0; i < lrcLines.length; i++) {
      if (lrcLines[i].time <= t) active = i;
      else break;
    }
    if (active === activeLine) return;
    activeLine = active;

    const body = document.getElementById('lyricsBody');
    if (!body) return;

    document.querySelectorAll('.lyric-line.active').forEach(el => el.classList.remove('active', 'prev'));
    if (active >= 0) {
      const activeEl = body.querySelector(`[data-index="${active}"]`);
      if (activeEl) {
        activeEl.classList.add('active');
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // dim previous lines
      for (let i = 0; i < active; i++) {
        body.querySelector(`[data-index="${i}"]`)?.classList.add('prev');
      }
    }
  }

  function closePanel() {
    panelOpen = false;
    stopSync();
    lrcLines = [];
    activeLine = -1;
    const panel = document.getElementById('lyricsPanel');
    if (panel) { panel.classList.remove('open'); setTimeout(() => panel.remove(), 300); }
  }

  function isOpen() { return panelOpen; }

  // ── Styles ────────────────────────────────────────────────────────
  function injectLyricsStyles() {
    if (document.getElementById('lyricsStyles')) return;
    const style = document.createElement('style');
    style.id = 'lyricsStyles';
    style.textContent = `
      .lyrics-panel {
        position: fixed; right: 0; top: 0; bottom: var(--player-h);
        width: 360px; background: #0d0d0d;
        border-left: 1px solid var(--border);
        z-index: 60; display: flex; flex-direction: column;
        transform: translateX(100%); transition: transform 0.3s ease;
      }
      .lyrics-panel.open { transform: translateX(0); }
      .lyrics-header {
        display: flex; align-items: flex-start; justify-content: space-between;
        padding: 20px 20px 12px; border-bottom: 1px solid var(--border);
        flex-shrink: 0;
      }
      .lyrics-song-title { font-size: 15px; font-weight: 700; }
      .lyrics-song-artist { font-size: 13px; color: var(--text-secondary); margin-top: 2px; }
      .lyrics-body {
        flex: 1; overflow-y: auto; padding: 12px 24px;
        scroll-behavior: smooth;
      }
      .lyrics-body::-webkit-scrollbar { width: 4px; }
      .lyric-line {
        font-size: 22px; font-weight: 700; color: rgba(255,255,255,0.25);
        padding: 8px 0; line-height: 1.4; cursor: pointer;
        transition: color 0.3s, font-size 0.3s, transform 0.3s;
      }
      .lyric-line:hover { color: rgba(255,255,255,0.5); }
      .lyric-line.active {
        color: #fff; font-size: 26px; transform: scale(1.02);
      }
      .lyric-line.prev { color: rgba(255,255,255,0.15); }
      .lyric-line.plain { font-size: 16px; color: var(--text-secondary); cursor: default; padding: 4px 0; }
      .lyrics-loading {
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; height: 100%; gap: 16px; color: var(--text-muted);
      }
      .lyrics-spinner {
        width: 32px; height: 32px; border: 3px solid var(--border);
        border-top-color: var(--accent); border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .lyrics-empty {
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; height: 100%; gap: 12px;
        color: var(--text-muted); text-align: center;
      }
      .lyrics-footer {
        padding: 10px 20px; border-top: 1px solid var(--border);
        font-size: 11px; color: var(--text-muted); flex-shrink: 0;
      }
    `;
    document.head.appendChild(style);
  }

  return { showPanel, closePanel, isOpen, startSync, stopSync };
})();
