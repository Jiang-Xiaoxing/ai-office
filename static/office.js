/* Approved sunny attic. Coordinates use the background's native 480x270 pixel grid.
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
  // Geometry is capacity, not a tool list. Existing tools retain their original seats/looks.
  const HOMES = { codex: 0, openrouter: 1, 'claude-code': 2 };
  const CAPACITY = 6, IDLE_SLOTS = [0, 2, 4, 1, 3, 5];
  const COLORS = ['#a5cbb7', '#a6c4e1', '#efd296', '#b39ac4', '#c5838b', '#9cb47a'];
  const ACTIVITIES = { sleep: '打盹', read: '看书', tea: '喝茶', type: '敲键盘', walk: '走动' };
  const actors = [];
  let tools = [], residents = [], overflowNotice = '';
  const ROOM = { w: 480, h: 270 };
  let atlas, background, metadata, scene, weather, layout, initialized = false, lastTime = 0, clock = 0;
  let latest = null, polls = 0, connected = false, polling = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const rect = (x, y, w, h, color, c = ctx) => {
    c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  function sprite(name, x, y, c = ctx) {
    const s = metadata[name];
    if (s) c.drawImage(atlas, ...s, Math.round(x), Math.round(y), s[2], s[3]);
  }
  function roomLayout() {
    // Chairs, monitor interiors and obstacles are measured on attic-bg-2.png / 4.
    // The first three stations are baked in; only occupied extra stations are drawn.
    const slots = [
      { seat: { x: 96, y: 118 }, screen: { x: 84, y: 66, w: 23, h: 13 } },
      { seat: { x: 384, y: 118 }, screen: { x: 372, y: 66, w: 23, h: 13 } },
      { seat: { x: 406, y: 237 }, screen: { x: 394, y: 184, w: 23, h: 13 } },
      // Back wall, then the two front-edge bays flanking (not blocking) stairs.
      ...[{ x: 222, y: 63 }, { x: 147, y: 185 }, { x: 301, y: 185 }].map(p => ({
        seat: { x: p.x + 31, y: p.y + 55 },
        screen: { x: p.x + 22, y: p.y + 3, w: 18, h: 13 },
        furniture: { ...p, w: 64, h: 63 }, sprite: 'desk-wall',
        block: { x: p.x, y: p.y + 14, w: 63, h: 27 } })),
    ];
    const desks = actors.map(a => ({ ...slots[a.slot], id: a.id, slot: a.slot }));
    const occupied = slot => desks.some(d => d.slot === slot);
    return {
      ...ROOM,
      desks,
      // Visual extents differ from floor collision footprints. Labels must also
      // preserve the room's original furnishings, not just the generated desks.
      protected: [
        { x: 58, y: 63, w: 78, h: 60 }, { x: 345, y: 63, w: 77, h: 60 },
        { x: 368, y: 180, w: 77, h: 61 }, // original desks and chairs
        { x: 13, y: 151, w: 20, h: 54 }, // floor lamp
        { x: 30, y: 173, w: 80, h: 70 }, { x: 114, y: 183, w: 31, h: 45 },
        { x: 215, y: 207, w: 53, h: 47 }, // stairs stay clear all the way to the opening
        ...(!occupied(4) ? [{ x: 194, y: 210, w: 21, h: 37 }] : []),
        ...(!occupied(5) ? [{ x: 272, y: 207, w: 27, h: 40 }] : []),
        { x: 430, y: 74, w: 37, h: 65 }, { x: 177, y: 52, w: 42, h: 42 },
        { x: 90, y: 17, w: 66, h: 37 }, { x: 326, y: 19, w: 62, h: 35 },
        { x: 228, y: 20, w: 24, h: 23 }, // pendant and windows
        { x: 27, y: 76, w: 29, h: 36 }, { x: 445, y: 181, w: 24, h: 49 },
        { x: 289, y: 59, w: 20, h: 20 }, // rear hanging picture
        ...(!occupied(3) ? [{ x: 221, y: 40, w: 56, h: 56 }] : []),
        ...desks.filter(d => d.furniture).map(d => d.furniture),
      ],
      blocks: [
        { x: 58, y: 77, w: 77, h: 27 },
        { x: 345, y: 77, w: 77, h: 27 },
        { x: 368, y: 193, w: 76, h: 28 },
        { x: 430, y: 83, w: 36, h: 54 },
        { x: 30, y: 174, w: 80, h: 17 },
        { x: 55, y: 211, w: 32, h: 20 },
        { x: 13, y: 158, w: 16, h: 47 },
        ...(!occupied(4) ? [{ x: 197, y: 230, w: 17, h: 15 }] : []),
        { x: 217, y: 219, w: 49, h: 35 },
        ...(!occupied(5) ? [{ x: 274, y: 230, w: 20, h: 15 }] : []),
        { x: 446, y: 207, w: 20, h: 22 },
        ...desks.filter(d => d.block).map(d => d.block),
      ],
      spots: [
        { x: 62, y: 208, action: 'sleep' }, { x: 94, y: 202, action: 'sleep' },
        { x: 92, y: 242, action: 'tea' }, { x: 174, y: 168, action: 'tea' },
        { x: 132, y: 215, action: 'read' }, { x: 310, y: 168, action: 'read' },
        { x: 218, y: 168, action: 'read' }, { x: 350, y: 168, action: 'tea' },
        { x: 70, y: 151, action: 'tea' },
      ],
    };
  }
  function buildScene() {
    scene = document.createElement('canvas');scene.width=ROOM.w;scene.height=ROOM.h;
    const c=scene.getContext('2d');c.imageSmoothingEnabled=false;
    // The supplied PNG is an exact 4x nearest-neighbor enlargement of this grid.
    c.drawImage(background,0,0,ROOM.w,ROOM.h);
    if(layout.desks.some(d=>d.slot===3))sprite('clear-rear-plants',220,43,c);
    if(layout.desks.some(d=>d.slot===4))sprite('clear-stair-plant',194,210,c);
    if(layout.desks.some(d=>d.slot===5))sprite('clear-right-plant',270,207,c);
    for(const d of layout.desks)if(d.furniture) {
      sprite('chair',d.seat.x-13,d.seat.y-19,c);
      sprite(d.sprite,d.furniture.x,d.furniture.y,c);
    }
    weather=AtticWeather.create(scene);
  }
  function syncTools(incoming) {
    tools=incoming.map(t=>({...t}));
    const visible=tools.slice(0,CAPACITY),used=new Set();
    // Reserve resident identities before assigning new tools, even if config is reordered.
    const slots=new Map(visible.filter(t=>Object.hasOwn(HOMES,t.id)).map(t=>[t.id,HOMES[t.id]]));
    slots.forEach(slot=>used.add(slot));
    for(const t of visible)if(!slots.has(t.id)) {
      const slot=Array.from({length:CAPACITY},(_,i)=>i).find(i=>!used.has(i));
      slots.set(t.id,slot);used.add(slot);
    }
    const signature=visible.map(t=>JSON.stringify([t.id,t.name,slots.get(t.id)])).join('|');
    if(signature!==actors.signature) {
      const previous=new Map(actors.map(a=>[a.id,a]));
      actors.splice(0,actors.length,...visible.map((t,index)=>{
        const slot=slots.get(t.id),look=residents[slot],old=previous.get(t.id);
        const parts=(t.name||t.id).match(/^(.*?)\s*[（(]([^()（）]+)[）)]$/);
        const identity={id:t.id,name:parts?parts[1]:(t.name||t.id),subtitle:parts?.[2],
          rosterName:t.name||t.id,index,slot,sprite:look.id,color:COLORS[slot]};
        if(old?.slot===slot)return Object.assign(old,identity);
        return {...identity,x:0,y:0,mode:'idle',dir:0,requested:null,route:[],distance:0,frame:0,
          phase:slot*1.3,idleSlot:IDLE_SLOTS[slot],idleTime:14+slot*2,idleChanges:0};
      }));
      actors.signature=signature;layout={...layout,...roomLayout()};buildScene();
      for(const a of actors)if(a.requested===null) {
        const p=nearestFree(destination(a));a.x=p.x;a.y=p.y;
      }
      createLabels();
    }
    const excess=tools.slice(CAPACITY).map(t=>t.id).join(',');
    if(excess&&excess!==overflowNotice)console.warn(`AI 办公室最多显示 ${CAPACITY} 人；其余工具仅在底栏显示：${excess}`);
    overflowNotice=excess;
  }
  function walkable(x,y) {
    // Routes may run along a solid edge; discard floating-point movement noise.
    x=Math.round(x*1e6)/1e6;y=Math.round(y*1e6)/1e6;
    if(x<22||x>layout.w-22||y<110||y>layout.h-22)return false;
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
    const choices=layout.spots.map((p,i)=>({p,i})).filter(({p,i})=>!taken.has(i)&&p.action!==layout.spots[a.idleSlot].action&&walkable(p.x,p.y)&&
      !actors.some(other=>other!==a&&other.requested==='idle'&&
        Math.abs(p.x-layout.spots[other.idleSlot].x)<28&&Math.abs(p.y-layout.spots[other.idleSlot].y)<38));
    if(!choices.length){a.idleTime=4;return;}
    a.idleSlot=choices[Math.floor(Math.random()*choices.length)].i;a.idleChanges++;
    go(a,destination(a),destination(a).action);
  }
  function fit() {
    if(!metadata)return;
    const ww=wrap.clientWidth,wh=wrap.clientHeight;
    // Keep the entire approved room, its aspect ratio and a whole-number pixel zoom.
    // Below 480px, decimate by a whole source-pixel step before integer enlargement.
    const sample=Math.max(1,Math.ceil(Math.max(ROOM.w/ww,ROOM.h/wh)));
    const w=Math.ceil(ROOM.w/sample),h=Math.ceil(ROOM.h/sample);
    const zoom=Math.max(1,Math.floor(Math.min(ww/w,wh/h))),pixelScale=zoom/sample;
    if(initialized&&canvas.width===w&&canvas.height===h&&layout.zoom===zoom&&
      layout.viewportWidth===ww&&layout.viewportHeight===wh)return;
    canvas.width=w;canvas.height=h;canvas.style.width=`${w*zoom}px`;canvas.style.height=`${h*zoom}px`;
    const ox=Math.floor((ww-w*zoom)/2),oy=Math.floor((wh-h*zoom)/2);
    canvas.style.left=`${ox}px`;canvas.style.top=`${oy}px`;
    ctx.imageSmoothingEnabled=false;ctx.setTransform(1/sample,0,0,1/sample,0,0);
    if(!initialized){layout=roomLayout();buildScene();}
    Object.assign(layout,{zoom,sample,pixelScale,ox,oy,viewportWidth:ww,viewportHeight:wh});
    // Resizing only changes projection; do not teleport residents or interrupt a walk.
    if(!initialized)actors.forEach(a=>{
      const target=destination(a),p=nearestFree(target);
      a.x=p.x;a.y=p.y;a.route=[];
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
          if(dist<.01){a.x=p.x;a.y=p.y;a.route.shift();continue;}
          a.dir=Math.abs(dx)>Math.abs(dy)?(dx<0?1:2):(dy<0?3:0);
          const move=Math.min(budget,dist);a.x+=dx/dist*move;a.y+=dy/dist*move;
          a.distance+=move;budget-=move;if(move===dist){a.x=p.x;a.y=p.y;a.route.shift();}
        }
        if(!a.route.length){a.mode=a.arrival;a.dir=a.mode==='type'?3:0;a.idleTime=12+Math.random()*10;}
      } else if(a.requested==='idle') {
        a.idleTime-=dt;if(a.idleTime<=0)chooseLeisure(a);
      }
      a.frame=a.mode==='walk'?Math.floor(a.distance/4)%4:Math.floor((clock+a.phase)*(a.mode==='type'?6:a.mode==='sleep'?.8:1.5))%4;
    }
  }
  function monitor(d,a) {
    // Only cover the existing monitor's dark interior, preserving its frame and desk.
    if(a.mode!=='type'||a.requested!=='working')return;
    const {x,y,w,h}=d.screen;
    rect(x,y,w,h,'#547b80');rect(x+1,y+1,w-2,1,'#a6c8b2');
    for(let i=0;i<3;i++) {
      rect(x+2+i%2,y+4+i*3,6+i*3,1,i%2?'#eccb8a':'#b6d5b9');
      rect(x+w-4,y+4+i*3,2,1,'#88aaa4');
    }
    if(Math.floor(clock*3)%2)rect(x+16,y+h-2,2,1,'#f3d99f');
  }
  function updateLabels() {
    for(const a of actors) {
      const el=a.label;
      const state=a.requested===null?'连接中':ACTIVITIES[a.mode]||'歇一会';
      if(el.lastElementChild.textContent!==state)el.lastElementChild.textContent=state;
      el.classList.toggle('working',a.requested==='working');
    }
    const ww=wrap.clientWidth,wh=wrap.clientHeight,scale=layout.pixelScale;
    // Desktop bars overlay the room edges; wrapped mobile bars occupy their own rows.
    const room=wrap.getBoundingClientRect();
    const top=Math.max(0,document.getElementById('bar').getBoundingClientRect().bottom-room.top)+6;
    const bottom=Math.min(wh,document.getElementById('footer').getBoundingClientRect().top-room.top)-6;
    const bodies=actors.map(a=>({x:layout.ox+(Math.round(a.x)-13)*scale-3,
      y:layout.oy+(Math.round(a.y)-(a.mode==='type'?40:34))*scale-3,
      w:26*scale+6,h:36*scale+6}));
    const overlaps=(p,q)=>p.x<q.x+q.w+3&&p.x+p.w+3>q.x&&p.y<q.y+q.h+3&&p.y+p.h+3>q.y;
    const plates=actors.map(a=>({a,w:a.label.offsetWidth,h:a.label.offsetHeight,
      cx:layout.ox+Math.round(a.x)*scale,y:layout.oy+(Math.round(a.y)+2)*scale+12}));
    // Typing frames change the sprite, not its bounds. Reuse placement while
    // everyone is still, rather than solve the same furniture avoidance at 60Hz.
    const key=[ww,wh,scale,top,bottom,...actors.flatMap((a,i)=>[
      Math.round(a.x),Math.round(a.y),a.mode,plates[i].w,plates[i].h])].join('|');
    if(labels.layoutKey===key)return;labels.layoutKey=key;
    const furniture=layout.protected.map(d=>({
      x:layout.ox+d.x*scale,y:layout.oy+d.y*scale,w:d.w*scale,h:d.h*scale}));
    const placed=[];
    for(const p of plates.sort((a,b)=>a.y-b.y||a.a.index-b.a.index)) {
      const clampX=x=>Math.max(2,Math.min(ww-p.w-2,x));
      const x=clampX(p.cx-p.w/2);
      const desired=Math.min(bottom-p.h,p.y);
      const obstacles=[...bodies,...furniture,...placed];
      const ys=[desired,...obstacles.flatMap(q=>[q.y+q.h+6,q.y-p.h-6])];
      const xs=[x,...obstacles.flatMap(q=>[clampX(q.x-p.w-6),clampX(q.x+q.w+6)])];
      const free=xs.flatMap(x=>ys.map(y=>({x,y,w:p.w,h:p.h}))).filter(r=>r.y>=top&&r.y+r.h<=bottom&&
        !obstacles.some(q=>overlaps(r,q)));
      const cost=r=>Math.hypot(r.x-x,r.y-desired);
      const best=free.sort((a,b)=>cost(a)-cost(b))[0]??{x,y:desired,w:p.w,h:p.h};
      p.a.label.style.left=`${best.x+p.w/2}px`;p.a.label.style.top=`${best.y}px`;placed.push(best);
    }
  }
  function render(now) {
    const dt=lastTime?Math.min((now-lastTime)/1000,.08):0;lastTime=now;clock+=dt;
    updateActors(dt);weather.draw(ctx,Date.now(),reduced.matches);
    const sky=weather.snapshot(),weatherLabel=document.getElementById('weather');
    if(weatherLabel.textContent!==sky.name) {
      weatherLabel.textContent=sky.name;canvas.dataset.weather=sky.kind;updateRoster();
    }
    layout.desks.forEach((d,i)=>monitor(d,actors[i]));
    const drawables=[];
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
    labels.replaceChildren();labels.layoutKey=null;
    for(const a of actors) {
      const el=document.createElement('div');el.className='nameplate';el.style.setProperty('--agent-color',a.color);
      el.title=a.rosterName;
      const name=document.createElement('strong');name.textContent=a.name;
      el.append(name);
      if(a.subtitle){const sub=document.createElement('small');sub.textContent=a.subtitle;el.append(sub);}
      const state=document.createElement('span');el.append(state);a.label=el;labels.append(el);
    }
  }
  function updateRoster() {
    const roster=document.getElementById('roster'),scroll=roster.scrollLeft;roster.replaceChildren();
    roster.classList.toggle('many-tools',tools.length>3);
    for(const [i,t] of tools.entries()) {
      const a=actors.find(a=>a.id===t.id),color=a?.color||residents[i%residents.length].shirt;
      const el=document.createElement('span');el.className='agent-status';
      const dot=document.createElement('i'),name=document.createElement('span'),state=document.createElement('em');
      el.style.setProperty('--agent-color',color);
      name.textContent=t.name||t.id;state.textContent=t.status==='working'?'干活中':'摸鱼中';
      el.append(dot,name,state);roster.append(el);
    }
    roster.scrollLeft=scroll;
    canvas.setAttribute('aria-label',`${weather?.snapshot().name||''}阁楼；`+tools.map(t=>`${t.name||t.id}：${t.status==='working'?'干活中':'摸鱼中'}`).join('；'));
  }
  async function poll() {
    if(polling)return;polling=true;
    try {
      // A cold Windows process snapshot can take several seconds after a restart.
      // Keep one request in flight so short abort/retry cycles cannot pile up scans.
      const response=await fetch('api/status',{cache:'no-store',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      if(!Array.isArray(data.agents)||!Number.isFinite(data.ts))throw new Error('Invalid status response');
      latest=data;polls++;connected=true;
      syncTools(data.agents);
      for(const a of actors) {
        const status=data.agents.find(s=>s.id===a.id)?.status;
        if(status!=='working'&&status!=='idle')continue;
        if(status!==a.requested) {
          a.requested=status;const target=destination(a);
          go(a,target,status==='working'?'type':target.action);
        }
      }
      document.getElementById('ts').textContent=new Date(data.ts*1000).toLocaleTimeString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'});
      document.getElementById('connection').textContent='已同步';document.getElementById('signal').className='signal live';
      notice.hidden=true;updateRoster();
    } catch {
      connected=false;document.getElementById('connection').textContent='正在重连';document.getElementById('signal').className='signal error';
      notice.textContent=latest?'暂时无法同步，保留上次状态 · 正在重连':'无法连接办公室 · 正在重连';notice.hidden=false;
    } finally {polling=false;}
  }
  Object.defineProperty(window,'officeDebug',{value:Object.freeze({
    snapshot:()=>({ready:initialized,connected,polls,clock,zoom:layout?.zoom,width:layout?.w,height:layout?.h,
      sample:layout?.sample,pixelScale:layout?.pixelScale,ox:layout?.ox,oy:layout?.oy,
      background:background?.getAttribute('src'),smoothing:ctx.imageSmoothingEnabled,
      weather:weather?.snapshot(),capacity:CAPACITY,tools:tools.map(t=>({...t})),
      actors:actors.map(a=>({id:a.id,name:a.name,sprite:a.sprite,slot:a.slot,x:a.x,y:a.y,mode:a.mode,frame:a.frame,dir:a.dir,requested:a.requested,
        idleSlot:a.idleSlot,idleChanges:a.idleChanges,route:a.route.map(p=>({...p})),
        target:initialized?destination(a):null,walkable:initialized?walkable(a.x,a.y):false,
        monitorOn:a.mode==='type'&&a.requested==='working'})),
      obstacles:layout?.blocks.map(b=>({...b})),stations:layout?.desks.map(d=>({...d})),
      protected:layout?.protected.map(b=>({...b})),
      spots:layout?.spots.map(p=>({...p,walkable:walkable(p.x,p.y)})),
    }),
  }),writable:false});
  async function start() {
    try {
      const image=new Image();image.src='static/assets/office-atlas.png';
      const room=new Image();room.src='static/assets/attic-bg-2.png';
      const json=url=>fetch(url).then(r=>{if(!r.ok)throw new Error(`Missing ${url}`);return r.json();});
      const [,,data,looks]=await Promise.all([image.decode(),room.decode(),json('static/assets/office-atlas.json'),json('static/assets/residents.json')]);
      atlas=image;background=room;metadata=data;residents=looks;fit();
      await poll();updateRoster();document.getElementById('loading').hidden=true;
      requestAnimationFrame(render);setInterval(poll,3000);new ResizeObserver(fit).observe(wrap);
      document.addEventListener('visibilitychange',()=>{lastTime=0;if(!document.hidden){weather.update();poll();}});
    } catch(error) {document.getElementById('loading').textContent='素材加载失败，请刷新页面';console.error(error);}
  }
  start();
})();
