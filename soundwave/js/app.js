/**
 * SoundWave — Master App Bootstrap
 * Wires: Auth Gate → App Shell → Audio → Modules → Events
 */
(async () => {
  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  /* ═══════════════════════════════════════════════════════════════
     CONFIG  — fill these in after Supabase setup
  ═══════════════════════════════════════════════════════════════ */
  const SUPABASE_URL  = 'https://ntsgouxhguljuwligqpk.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50c2dvdXhoZ3VsanV3bGlncXBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NTA2NTcsImV4cCI6MjA5ODEyNjY1N30.o-x6VuKPkKZYSFks8rnXwFpyfd0V_XcezbMZfuqEW2s';

  /* ═══════════════════════════════════════════════════════════════
     STATE
  ═══════════════════════════════════════════════════════════════ */
  let isGuest     = false;
  let currentUser = null;   // Supabase user object
  let userProfile = null;   // profiles table row

  /* ═══════════════════════════════════════════════════════════════
     1. STORE + SUPABASE INIT
  ═══════════════════════════════════════════════════════════════ */
  await Store.init();

  // Init Supabase if configured
  const supabaseConfigured = (SUPABASE_URL !== 'https://ntsgouxhguljuwligqpk.supabase.co/rest/v1/' && window.supabase);
  if (supabaseConfigured) {
    window._supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    CloudSync._setClient(window._supabase);
  }

  /* ═══════════════════════════════════════════════════════════════
     2. AUTH GATE
  ═══════════════════════════════════════════════════════════════ */

  // Show auth gate or boot directly
  if (supabaseConfigured) {
    const { data: { session } } = await window._supabase.auth.getSession();
    if (session?.user) {
      currentUser = session.user;
      userProfile = await fetchProfile(session.user.id);
      await bootApp();
    } else {
      showAuthGate();
    }

    // Listen for auth state changes (OAuth redirects etc.)
    window._supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user && !currentUser) {
        currentUser = session.user;
        userProfile = await fetchProfile(session.user.id);
        hideAuthGate();
        await bootApp();
      } else if (!session && currentUser) {
        currentUser = null; userProfile = null;
        location.reload();
      }
    });
  } else {
    // No Supabase configured — skip auth gate, go straight to app
    isGuest = true;
    showAuthGate();          // still show for UX, guest option prominent
  }

  /* ─── Auth Gate UI wiring ────────────────────────────────────── */
  function showAuthGate() {
    $('authGate').classList.remove('hidden');
    $('app').classList.add('hidden');
    $('playerBar').classList.add('hidden');
  }
  function hideAuthGate() {
    $('authGate').classList.add('hidden');
  }

  // Tab switching
  $('tabSignIn').addEventListener('click', () => {
    $('tabSignIn').classList.add('active');
    $('tabSignUp').classList.remove('active');
    $('formSignIn').classList.remove('hidden');
    $('formSignUp').classList.add('hidden');
  });
  $('tabSignUp').addEventListener('click', () => {
    $('tabSignUp').classList.add('active');
    $('tabSignIn').classList.remove('active');
    $('formSignUp').classList.remove('hidden');
    $('formSignIn').classList.add('hidden');
  });

  // Google sign-in
  ['googleSignInBtn','googleSignUpBtn'].forEach(id => {
    $(id)?.addEventListener('click', async () => {
      if (!supabaseConfigured) { showError('siError','Supabase not configured'); return; }
      try {
        await window._supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: 'https://wave-sound.netlify.app' } });
      } catch(e) { showError('siError', e.message); }
    });
  });

  // Sign In submit
  $('siSubmit').addEventListener('click', async () => {
    clearErrors();
    const email    = $('siEmail').value.trim();
    const password = $('siPassword').value;
    if (!email || !password) { showError('siError','Please fill in all fields'); return; }
    if (!supabaseConfigured) { showError('siError','Supabase not configured — use Guest mode'); return; }
    setAuthLoading(true);
    try {
      const { data, error } = await window._supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentUser = data.user;
      userProfile = await fetchProfile(data.user.id);
      hideAuthGate();
      await bootApp();
    } catch(e) {
      showError('siError', e.message);
    } finally { setAuthLoading(false); }
  });

  // Sign Up submit
  $('suSubmit').addEventListener('click', async () => {
    clearErrors();
    const name     = $('suName').value.trim();
    const email    = $('suEmail').value.trim();
    const password = $('suPassword').value;
    const confirm  = $('suConfirm').value;
    if (!name || !email || !password) { showError('suError','Please fill in all fields'); return; }
    if (password.length < 8) { showError('suError','Password must be at least 8 characters'); return; }
    if (password !== confirm) { showError('suError','Passwords do not match'); return; }
    if (!supabaseConfigured) { showError('suError','Supabase not configured — use Guest mode'); return; }
    setAuthLoading(true);
    try {
      const { data, error } = await window._supabase.auth.signUp({
        email, password, options: { data: { display_name: name } }
      });
      if (error) throw error;
      if (data.user && !data.session) {
        showError('suError','Check your email to confirm your account.');
      } else {
        currentUser = data.user;
        userProfile = await fetchProfile(data.user.id);
        hideAuthGate();
        await bootApp();
      }
    } catch(e) {
      showError('suError', e.message);
    } finally { setAuthLoading(false); }
  });

  // Forgot password
  $('forgotPasswordBtn').addEventListener('click', async () => {
    const email = $('siEmail').value.trim();
    if (!email) { showError('siError','Enter your email first'); return; }
    if (!supabaseConfigured) return;
    await window._supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
    showError('siError','Password reset email sent! Check your inbox.');
    $('siError').style.color = 'var(--accent)';
  });

  // Guest mode
  $('continueAsGuestBtn').addEventListener('click', async () => {
    isGuest = true;
    currentUser = null;
    userProfile = null;
    hideAuthGate();
    await bootApp();
  });

  // Enter key on password fields
  $('siPassword').addEventListener('keydown', e => { if (e.key==='Enter') $('siSubmit').click(); });
  $('suConfirm').addEventListener('keydown',  e => { if (e.key==='Enter') $('suSubmit').click(); });

  function showError(id, msg) {
    const el = $(id);
    el.textContent = msg;
    el.classList.remove('hidden');
    el.style.color = '';
  }
  function clearErrors() {
    ['siError','suError'].forEach(id => $(id) && $(id).classList.add('hidden'));
  }
  function setAuthLoading(on) {
    ['siSubmit','suSubmit'].forEach(id => {
      const el = $(id);
      if (el) { el.disabled = on; el.style.opacity = on ? '0.6' : '1'; }
    });
  }

  /* ─── Profile fetch ───────────────────────────────────────────── */
  async function fetchProfile(userId) {
    if (!window._supabase) return null;
    try {
      const { data } = await window._supabase.from('profiles').select('*').eq('id', userId).single();
      return data;
    } catch { return null; }
  }

  /* ═══════════════════════════════════════════════════════════════
     3. BOOT APP (called after auth succeeds or guest chosen)
  ═══════════════════════════════════════════════════════════════ */
  async function bootApp() {
    $('app').classList.remove('hidden');
    $('playerBar').classList.remove('hidden');

    // Init audio chain
    AudioEngine.init($('audioElement'));
    Equalizer.init($('audioElement'));
    Visualizer.init();

    // Restore volume / shuffle / repeat
    const st = Store.getState();
    AudioEngine.setVolume(st.volume);
    UI.updateVolume(st.volume);
    UI.updateShuffleBtn(st.shuffle);
    UI.updateRepeatBtn(st.repeat);

    // Show/hide admin nav
    const isAdmin = userProfile?.role === 'admin';
    $$('.admin-only').forEach(el => {
      el.classList.toggle('hidden', !isAdmin);
      if (isAdmin) el.classList.add('visible');
    });

    // Update sidebar user strip
    updateUserUI();

    // Cloud sync if signed in
    if (currentUser && supabaseConfigured) {
      CloudSync.init(window._supabase, currentUser, userProfile);
      showSyncIndicator(true);
      await CloudSync.pullFromCloud().catch(()=>{});
      showSyncIndicator(false);
    }

    // Render home
    UI.renderSidebar();
    Views.showHome();

    // Wire up all events
    wireEvents();
  }

  /* ─── Update user UI (avatar, name, plan) ─────────────────────── */
  function updateUserUI() {
    const name  = userProfile?.display_name || currentUser?.user_metadata?.display_name
                  || currentUser?.email?.split('@')[0] || 'Guest';
    const plan  = userProfile?.plan || (isGuest ? 'guest' : 'free');
    const initials = name.slice(0,2).toUpperCase();

    // Topbar avatar
    const av = $('topbarAvatar');
    if (av) { av.textContent = initials; }

    // Sidebar user strip
    const sav  = $('sidebarAvatar');
    const sname= $('sidebarUserName');
    const splan= $('sidebarUserPlan');
    if (sav)   sav.textContent   = initials;
    if (sname) sname.textContent = name;
    if (splan) {
      splan.textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
      splan.className   = `sidebar-user-plan ${plan}`;
    }
  }

  function showSyncIndicator(on) {
    $('syncIndicator')?.classList.toggle('hidden', !on);
  }

  /* ═══════════════════════════════════════════════════════════════
     4. EVENT WIRING
  ═══════════════════════════════════════════════════════════════ */
  function wireEvents() {

    /* ── Audio Engine events ──────────────────────────────────── */
    AudioEngine.on('songchange', song => {
      UI.updatePlayerSong(song);
      UI.updatePlayPause(true);
      UI.renderQueue();
      document.title = `${song.title} • SoundWave`;
      Views.refreshCurrentView();
      // Record play in cloud
      if (currentUser && supabaseConfigured) {
        window._supabase.rpc('record_play', { song_id: song.id, duration_played: 0 }).catch(()=>{});
      }
      // Update visualizer info
      $('vizTitle').textContent  = song.title;
      $('vizArtist').textContent = song.artist;
      // Update lyrics if panel open
      if (Lyrics.isOpen()) Lyrics.showPanel(song);
    });

    AudioEngine.on('play',  () => UI.updatePlayPause(true));
    AudioEngine.on('pause', () => UI.updatePlayPause(false));

    AudioEngine.on('timeupdate', ({ current, duration }) => {
      UI.updateProgress(current, duration);
    });

    AudioEngine.on('ended', () => {
      const next = Store.nextInQueue();
      if (next) AudioEngine.playSong(next);
      else { UI.updatePlayPause(false); document.title = 'SoundWave'; }
    });

    AudioEngine.on('error', () => {
      UI.toast('Could not play this track.');
      UI.updatePlayPause(false);
    });

    /* ── Player bar controls ──────────────────────────────────── */
    $('playPauseBtn').addEventListener('click', () => {
      Equalizer.resume();
      const cur = Store.getCurrentQueueSong();
      if (!cur) {
        const songs = Store.getAllSongs();
        if (!songs.length) { UI.toast('Upload some music first!'); return; }
        Store.setQueue(songs.map(s=>s.id), 0);
        AudioEngine.playSong(songs[0]);
      } else {
        AudioEngine.togglePlay();
      }
    });

    $('nextBtn').addEventListener('click', () => {
      const next = Store.nextInQueue();
      if (next) AudioEngine.playSong(next);
      else UI.toast('End of queue');
    });

    $('prevBtn').addEventListener('click', () => {
      if (AudioEngine.getCurrentTime() > 3) AudioEngine.seek(0);
      else {
        const prev = Store.prevInQueue();
        if (prev) AudioEngine.playSong(prev);
      }
    });

    $('shuffleBtn').addEventListener('click', () => {
      const on = !Store.getState().shuffle;
      Store.setShuffle(on);
      UI.updateShuffleBtn(on);
      UI.toast(on ? 'Shuffle on' : 'Shuffle off');
    });

    $('repeatBtn').addEventListener('click', () => {
      const modes = ['none','all','one'];
      const next  = modes[(modes.indexOf(Store.getState().repeat)+1) % 3];
      Store.setRepeat(next);
      UI.updateRepeatBtn(next);
      UI.toast({ none:'Repeat off', all:'Repeat all', one:'Repeat one' }[next]);
    });

    $('playerLikeBtn').addEventListener('click', () => {
      const id = Store.getState().currentSongId;
      if (!id) return;
      const song = Store.toggleLike(id);
      UI.updateLikeButton(song?.liked);
      UI.renderSidebar();
      Views.refreshCurrentView();
      if (currentUser && supabaseConfigured) {
        CloudSync.pushLikedState(id, song?.liked).catch(()=>{});
      }
    });

    /* ── Progress bar ─────────────────────────────────────────── */
    let draggingProg = false;
    const progWrap   = $('progressBarWrap');
    const seekAt = e => {
      const rect = progWrap.querySelector('.progress-bar-bg').getBoundingClientRect();
      AudioEngine.seekByPercent(Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)));
    };
    progWrap.addEventListener('mousedown', e => { draggingProg=true; seekAt(e); });
    document.addEventListener('mousemove', e => { if(draggingProg) seekAt(e); });
    document.addEventListener('mouseup',   () => { draggingProg=false; });
    progWrap.addEventListener('touchstart', e => { draggingProg=true; seekAt(e.touches[0]); }, {passive:true});
    document.addEventListener('touchmove',  e => { if(draggingProg) seekAt(e.touches[0]); }, {passive:true});
    document.addEventListener('touchend',   () => { draggingProg=false; });

    /* ── Volume bar ───────────────────────────────────────────── */
    let draggingVol = false;
    const volWrap   = $('volBarWrap');
    const setVolAt  = e => {
      const rect = volWrap.querySelector('.progress-bar-bg').getBoundingClientRect();
      const v    = Math.max(0, Math.min(1,(e.clientX-rect.left)/rect.width));
      AudioEngine.setVolume(v);
      UI.updateVolume(v);
    };
    volWrap.addEventListener('mousedown', e => { draggingVol=true; setVolAt(e); });
    document.addEventListener('mousemove', e => { if(draggingVol) setVolAt(e); });
    document.addEventListener('mouseup',   () => { draggingVol=false; });

    $('volMuteBtn').addEventListener('click', () => {
      const muted = AudioEngine.mute();
      UI.updateVolume(muted ? 0 : Store.getState().volume);
    });

    /* ── Lyrics ───────────────────────────────────────────────── */
    $('lyricsBtn').addEventListener('click', () => {
      if (Lyrics.isOpen()) { Lyrics.closePanel(); $('lyricsBtn').classList.remove('active'); }
      else {
        const song = Store.getCurrentQueueSong() || Store.getSong(Store.getState().currentSongId);
        Lyrics.showPanel(song);
        $('lyricsBtn').classList.add('active');
      }
    });

    /* ── Equalizer ────────────────────────────────────────────── */
    $('eqBtn').addEventListener('click', () => {
      Equalizer.showPanel();
      $('eqBtn').classList.toggle('active');
    });

    /* ── Visualizer ───────────────────────────────────────────── */
    $('vizBtn').addEventListener('click', () => {
      const song = Store.getCurrentQueueSong();
      Equalizer.resume();
      Visualizer.show(song);
    });

    /* ── Queue panel ──────────────────────────────────────────── */
    $('queueBtn').addEventListener('click', () => {
      const panel = $('queuePanel');
      const open  = panel.classList.toggle('hidden');
      $('queueBtn').classList.toggle('active', !panel.classList.contains('hidden'));
      if (!panel.classList.contains('hidden')) UI.renderQueue();
    });
    $('closeQueue').addEventListener('click', () => {
      $('queuePanel').classList.add('hidden');
      $('queueBtn').classList.remove('active');
    });

    /* ── Navigation ───────────────────────────────────────────── */
    $$('.nav-item').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        const v = el.dataset.view;
        if (v === 'home')   Views.showHome();
        else if (v==='search') Views.showSearch();
        else if (v==='admin')  Admin.showPanel();
      });
    });

    $('backBtn').addEventListener('click', () => Views.showHome());

    /* ── Search ───────────────────────────────────────────────── */
    let searchT;
    $('searchInput').addEventListener('input', e => {
      clearTimeout(searchT);
      searchT = setTimeout(() => Views.renderSearch(e.target.value), 200);
    });
    $('searchInput').addEventListener('focus', () => {
      if (Views.getCurrentView() !== 'search') Views.showSearch();
    });

    /* ── Upload ───────────────────────────────────────────────── */
    $('uploadBtn').addEventListener('click', () => $('fileInput').click());
    $('fileInput').addEventListener('change', e => handleFiles(Array.from(e.target.files)));

    // Drag & drop
    document.addEventListener('dragenter', e => {
      if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); $('dropZone').classList.remove('hidden'); }
    });
    document.addEventListener('dragover',  e => e.preventDefault());
    document.addEventListener('dragleave', e => {
      if (!e.relatedTarget || !document.body.contains(e.relatedTarget)) $('dropZone').classList.add('hidden');
    });
    document.addEventListener('drop', e => {
      e.preventDefault();
      $('dropZone').classList.add('hidden');
      const files = Array.from(e.dataTransfer.files).filter(f => isAudioFile(f));
      if (files.length) handleFiles(files);
      else UI.toast('No supported audio files found');
    });
    $('dropZone').addEventListener('click', () => { $('dropZone').classList.add('hidden'); $('fileInput').click(); });

    /* ── Create playlist ──────────────────────────────────────── */
    $('createPlaylistBtn').addEventListener('click', () => UI.showCreatePlaylistModal());

    /* ── Library filter chips ─────────────────────────────────── */
    $$('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        $$('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        UI.renderSidebar();
      });
    });

    /* ── Sidebar user menu ────────────────────────────────────── */
    $('sidebarUser').addEventListener('click', showUserMenu);
    $('topbarAvatar').addEventListener('click', showUserMenu);

    /* ── Modal dismiss ────────────────────────────────────────── */
    $('closeModal').addEventListener('click', () => UI.closeModal());
    $('modalOverlay').addEventListener('click', e => { if(e.target===$('modalOverlay')) UI.closeModal(); });

    /* ── Context menu dismiss ─────────────────────────────────── */
    document.addEventListener('click', e => { if(!e.target.closest('#contextMenu')) UI.hideContextMenu(); });

    /* ── YouTube import button (in search view) ───────────────── */
    document.addEventListener('click', e => {
      if (e.target.id === 'youtubeImportBtn' || e.target.closest('#youtubeImportBtn')) {
        YouTube.showPanel();
      }
    });

    /* ── Keyboard shortcuts ───────────────────────────────────── */
    document.addEventListener('keydown', e => {
      const tag = e.target.tagName.toLowerCase();
      const editing = tag==='input'||tag==='textarea'||e.target.isContentEditable;
      if (editing) return;
      switch(e.key) {
        case ' ':          e.preventDefault(); $('playPauseBtn').click(); break;
        case 'ArrowRight': if(e.ctrlKey||e.metaKey){ e.preventDefault(); $('nextBtn').click(); } break;
        case 'ArrowLeft':  if(e.ctrlKey||e.metaKey){ e.preventDefault(); $('prevBtn').click(); } break;
        case 'ArrowUp':    if(e.ctrlKey||e.metaKey){ e.preventDefault(); changeVol(0.1);  } break;
        case 'ArrowDown':  if(e.ctrlKey||e.metaKey){ e.preventDefault(); changeVol(-0.1); } break;
        case 'f': case '/': e.preventDefault(); Views.showSearch(); setTimeout(()=>$('searchInput').focus(),80); break;
        case 'l': case 'L': $('playerLikeBtn').click(); break;
        case 'q': case 'Q': $('queueBtn').click(); break;
        case 's': case 'S': $('shuffleBtn').click(); break;
        case 'Escape':
          UI.hideContextMenu(); UI.closeModal();
          $('dropZone').classList.add('hidden');
          Visualizer.hide(); Lyrics.closePanel(); YouTube.closePanel?.();
          break;
      }
    });

    /* ── Media Session API ────────────────────────────────────── */
    if ('mediaSession' in navigator) {
      AudioEngine.on('songchange', song => {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: song.title, artist: song.artist, album: song.album,
        });
      });
      navigator.mediaSession.setActionHandler('play',         () => AudioEngine.play());
      navigator.mediaSession.setActionHandler('pause',        () => AudioEngine.pause());
      navigator.mediaSession.setActionHandler('nexttrack',    () => $('nextBtn').click());
      navigator.mediaSession.setActionHandler('previoustrack',() => $('prevBtn').click());
      navigator.mediaSession.setActionHandler('seekto',       d  => d.seekTime!=null && AudioEngine.seek(d.seekTime));
    }

    /* ── Scroll topbar effect ─────────────────────────────────── */
    $('mainContent').addEventListener('scroll', () => {
      const scrolled = $('mainContent').scrollTop > 60;
      document.querySelector('.topbar').style.background = scrolled
        ? 'rgba(10,10,10,0.97)'
        : 'linear-gradient(to bottom,rgba(10,10,10,0.98) 0%,transparent 100%)';
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     5. FILE UPLOAD HANDLER
  ═══════════════════════════════════════════════════════════════ */
  function isAudioFile(f) {
    return f.type.startsWith('audio/') || /\.(mp3|wav|flac|m4a|ogg|aac|opus|wma)$/i.test(f.name);
  }

  async function handleFiles(files) {
    const audio = files.filter(isAudioFile);
    if (!audio.length) { UI.toast('No supported audio files found'); return; }

    const toast = progressToast(audio.length);
    let added = 0;

    for (const file of audio) {
      try {
        const song = await Store.addSong(file);
        added++;
        toast.update(added, audio.length);
        // Push to cloud in background
        if (currentUser && supabaseConfigured) {
          const blob  = await Store.getAudioBlob(song.id);
          const cover = await Store.getCoverBlob(song.id);
          CloudSync.pushSong(song, blob, cover).catch(()=>{});
        }
      } catch(e) { console.error('Failed to add:', file.name, e); }
    }

    toast.finish(`Added ${added} song${added!==1?'s':''}`);
    UI.renderSidebar();
    Views.refreshCurrentView();
    $('fileInput').value = '';
  }

  function progressToast(total) {
    const el = document.createElement('div');
    el.className = 'toast'; el.style.cssText='bottom:110px;animation:none;';
    el.textContent = `Importing 0 / ${total}…`;
    document.body.appendChild(el);
    return {
      update(d,t){ el.textContent=`Importing ${d} / ${t}…`; },
      finish(msg){ el.textContent=msg; setTimeout(()=>el.remove(),2500); }
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     6. USER MENU
  ═══════════════════════════════════════════════════════════════ */
  function showUserMenu() {
    if (isGuest || !currentUser) {
      UI.showModal('Sign In', `
        <p style="color:var(--text-secondary);margin-bottom:16px;font-size:13px;">
          Sign in to sync your library across all devices.
        </p>
        <div class="modal-actions">
          <button class="btn-ghost" onclick="UI.closeModal()">Cancel</button>
          <button class="btn-primary" onclick="UI.closeModal();location.reload();">Sign In</button>
        </div>
      `);
      return;
    }

    const name    = userProfile?.display_name || currentUser.email?.split('@')[0] || 'User';
    const email   = currentUser.email || '';
    const plan    = userProfile?.plan || 'free';
    const usedMB  = Math.round((userProfile?.storage_used||0)/1048576);
    const limitGB = Math.round((userProfile?.storage_limit||1073741824)/1073741824);
    const pct     = Math.min(100, Math.round((userProfile?.storage_used||0) / (userProfile?.storage_limit||1) * 100));
    const barClass= pct>90?'danger':pct>70?'warning':'';

    UI.showModal('Your Account', `
      <div style="text-align:center;padding:8px 0 20px;">
        <div style="width:72px;height:72px;border-radius:50%;background:var(--accent);color:#000;font-size:26px;font-weight:800;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
          ${name.slice(0,2).toUpperCase()}
        </div>
        <div style="font-size:18px;font-weight:700;">${UI.escHtml(name)}</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-top:3px;">${UI.escHtml(email)}</div>
        <span class="badge badge-${plan}" style="margin-top:8px;display:inline-flex;">${plan}</span>
      </div>

      <div style="background:var(--bg-highlight);border-radius:8px;padding:14px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:6px;">
          <span>Storage</span><span>${usedMB} MB / ${limitGB} GB</span>
        </div>
        <div class="storage-bar-bg">
          <div class="storage-bar-fill ${barClass}" style="width:${pct}%"></div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
        <button class="profile-action-btn" id="menuSyncBtn">
          <svg viewBox="0 0 24 24"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
          Sync Library Now
        </button>
        <button class="profile-action-btn" id="menuProfileBtn">
          <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
          View Profile
        </button>
        ${userProfile?.role==='admin' ? `<button class="profile-action-btn" id="menuAdminBtn">
          <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
          Admin Panel
        </button>` : ''}
        <button class="profile-action-btn danger" id="menuSignOutBtn">
          <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
          Sign Out
        </button>
      </div>
    `);

    $('menuSyncBtn')?.addEventListener('click', async () => {
      UI.closeModal(); showSyncIndicator(true);
      await CloudSync.pullFromCloud().catch(()=>{});
      showSyncIndicator(false);
    });
    $('menuProfileBtn')?.addEventListener('click', () => { UI.closeModal(); Views.showProfile(userProfile, currentUser); });
    $('menuAdminBtn')?.addEventListener('click',   () => { UI.closeModal(); Admin.showPanel(); });
    $('menuSignOutBtn')?.addEventListener('click', async () => {
      UI.closeModal();
      if (window._supabase) await window._supabase.auth.signOut();
      currentUser = null; userProfile = null; isGuest = false;
      location.reload();
    });
  }

  /* ── Helpers ──────────────────────────────────────────────────── */
  function changeVol(delta) {
    const v = Math.max(0, Math.min(1, AudioEngine.getVolume()+delta));
    AudioEngine.setVolume(v); UI.updateVolume(v);
  }

  CapacitorBridge.init();
  console.log("%c🎵 SoundWave ready", "color:#1DB954;font-size:14px;font-weight:bold;");
})();
