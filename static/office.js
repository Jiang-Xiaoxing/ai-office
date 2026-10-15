/* Original attic studio. Coordinates are source pixels; display scaling is integer-only.
 * Register future detectors in config/tools.json. Resident art lives in assets/residents.json.
 * Every resource and API URL is relative so an /office/ reverse proxy also works.
 */
(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const wrap = document.getElementById('wrap');
  const labels = document.getElementById('labels');
  const notice = document.getElementById('notice');
  const DESKS = [
    { id: 'codex', name: 'Codex', sprite: 'moss', color: '#a5cbb7' },
    { id: 'codebuddy', name: 'CodeBuddy', sprite: 'sky', color: '#a6c4e1' },
    { id: 'claude-code', name: 'Claude Code', subtitle: 'DeepSeek', sprite: 'sun', color: '#efd296' },
  ];
  const ACTIVITIES = { sleep: '打盹', read: '看书', tea: '喝茶', type: '敲键盘', walk: '走动' };
  const actors = DESKS.map((d, i) => ({ ...d, index: i, x: 0, y: 0, mode: 'idle', dir: 0,
    requested: null, route: [], distance: 0, frame: 0, phase: i * 1.3,
    idleSlot: i * 2, idleTime: 14 + i * 2, idleChanges: 0,
  }));
  let atlas, metadata, scene, layout, initialized = false, lastTime = 0, clock = 0;
  let latest = null, polls = 0, connected = false, polling = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const rect = (x, y, w, h, color, c = ctx) => {
    c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  function polygon(points, color, c) {
    // Scanline rasterization avoids Canvas' antialiased diagonal edges.
    const p=points.map(([x,y])=>[Math.round(x),Math.round(y)]);
    for(let y=Math.min(...p.map(v=>v[1]));y<=Math.max(...p.map(v=>v[1]));y++) {
      const xs=[];
      p.forEach(([x1,y1],i)=>{
        const [x2,y2]=p[(i+1)%p.length];
        if((y1<=y&&y2>y)||(y2<=y&&y1>y))xs.push(x1+(y-y1)*(x2-x1)/(y2-y1));
      });
      xs.sort((a,b)=>a-b);
      for(let i=0;i+1<xs.length;i+=2)rect(Math.ceil(xs[i]),y,Math.floor(xs[i+1])-Math.ceil(xs[i])+1,1,color,c);
    }
  }
  function line(points, color, width, c) {
    for(let i=1;i<points.length;i++) {
      let [x,y]=points[i-1].map(Math.round);const [tx,ty]=points[i].map(Math.round);
      const dx=Math.abs(tx-x),dy=-Math.abs(ty-y),sx=x<tx?1:-1,sy=y<ty?1:-1;
      let err=dx+dy;
      for(;;) {
        rect(x-Math.floor(width/2),y-Math.floor(width/2),width,width,color,c);
        if(x===tx&&y===ty)break;
        const twice=2*err;if(twice>=dy){err+=dy;x+=sx;}if(twice<=dx){err+=dx;y+=sy;}
      }
    }
  }
  function sprite(name, x, y, c = ctx) {
    const s = metadata[name];
    if (s) c.drawImage(atlas, ...s, Math.round(x), Math.round(y), s[2], s[3]);
  }
  function prop(l, name, x, y, solid = true) {
    x = Math.round(x); y = Math.round(y);
    const [,,w,h] = metadata[name];
    l.props.push({ name, x, y, depth: y + (name==='armchair'||name==='sofa'?18:h-4) });
    if (solid) l.blocks.push({ x:x+2, y:y+Math.max(12,h*.48), w:w-4, h:h*.45 });
  }
  function roomLayout(w,h,portrait) {
    const l = { w,h,portrait,props:[],blocks:[],desks:[],spots:[] };
    const positions = portrait ? [[18,101],[w-96,177],[18,253]] :
      [[Math.round(w*.235)-39,98],[Math.round(w*.5)-39,Math.round(h*.54)],[Math.round(w*.765)-39,98]];
    actors.forEach((a,i) => {
      const [x,y] = positions[i];
      l.desks.push({id:a.id,x,y,seat:{x:x+39,y:y+54}});
      l.blocks.push({x,y:y+13,w:78,h:25});
    });
    if (portrait) {
      prop(l,'bookcase',w-64,64);
      prop(l,'armchair',w-48,117,false);
      prop(l,'sofa',18,h-61,false);
      prop(l,'tea-table',w-54,h-70);
      prop(l,'plant',w-34,228);
      prop(l,'lamp',16,h-117);
      l.spots = [
        {x:45,y:h-29,action:'sleep'},{x:75,y:h-25,action:'sleep'},
        {x:w-72,y:h-29,action:'tea'},{x:w-30,y:h-28,action:'tea'},
        {x:w-32,y:150,action:'read'},{x:w-73,y:157,action:'read'},
      ];
      l.rug = {x:13,y:h-89,w:w-26,h:76};
    } else {
      prop(l,'sideboard',25,87);
      prop(l,'bookcase',w-76,80);
      prop(l,'plant',23,122);
      prop(l,'plant',w-41,143);
      prop(l,'sofa',26,h-66,false);
      prop(l,'armchair',w-65,h-65,false);
      prop(l,'lamp',w-95,h-102);
      prop(l,'tea-table',Math.round(w*.64),h-49);
      l.spots = [
        {x:48,y:h-31,action:'sleep'},{x:78,y:h-26,action:'sleep'},
        {x:Math.round(w*.64)-18,y:h-27,action:'tea'},{x:Math.round(w*.64)+53,y:h-24,action:'tea'},
        {x:w-49,y:h-31,action:'read'},{x:w-50,y:h-75,action:'read'},
      ];
      l.rug = {x:Math.round(w*.32),y:Math.round(h*.52),w:Math.round(w*.4),h:h-Math.round(h*.52)-15};
    }
    return l;
  }
  function rug(r,c) {
    rect(r.x+2,r.y+3,r.w,r.h,'#a16f56',c);
    rect(r.x,r.y,r.w,r.h,'#617d7a',c);rect(r.x+2,r.y+2,r.w-4,r.h-4,'#c4b48b',c);
    rect(r.x+4,r.y+4,r.w-8,r.h-8,'#6c8c86',c);
    rect(r.x+8,r.y+8,r.w-16,r.h-16,'#77958c',c);
    for(let x=r.x+13;x<r.x+r.w-9;x+=14)for(const y of [r.y+9,r.y+r.h-12])
      polygon([[x,y-2],[x+3,y+1],[x,y+4],[x-3,y+1]],'#dfc796',c);
    for(let y=r.y+20;y<r.y+r.h-15;y+=16)for(let x=r.x+20;x<r.x+r.w-14;x+=22) {
      rect(x,y,2,2,'#a9b69b',c);rect(x+3,y+3,2,2,'#91a895',c);
    }
    for(let y=r.y+3;y<r.y+r.h-2;y+=4) {
      rect(r.x-2,y,2,1,'#d2b68c',c);rect(r.x+r.w,y,2,1,'#d2b68c',c);
    }
  }
  function buildScene() {
    const {w,h,portrait} = layout;
    scene = document.createElement('canvas');scene.width=w;scene.height=h;
    const c=scene.getContext('2d');c.imageSmoothingEnabled=false;
    rect(0,0,w,h,'#292a3d',c);
    // A cutaway attic, one continuous cedar floor with no internal dividing wall.
    rect(10,76,w-20,h-87,'#493a44',c);
    const colors=['#c58f62','#cd9869','#d09c6c','#c28c60','#cb9565'];
    for(let y=81,row=0;y<h-13;y+=9,row++) {
      for(let x=13-(row%2)*24;x<w-13;x+=48) {
        const left=Math.max(13,x),right=Math.min(w-13,x+47);
        if(right<left)continue;
        rect(left,y,right-left+1,8,colors[(row+Math.abs(x)*3)%colors.length],c);
        rect(left,y,right-left+1,1,'#dfb17e',c);
        rect(right,y+1,1,8,'#ae7958',c);
        if(x>14&&x<w-55){rect(x+7,y+3,17,1,'#bd885e',c);rect(x+21,y+5,16,1,'#d8a575',c);}
      }
    }
    rect(13,78,w-26,4,'#8e6352',c);
    rect(13,82,w-26,1,'#e4b886',c);
    rug(layout.rug,c);
    // Eaves and a steep cedar roof with exposed rafters.
    polygon([[9,79],[53,9],[w-53,9],[w-9,79]],'#4b3b4d',c);
    polygon([[17,72],[57,14],[w-57,14],[w-17,72]],'#736071',c);
    for(let y=19;y<72;y+=8) {
      const inset=57-(y-14)*.69;
      rect(inset,y,w-inset*2,1,'#856d79',c);
      rect(inset,y+1,w-inset*2,1,'#675566',c);
    }
    for(const f of [.15,.32,.68,.85]) {
      const x=w*f;
      line([[w/2+(x-w/2)*.76,14],[x,75]],'#3f3444',7,c);
      line([[w/2+(x-w/2)*.76-1,14],[x-1,75]],'#a27b73',3,c);
    }
    line([[11,79],[53,9],[w-53,9],[w-11,79]],'#302b3b',5,c);
    line([[14,78],[55,12],[w-55,12],[w-14,78]],'#b78b77',2,c);
    rect(12,72,w-24,7,'#60474c',c);rect(14,73,w-28,2,'#c09477',c);
    // Original trapezoid skylight: a blue evening sky, crescent and distant treetops.
    const cx=Math.round(w*.5),sw=portrait?57:90;
    const sx=cx-sw/2;
    polygon([[sx+9,21],[sx+sw-9,21],[sx+sw,62],[sx,62]],'#332f40',c);
    polygon([[sx+12,24],[sx+sw-12,24],[sx+sw-4,58],[sx+4,58]],'#e3c59c',c);
    polygon([[sx+15,27],[sx+sw-15,27],[sx+sw-8,54],[sx+8,54]],'#597a91',c);
    polygon([[sx+11,44],[sx+sw-10,44],[sx+sw-8,54],[sx+8,54]],'#809aa3',c);
    for(let i=0;i<7;i++)rect(sx+13+i*8,32+(i*7)%15,1,1,'#eee2bd',c);
    rect(cx+9,30,7,7,'#f7e2b2',c);rect(cx+12,29,5,6,'#597a91',c);
    polygon([[sx+8,52],[sx+17,45],[sx+25,50],[cx-3,43],[cx+10,51],[sx+sw-13,47],[sx+sw-8,54]],'#4f737c',c);
    line([[cx,25],[cx,57]],'#cfb591',2,c);
    line([[sx+7,44],[sx+sw-7,44]],'#cfb591',2,c);
    line([[sx+15,36],[sx+20,31]],'#a3bcc1',1,c);
    // Soft light is stepped pixel geometry, never a blurred raster overlay.
    polygon([[cx-22,84],[cx+22,84],[cx+53,116],[cx-43,116]],'#e0b38635',c);
    const bulbs=portrait?[w*.23,w*.77]:[w*.13,w*.37,w*.63,w*.87];
    line([[19,59],[w*.27,68],[w*.5,62],[w*.73,68],[w-19,59]],'#493944',1,c);
    bulbs.forEach((x,i)=>{
      const y=64+(i%2)*3;
      rect(x-6,y-4,13,13,'#efc97e12',c);rect(x-3,y-2,7,8,'#efc97e20',c);
      rect(x-1,y,3,4,'#ffe0a0',c);rect(x,y-2,1,2,'#aa8564',c);
    });
    // Roof-side posts, warm skirting and a small stair opening at the front.
    for(const x of [9,w-13]){rect(x,77,4,h-88,'#60474b',c);rect(x+1,80,1,h-94,'#c39472',c);}
    rect(10,h-13,w-20,4,'#785349',c);rect(13,h-13,w-26,1,'#e5bb88',c);
    rect(10,h-9,w-20,3,'#3c3140',c);
    if(!portrait) {
      const stairX=Math.round(w*.36);
      rect(stairX,h-12,38,8,'#393142',c);
      for(let i=0;i<3;i++)rect(stairX+i*4,h-11+i*2,34-i*4,1,'#9e7965',c);
    }
    // Floor pools under the brass reading lamp and the home coffee shelf.
    const lamp=layout.props.find(p=>p.name==='lamp');
    for(const [inset,alpha] of [[0,'0b'],[4,'10'],[8,'15']])
      rect(lamp.x-13+inset,lamp.y+28+inset,48-inset*2,29-inset*2,`#ffe2a0${alpha}`,c);
    // Wall details: framed print, wooden peg rail and a tiny analog clock.
    if(!portrait) {
      rect(31,39,24,24,'#3f3444',c);rect(33,41,20,20,'#d7b58a',c);
      rect(35,43,16,16,'#8caa9d',c);
      polygon([[35,58],[40,49],[44,55],[48,48],[51,58]],'#597d79',c);
      rect(w-59,43,15,15,'#d6b28a',c);rect(w-57,45,11,11,'#efdbb3',c);
      line([[w-52,47],[w-52,51],[w-49,53]],'#75545b',1,c);
    }
  }
  function walkable(x,y) {
    if(x<22||x>layout.w-22||y<90||y>layout.h-19)return false;
    return !layout.blocks.some(b=>x>b.x-5&&x<b.x+b.w+5&&y>b.y-3&&y<b.y+b.h+4);
  }
  function nearestFree(point) {
    const gx=Math.round(point.x/4),gy=Math.round(point.y/4);
    for(let r=0;r<22;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++) {
      if(Math.abs(dx)!==r&&Math.abs(dy)!==r)continue;
      const x=(gx+dx)*4,y=(gy+dy)*4;
      if(walkable(x,y))return {x,y};
    }
    return null;
  }
  function routeBetween(start,target) {
    const s=nearestFree(start),end=nearestFree(target);
    if(!s||!end||!walkable(target.x,target.y))return [];
    const key=p=>`${p.x},${p.y}`,queue=[s],seen=new Map([[key(s),null]]);
    let found=false;
    for(let i=0;i<queue.length;i++) {
      const p=queue[i];if(p.x===end.x&&p.y===end.y){found=true;break;}
      const options=[[4,0],[-4,0],[0,4],[0,-4]].sort((a,b)=>
        Math.abs(p.x+a[0]-end.x)+Math.abs(p.y+a[1]-end.y)-Math.abs(p.x+b[0]-end.x)-Math.abs(p.y+b[1]-end.y));
      for(const [dx,dy] of options) {
        const n={x:p.x+dx,y:p.y+dy},k=key(n);
        if(!seen.has(k)&&walkable(n.x,n.y)){seen.set(k,p);queue.push(n);}
      }
    }
    if(!found)return [];
    const path=[];let p=end;
    while(p){path.unshift(p);p=seen.get(key(p));}
    path.push({x:target.x,y:target.y});
    return path.filter((p,i)=>i===0||i===path.length-1||
      (p.x-path[i-1].x)*(path[i+1].y-p.y)!==(p.y-path[i-1].y)*(path[i+1].x-p.x));
  }
  function destination(a) {
    return a.requested==='working'?layout.desks[a.index].seat:layout.spots[a.idleSlot];
  }
  function go(a,target,arrival) {
    a.pending=null;a.route=routeBetween(a,target);a.arrival=arrival;
    if(a.route.length)a.mode='walk';
    else if(Math.hypot(a.x-target.x,a.y-target.y)<.1)a.mode=arrival;
    else{a.mode='idle';a.pending={...target};a.retryTime=1;}
  }
  function chooseLeisure(a) {
    const taken=new Set(actors.filter(other=>other!==a&&other.requested==='idle').map(other=>other.idleSlot));
    const choices=layout.spots.map((p,i)=>({p,i})).filter(({p,i})=>!taken.has(i)&&p.action!==layout.spots[a.idleSlot].action&&walkable(p.x,p.y));
    if(!choices.length){a.idleTime=4;return;}
    a.idleSlot=choices[Math.floor(Math.random()*choices.length)].i;a.idleChanges++;
    go(a,destination(a),destination(a).action);
  }
  function fit() {
    if(!metadata)return;
    const ww=wrap.clientWidth,wh=wrap.clientHeight,portrait=ww/wh<1.18;
    const zoom=Math.max(1,Math.floor(portrait?Math.min(ww/180,wh/360):Math.min(ww/460,wh/236)));
    const w=Math.floor(ww/zoom),h=Math.floor(wh/zoom);
    if(initialized&&canvas.width===w&&canvas.height===h&&layout.zoom===zoom)return;
    canvas.width=w;canvas.height=h;canvas.style.width=`${w*zoom}px`;canvas.style.height=`${h*zoom}px`;
    const ox=Math.floor((ww-w*zoom)/2),oy=Math.floor((wh-h*zoom)/2);
    canvas.style.left=`${ox}px`;canvas.style.top=`${oy}px`;
    ctx.imageSmoothingEnabled=false;
    layout=roomLayout(w,h,portrait);Object.assign(layout,{zoom,ox,oy});buildScene();
    actors.forEach(a=>{
      const target=destination(a),p=nearestFree(target);
      a.x=p.x;a.y=p.y;a.route=[];
      if(a.requested)go(a,target,a.requested==='working'?'type':target.action);
    });
    initialized=true;
  }
  function updateActors(dt) {
    for(const a of actors) {
      if(a.pending){a.retryTime-=dt;if(a.retryTime<=0)go(a,a.pending,a.arrival);}
      else if(a.route.length) {
        let budget=dt*48;
        while(budget>0&&a.route.length) {
          const p=a.route[0],dx=p.x-a.x,dy=p.y-a.y,dist=Math.hypot(dx,dy);
          if(dist<.01){a.route.shift();continue;}
          a.dir=Math.abs(dx)>Math.abs(dy)?(dx<0?1:2):(dy<0?3:0);
          const move=Math.min(budget,dist);a.x+=dx/dist*move;a.y+=dy/dist*move;
          a.distance+=move;budget-=move;if(move===dist)a.route.shift();
        }
        if(!a.route.length){a.mode=a.arrival;a.dir=a.mode==='type'?3:0;a.idleTime=12+Math.random()*10;}
      } else if(a.requested==='idle') {
        a.idleTime-=dt;if(a.idleTime<=0)chooseLeisure(a);
      }
      a.frame=a.mode==='walk'?Math.floor(a.distance/4)%4:Math.floor((clock+a.phase)*(a.mode==='type'?6:a.mode==='sleep'?.8:1.5))%4;
    }
  }
  function monitor(d,a) {
    // The monitor wakes only when its resident reaches the chair.
    const on=a.mode==='type'&&a.requested==='working';
    if(on) {
      rect(d.x+28,d.y+5,22,13,'#547b80');rect(d.x+29,d.y+6,20,1,'#a6c8b2');
      for(let i=0;i<3;i++) {
        rect(d.x+29+i%2,d.y+9+i*3,6+i*3,1,i%2?'#eccb8a':'#b6d5b9');
        rect(d.x+45,d.y+9+i*3,3,1,'#88aaa4');
      }
      if(Math.floor(clock*3)%2)rect(d.x+42,d.y+16,2,1,'#f3d99f');
      rect(d.x+51,d.y+20,1,1,'#9ec9a1');
    }else rect(d.x+51,d.y+20,1,1,'#b18e6e');
  }
  function updateLabels() {
    for(const a of actors) {
      const el=a.label;
      const state=a.requested===null?'连接中':ACTIVITIES[a.mode]||'歇一会';
      if(el.lastElementChild.textContent!==state)el.lastElementChild.textContent=state;
      el.classList.toggle('working',a.requested==='working');
    }
    const ww=wrap.clientWidth,wh=wrap.clientHeight;
    const plates=actors.map(a=>({a,w:a.label.offsetWidth,h:a.label.offsetHeight,
      cx:layout.ox+Math.round(a.x)*layout.zoom,y:layout.oy+Math.round(a.y)*layout.zoom+5}));
    const placed=[];
    for(const p of plates.sort((a,b)=>a.y-b.y||a.a.index-b.a.index)) {
      const cx=Math.max(p.w/2+6,Math.min(ww-p.w/2-6,p.cx)),x=cx-p.w/2;
      const desired=Math.min(wh-p.h-4,p.y);
      const candidates=[desired,...placed.flatMap(q=>[q.y+q.h+3,q.y-p.h-3])];
      const free=candidates.filter(y=>y>=4&&y+p.h<=wh-4&&!placed.some(q=>
        x<q.x+q.w+3&&x+p.w+3>q.x&&y<q.y+q.h+3&&y+p.h+3>q.y));
      const y=free.sort((a,b)=>Math.abs(a-desired)-Math.abs(b-desired))[0]??desired;
      p.a.label.style.left=`${cx}px`;p.a.label.style.top=`${y}px`;placed.push({x,y,w:p.w,h:p.h});
    }
  }
  function render(now) {
    const dt=lastTime?Math.min((now-lastTime)/1000,.08):0;lastTime=now;clock+=dt;
    updateActors(dt);ctx.drawImage(scene,0,0);
    const drawables=layout.props.map(p=>({depth:p.depth,draw:()=>sprite(p.name,p.x,p.y)}));
    layout.desks.forEach((d,i)=>{
      sprite('chair',d.seat.x-13,d.seat.y-17);
      drawables.push({depth:d.y+40,draw:()=>{sprite('desk',d.x,d.y);monitor(d,actors[i]);}});
    });
    actors.forEach(a=>drawables.push({depth:a.y,draw:()=>{
      const f=reduced.matches&&a.mode!=='walk'?0:a.frame;
      sprite(`${a.sprite}-${a.mode}-${a.mode==='walk'?a.dir:0}-${f}`,a.x-13,a.y-(a.mode==='type'?40:34));
      if(a.mode==='sleep') {
        const x=Math.round(a.x)+11,y=Math.round(a.y)-32-(Math.floor(clock)%3)*2;
        rect(x,y,4,1,'#f6e2b8');rect(x+2,y+1,1,1,'#f6e2b8');rect(x+1,y+2,1,1,'#f6e2b8');rect(x,y+3,4,1,'#f6e2b8');
      }
    }}));
    drawables.sort((a,b)=>a.depth-b.depth).forEach(d=>d.draw());
    updateLabels();requestAnimationFrame(render);
  }
  function createLabels() {
    for(const a of actors) {
      const el=document.createElement('div');el.className='nameplate';el.style.setProperty('--agent-color',a.color);
      const name=document.createElement('strong');name.textContent=a.name;
      el.append(name);
      if(a.subtitle){const sub=document.createElement('small');sub.textContent=a.subtitle;el.append(sub);}
      const state=document.createElement('span');el.append(state);a.label=el;labels.append(el);
    }
  }
  function updateRoster() {
    const roster=document.getElementById('roster');roster.replaceChildren();
    for(const a of actors) {
      const el=document.createElement('span');el.className='agent-status';el.style.setProperty('--agent-color',a.color);
      const dot=document.createElement('i'),name=document.createElement('span'),state=document.createElement('em');
      name.textContent=a.name;state.textContent=a.requested===null?'连接中':a.requested==='working'?'干活中':'摸鱼中';
      el.append(dot,name,state);roster.append(el);
    }
    canvas.setAttribute('aria-label',actors.map(a=>`${a.name}${a.subtitle||''}：${a.requested==='working'?'干活中':'摸鱼中'}`).join('；'));
  }
  async function poll() {
    if(polling)return;polling=true;
    try {
      const response=await fetch('api/status',{cache:'no-store',signal:AbortSignal.timeout(2500)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      if(!Array.isArray(data.agents)||!Number.isFinite(data.ts))throw new Error('Invalid status response');
      latest=data;polls++;connected=true;
      for(const a of actors) {
        const status=data.agents.find(s=>s.id===a.id)?.status;
        if(status!=='working'&&status!=='idle')continue;
        if(status!==a.requested) {
          a.requested=status;const target=destination(a);
          go(a,target,status==='working'?'type':target.action);
        }
      }
      document.getElementById('ts').textContent=new Date(data.ts*1000).toLocaleTimeString('zh-CN',{hour12:false});
      document.getElementById('connection').textContent='已同步';document.getElementById('signal').className='signal live';
      notice.hidden=true;updateRoster();
    } catch {
      connected=false;document.getElementById('connection').textContent='正在重连';document.getElementById('signal').className='signal error';
      notice.textContent=latest?'暂时无法同步，保留上次状态 · 正在重连':'无法连接办公室 · 正在重连';notice.hidden=false;
    } finally {polling=false;}
  }
  Object.defineProperty(window,'officeDebug',{value:Object.freeze({
    snapshot:()=>({ready:initialized,connected,polls,clock,zoom:layout?.zoom,width:layout?.w,height:layout?.h,
      portrait:layout?.portrait,smoothing:ctx.imageSmoothingEnabled,
      actors:actors.map(a=>({id:a.id,x:a.x,y:a.y,mode:a.mode,frame:a.frame,dir:a.dir,requested:a.requested,
        idleSlot:a.idleSlot,idleChanges:a.idleChanges,route:a.route.map(p=>({...p})),
        target:initialized?destination(a):null,walkable:initialized?walkable(a.x,a.y):false,
        monitorOn:a.mode==='type'&&a.requested==='working'})),
      obstacles:layout?.blocks.map(b=>({...b})),stations:layout?.desks.map(d=>({...d})),
      spots:layout?.spots.map(p=>({...p,walkable:walkable(p.x,p.y)})),
    }),
  }),writable:false});
  async function start() {
    try {
      const image=new Image();image.src='static/assets/office-atlas.png';
      const [,data]=await Promise.all([image.decode(),fetch('static/assets/office-atlas.json').then(r=>{if(!r.ok)throw new Error('Atlas missing');return r.json();})]);
      atlas=image;metadata=data;createLabels();fit();updateRoster();document.getElementById('loading').hidden=true;
      requestAnimationFrame(render);poll();setInterval(poll,3000);new ResizeObserver(fit).observe(wrap);
      document.addEventListener('visibilitychange',()=>{lastTime=0;if(!document.hidden)poll();});
    } catch(error) {document.getElementById('loading').textContent='素材加载失败，请刷新页面';console.error(error);}
  }
  start();
})();
