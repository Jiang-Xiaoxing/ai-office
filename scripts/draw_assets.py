"""Reproducible original pixel art. No external assets or smoothing.

Build: D:\\AITools\\py312\\python.exe scripts\\draw_assets.py
Pillow is a build tool only, not a server dependency.
"""
import json
import random
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / 'static' / 'assets'
OUT.mkdir(parents=True, exist_ok=True)
sprites = {}
INK = '#23343b'

def art(name, size):
    im = Image.new('RGBA', size)
    sprites[name] = im
    return im, ImageDraw.Draw(im)

def box(d, b, fill, outline=None):
    d.rectangle(b, fill=fill, outline=outline)

def leaf(d, x, y, flip=False):
    k = -1 if flip else 1
    d.polygon([(x,y),(x+7*k,y-7),(x+9*k,y-6),(x+8*k,y-2),(x+2*k,y+2)],fill='#254d39')
    d.line([(x,y),(x+7*k,y-5)],fill='#568e49',width=2)
    d.point((x+6*k,y-6),fill='#92b35b')

def floors():
    im,d=art('wood',(96,32)); rng=random.Random(72)
    for row in range(4):
        y=row*8
        for x in range(-24 if row%2 else 0,96,48):
            box(d,(x,y,x+47,y+7),rng.choice(['#bf8b4e','#c79553','#ce9c59','#c39150','#d1a15e']))
            d.line((x,y,x+47,y),fill='#aa7847')
            d.line((x,y+1,x+46,y+1),fill='#dfaf6a')
            d.line((x+47,y+1,x+47,y+7),fill='#ac7947')
            for _ in range(3):
                a=x+rng.randrange(3,31);b=y+rng.randrange(3,7)
                d.line((a,b,a+rng.randrange(5,15),b),fill=rng.choice(['#c08b4c','#d2a060','#ba844b']))
    im,d=art('carpet',(32,32));box(d,(0,0,31,31),'#4f8b83')
    for y in range(32):
        for x in range(32):
            if rng.random()<.24:d.point((x,y),fill=rng.choice(['#528e85','#578f86','#4a867e','#518980']))
    im,d=art('tile',(32,32));box(d,(0,0,31,31),'#e4dfc6')
    box(d,(0,0,15,15),'#394a49');box(d,(16,16,31,31),'#394a49')
    d.line((0,31,31,31),fill='#8e9586');d.line((31,0,31,31),fill='#8e9586')

def plants():
    im,d=art('plant',(30,46));d.ellipse((2,39,29,45),fill=(13,31,35,70))
    d.polygon([(6,31),(25,31),(22,43),(10,43)],fill='#c79c61',outline=INK)
    box(d,(5,29,26,33),'#e0bb7d',INK);d.line((10,35,12,40),fill='#e7c891',width=2)
    for x,top in [(14,3),(10,12),(19,8)]:
        d.line((15,30,x,top),fill='#2d5d3b',width=2)
        for y in range(top+6,29,7):leaf(d,x,y,True);leaf(d,x,y+3)
    d.line((14,4,14,23),fill='#7fa851')
    im,d=art('smallplant',(18,24));d.ellipse((2,19,16,23),fill=(13,31,35,70))
    box(d,(5,14,13,21),'#b88e56',INK);box(d,(4,13,14,16),'#ddbb7c',INK)
    for x,y in [(8,12),(6,9),(11,8),(10,5)]:leaf(d,x,y,x%2==0)
    im,d=art('hanging',(26,48))
    box(d,(5,2,20,7),'#a37c4b',INK);box(d,(7,3,18,5),'#dfb97b')
    for x,end in [(5,36),(11,44),(19,30)]:
        d.line((13,6,x,end),fill='#345d3d',width=2)
        for y in range(10,end,7):
            leaf(d,x,y,y%2==0)
    d.point((11,45),fill='#a4ba70')

def desk():
    im,d=art('desk',(104,60));box(d,(4,52,102,59),(16,29,30,65))
    for x in [6,93]:
        box(d,(x,45,x+5,57),'#384c50',INK);box(d,(x+1,47,x+2,54),'#92a19a')
    box(d,(1,18,102,51),'#7f5738',INK);box(d,(2,16,101,46),'#e1b776',INK)
    box(d,(4,18,99,43),'#d4a160');d.line((5,19,98,19),fill='#f2d197')
    for x,y,w in [(8,27,22),(76,23,20),(15,39,14),(67,41,27)]:
        d.line((x,y,x+w,y),fill='#c59458');d.line((x+3,y+2,x+w-4,y+2),fill='#dcad6b')
    box(d,(36,3,69,28),'#394950',INK);box(d,(37,2,68,25),'#c4cbbd',INK)
    box(d,(40,5,65,21),'#172d38');d.line((41,6,64,6),fill='#3e535b')
    box(d,(49,26,55,30),'#8f9f9c',INK);box(d,(43,30,61,32),'#d5d9c5',INK)
    box(d,(35,35,69,43),'#46585a',INK);box(d,(36,35,68,41),'#bbc3b3')
    for y in [36,39]:
        for x in range(38,67,4):box(d,(x,y,x+2,y+1),'#f0edd6')
    box(d,(44,42,59,42),'#eee5cf');box(d,(76,35,82,42),'#dbe0cb',INK)
    d.line((79,36,79,38),fill='#819597');box(d,(11,27,24,37),'#e5d7ac','#a17d4b')
    d.line((14,29,21,29),fill='#b49d75');d.line((14,32,20,32),fill='#b49d75')
    box(d,(89,29,95,35),'#efe8cc',INK);box(d,(90,29,94,30),'#8d6046')
    box(d,(96,30,97,33),'#e4d6b4',INK)
    im,d=art('chair',(28,27));d.ellipse((1,19,26,26),fill=(18,35,35,70))
    box(d,(6,17,8,24),'#3b3e38',INK);box(d,(20,17,22,24),'#3b3e38',INK)
    box(d,(4,3,24,18),'#477647',INK);box(d,(5,2,23,15),'#74a462',INK)
    box(d,(7,4,21,12),'#80ad6c');d.line((7,4,21,4),fill='#aec986')
    box(d,(3,14,25,19),'#30583e',INK);box(d,(5,14,23,17),'#5b8b51')

def sofa(name,width=84,height=37):
    im,d=art(name,(width,height));box(d,(3,height-7,width-1,height-1),(15,33,33,70))
    for x in [5,width-11]:box(d,(x,height-9,x+4,height-3),'#343f35',INK)
    box(d,(2,2,width-4,height-6),'#3e6546',INK)
    box(d,(5,1,width-7,height-14),'#76975d',INK);d.line((7,3,width-9,3),fill='#b2c58a')
    box(d,(7,12,width-9,height-8),'#91aa70','#455e43')
    for x in range(9,width-11,22):
        d.line((x+20,14,x+20,height-10),fill='#74925b');d.line((x,14,x+17,14),fill='#a8bd82')
    box(d,(1,10,7,height-7),'#6f915a',INK);box(d,(width-9,10,width-3,height-7),'#6f915a',INK)
    d.line((3,12,3,height-10),fill='#a5be80');d.line((width-7,12,width-7,height-10),fill='#a5be80')
    box(d,(12,11,24,21),'#d9c78e','#8b9964');d.line((14,13,22,19),fill='#e9dba5')
    if name=='sofa':
        sprites['sofa-right']=im.transpose(Image.Transpose.ROTATE_90)
        sprites['sofa-left']=im.transpose(Image.Transpose.ROTATE_270)

def table():
    im,d=art('table',(66,55));box(d,(5,45,65,53),(18,33,29,70))
    for x in [8,55]:box(d,(x,37,x+4,50),'#835c3e',INK)
    box(d,(2,7,62,44),'#8a5d38',INK);box(d,(1,5,61,40),'#e7be7d',INK)
    box(d,(4,8,58,37),'#ca9352');d.line((5,9,57,9),fill='#f2d599');d.line((5,36,57,36),fill='#ad7a47')
    d.ellipse((10,15,28,26),fill='#f0e8cb',outline=INK)
    d.ellipse((13,12,25,23),fill='#c4d5cb',outline=INK);box(d,(16,10,21,13),'#e9ecda',INK)
    d.line((25,16,30,18,26,22),fill='#eef0da',width=2)
    d.ellipse((30,27,41,33),fill='#e6d8ae',outline='#a98a5b')
    box(d,(32,23,38,29),'#eef0d4',INK);box(d,(33,23,37,24),'#98694a')
    box(d,(45,19,53,29),'#ae7c46',INK);box(d,(44,18,54,20),'#dbad6a',INK)
    for x,y in [(48,16),(50,12),(47,10)]:leaf(d,x,y,x==48)

def shelf():
    im,d=art('shelf',(83,41));box(d,(3,3,82,40),(15,26,28,70))
    box(d,(1,1,79,36),'#7e5034',INK);box(d,(4,3,76,32),'#342e2b');rng=random.Random(32)
    colors=['#b35845','#deb966','#92a572','#54938d','#dfd5ae','#6b7187']
    for y in [5,22]:
        x=6
        while x<74:
            w=rng.choice([3,4,5]);h=rng.choice([9,11,12])
            box(d,(x,y+12-h,x+w-1,y+12),rng.choice(colors))
            d.line((x+1,y+14-h,x+w-2,y+14-h),fill='#efe1b6');x+=w+2
    for y in [17,34]:
        box(d,(0,y,80,y+3),'#c2945f',INK);d.line((2,y,78,y),fill='#e9be7f')

def decor():
    im,d=art('clock',(23,24));d.ellipse((2,2,22,23),fill=(13,29,33,90))
    d.ellipse((1,0,21,20),fill='#e5d7b4',outline=INK,width=2)
    d.ellipse((4,3,18,17),fill='#f3edda');d.line((11,4,11,10,15,12),fill='#4d5c59',width=2)
    for p in [(11,3),(18,10),(11,17),(4,10)]:d.point(p,fill='#9b8d70')
    im,d=art('landscape',(65,34));box(d,(2,2,64,33),(11,26,29,70))
    box(d,(0,0,62,30),'#8b5f3b',INK);box(d,(2,2,60,28),'#d6b57c')
    box(d,(5,5,57,25),'#8eb4aa',INK);box(d,(6,6,56,14),'#a9c5b0')
    d.polygon([(6,22),(19,9),(28,18),(40,10),(56,21),(56,24),(6,24)],fill='#416a59')
    d.polygon([(6,24),(23,17),(34,21),(45,16),(56,24)],fill='#8a9e62')
    d.line((26,23,36,17,43,19,49,23),fill='#e2cc8e',width=2);d.ellipse((43,7,49,12),fill='#f0d599')
    im,d=art('portrait',(24,30));box(d,(1,1,23,29),(12,26,30,70))
    box(d,(0,0,21,27),'#ab7d4f',INK);box(d,(2,2,19,25),'#e4c18a');box(d,(4,4,17,23),'#284752',INK)
    d.polygon([(8,21),(9,12),(7,6),(10,9),(13,6),(14,13),(15,21)],fill='#d8ae74')
    d.point((10,13),fill=INK);d.point((13,13),fill=INK);d.line((9,17,13,17),fill='#784c36')
    im,d=art('window',(75,40));box(d,(0,0,72,35),'#233c43',INK)
    box(d,(3,2,69,32),'#9bbec0');box(d,(4,4,68,20),'#749ca7')
    d.polygon([(4,26),(14,13),(26,22),(38,12),(48,23),(60,16),(68,24),(68,31),(4,31)],fill='#446e70')
    d.line((7,17,20,5),fill='#b9d6cf',width=2);d.line((45,17,58,5),fill='#b9d6cf',width=2)
    box(d,(34,2,37,33),'#d3c8a1',INK);box(d,(2,18,70,20),'#c4bd9e',INK)
    box(d,(0,33,73,37),'#c29862',INK);box(d,(2,33,71,34),'#ebc58c')
    im,d=art('board',(64,40));box(d,(1,1,63,39),'#1f383d');box(d,(0,0,61,36),'#c5a271',INK)
    box(d,(3,3,58,33),'#ac8054')
    for x,y,c in [(8,7,'#e9ddb2'),(27,6,'#a9c1ad'),(44,10,'#e4bd85'),(14,22,'#d3b6a0')]:
        box(d,(x,y,x+10,y+9),c);box(d,(x+4,y,x+5,y+1),'#b55447')
        d.line((x+2,y+4,x+8,y+4),fill='#887c69')

def coffee():
    im,d=art('coffee',(88,51));box(d,(3,44,87,50),(15,28,30,70))
    box(d,(1,21,84,47),'#a97b4d',INK)
    for x in [4,45]:box(d,(x,26,x+36,44),'#be925b','#805c3c')
    d.line((34,29,34,34),fill='#ead6a7',width=2);d.line((51,29,51,34),fill='#ead6a7',width=2)
    box(d,(0,18,85,23),'#ddbb83',INK);d.line((2,19,83,19),fill='#f0d8a4')
    box(d,(12,1,39,18),'#35494c',INK);box(d,(15,2,36,8),'#bdc4ad')
    box(d,(15,9,23,16),'#1b333b');box(d,(27,10,35,17),'#586c68')
    box(d,(17,13,23,18),'#e8dfbf',INK);box(d,(28,4,32,6),'#84b587')
    for x in [48,58,68]:
        box(d,(x,11,x+6,17),'#e9e4cc',INK);box(d,(x+1,11,x+5,12),'#8b6040')
    box(d,(49,4,73,9),'#c6ae82',INK);box(d,(51,3,71,5),'#e5d2a2',INK)
    im,d=art('cabinet',(53,39));box(d,(2,32,52,38),(12,26,30,65))
    box(d,(1,2,49,34),'#a2754d',INK);box(d,(3,5,47,30),'#c69c65')
    for y in [7,19]:
        box(d,(5,y,45,y+9),'#cfa970','#99774e');d.line((21,y+4,29,y+4),fill='#ead6a6',width=2)
    box(d,(0,0,50,5),'#ddbb83',INK)
    im,d=art('storage',(46,76));box(d,(3,68,45,75),(13,28,30,65))
    box(d,(2,17,42,70),'#7f6044',INK);box(d,(4,20,40,66),'#c9a374')
    for y in [22,37,52]:
        box(d,(6,y,38,y+12),'#b68e5e','#90704c')
        box(d,(18,y+3,27,y+6),'#e6d5af','#846c4e')
        d.line((20,y+4,24,y+4),fill='#988765')
    box(d,(0,15,44,20),'#e2c38c',INK)
    box(d,(8,4,35,15),'#acb6a8',INK);box(d,(11,1,32,8),'#e7e6cf',INK)
    box(d,(12,9,31,13),'#435959',INK);d.point((33,7),fill='#81b18a')

def character(name,hair,light,shirt,shade,skin,action,direction,frame):
    key=f'{name}-{action}-{direction}-{frame}'
    im,d=art(key,(26,36));back=direction==3 or action=='type'
    side=direction in [1,2] and action=='walk'
    bob=1 if action=='walk' and frame in [1,3] else 0
    step=[0,2,0,-2][frame] if action=='walk' else 0
    d.ellipse((5,29,22,34),fill=(13,30,34,75))
    box(d,(8,25+bob,12,30+step),'#3f4b53',INK);box(d,(14,25+bob,18,30-step),'#3f4b53',INK)
    box(d,(7,30+step,12,32+step),'#26343b');box(d,(14,30-step,19,32-step),'#26343b')
    box(d,(6,16+bob,20,26+bob),shade,INK);box(d,(7,17+bob,19,23+bob),shirt)
    d.line((8,18+bob,8,23+bob),fill='#a5c2ad' if name=='codex' else light)
    if not back:
        box(d,(12,17+bob,14,24+bob),shade);d.point((14,20+bob),fill='#e8ddbc')
    for x,s in [(3,step//2),(20,-step//2)]:
        box(d,(x,18+bob+s,x+3,24+bob+s),shade,INK)
        box(d,(x,24+bob+s,x+3,26+bob+s),skin,INK)
    d.polygon([(7,5+bob),(9,3+bob),(18,3+bob),(21,6+bob),(21,13+bob),(18,17+bob),(9,17+bob),(6,13+bob),(6,7+bob)],fill=INK)
    box(d,(8,7+bob,19,14+bob),skin);box(d,(10,14+bob,17,16+bob),'#c78d6e')
    box(d,(6,10+bob,8,13+bob),skin);box(d,(19,10+bob,21,13+bob),skin)
    d.polygon([(7,5+bob),(10,2+bob),(17,2+bob),(20,4+bob),(21,8+bob),(18,10+bob),(16,7+bob),(13,9+bob),(9,8+bob),(8,12+bob),(6,9+bob)],fill=hair)
    d.line((9,5+bob,12,3+bob,17,4+bob),fill=light,width=2);d.line((11,6+bob,15,5+bob),fill=light)
    if name=='codebuddy':d.line((7,5+bob,10,3+bob,9,7+bob,14,4+bob,13,8+bob,18,5+bob,20,8+bob),fill=light)
    if name=='claude-code':
        box(d,(5,8+bob,7,17+bob),hair);box(d,(20,7+bob,22,18+bob),hair)
        d.line((6,10+bob,6,15+bob),fill=light)
    if back:
        box(d,(8,7+bob,19,14+bob),hair);d.line((9,8+bob,12,6+bob,16,7+bob),fill=light)
        d.line((13,10+bob,17,8+bob),fill=light);box(d,(9,14+bob,18,15+bob),hair)
    elif side:
        box(d,(8,8+bob,13,14+bob),hair);box(d,(18,10+bob,20,12+bob),'#f0cba1');d.point((18,9+bob),fill=INK)
    else:
        d.point((10,11+bob),fill=INK);d.point((17,11+bob),fill=INK);d.line((12,14+bob,15,14+bob),fill='#995e4b')
        if name=='codex':
            box(d,(8,10+bob,12,12+bob),None,INK);box(d,(15,10+bob,19,12+bob),None,INK)
            d.line((12,11+bob,15,11+bob),fill=INK)
    if action=='type':
        for x,y in [(3,16+frame%2),(20,17-frame%2)]:
            box(d,(x,y,x+3,y+5),shirt,INK);box(d,(x,y-2,x+3,y),skin,INK)
        box(d,(8,28,19,32),shade,INK);d.line((9,28,18,28),fill=shirt)
    if action=='tea':
        y=17 if frame<2 else 13
        box(d,(19,y+3,22,24),shade,INK);box(d,(18,y+2,21,y+5),skin,INK)
        box(d,(19,y,24,y+5),'#eee5ca',INK);box(d,(20,y,23,y+1),'#906642');d.point((25,y+2),fill='#ddd8bb')
        if frame%2==0:
            d.line((21,y-3,22,y-5),fill='#c9d4be');d.point((22,y-7),fill='#b9c8b4')
    if action=='idle' and frame in [2,3]:
        box(d,(3,14,6,19),shirt,INK);box(d,(4,12,7,14),skin,INK)
    if side and direction==1:sprites[key]=im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)

floors();plants();desk();sofa('sofa');sofa('bench',65,32);table();shelf();decor();coffee()
for palette in [('codex','#30404d','#60707b','#6aaf9a','#3f786a','#e9bd91'),
                ('codebuddy','#7a472d','#c88845','#5e92bc','#3b618b','#e9ba8e'),
                ('claude-code','#833f32','#c67348','#d2a455','#99723d','#e8b58a')]:
    for direction in range(4):
        for frame in range(4):character(*palette,'walk',direction,frame)
    for action in ['type','tea','idle']:
        for frame in range(4):character(*palette,action,0,frame)

atlas=Image.new('RGBA',(1024,512));meta={};x=y=2;rowh=0
for name,im in sprites.items():
    w,h=im.size
    if x+w+2>1024:x=2;y+=rowh+2;rowh=0
    atlas.alpha_composite(im,(x,y));meta[name]=[x,y,w,h]
    x+=w+2;rowh=max(rowh,h)
atlas=atlas.crop((0,0,1024,y+rowh+2));atlas.save(OUT/'office-atlas.png',optimize=True)
(OUT/'office-atlas.json').write_text(json.dumps(meta,separators=(',',':')),encoding='utf-8')
print(f'Drew {len(meta)} original pixel sprites: {atlas.size}')
