#!/usr/bin/env python3
"""Build the site's OFL-licensed Bold webfont from Adobe's original OTF.

Requires fonttools[woff] and brotli. See README.md for the pinned source.
"""
import hashlib
import html
import json
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = Path(__file__).with_name("wechat-archive-serif-bold.woff2")
EXPECTED_SHA256 = "706b8c0de2deff6cbc0c87e2cdedfd33a78b7ffd76cebb4549012f197ba611fe"


def main():
    source = Path(sys.argv[1])
    if hashlib.sha256(source.read_bytes()).hexdigest() != EXPECTED_SHA256:
        raise SystemExit("The original OTF does not match the pinned Adobe source.")
    text = "".join(chr(i) for i in range(32, 127))
    for name in ("index.html", "styles.css", "tutorial.js", "case-data.json"):
        text += html.unescape((ROOT / name).read_text(encoding="utf-8"))
    codepoints = {ord(char) for char in text if ord(char) >= 32}
    font = TTFont(source, recalcTimestamp=False)
    covered = set(font.getBestCmap())
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_glyph = True
    options.notdef_outline = True
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=codepoints & covered)
    subsetter.subset(font)
    # Subsetting is a modification under OFL. Rename the primary family so the
    # derivative does not use Adobe's Reserved Font Name, "Source".
    names = {1: "Wechat Archive Serif", 2: "Bold", 3: "WechatArchiveSerif-Bold-1.0",
             4: "Wechat Archive Serif Bold", 6: "WechatArchiveSerif-Bold",
             16: "Wechat Archive Serif", 17: "Bold", 18: "Wechat Archive Serif Bold",
             21: "Wechat Archive Serif", 22: "Bold", 25: "WechatArchiveSerif"}
    for record in font["name"].names:
        if record.nameID in names:
            record.string = names[record.nameID].encode(record.getEncoding())
    cff = font["CFF "].cff
    cff.fontNames = ["WechatArchiveSerif-Bold"]
    for top in cff.topDictIndex:
        top.FamilyName = "Wechat Archive Serif"
        top.FullName = "Wechat Archive Serif Bold"
    font.flavor = "woff2"
    font.save(OUTPUT)
    check = TTFont(OUTPUT)
    missing = sorted(codepoints - set(check.getBestCmap()))
    print(json.dumps({"file": OUTPUT.name, "bytes": OUTPUT.stat().st_size,
                      "sha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
                      "weight": check["OS/2"].usWeightClass,
                      "glyphs": len(check.getGlyphOrder()),
                      "covered_codepoints": len(codepoints) - len(missing),
                      "missing_codepoints": [f"U+{cp:04X}" for cp in missing]},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
