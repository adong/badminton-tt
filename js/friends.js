/* TT Go: the CPU friends. The kit has neither yet, so this game adds them as roster entries on the kit's bear head:
     🐸 Froggy (🐣 EASY): green, with two big eyes on top of his head and a wide smile.
     🦊 Foxy (🔥 NORMAL, and the lessons): orange fur, a white muzzle, pointy ears with dark tips, a bushy tail
        (the same Foxy as TT Chess).
   Kit.people.build is wrapped so anything with look.fox or look.frog gets the extras, the menu portraits too.
   Move these into the kit when another game wants them. */
(function () {
  'use strict';
  const T = THREE;
  const add = (entry) => {
    if (!Kit.roster.get(entry.id)) Kit.roster.list.push(entry);
  };
  add({
    id: 'foxy', name: 'FOXY', tag: '#ff8a1f',
    look: { head: 'bear', fox: true, skin: '#f07a2a', muzzle: '#fff4e6', shirt: 'hoodie', top: '#3fbf8a', print: 'star', bottom: '#2b3a63', shorts: true, shoes: '#ffd400' },
  });
  add({
    id: 'froggy', name: 'FROGGY', tag: '#5ed15e',
    look: { head: 'bear', frog: true, skin: '#5ccf4f', muzzle: '#b8f07a', shirt: 'tee', top: '#ffd23f', print: 'bolt', bottom: '#2f6fd6', shorts: true, shoes: '#ff6f91' },
  });

  const build = Kit.people.build;
  Kit.people.build = function (look) {
    const p = build(look);
    if (!look || (!look.fox && !look.frog)) return p;
    const std = Kit.gfx.std;
    const fur = std(look.skin, { roughness: 0.7 }), white = std('#fff4e6', { roughness: 0.7 }), dark = std('#2a1a12', { roughness: 0.7 });
    // hide the bear's round ears (the boxes on top of the head)
    p.head.children.forEach((m) => {
      if (m.position.y > 0.25) m.visible = false;
    });
    if (look.fox) {
      for (const sx of [-1, 1]) {
        const ear = new T.Mesh(new T.ConeGeometry(0.12, 0.3, 4), fur);
        ear.position.set(sx * 0.18, 0.36, 0.02);
        ear.rotation.set(0, Math.PI / 4, sx * -0.18);
        p.head.add(ear);
        const tip = new T.Mesh(new T.ConeGeometry(0.06, 0.12, 4), dark);
        tip.position.set(sx * 0.2, 0.47, 0.02);
        tip.rotation.set(0, Math.PI / 4, sx * -0.18);
        p.head.add(tip);
      }
      const chin = new T.Mesh(new T.BoxGeometry(0.36, 0.12, 0.06), white);
      chin.position.set(0, -0.2, -0.23);
      p.head.add(chin);
      const tail = new T.Group();
      tail.position.set(0, 0.08, 0.22);
      p.hips.add(tail);
      [[0, 0, 0.12, 0.13, fur], [0, 0.12, 0.3, 0.15, fur], [0, 0.3, 0.42, 0.12, white]].forEach(([x, y, z, r, m]) => {
        const s = new T.Mesh(new T.SphereGeometry(r, 10, 8), m);
        s.position.set(x, y, z);
        s.scale.set(1, 1, 1.4);
        tail.add(s);
      });
      tail.rotation.x = -0.3;
      p.tail = tail;
    }
    if (look.frog) {
      // the bear's little eyes go; two big ones sit on top, and a wide pink smile
      p.head.children.forEach((m) => {
        if (Math.abs(m.position.y - 0.07) < 0.01 && Math.abs(Math.abs(m.position.x) - 0.12) < 0.01) m.visible = false;
      });
      const eyeWhite = std('#ffffff', { roughness: 0.4 }), pupil = std('#14121f', { roughness: 0.3 });
      for (const sx of [-1, 1]) {
        const bump = new T.Mesh(new T.SphereGeometry(0.13, 14, 10), fur);
        bump.position.set(sx * 0.16, 0.27, -0.06);
        p.head.add(bump);
        const eye = new T.Mesh(new T.SphereGeometry(0.1, 14, 10), eyeWhite);
        eye.position.set(sx * 0.16, 0.29, -0.13);
        p.head.add(eye);
        const dot = new T.Mesh(new T.SphereGeometry(0.05, 10, 8), pupil);
        dot.position.set(sx * 0.16, 0.29, -0.215);
        p.head.add(dot);
      }
      const smile = new T.Mesh(new T.BoxGeometry(0.34, 0.04, 0.03), std('#ff6f91', { roughness: 0.6 }));
      smile.position.set(0, -0.13, -0.315);
      p.head.add(smile);
    }
    return p;
  };
})();
