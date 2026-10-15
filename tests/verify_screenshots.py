from pathlib import Path
from PIL import Image
import json
import sys
root = Path(__file__).resolve().parents[1]
for name in sys.argv[1:] or ('attic-idle.png', 'attic-work.png', 'attic-weather.png', 'attic-six.png'):
    im = Image.open(root / 'preview' / name).convert('RGB')
    assert im.size == (1920, 1080), im.size
    # Run the matching browser capture first to record each image's HTML overlay bounds.
    masks = json.loads((root / '.browser-tmp' / f'{Path(name).stem}-masks.json').read_text())
    # The room fills 1920x1080 at 4x, starting at (0, 0). HTML text is separate.
    # Every unobscured 4x4 block must be one source pixel, without smoothing.
    pixels = im.load()
    bad = checked = 0
    for y in range(0, 1080, 4):
        for x in range(0, 1920, 4):
            if any(x < b['x']+b['w']+1 and x+4 > b['x']-1 and
                   y < b['y']+b['h']+1 and y+4 > b['y']-1 for b in masks):
                continue
            checked += 1
            color = pixels[x, y]
            if any(pixels[x+dx, y+dy] != color for dy in range(4) for dx in range(4)):
                bad += 1
    assert bad == 0, (name, bad)
    assert checked > 110000, (name, checked)
    print(f'PASS {name}: 1920x1080, {checked} crisp 4x4 source-pixel blocks')
