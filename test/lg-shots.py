# Screenshots of the Land Grab TV and one human phone while bots fill the other seats.
# Usage: URL=http://localhost:3400 BOTS=6 python3 test/lg-shots.py OUTDIR
import os, sys, time, re
from playwright.sync_api import sync_playwright
URL = os.environ.get('URL', 'http://localhost:3400')
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
BOTS = int(os.environ.get('BOTS', '6'))
WAIT = float(os.environ.get('SHOT_WAIT', '1.6'))
ONLY = os.environ.get('ONLY', '.')
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    tv = b.new_page(viewport={'width': 1600, 'height': 900})
    tv.on('pageerror', lambda e: errors.append(('tv', str(e))))
    tv.goto(URL + '/tv/landgrab?test'); tv.click('#bOpen')
    tv.wait_for_function('window.__S && window.__S.code')
    code = tv.evaluate('window.__S.code')
    ph = b.new_context(viewport={'width': 390, 'height': 844}).new_page()
    ph.on('pageerror', lambda e: errors.append(('phone', str(e))))
    ph.goto(f'{URL}/lg?room={code}&test'); ph.fill('#jname', 'Vishnu'); ph.click('#jform button')
    ph.wait_for_function('window.__S && window.__S.me')
    ph.click('.pickbust:not([disabled])')
    for i in range(BOTS):
        tv.click('[data-tv=bot]'); time.sleep(0.15)
    time.sleep(0.8)
    tv.screenshot(path=f'{OUT}/00_lobby_tv.png'); ph.screenshot(path=f'{OUT}/00_lobby_phone.png')
    ph.click('[data-a=start]')
    seen = {}; last = None; t0 = time.time(); k = 0
    while time.time() - t0 < float(os.environ.get('MAXS', '900')):
        try:
            st = tv.evaluate('window.__S && [__S.phase, __S.step||"", __S.reg.length, (__S.x.kind||"")].join("|")')
        except Exception:
            st = None
        # the human phone plays too: press whatever its turn needs
        try:
            ph.evaluate("""() => {
              const q = (s) => document.querySelector(s);
              const b = q('[data-a=ready]') || q('[data-a=nominate]') || q('.yn [data-a=vote]:not(.on)') || q('[data-a=confirm]') || q('[data-a=choose]') || q('[data-a=claim]') || q('[data-a=power]') || q('[data-a=vetoAnswer]');
              if (b && !window.__busy) { window.__busy = true; setTimeout(() => { b.click(); window.__busy = false; }, 2200); }
            }""")
        except Exception:
            pass
        if st and st != last:
            last = st
            base = st if st.startswith('TUTORIAL') else re.sub(r'\|\d+\|', '|', st)
            n = seen.get(base, 0); seen[base] = n + 1
            if n < 1 and re.search(ONLY, st):
                time.sleep(WAIT); k += 1
                tag = f"{k:02d}_{st.replace('|', '-')}"
                tv.screenshot(path=f'{OUT}/{tag}_tv.png'); ph.screenshot(path=f'{OUT}/{tag}_phone.png')
            if st.startswith('END|reveal'):
                time.sleep(2.5); tv.screenshot(path=f'{OUT}/99_end_tv.png'); ph.screenshot(path=f'{OUT}/99_end_phone.png'); break
        time.sleep(0.15)
    b.close()
print('errors', errors)
print('states', len(seen))
