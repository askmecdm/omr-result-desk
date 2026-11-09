import asyncio, pathlib, sys
from playwright.async_api import async_playwright
src, dst = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page()
        for f in sorted(src.glob("*.html")):
            await pg.goto(f.resolve().as_uri()); await pg.evaluate("document.fonts.ready")
            await pg.pdf(path=str(dst / f"OMR_Sheet_50_{f.stem}.pdf"), print_background=True, prefer_css_page_size=True)
        await b.close()
asyncio.run(main())
