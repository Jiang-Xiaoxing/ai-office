/* Original pixel office. All positions are persistent world coordinates.
 * To add a tool: register its detector in server_app.py and add a DESKS entry.
 * Assets, API and stylesheet URLs deliberately remain relative for /office/.
 */
(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const wrap = document.getElementById('wrap');
  const notice = document.getElementById('notice');
  const DESKS = [
    { id: 'codex', name: 'Codex', sprite: 'codex', color: '#8bc5ab' },
    { id: 'codebuddy', name: 'CodeBuddy', sprite: 'codebuddy', color: '#8db9d7' },
    { id: 'claude-code', name: 'Claude Code', subtitle: '(DeepSeek)', sprite: 'claude-code', color: '#e2b96e' },
  ];
  const actors = DESKS.map((desk, i) => ({
    ...desk, index: i, x: 0, y: 0, dir: 0, mode: 'tea', requested: null,
    route: [], distance: 0, phase: i * 1.37, idleTime: 6 + i * 2,
    idleCycle: 0, frame: 0,
  }));
  let atlas, metadata, scene, layout, initialized = false, lastTime = 0, clock = 0;
  let latest = null, polls = 0, connected = false;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const rect = (x, y, w, h, color, target = ctx) => {
    target.fillStyle = color; target.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  function sprite(name, x, y, target = ctx) {
    const s = metadata[name];
    if (s) target.drawImage(atlas, ...s, Math.round(x), Math.round(y), s[2], s[3]);
  }
  function texture(name, x, y, w, h, target) {
    const s = metadata[name];
    target.save(); target.beginPath(); target.rect(x, y, w, h); target.clip();
    for (let py = y; py < y + h; py += s[3])
      for (let px = x; px < x + w; px += s[2]) sprite(name, px, py, target);
    target.restore();
  }
  function text(label, x, y, color, target = ctx, size = 8, align = 'center') {
    target.font = `${size}px Consolas, "Microsoft YaHei", monospace`;
    target.fillStyle = color; target.textAlign = align; target.textBaseline = 'top';
    target.fillText(label, Math.round(x), Math.round(y));
  }
  function prop(l, name, x, y, obstacle = true) {
    x = Math.round(x); y = Math.round(y);
    const [,, w, h] = metadata[name];
    l.props.push({ name, x, y, depth: y + h - 4 });
    if (obstacle) l.blocks.push({ x, y: y + 6, w: w - 2, h: h - 10 });
  }
  function roomLayout(w, h) {
    // Portrait is a different floor plan, keeping the entire room visible.
    const portrait = w < 560;
    const l = { w, h, portrait, props: [], blocks: [], desks: [], spots: [], wander: [] };
    if (!portrait) {
      l.split = Math.round(w * .555); l.gap = Math.round(h * .53);
      const left = l.split, right = w - left;
      const top = Math.max(80, Math.round(h * .22));
      const bottom = Math.max(top + 130, h - 126);
      const positions = [[left*.27-52, top], [left*.75-52, top], [left*.51-52, bottom]];
      actors.forEach((a, i) => {
        // Additional tools get another row; the detector registry stays independent.
        const p = positions[i] || [left*.5-52, top + Math.floor(i/2)*110];
        l.desks.push({ id: a.id, x: Math.round(p[0]), y: Math.round(p[1]), seat: { x: Math.round(p[0])+52, y: Math.round(p[1])+73 } });
      });
      l.rug = { x: left + 29, y: 110, w: right - 56, h: Math.max(160, h - 207) };
      const cx = Math.round(left + right*.52), cy = Math.round(110 + l.rug.h*.52);
      l.table = { x: cx - 33, y: cy - 26 };
      prop(l,'sofa',cx-42,82);
      if(right>=315)prop(l,'sofa-left',left+48,cy-40);
      prop(l,'sofa-right',w-58,cy-40);
      prop(l,'bench',cx-30,Math.min(h-118,cy+77));
      prop(l,'table',l.table.x,l.table.y);
      prop(l,'coffee',left+30,h-74);
      prop(l,'cabinet',w-82,h-61);
      prop(l,'smallplant',w-67,h-81);
      prop(l,'plant',left+14,61);
      prop(l,'plant',w-53,58);
      prop(l,'plant',23,h-84);
      prop(l,'cabinet',26,h-60);
      prop(l,'smallplant',39,h-79);
      if(h>380)prop(l,'storage',25,Math.round(h*.47));
      l.spots = [{x:cx-68,y:cy+30},{x:cx+16,y:cy-30},{x:cx+39,y:cy+70}];
      l.wander = [{x:left+36,y:l.gap+15},{x:w-42,y:h-99},{x:cx-57,y:h-98}];
      l.blocks.push({x:left-5,y:15,w:12,h:l.gap-48-15},{x:left-5,y:l.gap+44,w:12,h:h-l.gap-57});
    } else {
      l.split = Math.round(Math.min(h*.50, 375)); l.gap = Math.round(w*.5);
      const top = 82, bottom = Math.max(198,l.split-117);
      const positions = [[w*.27-52,top],[w*.75-52,top],[w*.5-52,bottom]];
      actors.forEach((a,i) => {
        const p = positions[i] || [w*.5-52,top+Math.floor(i/2)*100];
        l.desks.push({id:a.id,x:Math.round(p[0]),y:Math.round(p[1]),seat:{x:Math.round(p[0])+52,y:Math.round(p[1])+73}});
      });
      const loungeTop = l.split+38, loungeBottom = h-82;
      const cx = Math.round(w*.50), cy = Math.round((loungeTop+loungeBottom)*.5);
      l.rug={x:44,y:loungeTop+35,w:w-88,h:Math.max(145,loungeBottom-loungeTop-55)};
      l.table={x:cx-33,y:cy-22};
      prop(l,'sofa',cx-42,loungeTop+8);
      prop(l,'sofa-left',29,cy-34);
      prop(l,'sofa-right',w-61,cy-34);
      prop(l,'bench',cx-32,Math.min(h-123,cy+95));
      prop(l,'table',l.table.x,l.table.y);
      prop(l,'coffee',29,h-72);prop(l,'cabinet',w-82,h-61);prop(l,'smallplant',w-67,h-81);
      prop(l,'plant',24,loungeTop-4);prop(l,'plant',w-54,loungeTop-4);
      prop(l,'plant',25,l.split-66);
      l.spots=[{x:cx-75,y:cy+20},{x:cx+19,y:cy-29},{x:cx+33,y:cy+81}];
      l.wander=[{x:49,y:cy+85},{x:w-43,y:h-101},{x:cx-58,y:h-101}];
      l.blocks.push({x:15,y:l.split,w:l.gap-59,h:15},{x:l.gap+45,y:l.split,w:w-l.gap-60,h:15});
    }
    l.desks.forEach(d => l.blocks.push({x:d.x,y:d.y+6,w:104,h:49}));
    return l;
  }
  function wall(x,y,w,h,c) {
    rect(x,y,w,h,'#10252e',c);rect(x+2,y+2,w-4,h-4,'#2a505b',c);
    rect(x+3,y+2,w-6,2,'#416977',c);rect(x+w-4,y+4,2,h-6,'#1a3c48',c);
  }
  function rug(r,c) {
    rect(r.x+3,r.y+4,r.w,r.h,'#376b65',c);
    rect(r.x,r.y,r.w,r.h,'#294f43',c);rect(r.x+2,r.y+2,r.w-4,r.h-4,'#b0b276',c);
    rect(r.x+4,r.y+4,r.w-8,r.h-8,'#426344',c);rect(r.x+7,r.y+7,r.w-14,r.h-14,'#84975c',c);
    rect(r.x+9,r.y+9,r.w-18,r.h-18,'#304e3b',c);
    for(let x=r.x+15;x<r.x+r.w-10;x+=15) {
      for(const y of [r.y+14,r.y+r.h-18]) {
        rect(x,y,2,2,'#d9cf95',c);rect(x-2,y+2,6,2,'#c6c585',c);rect(x,y+4,2,2,'#d9cf95',c);
      }
    }
    for(let y=r.y+28;y<r.y+r.h-25;y+=19) for(const x of [r.x+15,r.x+r.w-18]) {
      rect(x,y,2,2,'#d9cf95',c);rect(x-2,y+2,6,2,'#c6c585',c);rect(x,y+4,2,2,'#d9cf95',c);
    }
    // Woven flecks stay quiet under the furniture.
    for(let y=r.y+24;y<r.y+r.h-20;y+=12) for(let x=r.x+27;x<r.x+r.w-20;x+=16)
      rect(x+(y%3),y,1,1,'#4e6b43',c);
  }
  function buildScene() {
    const {w,h,portrait,split,gap} = layout;
    scene = document.createElement('canvas'); scene.width=w;scene.height=h;
    const c=scene.getContext('2d');c.imageSmoothingEnabled=false;
    rect(0,0,w,h,'#172d36',c);
    // Room envelope and the two floor materials are cached, not redrawn per frame.
    rect(10,9,w-20,h-18,'#10232a',c);
    texture('wood',18,53,portrait?w-36:split-18,portrait?split-53:h-71,c);
    if(portrait) texture('carpet',18,split+15,w-36,h-split-33,c);
    else texture('carpet',split+7,53,w-split-25,h-71,c);
    if(portrait) texture('tile',18,h-83,w-36,65,c);
    else texture('tile',split+7,h-87,w-split-25,69,c);
    rect(18,51,w-36,5,'#7d6548',c);rect(18,56,w-36,2,'#a99266',c);
    wall(10,10,w-20,44,c);wall(10,10,9,h-20,c);wall(w-19,10,9,h-20,c);
    rect(19,h-20,w-38,4,'#314b49',c);rect(10,h-16,w-20,6,'#10252e',c);
    rect(19,57,4,h-77,'#0000000e',c);
    if(portrait) {
      wall(18,split,gap-62,16,c);wall(gap+44,split,w-gap-62,16,c);
      rect(gap-43,split+3,86,9,'#cba166',c);
      for(let x=gap-42;x<gap+42;x+=8)rect(x,split+3,1,9,'#a5784a',c);
      sprite('shelf',38,15,c);sprite('window',w-113,14,c);sprite('clock',w/2-11,22,c);
    } else {
      wall(split-5,11,12,gap-59,c);wall(split-5,gap+44,12,h-gap-60,c);
      rect(split-3,gap-47,8,91,'#d1a96b',c);
      for(let y=gap-46;y<gap+44;y+=8)rect(split-3,y,8,1,'#a5784a',c);
      sprite('shelf',43,15,c);sprite('shelf',split-120,15,c);sprite('clock',split/2-11,23,c);
      sprite('portrait',split+35,20,c);sprite('landscape',split+(w-split)/2-30,19,c);sprite('portrait',w-62,20,c);
      sprite('hanging',22,17,c);sprite('hanging',split-35,15,c);
    }
    rug(layout.rug,c);
    // Small threshold details give the two rooms a joined, lived-in plan.
    text('工作室',portrait?w*.5:split*.5,63,'#74563e',c,8);
    text('茶水间',portrait?w*.5:split+(w-split)*.5,portrait?split+24:63,'#c0cbaa',c,8);
    // Rooted props behind everything else. Occluding furniture is depth sorted later.
    layout.props.filter(p=>p.name==='plant' && p.y<100).forEach(p=>sprite(p.name,p.x,p.y,c));
  }
  function walkable(x,y) {
    if(x<29||x>layout.w-29||y<70||y>layout.h-30)return false;
    return !layout.blocks.some(b=>x>b.x-7&&x<b.x+b.w+7&&y>b.y-4&&y<b.y+b.h+7);
  }
  function nearestFree(point) {
    const gx=Math.round((point.x-4)/8),gy=Math.round((point.y-4)/8);
    for(let radius=0;radius<16;radius++) for(let dy=-radius;dy<=radius;dy++) for(let dx=-radius;dx<=radius;dx++) {
      if(Math.abs(dx)!==radius&&Math.abs(dy)!==radius)continue;
      const x=(gx+dx)*8+4,y=(gy+dy)*8+4;
      if(walkable(x,y))return {x,y};
    }
    return null;
  }
  function routeBetween(start,target) {
    const s=nearestFree(start),end=nearestFree(target);
    if(!s||!end)return [];
    const key=p=>`${p.x},${p.y}`,queue=[s],seen=new Map([[key(s),null]]);
    let found=false;
    for(let i=0;i<queue.length;i++) {
      const p=queue[i];if(p.x===end.x&&p.y===end.y){found=true;break;}
      const options=[[8,0],[-8,0],[0,8],[0,-8]].sort((a,b)=>
        Math.abs(p.x+a[0]-end.x)+Math.abs(p.y+a[1]-end.y)-Math.abs(p.x+b[0]-end.x)-Math.abs(p.y+b[1]-end.y));
      for(const [dx,dy] of options){
        const n={x:p.x+dx,y:p.y+dy};const k=key(n);
        if(!seen.has(k)&&walkable(n.x,n.y)){seen.set(k,p);queue.push(n);}
      }
    }
    if(!found)return [];
    const path=[];let p=end;
    while(p){path.unshift(p);p=seen.get(key(p));}
    if(walkable(target.x,target.y))path.push({...target});
    // Compress only collinear cells, preserving every corner around furniture.
    return path.filter((p,i)=>i===0||i===path.length-1||
      (p.x-path[i-1].x)*(path[i+1].y-p.y)!==(p.y-path[i-1].y)*(path[i+1].x-p.x));
  }
  function destination(a) {
    return a.requested==='working'?layout.desks[a.index].seat:layout.spots[a.index%layout.spots.length];
  }
  function go(a,target,arrival) {
    a.pending=null;a.route=routeBetween(a,target);a.arrival=arrival;
    if(a.route.length){a.mode='walk';a.idleTime=0;}
    else if(Math.hypot(a.x-target.x,a.y-target.y)<1){a.mode=arrival;a.idleTime=6+a.index*2;}
    else {
      // Never pretend to be seated when a future furniture edit blocks a route.
      a.mode='idle';a.pending={...target};a.retryTime=1;
    }
  }
  function fit() {
    if(!metadata)return;
    const ww=wrap.clientWidth,wh=wrap.clientHeight;
    // Never stretch fractional source pixels. Reflow the furniture instead.
    const zoom=Math.max(1,Math.floor(Math.min(ww/600,wh/340)));
    const w=Math.max(320,Math.floor(ww/zoom)),h=Math.max(340,Math.floor(wh/zoom));
    // ResizeObserver sends an initial notification even without a resize.
    // Ignore it so a fast first status response cannot skip the walk to work.
    if(initialized&&canvas.width===w&&canvas.height===h&&layout.zoom===zoom)return;
    canvas.width=w;canvas.height=h;
    canvas.style.width=`${w*zoom}px`;canvas.style.height=`${h*zoom}px`;
    canvas.style.left=`${Math.floor((ww-w*zoom)/2)}px`;
    canvas.style.top=`${Math.floor((wh-h*zoom)/2)}px`;canvas.style.transform='none';
    ctx.imageSmoothingEnabled=false;layout=roomLayout(w,h);layout.zoom=zoom;buildScene();
    actors.forEach(a=>{
      if(!initialized){const p=nearestFree(layout.spots[a.index%3]);a.x=p.x;a.y=p.y;}
      else {
        // Layout changes remap the room; ordinary API changes never remap actors.
        const p=nearestFree(a.requested==='working'?layout.desks[a.index].seat:layout.spots[a.index%3]);
        a.x=p.x;a.y=p.y;
      }
      a.route=[];
      if(a.requested)go(a,destination(a),a.requested==='working'?'type':'tea');
    });
    initialized=true;
  }
  function updateActors(dt) {
    for(const a of actors){
      if(a.pending){
        a.retryTime-=dt;if(a.retryTime<=0)go(a,a.pending,a.arrival);
      }else if(a.route.length){
        let budget=dt*46;
        while(budget>0&&a.route.length){
          const p=a.route[0],dx=p.x-a.x,dy=p.y-a.y,dist=Math.hypot(dx,dy);
          if(dist<.01){a.route.shift();continue;}
          a.dir=Math.abs(dx)>Math.abs(dy)?(dx<0?1:2):(dy<0?3:0);
          const move=Math.min(budget,dist);a.x+=dx/dist*move;a.y+=dy/dist*move;
          a.distance+=move;budget-=move;
          if(move===dist)a.route.shift();
        }
        if(!a.route.length){a.mode=a.arrival;a.dir=a.mode==='type'?3:0;a.idleTime=6+a.index*2;}
      }else if(a.requested==='idle'){
        // Let colleagues finish arriving for tea before starting another stroll.
        // This also keeps a portrait reflow from immediately scattering the group.
        if(!actors.some(other=>other.requested==='idle'&&other.mode==='walk'&&other.arrival==='tea'))a.idleTime-=dt;
        if(a.idleTime<=0){
          a.idleCycle++;
          if(a.idleCycle%2)go(a,layout.wander[a.index%3],'idle');
          else go(a,layout.spots[a.index%3],'tea');
        }
      }
      a.frame=a.mode==='walk'?Math.floor(a.distance/5)%4:
        Math.floor((clock+a.phase)*(a.mode==='type'?5:a.mode==='tea'?1.6:1.2))%4;
    }
  }
  function monitor(d,a) {
    const on=a.requested==='working';
    if(on){
      rect(d.x+40,d.y+5,26,17,'#294d58');rect(d.x+41,d.y+6,24,2,'#52777b');
      for(let i=0;i<4;i++){
        rect(d.x+42+(i%2)*2,d.y+10+i*3,6+(i*3)%11,1,i%2?'#9abc97':'#d0bf8c');
        rect(d.x+60,d.y+10+i*3,3,1,'#527d82');
      }
      if(Math.floor(clock*2)%2)rect(d.x+56,d.y+19,2,1,'#e8dba7');
      rect(d.x+65,d.y+24,1,1,'#94d1a0');
    }else{
      text('z',d.x+60,d.y+12,'#687e82',ctx,7);rect(d.x+65,d.y+24,1,1,'#9d9670');
    }
  }
  function nameplate(a) {
    const working=a.requested==='working';
    const x=Math.round(a.x),y=Math.round(a.y)+5;
    ctx.font='8px Consolas, monospace';
    const width=Math.ceil(Math.max(ctx.measureText(a.name).width,a.subtitle?ctx.measureText(a.subtitle).width:0))+15;
    const height=a.subtitle?25:15;
    rect(x-width/2+1,y+2,width,height,'#102a3090');
    rect(x-width/2,y,width,height,'#eee3bf');rect(x-width/2,y,width,1,'#fff2d1');
    rect(x-width/2,y+height-1,width,1,'#907f58');
    rect(x-width/2+4,y+5,3,3,working?'#4b8668':'#b08a4e');
    text(a.name,x+2,y+3,'#293d3b');
    if(a.subtitle)text(a.subtitle,x+2,y+13,'#6f6952',ctx,7);
  }
  function render(now) {
    const dt=lastTime?Math.min((now-lastTime)/1000,.08):0;lastTime=now;clock+=dt;
    updateActors(dt);ctx.drawImage(scene,0,0);
    const drawables=layout.props.filter(p=>!(p.name==='plant'&&p.y<100)).map(p=>({depth:p.depth,draw:()=>sprite(p.name,p.x,p.y)}));
    layout.desks.forEach((d,i)=>{
      drawables.push({depth:d.y+58,draw:()=>{
        sprite('desk',d.x,d.y);monitor(d,actors[i]);
        const label=actors[i].name;
        ctx.font='7px Consolas, monospace';const width=ctx.measureText(label).width+8;
        rect(d.x+52-width/2,d.y+47,width,9,'#ebd7a6');
        text(label,d.x+52,d.y+48,'#544d39',ctx,7);
      }});
      sprite('chair',d.seat.x-14,d.seat.y-17);
    });
    actors.forEach(a=>drawables.push({depth:a.y,draw:()=>{
      const f=reduced.matches&&a.mode!=='walk'?0:a.frame;
      const direction=a.mode==='walk'?a.dir:0;
      sprite(`${a.sprite}-${a.mode}-${direction}-${f}`,a.x-13,a.y-34);
    }}));
    drawables.sort((a,b)=>a.depth-b.depth).forEach(d=>d.draw());
    actors.forEach(nameplate);
    requestAnimationFrame(render);
  }
  function updateRoster() {
    const roster=document.getElementById('roster');roster.replaceChildren();
    for(const a of actors){
      const item=document.createElement('span');item.className='agent-status';item.style.setProperty('--agent-color',a.color);
      const dot=document.createElement('i');const name=document.createElement('span');name.textContent=a.name;
      const state=document.createElement('em');state.textContent=a.requested===null?'连接中':a.requested==='working'?'干活中':'摸鱼中';
      item.append(dot,name,state);roster.append(item);
    }
    canvas.setAttribute('aria-label',actors.map(a=>`${a.name}${a.subtitle||''}：${a.requested==='working'?'干活中':'摸鱼中'}`).join('；'));
  }
  async function poll() {
    try{
      const response=await fetch('api/status',{cache:'no-store',signal:AbortSignal.timeout(2500)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      if(!Array.isArray(data.agents)||!Number.isFinite(data.ts))throw new Error('Invalid status response');
      latest=data;polls++;connected=true;
      for(const a of actors){
        const status=data.agents.find(s=>s.id===a.id)?.status;
        if(status!=='working'&&status!=='idle')continue;
        if(status!==a.requested){a.requested=status;go(a,destination(a),status==='working'?'type':'tea');}
      }
      document.getElementById('ts').textContent=new Date(data.ts*1000).toLocaleTimeString('zh-CN',{hour12:false});
      document.getElementById('connection').textContent='已同步';document.getElementById('signal').className='signal live';
      notice.hidden=true;updateRoster();
    }catch{
      connected=false;document.getElementById('connection').textContent='连接中断';
      document.getElementById('signal').className='signal error';
      notice.textContent=latest?'暂时无法同步，保留上次状态 · 正在重连':'无法连接办公室 · 正在重连';notice.hidden=false;
    }
  }
  // Read-only diagnostics for browser QA. No production mock/status override.
  Object.defineProperty(window,'officeDebug',{value:Object.freeze({
    snapshot:()=>({ready:initialized,connected,polls,clock,zoom:layout?.zoom,width:layout?.w,height:layout?.h,
      portrait:layout?.portrait,smoothing:ctx.imageSmoothingEnabled,
      actors:actors.map(a=>({id:a.id,x:a.x,y:a.y,mode:a.mode,frame:a.frame,dir:a.dir,requested:a.requested,
        route:a.route.map(p=>({...p})),target:initialized?destination(a):null,walkable:initialized?walkable(a.x,a.y):false})),
      obstacles:layout?.blocks.map(b=>({...b})),stations:layout?.desks.map(d=>({...d})),
    }),
  }),writable:false});
  async function start(){
    try{
      const image=new Image();image.src='static/assets/office-atlas.png';
      const [,data]=await Promise.all([image.decode(),fetch('static/assets/office-atlas.json').then(r=>{if(!r.ok)throw new Error('Atlas missing');return r.json();})]);
      atlas=image;metadata=data;fit();updateRoster();
      document.getElementById('loading').hidden=true;requestAnimationFrame(render);
      poll();setInterval(poll,3000);
      new ResizeObserver(fit).observe(wrap);
      document.addEventListener('visibilitychange',()=>{lastTime=0;if(!document.hidden)poll();});
    }catch(error){document.getElementById('loading').textContent='素材加载失败，请刷新页面';console.error(error);}
  }
  start();
})();
