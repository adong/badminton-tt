/* TT Badminton: the game. Scene, camera, players, the brother's visit, menus, HUD, input, the main loop and the
   window.game test hooks. The rules live in js/rules.js; this file reads the match every frame and turns its events
   into sparks, word bursts, sounds, calls and celebrations. Behind the menus the four friends play a quiet demo. */
(function () {
  'use strict';
  const T = THREE, R = window.BTRules, P = window.BTPoses, FX = window.BTFx, S = window.BTSfx;
  const Kit = window.Kit, K = R.K;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const PI = Math.PI;
  const TITLE = window.BT_TITLE || 'TT Badminton';
  const SIDE_COLOR = ['#8cc2ff', '#ffb0b0'];
  const RACKET = { teddy: '#2a7bd6', tommy: '#ff9f1c', foxy: '#e53950', froggy: '#3fc22b' };
  const TREATS = [['🍦', 'ICE CREAM'], ['💧', 'WATER'], ['🧃', 'JUICE BOX'], ['🍪', 'COOKIE'], ['🍉', 'WATERMELON'], ['🍌', 'BANANA']];
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('ttBadminton.' + k);
        return v === null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try { localStorage.setItem('ttBadminton.' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ }
    },
  };

  const G = {
    screen: 'title', // title | play | pause | results
    players: 1, mode: store.get('mode', 'singles'), level: store.get('level', 'easy'), me: store.get('me', 'teddy'),
    attract: true, hold: false, testing: false, time: 0, acc: 0, timers: [], shake: 0, overT: -1, humans: [],
    tally: store.get('tally', {}), lastKey: '',
  };
  let renderer, scene, camera, stage, shut;
  let M = null, views = [], buds = [null, null], portraits = {}, last = 0;
  const cam = { look: 2.6, shake: 0, y: 3.8 };
  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches || 'ontouchstart' in window;
  const sound = (fn) => { if (!G.attract) fn(); };
  const later = (t, fn) => G.timers.push({ t, fn });
  const nameOf = (id) => (Kit.roster.get(id) || { name: id.toUpperCase() }).name;
  const teamName = (side) => views.filter((v) => v.side === side).map((v) => v.entry.name).join(' & ');
  const humanSide = (side) => M && M.p.some((p) => p.side === side && p.ctrl === 'human');

  // ---------------------------------------------------------------- characters

  function dispose(obj) {
    scene.remove(obj);
    obj.traverse((o) => {
      if (o.isMesh || o.isSprite) {
        if (o.geometry) o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map && m.map !== null && o.isSprite) m.map.dispose(); m.dispose(); });
      }
    });
  }

  function buildPerson(id, side, scale) {
    const entry = Kit.roster.get(id) || Kit.roster.list[0];
    const person = Kit.people.build(entry.look);
    P.arm(person, side, RACKET[id] || '#2a7bd6');
    person.root.scale.setScalar(scale || 1);
    person.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(person.root);
    return { entry, person };
  }

  function tagFor(label, side) {
    const tag = Kit.gfx.nameTag(Kit.lang.t(label), label === 'CPU' ? '#ffcf8a' : SIDE_COLOR[side]);
    tag.userData.label = label;
    tag.scale.multiplyScalar(0.55);
    tag.renderOrder = 15;
    scene.add(tag);
    return tag;
  }

  // The 1P / 2P / CPU tags are drawn on canvases: draw them again when the language changes.
  function relabel() {
    for (const v of views) {
      if (!v.tag) continue;
      const fresh = Kit.gfx.nameTag(Kit.lang.t(v.tag.userData.label), v.tag.userData.label === 'CPU' ? '#ffcf8a' : SIDE_COLOR[v.side]);
      v.tag.material.map.dispose();
      v.tag.material.map = fresh.material.map;
      v.tag.material.needsUpdate = true;
    }
  }
  Kit.lang.onChange(() => { relabel(); updateHud(true); });

  function clearViews() {
    for (const v of views) { dispose(v.person.root); if (v.tag) dispose(v.tag); if (v.treat) dispose(v.treat); }
    views = [];
    for (let s = 0; s < 2; s++) if (buds[s]) { dispose(buds[s].person.root); dispose(buds[s].tag); buds[s] = null; }
    FX.clear();
  }

  // ---------------------------------------------------------------- matches

  // Who plays whom. 1 player: you (and in doubles your brother, played by the computer) against Froggy on EASY or Foxy
  // on NORMAL (in doubles both of them). 2 players: Teddy against Tommy, or Teddy and Tommy together against both.
  function lineup(players, mode, level, me) {
    const foe = level === 'normal' ? 'foxy' : 'froggy';
    if (mode === 'doubles') {
      const ctrl0 = players === 2 ? ['human', 'human'] : me === 'tommy' ? ['pal', 'human'] : ['human', 'pal'];
      return { mode, ids: [['teddy', 'tommy'], ['foxy', 'froggy']], ctrl: [ctrl0, [foe, foe]] };
    }
    if (players === 2) return { mode, ids: [['teddy'], ['tommy']], ctrl: [['human'], ['human']] };
    return { mode, ids: [[me], [foe]], ctrl: [['human'], [foe]] };
  }

  function startMatch(o, attract) {
    clearViews();
    G.attract = !!attract;
    M = R.create({ mode: o.mode, level: o.level, ids: o.ids, ctrl: o.ctrl, server: G.server !== undefined ? G.server : Math.random() < 0.5 ? 0 : 1 });
    G.humans = M.p.filter((p) => p.ctrl === 'human').map((p) => p.i);
    for (const p of M.p) {
      const { entry, person } = buildPerson(p.id, p.side, 1);
      const label = attract ? '' : p.ctrl === 'human' ? (G.players === 2 ? (G.humans.indexOf(p.i) === 0 ? '1P' : '2P') : '1P') : 'CPU';
      views.push({
        p, side: p.side, entry, person, tag: label ? tagFor(label, p.side) : null, t: 0, ph: 0, cel: null, celT: 0, fiveT: 0, hop: 0,
        z: M.mode === 'doubles' ? (p.slot === 0 ? -0.6 : 0.65) : 0, treat: null, treatT: 0,
      });
    }
    // in singles, each kid's brother waits off court until he's called
    if (M.mode === 'singles') {
      for (const p of M.p) {
        if (p.ctrl !== 'human' || !(p.id === 'teddy' || p.id === 'tommy')) continue;
        if (M.p.some((q) => q !== p && (q.id === 'teddy' || q.id === 'tommy'))) continue;
        const id = Kit.roster.buddyFor(p.id);
        const e0 = Kit.roster.get(id);
        const { entry, person } = buildPerson(id, p.side, e0.buddyScale || 0.8);
        person.root.visible = false;
        const tag = Kit.gfx.nameTag(entry.name, SIDE_COLOR[p.side]);
        tag.scale.multiplyScalar(0.6);
        tag.renderOrder = 15;
        tag.visible = false;
        scene.add(tag);
        buds[p.side] = { id, entry, person, tag, t: 0, ph: 0, pop: 0, cel: Kit.roster.signature(entry, 'hello'), treatSprite: null };
      }
    }
    G.overT = -1;
    G.timers = [];
    G.acc = 0;
    stage.score(0, 0, [teamShort(0), teamShort(1)]);
    updateHud(true);
  }

  function teamShort(side) {
    return M.team[side].map((i) => Kit.lang.t(nameOf(M.p[i].id))).join('+');
  }

  function startAttract() {
    G.players = 1;
    startMatch({ mode: 'doubles', level: 'normal', ids: [['teddy', 'tommy'], ['foxy', 'froggy']], ctrl: [['pal', 'pal'], ['pal', 'pal']] }, true);
  }

  function startGame() {
    const o = lineup(G.players, G.mode, G.level, G.me);
    o.level = G.level;
    G.lastKey = matchKey();
    startMatch(o, false);
    show('play');
    Kit.sound.music('play');
    banner('FIRST TO 11!', 'set', 1.4);
  }

  function matchKey() {
    const o = lineup(G.players, G.mode, G.level, G.me);
    return o.ids.map((t) => t.join('+')).join(' v ');
  }

  // ---------------------------------------------------------------- input

  const held = new Set(), tapped = new Set();
  const touchHeld = new Set(), touchTapped = new Set();
  const KEYSETS = [
    { left: ['KeyA'], right: ['KeyD'], jump: ['KeyW'], swing: ['KeyF'], call: ['KeyT'] },
    { left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ArrowUp'], swing: ['KeyL'], call: ['Enter'] },
  ];
  const on = (codes) => codes.some((c) => held.has(c) || tapped.has(c));
  function keysInput(set) {
    const k = KEYSETS[set], inp = R.blankInput();
    for (const a of ['left', 'right', 'jump', 'swing', 'call']) inp[a] = on(k[a]);
    return inp;
  }

  // The inputs for this frame, by player index.
  function inputs() {
    const out = [];
    if (G.attract || !M) return out;
    if (G.players === 1) {
      const i = G.humans[0];
      const a = keysInput(0), b = keysInput(1), inp = R.blankInput();
      for (const k of ['left', 'right', 'jump', 'swing', 'call']) inp[k] = a[k] || b[k] || touchHeld.has(k) || touchTapped.has(k);
      if (on(['Space'])) inp.swing = true;
      out[i] = inp;
    } else {
      G.humans.forEach((i, n) => { out[i] = keysInput(n); });
    }
    if (G.press) {
      for (const [i, o] of Object.entries(G.press)) {
        out[i] = Object.assign(R.blankInput(), o.keys);
        if (--o.n <= 0) delete G.press[i];
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- the loop

  function tick() {
    const evs = R.step(M, inputs());
    tapped.clear();
    touchTapped.clear();
    handleEvents(evs);
    for (let i = G.timers.length - 1; i >= 0; i--) {
      const tm = G.timers[i];
      tm.t -= R.DT;
      if (tm.t <= 0) { G.timers.splice(i, 1); tm.fn(); }
    }
    if (G.attract && M.phase === 'over' && M.phaseT > 3) startAttract();
    if (!G.attract && M.phase === 'over' && G.overT >= 0) {
      G.overT += R.DT;
      if (G.overT > K.OVER_LEN && G.screen === 'play') showResults();
    }
  }

  function advance(dt) {
    G.time += dt;
    if (G.screen === 'pause' || !M) return;
    G.acc += Math.min(dt, 0.1);
    while (G.acc >= R.DT) {
      G.acc -= R.DT;
      tick();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (G.hold) return;
    advance(dt);
    render(dt);
  }

  // ---------------------------------------------------------------- events

  const SHOT_WORD = { smash: ['SMASH!', '#ffd400'], drop: ['DROP SHOT!', '#9dff6a'], net: ['NET SHOT!', '#9dff6a'], save: ['SAVED!', '#18d4ff'] };

  function handleEvents(evs) {
    for (const e of evs) {
      switch (e.type) {
        case 'hit': {
          const s = M.sh, z = shuttleZ();
          FX.sparks(s.x, s.y, z, e.shot === 'smash' ? '#ffd400' : '#ffffff', e.shot === 'smash' ? 16 : 8);
          sound(() => S.hit(e.shot));
          if (SHOT_WORD[e.shot] && !G.attract) FX.word(SHOT_WORD[e.shot][0], s.x, s.y + 0.9, z, SHOT_WORD[e.shot][1], e.shot === 'smash' ? 1.1 : 0.8);
          if (e.shot === 'smash') {
            FX.feathers(s.x, s.y, z, 7);
            G.shake = 0.35;
          }
          break;
        }
        case 'swing': sound(() => S.swish()); break;
        case 'jump': sound(() => Kit.sound.jump()); break;
        case 'net': sound(() => S.net()); break;
        case 'land': FX.dust(e.x, shuttleZ()); sound(() => S.land()); break;
        case 'point': onPoint(e); break;
        case 'over': onOver(e); break;
        case 'serve': break;
        case 'budIn': budIn(e.side); break;
        case 'budTreat': giveTreat(e.side); break;
        case 'budMore': toast(helperLine(e.side, e.returns), 'save'); sound(() => S.pop()); break;
        case 'budHit': {
          const bd = buds[e.side];
          if (bd) toast(e.left > 0 ? `${bd.entry.name} GOT IT! ${e.left} MORE` : `${bd.entry.name} GOT IT!`, 'save');
          sound(() => Kit.sound.powerup());
          break;
        }
        case 'budOut': budOut(e.side); break;
        case 'highfive': highFive(e.side); break;
        default: break;
      }
    }
  }

  function helperLine(side, n) {
    const bd = buds[side];
    const nm = bd ? bd.entry.name : 'TOMMY';
    return n > 1 ? `${nm} SAYS: I'LL GET THE NEXT ${n}!` : `${nm} SAYS: I'LL GET THE NEXT ONE!`;
  }

  const WHY = { in: 'IN!', out: 'OUT!', net: 'INTO THE NET!', short: 'TOO SHORT!' };
  function onPoint(e) {
    stage.score(M.score[0], M.score[1], [teamShort(0), teamShort(1)]);
    stage.cheer(e.side);
    if (G.attract || M.phase === 'over') return;
    const mine = G.players === 2 || humanSide(e.side);
    sound(() => { if (mine) S.win(); else S.lose(); S.cheer(false); });
    const who = teamName(e.side);
    call(`${M.score[0]} – ${M.score[1]}`, e.why === 'in' ? `POINT ${who}!` : `${WHY[e.why]} POINT ${who}!`, mine ? 'good' : 'bad');
    if (e.rally >= 10) later(0.9, () => toast(`WHAT A RALLY! ${e.rally} HITS!`));
    if (e.gamePoint) later(1.1, () => { banner('GAME POINT!', 'gp', 1.1); sound(() => S.whistle()); });
    nudge(e.side);
    updateHud();
    for (const v of views) if (v.side === e.side) { v.cel = null; v.hop = 0.9; }
  }

  function onOver(e) {
    stage.score(M.score[0], M.score[1], [teamShort(0), teamShort(1)]);
    if (G.attract) return;
    G.overT = 0;
    sound(() => { S.whistle(); S.cheer(true); });
    // the winners do their signature moves
    for (const v of views) {
      if (v.side !== e.side) continue;
      const sig = v.entry.signature || [];
      v.cel = sig.includes('jumpshot') ? 'jumpshot' : Kit.roster.signature(v.entry, 'hello');
      v.celT = 9;
      v.t = 0;
    }
    const mid = e.side === 0 ? -3 : 3;
    FX.confetti(mid, 4.5, 0);
    later(0.7, () => FX.confetti(mid, 5.5, 0, 60));
    later(1.4, () => FX.confetti(0, 6, 0, 60));
    banner(`${teamName(e.side)} ${views.filter((v) => v.side === e.side).length > 1 ? 'WIN!' : 'WINS!'}`, 'win', 2.4);
    // the running score for this pairing, kept on this device
    if (!G.testing || G.keepTally) {
      const key = G.lastKey, t = G.tally[key] || [0, 0];
      t[e.side]++;
      G.tally[key] = t;
      store.set('tally', G.tally);
    }
    updateHud();
  }

  // ---------------------------------------------------------------- the brother

  function budIn(side) {
    const bd = buds[side];
    if (!bd) return;
    const b = M.bud[side];
    bd.person.root.visible = true;
    bd.tag.visible = true;
    bd.pop = 0;
    bd.t = 0;
    bd.cel = Kit.roster.signature(bd.entry, 'hello');
    bd.person.root.position.set(b.x, 0, 0.9);
    FX.sparks(b.x, 1, 0.9, '#ffd400', 14);
    sound(() => S.pop());
    toast(`${bd.entry.name} IS HERE!`);
  }

  function giveTreat(side) {
    const bd = buds[side];
    if (!bd) return;
    const [emoji, word] = TREATS[Math.floor(Math.random() * TREATS.length)];
    const sp = new T.Sprite(new T.SpriteMaterial({ map: Kit.gfx.emojiTexture(emoji), transparent: true, depthWrite: false }));
    sp.scale.setScalar(0.6);
    sp.renderOrder = 12;
    scene.add(sp);
    const me = views.find((v) => v.side === side && v.p.ctrl === 'human');
    bd.toss = { sp, t: 0, from: bd.person.root.position.clone().add(new T.Vector3(0, 1.4, 0)), me };
    toast(`${emoji} ${word} FROM ${bd.entry.name}!`, 'treat');
    later(0.9, () => toast(helperLine(side, M.bud[side].returns), 'save'));
    sound(() => Kit.sound.coin(1));
  }

  function budOut(side) {
    const bd = buds[side];
    if (!bd) return;
    FX.sparks(bd.person.root.position.x, 1, 0.9, '#ffffff', 10);
    bd.person.root.visible = false;
    bd.tag.visible = false;
  }

  function highFive(side) {
    const bros = views.filter((v) => v.entry.id === 'teddy' || v.entry.id === 'tommy');
    if (bros.length < 2) return;
    for (const v of bros) v.fiveT = 0.9;
    const a = bros[0].person.root.position, b = bros[1].person.root.position;
    const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2 + 0.3;
    FX.sparks(x, 2.5, z, '#ffd400', 18);
    sound(() => S.clap());
    toast('HIGH FIVE! ✋');
  }

  // ---------------------------------------------------------------- drawing

  function shuttleZ() {
    if (!M || M.mode === 'singles') return 0;
    const lp = M.sh.lastP >= 0 ? views[M.sh.lastP] : null;
    return lp ? lp.z * 0.5 : 0;
  }

  // draw: false updates everything (poses, effects, camera) without drawing the frame (the slow part in a software GL)
  function render(dt, draw = true) {
    if (!M) return;
    for (const v of views) renderPlayer(v, dt);
    for (let s = 0; s < 2; s++) if (buds[s]) renderBud(s, dt);
    // the shuttle (and where it lands, on EASY, when it's coming to a kid)
    const s = M.sh;
    let ring = null;
    if (M.level === 'easy' && !G.attract && M.phase === 'rally' && s.pred && !s.landed && humanSide(1 - s.last) && !s.pred.netted) ring = s.pred.landX;
    shut.zs = shut.zs === undefined ? 0 : shut.zs + (shuttleZ() - shut.zs) * Math.min(1, dt * 6);
    FX.updateShuttle(shut, s, { z: shut.zs, ring, smash: s.shot === 'smash' && !s.landed, t: G.time }, dt);
    FX.update(dt);
    stage.update(dt, G.time);
    updateCamera(dt);
    if (!G.attract) updateLive();
    if (draw) renderer.render(scene, camera);
  }

  function renderPlayer(v, dt) {
    const p = v.p, root = v.person.root;
    v.t += dt;
    v.ph += Math.abs(p.vx) * dt * 2.8;
    if (v.hop > 0) v.hop = Math.max(0, v.hop - dt);
    if (v.fiveT > 0) v.fiveT = Math.max(0, v.fiveT - dt);
    const hopY = v.hop > 0 ? Math.abs(Math.sin(v.hop * 9)) * 0.35 : 0;
    let jy = p.y;
    let st;
    if (v.cel && M.phase === 'over') {
      st = { mode: 'celebrate', cel: v.cel, t: v.t };
      if (v.cel === 'jumpshot') jy = Math.max(0, Math.sin(Math.min(1, (v.t % 1.4) / 0.9) * PI)) * 0.9;
    } else if (p.sw >= 0) {
      st = { mode: 'swing', u: p.sw / K.SW_LEN, kind: p.swKind, air: p.air, run: Math.abs(p.vx) > 1.2, ph: v.ph, id: p.id, shot: p.air && p.swKind === 'over' ? 'smash' : '' };
    } else if (v.fiveT > 0 || v.hop > 0) st = { mode: 'five' };
    else if (p.air) st = { mode: 'air' };
    else if (M.phase === 'serve' && M.sh.held === p.i) st = { mode: 'serve' };
    else if (p.sad > 0 && (M.phase === 'point' || M.phase === 'over')) st = { mode: 'sad' };
    else if (Math.abs(p.vx) > 0.6) st = { mode: 'run', ph: v.ph };
    else st = { mode: 'ready' };
    P.pose(v.person, st, 1 - Math.exp(-22 * dt));
    root.position.set(p.x, jy + hopY, v.z);
    const face = p.side === 0 ? -PI / 2 - 0.42 : PI / 2 + 0.42;
    root.rotation.y = st.mode === 'celebrate' ? (p.side === 0 ? -0.5 : 0.5) : face;
    // a 🏀 over Teddy's head for his jump shot
    if (st.mode === 'celebrate' && v.cel === 'jumpshot') {
      if (!v.ball) {
        v.ball = new T.Sprite(new T.SpriteMaterial({ map: Kit.gfx.emojiTexture('🏀'), transparent: true, depthWrite: false }));
        v.ball.scale.setScalar(0.55);
        scene.add(v.ball);
      }
      const u = (v.t % 1.4) / 1.4;
      v.ball.visible = true;
      v.ball.position.set(p.x + (p.side === 0 ? 1 : -1) * u * 1.6, jy + 2.55 + Math.sin(u * PI) * 1.2, v.z + 0.2);
    } else if (v.ball) v.ball.visible = false;
    if (v.tag) {
      v.tag.position.set(p.x, jy + hopY + 2.55, v.z);
      v.tag.visible = M.phase !== 'over';
    }
    // a treat from the brother sits over your head for a while
    if (v.treat) {
      v.treatT -= dt;
      v.treat.position.set(p.x, jy + 2.95 + Math.sin(G.time * 4) * 0.08, v.z);
      if (v.treatT <= 0) { dispose(v.treat); v.treat = null; }
    }
  }

  function renderBud(side, dt) {
    const bd = buds[side], b = M.bud[side], root = bd.person.root;
    if (bd.toss) {
      const tz = bd.toss;
      tz.t += dt / 0.7;
      const to = tz.me ? tz.me.person.root.position.clone().add(new T.Vector3(0, 2.9, 0)) : tz.from;
      const u = Math.min(1, tz.t);
      tz.sp.position.lerpVectors(tz.from, to, u);
      tz.sp.position.y += Math.sin(u * PI) * 1.4;
      if (u >= 1) {
        if (tz.me) {
          if (tz.me.treat) dispose(tz.me.treat);
          tz.me.treat = tz.sp;
          tz.me.treatT = 3.5;
        } else dispose(tz.sp);
        bd.toss = null;
      }
    }
    if (!root.visible) return;
    bd.t += dt;
    bd.ph += Math.abs(b.vx) * dt * 2.8;
    bd.pop = Math.min(1, bd.pop + dt * 4);
    const sc = (bd.entry.buddyScale || 0.8) * (bd.pop < 1 ? 1 - Math.cos(bd.pop * PI * 2.5) * (1 - bd.pop) * 0.6 : 1) * (b.phase === 'bye' ? Math.max(0.05, 1 - Math.max(0, b.t - 0.5) * 2.2) : 1);
    root.scale.setScalar(Math.max(0.05, sc));
    let st;
    if (b.phase === 'hello') st = { mode: 'hello', cel: bd.cel, t: bd.t };
    else if (b.phase === 'bye' && b.sw < 0) st = { mode: 'celebrate', cel: 'wave', t: bd.t };
    else if (b.sw >= 0) st = { mode: 'swing', u: b.sw / K.SW_LEN, kind: M.sh.y > 1.9 ? 'over' : 'side', ph: bd.ph, id: bd.id };
    else if (Math.abs(b.vx) > 0.6) st = { mode: 'run', ph: bd.ph };
    else st = { mode: 'ready' };
    P.pose(bd.person, st, 1 - Math.exp(-22 * dt));
    root.position.set(b.x, 0, 0.9);
    const face = side === 0 ? -PI / 2 - 0.42 : PI / 2 + 0.42;
    root.rotation.y = st.mode === 'hello' || st.mode === 'celebrate' ? (side === 0 ? -0.4 : 0.4) : face;
    bd.tag.position.set(b.x, 2.2 * (bd.entry.buddyScale || 0.8) + 0.45, 0.9);
  }

  function updateCamera(dt) {
    const s = M.sh;
    const want = 2.6 + clamp((s.y - 4.6) * 0.45, 0, 1.6);
    cam.look += (want - cam.look) * Math.min(1, dt * 2.5);
    G.shake = Math.max(0, G.shake - dt);
    const sh = G.shake > 0 ? G.shake * 0.25 : 0;
    camera.position.set((Math.random() - 0.5) * sh, cam.look + 3.4 + (Math.random() - 0.5) * sh, cam.dist);
    camera.lookAt(0, cam.look, 0);
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // fit the whole hall's width with room for the kit's buttons on the left, and the height of a clear
    const tan = Math.tan((camera.fov * PI) / 360);
    // (a phone held upright gets a closer look: just past the back lines)
    const dw = (camera.aspect < 0.8 ? 7.4 : 8.9) / (tan * camera.aspect), dh = 4.3 / tan;
    cam.dist = Math.max(dw, dh);
    camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- HUD

  const ui = {};
  function setupHud() {
    for (const k of ['p0', 'p1']) {
      const el = $(k);
      ui[k] = { el, faces: el.querySelector('.faces'), nm: el.querySelector('.nm'), who: el.querySelector('.who'), pts: el.querySelector('.pts'), srv: el.querySelector('.srv') };
    }
  }

  let hudKey = '';
  function updateHud(force) {
    if (!M || !ui.p0) return;
    for (let side = 0; side < 2; side++) {
      const u = ui['p' + side];
      const team = M.team[side].map((i) => M.p[i]);
      const key = team.map((p) => p.id + p.ctrl).join() + G.players;
      if (force || u.key !== key) {
        u.key = key;
        u.faces.innerHTML = '';
        for (const p of team) {
          const img = document.createElement('img');
          img.alt = '';
          img.src = portraits[p.id] || '';
          u.faces.appendChild(img);
        }
        u.nm.textContent = team.map((p) => nameOf(p.id)).join(' & ');
        const humans = team.filter((p) => p.ctrl === 'human');
        u.who.textContent = humans.length === 0 ? 'CPU' : G.players === 2 ? (humans.length === 2 ? '1P + 2P' : G.humans.indexOf(humans[0].i) === 0 ? '1P' : '2P') : team.length > 1 ? '1P + CPU' : '1P';
      }
      if (u.pts.textContent !== String(M.score[side])) {
        u.pts.textContent = String(M.score[side]);
        u.pts.classList.remove('bump');
        void u.pts.offsetWidth;
        u.pts.classList.add('bump');
      }
      u.srv.classList.toggle('on', M.server === side && M.phase !== 'over');
    }
    const gp = M.phase !== 'over' && R.isGamePoint(M.score);
    $('goal').textContent = M.phase === 'over' ? 'GAME!' : gp ? 'GAME POINT' : M.score[0] >= 10 && M.score[1] >= 10 ? 'WIN BY 2' : 'FIRST TO 11';
    $('goal').classList.toggle('gp', gp);
    // the brother button: call him in singles, a high five in doubles
    const i = G.humans[0];
    const me = i !== undefined ? M.p[i] : null;
    const budId = me ? Kit.roster.buddyFor(me.id) : 'tommy';
    const five = !me || !buds[me.side];
    const bkey = budId + five + G.players;
    if (bkey !== hudKey) {
      hudKey = bkey;
      $('budBtn').querySelector('img').src = portraits[budId] || '';
      $('budBtn').querySelector('small').textContent = five ? 'HIGH FIVE' : nameOf(budId);
      $('budChip').querySelector('img').src = portraits[budId] || '';
      $('budChip').querySelector('b').textContent = five ? 'HIGH FIVE' : `CALL ${nameOf(budId)}`;
    }
  }

  // things that change every frame: the brother's count, the serve hint
  function updateLive() {
    if (G.screen !== 'play') return;
    const i = G.humans[0];
    const me = i !== undefined ? M.p[i] : null;
    const b = me ? M.bud[me.side] : null;
    const n = b && b.on && b.phase !== 'bye' ? b.returns : 0;
    const txt = n ? '×' + n : '';
    for (const badge of [$('budCount'), $('budBtnCount')]) if (badge.textContent !== txt) badge.textContent = txt;
    $('budBtn').classList.toggle('on', n > 0);
    $('budChip').classList.toggle('on', n > 0);
    // "press F to serve" over a kid who is holding the shuttle
    const hint = $('serveHint');
    const sv = M.phase === 'serve' && M.sh.held >= 0 ? M.p[M.sh.held] : null;
    if (sv && sv.ctrl === 'human' && M.phaseT > 1.3) {
      const v = views[sv.i];
      const pos = v.person.root.position.clone();
      pos.y += 3.1;
      pos.project(camera);
      hint.style.left = ((pos.x + 1) / 2) * window.innerWidth + 'px';
      hint.style.top = ((1 - pos.y) / 2) * window.innerHeight + 'px';
      const n2 = G.humans.indexOf(sv.i);
      const txt2 = isTouch && G.players === 1 ? 'TAP 🏸 TO SERVE' : G.players === 2 && n2 === 1 ? 'PRESS L TO SERVE' : 'PRESS F TO SERVE';
      if (hint.textContent !== txt2) hint.textContent = txt2;
      hint.classList.remove('hidden');
    } else hint.classList.add('hidden');
  }

  function nudge(side) {
    const el = ui['p' + side] && ui['p' + side].el;
    if (!el) return;
    el.classList.remove('win');
    void el.offsetWidth;
    el.classList.add('win');
  }

  function call(text, sub, kind) {
    const el = $('call');
    el.querySelector('b').textContent = text;
    el.querySelector('small').textContent = sub || '';
    el.className = 'call ' + (kind || '');
    void el.offsetWidth;
    el.classList.add('show');
  }

  function toast(text, cls) {
    // the same line twice in a row (call him twice quickly) shows once
    if ([...$('toasts').children].some((c) => c.dataset.en === text)) return;
    const el = document.createElement('div');
    el.dataset.en = text;
    el.className = 'toast ' + (cls || '');
    el.textContent = text;
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
    setTimeout(() => el.remove(), 2400);
  }

  let bannerT = 0;
  function banner(text, kind, secs) {
    const el = $('banner');
    el.textContent = text;
    el.className = 'banner show ' + (kind || '');
    clearTimeout(bannerT);
    bannerT = setTimeout(() => el.classList.remove('show'), (secs || 1.2) * 1000);
  }

  // ---------------------------------------------------------------- screens

  function show(name) {
    G.screen = name;
    for (const id of ['title', 'pause', 'results']) $(id).classList.toggle('hidden', id !== name);
    $('hud').classList.toggle('hidden', name !== 'play' && name !== 'pause');
    $('touch').classList.toggle('hidden', !(name === 'play' && isTouch && G.players === 1));
    $('menuMute').classList.toggle('hidden', name === 'play' || name === 'pause');
    if (name !== 'play') $('serveHint').classList.add('hidden');
    document.body.classList.toggle('playing', name === 'play');
  }

  function toTitle() {
    show('title');
    startAttract();
    Kit.sound.music('title');
    renderOpts();
  }

  function renderOpts() {
    document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === G.mode)));
    document.querySelectorAll('[data-level]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.level === G.level)));
    document.querySelectorAll('[data-me]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.me === G.me)));
    $('vsLine').textContent = vsLine();
  }

  // "TEDDY vs FROGGY 🐸" under the buttons, so the kids know who they're playing
  function vsLine() {
    const foe = G.level === 'normal' ? 'FOXY 🦊' : 'FROGGY 🐸';
    const me = nameOf(G.me), bro = nameOf(Kit.roster.buddyFor(G.me));
    if (G.mode === 'doubles') return `1 PLAYER: ${me} + ${bro} vs FOXY 🦊 + FROGGY 🐸 · 2 PLAYERS: TEDDY + TOMMY vs FOXY 🦊 + FROGGY 🐸`;
    return `1 PLAYER: ${me} vs ${foe} · 2 PLAYERS: TEDDY vs TOMMY`;
  }

  function setOpt(k, v) {
    G[k] = v;
    store.set(k, v);
    renderOpts();
  }

  function togglePause() {
    if (G.screen === 'play') {
      show('pause');
      Kit.sound.music('pause');
    } else if (G.screen === 'pause') {
      show('play');
      Kit.sound.music('play');
    }
  }

  function showResults() {
    if (!M) return;
    const w = M.winner;
    const winners = views.filter((v) => v.side === w);
    const t = G.tally[G.lastKey] || [0, 0];
    $('resFace').src = portraits[winners[0].p.id] || '';
    $('resTitle').textContent = `${teamName(w)} ${winners.length > 1 ? 'WIN!' : 'WINS!'}`;
    $('resSub').textContent = `${M.score[w]} – ${M.score[1 - w]}`;
    const st = M.stats;
    $('resStats').innerHTML = '';
    const rows = [
      ['', teamName(0), teamName(1)],
      ['POINTS', M.score[0], M.score[1]],
      ['SMASHES', st.smashes[0], st.smashes[1]],
      ['WINS SO FAR', t[0], t[1]],
    ];
    rows.forEach((r, i) => r.forEach((c) => {
      const s = document.createElement('span');
      s.textContent = String(c);
      if (i === 0) s.className = 'h';
      $('resStats').appendChild(s);
    }));
    $('resBest').textContent = `LONGEST RALLY: ${st.best} HITS`;
    show('results');
    Kit.sound.music('over');
  }

  function rematch() {
    startGame();
  }

  // ---------------------------------------------------------------- menus and keys

  function bindMenus() {
    const go = (players) => () => { Kit.sound.init(); Kit.sound.click(); G.players = players; startGame(); };
    $('play1').addEventListener('click', go(1));
    $('play2').addEventListener('click', go(2));
    document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { Kit.sound.init(); Kit.sound.click(); setOpt('mode', b.dataset.mode); }));
    document.querySelectorAll('[data-level]').forEach((b) => b.addEventListener('click', () => { Kit.sound.init(); Kit.sound.click(); setOpt('level', b.dataset.level); }));
    document.querySelectorAll('[data-me]').forEach((b) => b.addEventListener('click', () => { Kit.sound.init(); Kit.sound.click(); setOpt('me', b.dataset.me); }));
    $('pauseBtn').addEventListener('click', () => { togglePause(); $('pauseBtn').blur(); });
    $('resumeBtn').addEventListener('click', togglePause);
    $('quitBtn').addEventListener('click', toTitle);
    $('againBtn').addEventListener('click', () => { Kit.sound.click(); rematch(); });
    $('menuBtn').addEventListener('click', () => { Kit.sound.click(); toTitle(); });
    $('budChip').addEventListener('click', () => { touchTapped.add('call'); });
    document.querySelectorAll('.muteBtn').forEach((b) => b.addEventListener('click', () => { Kit.sound.init(); Kit.sound.toggleMute(); updateMute(); b.blur(); }));
    Kit.sound.onMute && Kit.sound.onMute(updateMute);
    window.addEventListener('pointerdown', () => Kit.sound.init(), { capture: true });
    // touch buttons: held while the finger is down
    document.querySelectorAll('#touch [data-act]').forEach((b) => {
      const act = b.dataset.act;
      const down = (e) => { e.preventDefault(); Kit.sound.init(); touchHeld.add(act); touchTapped.add(act); b.classList.add('down'); };
      const up = (e) => { e.preventDefault(); touchHeld.delete(act); b.classList.remove('down'); };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    window.addEventListener('keydown', (e) => {
      Kit.sound.init();
      const c = e.code;
      if (c === 'KeyM') { Kit.sound.toggleMute(); updateMute(); return; }
      if (G.screen === 'play') {
        if (c === 'KeyP' || c === 'Escape') { togglePause(); e.preventDefault(); return; }
        if (!e.repeat) { held.add(c); tapped.add(c); }
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(c)) e.preventDefault();
        return;
      }
      if (G.screen === 'pause') {
        if (c === 'KeyP' || c === 'Escape' || c === 'Space') { togglePause(); e.preventDefault(); } else if (c === 'KeyQ') toTitle();
        return;
      }
      if (G.screen === 'results') {
        if (c === 'Enter' || c === 'Space') { e.preventDefault(); rematch(); } else if (c === 'Escape' || c === 'KeyQ') toTitle();
        return;
      }
      if (G.screen === 'title') {
        if (c === 'Enter' || c === 'Digit1' || c === 'Numpad1') { e.preventDefault(); go(1)(); } else if (c === 'Digit2' || c === 'Numpad2') go(2)();
        else if (c === 'ArrowLeft' || c === 'ArrowRight') setOpt('level', G.level === 'easy' ? 'normal' : 'easy');
        else if (c === 'KeyD' || c === 'ArrowUp' || c === 'ArrowDown') setOpt('mode', G.mode === 'singles' ? 'doubles' : 'singles');
        else if (c === 'KeyT') setOpt('me', G.me === 'teddy' ? 'tommy' : 'teddy');
      }
    });
    window.addEventListener('keyup', (e) => held.delete(e.code));
    window.addEventListener('blur', () => { held.clear(); touchHeld.clear(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (G.screen === 'play') togglePause();
        Kit.sound.suspend && Kit.sound.suspend();
      } else Kit.sound.resume && Kit.sound.resume();
    });
  }

  function updateMute() {
    document.querySelectorAll('.muteBtn').forEach((b) => { b.textContent = Kit.sound.isMuted() ? '🔇' : '🔊'; });
  }

  // ---------------------------------------------------------------- boot

  async function boot() {
    try {
      await Promise.race([document.fonts.load('64px Bungee'), new Promise((r) => setTimeout(r, 1500))]);
    } catch (e) { /* system fonts it is */ }
    const canvas = $('game');
    try {
      renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      $('loading').textContent = 'This browser can’t run WebGL, so the game can’t start.';
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    scene = new T.Scene();
    scene.background = new T.Color('#9fd3f5');
    scene.fog = new T.Fog('#bfe3fa', 40, 90);
    camera = new T.PerspectiveCamera(30, 1, 0.1, 200);
    scene.add(new T.HemisphereLight('#f2f8ff', '#a07a4a', 0.9));
    const sun = new T.DirectionalLight('#fff4de', 1.05);
    sun.position.set(-3, 16, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 10, bottom: -8, near: 1, far: 45 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);
    stage = window.BTStage.build(scene, K, TITLE);
    FX.init(scene);
    shut = FX.makeShuttle();
    portraits = Kit.portraits(['teddy', 'tommy', 'foxy', 'froggy'].map((id) => Kit.roster.get(id)), { size: 160 });
    document.querySelectorAll('[data-me] img').forEach((img) => { img.src = portraits[img.closest('[data-me]').dataset.me]; });
    // the name from js/title.js: 'TT' on the small line, the rest big
    const words = TITLE.split(' ');
    $('logo1').textContent = words.length > 1 ? words[0] : '';
    $('logo2').textContent = (words.length > 1 ? words.slice(1).join(' ') : TITLE).toUpperCase();
    setupHud();
    bindMenus();
    updateMute();
    resize();
    window.addEventListener('resize', resize);
    toTitle();
    $('loading').remove();
    last = performance.now();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- console hooks for testing

  window.game = {
    get state() {
      if (!M) return null;
      const s = M.sh;
      return {
        screen: G.screen, phase: M.phase, mode: M.mode, level: M.level, score: M.score.slice(), server: M.server, rally: M.rally, attract: G.attract,
        shuttle: { x: +s.x.toFixed(2), y: +s.y.toFixed(2), last: s.last, shot: s.shot, landed: s.landed },
        players: M.p.map((p) => ({ id: p.id, ctrl: p.ctrl, x: +p.x.toFixed(2), y: +p.y.toFixed(2), sw: p.sw })),
        buds: M.bud.map((b) => ({ on: b.on, phase: b.phase, returns: b.returns, x: +b.x.toFixed(2) })),
      };
    },
    get M() { return M; },
    G,
    // Advance `seconds` of game time right now (works while the pane's rAF is throttled). Every frame is updated;
    // only the last is drawn, unless drawAll.
    step(seconds = 1, drawAll = false) {
      G.testing = true;
      const n = Math.max(1, Math.round(seconds * 60));
      for (let i = 0; i < n; i++) {
        advance(1 / 60);
        render(1 / 60, drawAll || i === n - 1);
      }
      return this.state;
    },
    hold(on = true) { G.hold = on; G.testing = true; return on; },
    // game.start({ players: 1, mode: 'singles' | 'doubles', level: 'easy' | 'normal', me: 'teddy' | 'tommy' })
    start(o = {}) {
      G.testing = true;
      if (o.players) G.players = o.players;
      if (o.mode) G.mode = o.mode;
      if (o.level) G.level = o.level;
      if (o.me) G.me = o.me;
      G.server = o.server; // who serves first (random when left out)
      startGame();
      return this.state;
    },
    // Hold keys for one player for some frames: game.press(0, { swing: true }) or game.press(0, { right: true }, 30)
    press(i, keys, frames = 1) {
      G.press = G.press || {};
      G.press[i] = { keys, n: frames };
    },
    // Call your brother (or high five), as if T was pressed.
    buddy() { this.press(G.humans[0], { call: true }, 1); return this.step(1 / 60).buds; },
    // Let the computer play a kid's side (to watch a real match): game.cpu(0, 'foxy')
    cpu(i, level = 'pal') { M.p[i].ctrl = level; M.p[i].brain = brainFor(level); G.humans = G.humans.filter((h) => h !== i); },
    // The headless check of the rules (js/rules.js): physics, solver, scoring, CPU rallies, the brother.
    // game.check({ sabotage: 'drag' | 'score' | 'lazy' }) must fail. { n: 0.3 } runs fewer random cases.
    check(o = {}) { return R.check(o); },
    finish(winner = 0) {
      // jump to the end of a game, for the results screen: set the score one short and play the last point
      M.score = winner === 0 ? [10, 4] : [4, 10];
      M.phase = 'rally';
      M.sh = Object.assign(M.sh, { x: winner === 0 ? 3 : -3, y: 0.3, vx: 0, vy: -2, last: winner, landed: false, netted: false, held: -1 });
      return this.step(0.3);
    },
    toTitle, showResults, togglePause, setOpt,
    get camera() { return camera; },
  };

  function brainFor(level) {
    const tmp = R.create({ ctrl: [[level], ['froggy']] });
    return tmp.p[0].brain;
  }

  boot();
})();
