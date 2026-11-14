/* Pause, resume and quit, shared by every game. Phones get a menu button; the TV shows the paused screen.
   Each game page sets window.__gnSocket before this file loads. */
(() => {
  const socket = window.__gnSocket; if (!socket) return;
  const isTV = !!window.__gnTV;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const send = (type, data = {}) => socket.emit('act', { type, ...data }, () => {});
  let S = null; let open = false; let wasPaused = false;

  const root = document.createElement('div'); root.id = 'gn-ctl'; document.body.appendChild(root);
  let tick = null;

  function html() {
    const c = S?.ctl; if (!c) return '';
    const q = c.quit;
    const left = (t) => Math.max(0, Math.ceil((t - Date.now()) / 1000));
    let over = '';
    if (c.left) {
      return isTV ? '' : '<div class="gn-over"><div class="gn-card"><div class="gn-t">Back to the menu</div><p>Pick the next game on the TV. Your phone joins it by itself.</p></div></div>';
    }
    if (q) {
      over = `<div class="gn-over"><div class="gn-card"><div class="gn-t">Quit to the game menu?</div><p>${esc(q.by)} wants to stop this game and pick another one.</p><p class="gn-n">${q.yes} yes, ${q.no} no. ${q.need} needed. <span data-gn-left="${q.until}">${left(q.until)}</span>s</p>
        ${isTV ? '<p>Vote on your phones.</p>' : q.mine ? `<p class="gn-n">You voted ${q.mine}.</p>` : '<div class="gn-row"><button class="gn-b gn-hot" data-gn="yes">Yes, quit</button><button class="gn-b" data-gn="no">No, keep playing</button></div>'}</div></div>`;
    } else if (c.paused) {
      const counting = c.resumeAt ? `<div class="gn-big" data-gn-left="${c.resumeAt}">${left(c.resumeAt)}</div><p>${esc(c.resumeBy)} pressed resume</p>` : '';
      over = `<div class="gn-over"><div class="gn-card"><div class="gn-t">Paused</div><p>${esc(c.by)} paused the game.</p>${counting}
        ${isTV ? (c.resumeAt ? '' : '<p>Resume from any phone.</p>') : c.resumeAt ? '' : '<div class="gn-row gn-col"><button class="gn-b gn-go" data-gn="resume">Resume</button><button class="gn-b gn-ghost" data-gn="quit">Quit to the game menu</button></div>'}</div></div>`;
    }
    if (isTV) return over;
    const btn = !q && !c.paused ? `<button class="gn-menu" data-gn="menu" aria-label="Game menu">II</button>` : '';
    const sheet = open && !q && !c.paused ? `<div class="gn-over" data-gn="close"><div class="gn-card gn-sheet"><div class="gn-t">Game menu</div><div class="gn-row gn-col">${c.canPause ? '<button class="gn-b gn-go" data-gn="pause">Pause the game</button>' : ''}<button class="gn-b gn-ghost" data-gn="quit">Quit to the game menu</button><button class="gn-b gn-ghost" data-gn="close">Back to the game</button></div></div></div>` : '';
    return btn + sheet + over;
  }
  function render() {
    root.innerHTML = html();
    clearInterval(tick);
    if (root.querySelector('[data-gn-left]')) tick = setInterval(() => root.querySelectorAll('[data-gn-left]').forEach((el) => { el.textContent = Math.max(0, Math.ceil((Number(el.dataset.gnLeft) - Date.now()) / 1000)); }), 250);
    const paused = !!(S?.ctl?.paused || S?.ctl?.quit);
    document.body.classList.toggle('gn-paused', paused);
    if (isTV && paused !== wasPaused && typeof AV !== 'undefined' && AV.hold) AV.hold(paused);
    wasPaused = paused;
  }
  socket.on('state', (s) => { S = s; if (s?.ctl?.paused || s?.ctl?.quit) open = false; render(); });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-gn]'); if (!b) return;
    const a = b.dataset.gn;
    if (a === 'close' && e.target !== b && b.classList.contains('gn-over')) return; // tapping inside the card
    if (a === 'menu') { open = true; render(); return; }
    if (a === 'close') { open = false; render(); return; }
    if (a === 'pause') { open = false; send('pause'); }
    if (a === 'resume') send('resume');
    if (a === 'quit') { open = false; send('quit'); }
    if (a === 'yes') send('quitVote', { yes: true });
    if (a === 'no') send('quitVote', { yes: false });
  });
})();
