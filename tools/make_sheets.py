"""Builds the OMR sheet in four languages with identical bubble geometry.
Geometry mirrors make_sheet.py (points, top-down)."""
import base64, json, pathlib, sys

FD = pathlib.Path(__file__).parent / "fonts"  # unpacked @fontsource packages, see README
def font(path): return base64.b64encode((FD / path).read_bytes()).decode()

FONTS = {
  "latin": ("fontsource-noto-sans-5.3.0/package/files/noto-sans-latin-400-normal.woff2", "fontsource-noto-sans-5.3.0/package/files/noto-sans-latin-700-normal.woff2"),
  "deva": ("fontsource-noto-sans-devanagari-5.3.0/package/files/noto-sans-devanagari-devanagari-400-normal.woff2", "fontsource-noto-sans-devanagari-5.3.0/package/files/noto-sans-devanagari-devanagari-700-normal.woff2"),
  "gujr": ("fontsource-noto-sans-gujarati-5.3.0/package/files/noto-sans-gujarati-gujarati-400-normal.woff2", "fontsource-noto-sans-gujarati-5.3.0/package/files/noto-sans-gujarati-gujarati-700-normal.woff2"),
  "telu": ("fontsource-noto-sans-telugu-5.3.0/package/files/noto-sans-telugu-telugu-400-normal.woff2", "fontsource-noto-sans-telugu-5.3.0/package/files/noto-sans-telugu-telugu-700-normal.woff2"),
}

T = {
 "English": dict(script=None, retreat="CHILDREN'S RETREAT 2026", title="Answer Sheet – Bible Quiz",
   name="Name", age="Age", cls="Class / Occupation", lang="Language", lang_val="English", place="Place", sub="Sub-Centre",
   ins1="Instruction: Use a dark blue/black pen or pencil. Fill the bubble completely.",
   ins2="Mark only ONE option per question. Do not circle, tick or cross.",
   ok="Correct", bad="Wrong (circle, tick, half)",
   foot="Do not fold or staple this sheet. Keep the four black corner squares clean."),
 "Hindi": dict(script="deva", retreat="बच्चों का रिट्रीट 2026 · Children's Retreat 2026",
   title="उत्तर पत्रक – बाइबल प्रश्नोत्तरी · Bible Quiz",
   name="नाम", age="आयु (वर्ष)", cls="कक्षा / व्यवसाय", lang="भाषा", lang_val="हिंदी (Hindi)",
   place="स्थान", sub="उप-केंद्र",
   ins1="निर्देश: गहरे नीले/काले पेन या पेंसिल का उपयोग करें। गोले को पूरा भरें।",
   ins2="हर प्रश्न में केवल एक ही गोला भरें। घेरा, टिक (✓) या क्रॉस (✗) न लगाएँ।",
   ok="सही", bad="गलत (घेरा, टिक, आधा)",
   foot="इस पत्रक को मोड़ें या स्टेपल न करें। चारों कोनों के काले चौकोर साफ़ रखें।"),
 "Gujarati": dict(script="gujr", retreat="બાળકોની રિટ્રીટ 2026 · Children's Retreat 2026",
   title="ઉત્તરપત્રક – બાઇબલ પ્રશ્નોત્તરી · Bible Quiz",
   name="નામ", age="ઉંમર (વર્ષ)", cls="ધોરણ / વ્યવસાય", lang="ભાષા", lang_val="ગુજરાતી (Gujarati)",
   place="સ્થળ", sub="પેટા-કેન્દ્ર",
   ins1="સૂચના: ઘેરા વાદળી/કાળી પેન અથવા પેન્સિલ વાપરો. વર્તુળ પૂરેપૂરું ભરો.",
   ins2="દરેક પ્રશ્નમાં ફક્ત એક જ વર્તુળ ભરો. ગોળ કુડાળું, ટિક (✓) કે ચોકડી (✗) ન કરો.",
   ok="સાચું", bad="ખોટું (કુડાળું, ટિક, અડધું)",
   foot="આ પત્રકને વાળશો નહીં કે સ્ટેપલ કરશો નહીં. ચારે ખૂણાના કાળા ચોરસ સ્વચ્છ રાખો."),
 "Telugu": dict(script="telu", retreat="పిల్లల రిట్రీట్ 2026 · Children's Retreat 2026",
   title="జవాబు పత్రం – బైబిల్ క్విజ్ · Bible Quiz",
   name="పేరు", age="వయస్సు (సంవత్సరాలు)", cls="తరగతి / వృత్తి", lang="భాష", lang_val="తెలుగు (Telugu)",
   place="ప్రాంతం", sub="ఉప-కేంద్రం",
   ins1="సూచన: ముదురు నీలం/నలుపు పెన్ లేదా పెన్సిల్ వాడండి. వృత్తాన్ని పూర్తిగా నింపండి.",
   ins2="ప్రతి ప్రశ్నకు ఒక్క వృత్తాన్ని మాత్రమే నింపండి. చుట్టూ గుండ్రం, టిక్ (✓) లేదా క్రాస్ (✗) పెట్టవద్దు.",
   ok="సరైనది", bad="తప్పు (గుండ్రం, టిక్, సగం)",
   foot="ఈ పత్రాన్ని మడవవద్దు, స్టేపుల్ చేయవద్దు. నాలుగు మూలల నల్ల చతురస్రాలను శుభ్రంగా ఉంచండి."),
}
T["Hindi"]["age"]="आयु"; T["Gujarati"]["age"]="ઉંમર"; T["Telugu"]["age"]="వయస్సు"
T["Hindi"]["foot"] = "इस पत्रक को न मोड़ें और न ही स्टेपल करें। चारों कोनों के काले चौकोर साफ़ रखें।"
for _t in T.values():
    for _k in ("ins2",):
        _t[_k] = _t[_k].replace(" (✓)", "").replace(" (✗)", "")
ENG = dict(name="Name", age="Age", cls="Class / Occupation", lang="Language", place="Place", sub="Sub-Centre")

W, H = 595.276, 841.89
M, S = 22, 16
L, R = 50, W - 50
box_top, box_bot = 200, 806
colw = (R - L) / 3
r, gap, pitch, first = 6.5, 19, 34.5, box_top + 22
cols = [(1, 17), (18, 34), (35, 50)]

def svg_grid():
    o = []
    for x, t in [(M, M), (W - M - S, M), (M, H - M - S), (W - M - S, H - M - S)]:
        o.append(f'<rect x="{x}" y="{t}" width="{S}" height="{S}" fill="#000"/>')
    o.append(f'<line x1="{L}" y1="88" x2="{R}" y2="88" stroke="#000" stroke-width="0.8"/>')
    o.append(f'<rect x="{L}" y="{box_top}" width="{R-L}" height="{box_bot-box_top}" fill="none" stroke="#000" stroke-width="0.8"/>')
    for i in (1, 2):
        x = L + colw * i
        o.append(f'<line x1="{x}" y1="{box_top}" x2="{x}" y2="{box_bot}" stroke="#000" stroke-width="0.8"/>')
    for ci, (a, b) in enumerate(cols):
        x0 = L + colw * ci
        for k, q in enumerate(range(a, b + 1)):
            cy = first + k * pitch
            o.append(f'<text x="{x0+52}" y="{cy+3.5}" font-size="10" text-anchor="end">{q}.</text>')
            for j, opt in enumerate("ABCD"):
                cx = x0 + 66 + j * gap
                o.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#000" stroke-width="0.9"/>')
                o.append(f'<text x="{cx}" y="{cy+r+7.5}" font-size="6.5" text-anchor="middle">{opt}</text>')
    # marking example
    ey, ex, er = 181, 400, 5.5
    o.append(f'<circle cx="{ex}" cy="{ey}" r="{er}" fill="#000" stroke="#000"/>')
    x2 = ex + 40
    o.append(f'<circle cx="{x2}" cy="{ey}" r="{er}" fill="none" stroke="#000"/><ellipse cx="{x2}" cy="{ey}" rx="10" ry="8" fill="none" stroke="#000"/>')
    x3 = ex + 80
    o.append(f'<circle cx="{x3}" cy="{ey}" r="{er}" fill="none" stroke="#000"/><polyline points="{x3-4},{ey} {x3-1},{ey+4} {x3+6},{ey-6}" fill="none" stroke="#000" stroke-width="1.3"/>')
    x4 = ex + 120
    o.append(f'<circle cx="{x4}" cy="{ey}" r="{er}" fill="none" stroke="#000"/><path d="M{x4},{ey-er} A{er},{er} 0 0 0 {x4},{ey+er} Z" fill="#000"/>')
    return "\n".join(o)

def field(label, en, x0, x1, base, value=""):
    lab = label if label == en else f"{label} / {en}"
    return (f'<div class="fld" style="left:{x0}pt;width:{x1-x0}pt;top:{base-13}pt">'
            f'<span class="lab">{lab}:</span><span class="line">{value}</span></div>')

def page(lang):
    t = T[lang]
    faces = ""
    fam = ["NS"]
    for key in ["latin"] + ([t["script"]] if t["script"] else []):
        for wi, wt in enumerate((400, 700)):
            faces += f'@font-face{{font-family:"NS-{key}";font-weight:{wt};src:url(data:font/woff2;base64,{font(FONTS[key][wi])}) format("woff2")}}\n'
    stack = ",".join(f'"NS-{k}"' for k in (["latin"] + ([t["script"]] if t["script"] else [])))
    fields = (field(t["name"], ENG["name"], L, 372, 106) + field(t["age"], ENG["age"], 388, R, 106)
              + field(t["cls"], ENG["cls"], L, 372, 128) + field(t["lang"], ENG["lang"], 388, R, 128, t["lang_val"])
              + field(t["place"], ENG["place"], L, 300, 150) + field(t["sub"], ENG["sub"], 316, R, 150))
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
{faces}
@page{{size:{W}pt {H}pt;margin:0}}
html,body{{margin:0;padding:0}}
body{{width:{W}pt;height:{H}pt;position:relative;font-family:{stack},sans-serif;color:#000;overflow:hidden}}
svg{{position:absolute;left:0;top:0;font-family:{stack},sans-serif}}
.abs{{position:absolute;white-space:nowrap}}
.fld{{position:absolute;display:flex;align-items:flex-end;gap:5pt;height:15pt;font-size:9.5pt}}
.lab{{white-space:nowrap;line-height:1}}
.line{{flex:1;border-bottom:0.8pt solid #000;height:13pt;font-size:9pt;line-height:13pt;padding-left:4pt;white-space:nowrap;overflow:hidden;color:#000}}
.ins{{position:absolute;left:{L}pt;top:158pt;width:338pt;font-size:8.6pt;line-height:1.3}}
.ins b{{font-weight:700}}
.cap{{position:absolute;font-size:7.5pt;text-align:center;line-height:1.15}}
</style></head><body>
<svg width="{W}pt" height="{H}pt" viewBox="0 0 {W} {H}">{svg_grid()}</svg>
<div class="abs" style="left:{L}pt;top:31pt;font-size:11pt;font-weight:700">Laymen’s Evangelical Fellowship</div>
<div class="abs" style="left:{L}pt;top:45pt;font-size:8.5pt">{t["retreat"]}</div>
<div class="abs" style="left:{L}pt;top:57pt;font-size:8.5pt">Vikhroli (W), Mumbai – 400079</div>
<div class="abs" style="left:{L}pt;top:69pt;font-size:8.5pt">{t["title"]}</div>
{fields}
<div class="ins"><b>{t["ins1"]}</b><br>{t["ins2"]}</div>
<div class="cap" style="left:380pt;top:189pt;width:40pt">{t["ok"]}</div>
<div class="cap" style="left:425pt;top:189pt;width:130pt">{t["bad"]}</div>
<div class="abs" style="left:0;width:{W}pt;top:{box_bot+6}pt;text-align:center;font-size:7pt;color:#555">{t["foot"]}</div>
</body></html>"""

out = pathlib.Path(sys.argv[1]); out.mkdir(exist_ok=True)
for lang in T:
    (out / f"{lang}.html").write_text(page(lang), encoding="utf-8")
print("ok")
