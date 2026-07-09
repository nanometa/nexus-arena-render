import json
import re
import shutil
from pathlib import Path

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "src" / "LayetGame" / "cards.generated.js"
DIGITS_DIR = ROOT / "assets" / "cards" / "points" / "user-white"
BACKUP_ROOT = ROOT / "assets" / "cards" / "generated-filtered-original-before-points"


def load_catalog():
    text = MANIFEST.read_text(encoding="utf-8-sig")
    match = re.search(r"export const CARD_CATALOG = (\[.*?\]);", text, flags=re.S)
    if not match:
      raise RuntimeError("Could not find CARD_CATALOG in cards.generated.js")
    return json.loads(match.group(1))


def load_digit(ch, target_h):
    digit = Image.open(DIGITS_DIR / f"point_{ch}_white.png").convert("RGBA")
    bbox = digit.getbbox()
    if not bbox:
        raise RuntimeError(f"Empty digit asset: {ch}")
    digit = digit.crop(bbox)
    scale = target_h / digit.height
    return digit.resize((round(digit.width * scale), target_h), Image.Resampling.LANCZOS)


def compose_number(size, score):
    width, height = size
    target_h = round(height * 0.078)
    gap = round(width * 0.01)
    glyphs = [load_digit(ch, target_h) for ch in str(score)]
    total_w = sum(g.width for g in glyphs) + gap * (len(glyphs) - 1)
    x = round((width - total_w) / 2)
    y = round(height * 0.728)

    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    cursor = x
    for glyph in glyphs:
        layer.alpha_composite(glyph, (cursor, y))
        cursor += glyph.width + gap
    return layer


def apply_score(card):
    src = ROOT / card["image"].lstrip("/")
    backup = BACKUP_ROOT / src.relative_to(ROOT / "assets" / "cards" / "generated-filtered")
    backup.parent.mkdir(parents=True, exist_ok=True)
    if not backup.exists():
        shutil.copy2(src, backup)

    base = Image.open(backup).convert("RGBA")
    number = compose_number(base.size, card["score"])

    shadow_alpha = number.getchannel("A").filter(ImageFilter.GaussianBlur(round(base.width * 0.008)))
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 175))
    shadow.putalpha(shadow_alpha)

    outline_alpha = number.getchannel("A").filter(ImageFilter.GaussianBlur(max(1, round(base.width * 0.002))))
    outline = Image.new("RGBA", base.size, (0, 0, 0, 215))
    outline.putalpha(outline_alpha)

    out = Image.alpha_composite(base, shadow)
    out = Image.alpha_composite(out, outline)
    out = Image.alpha_composite(out, number)
    out.save(src)


def main():
    catalog = load_catalog()
    for card in catalog:
        apply_score(card)
    print(f"Applied point digits to {len(catalog)} cards.")
    print(f"Backup root: {BACKUP_ROOT}")


if __name__ == "__main__":
    main()
