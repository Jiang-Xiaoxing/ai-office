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
    // All furniture is already baked into the approved image: never draw it twice.
    return {
      ...ROOM,
      desks: [
        { id: 'codex', seat: { x: 96, y: 118 }, screen: { x: 84, y: 66, w: 23, h: 13 } },
        { id: 'codebuddy', seat: { x: 384, y: 118 }, screen: { x: 372, y: 66, w: 23, h: 13 } },
        { id: 'claude-code', seat: { x: 406, y: 237 }, screen: { x: 394, y: 184, w: 23, h: 13 } },
      ],
      blocks: [
        { x: 58, y: 77, w: 77, h: 27 },
        { x: 345, y: 77, w: 77, h: 27 },
        { x: 368, y: 193, w: 76, h: 28 },
        { x: 430, y: 83, w: 36, h: 54 },
        { x: 30, y: 174, w: 80, h: 17 },
        { x: 55, y: 211, w: 32, h: 20 },
        { x: 13, y: 158, w: 16, h: 47 },
        { x: 197, y: 230, w: 17, h: 15 },
        { x: 217, y: 219, w: 49, h: 35 },
        { x: 274, y: 230, w: 20, h: 15 },
        { x: 446, y: 207, w: 20, h: 22 },
      ],
      spots: [
        { x: 62, y: 208, action: 'sleep' }, { x: 94, y: 208, action: 'sleep' },
        { x: 92, y: 242, action: 'tea' }, { x: 174, y: 225, action: 'tea' },
        { x: 132, y: 215, action: 'read' }, { x: 184, y: 184, action: 'read' },
      ],
    };
  }
  function buildScene() {
    scene = document.createElement('canvas');scene.width=ROOM.w;scene.height=ROOM.h;
    const c=scene.getContext('2d');c.imageSmoothingEnabled=false;
    // The supplied PNG is an exact 4x nearest-neighbor enlargement of this grid.
    c.drawImage(background,0,0,ROOM.w,ROOM.h);
    weather=AtticWeather.create(scene);
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
    const choices=layout.spots.map((p,i)=>({p,i})).filter(({p,i})=>!taken.has(i)&&p.action!==layout.spots[a.idleSlot].action&&walkable(p.x,p.y));
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
    const placed=[];
    for(const p of plates.sort((a,b)=>a.y-b.y||a.a.index-b.a.index)) {
      const clampX=x=>Math.max(6,Math.min(ww-p.w-6,x));
      const x=clampX(p.cx-p.w/2);
      const desired=Math.min(bottom-p.h,p.y);
      const obstacles=[...bodies,...placed];
      const ys=[desired,...bodies.flatMap(q=>[q.y+q.h+6,q.y-p.h-6]),
        ...placed.flatMap(q=>[q.y+q.h+6,q.y-p.h-6])];
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
    canvas.setAttribute('aria-label',`${weather?.snapshot().name||''}阁楼；`+actors.map(a=>`${a.name}${a.subtitle||''}：${a.requested==='working'?'干活中':'摸鱼中'}`).join('；'));
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
      weather:weather?.snapshot(),
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
      const room=new Image();room.src='static/assets/attic-bg-2.png';
      const [,,data]=await Promise.all([image.decode(),room.decode(),fetch('static/assets/office-atlas.json').then(r=>{if(!r.ok)throw new Error('Atlas missing');return r.json();})]);
      atlas=image;background=room;metadata=data;createLabels();fit();updateRoster();document.getElementById('loading').hidden=true;
      requestAnimationFrame(render);poll();setInterval(poll,3000);new ResizeObserver(fit).observe(wrap);
      document.addEventListener('visibilitychange',()=>{lastTime=0;if(!document.hidden){weather.update();poll();}});
    } catch(error) {document.getElementById('loading').textContent='素材加载失败，请刷新页面';console.error(error);}
  }
  start();
})();
