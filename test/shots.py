# Screenshots of the TV and every phone at each phase while bots play.
import json, os, sys, time, subprocess
from playwright.sync_api import sync_playwright
URL = os.environ.get('URL', 'http://localhost:3200')
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
N = os.environ.get('N', '5')
tok = os.path.join(OUT, 'tokens.json')
if os.path.exists(tok): os.remove(tok)
bots = subprocess.Popen(['node', 'test/bots.js'], env={**os.environ, 'URL': URL, 'N': N, 'TOKENS_OUT': tok, 'WAIT_START': '8000', 'MAXMS': '1500000'}, cwd='/home/claude/writers-room')
while not os.path.exists(tok): time.sleep(0.2)
time.sleep(0.3)
info = json.load(open(tok)); code = info['code']; errors = []
want = os.environ.get('PHONES', '3')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])
    tv = b.new_page(viewport={'width': 1600, 'height': 900})
    tv.on('pageerror', lambda e: errors.append(('tv', str(e))))
    tv.add_init_script(f"sessionStorage.setItem('wrHost', '{code}')")
    tv.goto(URL + '/tv/writers'); tv.click('#bOpen')
    phones = []
    for pl in info['players'][:int(want)]:
        ctx = b.new_context(viewport={'width': 390, 'height': 844})
        pg = ctx.new_page()
        pg.on('pageerror', lambda e, n=pl['name']: errors.append((n, str(e))))
        pg.add_init_script(f"localStorage.setItem('wr:token:{code}', '{pl['token']}'); localStorage.setItem('wr:code','{code}');")
        pg.goto(f"{URL}/?room={code}")
        phones.append((pl['name'], pg))
    seen = {}; last = None; t0 = time.time()
    while time.time() - t0 < 1500:
        try: st = tv.evaluate('window.__S && [window.__S.phase, window.__S.step||"", window.__S.x.kind||"", (window.__S.x.pilot||{}).i ?? ""].join("|")')
        except Exception: st = None
        if st and st != last:
            last = st; n = seen.get(st, 0); seen[st] = n + 1
            if n < 2 and __import__('re').search(os.environ.get('ONLY', '.'), st):
                time.sleep(float(os.environ.get('SHOT_WAIT', '0.9')))
                tag = f"{len(seen):02d}_{st.replace('|','-')}_{n}"
                tv.screenshot(path=f"{OUT}/{tag}_tv.png")
                for name, pg in phones: pg.screenshot(path=f"{OUT}/{tag}_{name}.png")
            if st.startswith('FINAL|board'):
                time.sleep(2); tv.screenshot(path=f"{OUT}/99_final_tv.png")
                for name, pg in phones: pg.screenshot(path=f"{OUT}/99_final_{name}.png")
                break
        time.sleep(0.12)
    b.close()
bots.wait(timeout=60)
print('errors', errors)
print('states', len(seen))
