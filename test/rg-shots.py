# Screenshots of the RIGGED! TV and one human phone while bots fill the other seats.
# Usage: URL=http://localhost:3100 BOTS=3 python3 test/rg-shots.py OUTDIR
import os, sys, time, re
from playwright.sync_api import sync_playwright
URL = os.environ.get('URL', 'http://localhost:3100')
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
BOTS = int(os.environ.get('BOTS', '3'))
WAIT = float(os.environ.get('SHOT_WAIT', '0.9'))
ONLY = os.environ.get('ONLY', '.')
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    tv = b.new_page(viewport={'width': 1600, 'height': 900})
    tv.on('pageerror', lambda e: errors.append(('tv', str(e))))
    tv.on('console', lambda m: errors.append(('tv-console', m.text)) if m.type == 'error' else None)
    tv.goto(URL + '/tv/rigged?test'); tv.click('#bOpen')
    tv.wait_for_function('window.__S && window.__S.code')
    code = tv.evaluate('window.__S.code')
    ph = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True).new_page()
    ph.on('pageerror', lambda e: errors.append(('phone', str(e))))
    ph.on('console', lambda m: errors.append(('phone-console', m.text)) if m.type == 'error' else None)
    ph.goto(f'{URL}/rg?room={code}&test'); ph.fill('#jname', 'Vishnu'); ph.click('#jform button')
    ph.wait_for_function('window.__S && window.__S.me')
    for i in range(BOTS):
        ph.click('[data-a=addBot]'); time.sleep(0.25)
    time.sleep(0.8)
    tv.screenshot(path=f'{OUT}/00_lobby_tv.png'); ph.screenshot(path=f'{OUT}/00_lobby_phone.png')
    ph.click('[data-a=start]')
    seen = {}; last = None; t0 = time.time(); k = 0
    while time.time() - t0 < float(os.environ.get('MAXS', '900')):
        try:
            st = tv.evaluate('window.__S && [__S.phase, __S.kind||"", __S.step||"", (__S.x.step||"")].join("|")')
        except Exception:
            st = None
        # the human phone plays too: types, taps, and now and then plays dirty
        try:
            ph.evaluate("""() => {
              const q = (s) => document.querySelector(s); const qa = (s) => [...document.querySelectorAll(s)];
              if (window.__busy) return;
              const S = window.__S; if (!S || !S.me) return;
              const later = (fn, t = 700) => { window.__busy = true; setTimeout(() => { try { fn(); } finally { window.__busy = false; } }, t); };
              if (q('#picker:not([hidden])')) { const f = q('#picker .fbtn:not([disabled])') || q('#picker [data-pick=""]'); if (f) later(() => f.click(), 500); return; }
              if (S.phase === 'DOSSIER') { const t = q('textarea'); if (t) { t.value = ['Half a lemon and a lot of regret', 'I can whistle with my nose', 'Sir Snackalot'][Math.floor(Math.random()*3)]; later(() => t.parentElement.querySelector('button').click(), 600); } return; }
              if (S.phase === 'Q' && S.me.can) {
                const tr = qa('#tray .trick:not([disabled])'); if (tr.length && Math.random() < 0.08) { later(() => tr[Math.floor(Math.random()*tr.length)].click(), 400); return; }
                const tab = qa('#tray .tabs button:not(.on)'); if (tab.length && Math.random() < 0.05) { later(() => tab[0].click(), 300); return; }
                if (q('#lie')) { q('#lie').value = 'pelicans'; later(() => q('[data-a=lie]').click(), 1500); return; }
                if (q('#fake')) { q('#fake').value = 'I once fought a swan and lost'; later(() => q('[data-a=fake]').click(), 1500); return; }
                if (q('.pad')) { later(() => { ['1','2','0','0'].forEach((k) => q(`[data-k="${k}"]`).click()); q('[data-a=numgo]').click(); }, 2500); return; }
                const bs = qa('[data-a=pick]:not([disabled]), [data-a=bet]:not([disabled])'); if (bs.length) { later(() => bs[Math.floor(Math.random()*bs.length)].click(), 2600); return; }
                const lk = q('[data-a=lock]'); if (lk) later(() => lk.click(), 600);
              }
              if (S.phase === 'WHEEL') { const c = q('[data-a=wheel]') || q('[data-a=veto]'); if (c) later(() => c.click(), 2500); }
              if (S.phase === 'LADDER') { const v = q('[data-a=catvote]'); if (v) { later(() => v.click(), 500); return; } const c = qa('[data-a=climb]:not([disabled])'); if (c.length) later(() => c[Math.floor(Math.random()*4)].click(), 1600); }
            }""")
        except Exception:
            pass
        if st and st != last:
            last = st
            n = seen.get(st, 0); seen[st] = n + 1
            if n < int(os.environ.get('PER', '1')) and re.search(ONLY, st):
                time.sleep(WAIT); k += 1
                tag = f"{k:02d}_{st.replace('|', '-')}".rstrip('-')
                tv.screenshot(path=f'{OUT}/{tag}_tv.png'); ph.screenshot(path=f'{OUT}/{tag}_phone.png')
            if st.startswith('END||ranks'):
                time.sleep(2.5); tv.screenshot(path=f'{OUT}/99_end_tv.png'); ph.screenshot(path=f'{OUT}/99_end_phone.png'); break
        # keep Vince moving in headless (no speech here)
        try:
            tv.evaluate("() => { if (window.__S && window.__S.cue && (window.__cueT||0) !== window.__S.cue.id) { window.__cueT = window.__S.cue.id; setTimeout(() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })), 1200); } }")
        except Exception:
            pass
        time.sleep(0.15)
    print('shots', k, 'errors', len(errors))
    for e in errors[:20]: print(e)
    b.close()
