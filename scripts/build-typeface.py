"""Build title lettering from the actual labs wordmark's centerline paths.

Requires fonttools[woff], skia-pathops. Run from the repository root.
The logo supplies l/a/b/s; the rest uses the same bowls, open ends and stroke.
Outfit supplies fallback characters and shaping tables, under its bundled OFL.
"""
from pathlib import Path
from math import ceil
import json
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
import xml.etree.ElementTree as ET
import pathops
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.svgLib.path import parse_path
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / "src/assets/fonts"
STROKE, SCALE, SIDE = 32, 3.6, 40
# Coordinates follow the wordmark: cap 23, shoulder 81, bowl baseline 202.
PATHS = {
 "c": "M119 97C105 86 91 81 70 81C38 81 16 105 16 142C16 177 38 202 70 202C91 202 106 195 120 184",
 "d": "M119 23V201M119 142C119 107 98 81 68 81C37 81 16 107 16 142C16 177 37 202 68 202C98 202 119 177 119 142Z",
 "e": "M18 140H119C119 103 98 81 69 81C38 81 16 106 16 142C16 177 38 202 71 202C91 202 106 195 119 184",
 "f": "M44 215V62C44 34 57 23 82 23C92 23 101 25 110 30M15 91H100",
 "g": "M119 82V210C119 244 97 263 67 263C47 263 31 257 19 246M119 142C119 107 98 81 68 81C37 81 16 107 16 142C16 177 37 202 68 202C98 202 119 177 119 142Z",
 "h": "M16 23V215M16 139C16 104 36 81 65 81C94 81 114 102 114 135V215",
 "i": "M16 81V215",
 "j": "M49 81V224Q49 262 14 262H0",
 "k": "M16 23V215M114 81L19 151M59 121L120 210",
 "m": "M16 81V215M16 135C16 101 33 81 58 81C82 81 98 100 98 130V215M98 133C98 101 116 81 141 81C166 81 181 100 181 130V215",
 "n": "M16 81V215M16 139C16 104 36 81 65 81C94 81 114 102 114 135V215",
 "o": "M120 142C120 107 99 81 68 81C37 81 16 107 16 142C16 177 37 202 68 202C99 202 120 177 120 142Z",
 "p": "M16 82V262M16 142C16 107 37 81 68 81C99 81 120 107 120 142C120 177 99 202 68 202C37 202 16 177 16 142Z",
 "q": "M119 82V262M119 142C119 107 98 81 68 81C37 81 16 107 16 142C16 177 37 202 68 202C98 202 119 177 119 142Z",
 "r": "M16 81V215M16 140C16 105 36 81 65 81C77 81 86 84 94 89",
 "t": "M44 39V176Q44 201 67 201H89M14 91H92",
 "u": "M16 81V150C16 183 34 202 64 202C95 202 114 180 114 149V81M114 149V201",
 "v": "M15 81L67 207L119 81",
 "w": "M16 81L51 207L95 93L139 207L174 81",
 "x": "M17 84L118 211M117 84L16 211",
 "y": "M15 81L67 203M121 81L52 241Q43 263 24 263H13",
 "z": "M16 91H119L17 201H121",
 "A": "M16 215L84 23L153 215M40 153H128",
 "B": "M19 201V23H81C113 23 133 39 133 65C133 92 113 110 81 110C118 110 140 126 140 154C140 183 118 201 81 201H19ZM19 110H81",
 "C": "M154 48C139 29 118 20 91 20C44 20 16 58 16 113C16 169 45 204 91 204C118 204 139 192 154 174",
 "D": "M19 23H71C128 23 157 57 157 111C157 168 128 201 71 201H19Z",
 "E": "M133 23H19V201H136M19 110H118",
 "F": "M133 23H19V215M19 110H118",
 "G": "M154 48C139 29 118 20 91 20C44 20 16 58 16 113C16 169 45 204 91 204C134 204 159 173 159 130H99",
 "H": "M19 23V215M148 23V215M19 113H148",
 "I": "M19 23V215",
 "J": "M113 23V149C113 185 97 204 68 204C42 204 24 190 16 166",
 "K": "M19 23V215M146 29L22 136M73 96L154 210",
 "L": "M19 23V176Q19 201 44 201H137",
 "M": "M19 215V23L99 145L179 23V215",
 "N": "M19 215V23L149 215V23",
 "O": "M166 112C166 56 139 20 91 20C43 20 16 56 16 112C16 168 43 204 91 204C139 204 166 168 166 112Z",
 "P": "M19 215V23H80C116 23 138 44 138 73C138 105 116 127 80 127H19",
 "Q": "M166 112C166 56 139 20 91 20C43 20 16 56 16 112C16 168 43 204 91 204C139 204 166 168 166 112ZM107 154L174 222",
 "R": "M19 215V23H80C116 23 138 44 138 73C138 105 116 127 80 127H19M82 127L147 211",
 "S": "M137 43C120 28 100 20 76 20C41 20 17 37 17 64C17 91 39 101 77 112C116 123 140 135 140 160C140 187 114 205 79 205C51 205 27 194 12 178",
 "T": "M10 23H160M85 23V215",
 "U": "M19 23V139C19 181 43 204 82 204C122 204 147 181 147 139V23",
 "V": "M16 23L88 211L160 23",
 "W": "M17 23L63 210L120 45L177 210L223 23",
 "X": "M20 27L153 212M153 27L20 212",
 "Y": "M16 27L88 123L160 27M88 123V215",
 "Z": "M19 23H151L19 201H155",
}
# Exact source paths, rather than approximations of the four logo glyphs.
tree = ET.parse(ROOT / "public/brand/xr-labs-header.svg")
ns = "{http://www.w3.org/2000/svg}"
group = next(g for g in tree.iter(ns+"g") if g.get("stroke") == "#FFFFFF")
PATHS.update(zip("labs", [p.attrib["d"] for p in group.findall(ns+"path")]))
# Retain the wordmark's short b ending with a shallower step at the baseline.
PATHS["b"] = PATHS["b"].replace("M706 23V201", "M706 23V210")
KERNING = {
    "Cr": -32, "Co": -14, "Ce": -14, "Ca": -14,
    "Pr": -30, "Po": -28, "Pe": -28, "Pa": -24,
    "De": -10, "Di": -6, "En": -8, "Eq": -8, "Bu": -8,
    "Re": -14, "Ro": -14, "Ri": -8,
    "Wh": -18, "We": -42, "Wo": -42, "Wa": -42, "Wr": -26,
    "Tr": -44, "To": -54, "Ta": -54, "Te": -54,
    "Av": -30, "Ay": -34, "Va": -40, "Vo": -40, "Ve": -40,
    "Yo": -48, "Ya": -48, "Ye": -48,
    "re": -22, "ro": -26, "ra": -16, "ri": -10,
    "ea": -6, "at": -12, "te": -22, "ct": -8, "ts": -8,
    "je": -4, "ec": -6, "cr": -18, "ty": -22, "yo": -24,
    "ry": -22, "ky": -16, "th": -10, "ti": -8, "it": -8,
    "ng": -6, "gn": -6, "ee": -4, "om": -4, "ff": -12,
}

def outline_for(char, data):
    path = pathops.Path()
    parse_path(data, path.getPen())
    path.stroke(STROKE, pathops.LineCap.BUTT_CAP, pathops.LineJoin.ROUND_JOIN, 4)
    path.convertConicsToQuads(.05)
    if char in "ij":
        x = 16 if char == "i" else 49
        dot = pathops.Path()
        dot.moveTo(x+STROKE/2, 35)
        dot.cubicTo(x+STROKE/2, 44, x+9, 51, x, 51)
        dot.cubicTo(x-9, 51, x-STROKE/2, 44, x-STROKE/2, 35)
        dot.cubicTo(x-STROKE/2, 26, x-9, 19, x, 19)
        dot.cubicTo(x+9, 19, x+STROKE/2, 26, x+STROKE/2, 35)
        dot.close()
        path = pathops.op(path, dot, pathops.PathOp.UNION)
    return pathops.simplify(path, clockwise=True)

def build():
    font = instantiateVariableFont(TTFont(FONTS/"Outfit-Variable.ttf"), {"wght":600}, inplace=True)
    cmap = font.getBestCmap()
    for char, data in PATHS.items():
        outline = outline_for(char, data)
        box = BoundsPen(None)
        outline.draw(box)
        xmin, ymin, xmax, ymax = box.bounds
        pen = TTGlyphPen(None)
        # Space j by its upright; its descender hangs under the preceding glyph.
        spacing_min = 33 if char == "j" else xmin
        transform = (SCALE, 0, 0, -SCALE, SIDE-spacing_min*SCALE, 217*SCALE)
        outline.draw(TransformPen(Cu2QuPen(pen, max_err=.3), transform))
        font["glyf"][cmap[ord(char)]] = pen.glyph()
        font["hmtx"][cmap[ord(char)]] = (ceil((xmax-spacing_min)*SCALE+2*SIDE), round(SIDE+(xmin-spacing_min)*SCALE))

    # Each new letter is spaced for its own outline; avoid old-font ligatures/kerning.
    for table in ("GSUB","GPOS","GDEF","STAT","prep","fpgm","cvt "):
        if table in font:
            del font[table]
    rules = [f"pos {cmap[ord(pair[0])]} {cmap[ord(pair[1])]} {value};" for pair,value in KERNING.items()]
    addOpenTypeFeaturesFromString(font, "feature kern {\n" + "\n".join(rules) + "\n} kern;")
    # Split-letter scroll titles use the same pair values as native font shaping.
    (FONTS/"title-kerning.json").write_text(json.dumps(KERNING, indent=2)+"\n", encoding="utf8")
    family, style = "Labs Display", "Semibold"
    for name_id in (1,2,3,4,6,16,17):
        font["name"].removeNames(nameID=name_id)
    names = {1:family, 2:style, 3:"Labs Display 2.100 Semibold",
             4:f"{family} {style}", 6:"LabsDisplay-Semibold", 16:family, 17:style}
    for name_id,value in names.items():
        font["name"].setName(value,name_id,3,1,0x409)
        font["name"].setName(value,name_id,1,0,0)
    font["name"].setName("Title alphabet drawn from the XR Labs wordmark. Outfit provides fallback characters.",10,3,1,0x409)
    font["OS/2"].usWeightClass = 600
    font["OS/2"].sxHeight = round((217-65)*SCALE)
    font["OS/2"].sCapHeight = round((217-7)*SCALE)
    font["head"].fontRevision = 2.1
    font.flavor = "woff2"
    target = FONTS/"LabsDisplay-Wordmark.woff2"
    font.save(target)
    print(f"{len(PATHS)} logo-based glyphs; {target.stat().st_size} bytes.")

if __name__ == "__main__":
    build()
