import io, os, struct
import cairosvg
from PIL import Image, ImageDraw

BASE = os.path.dirname(os.path.abspath(__file__))
SVG = os.path.join(BASE, "svg")
PNG = os.path.join(BASE, "png")
os.makedirs(PNG, exist_ok=True)

MASTER = os.path.join(SVG, "planmapper-icon.svg")
TUNED = {24: os.path.join(SVG, "planmapper-icon-24.svg"),
         16: os.path.join(SVG, "planmapper-icon-16.svg")}


def render(src, size):
    buf = cairosvg.svg2png(url=src, output_width=size, output_height=size)
    return Image.open(io.BytesIO(buf)).convert("RGBA")


def render_str(svg_text, size):
    buf = cairosvg.svg2png(bytestring=svg_text.encode(), output_width=size, output_height=size)
    return Image.open(io.BytesIO(buf)).convert("RGBA")


SIZES = [1024, 512, 256, 128, 64, 48, 32, 24, 16]
imgs = {}
for s in SIZES:
    src = TUNED.get(s, MASTER)
    im = render(src, s)
    imgs[s] = im
    im.save(os.path.join(PNG, f"planmapper-{s}.png"))

# monochrome PNGs (dark glyph for light UI, light glyph for dark UI)
mono_src = open(os.path.join(SVG, "planmapper-icon-mono.svg")).read()
for name, colour in (("dark", "#1A1A18"), ("light", "#FFFFFF")):
    for s in (32, 24, 16):
        txt = mono_src.replace("currentColor", colour)
        render_str(txt, s).save(os.path.join(PNG, f"planmapper-mono-{name}-{s}.png"))

# ---- ICO (Windows) ----
ico_sizes = [256, 128, 64, 48, 32, 24, 16]
imgs[256].save(os.path.join(BASE, "planmapper.ico"), format="ICO",
               sizes=[(s, s) for s in ico_sizes],
               append_images=[imgs[s] for s in ico_sizes if s != 256])

# ---- ICNS (macOS) ----
ICNS_MAP = [("icp4", 16), ("icp5", 32), ("ic07", 128), ("ic08", 256),
            ("ic09", 512), ("ic10", 1024), ("ic11", 32), ("ic12", 64),
            ("ic13", 256), ("ic14", 512)]
chunks = b""
for tag, s in ICNS_MAP:
    b = io.BytesIO()
    imgs[s].save(b, format="PNG")
    data = b.getvalue()
    chunks += tag.encode("ascii") + struct.pack(">I", len(data) + 8) + data
icns = b"icns" + struct.pack(">I", len(chunks) + 8) + chunks
open(os.path.join(BASE, "planmapper.icns"), "wb").write(icns)

# ---- QA contact sheet ----
row = [256, 128, 64, 48, 32, 24, 16]
W, H = 900, 640
sheet = Image.new("RGBA", (W, H), (245, 244, 239, 255))
d = ImageDraw.Draw(sheet)

# actual-size strip on light
x = 30
for s in row:
    sheet.alpha_composite(imgs[s], (x, 30 + (256 - s) // 2))
    x += s + 24

# actual-size strip on dark
d.rectangle([0, 310, W, 470], fill=(32, 32, 30, 255))
x = 30
for s in row:
    sheet.alpha_composite(imgs[s].resize((min(s, 128), min(s, 128)), Image.LANCZOS)
                          if s > 128 else imgs[s], (x, 330 + (128 - min(s, 128)) // 2))
    x += min(s, 128) + 24

# 6x zoom of the small tuned sizes
x = 30
for s in (32, 24, 16):
    z = imgs[s].resize((s * 6, s * 6), Image.NEAREST)
    sheet.alpha_composite(z, (x, 500))
    x += s * 6 + 30

sheet.convert("RGB").save(os.path.join(BASE, "preview.png"), quality=95)

print("png files:", sorted(os.listdir(PNG)))
print("ico bytes:", os.path.getsize(os.path.join(BASE, "planmapper.ico")))
print("icns bytes:", os.path.getsize(os.path.join(BASE, "planmapper.icns")))
