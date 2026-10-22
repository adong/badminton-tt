/* The keys the ? panel shows. Press ? (Shift + /) in the game, or tap the round ? button.
   The panel and the freeze live in the shared kit: kit/help.js (Kit.help). */
Kit.help.setup({
  title: window.BT_TITLE || 'TT Badminton',
  cols: ['Player 1', 'Player 2'],
  keys: [
    ['run', 'A D', '← →'],
    ['jump', 'W', '↑'],
    ['swing · serve', 'F', 'L'],
    ['call your brother', 'T', 'Enter'],
    ['pause · sound', 'P or Esc · M', ''],
  ],
  note: 'In 1 player both sets of keys work, and Space swings too. Jump and swing at a high shuttle for a SMASH; run at the net while you swing for a soft DROP SHOT. When both brothers play, T is a high five.',
  touch: 'Hold ◀ ▶ to run, then ⤒ JUMP and 🏸 SWING. Tap your brother\'s face to call him.',
});
