# The iPhone check: plays a whole game of each title with four real phone screens at iPhone sizes
# (SE, 13 mini, 15, 15 Pro Max, with Safari's bars taken off the height) and fails if any screen is
# wider than the phone, or any button or text box is off the side, cut off, covered, or can't be scrolled to.
# Uses Safari's engine (WebKit) when it's installed, otherwise Chrome's engine with iPhone settings.
# Usage: run the server with WR_SPEED=0.25, then  GAMES=bc,lg,rg python3 test/phone-fit.py [OUTDIR]
import os, sys, time, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('URL', 'http://localhost:3100')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/phone-fit'; os.makedirs(OUT, exist_ok=True)
GAMES = os.environ.get('GAMES', 'bc,lg,rg').split(',')
MAXS = float(os.environ.get('MAXS', '900'))
# visible area in Safari with its address bar showing (the tightest case)
PHONES = [('iPhone SE', 375, 553), ('iPhone 13 mini', 375, 629), ('iPhone 15', 393, 659), ('iPhone 15 Pro Max', 430, 739)]
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
GAME = {'bc': ('/tv/bidcoin', '/bc', 3), 'lg': ('/tv/landgrab', '/lg', 2), 'rg': ('/tv/rigged', '/rg', 2), 'mn': ('/tv/mansion', '/mn', 0)}

# runs inside each phone: returns every problem on the screen right now
CHECK = r"""() => {
  const W = innerWidth, H = innerHeight, out = [];
  const de = document.documentElement;
  if (de.scrollWidth > W + 1) out.push(`page is ${de.scrollWidth}px wide on a ${W}px screen`);
  const name = (el) => (el.dataset.a ? `[${el.dataset.a}] ` : '') + (el.innerText || el.placeholder || el.getAttribute('aria-label') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
  const shown = (el) => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; for (let n = el; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) return false; if (n.hidden) return false; } return true; };
  const scrollerOf = (el) => { for (let n = el.parentElement; n && n !== document.body && n !== de; n = n.parentElement) { const cs = getComputedStyle(n); if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) return n; } return null; };
  const docScrolls = () => { const b = getComputedStyle(document.body).overflowY, h = getComputedStyle(de).overflowY; return !(b === 'hidden' || b === 'clip' || h === 'hidden' || h === 'clip'); };
  // when a sheet or pop-up covers the screen, only what's on it counts (the page under it is meant to be covered)
  let layer = document;
  for (let n = document.elementFromPoint(W / 2, H / 2); n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.position === 'fixed') { const rr = n.getBoundingClientRect(); if (rr.width >= W * 0.9 && rr.height >= H * 0.8) layer = n; } }
  const els = [...layer.querySelectorAll('button, input:not([type=hidden]), textarea, select, a[href], [data-a], [role=button]')];
  for (const el of els) {
    if (!shown(el)) continue;
    if (el.closest('#toasts')) continue;
    const r = el.getBoundingClientRect();
    const fixed = (() => { for (let n = el; n; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return true; return false; })();
    if (r.left < -1 || r.right > W + 1) {
      // fine inside a row that scrolls sideways, as long as scrolling brings it fully on screen
      let row = null; for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (/(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1) { row = n; break; } }
      if (!row) { out.push(`off the side: ${name(el)} (${Math.round(r.left)} to ${Math.round(r.right)})`); continue; }
      const t = row.scrollLeft; el.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'instant' }); const r3 = el.getBoundingClientRect(); row.scrollLeft = t;
      if (r3.left < -1 || r3.right > W + 1) out.push(`off the side even after swiping: ${name(el)}`);
      continue;
    }
    // cut off by a box that doesn't scroll
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/(hidden|clip)/.test(cs.overflowX + cs.overflowY)) { const pr = n.getBoundingClientRect(); if (r.right > pr.right + 2 || r.left < pr.left - 2 || (/(hidden|clip)/.test(cs.overflowY) && (r.bottom > pr.bottom + 2 || r.top < pr.top - 2))) { if (r.width < pr.width + 4) out.push(`cut off: ${name(el)}`); break; } }
    }
    // below (or above) the screen: really scroll to it, check it's fully on screen and not under a pinned bar, then scroll back
    if (r.bottom > H + 1 || r.top < -1) {
      const sx = scrollX, sy = scrollY, boxes = []; for (let n = el.parentElement; n; n = n.parentElement) boxes.push([n, n.scrollTop]);
      el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      const r2 = el.getBoundingClientRect();
      if (r2.bottom > H + 1 || r2.top < -1) out.push(`can't scroll to: ${name(el)}`);
      else { const sc = scrollerOf(el); if (sc) sc.scrollTop = sc.scrollHeight; else if (r2.bottom > H / 2) window.scrollTo(scrollX, de.scrollHeight); const r4 = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r4.left + r4.width / 2, Math.min(H - 1, Math.max(0, r4.top + r4.height / 2))); if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) out.push(`under a pinned bar after scrolling: ${name(el)} under ${hit.id ? '#' + hit.id : hit.className || hit.tagName}`); }
      boxes.forEach(([n, t]) => { n.scrollTop = t; }); window.scrollTo(sx, sy);
      continue;
    }
    // something else on top of it
    if (r.top >= 0 && r.bottom <= H && r.left >= 0 && r.right <= W) {
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el) && !(hit.closest('label') && hit.closest('label').contains(el))) {
        // a pinned bar can sit on top until you scroll: try scrolling to the end, then look again
        const sx = scrollX, sy = scrollY; window.scrollTo(sx, de.scrollHeight);
        const r5 = el.getBoundingClientRect(); const hit2 = r5.top >= 0 && r5.bottom <= H ? document.elementFromPoint(r5.left + r5.width / 2, r5.top + r5.height / 2) : null;
        window.scrollTo(sx, sy);
        if (!hit2 || (hit2 !== el && !el.contains(hit2) && !hit2.contains(el))) out.push(`covered: ${name(el)} under ${hit.id ? '#' + hit.id : hit.className || hit.tagName}`);
        else if (/sab|tray|dock/.test(String(hit.className) + hit.id)) out.push(`covered until you scroll: ${name(el)} under ${hit.id ? '#' + hit.id : hit.className || hit.tagName}`);
      }
    }
    if (/INPUT|TEXTAREA|SELECT/.test(el.tagName) && parseFloat(getComputedStyle(el).fontSize) < 16) out.push(`text box under 16px (Safari zooms in): ${name(el)}`);
  }
  return [...new Set(out)];
}"""

# a generic player: types into boxes and taps a random button now and then, so every screen gets visited
PLAY = r"""(seed) => {
  if (window.__busy) return; const S = window.__S; if (!S) return;
  const qa = (s) => [...document.querySelectorAll(s)].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && !el.disabled && !el.closest('#gn-ctl') && !el.closest('[hidden]'); });
  const skip = /^(menu|again|leave|kick|addBot|start|rules|closeRules)$/;
  const later = (fn, t) => { window.__busy = true; setTimeout(() => { try { fn(); } catch (e) {} window.__busy = false; }, t); };
  const box = qa('textarea, input:not([type=hidden]):not(#jname)').find((el) => !el.value);
  if (box) { later(() => { box.value = ['pelicans', 'my uncle Steve', 'a haunted toaster', '1200'][Math.floor(Math.random() * 4)]; box.dispatchEvent(new Event('input', { bubbles: true })); const f = box.closest('form'); const b = (f && f.querySelector('button')) || box.parentElement.querySelector('button'); if (b) b.click(); }, 700); return; }
  const bs = qa('button, [data-a], [data-pick], [data-k]').filter((b) => !skip.test(b.dataset.a || '') && !b.classList.contains('gn-menu'));
  if (bs.length && Math.random() < 0.6) later(() => bs[Math.floor(Math.random() * bs.length)].click(), 500 + Math.random() * 1500);
}"""

def run(pw, game):
    tvpath, phpath, bots = GAME[game]
    eng = getattr(pw, os.environ.get('ENGINE', 'webkit'))
    try:
        b = eng.launch(); engine = eng.name
    except Exception:
        b = pw.chromium.launch(); engine = 'chromium (iPhone settings)'
    tvb = pw.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    tv = tvb.new_page(viewport={'width': 1600, 'height': 900})
    tv.goto(URL + tvpath + '?test'); tv.click('#bOpen')
    tv.wait_for_function('window.__S && window.__S.code'); code = tv.evaluate('window.__S.code')
    phones = []; errors = []
    for i, (label, w, h) in enumerate(PHONES):
        ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=3, has_touch=True, user_agent=UA, **({'is_mobile': True} if engine.startswith('chromium') else {}))
        pg = ctx.new_page(); pg.on('pageerror', lambda e, l=label: errors.append(f'{l}: {e}'))
        pg.goto(f'{URL}{phpath}?room={code}&test'); pg.fill('#jname', f'P{i + 1}'); pg.click('#jform button')
        pg.wait_for_function('window.__S && window.__S.me')
        if game == 'lg':
            try: pg.click('.pickbust:not([disabled])', timeout=3000)
            except Exception: pass
        phones.append((label, pg))
    for _ in range(bots): tv.click('[data-tv=bot]'); time.sleep(0.2)
    time.sleep(0.6)
    problems = {}; screens = set(); shots = 0
    def look(st):
        nonlocal shots
        for label, pg in phones:
            try: found = pg.evaluate(CHECK)
            except Exception: continue
            for f in found:
                key = (label, st, f)
                if key not in problems:
                    problems[key] = 1
                    if shots < 40: shots += 1; pg.screenshot(path=f'{OUT}/{game}_{shots:02d}_{label.replace(" ", "")}.png')
    look('LOBBY')
    phones[0][1].click('[data-a=start]')
    t0 = time.time(); last = None; pauseTried = False
    while time.time() - t0 < MAXS:
        try: st = tv.evaluate('window.__S && [__S.phase, __S.step||"", (__S.q&&__S.q.kind)||"", (__S.x&&__S.x.step)||"", (__S.x&&(__S.x.room||__S.x.poss)&&(__S.x.room||__S.x.poss).key)||""].join("|")')
        except Exception: st = None
        for label, pg in phones:
            try: pg.evaluate(PLAY, 1)
            except Exception: pass
        if st and st != last:
            last = st; screens.add(st); time.sleep(0.5); look(st)
            # check the pause and quit screens too, once per game
            if not pauseTried and not st.startswith(('LOBBY', 'INTRO', 'TUTORIAL')):
                pauseTried = True
                pg = phones[0][1]
                pg.click('.gn-menu'); time.sleep(0.4); look(st + ' +menu')
                pg.click('[data-gn=pause]'); time.sleep(0.6); look(st + ' +paused')
                pg.click('[data-gn=resume]'); time.sleep(3.6)
        if st and st.startswith('END'):
            time.sleep(2); look(st); break
        try: tv.evaluate("() => { if (window.__S && window.__S.cue && (window.__cueT||0) !== window.__S.cue.id) { window.__cueT = window.__S.cue.id; setTimeout(() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })), 700); } }")
        except Exception: pass
        time.sleep(0.25)
    b.close(); tvb.close()
    return engine, screens, problems, errors, time.time() - t0

with sync_playwright() as pw:
    total = 0
    for g in GAMES:
        engine, screens, problems, errors, secs = run(pw, g)
        print(f'\n== {g}: {len(screens)} screens in {secs:.0f}s on {engine}')
        by = {}
        for (label, st, f) in problems: by.setdefault(f, []).append(f'{label} @ {st}')
        for f, where in sorted(by.items()):
            print(f'  FAIL {f}\n       {"; ".join(sorted(set(where))[:4])}{" ..." if len(where) > 4 else ""}')
        for e in errors[:5]: print('  page error:', e)
        total += len(by)
    print('\nall phone screens fit' if not total else f'\n{total} problems')
    sys.exit(1 if total else 0)
