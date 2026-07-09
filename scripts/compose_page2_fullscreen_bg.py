from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "backgrounds" / "layet-vm-page2-fullscreen-bg-v1.png"
ARENA = ROOT / "assets" / "backgrounds" / "battle-arena-1920x1080.png"
PLATFORM = ROOT / "assets" / "ui" / "board" / "layet-vm-clean-platform.png"

W, H = 1920, 1080


def cover(img, size):
    target_w, target_h = size
    scale = max(target_w / img.width, target_h / img.height)
    resized = img.resize((round(img.width * scale), round(img.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def contain_height(img, target_h):
    target_w = round(img.width * (target_h / img.height))
    return img.resize((target_w, target_h), Image.Resampling.LANCZOS)


def rgba(color, size=(W, H)):
    return Image.new("RGBA", size, color)


def main():
    arena = cover(Image.open(ARENA).convert("RGBA"), (W, H))
    platform = Image.open(PLATFORM).convert("RGBA")

    wide_platform = cover(platform, (W, H)).filter(ImageFilter.GaussianBlur(16))
    wide_platform = ImageEnhance.Contrast(wide_platform).enhance(1.08)
    wide_platform = ImageEnhance.Brightness(wide_platform).enhance(0.62)

    base = Image.blend(arena, wide_platform, 0.55)
    base = Image.alpha_composite(base, rgba((3, 7, 12, 118)))

    side_mist = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for x, alpha in ((0, 168), (W - 520, 168)):
        grad = Image.new("L", (520, H), 0)
        px = grad.load()
        for gx in range(520):
            edge = 1 - min(gx, 519 - gx) / 260
            value = int(max(0, min(1, edge)) * alpha)
            for gy in range(H):
                px[gx, gy] = value
        color = Image.new("RGBA", (520, H), (4, 11, 18, 0))
        color.putalpha(grad.filter(ImageFilter.GaussianBlur(42)))
        side_mist.alpha_composite(color, (x, 0))
    base = Image.alpha_composite(base, side_mist)

    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    glow_layer = Image.new("RGBA", (900, H), (42, 120, 255, 24))
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(90))
    glow.alpha_composite(glow_layer, ((W - 900) // 2, 0))
    base = Image.alpha_composite(base, glow)

    center = contain_height(platform, 1128)
    center = ImageEnhance.Contrast(center).enhance(1.07)
    center = ImageEnhance.Brightness(center).enhance(1.02)

    shadow = Image.new("RGBA", center.size, (0, 0, 0, 0))
    shadow_mask = center.split()[-1].filter(ImageFilter.GaussianBlur(28))
    shadow.putalpha(shadow_mask.point(lambda p: int(p * 0.42)))
    x = (W - center.width) // 2
    y = -28
    base.alpha_composite(shadow, (x + 6, y + 22))
    base.alpha_composite(center, (x, y))

    vignette = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    mask = Image.new("L", (W, H), 0)
    mp = mask.load()
    cx, cy = W / 2, H / 2
    for yy in range(H):
        for xx in range(W):
            dx = abs(xx - cx) / cx
            dy = abs(yy - cy) / cy
            d = (dx ** 2.2 + dy ** 2.0) ** 0.5
            mp[xx, yy] = int(max(0, min(1, (d - 0.46) / 0.54)) * 150)
    vignette.putalpha(mask.filter(ImageFilter.GaussianBlur(16)))
    base = Image.alpha_composite(base, vignette)

    bottom_haze = Image.new("RGBA", (W, 300), (4, 10, 14, 0))
    haze_alpha = Image.new("L", (W, 300), 0)
    hp = haze_alpha.load()
    for yy in range(300):
        a = int((yy / 299) ** 1.5 * 150)
        for xx in range(W):
            hp[xx, yy] = a
    bottom_haze.putalpha(haze_alpha.filter(ImageFilter.GaussianBlur(18)))
    base.alpha_composite(bottom_haze, (0, H - 300))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    base.convert("RGB").save(OUT, quality=96)
    print(OUT)


if __name__ == "__main__":
    main()
