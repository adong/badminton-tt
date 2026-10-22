/* TT Badminton: the sports hall. A wooden floor, a green court with its white lines, the net on two posts, a back wall
   with bunting, the game's own banner and a scoreboard, and a little crowd of blocky fans on the benches who jump
   when a point is won. Everything is painted on canvases; there are no image files. */
(function () {
  'use strict';
  const T = THREE, Kit = window.Kit;
  const { makeCanvas, toTexture, std, mesh, roundRect, FONT } = Kit.gfx;

  function floorTexture() {
    const [c, g] = makeCanvas(512, 512);
    const tones = ['#d9a664', '#cf9a57', '#e0b071', '#d49f5f', '#c99251'];
    for (let r = 0; r < 16; r++) {
      let x = -((r * 97) % 200);
      while (x < 512) {
        const w = 160 + ((r * 31 + x) % 120);
        g.fillStyle = tones[(r + Math.floor(x / 50)) % tones.length];
        g.fillRect(x, r * 32, w, 32);
        g.fillStyle = 'rgba(80, 45, 10, 0.25)';
        g.fillRect(x, r * 32, 2, 32);
        x += w;
      }
      g.fillStyle = 'rgba(80, 45, 10, 0.3)';
      g.fillRect(0, r * 32, 512, 2);
    }
    return toTexture(c, [8, 8]);
  }

  // The court, seen from above: x along the canvas (net in the middle), z down it.
  function courtTexture(K, W) {
    const L = K.HALF + 0.5, ppm = 80;
    const [c, g] = makeCanvas(Math.round(2 * L * ppm), Math.round(2 * (W + 0.45) * ppm));
    const X = (x) => (x + L) * ppm, Z = (z) => (z + W + 0.45) * ppm;
    g.fillStyle = '#2f9e6a';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#27895b'; // a darker playing area inside the lines
    g.fillRect(X(-K.HALF), Z(-W), X(K.HALF) - X(-K.HALF), Z(W) - Z(-W));
    g.strokeStyle = '#ffffff';
    g.lineWidth = 0.05 * ppm;
    const line = (x0, z0, x1, z1) => { g.beginPath(); g.moveTo(X(x0), Z(z0)); g.lineTo(X(x1), Z(z1)); g.stroke(); };
    line(-K.HALF, -W, K.HALF, -W);
    line(-K.HALF, W, K.HALF, W);
    line(-K.HALF, -W * 0.83, K.HALF, -W * 0.83);
    line(-K.HALF, W * 0.83, K.HALF, W * 0.83);
    for (const s of [-1, 1]) {
      line(s * K.HALF, -W, s * K.HALF, W);
      line(s * (K.HALF - 0.76), -W, s * (K.HALF - 0.76), W);
      line(s * K.SHORT, -W, s * K.SHORT, W);
      line(s * K.SHORT, 0, s * K.HALF, 0);
    }
    return toTexture(c);
  }

  function netTexture() {
    const [c, g] = makeCanvas(256, 64);
    g.clearRect(0, 0, 256, 64);
    g.strokeStyle = 'rgba(20, 20, 30, 0.85)';
    g.lineWidth = 2;
    for (let i = 0; i <= 256; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke(); }
    for (let j = 0; j <= 64; j += 8) { g.beginPath(); g.moveTo(0, j); g.lineTo(256, j); g.stroke(); }
    return toTexture(c, [10, 1]);
  }

  function bannerTexture(title) {
    const [c, g] = makeCanvas(1024, 192);
    g.fillStyle = '#1a3c8f';
    roundRect(g, 4, 4, 1016, 184, 30);
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = '#ffd400';
    g.stroke();
    g.font = `104px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 14;
    g.strokeStyle = '#14121f';
    g.strokeText('🏸 ' + title.toUpperCase() + ' 🏸', 512, 102);
    g.fillStyle = '#ffffff';
    g.fillText('🏸 ' + title.toUpperCase() + ' 🏸', 512, 100);
    return toTexture(c);
  }

  function build(scene, K, title) {
    const W = 2.6; // half the court's width (z)
    const root = new T.Group();
    scene.add(root);
    // floor
    const floor = mesh(new T.PlaneGeometry(60, 30), new T.MeshStandardMaterial({ map: floorTexture(), roughness: 0.55 }), 0, 0, -3, root, false);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    // court
    const L = K.HALF + 0.5;
    const court = mesh(new T.PlaneGeometry(2 * L, 2 * (W + 0.45)), new T.MeshStandardMaterial({ map: courtTexture(K, W), roughness: 0.75 }), 0, 0.004, 0, root, false);
    court.rotation.x = -Math.PI / 2;
    court.receiveShadow = true;
    // the net: two posts, the mesh and its white tape
    const postMat = std('#e8e8ee', { roughness: 0.4, metalness: 0.4 });
    for (const z of [-W - 0.12, W + 0.12]) {
      mesh(new T.CylinderGeometry(0.045, 0.045, K.NET_H + 0.02, 10), postMat, 0, (K.NET_H + 0.02) / 2, z, root);
      mesh(new T.CylinderGeometry(0.16, 0.2, 0.08, 14), std('#3a3f52'), 0, 0.04, z, root);
    }
    const netH = 0.76;
    // seen from the side a real net is edge-on, so a strip of it faces the camera too: it shows exactly how high it is
    const face = mesh(new T.PlaneGeometry(0.42, netH), new T.MeshBasicMaterial({ map: netTexture(), color: '#ffffff', transparent: true, side: T.DoubleSide, depthWrite: false }), 0, K.NET_H - netH / 2, 0.02, root, false);
    face.material.map = face.material.map.clone();
    face.material.map.repeat.set(1, 1);
    face.material.map.needsUpdate = true;
    mesh(new T.PlaneGeometry(0.42, netH), new T.MeshBasicMaterial({ color: '#14121f', transparent: true, opacity: 0.22, depthWrite: false }), 0, K.NET_H - netH / 2, 0.01, root, false);
    mesh(new T.BoxGeometry(0.46, 0.08, 0.05), std('#ffffff', { roughness: 0.6 }), 0, K.NET_H - 0.04, 0.03, root, false);
    const net = mesh(new T.PlaneGeometry(2 * W + 0.24, netH), new T.MeshBasicMaterial({ map: netTexture(), transparent: true, side: T.DoubleSide, depthWrite: false }), 0, K.NET_H - netH / 2, 0, root, false);
    net.rotation.y = Math.PI / 2;
    mesh(new T.BoxGeometry(0.04, 0.07, 2 * W + 0.24), std('#ffffff', { roughness: 0.6 }), 0, K.NET_H - 0.035, 0, root);
    mesh(new T.BoxGeometry(0.02, 0.03, 2 * W + 0.24), std('#ffffff', { roughness: 0.6 }), 0, K.NET_H - netH, 0, root, false);

    // the back wall: two-tone paint, bunting, the banner and a scoreboard
    const wallZ = -9;
    mesh(new T.PlaneGeometry(60, 16), std('#7fc4ef', { roughness: 0.9 }), 0, 8, wallZ, root, false);
    mesh(new T.PlaneGeometry(60, 2.2), std('#3d8bff', { roughness: 0.9 }), 0, 1.1, wallZ + 0.01, root, false);
    const banner = mesh(new T.PlaneGeometry(8, 1.5), new T.MeshBasicMaterial({ map: bannerTexture(title), transparent: true }), -6.8, 5.5, wallZ + 0.05, root, false);
    banner.renderOrder = 1;
    const flagColors = ['#ff3d7f', '#ffd400', '#18d4ff', '#3fc22b', '#ff9f1c', '#b06bff'];
    for (let i = 0; i < 44; i++) {
      const x = -22 + i, y = 9.4 + Math.cos((i / 44) * Math.PI * 6) * 0.25;
      const f = mesh(new T.CircleGeometry(0.42, 3), new T.MeshBasicMaterial({ color: flagColors[i % flagColors.length], side: T.DoubleSide }), x, y, wallZ + 0.1, root, false);
      f.rotation.z = -Math.PI / 2;
    }
    // scoreboard
    const [sc, sg] = makeCanvas(512, 256);
    const scoreTex = toTexture(sc);
    const board = mesh(new T.PlaneGeometry(4.4, 2.2), new T.MeshBasicMaterial({ map: scoreTex }), 7.0, 5.5, wallZ + 0.05, root, false);
    mesh(new T.BoxGeometry(4.7, 2.5, 0.2), std('#22242f'), 7.0, 5.5, wallZ - 0.06, root, false);
    function drawScore(a, b, names) {
      sg.fillStyle = '#101320';
      sg.fillRect(0, 0, 512, 256);
      sg.fillStyle = '#2a7bd6';
      sg.fillRect(10, 10, 241, 236);
      sg.fillStyle = '#e53950';
      sg.fillRect(261, 10, 241, 236);
      sg.textAlign = 'center';
      sg.textBaseline = 'middle';
      sg.fillStyle = '#ffe14a';
      sg.font = `130px ${FONT}`;
      sg.fillText(String(a), 130, 140);
      sg.fillText(String(b), 382, 140);
      sg.fillStyle = '#ffffff';
      sg.font = `30px ${FONT}`;
      sg.fillText((names && names[0]) || '', 130, 44);
      sg.fillText((names && names[1]) || '', 382, 44);
      scoreTex.needsUpdate = true;
    }
    drawScore(0, 0, ['', '']);

    // benches with fans
    const fans = [];
    const shirt = ['#ff6b6b', '#ffd23f', '#4dabf7', '#69db7c', '#b197fc', '#ffa94d', '#f783ac', '#ffffff'];
    const skins = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
    for (let row = 0; row < 3; row++) {
      const y = 0.45 + (2 - row) * 0.55;
      mesh(new T.BoxGeometry(34, 0.25, 0.8), std('#c95b3a', { roughness: 0.8 }), 0, y, wallZ + 0.6 + row * 0.9, root);
      mesh(new T.BoxGeometry(34, y, 0.8), std('#8a3d28', { roughness: 0.9 }), 0, y / 2, wallZ + 0.6 + row * 0.9, root, false);
      for (let i = 0; i < 14; i++) {
        if ((i * 7 + row * 3) % 5 === 0) continue;
        const x = -16 + i * 2.4 + row * 0.9 + ((i * 13) % 7) * 0.12;
        const fan = new T.Group();
        fan.position.set(x, y + 0.12, wallZ + 0.6 + row * 0.9);
        const body = mesh(new T.BoxGeometry(0.55, 0.7, 0.4), std(shirt[(i + row * 3) % shirt.length], { roughness: 0.8 }), 0, 0.35, 0, fan);
        mesh(new T.BoxGeometry(0.42, 0.42, 0.42), std(skins[(i * 3 + row) % skins.length], { roughness: 0.8 }), 0, 0.95, 0, fan);
        mesh(new T.BoxGeometry(0.44, 0.12, 0.44), std(['#2b1a10', '#5a3a20', '#14121f', '#c9a25a'][(i + row) % 4]), 0, 1.18, 0, fan);
        // arms hang from the shoulders, so they swing up from there
        const armL = new T.Group(), armR = new T.Group();
        armL.position.set(-0.35, 0.66, 0);
        armR.position.set(0.35, 0.66, 0);
        mesh(new T.BoxGeometry(0.14, 0.48, 0.14), body.material, 0, -0.22, 0, armL);
        mesh(new T.BoxGeometry(0.14, 0.48, 0.14), body.material, 0, -0.22, 0, armR);
        fan.add(armL, armR);
        root.add(fan);
        fans.push({ g: fan, armL, armR, y0: fan.position.y, ph: Math.random() * 6, jump: 0 });
      }
    }

    // a soft ceiling light glow (keeps the top of the frame from being empty)
    const glow = new T.Mesh(new T.PlaneGeometry(60, 6), new T.MeshBasicMaterial({ color: '#d8f0ff', transparent: true, opacity: 0.5 }));
    glow.position.set(0, 14.5, wallZ + 0.2);
    root.add(glow);

    let cheerT = 0, cheerSide = -1;
    return {
      root, W, wallZ,
      score: drawScore,
      cheer(side) { cheerT = 1.6; cheerSide = side; },
      update(dt, t) {
        cheerT = Math.max(0, cheerT - dt);
        for (const f of fans) {
          const go = cheerT > 0 && (cheerSide < 0 || (cheerSide === 0 ? f.g.position.x < 4 : f.g.position.x > -4));
          const hop = go ? Math.abs(Math.sin(t * 9 + f.ph)) * 0.3 : Math.max(0, Math.sin(t * 1.5 + f.ph)) * 0.03;
          f.g.position.y = f.y0 + hop;
          const up = go ? 2.8 : 0.15;
          f.armL.rotation.z += (-up - f.armL.rotation.z) * Math.min(1, dt * 8);
          f.armR.rotation.z += (up - f.armR.rotation.z) * Math.min(1, dt * 8);
        }
      },
    };
  }

  window.BTStage = { build };
})();
