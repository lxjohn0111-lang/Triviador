// Fully synthesized audio (no asset downloads): UI/game sound effects + a soft generative score.
let ctx = null, master = null, sfxGain = null, musicGain = null, musicTimer = null;
const state = { sfx: true, music: true, muted: false, started: false };
const ensure = () => {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  ctx = new AC(); master = ctx.createGain(); master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.connect(master);
  sfxGain = ctx.createGain(); sfxGain.gain.value = 0.55; sfxGain.connect(comp);
  musicGain = ctx.createGain(); musicGain.gain.value = 0.0; musicGain.connect(comp);
  apply();
  return ctx;
};
const apply = () => {
  if (!ctx) return;
  master.gain.setTargetAtTime(state.muted ? 0 : 1, ctx.currentTime, 0.03);
  musicGain.gain.setTargetAtTime(state.music ? 0.16 : 0, ctx.currentTime, 0.4);
};
function tone({ f = 440, f2 = null, t = 0, d = 0.15, type = 'sine', v = 0.5, a = 0.005, out = null }) {
  const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + t;
  o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(g); g.connect(out || sfxGain); o.start(t0); o.stop(t0 + d + 0.05);
}
function noise({ t = 0, d = 0.2, v = 0.3, fq = 1200, q = 0.8, f2 = null }) {
  const n = Math.floor(ctx.sampleRate * d), buf = ctx.createBuffer(1, n, ctx.sampleRate), ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(), t0 = ctx.currentTime + t;
  s.buffer = buf; fl.type = 'bandpass'; fl.frequency.setValueAtTime(fq, t0); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + d); fl.Q.value = q; g.gain.value = v;
  s.connect(fl); fl.connect(g); g.connect(sfxGain); s.start(t0);
}
const N = (semi) => 261.63 * Math.pow(2, semi / 12);
const SFX = {
  click: () => tone({ f: 720, f2: 520, d: 0.06, type: 'triangle', v: 0.25 }),
  hover: () => tone({ f: 900, d: 0.03, type: 'sine', v: 0.08 }),
  select: () => { tone({ f: N(7), d: 0.09, type: 'triangle', v: 0.3 }); tone({ f: N(12), t: 0.06, d: 0.12, type: 'triangle', v: 0.3 }); },
  open: () => { noise({ d: 0.18, v: 0.18, fq: 500, f2: 2600 }); tone({ f: N(0), f2: N(7), d: 0.16, type: 'sine', v: 0.15 }); },
  correct: () => [0, 4, 7, 12].forEach((s, i) => tone({ f: N(s + 12), t: i * 0.07, d: 0.22, type: 'triangle', v: 0.32 })),
  wrong: () => { tone({ f: 220, f2: 140, d: 0.3, type: 'sawtooth', v: 0.22 }); tone({ f: 233, f2: 150, t: 0.02, d: 0.3, type: 'square', v: 0.08 }); },
  tick: () => tone({ f: 1100, d: 0.035, type: 'square', v: 0.07 }),
  urgent: () => tone({ f: 1500, d: 0.06, type: 'square', v: 0.12 }),
  claim: () => { noise({ d: 0.12, v: 0.25, fq: 300, q: 0.5 }); tone({ f: N(-5), d: 0.2, type: 'triangle', v: 0.35 }); tone({ f: N(7), t: 0.08, d: 0.25, type: 'triangle', v: 0.28 }); },
  attack: () => { noise({ d: 0.35, v: 0.3, fq: 2500, f2: 300, q: 1.2 }); tone({ f: 180, f2: 70, t: 0.05, d: 0.35, type: 'sawtooth', v: 0.25 }); },
  crumble: () => { noise({ d: 0.6, v: 0.4, fq: 180, q: 0.4 }); tone({ f: 90, f2: 40, d: 0.5, type: 'sine', v: 0.5 }); },
  horn: () => { [0, 0.22].forEach((t) => { tone({ f: N(-12), t, d: 0.5, type: 'sawtooth', v: 0.16 }); tone({ f: N(-5), t, d: 0.5, type: 'sawtooth', v: 0.12 }); }); },
  shield: () => { tone({ f: 1400, f2: 900, d: 0.25, type: 'triangle', v: 0.25 }); noise({ d: 0.1, v: 0.2, fq: 4000, q: 2 }); },
  coin: () => { tone({ f: 1320, d: 0.07, type: 'square', v: 0.14 }); tone({ f: 1760, t: 0.06, d: 0.18, type: 'square', v: 0.14 }); },
  victory: () => [[0, 0], [4, 0.14], [7, 0.28], [12, 0.42], [7, 0.62], [12, 0.76], [16, 0.92]].forEach(([s, t]) => { tone({ f: N(s), t, d: 0.4, type: 'triangle', v: 0.34 }); tone({ f: N(s - 12), t, d: 0.4, type: 'sawtooth', v: 0.1 }); }),
  defeat: () => [[7, 0], [3, 0.25], [0, 0.5], [-5, 0.8]].forEach(([s, t]) => tone({ f: N(s - 12), t, d: 0.55, type: 'triangle', v: 0.3 })),
  levelup: () => [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone({ f: N(s), t: i * 0.06, d: 0.3, type: 'triangle', v: 0.28 })),
  pop: () => tone({ f: 500, f2: 1100, d: 0.08, type: 'sine', v: 0.25 }),
};
// --- generative music: slow pad chords + sparse plucks in a pentatonic-ish mode ---
const CHORDS = [[-12, 0, 7, 16], [-15, 0, 4, 12], [-19, -7, 5, 12], [-17, -5, 7, 14]];
let bar = 0;
function scheduleBar() {
  if (!ctx || !state.music || state.muted || ctx.state !== 'running') return;
  const ch = CHORDS[bar % CHORDS.length], len = 3.6; bar++;
  ch.forEach((s, i) => { tone({ f: N(s), d: len, type: i ? 'sine' : 'triangle', v: 0.16, a: 1.0, out: musicGain }); });
  const scale = [0, 2, 4, 7, 9, 12, 14, 16];
  for (let i = 0; i < 6; i++) { if (Math.random() < 0.55) tone({ f: N(scale[Math.floor(Math.random() * scale.length)] + 12), t: i * (len / 6) + Math.random() * 0.05, d: 0.9, type: 'triangle', v: 0.1, a: 0.01, out: musicGain }); }
}
export const audio = {
  unlock() {
    const c = ensure(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    if (!state.started) { state.started = true; scheduleBar(); musicTimer = setInterval(scheduleBar, 3600); }
  },
  play(name) { if (!state.sfx || state.muted) return; const c = ensure(); if (!c || c.state !== 'running') return; try { SFX[name] && SFX[name](); } catch (e) { /* ignore */ } },
  set(opts) { Object.assign(state, opts); apply(); },
  get state() { return state; },
  stopMusicTimer() { clearInterval(musicTimer); },
};
