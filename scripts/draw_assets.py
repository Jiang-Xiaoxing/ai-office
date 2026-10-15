"""Reproducible, original attic pixel art. Pillow is build-only; no external art."""
import json
import random
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / 'static' / 'assets'
OUT.mkdir(parents=True, exist_ok=True)
INK = '#433541'
sprites = {}

def art(name, size):
    im = Image.new('RGBA', size)
    sprites[name] = im
    return im, ImageDraw.Draw(im)

def box(d, bounds, fill, outline=None):
    d.rectangle(bounds, fill=fill, outline=outline)

def furniture():
    im,d=art('desk',(78,48))
    d.ellipse((2,37,77,47),fill=(62,39,40,45))
    for x in (6,68):
        box(d,(x,30,x+3,44),'#795448',INK)
        d.line((x+1,32,x+1,41),fill='#c38c5a')
    box(d,(1,13,76,36),'#805446',INK)
    box(d,(1,11,76,32),'#efc38b',INK)
    box(d,(3,13,74,29),'#dca66b')
    d.line((3,13,74,13),fill='#f8d6a0')
    for x,y,n in ((6,20,16),(58,16,13),(53,27,17)):
        d.line((x,y,x+n,y),fill='#c4905f')
    box(d,(24,1,53,22),'#ded6b9',INK)
    box(d,(27,4,50,18),'#303d4a',INK)
    box(d,(36,22,41,25),'#9d9b90',INK)
    box(d,(31,25,46,26),'#e8dec4',INK)
    box(d,(25,28,51,33),'#e5dac1',INK)
    for y in (29,31):
        for x in range(27,50,3):d.point((x,y),fill='#8a8b85')
    box(d,(56,27,60,32),'#eae0c4',INK)
    box(d,(7,21,17,28),'#f4dfb5','#ad8156')
    d.line((9,23,15,23),fill='#b7956c');d.line((9,25,14,25),fill='#b7956c')
    box(d,(65,18,70,24),'#b5c3a5',INK);box(d,(66,18,69,19),'#855e43')
    d.line((71,19,72,19,72,22,71,22),fill='#e6d6ae')
    im,d=art('chair',(26,27))
    d.ellipse((1,21,25,26),fill=(62,39,40,50))
    for x in (6,19):box(d,(x,17,x+2,24),'#755447',INK)
    box(d,(3,7,23,20),'#496e70',INK);box(d,(4,5,22,15),'#7c9b8c',INK)
    d.line((6,7,20,7),fill='#b9c8a8');box(d,(4,16,22,20),'#5a817b',INK)
    im,d=art('sofa',(65,39))
    d.ellipse((1,29,64,38),fill=(62,39,40,45))
    for x in (7,55):box(d,(x,29,x+3,35),'#6b4a42',INK)
    box(d,(2,3,61,31),'#8d616b',INK);box(d,(4,1,59,18),'#bd8b91',INK)
    d.line((7,3,56,3),fill='#e0b5ad');box(d,(7,16,55,28),'#cb9d9d',INK)
    d.line((32,17,32,26),fill='#ab7c85')
    for x in (1,56):box(d,(x,13,x+6,29),'#ab7b86',INK)
    box(d,(9,12,21,21),'#e7c78e','#ac8868');d.line((11,14,18,19),fill='#f4dfb5')
    box(d,(41,14,52,27),'#718d8d',INK)
    for y in range(16,27,3):d.line((42,y,51,y),fill='#a6b4a1')
    im,d=art('armchair',(32,39))
    d.ellipse((0,32,31,38),fill=(62,39,40,50))
    box(d,(4,2,27,31),'#738c7b',INK);box(d,(6,4,25,20),'#9aaf8e',INK)
    d.line((8,6,23,6),fill='#c6cba7');box(d,(4,23,28,32),'#80977f',INK)
    for x in (1,26):box(d,(x,16,x+4,32),'#627d71',INK)
    for x in (5,25):box(d,(x,32,x+2,36),'#7f5d48',INK)
    im,d=art('tea-table',(40,31))
    d.ellipse((0,19,39,30),fill=(62,39,40,40))
    for x in (5,31):box(d,(x,13,x+3,27),'#8c6048',INK)
    d.ellipse((0,2,38,22),fill='#8c604b',outline=INK)
    d.ellipse((0,0,38,18),fill='#e8b77d',outline=INK)
    d.arc((3,2,35,16),10,170,fill='#c28c5c')
    d.ellipse((12,6,25,13),fill='#f1d8a7',outline='#ba9667')
    box(d,(15,4,22,10),'#a8beb5',INK);box(d,(17,2,20,4),'#d7dec4',INK)
    d.line((23,5,26,6,25,9,23,9),fill='#d7dec4')
    for x in (5,29):box(d,(x,7,x+4,12),'#f3dec0',INK)
    im,d=art('bookcase',(49,52))
    box(d,(1,1,47,49),'#8d604c',INK);box(d,(4,4,44,47),'#5f4645')
    rng=random.Random(18);colors=['#88a395','#dcb780','#b97671','#7b8f9d','#d8c7a1']
    for y in (5,22):
        for x in range(6,42,6):
            h=rng.randrange(9,14)
            box(d,(x,y+13-h,x+3,y+13),rng.choice(colors))
            d.line((x+1,y+15-h,x+2,y+15-h),fill='#edd9af')
    for y in (19,36):box(d,(2,y,46,y+2),'#c79469',INK)
    box(d,(6,40,23,47),'#c6a77b',INK);box(d,(28,39,42,47),'#9cb0a0',INK)
    d.line((10,43,18,43),fill='#8b7860')
    im,d=art('plant',(24,38))
    d.ellipse((2,30,23,37),fill=(62,39,40,45))
    d.polygon([(5,25),(21,25),(18,35),(8,35)],fill='#b87758',outline=INK)
    box(d,(4,24,21,27),'#d79d6d',INK);d.line((13,25,13,4),fill='#4d7255',width=2)
    for x,y,side in ((12,8,-1),(13,14,1),(11,18,-1),(14,22,1),(14,5,1)):
        d.polygon([(x,y+3),(x+8*side,y-4),(x+9*side,y-1),(x+6*side,y+3)],fill='#6f9464',outline='#4b7055')
        d.line((x,y+2,x+6*side,y),fill='#a9b578')
    im,d=art('lamp',(22,61))
    d.ellipse((1,53,21,60),fill=(62,39,40,45))
    box(d,(10,13,12,54),'#b79a6a',INK);d.ellipse((4,51,19,57),fill='#c7a477',outline=INK)
    d.polygon([(7,2),(16,2),(21,17),(1,17)],fill='#f0cd89',outline=INK)
    d.line((6,5,4,15),fill='#ffe4a3',width=2);d.line((2,18,20,18),fill='#c1905e')
    im,d=art('sideboard',(52,36))
    box(d,(2,8,49,33),'#a87856',INK);box(d,(1,6,50,12),'#e0af7a',INK)
    for x in (6,29):
        box(d,(x,16,x+17,29),'#c28e62','#90614e');box(d,(x+6,19,x+9,20),'#e4bf8b')
    box(d,(7,0,20,9),'#58716c',INK);box(d,(9,1,18,4),'#90a396')
    for x in (30,39):box(d,(x,3,x+5,9),'#eee0bd',INK)

def attic_furniture():
    """Reuse the approved room's furniture pixels, without copying its floor/wall.

    These masks are measured on attic-bg-2's native grid. Keeping the atlas slots
    the same size preserves every resident frame and all existing metadata.
    """
    background = Image.open(OUT / 'attic-bg-2.png').convert('RGBA')
    native = background.resize((480, 270), Image.Resampling.NEAREST)
    assert native.resize(background.size, Image.Resampling.NEAREST).tobytes() == background.tobytes()

    def cutout(name, origin, size, polygons, shadow):
        im, d = art(name, size)
        d.ellipse(shadow, fill=(88, 57, 39, 36))
        mask = Image.new('L', size)
        md = ImageDraw.Draw(mask)
        ox, oy = origin
        for polygon in polygons:
            md.polygon([(x-ox, y-oy) for x,y in polygon], fill=255)
        source = native.crop((ox, oy, ox+size[0], oy+size[1]))
        im.paste(source, (0, 0), mask)

    cutout('desk', (58, 63), (78, 48), [
        [(58,74),(134,74),(134,99),(58,99)],
        [(81,63),(109,63),(109,82),(81,82)],
        [(64,71),(74,71),(74,85),(64,85)],
        [(117,73),(119,73),(119,70),(121,70),(122,73),(124,73),
         (125,68),(127,68),(127,71),(129,71),(129,77),(127,80),
         (128,82),(127,86),(120,86),(118,84),(118,79),(117,77)],
        [(60,99),(65,99),(65,108),(60,108)],
        [(125,99),(130,99),(130,108),(125,108)],
    ], (1, 39, 77, 47))
    cutout('chair', (83, 99), (26, 27), [
        [(85,100),(104,100),(104,102),(106,102),(106,115),
         (104,117),(104,121),(100,121),(100,118),(90,118),
         (90,121),(85,121),(85,117),(83,115),(83,102),(85,102)],
    ], (0, 20, 25, 26))
    # A narrower version of the same wood/monitor art fits the wall bays. Keep
    # chairs and residents at their original size; all output remains native pixels.
    sprites['desk-wall'] = sprites['desk'].resize((64, 48), Image.Resampling.NEAREST)

    # Only the plant nooks needed by the new seats are cleared. These patches
    # use clean wall/floor pixels at the same height, leaving the source PNG intact.
    rear = native.crop((220, 43, 280, 96))
    for y in range(53):
        for x in range(60):
            source_x = 281 + x % 15 if y < 17 else 312 + x % 30
            rear.putpixel((x, y), native.getpixel((source_x, y + 43)))
    sprites['clear-rear-plants'] = rear
    sprites['clear-stair-plant'] = native.crop((156, 210, 176, 247))
    sprites['clear-right-plant'] = native.crop((156, 207, 186, 247))

PALETTES = [
    dict(id='moss',hair='#394352',highlight='#637080',shirt='#81aa9a',shade='#4d7d78',skin='#e9bd94',shadow='#bd886c',style='glasses'),
    dict(id='sky',hair='#583b35',highlight='#a57454',shirt='#84a5c3',shade='#556d93',skin='#b9805e',shadow='#955b49',style='curls'),
    dict(id='sun',hair='#9d5948',highlight='#d68b60',shirt='#e2ba6e',shade='#b08250',skin='#f0c9a0',shadow='#ca9576',style='bob'),
    dict(id='lilac',hair='#4a3652',highlight='#816482',shirt='#b39ac4',shade='#7f6b9a',skin='#d7a782',shadow='#a6745a',style='bun'),
    dict(id='rose',hair='#d6c4a0',highlight='#f0dfb7',shirt='#c5838b',shade='#995f76',skin='#81553f',shadow='#654332',style='crop'),
    dict(id='fern',hair='#414943',highlight='#788069',shirt='#9cb47a',shade='#6e895e',skin='#d6a47d',shadow='#ae795e',style='cap'),
]

def character(p,action,direction,frame):
    key=f'{p["id"]}-{action}-{direction}-{frame}'
    im,d=art(key,(26,36))
    hair,light,shirt,shade,skin=[p[k] for k in ('hair','highlight','shirt','shade','skin')]
    back=direction==3 or action=='type';side=action=='walk' and direction in (1,2)
    bob=int(action=='walk' and frame%2==1)
    step=[0,1,0,-1][frame] if action=='walk' else 0
    d.ellipse((4,29,23,34),fill=(62,39,40,50))
    for x,s in ((8,step),(15,-step)):
        box(d,(x,24+bob,x+4,30+s),'#555565',INK);box(d,(x-1,30+s,x+4,32+s),'#e0cfb3',INK)
    box(d,(6,16+bob,21,26+bob),shade,INK);box(d,(7,17+bob,20,23+bob),shirt)
    d.line((8,18+bob,8,22+bob),fill='#e0d2b0')
    for x,s in ((3,step),(21,-step)):
        box(d,(x,18+bob+s,x+2,24+bob+s),shade,INK);box(d,(x,24+bob+s,x+2,26+bob+s),skin,INK)
    d.polygon([(7,5+bob),(10,2+bob),(18,2+bob),(22,6+bob),(22,13+bob),(18,17+bob),(9,17+bob),(6,13+bob),(6,7+bob)],fill=INK)
    box(d,(8,7+bob,20,14+bob),skin);box(d,(10,14+bob,18,16+bob),p['shadow'])
    box(d,(6,10+bob,8,13+bob),skin);box(d,(20,10+bob,22,13+bob),skin)
    d.polygon([(7,5+bob),(10,2+bob),(17,2+bob),(21,4+bob),(22,8+bob),(18,9+bob),(16,6+bob),(12,9+bob),(8,8+bob),(8,12+bob),(6,9+bob)],fill=hair)
    d.line((9,5+bob,12,3+bob,17,4+bob),fill=light,width=2)
    if p['style']=='curls':
        for x,y in ((6,5),(9,2),(14,1),(19,3),(21,6)):
            d.rectangle((x,y+bob,x+3,y+3+bob),fill=hair);d.point((x+1,y+bob),fill=light)
    if p['style']=='bob':
        box(d,(5,8+bob,7,18+bob),hair);box(d,(21,7+bob,23,18+bob),hair)
        d.line((6,10+bob,6,16+bob),fill=light)
    if p['style']=='bun':
        d.ellipse((10,0,18,6),fill=hair,outline=INK);d.line((12,1,15,1),fill=light)
        box(d,(8,5+bob,19,6+bob),'#d4ae78')
    if p['style']=='crop':
        box(d,(7,4+bob,21,8+bob),hair);d.line((9,4+bob,18,4+bob),fill=light)
    if p['style']=='cap':
        box(d,(7,2+bob,21,6+bob),'#8b9b78',INK);box(d,(12,6+bob,24,7+bob),'#b4bf95',INK)
    if back:
        box(d,(8,7+bob,20,14+bob),hair);d.line((9,8+bob,12,6+bob,17,7+bob),fill=light)
    elif side:
        box(d,(8,8+bob,13,14+bob),hair);d.point((19,10+bob),fill=INK)
    elif action=='sleep':
        d.line((9,11,11,11),fill=INK);d.line((17,11,19,11),fill=INK)
    else:
        d.point((10,11+bob),fill=INK);d.point((18,11+bob),fill=INK)
        d.line((12,14+bob,15,14+bob),fill='#925c50')
        if p['style']=='glasses':
            box(d,(8,10+bob,12,12+bob),None,INK);box(d,(16,10+bob,20,12+bob),None,INK)
            d.line((12,11+bob,16,11+bob),fill=INK)
    if action=='type':
        for x,y in ((3,16+frame%2),(21,17-frame%2)):
            box(d,(x,y,x+2,y+5),shirt,INK);box(d,(x,y-2,x+2,y),skin,INK)
        box(d,(8,28,20,32),shade,INK)
    if action=='tea':
        y=15 if frame<2 else 12
        box(d,(20,y+3,23,24),shade,INK);box(d,(19,y+2,22,y+5),skin,INK)
        box(d,(20,y,24,y+5),'#f0dfb9',INK);box(d,(21,y,23,y+1),'#92654c')
        d.point((25,y+2),fill='#f0dfb9')
        if frame%2==0:d.line((22,y-3,23,y-5),fill='#f5dfb2')
    if action=='read':
        box(d,(4,22,22,27),skin,INK)
        d.polygon([(5,19),(13,21),(22,19),(21,27),(13,29),(5,26)],fill='#8f6575',outline=INK)
        d.line((13,22,13,28),fill='#f6ddb0')
        for y in (22,24):
            d.line((7,y,10,y+1),fill='#d6bf9d');d.line((16,y+1,19,y),fill='#d6bf9d')
        if frame==2:d.polygon([(14,21),(19,18),(19,25),(14,28)],fill='#ecd4af')
    if action=='sleep':
        box(d,(4,23,23,30),'#7c9a94',INK)
        d.line((6,25+frame%2,21,25+frame%2),fill='#b5c6ac')
    if side and direction==1:sprites[key]=im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)

furniture()
attic_furniture()
for palette in PALETTES:
    for direction in range(4):
        for frame in range(4):character(palette,'walk',direction,frame)
    for action in ('type','tea','read','sleep','idle'):
        for frame in range(4):character(palette,action,0,frame)

atlas=Image.new('RGBA',(1024,512));meta={};x=y=2;rowh=0
for name,im in sprites.items():
    w,h=im.size
    if x+w+2>1024:x=2;y+=rowh+2;rowh=0
    atlas.alpha_composite(im,(x,y));meta[name]=[x,y,w,h]
    x+=w+2;rowh=max(rowh,h)
atlas=atlas.crop((0,0,1024,y+rowh+2));atlas.save(OUT/'office-atlas.png',optimize=True)
(OUT/'office-atlas.json').write_text(json.dumps(meta,separators=(',',':')),encoding='utf-8')
(OUT/'residents.json').write_text(json.dumps(PALETTES,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for p in PALETTES:sprites[f'{p["id"]}-idle-0-0'].save(OUT/f'resident-{p["id"]}.png')
print(f'Drew {len(meta)} original attic sprites, six residents: {atlas.size}')
