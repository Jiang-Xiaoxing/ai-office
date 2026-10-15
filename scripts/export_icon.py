"""Resize/quantize the built-in imagegen artwork; never paints icon pixels."""
from pathlib import Path
import sys
from PIL import Image
import io
import struct

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'preview' / 'icon-source.png'
im = Image.open(source).convert('RGB')
assets = root / 'static' / 'assets'
palette = Image.new('P', (1, 1))
colors = ['143e48', '2b1914', '5b3120', '855138', 'b8a479', 'ffdf45', 'ffe57c', 'fff6ae']
rgb = [int(color[i:i+2], 16) for color in colors for i in (0, 2, 4)]
palette.putpalette(rgb + rgb[:3] * (256 - len(colors)))
def reduced(size):
    return im.resize((size, size), Image.Resampling.BOX).quantize(palette=palette, dither=Image.Dither.NONE).convert('RGB')
base, small = reduced(32), reduced(16)
for size in (16, 32, 48, 180, 512):
    icon = small if size == 16 else base.resize((size, size), Image.Resampling.NEAREST)
    icon.save(assets / f'attic-icon-{size}.png')
payloads = []
for icon in (small, base):
    buffer = io.BytesIO()
    icon.save(buffer, format='PNG')
    payloads.append(buffer.getvalue())
offset = 6 + 16 * len(payloads)
directory = bytearray(struct.pack('<HHH', 0, 1, 2))
for size, payload in zip((16, 32), payloads):
    directory.extend(struct.pack('<BBBBHHII', size, size, 0, 0, 1, 32, len(payload), offset))
    offset += len(payload)
(assets / 'favicon.ico').write_bytes(directory + b''.join(payloads))
for size, icon in ((16, small), (32, base)):
    icon.resize((size * 8, size * 8), Image.Resampling.NEAREST).save(root / 'preview' / f'icon-{size}x.png')
print('Exported 16/32/48/180/512 PNG, ICO and nearest-neighbor inspection previews.')
