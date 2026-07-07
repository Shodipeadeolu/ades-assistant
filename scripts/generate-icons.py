from PIL import Image, ImageDraw, ImageFont
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(OUT_DIR, exist_ok=True)

BG = (37, 99, 235)  # accent blue
FG = (255, 255, 255)


def make_icon(size, path, corner_radius_ratio=0.22):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = int(size * corner_radius_ratio)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=BG)

    letter = 'A'
    font_size = int(size * 0.55)
    font = None
    for candidate in ['arialbd.ttf', 'segoeuib.ttf', 'arial.ttf']:
        try:
            font = ImageFont.truetype(candidate, font_size)
            break
        except OSError:
            continue
    if font is None:
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), letter, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), letter, font=font, fill=FG)

    img.save(path)


make_icon(192, os.path.join(OUT_DIR, 'icon-192.png'))
make_icon(512, os.path.join(OUT_DIR, 'icon-512.png'))
make_icon(180, os.path.join(OUT_DIR, 'apple-touch-icon.png'), corner_radius_ratio=0)

print('Icons written to', OUT_DIR)
