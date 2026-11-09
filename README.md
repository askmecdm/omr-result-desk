# OMR Result Desk

A browser app that marks the **Children's Retreat 2026 Bible Quiz** OMR answer sheets (Laymen's Evangelical Fellowship) and produces ranking lists by age group, place, sub-centre, class/occupation and language.

Everything runs in the browser. No sheet, name or score is uploaded anywhere; data is kept in the browser's local storage on the computer you use.

## What it does

1. **Exam & key**: set the exam name and number of questions (up to 50), then tap or paste the answer key (A–D). One key works for all four language versions.
2. **Sheets**: add scans or phone photos (JPG/PNG), or a scanned PDF with one sheet per page. The app finds the four black corner squares, straightens the page and reads every bubble.
   - Two filled options, light marks and possible erasures are flagged as **Check** for a person to decide.
   - The handwritten header (name, age, class/occupation, place, sub-centre) is shown as an image beside the form so the operator can type it in, in any language.
3. **Places**: merge different spellings and scripts of the same place or sub-centre (e.g. *Baroda*, *Vadodara*, *વડોદરા*) before ranking.
4. **Ranking**: define your own age bands, then rank overall or within age group, place, sub-centre, age × place, age × sub-centre, class/occupation or language. Equal scores share a rank and the next score takes the next number (1, 2, 2, 3). Copy the table into Excel or download it as CSV.

Scoring: +1 for each correct answer, 0 for wrong, blank or unresolved double-marked answers.

## The answer sheets

Printable A4 sheets are in [`sheets/`](sheets/): English, Hindi, Gujarati and Telugu. The bubbles are in exactly the same position on every version.

Printing:
- Print at **100% / Actual size**, never "Fit to page".
- Make sure all four black corner squares are printed and not cut off.
- Ask candidates to fill bubbles completely with a dark pen or pencil, one per question.

Taking pictures:
- Keep all four corner squares in the frame; the sheet should fill most of the photo.
- Even light, no strong shadows across the bubbles. Sideways or upside-down photos are fine.
- A flatbed scan at 150–300 dpi gives the most reliable results.

## Using it

Open the published page (GitHub Pages) in Chrome, Edge or Firefox on a computer. A phone works for checking, but a computer is easier for typing details.

To run it locally, serve the folder with any static server, for example:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly from disk also works for images; PDF reading needs it to be served.

## Publishing with GitHub Pages

1. Push this repository to GitHub.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
4. After a minute the app is live at `https://<your-username>.github.io/<repository-name>/`.

## Files

| Path | What it is |
|---|---|
| `index.html` | The app (layout, review screens, ranking) |
| `omr-reader.js` | The bubble reader: corner-square detection, perspective correction, bubble measurement and flagging |
| `vendor/` | pdf.js 3.11.174 (Apache 2.0) for reading PDF scans |
| `sheets/` | Printable answer sheets in four languages |
| `tools/make_sheets.py`, `tools/render_pdf.py` | Rebuild the answer-sheet PDFs |
| `tests/` | Simulated filled sheets with known answers, and a test runner for the reader |

### If you change the sheet layout

The reader in `omr-reader.js` expects the exact geometry of the sheets in `sheets/` (corner squares, bubble positions and spacing). If the sheet is redesigned, update the layout constants at the top of `omr-reader.js` to match and rerun the tests.

### Rebuilding the sheets

```sh
cd tools
mkdir fonts && cd fonts
npm pack @fontsource/noto-sans @fontsource/noto-sans-devanagari @fontsource/noto-sans-gujarati @fontsource/noto-sans-telugu
for f in *.tgz; do d=${f%.tgz}; mkdir -p $d && tar xzf $f -C $d; done
cd ..
# update the version numbers in FONTS inside make_sheets.py if they differ
python3 make_sheets.py html
pip install playwright && playwright install chromium
python3 render_pdf.py html ../sheets
```

### Testing the reader

```sh
pip install pillow numpy playwright && playwright install chromium
cd tests
python3 simulate.py out 42        # makes 20 filled sheets (scans and tilted photos) with known answers
python3 run_tests.py out          # reads them with omr-reader.js and reports any mismatch
```

`simulate.py` needs `pdftoppm` (poppler-utils) to render the blank sheets.

## Before the real exam

The reader has been tested on simulated sheets only. Before exam day, print a few sheets, fill them by hand (include a double mark and a light pencil mark), photograph or scan them, and check that the results and flags match.
