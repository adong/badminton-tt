/* TT Badminton: the rules engine. No Three.js and no DOM in here: a match is plain state stepped at a fixed 60 frames
   a second, so the same code runs the page and the headless check (node tools/check.js, or game.check() in the console).

   The court seen from the side: the net is at x = 0. Side 0 plays on the left (x < 0) and faces +x, side 1 on the right
   faces -x. y is up, in metres. Everything happens in the x-y plane; z is only for looks (doubles partners stand apart).

   The shuttle has real drag: a = g + (-g / VT²) |v| v, so it shoots off the racket and then slows right down and drops
   almost straight. The drag is applied implicitly (v /= 1 + k|v|dt), which can only ever slow it, so it is stable at
   any speed or time step. EASY runs the shuttle's clock slower (the same flight, just slower to watch).

   Hitting: press swing and the racket is live for a few frames. Where the shuttle is when you meet it picks the shot:
   up high in a jump is a SMASH, up high on the ground a CLEAR (high and deep), chest high a DRIVE, low a LIFT. Run at
   the net while you swing for a soft DROP (high) or NET shot (low). The solver then aims it into the other court.

   Scoring: rally scoring, first to 11, win by 2, and 15 always wins. The rally's winner serves next. A point ends when
   the shuttle lands: in the other court (point to the hitter), out past the back line or into the net / short on your
   own side (point to the other side).

   The companion (singles only): calling the other brother adds one return. He pops in, does his signature move, tosses
   a treat, and then returns the next shuttle that comes to your side, whoever is near it. Keep calling, he keeps going. */
(function (root) {
  'use strict';
  const DT = 1 / 60, SUB = 4;
  const K = {
    HALF: 6.1, // net to back line
    WALL: 7.2, // how far back the players can run
    NET_H: 1.55,
    NET_GAP: 0.45, // closest a player's feet get to the net
    LINE: 0.15, // a landing this far past the back line still counts (kid rules)
    SHORT: 1.98, // the short service line
    G: 11,
    VT: 7.2, // the shuttle's terminal speed: the drag constant is G / VT²
    RUN: 5.4, ACCEL: 42, JUMP_V: 5.8, PG: 17,
    // swing frames: the racket is live from SW_A0 to SW_A1 (SW_A1_EASY on EASY), the swing is over at SW_LEN
    SW_A0: 3, SW_A1: 14, SW_A1_EASY: 19, SW_LEN: 24,
    // the reach box, in front of you / behind you / above your feet
    FRONT: 1.45, BACK: 0.85, LOW: 0.05, HIGH: 2.95,
    FRONT_EASY: 2.0, BACK_EASY: 1.25, HIGH_EASY: 3.35,
    TO_WIN: 11, BY: 2, CAP: 15,
    POINT_LEN: 1.9, OVER_LEN: 2.6, AUTO_SERVE: 6, // seconds
    // the companion's visit, in seconds
    BUD_HELLO: 1.1, BUD_TREAT: 1.7, BUD_BYE: 0.9, BUD_RUN: 11,
  };
  // How each shot flies: landing distance past the net [min, max], the launch angles to try (degrees, in order),
  // and how far over the net tape it has to pass (metres). A smash has a fixed speed and the solver picks the angle.
  const SHOTS = {
    clear: { d: [4.5, 5.6], ang: [40, 45, 35, 50, 30, 56, 62], clear: 0.7 },
    lift: { d: [4.3, 5.5], ang: [50, 55, 45, 60, 40, 66, 72], clear: 0.8 },
    drive: { d: [3.4, 5.2], ang: [4, 8, 0, 12, -4, 16, 22, 30], clear: 0.1 },
    drop: { d: [0.9, 2.0], ang: [-8, 2, 12, 22, 32, 42], clear: 0.06 },
    net: { d: [0.45, 1.35], ang: [40, 50, 30, 60, 20, 68], clear: 0.04 },
    smash: { d: [2.4, 4.9], speed: 27, clear: 0.05 },
    serveHigh: { d: [4.6, 5.5], ang: [50, 56, 44, 62, 68], clear: 1.0 },
    serveShort: { d: [2.1, 2.8], ang: [28, 36, 20, 44, 52], clear: 0.08 },
    save: { d: [4.4, 5.4], ang: [48, 54, 42, 60, 66, 72], clear: 1.0 },
    pop: { d: [0.3, 1.6], ang: [72, 76, 80, 83, 86, 88], clear: 0.02 },
  };
  // The computer friends. speed: running speed; react: seconds before it moves; err: chance a shot goes in the net or
  // out, growing by errUp a hit once the rally is longer than errAt; smash / drop: how often it tries them; aim: 'you'
  // hits it back near the other player (friendly), 'away' places it where they aren't; whiff: frames of timing noise.
  const LEVELS = {
    froggy: { leave: 0.6, speed: 3.9, react: 0.34, err: 0.1, errUp: 0.012, errAt: 6, smash: 0.06, drop: 0.12, aim: 'you', whiff: 3, short: 0.1, serve: [1.1, 1.8] },
    foxy: { leave: 0.95, speed: 4.7, react: 0.2, err: 0.06, errUp: 0.008, errAt: 8, smash: 0.5, drop: 0.32, aim: 'away', whiff: 2, short: 0.35, serve: [0.8, 1.4] },
    pal: { leave: 0.9, speed: 4.8, react: 0.2, err: 0.05, errUp: 0.006, errAt: 9, smash: 0.4, drop: 0.2, aim: 'away', whiff: 2, short: 0.2, serve: [0.8, 1.3] },
    // a stand-in for a kid at the keys, for the headless check: slow to react, sloppy timing, random shots
    kid: { leave: 0.5, speed: 4.2, react: 0.36, err: 0.1, errUp: 0.01, errAt: 4, smash: 0.3, drop: 0.25, aim: 'random', whiff: 5, short: 0.3, serve: [0.6, 2.5] },
    // never swings: proves the rally check can fail
    lazy: { leave: 0, speed: 0, react: 99, err: 0, errUp: 0, errAt: 0, smash: 0, drop: 0, aim: 'you', whiff: 0, short: 0, serve: [0.5, 1] },
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sideOf = (x) => (x < 0 ? 0 : 1);
  const RAD = Math.PI / 180;
  let SAB = ''; // sabotage for the check's own test: 'drag' | 'score' | 'lazy'

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const blankInput = () => ({ left: false, right: false, jump: false, swing: false, call: false, shot: '', aim: null, err: '' });

  // ---------------------------------------------------------------- shuttle physics (pure, shared with the solver and the CPU)

  const KD = () => K.G / (K.VT * K.VT);

  // One substep of flight. Returns 1 if it went into the net, 2 if it crossed over, 4 if it landed.
  function fly(s, dt) {
    if (s.landed) return 0;
    const px = s.x, py = s.y;
    s.vy -= K.G * dt;
    const v = Math.hypot(s.vx, s.vy);
    const d = SAB === 'drag' ? 1 / Math.max(0.2, 1 - KD() * v * dt * 0.5) : 1 / (1 + KD() * v * dt);
    s.vx *= d;
    s.vy *= d;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    let ev = 0;
    if (!s.netted && (px < 0) !== (s.x < 0)) {
      const k = px / (px - s.x);
      const yc = py + (s.y - py) * k;
      if (yc < K.NET_H) {
        // into the net: it drops down on the side it came from
        s.netted = true;
        s.x = px < 0 ? -0.06 : 0.06;
        s.vx = -s.vx * 0.08;
        s.vy = Math.min(s.vy, 0) * 0.2;
        ev |= 1;
      } else {
        s.netY = yc;
        ev |= 2;
      }
    }
    if (s.netted && Math.abs(s.x) < 0.06) s.x = s.x < 0 ? -0.06 : 0.06;
    if (s.y <= 0) {
      s.y = 0;
      s.landed = true;
      s.vx = s.vy = 0;
      ev |= 4;
    }
    return ev;
  }

  // Fly a copy to the floor. Returns { x, t, netted, netY } (t in shuttle seconds).
  function landing(x, y, vx, vy, maxT = 8) {
    const s = { x, y, vx, vy, landed: false, netted: false, netY: null };
    const dt = DT / SUB;
    let t = 0;
    while (!s.landed && t < maxT) {
      fly(s, dt);
      t += dt;
    }
    return { x: s.x, t, netted: s.netted, netY: s.netY };
  }

  // Aim a shot: from (x, y), facing f, land d metres past the net, passing `clear` over the tape. Returns { vx, vy } or null.
  function solve(x, y, f, type, d) {
    const sp = SHOTS[type];
    const past = (r) => (r.netted ? -9 : r.x * f); // landing distance past the net (negative: our own side)
    const ok = (r) => !r.netted && r.netY !== null && r.netY >= K.NET_H + sp.clear && Math.abs(past(r) - d) < 0.25;
    if (sp.speed) {
      // a smash: fixed speed, find the angle (steeper lands shorter)
      let lo = -78, hi = 12, r = null;
      for (let i = 0; i < 26; i++) {
        const a = (lo + hi) / 2;
        r = landing(x, y, f * sp.speed * Math.cos(a * RAD), sp.speed * Math.sin(a * RAD));
        if (past(r) < d) lo = a; else hi = a;
      }
      const a = (lo + hi) / 2;
      r = landing(x, y, f * sp.speed * Math.cos(a * RAD), sp.speed * Math.sin(a * RAD));
      return ok(r) ? { vx: f * sp.speed * Math.cos(a * RAD), vy: sp.speed * Math.sin(a * RAD) } : null;
    }
    for (const deg of sp.ang) {
      const c = Math.cos(deg * RAD), sn = Math.sin(deg * RAD);
      let lo = 0.5, hi = 70;
      for (let i = 0; i < 24; i++) {
        const v = (lo + hi) / 2;
        if (past(landing(x, y, f * v * c, v * sn)) < d) lo = v; else hi = v;
      }
      const v = (lo + hi) / 2;
      if (ok(landing(x, y, f * v * c, v * sn))) return { vx: f * v * c, vy: v * sn };
    }
    return null;
  }

  // ---------------------------------------------------------------- a match

  // o: { mode: 'singles' | 'doubles', level: 'easy' | 'normal', ids: [[...side 0], [...side 1]], ctrl: same shape,
  //      'human' or a LEVELS key; seed; server }
  function create(o = {}) {
    const doubles = o.mode === 'doubles';
    const M = {
      mode: doubles ? 'doubles' : 'singles', level: o.level || 'easy', ts: o.level === 'normal' ? 1 : 0.75,
      rand: rng(o.seed || 1 + Math.floor(Math.random() * 1e9)), frame: 0, t: 0,
      p: [], team: [[], []], phase: 'serve', phaseT: 0, score: [0, 0], server: o.server || 0, serveSlot: [0, 0],
      sh: null, rally: 0, hitNo: 0, events: [], winner: -1, assign: [-1, -1], assignFor: [-1, -1],
      stats: { hits: [0, 0], smashes: [0, 0], best: 0, points: 0, budReturns: [0, 0] },
      bud: [newBud(0), newBud(1)],
    };
    const ids = o.ids || (doubles ? [['teddy', 'tommy'], ['foxy', 'froggy']] : [['teddy'], ['froggy']]);
    const ctrl = o.ctrl || (doubles ? [['human', 'pal'], ['foxy', 'froggy']] : [['human'], ['froggy']]);
    for (let side = 0; side < 2; side++) {
      const n = doubles ? 2 : 1;
      for (let slot = 0; slot < n; slot++) {
        const f = side === 0 ? 1 : -1;
        const p = {
          i: M.p.length, side, slot, f, id: ids[side][slot], ctrl: ctrl[side][slot],
          x: -f * 3, y: 0, vx: 0, vy: 0, air: false, sw: -1, swKind: 'side', swShot: '', hitT: 9, last: blankInput(),
          brain: null, idle: 0, happy: 0, sad: 0,
        };
        if (p.ctrl !== 'human') p.brain = brain(SAB === 'lazy' ? 'lazy' : p.ctrl);
        M.p.push(p);
        M.team[side].push(p.i);
      }
    }
    newServe(M, M.server);
    for (const p of M.p) p.x = homeX(M, p);
    return M;
  }

  function newBud(side) {
    return { side, on: false, t: 0, phase: '', returns: 0, x: 0, y: 0, vx: 0, sw: -1, hitT: 9, treat: false };
  }

  function newShuttle() {
    return { x: 0, y: 1, vx: 0, vy: 0, landed: false, netted: false, netY: null, last: -1, lastP: -1, shot: '', held: -1, pred: null };
  }

  // Where a player stands to start a point. Singles: a little in front of the middle. Doubles: one up, one back.
  function homeX(M, p) {
    const sgn = p.side === 0 ? -1 : 1;
    if (M.mode === 'singles') return sgn * (p.side === M.server ? 2.5 : 2.9);
    const serving = p.side === M.server && M.team[p.side][M.serveSlot[p.side]] === p.i;
    if (serving) return sgn * 2.4;
    return sgn * (p.slot === 0 ? 4.4 : 2.0);
  }

  // Where a player waits during a rally when the shuttle is going the other way.
  function baseX(M, p) {
    const sgn = p.side === 0 ? -1 : 1;
    if (M.mode === 'singles') return sgn * 3.0;
    return sgn * (p.slot === 0 ? 4.2 : 1.9);
  }

  function newServe(M, side) {
    M.phase = 'serve';
    M.phaseT = 0;
    M.server = side;
    M.sh = newShuttle();
    M.sh.held = M.team[side][M.serveSlot[side]];
    M.rally = 0;
    M.serveWait = M.rand();
    for (const p of M.p) { p.sw = -1; p.happy = p.sad = 0; }
  }

  const ev = (M, type, o) => M.events.push(Object.assign({ type }, o));

  function serverOf(M) {
    return M.p[M.team[M.server][M.serveSlot[M.server]]];
  }

  // ---------------------------------------------------------------- stepping

  // inputs: array by player index (human input objects); missing entries are blank. Brains fill in the CPUs.
  function step(M, inputs = []) {
    M.events.length = 0;
    M.frame++;
    M.t += DT;
    M.phaseT += DT;
    const inps = M.p.map((p) => (p.brain ? p.brain(M, p.i) : inputs[p.i] || blankInput()));
    // calls: the companion in singles, a high five when both brothers are on court
    M.p.forEach((p, i) => {
      const inp = inps[i];
      if (inp.call && !p.last.call && p.ctrl === 'human' && M.phase !== 'over') callBuddy(M, p.side);
    });
    if (M.phase === 'serve') stepServe(M, inps);
    else if (M.phase === 'rally') stepRally(M, inps);
    else if (M.phase === 'point') {
      movePlayers(M, inps, true);
      if (M.phaseT >= K.POINT_LEN) newServe(M, M.server);
    } else if (M.phase === 'over') movePlayers(M, inps, true);
    stepBuds(M);
    M.p.forEach((p, i) => { p.last = inps[i]; });
    return M.events;
  }

  function stepServe(M, inps) {
    const sv = serverOf(M), s = M.sh;
    // everyone walks back to their spot
    for (const p of M.p) walkTo(p, homeX(M, p), K.RUN * 0.8);
    for (const p of M.p) stepBody(M, p, blankInput());
    s.x = sv.x + sv.f * 0.42;
    s.y = 1.0;
    const inp = inps[sv.i];
    const ready = M.phaseT > 0.55;
    const human = sv.ctrl === 'human';
    const go = ready && ((inp.swing && !sv.last.swing) || (human && M.phaseT > K.AUTO_SERVE));
    if (go) {
      const toward = sv.f > 0 ? inp.right : inp.left;
      const type = inp.shot || (toward ? 'serveShort' : 'serveHigh');
      startSwing(M, sv, 'under');
      hit(M, sv, type, inp.aim, inp.err);
      M.phase = 'rally';
      M.phaseT = 0;
      ev(M, 'serve', { side: sv.side, p: sv.i, shot: type });
    }
  }

  function stepRally(M, inps) {
    const s = M.sh;
    movePlayers(M, inps, false);
    // hits: anyone on the right side whose racket is live and reaches it
    if (!s.landed) {
      for (const p of M.p) {
        if (p.sw < K.SW_A0 || p.sw > swA1(M, p) || p.swHit) continue;
        if (s.last === p.side || sideOf(s.x) !== p.side || s.netted) continue;
        if (!inReach(M, p, s.x, s.y)) continue;
        // what the CPU decided when it pressed swing; a kid's direction counts at the moment of contact
        const inp = Object.assign({}, inps[p.i], { shot: p.swShot, aim: p.swAim, err: p.swErr });
        hit(M, p, chooseShot(M, p, inp), inp.aim, inp.err);
        break;
      }
    }
    // the shuttle flies (on its own clock: slower on EASY)
    const dt = (DT * M.ts) / SUB;
    for (let k = 0; k < SUB && !s.landed; k++) {
      const e = fly(s, dt);
      if (e & 1) ev(M, 'net', { side: s.last });
      if (e & 2) ev(M, 'cross', { side: s.last });
    }
    if (s.landed) landed(M);
  }

  function swA1(M, p) {
    return M.level === 'easy' && p.ctrl === 'human' ? K.SW_A1_EASY : K.SW_A1;
  }

  function inReach(M, p, x, y) {
    const easy = M.level === 'easy' && p.ctrl === 'human';
    const rel = (x - p.x) * p.f, h = y - p.y;
    return rel <= (easy ? K.FRONT_EASY : K.FRONT) && rel >= -(easy ? K.BACK_EASY : K.BACK) && h >= K.LOW && h <= (easy ? K.HIGH_EASY : K.HIGH);
  }

  // The shot a press makes, from where you meet the shuttle and which way you're running.
  function chooseShot(M, p, inp) {
    const y = M.sh.y;
    const want = inp.shot;
    if (want === 'smash' && y > 2.0) return 'smash';
    if (want && want !== 'smash' && SHOTS[want]) return want;
    const toward = p.f > 0 ? inp.right : inp.left;
    if (p.air && p.y > 0.15 && y > 2.05) return 'smash';
    if (toward) return y > 1.45 ? 'drop' : 'net';
    if (y >= 1.85) return 'clear';
    if (y >= 0.95) return 'drive';
    return 'lift';
  }

  // Hit the shuttle: aim it with the solver, or make a mistake (err: 'net' | 'long').
  function hit(M, p, type, aim, err) {
    const s = M.sh, f = p.f, sp = SHOTS[type];
    let v = null;
    if (err === 'net') {
      // aimed below the tape: gravity and drag only pull it lower
      const dx = -s.x, dy = K.NET_H * 0.55 - s.y, L = Math.hypot(dx, dy) || 1;
      v = { vx: (dx / L) * 9, vy: (dy / L) * 9 };
    } else if (err === 'long') {
      v = solve(s.x, s.y, f, 'clear', K.HALF + K.LINE + 0.5 + M.rand() * 0.7) || { vx: f * 40, vy: 22 };
    } else {
      const d = aim != null ? clamp(aim, sp.d[0], sp.d[1]) : sp.d[0] + (sp.d[1] - sp.d[0]) * M.rand();
      v = solve(s.x, s.y, f, type, d);
      // fallbacks keep every shot from a kid going in: a smash from too far back becomes a drive, then a clear
      const chain = type === 'smash' ? ['drive', 'clear', 'lift'] : type === 'drop' || type === 'net' ? ['net', 'drop', 'lift', 'clear'] : ['clear', 'lift', 'drive'];
      for (let i = 0; !v && i < chain.length; i++) {
        const t2 = chain[i], s2 = SHOTS[t2];
        v = solve(s.x, s.y, f, t2, (s2.d[0] + s2.d[1]) / 2);
        if (v) type = t2;
      }
      if (!v) {
        // nothing fits (a shuttle low and right by the net): a steep pop-up that just tumbles over
        v = solve(s.x, s.y, f, 'pop', 0.7);
        type = 'net';
      }
      if (!v) v = { vx: f * 6, vy: 9 };
    }
    s.vx = v.vx;
    s.vy = v.vy;
    s.held = -1;
    s.last = p.side;
    s.lastP = p.i;
    s.shot = type;
    s.netted = false;
    s.netY = null;
    p.swHit = true;
    p.hitT = 0;
    M.rally++;
    M.hitNo++;
    M.stats.hits[p.side]++;
    if (type === 'smash') M.stats.smashes[p.side]++;
    // where it will come down, and where it'll be at catching height (EASY drifts the player there, and shows a ring)
    s.pred = predictCatch(s, 1 - p.side);
    ev(M, 'hit', { side: p.side, p: p.i, shot: type, err: err || '', bud: p.isBud || false });
  }

  // From a shuttle in flight: where it lands, and where it passes 1.7 m on the way down on `side`.
  function predictCatch(s0, side) {
    const s = { x: s0.x, y: s0.y, vx: s0.vx, vy: s0.vy, landed: false, netted: false, netY: null };
    const dt = DT / SUB;
    let cx = null, t = 0;
    while (!s.landed && t < 8) {
      fly(s, dt);
      t += dt;
      if (cx === null && s.vy < 0 && s.y < 1.7 && sideOf(s.x) === side) cx = s.x;
    }
    return { landX: s.x, catchX: cx === null ? s.x : cx, netted: s.netted, t };
  }

  function landed(M) {
    const s = M.sh, x = s.x, side = sideOf(x);
    const inCourt = Math.abs(x) <= K.HALF + K.LINE;
    let winner, why;
    if (s.last < 0) { winner = 1 - side; why = 'in'; } else if (side === s.last) { winner = 1 - s.last; why = s.netted ? 'net' : 'short'; } else if (!inCourt) { winner = side; why = 'out'; } else { winner = s.last; why = 'in'; }
    ev(M, 'land', { x, side, in: inCourt && side !== s.last, by: s.last });
    point(M, winner, why);
  }

  function point(M, w, why) {
    M.score[w]++;
    M.stats.points++;
    M.stats.best = Math.max(M.stats.best, M.rally);
    const regained = M.server !== w;
    M.server = w;
    if (regained && M.mode === 'doubles' && M.stats.points > 1) M.serveSlot[w] = 1 - M.serveSlot[w];
    for (const p of M.p) {
      if (p.side === w) p.happy = 1.5; else p.sad = 1.5;
    }
    M.phase = 'point';
    M.phaseT = 0;
    const win = gameWon(M.score, w);
    ev(M, 'point', { side: w, why, score: M.score.slice(), rally: M.rally, gamePoint: !win && isGamePoint(M.score) });
    if (win) {
      M.phase = 'over';
      M.winner = w;
      for (const b of M.bud) if (b.on) { b.phase = 'bye'; b.t = 0; b.returns = 0; }
      ev(M, 'over', { side: w, score: M.score.slice() });
    }
  }

  // First to 11, win by 2, 15 always wins.
  function gameWon(score, w) {
    const a = score[w], b = score[1 - w];
    if (SAB === 'score') return a >= K.TO_WIN - 1;
    return a >= K.CAP || (a >= K.TO_WIN && a - b >= K.BY);
  }

  function isGamePoint(score) {
    return [0, 1].some((w) => gameWon([score[0] + (w === 0 ? 1 : 0), score[1] + (w === 1 ? 1 : 0)], w));
  }

  // ---------------------------------------------------------------- players

  function walkTo(p, x, speed) {
    const dx = x - p.x;
    p.vx = Math.abs(dx) < 0.03 ? 0 : clamp(dx * 8, -speed, speed);
  }

  function movePlayers(M, inps, auto) {
    for (const p of M.p) {
      const inp = inps[p.i];
      if (auto) {
        p.vx *= 0.8;
        stepBody(M, p, blankInput());
        continue;
      }
      let want = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      let top = p.brain ? LEVELS[p.ctrl].speed : K.RUN;
      if (want === 0 && p.ctrl === 'human' && M.level === 'easy') {
        // EASY: let go of the keys and you drift to where the shuttle is coming
        const s = M.sh;
        if (s.pred && s.last !== p.side && !s.landed) {
          const tx = s.pred.catchX - p.f * 0.35, dx = tx - p.x;
          if (Math.abs(dx) > 0.12) { want = Math.sign(dx); top = K.RUN * 0.62 * Math.min(1, Math.abs(dx)); }
        }
      }
      const target = want * top;
      p.vx += clamp(target - p.vx, -K.ACCEL * DT, K.ACCEL * DT);
      if (inp.jump && !p.last.jump && !p.air) {
        p.vy = K.JUMP_V;
        p.air = true;
        ev(M, 'jump', { p: p.i });
      }
      if (inp.swing && !p.last.swing && (p.sw < 0 || p.sw > swA1(M, p))) {
        const h = M.sh.y - p.y;
        startSwing(M, p, h > 1.85 ? 'over' : h > 0.95 ? 'side' : 'under');
        p.swShot = inp.shot || '';
        p.swAim = inp.aim;
        p.swErr = inp.err || '';
      }
      stepBody(M, p, inp);
    }
  }

  function startSwing(M, p, kind) {
    p.sw = 0;
    p.swHit = false;
    p.swKind = kind;
    ev(M, 'swing', { p: p.i, kind });
  }

  function stepBody(M, p, inp) {
    p.x += p.vx * DT;
    const lo = p.side === 0 ? -K.WALL : K.NET_GAP, hi = p.side === 0 ? -K.NET_GAP : K.WALL;
    if (p.x < lo) { p.x = lo; p.vx = Math.max(0, p.vx); }
    if (p.x > hi) { p.x = hi; p.vx = Math.min(0, p.vx); }
    if (p.air) {
      p.vy -= K.PG * DT;
      p.y += p.vy * DT;
      if (p.y <= 0) {
        p.y = 0;
        p.vy = 0;
        p.air = false;
        ev(M, 'land-feet', { p: p.i });
      }
    }
    if (p.sw >= 0) {
      p.sw++;
      if (p.sw > K.SW_LEN) p.sw = -1;
    }
    p.hitT += DT;
    if (p.happy > 0) p.happy -= DT;
    if (p.sad > 0) p.sad -= DT;
  }

  // ---------------------------------------------------------------- the companion (singles)

  function callBuddy(M, side) {
    if (M.mode !== 'singles' || !M.p.some((p) => p.side === side && p.ctrl === 'human') || !buddyAllowed(M, side)) {
      ev(M, 'highfive', { side });
      return;
    }
    const b = M.bud[side];
    if (b.on && b.phase !== 'bye') {
      b.returns = Math.min(9, b.returns + 1);
      ev(M, 'budMore', { side, returns: b.returns });
      return;
    }
    const me = M.p[M.team[side][0]];
    Object.assign(b, { on: true, t: 0, phase: 'hello', returns: 1, x: clamp(me.x - me.f * 1.6, -K.WALL, K.WALL), y: 0, vx: 0, sw: -1, hitT: 9, treat: false });
    if (sideOf(b.x) !== side) b.x = side === 0 ? -4.5 : 4.5;
    ev(M, 'budIn', { side });
  }

  // In singles the other brother can come in; when both brothers are already playing, T is a high five instead.
  function buddyAllowed(M, side) {
    const ids = M.p.map((p) => p.id);
    return !(ids.includes('teddy') && ids.includes('tommy'));
  }

  function stepBuds(M) {
    for (const b of M.bud) {
      if (!b.on) continue;
      b.t += DT;
      b.hitT += DT;
      if (b.sw >= 0 && ++b.sw > K.SW_LEN) b.sw = -1;
      const me = M.p[M.team[b.side][0]], s = M.sh, f = b.side === 0 ? 1 : -1;
      if (b.phase === 'hello' && b.t >= K.BUD_HELLO && !b.treat) {
        b.treat = true;
        ev(M, 'budTreat', { side: b.side });
      }
      if (b.phase === 'hello' && b.t >= K.BUD_TREAT) { b.phase = 'ready'; b.t = 0; }
      if (b.phase === 'bye') {
        b.vx = 0;
        if (b.t >= K.BUD_BYE) { b.on = false; ev(M, 'budOut', { side: b.side }); }
        continue;
      }
      // he returns the next shuttle coming to his side (even during his hello)
      const incoming = M.phase === 'rally' && !s.landed && !s.netted && s.last === 1 - b.side && b.returns > 0;
      let tx = me.x - f * 1.5;
      if (incoming && s.pred) tx = s.pred.catchX - f * 0.3;
      if (!incoming) tx = clamp(tx, b.side === 0 ? -K.WALL : K.NET_GAP + 1, b.side === 0 ? -K.NET_GAP - 1 : K.WALL);
      const dx = tx - b.x;
      b.vx = Math.abs(dx) < 0.05 ? 0 : clamp(dx * 9, -K.BUD_RUN, K.BUD_RUN);
      b.x = clamp(b.x + b.vx * DT, b.side === 0 ? -K.WALL : K.NET_GAP, b.side === 0 ? -K.NET_GAP : K.WALL);
      if (incoming && sideOf(s.x) === b.side) {
        const rel = (s.x - b.x) * f;
        const near = rel > -1.2 && rel < 1.6 && s.y < 2.9;
        if ((near && s.vy < 0 && s.y < 2.4) || s.y < 0.55) {
          // got it: a big safe clear (he snaps the last bit of the way if he had to run far)
          b.x = clamp(s.x - f * 0.35, b.side === 0 ? -K.WALL : K.NET_GAP, b.side === 0 ? -K.NET_GAP : K.WALL);
          b.sw = 0;
          b.hitT = 0;
          const fake = { i: -1, side: b.side, f, isBud: true, swHit: false, hitT: 0 };
          hit(M, fake, 'save', null, '');
          b.returns--;
          M.stats.budReturns[b.side]++;
          ev(M, 'budHit', { side: b.side, left: b.returns });
          if (b.returns <= 0) { b.phase = 'bye'; b.t = -0.5; }
        }
      }
    }
  }

  // ---------------------------------------------------------------- the computer

  // Every frame the shuttle will be at, from now until it lands (on the match's shuttle clock).
  function path(M, max = 600) {
    const s0 = M.sh, s = { x: s0.x, y: s0.y, vx: s0.vx, vy: s0.vy, landed: false, netted: s0.netted, netY: null };
    const out = [];
    const dt = (DT * M.ts) / SUB;
    for (let j = 0; j < max && !s.landed; j++) {
      for (let k = 0; k < SUB && !s.landed; k++) fly(s, dt);
      out.push({ x: s.x, y: s.y, vy: s.vy, netted: s.netted });
    }
    return out;
  }

  // Doubles: who on this side goes for this shuttle. A human on the team takes anything near him.
  function assignee(M, side) {
    if (M.assignFor[side] === M.hitNo) return M.assign[side];
    const team = M.team[side].map((i) => M.p[i]);
    let pick = team[0].i;
    if (team.length > 1) {
      const pr = M.sh.pred, cx = pr ? pr.catchX : M.sh.x;
      const human = team.find((p) => p.ctrl === 'human');
      const cost = (p) => Math.abs(cx - p.f * 0.3 - p.x);
      if (human && team.every((p) => p.ctrl === 'human')) pick = -1;
      else if (human) {
        const pal = team.find((p) => p !== human);
        pick = cost(pal) + 0.9 < cost(human) ? pal.i : human.i;
      } else {
        const front = team.find((p) => p.slot === 1), back = team.find((p) => p.slot === 0);
        pick = Math.abs(cx) < 3.0 ? front.i : back.i;
        if (cost(front) + 1.0 < cost(back) && Math.abs(cx) < 3.6) pick = front.i;
      }
    }
    M.assign[side] = pick;
    M.assignFor[side] = M.hitNo;
    return pick;
  }

  // A CPU player. Each new shot coming its way: wait its reaction time, plan where to meet it, run there, jump if it's
  // smashing, and press swing so the racket is live as the shuttle arrives.
  function brain(level) {
    const L = LEVELS[level] || LEVELS.froggy;
    let memo = { forHit: -1 };
    return function (M, i) {
      const p = M.p[i], s = M.sh, inp = blankInput();
      if (M.phase === 'serve') {
        if (s.held === i && M.phaseT > 0.55 + L.serve[0] + (L.serve[1] - L.serve[0]) * M.serveWait) {
          inp.swing = !p.last.swing;
          inp.shot = M.rand() < L.short ? 'serveShort' : 'serveHigh';
        }
        return inp;
      }
      if (M.phase !== 'rally') return inp;
      const incoming = s.last === 1 - p.side && !s.landed && !s.netted;
      if (!incoming || (M.mode === 'doubles' && assignee(M, p.side) !== i)) {
        moveTo(inp, p, baseX(M, p));
        return inp;
      }
      if (memo.forHit !== M.hitNo) {
        // a shuttle on its way out: a good player lets it drop
        const out = s.pred && Math.abs(s.pred.landX) > K.HALF + K.LINE + 0.15 && !s.pred.netted;
        memo = { forHit: M.hitNo, react: L.react * (0.75 + 0.5 * M.rand()), plan: null, leave: out && M.rand() < L.leave };
      }
      if (memo.leave) {
        moveTo(inp, p, baseX(M, p));
        return inp;
      }
      if (memo.react > 0) {
        memo.react -= DT;
        return inp;
      }
      if (!memo.plan) memo.plan = plan(M, p, L);
      const pl = memo.plan;
      moveTo(inp, p, pl.standX);
      const left = pl.frame - M.frame;
      if (pl.jump && left <= pl.jumpLead && !memo.jumped) { inp.jump = true; memo.jumped = true; }
      if (left <= pl.swingLead && !memo.swung && L.react < 50) {
        memo.swung = true;
        inp.swing = true;
        inp.shot = pl.shot;
        inp.aim = pl.aim;
        inp.err = pl.err;
      }
      return inp;
    };
  }

  function moveTo(inp, p, x) {
    const dx = x - p.x;
    if (dx > 0.08) inp.right = true;
    else if (dx < -0.08) inp.left = true;
  }

  function plan(M, p, L) {
    const pts = path(M);
    const f = p.f;
    let best = null;
    for (let j = 1; j < pts.length; j++) {
      const q = pts[j];
      if (q.netted || sideOf(q.x) !== p.side || q.y > 2.9 || q.y < 0.25) continue;
      const standX = clamp(q.x - f * 0.35, p.side === 0 ? -K.WALL : K.NET_GAP, p.side === 0 ? -K.NET_GAP : K.WALL);
      const need = Math.abs(standX - p.x) / Math.max(0.1, L.speed) + 0.12;
      const have = j * DT;
      if (need > have) continue;
      const pref = q.y >= 2.0 ? 3 : q.y >= 1.0 ? 2 : 1;
      const score = pref * 100 - j * 0.01;
      if (!best || score > best.score) best = { score, j, q, standX };
    }
    if (!best) {
      // can't make it: run for where it lands and hope
      const q = pts[pts.length - 1] || { x: p.x, y: 0 };
      return { frame: M.frame + pts.length, standX: q.x - f * 0.3, swingLead: -99, jump: false, jumpLead: -99, shot: '', aim: null, err: '' };
    }
    const q = best.q;
    // the shot: smash a high one, drop on a player stuck at the back, clear / lift away from a player at the net
    const foes = M.team[1 - p.side].map((k) => M.p[k]);
    const foe = foes.reduce((a, b) => (Math.abs(b.x) < Math.abs(a.x) ? b : a));
    const deep = foes.every((o) => Math.abs(o.x) > 3.4);
    let shot = '';
    let jump = false;
    if (q.y >= 2.0 && M.rand() < L.smash) { shot = 'smash'; jump = true; } else if (deep && M.rand() < L.drop * 1.6) shot = q.y > 1.45 ? 'drop' : 'net';
    else if (M.rand() < L.drop * 0.5) shot = q.y > 1.45 ? 'drop' : 'net';
    else shot = q.y >= 1.85 ? 'clear' : q.y >= 0.95 ? (M.rand() < 0.6 ? 'drive' : 'lift') : 'lift';
    // where: near the other player (friendly) or away from them
    const sp = SHOTS[shot];
    let aim = null;
    const at = Math.abs(foe.x);
    if (L.aim === 'you') aim = clamp(at, sp.d[0], sp.d[1]);
    else if (L.aim === 'away') aim = at > (sp.d[0] + sp.d[1]) / 2 ? sp.d[0] + 0.1 : sp.d[1] - 0.1;
    // mistakes, more of them as the rally goes on
    const pErr = L.err + Math.max(0, M.rally - L.errAt) * L.errUp;
    const err = M.rand() < pErr ? (M.rand() < 0.6 ? 'net' : 'long') : '';
    const noise = Math.round((M.rand() * 2 - 1) * L.whiff);
    return {
      frame: M.frame + best.j, standX: best.standX, swingLead: 7 + noise, jump, jumpLead: Math.min(best.j - 1, 15), shot, aim, err,
    };
  }

  // ---------------------------------------------------------------- the headless check

  // Plays a whole match with nobody at the keys (every player a brain) and returns the match.
  function sim(o = {}) {
    const M = create(o);
    const max = o.maxFrames || 60 * 60 * 25;
    let rallies = 0, hitsInRallies = 0;
    while (M.phase !== 'over' && M.frame < max) {
      const evs = step(M, []);
      for (const e of evs) if (e.type === 'point') { rallies++; hitsInRallies += e.rally; }
      if (o.onStep) o.onStep(M, evs);
    }
    M.summary = { done: M.phase === 'over', frames: M.frame, rallies, avgRally: rallies ? hitsInRallies / rallies : 0 };
    return M;
  }

  // The rules the brief asks for: shuttle physics stable; scoring; CPU rallies. Plus the brother's return.
  // o.sabotage: 'drag' (drag pushes instead of slowing), 'score' (a game ends at 10), 'lazy' (CPUs never swing): each
  // must make the check fail. o.n scales the random parts.
  function check(o = {}) {
    SAB = o.sabotage || '';
    const fails = [];
    const fail = (what) => { if (fails.length < 30) fails.push(what); };
    const out = { physics: {}, solver: {}, scoring: {}, cpu: {}, buddy: {} };
    const R = rng(o.seed || 7);
    const n = o.n || 1;
    try {
      // 1. physics: 600 random launches, every speed and angle. Never NaN, energy never goes up, it always lands,
      // it settles at the terminal speed, and even a 60 m/s hit can't go far (that's what a shuttle does).
      let launches = 0, maxRange = 0;
      for (let k = 0; k < 600 * n; k++) {
        const v0 = 1 + R() * 59, a = (R() * 2 - 1) * 85 * RAD;
        const s = { x: 0, y: 0.5 + R() * 3, vx: v0 * Math.cos(a), vy: v0 * Math.sin(a), landed: false, netted: true, netY: null };
        const x0 = s.x;
        let E = 0.5 * v0 * v0 + K.G * s.y, t = 0, bad = '';
        const dt = DT / SUB;
        while (!s.landed && t < 30) {
          fly(s, dt);
          t += dt;
          const E2 = 0.5 * (s.vx * s.vx + s.vy * s.vy) + K.G * s.y;
          if (!Number.isFinite(E2)) { bad = 'NaN'; break; }
          if (E2 > E + 1e-9) { bad = 'energy went up'; break; }
          E = E2;
        }
        if (!bad && !s.landed) bad = 'never landed';
        if (!bad && t > 12) bad = 'took ' + t.toFixed(1) + ' s to land';
        if (bad) fail(`physics: ${bad} (v ${v0.toFixed(1)}, angle ${(a / RAD).toFixed(0)})`);
        maxRange = Math.max(maxRange, Math.abs(s.x - x0));
        launches++;
      }
      // dropped from 40 m it falls at the terminal speed
      const fall = { x: 0, y: 40, vx: 0, vy: 0, landed: false, netted: true };
      for (let t = 0; t < 4; t += DT / SUB) fly(fall, DT / SUB);
      const vt = Math.abs(fall.vy);
      if (Math.abs(vt - K.VT) > 0.05 * K.VT) fail(`physics: falls at ${vt.toFixed(2)} m/s, terminal is ${K.VT}`);
      if (maxRange > 22) fail(`physics: a hit went ${maxRange.toFixed(1)} m (a shuttle can't)`);
      // a 1/60 s step and a 1/600 s step land in nearly the same place
      const coarse = { x: -4, y: 2.5, vx: 20, vy: 8, landed: false, netted: false, netY: null }, fine = Object.assign({}, coarse);
      while (!coarse.landed) fly(coarse, 1 / 60);
      while (!fine.landed) fly(fine, 1 / 600);
      if (Math.abs(coarse.x - fine.x) > 0.25) fail(`physics: time step changes the landing by ${Math.abs(coarse.x - fine.x).toFixed(2)} m`);
      out.physics = { launches, maxRange: +maxRange.toFixed(2), terminal: +vt.toFixed(2), stepError: +Math.abs(coarse.x - fine.x).toFixed(3) };

      // 2. the solver: every shot from anywhere a player can reach it lands in the other court, over the net
      let shots = 0, solved = 0;
      const types = ['clear', 'lift', 'drive', 'drop', 'net', 'smash', 'serveHigh', 'serveShort', 'save'];
      for (let k = 0; k < 400 * n; k++) {
        const type = types[k % types.length];
        const f = R() < 0.5 ? 1 : -1;
        const px = -f * (K.NET_GAP + R() * (K.WALL - K.NET_GAP));
        const y = type.startsWith('serve') ? 1.0 : type === 'smash' ? 2.1 + R() * 1.6 : type === 'lift' || type === 'net' ? 0.2 + R() * 1.0 : 0.4 + R() * 2.6;
        const x = px + f * (R() * 1.2);
        if (sideOf(x) !== sideOf(px) || (Math.abs(x) < 0.3 && y < K.NET_H)) continue;
        const M = create({ seed: k + 1 });
        M.sh = Object.assign(newShuttle(), { x, y });
        const p = { i: 0, side: f > 0 ? 0 : 1, f, swHit: false, hitT: 0 };
        M.p[0] = Object.assign(M.p[0], p);
        hit(M, M.p[0], type, null, '');
        const r = landing(M.sh.x, M.sh.y, M.sh.vx, M.sh.vy);
        shots++;
        const past = r.x * f;
        if (r.netted || past <= 0 || past > K.HALF + K.LINE) fail(`solver: ${type} from (${x.toFixed(1)}, ${y.toFixed(1)}) ${r.netted ? 'hit the net' : 'landed at ' + past.toFixed(2)}`);
        else solved++;
      }
      // mistakes really are mistakes
      for (const err of ['net', 'long']) {
        const M = create({ seed: 3 });
        M.sh = Object.assign(newShuttle(), { x: -3, y: 2.2 });
        hit(M, M.p[0], 'clear', null, err);
        const r = landing(M.sh.x, M.sh.y, M.sh.vx, M.sh.vy);
        if (err === 'net' && !r.netted && r.x > 0) fail('solver: a net mistake went over');
        if (err === 'long' && (r.netted || r.x <= K.HALF + K.LINE)) fail(`solver: a long mistake landed in (${r.x.toFixed(2)})`);
      }
      out.solver = { shots, solved };

      // 3. scoring: hand-made rallies, then 2000 random games against a second, separately written scorer
      const land = (M, by, x) => {
        M.phase = 'rally';
        M.sh = Object.assign(newShuttle(), { x, y: 0.05, vx: 0, vy: -1, last: by });
        for (let k = 0; k < 100 && M.phase === 'rally'; k++) step(M, []);
      };
      const cases = [
        ['in', 0, 3, 0], ['in', 1, -2, 1], ['out', 0, K.HALF + 0.6, 1], ['out', 1, -(K.HALF + 0.9), 0], ['short', 0, -1, 1], ['line', 1, -(K.HALF + 0.1), 1],
      ];
      for (const [name, by, x, want] of cases) {
        const M = create({ seed: 5, ctrl: [['lazy'], ['lazy']] });
        land(M, by, x);
        const got = M.score[0] ? 0 : M.score[1] ? 1 : -1;
        if (got !== want) fail(`scoring: ${name} (hit by ${by}, lands ${x}) gave the point to ${got}, not ${want}`);
        if (M.server !== want) fail(`scoring: ${name}: the rally's winner should serve`);
      }
      const ref = (seq) => {
        // first to 11, win by 2, 15 caps: written again, plainly
        const sc = [0, 0];
        for (const w of seq) {
          sc[w]++;
          const a = sc[w], b = sc[1 - w];
          if (a === 15 || (a >= 11 && a - b >= 2)) return { sc, w };
        }
        return { sc, w: -1 };
      };
      let games = 0, deuce = 0, capped = 0;
      for (let g = 0; g < 2000 * n; g++) {
        const bias = 0.3 + R() * 0.4;
        const seq = [];
        for (let k = 0; k < 40; k++) seq.push(R() < bias ? 0 : 1);
        const want = ref(seq);
        const M = create({ seed: g + 11, ctrl: [['lazy'], ['lazy']] });
        for (const w of seq) {
          if (M.phase === 'over') break;
          M.phase = 'rally';
          M.sh = Object.assign(newShuttle(), { x: w === 0 ? 2 : -2, y: 0.05, vy: -1, last: w });
          for (let k = 0; k < 100 && M.phase === 'rally'; k++) step(M, []);
        }
        const won = M.phase === 'over' ? M.winner : -1;
        if (won !== want.w || M.score[0] !== want.sc[0] || M.score[1] !== want.sc[1]) {
          fail(`scoring: game ${g} ended ${M.score.join('-')} (winner ${won}), should be ${want.sc.join('-')} (winner ${want.w})`);
        }
        if (Math.min(...want.sc) >= 10) deuce++;
        if (Math.max(...want.sc) === 15) capped++;
        games++;
      }
      out.scoring = { cases: cases.length, games, deuce, capped };

      // 4. CPU rallies: whole matches between every pair of computer players, singles and doubles. Every match has to
      // finish, the rallies have to be real (several hits on average), and both sides have to win points.
      const pairs = [['froggy', 'froggy', 'singles'], ['foxy', 'foxy', 'singles'], ['foxy', 'froggy', 'singles'], ['kid', 'froggy', 'singles'], ['kid', 'foxy', 'singles'], ['pal', 'foxy', 'doubles'], ['kid', 'froggy', 'doubles']];
      const res = [];
      for (const [a, b, mode] of pairs) {
        for (const level of ['easy', 'normal']) {
          let done = 0, rallies = 0, hits = 0, wins = [0, 0], pts = [0, 0], frames = 0;
          const N = Math.max(2, Math.round(6 * n));
          for (let g = 0; g < N; g++) {
            const ctrl = mode === 'doubles' ? [[a, a === 'kid' ? 'pal' : a], [b, b]] : [[a], [b]];
            const ids = mode === 'doubles' ? [['teddy', 'tommy'], ['foxy', 'froggy']] : [['teddy'], [b === 'foxy' ? 'foxy' : 'froggy']];
            const M = sim({ mode, level, ctrl, ids, seed: 1000 + g * 7 + level.length, maxFrames: o.maxFrames });
            if (M.summary.done) { done++; wins[M.winner]++; }
            rallies += M.summary.rallies;
            hits += M.summary.avgRally * M.summary.rallies;
            pts[0] += M.score[0];
            pts[1] += M.score[1];
            frames += M.frame;
          }
          const avg = rallies ? hits / rallies : 0;
          const row = { pair: `${a} v ${b}`, mode, level, done: `${done}/${N}`, avgRally: +avg.toFixed(2), points: pts.join('-'), wins: wins.join('-'), minutes: +(frames / 3600 / N).toFixed(1) };
          res.push(row);
          if (done < N) fail(`cpu: ${row.pair} ${mode} ${level}: only ${done} of ${N} matches finished`);
          if (avg < 3) fail(`cpu: ${row.pair} ${mode} ${level}: rallies average ${avg.toFixed(2)} hits (want at least 3)`);
          if (pts[0] === 0 || pts[1] === 0) fail(`cpu: ${row.pair} ${mode} ${level}: one side never won a point (${row.points})`);
        }
      }
      out.cpu = res;

      // 5. the brother: called in a singles rally, he returns the next shot (and it goes in), and each call adds one
      let calls = 0, returned = 0;
      for (let g = 0; g < 30 * n; g++) {
        const M = create({ seed: 500 + g, level: g % 2 ? 'normal' : 'easy', ctrl: [['lazy'], ['foxy']], ids: [['teddy'], ['foxy']] });
        M.p[0].brain = null;
        M.p[0].ctrl = 'human';
        const times = 1 + (g % 3);
        let got = 0, k = 0;
        for (k = 0; k < 60 * 30 && got < times; k++) {
          const press = k < times * 4 && k % 4 === 0;
          const evs = step(M, [Object.assign(blankInput(), { call: press })]);
          for (const e of evs) if (e.type === 'budHit') got++;
          if (M.phase === 'serve' && M.server === 0 && M.phaseT > 0.6) M.phaseT = K.AUTO_SERVE + 1;
        }
        calls += times;
        returned += got;
        if (got < times) fail(`buddy: called ${times} times, returned ${got} shots (game ${g})`);
      }
      out.buddy = { calls, returned };
    } catch (e) {
      fail('threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
    } finally {
      SAB = '';
    }
    out.ok = fails.length === 0;
    out.fails = fails;
    return out;
  }

  root.BTRules = { K, SHOTS, LEVELS, DT, SUB, create, step, blankInput, fly, landing, solve, path, predictCatch, sim, check, gameWon, isGamePoint, sideOf, rng, homeX };
})(typeof window !== 'undefined' ? window : globalThis);
