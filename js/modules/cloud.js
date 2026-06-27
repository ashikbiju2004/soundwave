/**
 * SoundWave — Cloud Sync (Supabase)
 */
const CloudSync = (() => {
  let db   = null;
  let user = null;
  let prof = null;

  function _setClient(client) { db = client; }

  function init(client, currentUser, profile) {
    db   = client;
    user = currentUser;
    prof = profile;
  }

  /* ── Push song ───────────────────────────────────────────────── */
  async function pushSong(song, audioBlob, coverBlob) {
    if (!db || !user) return;
    try {
      if (audioBlob) {
        await db.storage.from('audio')
          .upload(`${user.id}/audio/${song.id}`, audioBlob, { upsert:true });
      }
      if (coverBlob) {
        await db.storage.from('covers')
          .upload(`${user.id}/covers/${song.id}`, coverBlob, { upsert:true });
      }
      await db.from('songs').upsert({
        id: song.id, user_id: user.id,
        title: song.title, artist: song.artist, album: song.album,
        duration: song.duration, file_size: song.size||0,
        liked: song.liked, has_cover: !!(coverBlob||song.hasCover),
        added_at: new Date(song.addedAt||Date.now()).toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch(e) { console.warn('[Cloud] pushSong failed:', e); }
  }

  /* ── Push playlist ────────────────────────────────────────────── */
  async function pushPlaylist(pl) {
    if (!db || !user) return;
    try {
      await db.from('playlists').upsert({
        id: pl.id, user_id: user.id,
        name: pl.name, description: pl.description||'',
        song_ids: pl.songIds||[],
        created_at: new Date(pl.createdAt||Date.now()).toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch(e) { console.warn('[Cloud] pushPlaylist failed:', e); }
  }

  /* ── Push liked state ─────────────────────────────────────────── */
  async function pushLikedState(songId, liked) {
    if (!db || !user) return;
    try {
      await db.from('songs').update({ liked, updated_at: new Date().toISOString() })
        .eq('id', songId).eq('user_id', user.id);
    } catch {}
  }

  /* ── Delete song from cloud ───────────────────────────────────── */
  async function deleteSongFromCloud(id) {
    if (!db || !user) return;
    try {
      await db.from('songs').delete().eq('id',id).eq('user_id',user.id);
      await db.storage.from('audio').remove([`${user.id}/audio/${id}`]);
      await db.storage.from('covers').remove([`${user.id}/covers/${id}`]);
    } catch {}
  }

  /* ── Delete playlist from cloud ───────────────────────────────── */
  async function deletePlaylistFromCloud(id) {
    if (!db || !user) return;
    try { await db.from('playlists').delete().eq('id',id).eq('user_id',user.id); } catch {}
  }

  /* ── Pull from cloud ──────────────────────────────────────────── */
  async function pullFromCloud() {
    if (!db || !user) return;
    try {
      // Fetch metadata
      const [{ data: cloudSongs }, { data: cloudPls }] = await Promise.all([
        db.from('songs').select('*').eq('user_id',user.id).order('added_at',{ascending:false}),
        db.from('playlists').select('*').eq('user_id',user.id).order('created_at',{ascending:false}),
      ]);

      const localIds = new Set(Store.getAllSongs().map(s=>s.id));
      let downloaded = 0;

      for (const cs of (cloudSongs||[])) {
        if (!localIds.has(cs.id)) {
          try {
            const { data: blob } = await db.storage.from('audio')
              .download(`${user.id}/audio/${cs.id}`);
            if (blob) {
              const file = new File([blob], `${cs.title}.mp3`, {type:'audio/mpeg'});
              await Store.addSong(file, { title:cs.title, artist:cs.artist, album:cs.album });
              if (cs.has_cover) {
                const { data:cover } = await db.storage.from('covers')
                  .download(`${user.id}/covers/${cs.id}`);
                if (cover) await Store.saveCoverBlob(cs.id, cover);
              }
              downloaded++;
            }
          } catch {}
        } else {
          // Sync liked state
          const local = Store.getSong(cs.id);
          if (local && local.liked !== cs.liked) Store.updateSong(cs.id, { liked:cs.liked });
        }
      }

      // Sync playlists
      for (const cp of (cloudPls||[])) {
        const local = Store.getPlaylist(cp.id);
        if (!local) {
          const pl = Store.createPlaylist(cp.name, cp.description);
          (cp.song_ids||[]).forEach(sid => Store.addToPlaylist(pl.id, sid));
        } else {
          Store.updatePlaylist(cp.id, { name:cp.name, description:cp.description, songIds:cp.song_ids||[] });
        }
      }

      UI.renderSidebar();
      Views.refreshCurrentView();
      if (downloaded) UI.toast(`Downloaded ${downloaded} new song${downloaded!==1?'s':''} from cloud`);
      else UI.toast('Library synced ✓');
    } catch(e) {
      console.error('[Cloud] Pull failed:', e);
      UI.toast('Sync failed — check connection');
    }
  }

  /* ── Push all to cloud ────────────────────────────────────────── */
  async function pushAllToCloud() {
    if (!db || !user) { UI.toast('Not signed in'); return; }
    const songs = Store.getAllSongs();
    let pushed  = 0;
    for (const song of songs) {
      const audio = await Store.getAudioBlob(song.id);
      const cover = await Store.getCoverBlob(song.id);
      await pushSong(song, audio, cover);
      pushed++;
    }
    for (const pl of Store.getAllPlaylists()) await pushPlaylist(pl);
    UI.toast(`Uploaded ${pushed} song${pushed!==1?'s':''} to cloud ✓`);
  }

  return {
    _setClient, init,
    pushSong, pushPlaylist, pushLikedState,
    deleteSongFromCloud, deletePlaylistFromCloud,
    pullFromCloud, pushAllToCloud,
  };
})();
