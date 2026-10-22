/* TT Badminton: the game's own sounds, synthesised through Kit.sound (so the one mute switch covers them).
   Each is silent until Kit.sound.init() has run from a tap or key, and while muted. */
(function () {
  'use strict';
  const S = () => window.Kit.sound;

  // the racket meeting the shuttle: a crisp "tock" (a smash cracks, a drop just kisses it)
  function hit(shot) {
    const s = S();
    if (shot === 'smash') {
      s.hiss({ f: 5200, to: 900, filter: 'bandpass', q: 1.2, dur: 0.12, vol: 0.5 });
      s.tone({ type: 'square', f: 420, to: 140, dur: 0.1, vol: 0.18, lp: 1800 });
      s.hiss({ f: 1800, to: 400, filter: 'lowpass', dur: 0.35, vol: 0.2, at: 0.02 });
    } else if (shot === 'drop' || shot === 'net') {
      s.hiss({ f: 3400, to: 2200, filter: 'bandpass', q: 3, dur: 0.05, vol: 0.22 });
      s.tone({ type: 'triangle', f: 1100, to: 700, dur: 0.07, vol: 0.1 });
    } else {
      s.hiss({ f: 4200, to: 1600, filter: 'bandpass', q: 2, dur: 0.07, vol: 0.38 });
      s.tone({ type: 'triangle', f: 900, to: 380, dur: 0.08, vol: 0.14 });
    }
  }

  function swish() {
    S().hiss({ f: 900, to: 2600, filter: 'bandpass', q: 1.5, dur: 0.16, vol: 0.12 });
  }

  function net() {
    const s = S();
    s.hiss({ f: 600, to: 200, filter: 'lowpass', dur: 0.2, vol: 0.3 });
    s.tone({ type: 'sine', f: 160, to: 90, dur: 0.18, vol: 0.2 });
  }

  function land() {
    S().tone({ type: 'sine', f: 260, to: 120, dur: 0.08, vol: 0.16 });
    S().hiss({ f: 1200, to: 300, filter: 'lowpass', dur: 0.08, vol: 0.12 });
  }

  // a point to you (bright, rising) or to them (two notes down)
  function win() {
    const s = S();
    [659, 784, 1047].forEach((f, i) => s.tone({ type: 'triangle', f, at: i * 0.08, dur: 0.16, vol: 0.16 }));
  }

  function lose() {
    const s = S();
    s.tone({ type: 'triangle', f: 440, at: 0, dur: 0.16, vol: 0.13 });
    s.tone({ type: 'triangle', f: 330, at: 0.14, dur: 0.24, vol: 0.13 });
  }

  // the crowd: a swell of noise
  function cheer(big) {
    const s = S();
    s.hiss({ f: 1400, to: 2200, filter: 'bandpass', q: 0.6, dur: big ? 1.6 : 0.9, vol: big ? 0.22 : 0.12, attack: 0.15 });
    s.hiss({ f: 700, to: 900, filter: 'bandpass', q: 0.8, dur: big ? 1.4 : 0.8, vol: big ? 0.16 : 0.09, at: 0.05 });
  }

  function whistle() {
    const s = S();
    s.tone({ type: 'sine', f: 2900, to: 2800, dur: 0.12, vol: 0.12 });
    s.tone({ type: 'sine', f: 2900, to: 2750, at: 0.17, dur: 0.3, vol: 0.12 });
  }

  // two hands slapping
  function clap() {
    const s = S();
    s.hiss({ f: 2600, to: 900, filter: 'bandpass', q: 1, dur: 0.09, vol: 0.45 });
    s.tone({ type: 'triangle', f: 1568, at: 0.06, dur: 0.18, vol: 0.12 });
    s.tone({ type: 'triangle', f: 2093, at: 0.12, dur: 0.22, vol: 0.12 });
  }

  function pop() {
    S().tone({ type: 'sine', f: 520, to: 1300, dur: 0.12, vol: 0.18 });
  }

  window.BTSfx = { hit, swish, net, land, win, lose, cheer, whistle, clap, pop };
})();
