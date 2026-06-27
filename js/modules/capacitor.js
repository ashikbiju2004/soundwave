/**
 * SoundWave — Capacitor Mobile Bridge
 * Provides native iOS/Android features via Capacitor.
 *
 * SETUP (one-time):
 *   npm install
 *   npx cap init SoundWave com.yourname.soundwave --web-dir .
 *   npx cap add android
 *   npx cap add ios
 *   npx cap sync
 *   npx cap open android   → Android Studio → Run
 *   npx cap open ios       → Xcode → Run
 *
 * UPDATE after code changes:
 *   npx cap sync
 */
const CapacitorBridge = (() => {
  const isNative   = () => typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.();
  const getPlatform= () => (typeof Capacitor !== 'undefined' ? Capacitor.getPlatform() : 'web');
  const isAndroid  = () => getPlatform() === 'android';
  const isIOS      = () => getPlatform() === 'ios';

  /* ── Status bar ────────────────────────────────────────────── */
  async function setStatusBarDark() {
    if (!isNative()) return;
    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      await StatusBar.setStyle({ style: Style.Dark });
      if (isAndroid()) await StatusBar.setBackgroundColor({ color: '#0a0a0a' });
    } catch(e) { console.warn('[Cap] StatusBar:', e); }
  }

  async function showStatusBar() {
    if (!isNative()) return;
    try { const { StatusBar } = await import('@capacitor/status-bar'); await StatusBar.show(); } catch {}
  }

  /* ── Safe area (iPhone notch / Dynamic Island) ─────────────── */
  function applySafeArea() {
    if (!isIOS()) return;
    const root = document.documentElement;
    root.style.setProperty('--safe-top',    'env(safe-area-inset-top,    0px)');
    root.style.setProperty('--safe-bottom', 'env(safe-area-inset-bottom, 0px)');
    root.style.setProperty('--safe-left',   'env(safe-area-inset-left,   0px)');
    root.style.setProperty('--safe-right',  'env(safe-area-inset-right,  0px)');

    const sidebar   = document.getElementById('sidebar');
    const playerBar = document.getElementById('playerBar');
    const topbar    = document.querySelector('.topbar');

    if (sidebar)   sidebar.style.paddingTop    = 'var(--safe-top)';
    if (playerBar) playerBar.style.paddingBottom = 'var(--safe-bottom)';
    if (topbar)    topbar.style.paddingTop     = 'calc(16px + var(--safe-top))';
  }

  /* ── Haptics ────────────────────────────────────────────────── */
  async function hapticLight() {
    if (!isNative()) return;
    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}
  }

  async function hapticMedium() {
    if (!isNative()) return;
    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch {}
  }

  async function hapticSuccess() {
    if (!isNative()) return;
    try {
      const { Haptics, NotificationType } = await import('@capacitor/haptics');
      await Haptics.notification({ type: NotificationType.Success });
    } catch {}
  }

  /* ── Share ──────────────────────────────────────────────────── */
  async function shareSong(song) {
    const text = `${song.artist} — ${song.title} 🎵`;
    if (isNative()) {
      try {
        const { Share } = await import('@capacitor/share');
        await Share.share({ title: song.title, text, dialogTitle: 'Share song' });
        return;
      } catch(e) { console.warn('[Cap] Share:', e); }
    }
    // Web fallback
    if (navigator.share) {
      try { await navigator.share({ title: song.title, text, url: window.location.href }); return; }
      catch {}
    }
    // Clipboard fallback
    try { await navigator.clipboard.writeText(text); UI.toast('Copied to clipboard'); }
    catch { UI.toast('Could not share'); }
  }

  /* ── Network status ────────────────────────────────────────── */
  async function watchNetwork() {
    if (isNative()) {
      try {
        const { Network } = await import('@capacitor/network');
        const status = await Network.getStatus();
        if (!status.connected) UI.toast('No internet — playing from local storage');
        Network.addListener('networkStatusChange', s => {
          if (!s.connected) UI.toast('You went offline');
          else             UI.toast('Back online ✓');
        });
        return;
      } catch {}
    }
    // Web fallback
    window.addEventListener('online',  () => UI.toast('Back online ✓'));
    window.addEventListener('offline', () => UI.toast('You went offline — playing local songs'));
  }

  /* ── Android back button ───────────────────────────────────── */
  function registerBackButton() {
    if (!isAndroid()) return;
    document.addEventListener('backbutton', (e) => {
      const view = Views.getCurrentView();
      if (document.getElementById('modalOverlay')?.classList.contains('hidden') === false) {
        UI.closeModal(); return;
      }
      if (view !== 'home') { Views.showHome(); return; }
      // Exit app on double-back
      if (window._lastBack && Date.now() - window._lastBack < 2000) {
        if (typeof App !== 'undefined') App.exitApp?.();
      } else {
        window._lastBack = Date.now();
        UI.toast('Press back again to exit');
      }
    }, false);
  }

  /* ── Splash screen ─────────────────────────────────────────── */
  async function hideSplash() {
    if (!isNative()) return;
    try {
      const { SplashScreen } = await import('@capacitor/splash-screen');
      await SplashScreen.hide({ fadeOutDuration: 400 });
    } catch {}
  }

  /* ── Keyboard ──────────────────────────────────────────────── */
  async function setupKeyboard() {
    if (!isNative()) return;
    try {
      const { Keyboard } = await import('@capacitor/keyboard');
      Keyboard.addListener('keyboardWillShow', info => {
        document.body.style.paddingBottom = `${info.keyboardHeight}px`;
      });
      Keyboard.addListener('keyboardWillHide', () => {
        document.body.style.paddingBottom = '';
      });
    } catch {}
  }

  /* ── App state (pause/resume) ──────────────────────────────── */
  async function setupAppState() {
    if (!isNative()) return;
    try {
      const { App } = await import('@capacitor/app');
      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          // App went to background — audio keeps playing (handled by OS)
          console.log('[Cap] App backgrounded');
        } else {
          console.log('[Cap] App foregrounded');
        }
      });
    } catch {}
  }

  /* ── Init ───────────────────────────────────────────────────── */
  async function init() {
    if (!isNative()) {
      console.log('[Cap] Web mode — native features disabled');
      // Still watch network on web
      await watchNetwork();
      return;
    }
    console.log(`[Cap] Native platform: ${getPlatform()}`);
    await setStatusBarDark();
    await showStatusBar();
    applySafeArea();
    registerBackButton();
    await watchNetwork();
    await setupKeyboard();
    await setupAppState();
    setTimeout(() => hideSplash(), 800);
  }

  return {
    init, isNative, getPlatform, isAndroid, isIOS,
    hapticLight, hapticMedium, hapticSuccess,
    shareSong, hideSplash,
  };
})();
