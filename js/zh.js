/* 中文 for TT Badminton: the words on the page, the calls, toasts, the word bursts on the court and the ? panel
   (Kit.lang, from kit/lang.js). The kids' names, Foxy and Froggy, and the game's name and logo stay in English. */
(function () {
  const L = Kit.lang;
  L.keep([
    'TEDDY', 'TOMMY', 'FOXY', 'FROGGY', 'Teddy', 'Tommy', 'TT Badminton', 'TT', 'BADMINTON', 'Claude Code', 'Esc', 'Enter', '1P', '2P', '1P + 2P',
  ]);

  L.add({
    'CPU': '电脑', '1P + CPU': '1P + 电脑',
    // title screen
    'Clear, drop shot and SMASH! First to 11 wins.': '高远球、吊球，还有扣杀！先得 11 分就赢。',
    '▶ 1 PLAYER': '▶ 单人', 'you vs the computer': '你和电脑比赛', '👫 2 PLAYERS': '👫 双人', 'one keyboard, two kids': '一个键盘，两人一起玩',
    'GAME': '比赛', 'Game': '比赛', 'SINGLES': '单打', 'one on one': '一对一', 'DOUBLES': '双打', 'the brothers together': '兄弟俩一起打',
    'LEVEL': '难度', 'Level': '难度', 'slow shuttle, big racket': '球慢，球拍大', 'full speed': '全速',
    '1 PLAYER': '单人', '1 player': '单人', 'big smash': '大力扣杀', 'quick at the net': '网前快手',
    'PLAYER 1': '玩家 1', 'PLAYER 2': '玩家 2', 'run': '跑', 'jump': '跳', 'swing · serve': '挥拍 · 发球',
    'Jump + swing at a high shuttle for a SMASH. Run at the net while you swing for a soft DROP SHOT.':
      '球高的时候跳起来挥拍，就是扣杀！一边往网前跑一边挥拍，就是轻轻的吊球。',
    "Hold ◀ ▶ to run, ⤒ to jump and 🏸 to swing. Jump and swing for a SMASH, run at the net for a DROP SHOT. Tap your brother's face to call him in. Two players need a keyboard.":
      '按住 ◀ ▶ 跑，⤒ 跳，🏸 挥拍。跳起来挥拍是扣杀，往网前跑着挥拍是吊球。点兄弟的头像叫他来帮忙。双人要用键盘。',
    // the match: HUD, buttons, tooltips
    'Pause (P)': '暂停 (P)', 'Pause': '暂停', 'Sound (M)': '声音 (M)', 'Sound on / off (M)': '声音 开 / 关 (M)', 'Sound on or off': '声音开关',
    'Call your brother (T)': '叫兄弟来帮忙 (T)', 'Call your brother': '叫兄弟来帮忙',
    'Run left': '向左跑', 'Run right': '向右跑', 'JUMP': '跳', 'SWING': '挥拍', 'HIGH FIVE': '击掌',
    'FIRST TO 11': '先得 11 分', 'FIRST TO 11!': '先得 11 分！', 'GAME POINT': '赛点', 'GAME POINT!': '赛点！', 'WIN BY 2': '要领先 2 分', 'GAME!': '比赛结束！',
    'PRESS F TO SERVE': '按 F 发球', 'PRESS L TO SERVE': '按 L 发球', 'TAP 🏸 TO SERVE': '点 🏸 发球',
    // word bursts on the court (drawn on a canvas, through Kit.lang.t)
    'SMASH!': '扣杀！', 'DROP SHOT!': '吊球！', 'NET SHOT!': '放网！', 'SAVED!': '救起来啦！',
    'HIGH FIVE! ✋': '击掌！✋',
    // pause and results
    '▶ RESUME': '▶ 继续', 'MENU': '菜单',
    'P · Esc · Space to resume · Q for the menu · M sound': 'P · Esc · 空格 继续 · Q 回菜单 · M 声音',
    '↻ PLAY AGAIN': '↻ 再玩一次', 'Enter play again · Esc menu': 'Enter 再玩一次 · Esc 回菜单',
    'POINTS': '得分', 'SMASHES': '扣杀', 'WINS SO FAR': '一共赢了',
    // other screens
    'LOADING…': '加载中…', '↻ Turn sideways for a bigger court!': '↻ 横过来，球场更大！',
    'This browser can’t run WebGL, so the game can’t start.': '这个浏览器跑不了 WebGL，游戏开不了。',
    // the ? panel (js/keys.js)
    'P or Esc · M': 'P 或 Esc · M',
    'In 1 player both sets of keys work, and Space swings too. Jump and swing at a high shuttle for a SMASH; run at the net while you swing for a soft DROP SHOT. When both brothers play, T is a high five.':
      '单人时两套按键都能用，空格也能挥拍。球高的时候跳起来挥拍是扣杀；往网前跑着挥拍是轻轻的吊球。兄弟俩都在场上时，T 是击掌。',
    "Hold ◀ ▶ to run, then ⤒ JUMP and 🏸 SWING. Tap your brother's face to call him.": '按住 ◀ ▶ 跑，⤒ 跳，🏸 挥拍。点兄弟的头像叫他来帮忙。',
  });

  // a name (or two, with &), with a space after it when it stays in English letters
  const who = (n) => n.split(' & ').map((x) => L.t(x)).join(' 和 ');
  const TREAT = { 'ICE CREAM': '冰淇淋', WATER: '水', 'JUICE BOX': '果汁', COOKIE: '饼干', WATERMELON: '西瓜', BANANA: '香蕉' };
  const WHY = { 'OUT!': '出界！', 'INTO THE NET!': '下网！', 'TOO SHORT!': '没过网！' };

  L.rule(/^(TEDDY|TOMMY|FOXY|FROGGY) & (TEDDY|TOMMY|FOXY|FROGGY)$/, '$1 和 $2');
  // calls and banners
  L.rule(/^POINT (.+)!$/, (m, n) => `${who(n)} 得分！`);
  L.rule(/^(OUT!|INTO THE NET!|TOO SHORT!) POINT (.+)!$/, (m, w, n) => `${WHY[w]}${who(n)} 得分！`);
  L.rule(/^(.+) WINS?!$/, (m, n) => `${who(n)} 赢啦！`);
  L.rule(/^WHAT A RALLY! (\d+) HITS!$/, '好长的回合！打了 $1 拍！');
  L.rule(/^LONGEST RALLY: (\d+) HITS?$/, '最长回合：$1 拍');
  // the brother
  L.rule(/^CALL (.+)$/, (m, n) => `叫 ${L.t(n)}`);
  L.rule(/^(.+) IS HERE!$/, (m, n) => `${L.t(n)} 来啦！`);
  L.rule(/^(\S+) (ICE CREAM|WATER|JUICE BOX|COOKIE|WATERMELON|BANANA) FROM (.+)!$/, (m, e, t, n) => `${e} ${L.t(n)} 送来的${TREAT[t]}！`);
  L.rule(/^(.+) SAYS: I'LL GET THE NEXT ONE!$/, (m, n) => `${L.t(n)} 说：下一球我来接！`);
  L.rule(/^(.+) SAYS: I'LL GET THE NEXT (\d+)!$/, (m, n, k) => `${L.t(n)} 说：接下来 ${k} 球我来接！`);
  L.rule(/^(.+) GOT IT!$/, (m, n) => `${L.t(n)} 接到啦！`);
  L.rule(/^(.+) GOT IT! (\d+) MORE$/, (m, n, k) => `${L.t(n)} 接到啦！还有 ${k} 球`);
  // who plays whom, under the title buttons
  L.rule(/^1 PLAYER: (.+?) vs (.+?) · 2 PLAYERS: (.+?) vs (.+)$/, (m, a, b, c, d) => `单人：${vs(a)} 对 ${vs(b)} · 双人：${vs(c)} 对 ${vs(d)}`);
  const vs = (s) => s.split(' + ').map((x) => x.replace(/^(\S+)/, (n) => L.t(n))).join(' 和 ');
})();
