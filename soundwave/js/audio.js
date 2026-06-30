/**
 * SoundWave — Audio Engine
 */
const AudioEngine = (() => {
  let el  = null;
  let url = null;
  const cbs = {};

  function init(audioElement) {
    el = audioElement;
    el.volume = Store.getState().volume;
    el.addEventListener('timeupdate',     () => emit('timeupdate', { current:el.currentTime, duration:el.duration||0 }));
    el.addEventListener('ended',          () => emit('ended'));
    el.addEventListener('play',           () => emit('play'));
    el.addEventListener('pause',          () => emit('pause'));
    el.addEventListener('loadedmetadata', () => emit('durationchange', el.duration));
    el.addEventListener('error',          e  => emit('error', e));
    el.addEventListener('waiting',        () => emit('buffering', true));
    el.addEventListener('canplay',        () => emit('buffering', false));
  }

  function on(ev, fn)  { if (!cbs[ev]) cbs[ev]=[]; cbs[ev].push(fn); }
  function off(ev, fn) { if (cbs[ev]) cbs[ev]=cbs[ev].filter(f=>f!==fn); }
  function emit(ev, d) { (cbs[ev]||[]).forEach(fn=>fn(d)); }

  async function playSong(song) {
    if (!song) return;
    if (url) { URL.revokeObjectURL(url); url = null; }

    // YouTube tracks — just emit songchange, no blob
    if (song.isYouTube) {
      Store.setCurrentSong(song.id);
      Store.addToRecentlyPlayed(song.id);
      emit('songchange', song);
      return;
    }

    try {
      const blob = await Store.getAudioBlob(song.id);
      if (!blob) { UI.toast('Audio not found — try re-uploading'); return; }
      url    = URL.createObjectURL(blob);
      el.src = url;
      el.load();
      await el.play();
      Store.setCurrentSong(song.id);
      Store.addToRecentlyPlayed(song.id);
      emit('songchange', song);
    } catch(e) {
      if (e.name !== 'AbortError') console.error('[Audio] Play error:', e);
    }
  }

  function play()            { return el.play().catch(()=>{}); }
  function pause()           { el.pause(); }
  function togglePlay()      { el.paused ? play() : pause(); }
  function isPlaying()       { return !el.paused; }
  function seek(t)           { el.currentTime = t; }
  function seekByPercent(p)  { if (el.duration) el.currentTime = p * el.duration; }
  function setVolume(v)      { el.volume = Math.max(0,Math.min(1,v)); Store.setVolume(el.volume); }
  function getVolume()       { return el.volume; }
  function mute()            { el.muted = !el.muted; return el.muted; }
  function isMuted()         { return el.muted; }
  function getCurrentTime()  { return el.currentTime; }
  function getDuration()     { return el.duration||0; }
  function getProgress()     { return el.duration ? el.currentTime/el.duration : 0; }

  return {
    init, on, off,
    playSong, play, pause, togglePlay, isPlaying,
    seek, seekByPercent, setVolume, getVolume, mute, isMuted,
    getCurrentTime, getDuration, getProgress,
  };
})();
