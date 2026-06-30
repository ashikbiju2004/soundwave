/**
 * SoundWave — Audio Visualizer (Web Audio API)
 * Modes: bars, waveform, circle, particles
 */
const Visualizer = (() => {
  let canvas, ctx, animId, mode = 'bars';
  let particles = [];
  const ACCENT = '#1DB954';

  function init() {
    canvas = document.getElementById('vizCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    window.addEventListener('resize', resize);
    resize();
    document.getElementById('vizMode').addEventListener('change', e => { mode = e.target.value; particles = []; });
    document.getElementById('closeViz').addEventListener('click', hide);
  }

  function resize() {
    if (!canvas) return;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function show(song) {
    const overlay = document.getElementById('visualizerOverlay');
    overlay.classList.remove('hidden');
    document.getElementById('vizTitle').textContent  = song?.title  || '';
    document.getElementById('vizArtist').textContent = song?.artist || '';
    Equalizer.resume();
    start();
  }

  function hide() {
    document.getElementById('visualizerOverlay').classList.add('hidden');
    stop();
  }

  function start() {
    stop();
    function frame() {
      animId = requestAnimationFrame(frame);
      const data = Equalizer.getFrequencyData();
      if (!data.length) { drawIdle(); return; }
      switch (mode) {
        case 'bars':      drawBars(data);      break;
        case 'wave':      drawWave(data);      break;
        case 'circle':    drawCircle(data);    break;
        case 'particles': drawParticles(data); break;
        default:          drawBars(data);
      }
    }
    frame();
  }

  function stop() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
  }

  function drawIdle() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  /* ── Bars ─────────────────────────────────────────────────── */
  function drawBars(data) {
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, W, H);

    const count = Math.min(data.length, 128);
    const barW   = W / count - 1;

    for (let i = 0; i < count; i++) {
      const v   = data[i] / 255;
      const bh  = v * H * 0.85;
      const x   = i * (barW + 1);
      const hue = 140 + v * 60;
      const grad = ctx.createLinearGradient(0, H - bh, 0, H);
      grad.addColorStop(0, `hsl(${hue},80%,55%)`);
      grad.addColorStop(1, ACCENT);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, H - bh, barW, bh, [3, 3, 0, 0]);
      ctx.fill();
    }
  }

  /* ── Waveform ─────────────────────────────────────────────── */
  function drawWave(data) {
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, 0, W, H);

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = ACCENT;
    ctx.shadowBlur = 12;
    ctx.shadowColor = ACCENT;
    ctx.beginPath();

    const slice = W / data.length;
    data.forEach((v, i) => {
      const x = i * slice;
      const y = H / 2 + ((v - 128) / 128) * (H * 0.4);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  /* ── Circle ───────────────────────────────────────────────── */
  function drawCircle(data) {
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2;
    const baseR = Math.min(W, H) * 0.2;
    const count = Math.min(data.length, 128);

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const v     = data[i] / 255;
      const r1    = baseR;
      const r2    = baseR + v * baseR * 1.4;
      const hue   = (i / count) * 120 + 120;

      ctx.strokeStyle = `hsl(${hue},75%,55%)`;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
      ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
      ctx.stroke();
    }
    // Inner glow circle
    const avg = data.slice(0, 8).reduce((a, b) => a + b, 0) / 8 / 255;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR);
    glow.addColorStop(0,   `rgba(29,185,84,${avg * 0.4})`);
    glow.addColorStop(1,   'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ── Particles ────────────────────────────────────────────── */
  function drawParticles(data) {
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, W, H);

    const avg = data.slice(0, 16).reduce((a, b) => a + b, 0) / 16 / 255;
    const bass = data[2] / 255;

    // Spawn new particles on beat
    if (bass > 0.6 && particles.length < 300) {
      for (let i = 0; i < Math.floor(bass * 8); i++) {
        particles.push({
          x: W / 2 + (Math.random() - 0.5) * 100,
          y: H / 2 + (Math.random() - 0.5) * 100,
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 0.5) * 6 - 2,
          life: 1, size: 2 + Math.random() * 4,
          hue: 120 + Math.random() * 60,
        });
      }
    }

    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.05;
      p.life -= 0.015;
      ctx.globalAlpha = p.life;
      ctx.fillStyle = `hsl(${p.hue},80%,60%)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Central pulse ring
    const ringR = 60 + avg * 120;
    ctx.strokeStyle = `rgba(29,185,84,${avg * 0.8})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, ringR, 0, Math.PI * 2);
    ctx.stroke();
  }

  return { init, show, hide, start, stop };
})();
