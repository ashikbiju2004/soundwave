/**
 * SoundWave Store — all app state, IndexedDB audio blobs, localStorage metadata, ID3 parser
 */
const Store = (() => {
  const DB_NAME = 'soundwave_db';
  const DB_VER  = 1;
  let db = null;

  /* ── State ─────────────────────────────────────────────────── */
  let state = {
    songs: [], playlists: [],
    queue: [], queueIndex: -1,
    shuffle: false, repeat: 'none',
    volume: 0.8, currentSongId: null,
    recentlyPlayed: [],
  };

  /* ── IndexedDB ─────────────────────────────────────────────── */
  function openDB() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('audio'))  d.createObjectStore('audio',  { keyPath:'id' });
        if (!d.objectStoreNames.contains('covers')) d.createObjectStore('covers', { keyPath:'id' });
      };
      req.onsuccess = e => { db = e.target.result; res(db); };
      req.onerror   = ()  => rej(req.error);
    });
  }

  const idbPut = (store, obj) => new Promise((res,rej) => {
    const tx = db.transaction(store,'readwrite');
    tx.objectStore(store).put(obj);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });

  const idbGet = (store, id) => new Promise((res,rej) => {
    const tx  = db.transaction(store,'readonly');
    const req = tx.objectStore(store).get(id);
    req.onsuccess = () => res(req.result ? req.result.blob : null);
    req.onerror   = () => rej(req.error);
  });

  const idbDel = (store, id) => new Promise(res => {
    const tx = db.transaction(store,'readwrite');
    tx.objectStore(store).delete(id);
    tx.oncomplete = res;
  });

  function saveAudioBlob(id, blob) { return idbPut('audio',  { id, blob }); }
  function getAudioBlob(id)        { return idbGet('audio',  id); }
  function deleteAudioBlob(id)     { return idbDel('audio',  id); }
  function saveCoverBlob(id, blob) { return idbPut('covers', { id, blob }); }
  function getCoverBlob(id)        { return idbGet('covers', id).catch(()=>null); }

  /* ── Persistence ────────────────────────────────────────────── */
  function save() {
    try {
      localStorage.setItem('sw_state', JSON.stringify({
        songs: state.songs, playlists: state.playlists,
        queue: state.queue, queueIndex: state.queueIndex,
        shuffle: state.shuffle, repeat: state.repeat,
        volume: state.volume, currentSongId: state.currentSongId,
        recentlyPlayed: state.recentlyPlayed,
      }));
    } catch(e) { console.warn('[Store] Save failed:', e); }
  }

  function load() {
    try {
      const raw = localStorage.getItem('sw_state');
      if (raw) Object.assign(state, JSON.parse(raw));
    } catch(e) { console.warn('[Store] Load failed:', e); }
  }

  /* ── ID helpers ─────────────────────────────────────────────── */
  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  }

  /* ── Songs ──────────────────────────────────────────────────── */
  async function addSong(file, meta = {}) {
    const id       = meta.id || genId();
    const duration = await getAudioDuration(file);
    const parsed   = await parseID3(file).catch(()=>({}));

    const song = {
      id,
      title:    meta.title  || parsed.title  || stripExt(file.name),
      artist:   meta.artist || parsed.artist || 'Unknown Artist',
      album:    meta.album  || parsed.album  || 'Unknown Album',
      duration,
      size:     file.size,
      addedAt:  Date.now(),
      liked:    false,
      hasCover: false,
      play_count: 0,
    };

    await saveAudioBlob(id, file);

    if (parsed.coverBlob) {
      await saveCoverBlob(id, parsed.coverBlob);
      song.hasCover = true;
    }

    // Avoid duplicates
    if (!state.songs.find(s => s.id === id)) {
      state.songs.unshift(song);
    }
    save();
    return song;
  }

  function deleteSong(id) {
    state.songs     = state.songs.filter(s => s.id !== id);
    state.playlists.forEach(p => { p.songIds = p.songIds.filter(sid => sid !== id); });
    state.queue            = state.queue.filter(sid => sid !== id);
    state.recentlyPlayed   = state.recentlyPlayed.filter(sid => sid !== id);
    if (state.currentSongId === id) state.currentSongId = null;
    deleteAudioBlob(id);
    save();
  }

  function toggleLike(id) {
    const s = state.songs.find(s => s.id === id);
    if (s) { s.liked = !s.liked; save(); }
    return s;
  }

  function updateSong(id, fields) {
    const s = state.songs.find(s => s.id === id);
    if (s) { Object.assign(s, fields); save(); }
    return s;
  }

  function getSong(id)    { return state.songs.find(s => s.id === id) || null; }
  function getAllSongs()   { return [...state.songs]; }
  function getLikedSongs(){ return state.songs.filter(s => s.liked); }

  function searchSongs(q) {
    const query = q.toLowerCase().trim();
    if (!query) return [];
    return state.songs.filter(s =>
      s.title.toLowerCase().includes(query)  ||
      s.artist.toLowerCase().includes(query) ||
      s.album.toLowerCase().includes(query)
    );
  }

  /* ── Playlists ──────────────────────────────────────────────── */
  function createPlaylist(name, description = '') {
    const pl = { id: genId(), name, description, songIds: [], createdAt: Date.now() };
    state.playlists.unshift(pl);
    save();
    return pl;
  }

  function deletePlaylist(id) {
    state.playlists = state.playlists.filter(p => p.id !== id);
    save();
  }

  function updatePlaylist(id, fields) {
    const pl = state.playlists.find(p => p.id === id);
    if (pl) { Object.assign(pl, fields); save(); }
    return pl;
  }

  function addToPlaylist(pid, sid) {
    const pl = state.playlists.find(p => p.id === pid);
    if (pl && !pl.songIds.includes(sid)) { pl.songIds.push(sid); save(); }
    return pl;
  }

  function removeFromPlaylist(pid, sid) {
    const pl = state.playlists.find(p => p.id === pid);
    if (pl) { pl.songIds = pl.songIds.filter(id => id !== sid); save(); }
    return pl;
  }

  function getPlaylist(id)      { return state.playlists.find(p => p.id === id) || null; }
  function getAllPlaylists()     { return [...state.playlists]; }
  function getPlaylistSongs(id) {
    const pl = getPlaylist(id);
    if (!pl) return [];
    return pl.songIds.map(sid => getSong(sid)).filter(Boolean);
  }

  /* ── Queue ──────────────────────────────────────────────────── */
  function setQueue(songIds, startIndex = 0) {
    state.queue      = [...songIds];
    state.queueIndex = startIndex;
    if (state.shuffle) _shuffleQueue(startIndex);
    save();
  }

  function _shuffleQueue(keepIdx = 0) {
    const current = state.queue[keepIdx];
    const rest    = state.queue.filter((_,i) => i !== keepIdx);
    for (let i = rest.length-1; i > 0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [rest[i],rest[j]] = [rest[j],rest[i]];
    }
    state.queue      = [current, ...rest];
    state.queueIndex = 0;
  }

  function getCurrentQueueSong() {
    if (state.queueIndex < 0 || state.queueIndex >= state.queue.length) return null;
    return getSong(state.queue[state.queueIndex]);
  }

  function nextInQueue() {
    if (state.repeat === 'one') return getCurrentQueueSong();
    if (state.queueIndex < state.queue.length - 1) {
      state.queueIndex++;
    } else if (state.repeat === 'all') {
      if (state.shuffle) _shuffleQueue();
      state.queueIndex = 0;
    } else { return null; }
    save();
    return getCurrentQueueSong();
  }

  function prevInQueue() {
    if (state.queueIndex > 0) state.queueIndex--;
    else if (state.repeat === 'all') state.queueIndex = state.queue.length - 1;
    save();
    return getCurrentQueueSong();
  }

  function addToQueue(sid) { state.queue.push(sid); save(); }

  function addToRecentlyPlayed(id) {
    state.recentlyPlayed = [id, ...state.recentlyPlayed.filter(i => i !== id)].slice(0,20);
    const s = getSong(id);
    if (s) { s.play_count = (s.play_count||0) + 1; }
    save();
  }

  /* ── Getters / Setters ──────────────────────────────────────── */
  function getState()        { return state; }
  function setShuffle(v)     { state.shuffle = v; save(); }
  function setRepeat(v)      { state.repeat  = v; save(); }
  function setVolume(v)      { state.volume  = v; save(); }
  function setCurrentSong(id){ state.currentSongId = id; save(); }

  /* ── Audio helpers ──────────────────────────────────────────── */
  function getAudioDuration(file) {
    return new Promise(res => {
      const url = URL.createObjectURL(file);
      const a   = new Audio(url);
      a.onloadedmetadata = () => { URL.revokeObjectURL(url); res(a.duration||0); };
      a.onerror = () => { URL.revokeObjectURL(url); res(0); };
    });
  }

  function stripExt(name) {
    return name.replace(/\.[^.]+$/, '').replace(/[_-]/g,' ');
  }

  /* ── ID3 v2 parser (TIT2, TPE1, TALB, APIC) ────────────────── */
  async function parseID3(file) {
    const meta = {};
    try {
      const buf   = await file.slice(0, 512*1024).arrayBuffer();
      const bytes = new Uint8Array(buf);
      const view  = new DataView(buf);

      if (String.fromCharCode(bytes[0],bytes[1],bytes[2]) !== 'ID3') return meta;
      const ver = bytes[3];
      let offset = 10;

      const readId   = o => String.fromCharCode(bytes[o],bytes[o+1],bytes[o+2],bytes[o+3]);
      const readSize = o => ver >= 4
        ? ((bytes[o]&0x7f)<<21)|((bytes[o+1]&0x7f)<<14)|((bytes[o+2]&0x7f)<<7)|(bytes[o+3]&0x7f)
        : view.getUint32(o);

      const readStr = (start, len) => {
        const enc  = bytes[start];
        const data = bytes.slice(start+1, start+len);
        try {
          return (enc===1||enc===2)
            ? new TextDecoder('utf-16').decode(data).replace(/\0/g,'')
            : new TextDecoder('utf-8').decode(data).replace(/\0/g,'');
        } catch { return ''; }
      };

      while (offset < Math.min(buf.byteLength-10, 500000)) {
        const id   = readId(offset);
        if (!id.match(/^[A-Z0-9]{4}$/)) break;
        const size = readSize(offset+4);
        if (size <= 0 || size > 200000) { offset += 10 + Math.abs(size); continue; }
        const ds = offset + 10;

        if      (id==='TIT2') meta.title  = readStr(ds, size);
        else if (id==='TPE1') meta.artist = readStr(ds, size);
        else if (id==='TALB') meta.album  = readStr(ds, size);
        else if (id==='APIC') {
          try {
            let p = ds + 1;
            while (p < ds+size && bytes[p] !== 0) p++; p++;
            p++; // picture type
            while (p < ds+size && bytes[p] !== 0) p++; p++;
            meta.coverBlob = new Blob([bytes.slice(p, ds+size)], { type:'image/jpeg' });
          } catch {}
        }
        offset += 10 + size;
      }
    } catch {}
    return meta;
  }

  /* ── Init ───────────────────────────────────────────────────── */
  async function init() { load(); await openDB(); }

  return {
    init, save, load,
    addSong, deleteSong, toggleLike, updateSong,
    getSong, getAllSongs, getLikedSongs, searchSongs,
    createPlaylist, deletePlaylist, updatePlaylist,
    addToPlaylist, removeFromPlaylist,
    getPlaylist, getAllPlaylists, getPlaylistSongs,
    setQueue, nextInQueue, prevInQueue, addToQueue,
    getCurrentQueueSong, addToRecentlyPlayed,
    getState, setShuffle, setRepeat, setVolume, setCurrentSong,
    getAudioBlob, saveAudioBlob, getCoverBlob, saveCoverBlob,
  };
})();
