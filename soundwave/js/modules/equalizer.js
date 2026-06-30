/**
 * SoundWave — 10-Band Equalizer (Web Audio API)
 * Connects between the audio element and the destination.
 * Persists band settings to localStorage.
 */
const Equalizer = (() => {
  let audioCtx = null;
  let sourceNode = null;
  let filters = [];
  let analyserNode = null;
  let gainNode = null;
  let connected = false;
  let enabled = true;
  let animFrameId = null;

  // 10-band EQ frequencies (Hz)
  const BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const BAND_LABELS = ['32', '64', '125', '250', '500', '1K', '2K', '4K', '8K', '16K'];

  const PRESETS = {
    'Flat':        [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    'Bass Boost':  [ 8,  7,  6,  4,  2,  0,  0,  0,  0,  0],
    'Treble Boost':[ 0,  0,  0,  0,  0,  2,  4,  6,  7,  8],
    'Pop':         [-1,  3,  5,  5,  2,  0, -2, -2, -1, -1],
    'Rock':        [ 5,  4,  3,  1, -1, -1,  2,  5,  6,  6],
    'Jazz':        [ 3,  2,  1,  2, -2, -2,  0,  1,  2,  3],
    'Classical':   [ 5,  4,  3,  2,  0,  0, -2,  0,  2,  4],
    'Electronic':  [ 6,  5,  1,  0, -3, -1,  0,  2,  5,  7],
    'Hip-Hop':     [ 6,  5,  3,  1,  0, -1,  0,  2,  3,  4],
    'Vocal':       [-2, -2,  0,  3,  5,  5,  3,  1,  0, -1],
    'Night Mode':  [-5, -5, -4, -2,  0,  0, -2, -4, -5, -5],
  };

  // ── Init ─────────────────────────────────────────────────────────
  function init(audioElement) {
    if (connected) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      sourceNode = audioCtx.createMediaElementSource(audioElement);

      // Create 10 peaking filters
      filters = BANDS.map((freq, i) => {
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.4;
        filter.gain.value = loadBandGain(i);
        return filter;
      });

      // Analyser for visualizer
      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 256;

      // Master gain
      gainNode = audioCtx.createGain();
      gainNode.gain.value = 1;

      // Chain: source → filters[0] → … → filters[9] → analyser → gain → destination
      let node = sourceNode;
      filters.forEach(f => { node.connect(f); node = f; });
      node.connect(analyserNode);
      analyserNode.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      connected = true;
      console.log('[EQ] Audio graph connected');
    } catch(e) {
      console.warn('[EQ] Could not connect audio graph:', e);
    }
  }

  // ── Resume context (required after user gesture) ──────────────────
  function resume() {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  // ── Band control ──────────────────────────────────────────────────
  function setBand(index, gainDb) {
    if (!filters[index]) return;
    filters[index].gain.value = Math.max(-12, Math.min(12, gainDb));
    saveBandGain(index, gainDb);
  }

  function getBand(index) {
    return filters[index] ? filters[index].gain.value : 0;
  }

  function getAllBands() {
    return BANDS.map((_, i) => getBand(i));
  }

  function applyPreset(name) {
    const gains = PRESETS[name];
    if (!gains) return;
    gains.forEach((g, i) => setBand(i, g));
    return gains;
  }

  function setEnabled(on) {
    enabled = on;
    if (!connected) return;
    // Bypass by setting all gains to 0
    if (!on) {
      filters.forEach(f => f.gain.value = 0);
    } else {
      BANDS.forEach((_, i) => {
        if (filters[i]) filters[i].gain.value = loadBandGain(i);
      });
    }
  }

  // ── Analyser ───────────────────────────────────────────────────────
  function getFrequencyData() {
    if (!analyserNode) return new Uint8Array(0);
    const data = new Uint8Array(analyserNode.frequencyBinCount);
    analyserNode.getByteFrequencyData(data);
    return data;
  }

  // ── Persistence ────────────────────────────────────────────────────
  function saveBandGain(i, g) {
    const all = JSON.parse(localStorage.getItem('sw_eq') || '[]');
    all[i] = g;
    localStorage.setItem('sw_eq', JSON.stringify(all));
  }

  function loadBandGain(i) {
    try {
      const all = JSON.parse(localStorage.getItem('sw_eq') || '[]');
      return all[i] !== undefined ? all[i] : 0;
    } catch { return 0; }
  }

  // ── UI ─────────────────────────────────────────────────────────────
  function showPanel() {
    const gains = getAllBands();
    const presetBtns = Object.keys(PRESETS).map(name =>
      `<button class="eq-preset-btn filter-chip" data-preset="${name}">${name}</button>`
    ).join('');

    const sliders = BANDS.map((freq, i) => `
      <div class="eq-band">
        <span class="eq-val" id="eqVal${i}">${gains[i] >= 0 ? '+' : ''}${Math.round(gains[i])}dB</span>
        <input type="range" class="eq-slider" id="eqSlider${i}"
          min="-12" max="12" step="0.5" value="${gains[i]}"
          orient="vertical" />
        <span class="eq-label">${BAND_LABELS[i]}</span>
      </div>
    `).join('');

    UI.showModal('Equalizer', `
      <div style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
          <input type="checkbox" id="eqEnabled" ${enabled ? 'checked' : ''} style="accent-color:var(--accent);width:16px;height:16px;" />
          Enable EQ
        </label>
        <button class="btn-ghost" id="eqReset" style="font-size:12px;">Reset to flat</button>
      </div>
      <div class="eq-presets" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">${presetBtns}</div>
      <div class="eq-canvas-wrap" style="margin-bottom:12px;">
        <canvas id="eqCanvas" width="460" height="60" style="width:100%;border-radius:6px;background:#111;"></canvas>
      </div>
      <div class="eq-bands" style="display:flex;justify-content:space-between;gap:4px;height:160px;align-items:flex-end;">${sliders}</div>
    `);

    // Inject EQ CSS if not present
    if (!document.getElementById('eqStyles')) {
      const style = document.createElement('style');
      style.id = 'eqStyles';
      style.textContent = `
        .eq-band { display:flex;flex-direction:column;align-items:center;gap:4px;flex:1; }
        .eq-val { font-size:9px;color:var(--accent);font-weight:600;min-height:14px;text-align:center; }
        .eq-label { font-size:10px;color:var(--text-muted);text-align:center; }
        .eq-slider {
          writing-mode:vertical-lr; direction:rtl;
          width:24px; height:120px; cursor:pointer;
          -webkit-appearance:slider-vertical;
          accent-color:var(--accent);
        }
        .eq-preset-btn { padding:4px 10px;font-size:11px; }
        .eq-preset-btn.active { background:var(--accent);color:#000; }
      `;
      document.head.appendChild(style);
    }

    // Slider events
    BANDS.forEach((_, i) => {
      const slider = document.getElementById(`eqSlider${i}`);
      const valEl = document.getElementById(`eqVal${i}`);
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        setBand(i, v);
        valEl.textContent = `${v >= 0 ? '+' : ''}${v.toFixed(1)}dB`;
        drawEQCurve();
      });
    });

    // Preset buttons
    document.querySelectorAll('.eq-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const gains = applyPreset(btn.dataset.preset);
        document.querySelectorAll('.eq-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        BANDS.forEach((_, i) => {
          const slider = document.getElementById(`eqSlider${i}`);
          const valEl = document.getElementById(`eqVal${i}`);
          if (slider && gains) {
            slider.value = gains[i];
            valEl.textContent = `${gains[i] >= 0 ? '+' : ''}${gains[i]}dB`;
          }
        });
        drawEQCurve();
      });
    });

    document.getElementById('eqEnabled').addEventListener('change', (e) => {
      setEnabled(e.target.checked);
    });

    document.getElementById('eqReset').addEventListener('click', () => {
      const gains = applyPreset('Flat');
      BANDS.forEach((_, i) => {
        const slider = document.getElementById(`eqSlider${i}`);
        const valEl = document.getElementById(`eqVal${i}`);
        if (slider) { slider.value = 0; valEl.textContent = '0dB'; }
      });
      document.querySelectorAll('.eq-preset-btn').forEach(b => b.classList.remove('active'));
      drawEQCurve();
    });

    drawEQCurve();
    startVisualizer();
  }

  function drawEQCurve() {
    const canvas = document.getElementById('eqCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const gains = getAllBands();
    const points = BANDS.map((freq, i) => {
      const x = (Math.log10(freq / 20) / Math.log10(20000 / 20)) * W;
      const y = H / 2 - (gains[i] / 12) * (H / 2 - 8);
      return [x, y];
    });

    // Draw grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach(frac => {
      ctx.beginPath(); ctx.moveTo(0, H * frac); ctx.lineTo(W, H * frac); ctx.stroke();
    });

    // Draw curve
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#1DB954');
    grad.addColorStop(1, '#1ed760');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    points.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(W, H / 2);
    ctx.stroke();

    // Fill under curve
    const fillGrad = ctx.createLinearGradient(0, 0, 0, H);
    fillGrad.addColorStop(0, 'rgba(29,185,84,0.3)');
    fillGrad.addColorStop(1, 'rgba(29,185,84,0)');
    ctx.fillStyle = fillGrad;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    points.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(W, H / 2);
    ctx.closePath();
    ctx.fill();

    // 0dB line
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke();
    ctx.setLineDash([]);
  }

  function startVisualizer() {
    // Mini spectrum visualizer in canvas
    function draw() {
      animFrameId = requestAnimationFrame(draw);
      // (Reuses the EQ canvas if panel is open)
    }
  }

  return {
    init, resume, setBand, getBand, getAllBands, applyPreset, setEnabled,
    getFrequencyData, BANDS, BAND_LABELS, PRESETS, showPanel,
  };
})();
