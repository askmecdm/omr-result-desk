import asyncio, base64, json, sys, pathlib
from playwright.async_api import async_playwright
D = pathlib.Path(sys.argv[1]); cases = json.load(open(D / "truth.json"))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--allow-file-access-from-files"])
        pg = await b.new_page(); await pg.goto((pathlib.Path(__file__).parent / "harness.html").resolve().as_uri())
        tot = dict(q=0, correct=0, wrong=0, missed_flag=0, extra_flag=0)
        for c in cases:
            r = await pg.evaluate("b=>readB64(b)", base64.b64encode((D / c["file"]).read_bytes()).decode())
            if not r["ok"]: print(c["file"], "FAIL", r["error"]); continue
            errs = []
            for q, t in enumerate(c["truth"]):
                got, fl = r["resp"][q], r["flags"][q]
                tot["q"] += 1
                if t["flag"] in ("double", "faint"):
                    if fl is None and got is None: tot["missed_flag"] += 1; errs.append(f"Q{q+1} want {t['flag']} got blank")
                    elif fl is None: tot["wrong"] += 1; errs.append(f"Q{q+1} want {t['flag']} got {got} unflagged")
                    else: tot["correct"] += 1
                elif t["flag"] == "any":
                    if got == t["resp"] or fl: tot["correct"] += 1
                    else: tot["wrong"] += 1; errs.append(f"Q{q+1} want {t['resp']} got {got}")
                else:
                    if got == t["resp"] and fl is None: tot["correct"] += 1
                    elif fl: tot["extra_flag"] += 1; errs.append(f"Q{q+1} want {t['resp']} flagged {fl} (fills {[round(x,2) for x in r['fills'][q]]})")
                    else: tot["wrong"] += 1; errs.append(f"Q{q+1} want {t['resp']} got {got} fills {[round(x,2) for x in r['fills'][q]]}")
            print(c["file"], "rot", r["rotated"], "align", r["alignment"], "markT", round(r["markT"],2), f"{r['ms']}ms", "OK" if not errs else errs)
        print(tot)
        await b.close()
asyncio.run(main())
