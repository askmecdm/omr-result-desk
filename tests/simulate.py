"""Simulate filled answer sheets (scans and phone photos) with known truth."""
import json, math, random, subprocess, sys, pathlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = pathlib.Path(sys.argv[1]); OUT.mkdir(exist_ok=True)
SHEETS = pathlib.Path(__file__).resolve().parent.parent / "sheets"
DPI = 200; K = DPI / 72
W, H = 595.276, 841.89
L, R = 50, W - 50; COLW = (R - L) / 3
B = {}
for ci, (a, b) in enumerate([(1, 17), (18, 34), (35, 50)]):
    for q in range(a, b + 1):
        cy = 222 + (q - a) * 34.5
        B[q] = [(L + COLW * ci + 66 + j * 19, cy) for j in range(4)]
r = 6.5

blank = {}
for lang in ["English", "Hindi", "Gujarati", "Telugu"]:
    p = OUT / f"blank_{lang}"
    subprocess.run(["pdftoppm", "-r", str(DPI), "-png", "-singlefile", str(SHEETS / f"OMR_Sheet_50_{lang}.pdf"), str(p)], check=True)
    blank[lang] = Image.open(str(p) + ".png").convert("RGB")

def fill(d, cx, cy, style, rnd):
    px = lambda v: v * K
    if style == "pen":
        col = rnd.choice([(20, 30, 110), (15, 15, 20), (30, 40, 140)])
        ox, oy = rnd.uniform(-1.2, 1.2), rnd.uniform(-1.2, 1.2); rr = r * rnd.uniform(0.85, 1.1)
        d.ellipse([px(cx + ox - rr), px(cy + oy - rr), px(cx + ox + rr), px(cy + oy + rr)], fill=col)
    elif style == "pencil":
        g = rnd.randint(70, 110)
        for _ in range(140):
            a = rnd.uniform(0, 2 * math.pi); rad = r * 0.95 * math.sqrt(rnd.random())
            x, y = cx + rad * math.cos(a), cy + rad * math.sin(a)
            d.line([px(x - 1.5), px(y - 1), px(x + 1.5), px(y + 1)], fill=(g, g, g), width=3)
    elif style == "scribble":  # quick hatching that mostly covers
        col = (25, 35, 120)
        for t in range(9):
            yy = cy - r * 0.85 + t * r * 0.21
            half = math.sqrt(max(0, r * r - (yy - cy) ** 2)) * 0.95
            d.line([px(cx - half), px(yy), px(cx + half), px(yy + 0.3)], fill=col, width=int(K * 1.8))
    elif style == "faint":  # light pencil touch
        g = rnd.randint(160, 185)
        for _ in range(35):
            a = rnd.uniform(0, 2 * math.pi); rad = r * 0.8 * math.sqrt(rnd.random())
            x, y = cx + rad * math.cos(a), cy + rad * math.sin(a)
            d.line([px(x - 1.2), px(y - 0.6), px(x + 1.2), px(y + 0.6)], fill=(g, g, g), width=2)
    elif style == "erased":
        g = rnd.randint(195, 215)
        d.ellipse([px(cx - r * .9), px(cy - r * .9), px(cx + r * .9), px(cy + r * .9)], fill=(g, g, g))
    elif style == "circled":
        d.ellipse([px(cx - r - 3.5), px(cy - r - 3), px(cx + r + 3.5), px(cy + r + 3)], outline=(20, 30, 110), width=int(K * 1.2))
    elif style == "tick":
        d.line([px(cx - 4), px(cy), px(cx - 1), px(cy + 4), px(cx + 7), px(cy - 7)], fill=(20, 30, 110), width=int(K * 1.1))

def make(i, rnd, lang, kind):
    img = blank[lang].copy(); d = ImageDraw.Draw(img)
    # handwriting in header
    d.line([170 * K / 1.0 / 1, 100 * K, 300 * K, 104 * K], fill=(20, 30, 110), width=4)
    truth = []
    for q in range(1, 51):
        u = rnd.random()
        ans = rnd.randrange(4)
        if u < 0.06: truth.append({"resp": None, "flag": None}); continue                  # left blank
        if u < 0.09:                                                                       # double
            other = (ans + rnd.randint(1, 3)) % 4
            fill(d, *B[q][ans], "pen", rnd); fill(d, *B[q][other], "pen", rnd)
            truth.append({"resp": None, "flag": "double"}); continue
        if u < 0.11:                                                                       # faint only
            fill(d, *B[q][ans], "faint", rnd); truth.append({"resp": None, "flag": "faint"}); continue
        if u < 0.13:                                                                       # circled (should not count)
            fill(d, *B[q][ans], "circled", rnd); truth.append({"resp": None, "flag": "any"}); continue
        if u < 0.15:                                                                       # erased then re-marked
            other = (ans + rnd.randint(1, 3)) % 4
            fill(d, *B[q][other], "erased", rnd); fill(d, *B[q][ans], "pen", rnd)
            truth.append({"resp": ans, "flag": "any"}); continue
        style = rnd.choice(["pen", "pen", "pencil", "scribble"])
        fill(d, *B[q][ans], style, rnd); truth.append({"resp": ans, "flag": None})
    arr = np.asarray(img).astype(np.float32)
    h, w = arr.shape[:2]
    if kind == "scan":
        im = Image.fromarray(arr.astype(np.uint8)).rotate(rnd.uniform(-2.5, 2.5), resample=Image.BICUBIC, expand=True, fillcolor=(255, 255, 255))
        if rnd.random() < 0.3: im = im.rotate(180)
        im = im.resize((int(im.width * 0.75), int(im.height * 0.75)))
    else:
        # phone photo: page on a darker table, perspective, lighting gradient, blur, noise
        bg = Image.new("RGB", (int(w * 1.35), int(h * 1.25)), tuple(rnd.randint(60, 140) for _ in range(3)))
        ox, oy = int(w * 0.17), int(h * 0.12)
        bg.paste(Image.fromarray(arr.astype(np.uint8)), (ox, oy))
        jit = lambda: rnd.uniform(-0.05, 0.05) * w
        src = [(ox + jit(), oy + jit()), (ox + w + jit(), oy + jit()), (ox + w + jit(), oy + h + jit()), (ox + jit(), oy + h + jit())]
        BW, BH = bg.size
        dst = [(0, 0), (BW, 0), (BW, BH), (0, BH)]
        # find coeffs mapping output->input for PIL
        def coeffs(pa, pb):
            M = []
            for (x, y), (X, Y) in zip(pa, pb):
                M.append([x, y, 1, 0, 0, 0, -X * x, -X * y]); M.append([0, 0, 0, x, y, 1, -Y * x, -Y * y])
            return np.linalg.solve(np.array(M), np.array(pb).reshape(8)).tolist()
        # warp so the page looks tilted: map a slightly skewed quad of output to the page corners
        outq = [(BW * .12 + jit(), BH * .08 + jit()), (BW * .88 + jit(), BH * .1 + jit()), (BW * .9 + jit(), BH * .92 + jit()), (BW * .1 + jit(), BH * .9 + jit())]
        pagec = [(ox, oy), (ox + w, oy), (ox + w, oy + h), (ox, oy + h)]
        im = bg.transform(bg.size, Image.PERSPECTIVE, coeffs(outq, pagec), Image.BICUBIC, fillcolor=(90, 80, 70))
        a = np.asarray(im).astype(np.float32)
        yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
        shade = 0.72 + 0.28 * (xx / a.shape[1]) * rnd.uniform(.6, 1) + 0.1 * (yy / a.shape[0])
        a = np.clip(a * shade[..., None] + np.random.normal(0, 4, a.shape), 0, 255)
        im = Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.GaussianBlur(rnd.uniform(0.5, 1.4)))
        if rnd.random() < 0.3: im = im.rotate(90, expand=True)
        im = im.resize((int(im.width * 0.55), int(im.height * 0.55)))
    name = f"{i:02d}_{lang}_{kind}.jpg"
    im.save(OUT / name, quality=rnd.randint(70, 90))
    return {"file": name, "truth": truth}

rnd = random.Random(int(sys.argv[2]) if len(sys.argv) > 2 else 42)
cases = []
i = 0
for lang in ["English", "Hindi", "Gujarati", "Telugu"]:
    for kind in ["scan", "scan", "photo", "photo", "photo"]:
        cases.append(make(i, rnd, lang, kind)); i += 1
json.dump(cases, open(OUT / "truth.json", "w"))
print(len(cases), "sheets")
