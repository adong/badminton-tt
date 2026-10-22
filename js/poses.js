/* TT Badminton: badminton poses and the racket, on top of the kit's people.
   The racket goes in the hand nearer the camera: the right hand for side 0 (facing +x), the left for side 1.
   BTPoses.pose() eases every channel of a kit person toward a named pose; the kit's own signature moves (boxing,
   jump shot, peace) are used for hellos and wins. */
(function () {
  'use strict';
  const T = THREE, Kit = window.Kit;
  const { makeCanvas, toTexture, std, mesh } = Kit.gfx;

  // ---------------------------------------------------------------- the racket

  let strings = null;
  function stringTexture() {
    if (strings) return strings;
    const [c, g] = makeCanvas(128, 128);
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 2.5;
    for (let i = 6; i < 128; i += 12) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke();
    }
    strings = toTexture(c);
    return strings;
  }

  // A badminton racket about 0.8 m long: a grip, a thin shaft and a small oval head. The group's origin is the wrist,
  // the head points along -y, and its `head` child marks the middle of the strings.
  function racket(color) {
    const g = new T.Group();
    const frame = std(color, { roughness: 0.4, metalness: 0.2 });
    const grip = std('#ffffff', { roughness: 0.9 });
    mesh(new T.BoxGeometry(0.075, 0.24, 0.075), grip, 0, -0.06, 0, g);
    mesh(new T.CylinderGeometry(0.018, 0.018, 0.34, 6), std('#d8dde6', { roughness: 0.3, metalness: 0.6 }), 0, -0.35, 0, g);
    const ring = mesh(new T.TorusGeometry(0.15, 0.024, 8, 24), frame, 0, -0.66, 0, g);
    ring.scale.set(0.82, 1.15, 1);
    const net = new T.Mesh(new T.CircleGeometry(0.145, 20), new T.MeshBasicMaterial({ map: stringTexture(), transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false }));
    net.position.set(0, -0.66, 0);
    net.scale.set(0.82, 1.15, 1);
    g.add(net);
    const head = new T.Object3D();
    head.position.set(0, -0.66, 0);
    g.add(head);
    g.head = head;
    return g;
  }

  // Give a kit person a racket, in the camera-side hand.
  function arm(p, side, color) {
    const r = racket(color);
    p.racketArm = side === 0 ? p.armR : p.armL;
    p.freeArm = side === 0 ? p.armL : p.armR;
    p.rSign = side === 0 ? 1 : -1; // the sign that swings the racket arm outward (rotation.z)
    r.position.y = -0.68;
    r.rotation.x = 1;
    p.racketArm.add(r);
    p.racket = r;
    return r;
  }

  // ---------------------------------------------------------------- driving the rig

  const ease = (o, prop, v, k) => { o[prop] += (v - o[prop]) * k; };

  // targets: rx / fx (racket / free arm forward swing), rz / fz (outward), wr (the wrist: racket tilt), lL / lR (legs),
  // sp (leg spread), lean, twist, head, crouch (drops the rig), bob.
  function drive(p, t, k) {
    const s = p.rSign || 1;
    const ra = p.racketArm || p.armR, fa = p.freeArm || p.armL;
    ease(ra.rotation, 'x', t.rx || 0, k);
    if (p.racket) ease(p.racket.rotation, 'x', t.wr !== undefined ? t.wr : 1, k);
    ease(ra.rotation, 'z', s * (t.rz || 0), k);
    ease(fa.rotation, 'x', t.fx || 0, k);
    ease(fa.rotation, 'z', -s * (t.fz || 0), k);
    if (t.lL !== undefined) ease(p.legL.rotation, 'x', t.lL, k);
    if (t.lR !== undefined) ease(p.legR.rotation, 'x', t.lR, k);
    ease(p.legL.rotation, 'z', -(t.sp || 0), k);
    ease(p.legR.rotation, 'z', t.sp || 0, k);
    ease(p.hips.rotation, 'x', t.lean !== undefined ? t.lean : -0.1, k);
    ease(p.hips.rotation, 'y', (t.twist || 0) * s, k);
    ease(p.head.rotation, 'x', t.head || 0, k);
    ease(p.head.rotation, 'y', -(t.twist || 0) * s * 0.6, k);
    ease(p.rig.position, 'y', 0.55 - (t.crouch || 0), k);
    if (t.bob !== undefined) p.hips.position.y = p.hipY + t.bob;
  }

  function legsRun(p, ph, k) {
    const sn = Math.sin(ph);
    ease(p.legL.rotation, 'x', sn * 0.9, k);
    ease(p.legR.rotation, 'x', -sn * 0.9, k);
    return Math.abs(Math.cos(ph)) * 0.08;
  }

  const smooth = (a, b, u) => a + (b - a) * (u * u * (3 - 2 * u));
  function curve(keys, u) {
    if (u <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (u <= keys[i][0]) {
        const [u0, v0] = keys[i - 1], [u1, v1] = keys[i];
        return smooth(v0, v1, (u - u0) / (u1 - u0));
      }
    }
    return keys[keys.length - 1][1];
  }

  // Swing shapes over u = 0..1 of the whole swing (the racket is live around u = 0.15..0.6).
  const SWINGS = {
    // overhead: racket cocked behind the head, then a whip forward and down (clears, drops, smashes)
    over: {
      wr: [[0, 0.6], [0.1, 1.6], [0.32, 0.3], [0.6, 0.1], [1, 0.8]],
      rx: [[0, 2.5], [0.1, 3.5], [0.32, 2.8], [0.6, 0.9], [1, 0.6]],
      rz: [[0, 0.25], [0.6, 0.3], [1, 0.3]],
      twist: [[0, 0], [0.1, -0.55], [0.6, 0.55], [1, 0.1]],
      fx: [[0, 2.3], [0.3, 2.5], [0.6, 0.6], [1, 0.5]],
      crouch: 0,
    },
    // a flat drive at chest height
    side: {
      wr: [[0, 1.4], [0.1, 1.0], [0.32, 1.5], [0.6, 1.6], [1, 1.2]],
      rx: [[0, 0.9], [0.1, 0.4], [0.32, 1.3], [0.6, 2.0], [1, 0.8]],
      rz: [[0, 0.5], [0.1, 1.3], [0.32, 0.7], [0.6, 0.3], [1, 0.4]],
      twist: [[0, 0], [0.1, -0.7], [0.6, 0.6], [1, 0.1]],
      fx: [[0, 0.7], [1, 0.7]],
      crouch: 0.1,
    },
    // underhand: a lift from low, or the serve
    under: {
      wr: [[0, 0.4], [0.1, 0.2], [0.32, 0.7], [0.6, 1.2], [1, 1.1]],
      rx: [[0, 0.2], [0.1, -1.0], [0.32, 0.4], [0.6, 2.2], [1, 1.0]],
      rz: [[0, 0.3], [0.6, 0.35], [1, 0.35]],
      twist: [[0, 0], [0.1, -0.5], [0.6, 0.45], [1, 0.1]],
      fx: [[0, 0.9], [0.25, 0.9], [0.4, 0.3], [1, 0.4]],
      crouch: 0.24,
    },
  };

  // One frame of a player. st: { mode, u (swing 0..1), kind, ph (run phase), air, id, t (pose clock), cel }.
  // modes: ready, run, swing, serve (holding the shuttle), air, celebrate / hello (st.cel), sad, give, five.
  function pose(p, st, k) {
    const ph = st.ph || 0;
    if (st.mode === 'celebrate' || st.mode === 'hello') {
      const cel = st.cel || 'wave';
      Kit.people.pose(p, cel === 'boxing' ? st.t * 6 : st.t * 5, cel, k);
      p.legL.rotation.x *= 0.3;
      p.legR.rotation.x *= 0.3;
      if (p.racket) p.racket.visible = cel === 'wave';
      return;
    }
    if (p.racket) p.racket.visible = true;
    if (p.fingers) for (const f of p.fingers) f.visible = false;
    // ready: knees bent, racket up in front
    const t = { rx: 1.2, wr: 1.6, rz: 0.35, fx: 0.8, fz: 0.3, sp: 0.14, lean: -0.2, crouch: 0.08, lL: 0.25, lR: -0.15, bob: 0 };
    if (st.mode === 'run') {
      const bob = legsRun(p, ph, k);
      t.lL = t.lR = undefined;
      Object.assign(t, { fx: Math.sin(ph) * 0.7, lean: -0.24, crouch: 0.02, sp: 0.03, bob, rx: 1.0 });
    } else if (st.mode === 'air') {
      Object.assign(t, { lL: 0.75, lR: -0.35, sp: 0.1, fx: 2.3, fz: 0.4, rx: 2.8, wr: 1.4, rz: 0.3, crouch: 0, lean: -0.05, head: -0.3 });
    } else if (st.mode === 'serve') {
      // the shuttle held out in the free hand, the racket back and low
      Object.assign(t, { fx: 1.1, fz: 0.15, rx: -0.6, wr: 0.5, rz: 0.4, lean: -0.15, crouch: 0.1, lL: 0.35, lR: -0.2, head: 0.2 });
    } else if (st.mode === 'sad') {
      Object.assign(t, { rx: 0.15, wr: 0.6, rz: 0.15, fx: 0.1, fz: 0.1, lean: -0.34, head: 0.45, crouch: 0.05, lL: 0, lR: 0, sp: 0.04 });
    } else if (st.mode === 'give') {
      Object.assign(t, { fx: 1.6, fz: 0.1, rx: 0.5, lean: -0.1 });
    } else if (st.mode === 'five') {
      // a high five: the free hand right up
      Object.assign(t, { fx: 3.0, fz: -0.25, rx: 0.6, wr: 1.0, lean: 0.05, crouch: 0, head: -0.25, lL: 0, lR: 0 });
    }
    if (st.mode === 'swing') {
      const sw = SWINGS[st.kind] || SWINGS.side;
      const u = st.u;
      t.rx = curve(sw.rx, u);
      t.wr = curve(sw.wr, u);
      t.rz = curve(sw.rz, u);
      t.twist = curve(sw.twist, u);
      t.fx = curve(sw.fx, u);
      t.crouch = sw.crouch;
      if (st.air) Object.assign(t, { lL: 0.75, lR: -0.35, crouch: 0 });
      // Teddy's smash starts from his basketball jump shot: both hands up overhead
      if (st.shot === 'smash' && st.id === 'teddy' && u < 0.3) Object.assign(t, { rx: 2.7, rz: 0.15, fx: 2.6, fz: 0.15, twist: 0, head: -0.3 });
      if (st.run) {
        const bob = legsRun(p, ph, k);
        t.lL = t.lR = undefined;
        t.bob = bob;
      }
    }
    drive(p, t, k);
  }

  window.BTPoses = { racket, arm, drive, pose };
})();
