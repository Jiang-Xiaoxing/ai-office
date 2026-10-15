from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parents[1]
for name in ('attic-idle.png', 'attic-work.png'):
    im = Image.open(root / 'preview' / name).convert('RGB')
    assert im.size == (1920, 1080), im.size
    # Canvas starts at y=60. The upper 150 source rows exclude HTML name labels.
    # Each displayed 4x4 block must be one source pixel, without interpolation.
    pixels = im.load()
    bad = 0
    for y in range(60, 660, 4):
        for x in range(0, 1920, 4):
            color = pixels[x, y]
            if any(pixels[x+dx, y+dy] != color for dy in range(4) for dx in range(4)):
                bad += 1
    assert bad == 0, (name, bad)
    print(f'PASS {name}: 1920x1080, 72000 crisp 4x4 source-pixel blocks')
