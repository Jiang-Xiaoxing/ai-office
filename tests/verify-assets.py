"""Verify copied imagegen assets and the layout-derived coordinates."""
from pathlib import Path
import hashlib
import json
from PIL import Image

root=Path(__file__).resolve().parents[1]
assets=root/'static/assets'
provenance=json.loads((assets/'import-sha256.json').read_text('utf-8'))
for name,digest in provenance.items():
    assert hashlib.sha256((assets/name).read_bytes()).hexdigest()==digest,name
layout=json.loads((assets/'layout.json').read_text('utf-8'))
room=next(i for i in layout['images'] if i['id']=='bg-c')
manifest=json.loads((assets/'sprites/manifest.json').read_text('utf-8'))
assert [room['pageBackground'],room['nightPageBackground']]==['#382B29','#171A30']
for name in ('bg-c.png','bg-c-night.png'):
    with Image.open(assets/name) as image:
        assert image.size==(1920,1080)
assert manifest['row_order']==['walk_down','walk_up','walk_left','walk_right','typing_back','seated_actions']
assert len(manifest['characters'])==6
for person in manifest['characters']:
    with Image.open(assets/person['file']) as image:
        assert image.size==(256,384)
        assert set(image.getchannel('A').getdata())=={0,255}
        for frame,bounds in enumerate(person['bounds']):
            tile=image.crop(((frame%4)*64,(frame//4)*64,(frame%4+1)*64,(frame//4+1)*64))
            assert tile.getbbox()==tuple(bounds),(person['id'],frame)
zones=json.loads((root/'static/interaction-zones.json').read_text('utf-8'))
source={p['id']:p for p in room['plants']+room['decorativePlants']+[room['teaTable']]}
assert len(zones['plants'])==24
for z in zones['plants']+[zones['teaTable']]:
    r=source[z['id']]['clickRect']
    assert [z[k] for k in ('x','y','w','h')]==[r[k]/4 for k in ('x','y','width','height')]
    p=source[z['id']].get('wateringPoint',source[z['id']].get('teaSpawnPoint'))
    assert [z['effectX'],z['effectY']]==[p['x']/4,p['y']/4]
print('PASS immutable source hashes, 6 imagegen sheets / 144 frames, day/night dimensions and all 25 interaction rectangles')
