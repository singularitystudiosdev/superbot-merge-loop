// superbot merge hero — one rAF clock drives every phase:
//   pop-in (white) -> bg to black -> orbit -> acceleration + motion blur
//   -> collapse -> implode (flash, shockwave, ascii sparkle burst) -> reveal.
// Zero dependencies; the mascot is the benchmarks page's mascot.js, verbatim.

import { ICONS } from './icons.js';
import { Mascot } from './mascot.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';

// ---- phase timeline (ms from start) ----
const POP_START = 250;
const POP_STAGGER = 135;
const T_DARK = 1350;       // background begins fading white -> black
const T_ORBIT = 1750;      // ring starts turning
const W0 = 0.55;           // base angular velocity, rad/s
const T_RAMP = 4600;       // acceleration begins
const T_COLLAPSE = 6300;   // radius starts shrinking
const T_IMPLODE = 7150;    // flash + shockwave + sparkle burst
const T_REVEAL = 7350;     // mascot + wordmark
const W_MAX = 8.6;         // rad/s at the moment of impact

const TILT = 0.42;         // ring-plane tilt: front of the ring sits lower

const stage = document.getElementById('stage');
const ring = document.getElementById('ring');
const fx = document.getElementById('fx');
const flashEl = document.getElementById('flash');
const shockEl = document.getElementById('shockwave');
const reveal = document.getElementById('reveal');
const botEl = document.getElementById('hero-bot');

// ---- build the eight ide tiles ----
const icons = ICONS.map((b, i) => {
  const el = document.createElement('div');
  el.className = 'icon';
  el.innerHTML =
    `<div class="tile" style="--tile-bg:${b.bg};--tile-fg:${b.fg}">` +
    `<svg viewBox="0 0 24 24" role="img" aria-label="${b.label}"><path d="${b.d}"/></svg></div>` +
    `<span class="streak"></span>`;
  ring.appendChild(el);
  return { el, tile: el.firstElementChild, streak: el.lastElementChild, i };
});

// ---- sparkle canvas ----
const ctx = fx.getContext('2d');
let dpr = 1;
function sizeFx() {
  dpr = Math.min(2, devicePixelRatio || 1);
  fx.width = innerWidth * dpr;
  fx.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
sizeFx();

const GLYPHS = ['*', '+', '·', '✦', '/', '\\'];
const particles = [];

function burst(cx, cy) {
  const n = REDUCED ? 0 : 118;
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2;
    const v = 1.2 + Math.random() * Math.random() * 9.5;
    // one in seven is a "light black" sparkle: a dark glyph that only reads
    // against the flash and its afterglow
    const dark = Math.random() < 0.14;
    const tinted = !dark && Math.random() < 0.18;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.4,
      life: 0, ttl: 650 + Math.random() * 1300,
      glyph: GLYPHS[(Math.random() * GLYPHS.length) | 0],
      size: 8 + Math.random() * 15,
      color: dark ? '#3c3c3c' : tinted ? '#a9d4b4' : '#e9e9e9',
      phase: Math.random() * Math.PI * 2,
      maxA: dark ? 0.8 : 0.95,
    });
  }
}

function ambient(cx, cy) {
  particles.push({
    x: cx + (Math.random() - 0.5) * 340, y: cy + (Math.random() - 0.5) * 200,
    vx: (Math.random() - 0.5) * 0.25, vy: -0.15 - Math.random() * 0.4,
    life: 0, ttl: 2200 + Math.random() * 1400,
    glyph: GLYPHS[(Math.random() * GLYPHS.length) | 0],
    size: 7 + Math.random() * 9,
    color: Math.random() < 0.2 ? '#3c3c3c' : '#bdbdbd',
    phase: Math.random() * Math.PI * 2,
    maxA: 0.4,
  });
}

function drawParticles(dt, now) {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (let k = particles.length - 1; k >= 0; k--) {
    const p = particles[k];
    p.life += dt;
    if (p.life >= p.ttl) { particles.splice(k, 1); continue; }
    p.x += p.vx * dt / 16;
    p.y += p.vy * dt / 16;
    p.vx *= 0.968; p.vy *= 0.968;
    const fade = 1 - p.life / p.ttl;
    const tw = 0.55 + 0.45 * Math.sin(p.life * 0.02 + p.phase);
    ctx.globalAlpha = Math.max(0, fade * tw * p.maxA);
    ctx.fillStyle = p.color;
    ctx.font = `${p.size}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.glyph, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

// ---- geometry ----
function ringRadius() {
  return Math.max(130, Math.min(320, Math.min(innerWidth, innerHeight) * 0.30));
}

const cx = () => innerWidth / 2;
const cy = () => innerHeight * 0.46;

// ---- state ----
let t0 = null;
let theta = 0;
let lastT = 0;
let prev = icons.map(() => ({ x: 0, y: 0 }));
let imploded = false;
let revealed = false;
let lastAmbient = 0;

function omegaAt(t) {
  if (t < T_ORBIT) return 0;
  if (t < T_RAMP) return W0;
  if (t < T_IMPLODE) {
    // ease-in acceleration from W0 to W_MAX across ramp + collapse
    const u = (t - T_RAMP) / (T_IMPLODE - T_RAMP);
    return W0 + (W_MAX - W0) * u * u;
  }
  return W_MAX;
}

function radiusAt(t) {
  const R0 = ringRadius();
  if (t < T_COLLAPSE) return R0;
  const u = Math.min(1, (t - T_COLLAPSE) / (T_IMPLODE - T_COLLAPSE));
  return R0 * (1 - u * u * u); // ease-in cubic collapse
}

function place(t, dt) {
  const R0 = ringRadius();
  const R = radiusAt(t);
  const w = omegaAt(t);
  theta += w * dt / 1000;

  for (const ic of icons) {
    const a = theta + (ic.i / icons.length) * Math.PI * 2;
    const depth = R0 ? Math.max(-1, Math.min(1, (R * Math.cos(a)) / R0)) : 0;
    const x = cx() + R * Math.sin(a);
    const y = cy() + R * Math.cos(a) * TILT;

    // pop-in: back-out overshoot, staggered around the ring
    const born = POP_START + ic.i * POP_STAGGER;
    let pop = 0;
    if (t >= born) {
      pop = backOut(Math.min(1, (t - born) / 520));
    }

    // implode: the whole tile snaps to nothing
    let die = 1;
    if (imploded) die = Math.max(0, 1 - (t - T_IMPLODE) / 160);

    // slow-phase float, damped as the ring speeds up
    const calm = Math.max(0, 1 - w / 2.2);
    const fy = Math.sin(t / 640 + ic.i * 1.7) * 2.4 * calm;

    const s = (0.70 + 0.40 * (depth + 1) / 2) * pop * die;
    const op = (0.55 + 0.45 * (depth + 1) / 2) * (t >= born ? 1 : 0) * die;

    ic.el.style.transform = `translate3d(${x}px, ${y + fy}px, 0) scale(${s.toFixed(4)}) rotateY(${(a * 180 / Math.PI).toFixed(1)}deg)`;
    ic.el.style.opacity = op.toFixed(3);
    ic.el.style.zIndex = String(100 + Math.round(depth * 50));

    // motion blur: screen-space speed -> gaussian blur + a velocity-aligned streak
    const vx = x - prev[ic.i].x, vy = y - prev[ic.i].y;
    const v = dt > 0 ? Math.hypot(vx, vy) / (dt / 1000) : 0;
    prev[ic.i].x = x; prev[ic.i].y = y;
    const blur = Math.max(0, Math.min(5.5, (v - 480) / 620));
    ic.tile.style.filter = blur > 0.15 ? `blur(${blur.toFixed(2)}px)` : 'none';

    // the streak trails behind: bright at the tile, fading backwards
    const len = Math.max(0, Math.min(170, (v - 480) / 46));
    if (len > 6 && die === 1 && v > 0) {
      const dirDeg = Math.atan2(vy, vx) * 180 / Math.PI + 180;
      ic.streak.style.opacity = Math.min(0.55, (v - 480) / 2600).toFixed(3);
      ic.streak.style.width = `${len.toFixed(0)}px`;
      ic.streak.style.transform = `translate(0, -50%) rotate(${dirDeg.toFixed(1)}deg)`;
    } else {
      ic.streak.style.opacity = '0';
    }
  }
}

// back-out overshoot (the app-launch spring)
function backOut(u) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
}

// ---- main clock ----
function frame(now) {
  if (t0 === null) { t0 = now; lastT = now; }
  const t = now - t0;
  const dt = Math.min(64, t - lastT);
  lastT = t;

  if (t >= T_DARK) document.body.classList.add('dark');
  place(t, dt);

  if (!imploded && t >= T_IMPLODE) {
    imploded = true;
    stage.classList.add('shake');
    shockEl.classList.add('go');
    burst(cx(), cy());
    if (navigator.vibrate) navigator.vibrate(12);
  }
  if (imploded) {
    const f = Math.max(0, 1 - (t - T_IMPLODE) / 520);
    flashEl.style.opacity = Math.pow(f, 1.6).toFixed(3);
  }

  if (!revealed && t >= T_REVEAL) {
    revealed = true;
    reveal.classList.add('on');
    new Mascot(botEl, { cols: 30, rows: 15, anim: REDUCED ? 'statue' : 'perky', autoMorph: false });
    setTimeout(() => { document.getElementById('replay').hidden = false; }, 1500);
  }
  if (revealed && t - lastAmbient > 640 && particles.length < 46) {
    lastAmbient = t;
    ambient(cx(), cy());
  }

  drawParticles(dt, t);
  requestAnimationFrame(frame);
}

// ---- start ----
if (REDUCED) {
  // skip straight to the finished frame: black stage, mascot, no motion
  document.body.classList.add('dark');
  icons.forEach(ic => { ic.el.style.display = 'none'; });
  reveal.classList.add('on');
  new Mascot(botEl, { cols: 30, rows: 15, anim: 'statue', autoMorph: false });
  document.getElementById('replay').hidden = false;
  requestAnimationFrame(frame);
} else {
  requestAnimationFrame(frame);
}

document.getElementById('replay').addEventListener('click', () => location.reload());
addEventListener('resize', sizeFx);
