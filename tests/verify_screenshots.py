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
# Responsive proportional scaling fills the area between the bars. Verify
# nearest-neighbour colours against the native canvas at its actual projection.
for name in sys.argv[1:] or ('attic-idle.png','attic-work.png','attic-weather.png'):
    im = Image.open(root/'preview'/name).convert('RGB')
    assert im.size in ((1920,1080),(1024,600)), im.size
    stem=Path(name).stem
    tmp=root/'.browser-tmp'
    masks=json.loads((tmp/f'{stem}-masks.json').read_text())
    box=json.loads((tmp/f'{stem}-projection.json').read_text())
    masks.extend(box.get('ui',[]))
    native=Image.open(tmp/f'{stem}-canvas.png').convert('RGB')
    scale=box['w']/native.width
    assert abs(box['h']/native.height-scale)<.001
    pixels=im.load(); reference=native.load()
    checked=bad=0
    for y in range(max(0,int(box['y'])+2),min(im.height,int(box['y']+box['h'])-2),2):
        for x in range(max(0,int(box['x'])+2),min(im.width,int(box['x']+box['w'])-2),2):
            if any(x>=b['x']-3 and x<b['x']+b['w']+3 and y>=b['y']-3 and y<b['y']+b['h']+9 for b in masks):
                continue
            sx=int((x+.5-box['x'])/scale);sy=int((y+.5-box['y'])/scale)
            if any(sx>=b['x'] and sx<b['x']+b['w'] and sy>=b['y'] and sy<b['y']+b['h'] for b in box['moving']):
                continue
            color=pixels[x,y]
            checked+=1
            if not any(reference[min(native.width-1,max(0,sx+dx)),min(native.height-1,max(0,sy+dy))]==color
                       for dy in (-1,0,1) for dx in (-1,0,1)):
                bad+=1
    assert checked>im.width*im.height*.12,(name,checked)
    assert bad==0,(name,bad,checked)
    print(f'PASS {name}: {im.width}x{im.height}, {checked} unsmoothed samples at proportional scale {scale:.4f}')
