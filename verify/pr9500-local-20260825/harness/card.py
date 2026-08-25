import sys
from PIL import Image, ImageDraw, ImageFont

def font(sz, bold=False):
    for p in (["/System/Library/Fonts/SFNSMono.ttf"] if not bold else
              ["/System/Library/Fonts/SFNSMono.ttf"]):
        try: return ImageFont.truetype(p, sz)
        except Exception: pass
    return ImageFont.load_default()

def render(lines, out, width=1400, lh=26, pad=26):
    f = font(19)
    fb = font(23)
    H = pad*2 + lh*len(lines)
    img = Image.new("RGB", (width, H), (24,25,34))
    d = ImageDraw.Draw(img)
    y = pad
    for kind, text in lines:
        col = {"h": (189,147,249), "ok": (122,245,160), "bad": (255,121,121),
               "dim": (150,152,170), "n": (230,230,238)}[kind]
        d.text((pad, y), text, font=(fb if kind=="h" else f), fill=col)
        y += lh
    img.save(out)
    print("wrote", out, img.size)
