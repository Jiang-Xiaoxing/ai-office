from pathlib import Path
import json
import os
import subprocess
import sys

try:
    from PIL import Image
except ModuleNotFoundError:
    # Runtime venv has no art dependency. Reuse the D-drive art interpreter
    # without installing packages, or use an explicitly supplied interpreter.
    art_python = Path(os.environ.get('OFFICE_ART_PYTHON', 'D:/AITools/py312/python.exe'))
    if not art_python.is_file() or art_python.resolve() == Path(sys.executable).resolve():
        raise
    raise SystemExit(subprocess.call([str(art_python), str(Path(__file__).resolve()), *sys.argv[1:]]))
root = Path(__file__).resolve().parents[1]
# The default list is exactly what a normal `node tests/run-all.cjs` records:
# verify-office writes attic-idle/attic-work, verify-weather attic-weather.
# attic-six.png only comes from the documented `verify-dynamic.cjs --live6`
# run (temporary six-tool config plus a real backend restart); check it by
# passing it explicitly after that run, e.g.
# python tests/verify_screenshots.py attic-six.png
for name in sys.argv[1:] or ('attic-idle.png', 'attic-work.png', 'attic-weather.png'):
    im = Image.open(root / 'preview' / name).convert('RGB')
    assert im.size == (1920, 1080), im.size
    # Run the matching browser capture first to record each image's HTML overlay bounds.
    masks_path = root / '.browser-tmp' / f'{Path(name).stem}-masks.json'
    assert masks_path.is_file(), f'{name}: run its browser capture first, {masks_path.name} is missing'
    masks = json.loads(masks_path.read_text())
    # The room fills 1920x1080 at 4x, starting at (0, 0). HTML text is separate.
    # Every unobscured 4x4 block must be one source pixel, without smoothing.
    pixels = im.load()
    bad = checked = 0
    for y in range(0, 1080, 4):
        for x in range(0, 1920, 4):
            # The HTML UI has a 2px focus rim and a stepped pointer/shadow
            # extending 8px below. Match those extents without hiding extra art.
            if any(x < b['x']+b['w']+2 and x+4 > b['x']-2 and
                   y < b['y']+b['h']+8 and y+4 > b['y']-2 for b in masks):
                continue
            checked += 1
            color = pixels[x, y]
            if any(pixels[x+dx, y+dy] != color for dy in range(4) for dx in range(4)):
                bad += 1
    assert bad == 0, (name, bad)
    assert checked > 110000, (name, checked)
    print(f'PASS {name}: 1920x1080, {checked} crisp 4x4 source-pixel blocks')
