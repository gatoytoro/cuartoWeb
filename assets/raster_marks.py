"""Still-pose sunrise rasters. Geometry matches assets/sunrise.mjs. The wordmark uses Georgia because the site fonts are woff2."""

import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W_R, H_R, SUN_Y = 3.8, 2.5, 2.14
RAY_IN, RAY_W, STEP, COUNT = 1.23, 0.14, 24, 15
ARC_HALF, ARC_END, ARC_TOP, ARC_BOT = 1.876, 0.29, -0.638, -0.29
CREAM = (251, 246, 239, 255)
HORIZON = (38, 44, 52, 255)
INK = (34, 41, 48, 255)
CORAL = (238, 106, 76, 255)
RAYS = ((254, 199, 152), (248, 106, 73))
SUNS = ((220, 81, 60), (252, 121, 83), (253, 189, 135))


def ray_length(deg):
    a = abs(deg)
    return 0.52 + 0.315 * math.exp(-((a / 15) ** 2)) + 0.09 * math.exp(-(((a - 50) / 12) ** 2))


def ray_alpha(deg):
    return min(1, max(0, (90 - abs(deg)) / 12))


def quad(p0, c, p1, steps=28):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        pts.append((
            u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
            u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1],
        ))
    return pts


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw_mark(px_w):
    r = px_w / W_R
    w, h = int(round(px_w)), int(round(r * H_R))
    cx, cy = w / 2, r * SUN_Y
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    for index in range(COUNT):
        deg = index * STEP
        if deg >= 180:
            deg -= 360
        alpha = ray_alpha(deg)
        if alpha <= 0.01:
            continue
        rad = math.radians(deg)
        r0 = (RAY_IN + RAY_W / 2) * r
        r1 = (RAY_IN + ray_length(deg) - RAY_W / 2) * r
        x1, y1 = cx + math.sin(rad) * r0, cy - math.cos(rad) * r0
        x2, y2 = cx + math.sin(rad) * r1, cy - math.cos(rad) * r1
        color = (*lerp(RAYS[0], RAYS[1], 0.55), int(255 * alpha))
        width = max(1, int(round(RAY_W * r)))
        draw.line((x1, y1, x2, y2), fill=color, width=width)
        cap = width / 2
        draw.ellipse((x1 - cap, y1 - cap, x1 + cap, y1 + cap), fill=color)
        draw.ellipse((x2 - cap, y2 - cap, x2 + cap, y2 + cap), fill=color)

    disc = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    pix = disc.load()
    x0, y0 = cx - 0.85 * r, cy + 0.1 * r
    x1, y1 = cx + 0.75 * r, cy - 0.95 * r
    dx, dy = x1 - x0, y1 - y0
    span = dx * dx + dy * dy
    rad = r
    for y in range(h):
        for x in range(w):
            if (x - cx) ** 2 + (y - cy) ** 2 > rad * rad:
                continue
            t = ((x - x0) * dx + (y - y0) * dy) / span
            t = min(1, max(0, t))
            if t < 0.5:
                rgb = lerp(SUNS[0], SUNS[1], t / 0.5)
            else:
                rgb = lerp(SUNS[1], SUNS[2], (t - 0.5) / 0.5)
            pix[x, y] = (*rgb, 255)
    img.alpha_composite(disc)

    end_x = ARC_HALF * r
    left, right = (cx - end_x, cy + ARC_END * r), (cx + end_x, cy + ARC_END * r)
    top, bot = (cx, cy + ARC_TOP * r), (cx, cy + ARC_BOT * r)
    crescent = quad(left, top, right) + quad(right, bot, left)
    draw.polygon(crescent, fill=HORIZON)
    return img


def font(size, bold=False):
    name = "georgiab.ttf" if bold else "georgia.ttf"
    path = Path("C:/Windows/Fonts") / name
    if path.exists():
        return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def main(out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    mark = draw_mark(640)
    icon = Image.new("RGBA", (512, 512), CREAM)
    fitted = mark.resize((460, int(460 * mark.height / mark.width)), Image.Resampling.LANCZOS)
    icon.alpha_composite(fitted, ((512 - fitted.width) // 2, (512 - fitted.height) // 2))
    icon.resize((32, 32), Image.Resampling.LANCZOS).save(out / "favicon.png")
    icon.resize((180, 180), Image.Resampling.LANCZOS).save(out / "apple-touch-icon.png")

    og = Image.new("RGBA", (1200, 630), CREAM)
    hero = mark.resize((520, int(520 * mark.height / mark.width)), Image.Resampling.LANCZOS)
    og.alpha_composite(hero, (96, (630 - hero.height) // 2))
    draw = ImageDraw.Draw(og)
    display = font(72, bold=True)
    draw.text((680, 230), "OnePlus", font=display, fill=INK)
    one_x = 680 + draw.textlength("OnePlus", font=display)
    draw.text((one_x, 230), "One", font=display, fill=CORAL)
    draw.text((680, 330), "Dating, without the parenting part.", font=font(28), fill=(75, 62, 55, 255))
    og.convert("RGB").save(out / "og.png")


if __name__ == "__main__":
    main(sys.argv[1])
