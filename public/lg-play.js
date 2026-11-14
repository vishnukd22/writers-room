/* LAND GRAB: the phone. Your secrets live here, so keep it close. */
(() => {
  const $ = (q) => document.querySelector(q);
  const esc = W.esc;
  const socket = io();
  window.__gnSocket = socket;
  const main = $('#main'); const hud = $('#hud');
  const params = new URLSearchParams(location.search);
  // In test mode every tab is its own player, so one laptop can be several people.
  const TEST = params.has('test');
  const store = TEST ? sessionStorage : localStorage;
  $('#jcode').value = (params.get('room') || store.getItem('lg:code') || '').toUpperCase();
  $('#jname').value = store.getItem('lg:name') || store.getItem('bc:name') || (TEST ? '' : localStorage.getItem('wr:name') || '');
  const buzz = (p) => { try { navigator.vibrate?.(p); } catch (e) { /* no vibration */ } };

  let S = null; let P = null; let joined = null; let lastNote = null; let screenKey = null;
  const drafts = {}; let chosen = null; let chosenKey = null;

  // ---------------------------------------------------------------- joining
  let wake = null;
  async function keepAwake() { try { if ('wakeLock' in navigator && !wake && document.visibilityState === 'visible') { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { wake = null; } }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && joined) { keepAwake(); if (!socket.connected) socket.connect(); } });
  function tryJoin(code, token) {
    const name = $('#jname').value.trim();
    socket.emit('player:join', { code, token, name, game: 'lg' }, (r) => {
      if (r.redirect) { location.href = r.redirect; return; }
      if (r.error) { if (token) { store.removeItem(`lg:token:${code}`); joined = null; } $('#jerr').textContent = r.error; $('#join').hidden = false; $('#app').hidden = true; return; }
      joined = { code: r.code, token: r.token };
      store.setItem(`lg:token:${r.code}`, r.token); store.setItem('lg:code', r.code); store.setItem('lg:name', name);
      if (!TEST) localStorage.setItem('wr:name', name);
      $('#join').hidden = true; $('#app').hidden = false; keepAwake();
    });
  }
  socket.on('connect', () => {
    if (joined) return tryJoin(joined.code, joined.token);
    const code = $('#jcode').value.trim().toUpperCase(); const tok = code && store.getItem(`lg:token:${code}`);
    if (tok) tryJoin(code, tok);
  });
  $('#jform').onsubmit = (e) => { e.preventDefault(); $('#jerr').textContent = ''; const code = $('#jcode').value.trim().toUpperCase(); tryJoin(code, store.getItem(`lg:token:${code}`)); };
  // the TV went back to the game menu and started another game: follow it
  socket.on('moveTo', ({ url }) => { location.href = `${url}${TEST ? '&test' : ''}&auto=1`; });
  if (params.has('auto') && $('#jcode').value && $('#jname').value) setTimeout(() => $('#jform').requestSubmit(), 300);
  socket.on('kicked', () => { joined = null; $('#join').hidden = false; $('#app').hidden = true; $('#jerr').textContent = 'You were removed from the room.'; });
  socket.on('state', (s) => { W.syncClock(s.now); P = S; S = s; window.__S = s; render(); notes(); feel(); });
  function send(type, data = {}, cb) { socket.emit('act', { type, ...data }, (r) => { if (r?.error) toast(r.error, 'bad'); cb?.(r); }); }

  function toast(text, kind = 'info') { const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = text; $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3500); buzz(kind === 'bad' ? [60, 40, 60] : 25); }
  function notes() {
    const ns = S.me?.notes || []; const topId = ns.length ? ns[ns.length - 1].id : 0;
    if (lastNote === null) { lastNote = topId; return; }
    ns.filter((n) => n.id > lastNote).forEach((n) => toast(n.text, n.kind)); lastNote = Math.max(lastNote, topId);
  }
  function feel() {
    if (!P || !S.me) return;
    if (P.phase !== S.phase || P.step !== S.step) window.scrollTo(0, 0);
    const myTurn = (s) => (s.phase === 'NOMINATE' && s.me?.pres) || (s.phase === 'FILES' && ((s.step === 'pres' && s.me?.pres) || (s.step === 'sec' && s.me?.sec) || (s.step === 'veto' && s.me?.pres))) || (s.phase === 'POWER' && s.step === 'choose' && s.me?.pres) || (s.phase === 'VOTE' && s.step === 'vote');
    if (myTurn(S) && !(P.phase === S.phase && P.step === S.step)) buzz([80, 50, 80]);
  }

  // ---------------------------------------------------------------- helpers
  const me = () => S.me;
  const P_ = (id) => S.players.find((p) => p.id === id);
  const vipName = () => esc(P_(S.vipId)?.name || 'the first player');
  const skipBtn = () => (me().vip ? '<button class="btn ghost sm skip" data-a="skip">Skip ahead</button>' : '');
  const tv = (title, sub = '', ico = '📺') => `<div class="tv"><div class="ico">${ico}</div><h2 class="h">${title}</h2>${sub ? `<p class="lead">${sub}</p>` : ''}</div>`;
  const d = (id, fallback = '') => (id in drafts ? drafts[id] : fallback);
  const roundId = () => `${S.reg.length}`;
  const fileImg = (t) => W.thumb(t === 'P' ? 'lg-file-protect' : 'lg-file-sell');
  const fileBtn = (t, i, act, sel) => `<button class="file ${t === 'P' ? 'protect' : 'sell'} ${sel ? 'sel' : ''}" data-a="choose" data-i="${i}" data-act="${act}">${fileImg(t) ? `<img src="${fileImg(t)}" alt="">` : ''}<span class="stamp">${t === 'P' ? 'PROTECT' : 'SELL'}</span></button>`;
  const fileMini = (t) => `<span class="mini ${t === 'P' ? 'protect' : 'sell'}">${t === 'P' ? 'Protect' : 'Sell'}</span>`;
  const rumourBox = () => {
    if (me().rumoured) return '<p class="hint center">Your rumour is with the tea shop. You get one per round.</p>';
    const id = `rum_${roundId()}`;
    return `<div class="rumour"><label for="rum">Whisper a rumour to the tea shop. It goes on the TV, anonymously.</label><textarea id="rum" rows="2" maxlength="90" data-draft="${id}" placeholder="I saw Bindu getting into a white car...">${esc(d(id))}</textarea><button class="btn big" data-a="rumour" data-id="${id}">Send it anonymously</button></div>`;
  };
  const people = (ids, act, sub) => `<div class="people">${ids.map((id) => { const p = P_(id); return `<button class="person" data-a="${act}" data-id="${id}">${W.bust(p, 'md')}<b>${esc(p?.name || '')}</b>${sub ? `<small>${sub(p)}</small>` : ''}</button>`; }).join('')}</div>`;

  // The role card: hold to see it, let go to hide it.
  function roleCard(full) {
    const m = me(); if (!m.role) return '';
    const art = W.thumb(m.role === 'V' ? 'lg-role-villager' : m.role === 'M' ? 'lg-role-man' : 'lg-role-puppet');
    const team = m.team === 'V' ? 'You protect Greenwater. Win by signing 5 Protect files, or by running the Puppet out of town.' : m.role === 'P' ? 'You work for the Godfather. Win if 6 Sell files are signed, or if you become Secretary once 3 Sell files have passed. Keep your head down.' : 'You work for the Godfather. Win if 6 Sell files are signed, or if the Puppet becomes Secretary once 3 Sell files have passed.';
    const know = m.know.length ? `<div class="know"><b>${m.role === 'P' ? 'Your team' : 'Your team (keep it secret)'}</b>${m.know.map((k) => `<span>${W.bust(k, 'xs')}${esc(k.name)}: ${esc(k.roleName)}</span>`).join('')}</div>` : m.role === 'P' ? '<div class="know"><b>You don\'t know who your team is.</b><span>They know you. Trust the Godfather.</span></div>' : '';
    const tip = m.tip ? `<div class="know tipoff"><b>A tip-off arrived</b><span>${W.bust(m.tip, 'xs')}${esc(m.tip.name)} is definitely a villager.</span></div>` : '';
    const seen = (m.seen || []).length ? `<div class="know"><b>Your inquiries</b>${m.seen.map((s) => `<span>${W.bust(s, 'xs')}${esc(s.name)}: ${s.team === 'V' ? 'Villager' : 'works for the Godfather'}</span>`).join('')}</div>` : '';
    return `<div class="role ${m.team === 'V' ? 'v' : 'g'} ${full ? 'full' : ''}">${art ? `<div class="roleimg" style="background-image:url('${art}')" role="img" aria-label="${esc(m.roleName)}"></div>` : `<div class="roleart">${m.role === 'V' ? '🌴' : m.role === 'M' ? '💼' : '🎭'}</div>`}<h3>${esc(m.roleName)}</h3><p>${team}</p>${know}${tip}${seen}<button class="btn big hideRole" data-role="hide">Hide my role</button></div>`;
  }
  const holdRole = () => `<button class="hold" data-role="show">Tap to see your role</button><div class="secret">${roleCard(true)}</div>`;

  // ---------------------------------------------------------------- screens: each returns [key, html]
  const R = {
    LOBBY() {
      const m = me(); const n = S.players.length;
      const grid = (S.x.busts || []).map((b) => { const owner = P_(b.by); const mine = b.by === m.id; const src = W.bustSrc(b.n, true);
        return `<button class="pickbust ${mine ? 'on' : ''}" data-a="bust" data-n="${b.n}" ${owner && !mine ? 'disabled' : ''}>${src ? `<img src="${src}" alt="">` : `<span class="nob">${b.n}</span>`}${owner && !mine ? `<small>${esc(owner.name)}</small>` : ''}</button>`; }).join('');
      const list = S.players.map((p) => `<span class="pill" style="--c:${p.color}">${esc(p.name)}${p.id === m.id ? ' (you)' : ''}${p.bot ? ' 🤖' : ''}</span>`).join('');
      const start = m.vip ? `<button class="btn primary big" data-a="start" ${n < 5 ? 'disabled' : ''}>Start the game</button><p class="hint center">${n < 5 ? `${n} of 5 needed. Up to 10 can play.` : 'Start when everyone is in.'}</p>` : `<p class="lead center">Waiting for ${vipName()} to start.</p>`;
      const busts = (S.x.busts || []).map((b) => `${b.n}:${b.by || ''}`).join(',');
      return [`LOBBY|${n}|${m.vip}|${busts}`, `<h2 class="h">${m.bust ? `You're in, ${esc(m.name)}.` : `Pick your look, ${esc(m.name)}`}</h2><div class="bustgrid">${grid}</div><div class="pills">${list}</div>${start}`];
    },
    INTRO() { return [`INTRO|${S.step}`, tv('Eyes on the TV', 'The tea shop has some news.', '🫖')]; },
    TUTORIAL() {
      const x = S.x;
      return [`TUT|${x.slide}|${me().vip}`, `${tv('Watch the TV', `How to play: part ${x.slide + 1} of ${x.slides}`, '📖')}${me().vip ? '<button class="btn ghost big" data-a="skipTutorial">Skip the tutorial. We know how to play.</button>' : ''}<p class="hint center">You can read the rules any time with the Rules button at the top.</p>`];
    },
    ROLES() {
      const m = me();
      return [`ROLES|${m.ready}`, `<h2 class="h">Your secret role</h2><p class="lead">Keep the screen away from everyone else.</p>${holdRole()}
        ${m.ready ? '<p class="lead center">Got it. Waiting for everyone.</p>' : '<button class="btn primary big" data-a="ready">I\'ve seen it</button>'}`];
    },
    NOMINATE() {
      const m = me(); const x = S.x;
      if (m.pres) {
        const all = S.players.filter((p) => p.alive && p.id !== m.id);
        const el = x.eligible || [];
        return [`NOM|pres|${roundId()}`, `<h2 class="h">You're President</h2><p class="lead">Pick your Secretary. You'll pass them two files.</p>${people(el, 'nominate')}${all.some((p) => !el.includes(p.id)) ? `<p class="hint">Can't be Secretary this round: ${all.filter((p) => !el.includes(p.id)).map((p) => esc(p.name)).join(', ')} (they were just in charge).</p>` : ''}`];
      }
      return [`NOM|wait|${roundId()}|${m.rumoured}|${m.alive}`, `${tv(`${esc(x.pres?.name || 'The President')} is picking a Secretary`, m.alive ? 'Make your case out loud.' : "You're out of town, but you can still gossip.", '🗳️')}${rumourBox()}`];
    },
    VOTE() {
      const m = me(); const x = S.x;
      const pair = `<div class="pair">${W.bust(x.pres, 'md')}<b>${esc(x.pres?.name || '')}</b><span>as President, with</span>${W.bust(x.sec, 'md')}<b>${esc(x.sec?.name || '')}</b><span>as Secretary</span></div>`;
      if (S.step === 'result') { const mine = x.votes?.[m.id]; return [`VOTE|res|${roundId()}`, tv(x.passed ? 'Elected' : 'Rejected', mine === undefined ? '' : `You voted ${mine === true ? 'yes' : mine === false ? 'no' : 'nothing'}.`, x.passed ? '✅' : '❌')]; }
      if (!m.alive) return [`VOTE|dead|${roundId()}`, tv("You can't vote", "You're out of town.", '🚌')];
      if (x.myVote !== null && x.myVote !== undefined) return [`VOTE|done|${roundId()}|${x.myVote}|${x.voted}`, `${tv(`You voted ${x.myVote ? 'yes' : 'no'}`, `${x.voted} of ${x.voters} voted. You can change your mind until everyone is in.`, '🗳️')}<div class="yn small"><button class="yes ${x.myVote ? 'on' : ''}" data-a="vote" data-yes="1">Yes</button><button class="no ${x.myVote ? '' : 'on'}" data-a="vote" data-yes="0">No</button></div>`];
      return [`VOTE|vote|${roundId()}`, `<h2 class="h">Do you trust them?</h2>${pair}<div class="yn"><button class="yes" data-a="vote" data-yes="1">Yes</button><button class="no" data-a="vote" data-yes="0">No</button></div><p class="hint center">Everyone sees how you voted.</p>`];
    },
    FILES() {
      const m = me(); const x = S.x; const k = `${roundId()}|${S.step}`;
      if (S.step === 'pres' && m.pres && x.hand) {
        const sel = chosenKey === k ? chosen : null;
        return [`FI|pres|${k}|${sel}`, `<h2 class="h">Bin one file</h2><p class="lead">You drew these three. Tap the one to throw away. The other two go to ${esc(x.sec?.name || 'your Secretary')}.</p><div class="files">${x.hand.map((t, i) => fileBtn(t, i, 'discard', sel === i)).join('')}</div>${sel !== null ? `<button class="btn red big" data-a="confirm" data-act="discard">Bin this ${x.hand[sel] === 'P' ? 'Protect' : 'Sell'} file</button>` : ''}<p class="hint center">Nobody else sees these. You can tell the truth about them later. Or not.</p>`];
      }
      if (S.step === 'sec' && m.sec && x.passed) {
        const sel = chosenKey === k ? chosen : null;
        const veto = x.vetoOn && !x.denied && !x.asked ? `<button class="btn ghost big" data-a="veto">Ask to throw both away</button>` : '';
        return [`FI|sec|${k}|${sel}|${x.denied}`, `<h2 class="h">${x.denied ? 'Veto refused. Sign one.' : 'Sign one file'}</h2><p class="lead">${esc(x.pres?.name || 'The President')} passed you these two. Tap the one to sign.</p><div class="files two">${x.passed.map((t, i) => fileBtn(t, i, 'sign', sel === i)).join('')}</div>${sel !== null ? `<button class="btn primary big" data-a="confirm" data-act="sign">Sign the ${x.passed[sel] === 'P' ? 'Protect' : 'Sell'} file</button>` : ''}${veto}`];
      }
      if (S.step === 'veto' && m.pres && x.passed) {
        return [`FI|veto|${k}`, `<h2 class="h">${esc(x.sec?.name || 'The Secretary')} wants to throw both away</h2><div class="files two ro">${x.passed.map((t) => fileMini(t)).join('')}</div><div class="yn"><button class="yes" data-a="vetoAnswer" data-yes="1">Agree</button><button class="no" data-a="vetoAnswer" data-yes="0">Refuse</button></div><p class="hint center">If you agree, nothing is signed and it counts as a failed vote.</p>`];
      }
      if (S.step === 'sec' && m.sec) return [`FI|secwait|${k}`, tv(`${esc(x.pres?.name || 'The President')} is choosing`, "Two files are coming your way.", '📁')];
      return [`FI|wait|${k}|${x.binned}`, tv('The files are out', `${S.step === 'pres' ? esc(x.pres?.name || '') : esc(x.sec?.name || '')} is deciding. No talking while the files are out.`, '🤫')];
    },
    SIGNED() { const x = S.x; return [`SI|${roundId()}`, `${tv(x.type === 'P' ? 'Protect' : 'Sell', esc(x.title || ''), x.type === 'P' ? '🌴' : '🏗️')}`]; },
    CLAIMS() {
      const m = me(); const x = S.x;
      if (x.needClaim) {
        const opts = x.needClaim === 'pres' ? [[0, '3 Sell'], [1, '2 Sell, 1 Protect'], [2, '1 Sell, 2 Protect'], [3, '3 Protect']] : [[0, '2 Sell'], [1, '1 Sell, 1 Protect'], [2, '2 Protect']];
        return [`CL|${x.needClaim}|${roundId()}`, `<h2 class="h">${x.needClaim === 'pres' ? 'What did you draw?' : 'What were you given?'}</h2><p class="lead">This goes on the TV. You can tell the truth. You can also lie.</p><div class="claims">${opts.map(([v, t]) => `<button data-a="claim" data-v="${v}">${t}</button>`).join('')}<button class="nc" data-a="claim" data-v="none">No comment</button></div>`];
      }
      return [`CL|wait|${roundId()}|${x.show}`, tv(x.show ? 'Do you believe them?' : 'What did they see?', x.show ? 'Talk it over.' : 'The President and Secretary are telling their story.', '🧐')];
    },
    POWER() {
      const m = me(); const x = S.x;
      if (m.pres && S.step === 'choose') {
        if (x.kind === 'peek' && x.top) return [`PO|peek|${roundId()}`, `<h2 class="h">The next three files</h2><p class="lead">In this order. Keep it to yourself, or don't.</p><div class="files ro">${x.top.map((t) => fileMini(t)).join('')}</div><button class="btn primary big" data-a="power" data-id="">Done</button>`];
        if (x.targets) {
          const title = { inquiry: 'Look into someone', urgent: 'Pick the next President', runout: 'Run someone out of town' }[x.kind];
          const sub = { inquiry: "You'll secretly see which side they're on.", urgent: 'They run the next round.', runout: "They're out for good. If they're the Puppet, the village wins." }[x.kind];
          return [`PO|choose|${x.kind}|${roundId()}`, `<h2 class="h">${title}</h2><p class="lead">${sub}</p>${people(x.targets, 'power')}`];
        }
      }
      if (m.pres && S.step === 'result' && x.kind === 'inquiry' && x.found) return [`PO|found|${roundId()}`, `<div class="found ${x.found === 'V' ? 'v' : 'g'}">${W.bust(x.target, 'lg')}<h2>${esc(x.target?.name || '')}</h2><p>${x.found === 'V' ? 'is a villager' : 'works for the Godfather'}</p></div><p class="hint center">Only you saw this. It's saved on your role card.</p>`];
      if (S.step === 'result' && x.kind === 'runout' && x.target?.id === m.id) return [`PO|me|${roundId()}`, tv("You've been run out of town", "You can't vote or hold office now. You can still send rumours. And keep your role a secret.", '🚌')];
      return [`PO|wait|${x.kind}|${S.step}|${roundId()}`, tv(esc(x.label || 'A special power'), `${esc(x.pres?.name || 'The President')} is using it.`, '⚡')];
    },
    SHUTDOWN() { return [`SH|${roundId()}`, tv('Shutdown', 'Three failed votes. A file gets signed with nobody watching.', '🚧')]; },
    END() {
      const m = me(); const w = S.x.winner || {}; const won = m.team === w.team;
      return [`END|${S.step}|${m.vip}`, `<div class="endcard ${won ? 'won' : 'lost'}"><div class="ico">${won ? '🏆' : '💸'}</div><h2>${won ? 'You won' : 'You lost'}</h2><p>${w.team === 'V' ? 'Greenwater is saved.' : 'The Godfather wins.'}</p></div>${roleCard(true)}
        ${m.vip ? '<button class="btn primary big" data-a="again">Play again</button><button class="btn big" data-a="menu">Back to the game menu</button>' : `<p class="lead center">${vipName()} can play again or pick another game.</p>`}`];
    },
  };

  // ---------------------------------------------------------------- render
  function hudHtml() {
    const m = me(); if (!m) return '';
    const status = !m.alive && m.role ? '<span class="dead">Out of town</span>' : m.pres ? '<span class="tagp">President</span>' : m.sec && ['VOTE', 'FILES', 'SIGNED', 'CLAIMS'].includes(S.phase) ? '<span class="tags">Secretary</span>' : '';
    const b = S.board; const track = m.role ? `<span class="trk"><b class="g">${b.protect}/5</b><b class="r">${b.sell}/6</b></span>` : '';
    return `${W.bust(m, 'sm')}<span class="nm">${esc(m.name)}</span>${status}${track}<button class="rulesbtn" data-a="rules">Rules</button>${m.role && !['ROLES', 'END', 'INTRO', 'TUTORIAL'].includes(S.phase) ? '<button class="peek" data-role="toggle">Role</button>' : ''}`;
  }
  function render() {
    if (!S.me) return;
    mount(hud, hudHtml());
    document.body.classList.toggle('dead', !!S.me.role && !S.me.alive);
    const [key, html] = (R[S.phase] || (() => ['none', tv('Eyes on the TV')]))();
    const extra = S.me.role && !['ROLES', 'END', 'LOBBY'].includes(S.phase) ? `<div class="secret floating">${roleCard(true)}</div>` : '';
    const full = `${html}${extra}${S.phase === 'INTRO' ? skipBtn() : ''}`;
    if (key !== screenKey) { screenKey = key; main.innerHTML = full; main.__html = full; restoreDrafts(); }
  }
  function restoreDrafts() { main.querySelectorAll('[data-draft]').forEach((el) => { if (drafts[el.dataset.draft] !== undefined) el.value = drafts[el.dataset.draft]; }); }
  main.addEventListener('input', (e) => { const k = e.target.dataset?.draft; if (k) drafts[k] = e.target.value; });

  // the rules, one tap away
  const rules = document.createElement('div'); rules.id = 'rules';
  rules.innerHTML = `<div class="rulescard"><button class="close" data-a="rules" aria-label="Close">✕</button><h2>How to play</h2>
    <h3>The sides</h3><p>Most players are villagers. A few secretly work for the Godfather, and they know each other. One of them is the Puppet. In games of 5 or 6, the Puppet knows the team too. In bigger games, the Puppet doesn't.</p>
    <h3>Each round</h3><p>The President (the job moves round the table) picks a Secretary. Everyone votes yes or no. More yes than no, and they're in. Everyone sees how you voted.</p>
    <p>Whoever was President or Secretary in the last elected pair can't be Secretary. (With only 5 players left, just the last Secretary.)</p>
    <h3>The files</h3><p>The President draws 3 files, bins 1 in secret and passes 2 to the Secretary, who signs 1. The tray has 11 Sell and 6 Protect files, so an honest player can be forced to sign Sell. No talking while the files are out.</p>
    <p>Afterwards both say what they saw. They can lie.</p>
    <h3>Powers</h3><p>Some Sell files give the President a power: look into one player's side, peek at the next 3 files, pick the next President, or run someone out of town. After 5 Sell files, the Secretary can ask to throw both files away, if the President agrees.</p>
    <h3>Shutdown</h3><p>Three failed votes in a row and the village shuts down. The top file is signed with nobody watching.</p>
    <h3>Winning</h3><p><b>Villagers:</b> 5 Protect files, or run the Puppet out of town.</p><p><b>The Godfather:</b> 6 Sell files, or the Puppet is elected Secretary once 3 Sell files have passed.</p>
    <h3>Golden rule</h3><p>Never show anyone your phone. Saying anything you like is fair game.</p></div>`;
  document.body.appendChild(rules);

  // hold-to-see role
  // Tap to see your role, tap again (or wait 15 seconds) to hide it.
  let roleTimer = null;
  const showRole = (on) => { document.body.classList.toggle('peeking', on); clearTimeout(roleTimer); if (on) { buzz(15); roleTimer = setTimeout(() => showRole(false), 15000); } };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-role]'); if (!b) return;
    const v = b.dataset.role; showRole(v === 'show' ? true : v === 'hide' ? false : !document.body.classList.contains('peeking'));
  });
  document.addEventListener('contextmenu', (e) => { if (e.target.closest('.role, [data-role]')) e.preventDefault(); });

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    const a = b.dataset.a;
    if (a === 'start') return send('start');
    if (a === 'again') return send('again');
    if (a === 'menu') return send('menu');
    if (a === 'skip') return send('skip');
    if (a === 'skipTutorial') return send('skipTutorial');
    if (a === 'rules') { document.body.classList.toggle('rules'); return null; }
    if (a === 'bust') return send('bust', { n: Number(b.dataset.n) });
    if (a === 'ready') return send('ready');
    if (a === 'nominate') { buzz(20); return send('nominate', { id: b.dataset.id }); }
    if (a === 'vote') { buzz(20); return send('vote', { yes: b.dataset.yes === '1' }); }
    if (a === 'choose') { chosen = Number(b.dataset.i); chosenKey = `${roundId()}|${S.step}`; screenKey = null; return render(); }
    if (a === 'confirm') { const i = chosen; chosen = null; chosenKey = null; buzz(30); return send(b.dataset.act, { i }); }
    if (a === 'veto') return send('veto');
    if (a === 'vetoAnswer') return send('vetoAnswer', { yes: b.dataset.yes === '1' });
    if (a === 'claim') return send('claim', { v: b.dataset.v === 'none' ? null : Number(b.dataset.v) });
    if (a === 'power') return send('power', { id: b.dataset.id || null });
    if (a === 'rumour') { const id = b.dataset.id; const text = (drafts[id] || '').trim(); if (text.length < 3) return toast('Write a rumour first', 'bad'); return send('rumour', { text }, (r) => { if (r?.ok) { toast('Sent. Nobody knows it was you.'); delete drafts[id]; } }); }
    return null;
  });
})();
