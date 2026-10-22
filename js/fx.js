/* TT Badminton: effects. The shuttlecock (cork first along its flight), its trail, its shadow on the floor, the
   EASY landing ring, word bursts (SMASH!), feather puffs, sparkles and confetti. All canvas-painted, no files. */
(function () {
  'use strict';
  const T = THREE, Kit = window.Kit;
  const { makeCanvas, toTexture, std, dotTexture } = Kit.gfx;
  let scene, dot;
  const parts = []; // particles: { mesh, vx, vy, vz, life, max, spin, grav }
  const words = [];

  function init(sc) {
    scene = sc;
    dot = dotTexture();
  }

  // ---------------------------------------------------------------- the shuttle

  function featherTexture() {
    const [c, g] = makeCanvas(256, 64);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = 'rgba(150, 160, 180, 0.8)';
    g.lineWidth = 3;
    for (let i = 0; i < 256; i += 16) {
      g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 3, 0); g.stroke();
    }
    g.fillStyle = '#ff4b5c'; // a coloured band near the cork
    g.fillRect(0, 50, 256, 7);
    return toTexture(c);
  }

  // The shuttle points along its local +x: the cork at +x, the feather skirt opening toward -x. About 0.34 m long
  // (four times the real thing, so it's easy to see).
  function makeShuttle() {
    const g = new T.Group();
    const cork = new T.Mesh(new T.SphereGeometry(0.075, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), std('#fff7ea', { roughness: 0.6 }));
    cork.rotation.z = -Math.PI / 2;
    cork.position.x = 0.02;
    cork.castShadow = true;
    g.add(cork);
    const base = new T.Mesh(new T.CylinderGeometry(0.075, 0.075, 0.05, 14), std('#ff4b5c', { roughness: 0.6 }));
    base.rotation.z = Math.PI / 2;
    base.position.x = -0.005;
    g.add(base);
    const skirt = new T.Mesh(new T.CylinderGeometry(0.075, 0.17, 0.28, 16, 1, true), new T.MeshStandardMaterial({ map: featherTexture(), side: T.DoubleSide, roughness: 0.8, transparent: true, opacity: 0.96 }));
    skirt.rotation.z = Math.PI / 2;
    skirt.position.x = -0.17;
    skirt.castShadow = true;
    g.add(skirt);
    const rim = new T.Mesh(new T.TorusGeometry(0.17, 0.012, 6, 20), std('#e8ecf5', { roughness: 0.7 }));
    rim.rotation.y = Math.PI / 2;
    rim.position.x = -0.31;
    g.add(rim);
    g.scale.setScalar(1.25);
    scene.add(g);

    // its shadow, a soft dark spot on the floor right under it
    const shadow = new T.Mesh(new T.CircleGeometry(0.28, 20), new T.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 2;
    scene.add(shadow);

    // EASY: a ring where it will come down
    const ring = new T.Mesh(new T.RingGeometry(0.42, 0.56, 28), new T.MeshBasicMaterial({ color: '#ffd400', transparent: true, opacity: 0.85, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 3;
    ring.visible = false;
    scene.add(ring);

    // a short trail of fading dots
    const trail = [];
    for (let i = 0; i < 14; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: dot, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
      s.scale.setScalar(0.16);
      scene.add(s);
      trail.push(s);
    }
    return { g, shadow, ring, trail, hist: [], angle: 0, spin: 0 };
  }

  // sh: the rules' shuttle; o: { z, ring: x or null, smash: bool, t }
  function updateShuttle(S, sh, o, dt) {
    const { g, shadow, ring, trail } = S;
    const z = o.z || 0;
    g.position.set(sh.x, Math.max(0.05, sh.y), z);
    const sp = Math.hypot(sh.vx, sh.vy);
    if (sh.landed) {
      // on the floor: lying on its side, cork down a bit
      g.position.y = 0.09;
      S.angle += ((sh.x < 0 ? -2.6 : -0.55) - S.angle) * Math.min(1, dt * 12);
    } else if (sh.held >= 0) {
      S.angle = -Math.PI / 2; // held cork down by the feathers
    } else if (sp > 0.3) {
      // cork first, with a quick wobble right after a hit
      const want = Math.atan2(sh.vy, sh.vx);
      let d = want - S.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      S.angle += d * Math.min(1, dt * 16);
    }
    g.rotation.set(0, 0, S.angle);
    S.spin += dt * (sh.landed ? 0 : 8 + sp * 0.8);
    g.rotation.x = S.spin;
    const h = Math.max(0, sh.y);
    shadow.position.set(sh.x, 0.012, z);
    const sc = 1 / (1 + h * 0.18);
    shadow.scale.setScalar(sc);
    shadow.material.opacity = 0.42 * sc;
    if (o.ring !== null && o.ring !== undefined) {
      ring.visible = true;
      ring.position.set(o.ring, 0.015, z);
      const pul = 1 + Math.sin(o.t * 8) * 0.08;
      ring.scale.setScalar(pul);
    } else ring.visible = false;
    // trail: the last positions, brighter for a smash
    if (!sh.landed && sh.held < 0) S.hist.unshift([sh.x, Math.max(0.05, sh.y), z]);
    else S.hist.length = 0;
    if (S.hist.length > trail.length) S.hist.length = trail.length;
    for (let i = 0; i < trail.length; i++) {
      const s = trail[i], p = S.hist[i];
      if (!p || i === 0) { s.material.opacity = 0; continue; }
      s.position.set(p[0], p[1], p[2]);
      const k = 1 - i / trail.length;
      s.material.opacity = (o.smash ? 0.75 : 0.35) * k;
      s.material.color.set(o.smash ? '#ffd400' : '#ffffff');
      s.scale.setScalar((o.smash ? 0.26 : 0.14) * (0.5 + k));
    }
  }

  // ---------------------------------------------------------------- particles

  function addPart(mesh, o) {
    scene.add(mesh);
    parts.push(Object.assign({ mesh, vx: 0, vy: 0, vz: 0, life: 0, max: 1, spin: 0, grav: 9, fade: true }, o));
  }

  // white feathers flying off the shuttle on a smash
  function feathers(x, y, z, n = 8) {
    for (let i = 0; i < n; i++) {
      const m = new T.Mesh(new T.PlaneGeometry(0.1, 0.22), new T.MeshBasicMaterial({ color: '#ffffff', side: T.DoubleSide, transparent: true }));
      m.position.set(x, y, z);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      addPart(m, { vx: (Math.random() - 0.5) * 5, vy: 1 + Math.random() * 3, vz: (Math.random() - 0.5) * 3, max: 1.4, spin: (Math.random() - 0.5) * 12, grav: 2.5 });
    }
  }

  // a ring of sparkles where the racket met the shuttle
  function sparks(x, y, z, color = '#ffe14a', n = 10) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const s = new T.Sprite(new T.SpriteMaterial({ map: dot, color, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      s.scale.setScalar(0.22);
      s.position.set(x, y, z + 0.1);
      addPart(s, { vx: Math.cos(a) * 3.2, vy: Math.sin(a) * 3.2, vz: 0, max: 0.4, grav: 0 });
    }
  }

  // a puff of floor dust where it lands
  function dust(x, z) {
    for (let i = 0; i < 8; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: dot, color: '#fff3d6', transparent: true, opacity: 0.7, depthWrite: false }));
      s.scale.setScalar(0.3);
      s.position.set(x, 0.1, z);
      addPart(s, { vx: (Math.random() - 0.5) * 2.5, vy: 0.6 + Math.random(), vz: (Math.random() - 0.5) * 1.5, max: 0.6, grav: 1, grow: 1.5 });
    }
  }

  const CONFETTI = ['#ffd400', '#ff3d7f', '#18d4ff', '#3fc22b', '#ff9f1c', '#b06bff', '#ffffff'];
  function confetti(x, y, z, n = 90) {
    for (let i = 0; i < n; i++) {
      const m = new T.Mesh(new T.PlaneGeometry(0.12, 0.2), new T.MeshBasicMaterial({ color: CONFETTI[i % CONFETTI.length], side: T.DoubleSide, transparent: true }));
      m.position.set(x + (Math.random() - 0.5) * 2, y, z + (Math.random() - 0.5) * 2);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      addPart(m, { vx: (Math.random() - 0.5) * 9, vy: 4 + Math.random() * 7, vz: (Math.random() - 0.5) * 5, max: 3.2 + Math.random(), spin: (Math.random() - 0.5) * 14, grav: 5, drag: 1.4 });
    }
  }

  // ---------------------------------------------------------------- word bursts (canvas text, through Kit.lang)

  function wordSprite(text, color, size) {
    const [c, g] = makeCanvas(512, 160);
    let px = size || 92;
    g.font = `${px}px ${Kit.gfx.FONT}`;
    while (px > 40 && g.measureText(text).width > 480) g.font = `${(px -= 4)}px ${Kit.gfx.FONT}`; // long words shrink to fit
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 16;
    g.strokeStyle = '#14121f';
    g.strokeText(text, 256, 84);
    g.fillStyle = color;
    g.fillText(text, 256, 80);
    const s = new T.Sprite(new T.SpriteMaterial({ map: toTexture(c), transparent: true, depthWrite: false, depthTest: false }));
    s.renderOrder = 20;
    return s;
  }

  function word(text, x, y, z, color = '#ffd400', scale = 1) {
    const s = wordSprite(Kit.lang.t(text), color);
    s.position.set(x, y, z + 0.5);
    scene.add(s);
    words.push({ s, t: 0, base: scale, y });
  }

  function update(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) {
        scene.remove(p.mesh);
        p.mesh.geometry && p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        parts.splice(i, 1);
        continue;
      }
      if (p.drag) {
        const d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vz *= d;
        if (p.vy < -2) p.vy *= d;
      }
      p.vy -= p.grav * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.mesh.position.y < 0.02) { p.mesh.position.y = 0.02; p.vx *= 0.5; p.vz *= 0.5; p.vy = 0; p.spin *= 0.5; }
      if (p.spin) { p.mesh.rotation.x += p.spin * dt; p.mesh.rotation.z += p.spin * 0.7 * dt; }
      if (p.grow) p.mesh.scale.multiplyScalar(1 + p.grow * dt);
      const k = p.life / p.max;
      if (p.fade) p.mesh.material.opacity = Math.min(1, (1 - k) * 2.2) * (p.mesh.isSprite ? 0.9 : 1);
    }
    for (let i = words.length - 1; i >= 0; i--) {
      const w = words[i];
      w.t += dt;
      const t = w.t;
      const pop = t < 0.15 ? 0.4 + (t / 0.15) * 1.0 : t < 0.25 ? 1.4 - ((t - 0.15) / 0.1) * 0.4 : 1;
      w.s.scale.set(3.2 * pop * w.base, 1.0 * pop * w.base, 1);
      w.s.position.y = w.y + t * 0.6;
      w.s.material.opacity = t > 0.9 ? Math.max(0, 1 - (t - 0.9) / 0.4) : 1;
      if (t > 1.3) {
        scene.remove(w.s);
        w.s.material.map.dispose();
        w.s.material.dispose();
        words.splice(i, 1);
      }
    }
  }

  function clear() {
    for (const p of parts) scene.remove(p.mesh);
    parts.length = 0;
    for (const w of words) scene.remove(w.s);
    words.length = 0;
  }

  window.BTFx = { init, makeShuttle, updateShuttle, feathers, sparks, dust, confetti, word, update, clear };
})();
