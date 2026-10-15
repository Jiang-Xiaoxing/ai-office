"""Check exported dimensions, safe margins, luminous window and both ICO frames."""
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parents[1]
for size in (16, 32, 48, 180, 512):
    im = Image.open(root / 'static' / 'assets' / f'attic-icon-{size}.png').convert('RGB')
    assert im.size == (size, size)
    bg = im.getpixel((0, 0))
    colored = [(x, y) for y in range(size) for x in range(size) if im.getpixel((x, y)) != bg]
    assert min(x for x, _ in colored) >= size * .1
    assert min(y for _, y in colored) >= size * .1
    assert max(x for x, _ in colored) < size * .9
    assert max(y for _, y in colored) < size * .9
    bright = [(x, y) for x, y in colored if im.getpixel((x, y))[0] > 230 and im.getpixel((x, y))[1] > 180]
    assert len(bright) >= max(2, size * size * .01), 'skylight survives export'
ico = Image.open(root / 'static' / 'assets' / 'favicon.ico')
assert ico.ico.sizes() == {(16, 16), (32, 32)}
for size in (16, 32):
    preview = Image.open(root / 'preview' / f'icon-{size}x.png')
    assert preview.size == (size * 8, size * 8)
print('PASS icon sizes, >=10% safe margins, bright skylight, 16/32 ICO frames and inspection previews')
