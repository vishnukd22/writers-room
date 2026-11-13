# Screenshots of the BID-COIN! TV and one human phone while bots fill the other seats.
# Usage: URL=http://localhost:3400 BOTS=4 python3 test/bc-shots.py OUTDIR
import os, sys, time, re
from playwright.sync_api import sync_playwright
URL = os.environ.get('URL', 'http://localhost:3400')
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
BOTS = int(os.environ.get('BOTS', '4'))
WAIT = float(os.environ.get('SHOT_WAIT', '1.2'))
ONLY = os.environ.get('ONLY', '.')
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    tv = b.new_page(viewport={'width': 1600, 'height': 900})
    tv.on('pageerror', lambda e: errors.append(('tv', str(e))))
    tv.goto(URL + ('/tv/bidcoin' if os.environ.get('PHONEBOTS') else '/tv/bidcoin?test')); tv.click('#bOpen')
    tv.wait_for_function('window.__S && window.__S.code')
    code = tv.evaluate('window.__S.code')
    ph = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True).new_page()
    ph.on('pageerror', lambda e: errors.append(('phone', str(e))))
    ph.goto(f'{URL}/bc?room={code}' + ('' if os.environ.get('PHONEBOTS') else '&test')); ph.fill('#jname', 'Vishnu'); ph.click('#jform button')
    ph.wait_for_function('window.__S && window.__S.me')
    for i in range(BOTS):
        if os.environ.get('PHONEBOTS'): ph.click('[data-a=addBot]')
        else: tv.click('[data-tv=bot]')
        time.sleep(0.25)
    time.sleep(0.8)
    tv.screenshot(path=f'{OUT}/00_lobby_tv.png'); ph.screenshot(path=f'{OUT}/00_lobby_phone.png')
    ph.click('[data-a=start]')
    seen = {}; last = None; t0 = time.time(); k = 0
    while time.time() - t0 < float(os.environ.get('MAXS', '900')):
        try:
            st = tv.evaluate('window.__S && [__S.phase, __S.step||"", (__S.locker&&__S.locker.n)||0, (__S.x.step||"")].join("|")')
        except Exception:
            st = None
        # the human phone plays too
        try:
            ph.evaluate("""() => {
              const q = (s) => document.querySelector(s);
              if (window.__busy) return;
              const S = window.__S; if (!S) return;
              let b = null;
              if (S.phase === 'PEEK') b = q('.pcard.live') || q('[data-a=ready]:not([disabled])');
              if (S.phase === 'AUCTION') { const bb = q('.bid.b100:not([disabled])'); if (bb && S.auc && S.auc.price < 1200 && Math.random() < 0.12) { bb.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return; } if (Math.random() < 0.01) b = q('.pcard.live'); }
              if (S.phase === 'BET') b = q('[data-a=bet]:not([disabled])');
              if (S.phase === 'AFTER') b = q('.pcard.live') || q('[data-a=pass]');
              if (q('#picker:not([hidden]) [data-a=target]')) b = q('#picker [data-a=target]');
              if (b) { window.__busy = true; setTimeout(() => { b.click(); window.__busy = false; }, 900); }
            }""")
        except Exception:
            pass
        if st and st != last:
            last = st
            base = re.sub(r'\|\d+\|', '|', st)
            n = seen.get(base, 0); seen[base] = n + 1
            if n < int(os.environ.get('PER', '1')) and re.search(ONLY, st):
                time.sleep(WAIT); k += 1
                tag = f"{k:02d}_{st.replace('|', '-')}"
                tv.screenshot(path=f'{OUT}/{tag}_tv.png'); ph.screenshot(path=f'{OUT}/{tag}_phone.png')
            if st.startswith('END|ranks'):
                time.sleep(2.5); tv.screenshot(path=f'{OUT}/99_end_tv.png'); ph.screenshot(path=f'{OUT}/99_end_phone.png'); break
        time.sleep(0.12)
    b.close()
print('errors', errors)
print('states', len(seen))
