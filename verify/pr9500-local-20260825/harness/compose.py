import sys
from PIL import Image, ImageDraw, ImageFont

def load_font(size, bold=False):
    paths = [
        "/System/Library/Fonts/SFNSMono.ttf",
        "/System/Library/Fonts/Menlo.ttc",
        "/System/Library/Fonts/Supplemental/Andale Mono.ttf",
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()

def compose(left_path, right_path, left_title, right_title, out, caption=None):
    a = Image.open(left_path).convert("RGB")
    b = Image.open(right_path).convert("RGB")
    h = max(a.height, b.height)
    pad, header, cap_h = 18, 46, (40 if caption else 0)
    W = a.width + b.width + pad * 3
    H = h + header + pad * 2 + cap_h
    canvas = Image.new("RGB", (W, H), (24, 25, 34))
    d = ImageDraw.Draw(canvas)
    f = load_font(20)
    fc = load_font(17)
    d.text((pad + 4, 12), left_title, font=f, fill=(255, 121, 121))
    d.text((pad * 2 + a.width + 4, 12), right_title, font=f, fill=(122, 245, 160))
    canvas.paste(a, (pad, header))
    canvas.paste(b, (pad * 2 + a.width, header))
    if caption:
        d.text((pad + 4, header + h + pad), caption, font=fc, fill=(200, 200, 210))
    canvas.save(out)
    print("wrote", out, canvas.size)

if __name__ == "__main__":
    compose(*sys.argv[1:])
