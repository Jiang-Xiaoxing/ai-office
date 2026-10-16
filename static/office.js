/* Approved sunny attic. Coordinates use the background's native 480x270 pixel grid.
 * Register future detectors in config/tools.json. Resident art lives in assets/sprites/manifest.json.
 * Every resource and API URL is relative so an /office/ reverse proxy also works.
 * Residents carry a tiny pixel status icon beside the head; the full parchment
 * nameplate only pops up while a resident is hovered, pinned or focused.
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
  const CAPACITY = 6, IDLE_SLOTS = [0, 1, 2, 3, 4, 5];
  const COLORS = ['#a5cbb7', '#a6c4e1', '#efd296', '#b39ac4', '#c5838b', '#9cb47a'];
  const ACTIVITIES = { sleep: '打盹', read: '看书', tea: '喝茶', type: '敲键盘', walk: '走动' };
  // Optional runtime hint (e.g. "Flash") from the backend is appended to the display name.
  const displayName = t => [t.name || t.id, t.detail].filter(Boolean).join(' · ');
  // Tiny head-level status art, drawn on the room grid so it stays crisp and
  // follows its resident exactly. Rows are source pixels; '.' is transparent.
  // Ink outlines keep them readable in daylight, the warm lantern gold keeps
  // them readable once the room dims for the night.
  const ICONS = {
    keyboard: { palette: { 1: '#3b3230', 2: '#ffd98a' }, rows: [
      '1111111111', '1221221221', '.11111111.'] },
    cup: { palette: { 1: '#3b3230', 2: '#ffd98a', 4: '#f0e3ce' }, rows: [
      '..4..4..', '...4..4.', '1111111.', '1222221.', '12222211', '.12222.1', '..1111..'] },
    book: { palette: { 1: '#3b3230', 2: '#ffd98a' }, rows: [
      '111111111', '1222.2221', '1222.2221', '1222.2221', '111111111'] },
    zzz: { palette: { 1: '#ffd98a' }, rows: [
      '11111.111.', '...11..1..', '..11..111.', '.11.......', '11111.....'] },
    steps: { palette: { 1: '#ffd98a' }, rows: [
      '.11.....', '11......', '.....11.', '....11..'] },
    dots: { palette: { 1: '#ffd98a' }, rows: [
      '11.11.11', '11.11.11'] },
  };
  const STATE_ICONS = { type: 'keyboard', tea: 'cup', read: 'book', sleep: 'zzz', walk: 'steps' };
  // A catch-all detector for a service that could not be recognised ("Claude
  // Code" without a known provider) has no permanent seat: it only appears in
  // the room, and only then occupies a workstation, while it is really busy.
  const FALLBACK_TOOL = /认不出|未识别|无法识别|未知|unknown|other/i;
  const actors = [];
  let activeWalker=null;
  let tools = [], residents = [], overflowNotice = '';
  let hovered = null, pinned = null, hoverSuppressed = null, keyboardNav = false;
  // The resident id behind any interaction target, so hover, pins and keyboard
  // focus all speak the same language.
  const residentId = node => {
    const id = node?.closest?.('[data-target]')?.dataset.target;
    return id?.startsWith('resident:') ? id.slice(9) : null;
  };
  const ROOM = { w: 480, h: 270 };
  let background, nightBackground, metadata, roomSpec, weather, interaction, layout, initialized=false,lastTime=0,clock=0;
  const sheets=new Map(),lifecycle=new AbortController();
  let animation=0,pollTimer=0,resizeObserver,requestController,disposed=false,weatherBuilds=0;
  const listen=(target,type,handler)=>target.addEventListener(type,handler,{signal:lifecycle.signal});
  let latest = null, polls = 0, connected = false, polling = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const rect = (x, y, w, h, color, c = ctx) => {
    c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const animationName=a=>a.mode==='walk'?['walk_down','walk_left','walk_right','walk_up'][a.dir]:
    ({type:'typing_back',tea:'tea',read:'reading',sleep:'napping'}[a.mode]||'walk_down');
  function frameIndex(a) {
    const frames=metadata.animations[animationName(a)].frames;
    return frames[(reduced.matches&&a.mode!=='walk'?0:a.frame)%frames.length];
  }
  function bodyBox(a,x=a.x,y=a.y) {
    const look=residents[a.slot];
    const {left,top,right,bottom}=a.mode==='walk'?look.walkBounds:look.actionBounds[animationName(a)];
    return {x:Math.round(x)-32+left,y:Math.round(y)-59+top,
      w:right-left,h:bottom-top};
  }
  function headTop(a) {return bodyBox(a).y;}
  function iconName(a) {return a.requested===null?'dots':STATE_ICONS[a.mode]||'dots';}
  function iconBox(a) {
    const name=iconName(a),rows=ICONS[name].rows,w=Math.max(...rows.map(row=>row.length)),body=bodyBox(a);
    const x=body.x+body.w+2+w<=ROOM.w-3?body.x+body.w+2:body.x-2-w;
    return {name,x,y:headTop(a)+2,w,h:rows.length};
  }
  function drawIcon(name,x,y,c=ctx) {
    const art=ICONS[name];if(!art)return;
    art.rows.forEach((row,j)=>{for(let i=0;i<row.length;i++) {
      const color=art.palette[row[i]];if(color)rect(x+i,y+j,1,1,color,c);
    }});
  }
  function roomLayout() {
    const point=p=>({x:p.x/4,y:p.y/4});
    const box=r=>({x:r.x/4,y:r.y/4,w:r.width/4,h:r.height/4});
    const slots=roomSpec.workstations.map((d,slot)=>({slot,stationId:d.id,
      seat:point(d.sprite.groundAnchor),approach:point(d.approachPoint),topLeft:point(d.sprite.topLeft),
      screen:{x:d.deskRect.x/4+12,y:d.deskRect.y/4-9,w:20,h:9},clickRect:box(d.clickRect)}));
    return {...ROOM,desks:actors.map(a=>({...slots[a.slot],id:a.id})),
      protected:roomSpec.navigation.obstacleRects.map(o=>box(o.rect)),
      blocks:roomSpec.navigation.obstacleRects.map(o=>({...box(o.rect),station:o.disabledWhenOccupying})),
      walkable:roomSpec.navigation.walkableRects.map(box),
      spots:[{x:56,y:182,action:'sleep'},{x:188,y:184,action:'tea'},
        {x:244,y:184,action:'read'},{x:356,y:184,action:'sleep'},
        {x:300,y:184,action:'read'},{x:412,y:184,action:'tea'}]};
  }
  // The left chair and bookcase form a narrow bay. Its resident rests on its
  // own side of that passage; others must not enter and get trapped behind a
  // working neighbour. Actions still change in place when all nooks are taken.
  const leisureSpots=a=>layout.spots.map((p,i)=>({p,i})).filter(({i})=>a.slot===0?i===0:i!==0);
  function isFallbackTool(t) {return FALLBACK_TOOL.test(`${t.id} ${t.name||''}`);}
  function roomTools() {
    // Idle catch-alls stay in the footer only, so they never hold a person slot.
    return tools.filter(t=>t.status==='working'||!isFallbackTool(t)).slice(0,CAPACITY);
  }
  function syncTools(incoming) {
    tools=incoming.map(t=>({...t}));
    const visible=roomTools(),used=new Set();
    // Reserve resident identities before assigning new tools, even if config is reordered.
    const slots=new Map(visible.filter(t=>Object.hasOwn(HOMES,t.id)).map(t=>[t.id,HOMES[t.id]]));
    slots.forEach(slot=>used.add(slot));
    for(const t of visible)if(!slots.has(t.id)) {
      const slot=Array.from({length:CAPACITY},(_,i)=>i).find(i=>!used.has(i));
      slots.set(t.id,slot);used.add(slot);
    }
    const signature=visible.map(t=>JSON.stringify([t.id,displayName(t),slots.get(t.id)])).join('|');
    if(signature!==actors.signature) {
      const previous=new Map(actors.map(a=>[a.id,a]));
      actors.splice(0,actors.length,...visible.map((t,index)=>{
        const slot=slots.get(t.id),look=residents[slot],old=previous.get(t.id);
        const parts=(t.name||t.id).match(/^(.*?)\s*[（(]([^()（）]+)[）)]$/);
        const subtitle=[parts?.[2],t.detail].filter(Boolean).join(' · ')||undefined;
        const identity={id:t.id,name:parts?parts[1]:(t.name||t.id),subtitle,
          rosterName:displayName(t),characterName:look.name,index,slot,sprite:look.id,color:COLORS[slot]};
        if(old?.slot===slot)return Object.assign(old,identity);
        return {...identity,x:0,y:0,mode:'idle',dir:0,requested:null,route:[],distance:0,frame:0,
          phase:slot*1.3,idleSlot:IDLE_SLOTS[slot],idleTime:14+slot*2,idleChanges:0};
      }));
      actors.signature=signature;layout={...layout,...roomLayout()};
      for(const a of actors)if(a.requested===null) {
        const available=leisureSpots(a).filter(({p})=>!personCollision(p.x,p.y,a));
        const spawn=available.find(({i})=>i===a.idleSlot)||available[0]||
          {p:nearestFree(layout.desks[a.index].seat,a,true),i:a.idleSlot};
        if(!spawn.p)throw new Error('No free resident position');
        a.idleSlot=spawn.i;a.x=spawn.p.x;a.y=spawn.p.y;
      }
      createLabels();
    }
    const excess=tools.filter(t=>!visible.includes(t)).map(t=>t.id).join(',');
    if(excess&&excess!==overflowNotice)console.warn(`暖灯小阁最多显示 ${CAPACITY} 人；其余工具仅在底栏显示：${excess}`);
    overflowNotice=excess;
  }
  function walkable(x,y,actor) {
    x=Math.round(x*1e6)/1e6;y=Math.round(y*1e6)/1e6;
    if(!layout.walkable.some(r=>x>=r.x+7&&x<=r.x+r.w-7&&y>=r.y+3&&y<=r.y+r.h-3))return false;
    return !layout.blocks.some(b=>!(actor&&b.station===layout.desks[actor.index]?.stationId)&&
      x>b.x-7&&x<b.x+b.w+7&&y>b.y-3&&y<b.y+b.h+3);
  }
  function personCollision(x,y,a) {
    const look=residents[a.slot],b=look.walkBounds;
    const ax=Math.round(x)-32,ay=Math.round(y)-59;
    const p={x:ax+b.left,y:ay+b.top,w:b.right-b.left,h:b.bottom-b.top};
    return actors.some(other=>{
      if(other===a)return false;
      const q=bodyBox(other);if(!overlaps(p,q,1))return false;
      const bx=Math.round(other.x)-32,by=Math.round(other.y)-59,otherLook=residents[other.slot];
      const mask=other.mode==='walk'?otherLook.walkMask:otherLook.actionMasks[animationName(other)];
      // Transparent corners of the supplied 64px frames are free space. A
      // union across animation frames keeps clearance stable as limbs move.
      for(let py=Math.max(p.y,q.y-1);py<Math.min(p.y+p.h,q.y+q.h+1);py++)
        for(let px=Math.max(p.x,q.x-1);px<Math.min(p.x+p.w,q.x+q.w+1);px++) {
          if(!look.walkMask[(py-ay)*64+px-ax])continue;
          for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
            const mx=px+dx-bx,my=py+dy-by;
            if(mx>=0&&mx<64&&my>=0&&my<64&&mask[my*64+mx])return true;
          }
        }
      return false;
    });
  }
  function nearestFree(point,actor,avoidPeople=false) {
    const gx=Math.round(point.x/4),gy=Math.round(point.y/4);
    for(let r=0;r<22;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++) {
      if(Math.abs(dx)!==r&&Math.abs(dy)!==r)continue;
      const x=(gx+dx)*4,y=(gy+dy)*4;
      if(walkable(x,y,actor)&&(!avoidPeople||!personCollision(x,y,actor)))return {x,y};
    }
    return null;
  }
  function routeBetween(start,target,actor) {
    const s=nearestFree(start,actor,true),end=nearestFree(target,actor);
    if(!s||!end||!walkable(target.x,target.y,actor))return [];
    const key=p=>`${p.x},${p.y}`,queue=[s],seen=new Map([[key(s),null]]);
    let found=false;
    for(let i=0;i<queue.length;i++) {
      const p=queue[i];if(p.x===end.x&&p.y===end.y){found=true;break;}
      const options=[[4,0],[-4,0],[0,4],[0,-4]].sort((a,b)=>
        Math.abs(p.x+a[0]-end.x)+Math.abs(p.y+a[1]-end.y)-Math.abs(p.x+b[0]-end.x)-Math.abs(p.y+b[1]-end.y));
      for(const [dx,dy] of options) {
        const n={x:p.x+dx,y:p.y+dy},k=key(n);
        if(!seen.has(k)&&walkable(n.x,n.y,actor)&&!personCollision(n.x,n.y,actor)){seen.set(k,p);queue.push(n);}
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
    a.pending=null;a.route=routeBetween(a,target,a);a.arrival=arrival;a.waitTime=0;
    // A rest point must not fence another resident into a bay. If its route
    // is occupied, reserve a reachable free nook rather than waiting forever.
    if(!a.route.length&&a.requested==='idle'&&Math.hypot(a.x-target.x,a.y-target.y)>.1) {
      const reserved=new Set(actors.filter(b=>b!==a&&b.requested==='idle').map(b=>b.idleSlot));
      const choices=leisureSpots(a).filter(({i})=>!reserved.has(i))
        .sort((b,c)=>Math.hypot(a.x-b.p.x,a.y-b.p.y)-Math.hypot(a.x-c.p.x,a.y-c.p.y));
      for(const {p,i} of choices) {
        const route=routeBetween(a,p,a);
        if(route.length){a.idleSlot=i;a.route=route;a.arrival=p.action;target=p;break;}
      }
    }
    if(a.route.length)a.mode='walk';
    else if(Math.hypot(a.x-target.x,a.y-target.y)<.1)a.mode=arrival;
    else{a.mode='idle';a.pending={...target};a.retryTime=1;}
  }
  function chooseLeisure(a) {
    const taken=new Set(actors.filter(other=>other!==a&&other.requested==='idle').map(other=>other.idleSlot));
    const choices=leisureSpots(a).filter(({p,i})=>!taken.has(i)&&p.action!==layout.spots[a.idleSlot].action&&walkable(p.x,p.y)&&
      !actors.some(other=>other!==a&&other.requested==='idle'&&
        Math.abs(p.x-layout.spots[other.idleSlot].x)<28&&Math.abs(p.y-layout.spots[other.idleSlot].y)<38));
    if(!choices.length){a.mode=['sleep','tea','read'].find(mode=>mode!==a.mode);a.idleChanges++;a.idleTime=12+Math.random()*10;return;}
    a.idleSlot=choices[Math.floor(Math.random()*choices.length)].i;a.idleChanges++;
    go(a,destination(a),destination(a).action);
  }
  function fit() {
    if(!metadata)return;
    const ww=wrap.clientWidth,wh=wrap.clientHeight;
    // Fill the width between the separately laid-out bars. Crop only the
    // decorative roof/floor edges (at most 20 native pixels per edge), never
    // stretch the room or crop its side workstations on very short windows.
    const sample=1,w=ROOM.w,h=ROOM.h;
    const zoom=Math.min(ww/w,wh/(h-40)),pixelScale=zoom;
    if(initialized&&canvas.width===w&&canvas.height===h&&layout.zoom===zoom&&
      layout.viewportWidth===ww&&layout.viewportHeight===wh)return;
    canvas.width=w;canvas.height=h;canvas.style.width=`${w*zoom}px`;canvas.style.height=`${h*zoom}px`;
    const ox=(ww-w*zoom)/2,oy=(wh-h*zoom)/2;
    canvas.style.left=`${ox}px`;canvas.style.top=`${oy}px`;
    ctx.imageSmoothingEnabled=false;ctx.setTransform(1/sample,0,0,1/sample,0,0);
    if(!initialized)layout=roomLayout();
    Object.assign(layout,{zoom,sample,pixelScale,ox,oy,viewportWidth:ww,viewportHeight:wh});
    document.body.dataset.density=pixelScale>=3?'normal':pixelScale>=1.5?'compact':'tiny';
    // Resizing only changes projection; do not teleport residents or interrupt a walk.
    if(!initialized)actors.forEach(a=>{
      const target=destination(a),p=target;
      a.x=p.x;a.y=p.y;a.route=[];
    });
    initialized=true;
  }
  function updateActors(dt) {
    // A single moving reservation prevents head-on deadlocks in the narrow
    // bays. Other residents keep their seats until the passage is clear.
    const priority=a=>a.requested==='idle'?[2,3,1,4,0,5].indexOf(a.slot):10+a.x;
    const mover=actors.filter(a=>a.route.length).sort((a,b)=>priority(a)-priority(b))[0];
    for(const a of actors) {
      if(a.pending){a.retryTime-=dt;if(a.retryTime<=0)go(a,a.pending,a.arrival);}
      else if(a.route.length) {
        if(a!==mover)continue;
        if(activeWalker!==a.id){activeWalker=a.id;go(a,destination(a),a.arrival);if(!a.route.length)continue;}
        let budget=dt*48;
        while(budget>0&&a.route.length) {
          const p=a.route[0],dx=p.x-a.x,dy=p.y-a.y,dist=Math.hypot(dx,dy);
          if(dist<.01){a.x=p.x;a.y=p.y;a.route.shift();continue;}
          a.dir=Math.abs(dx)>Math.abs(dy)?(dx<0?1:2):(dy<0?3:0);
          const move=Math.min(budget,dist);const nx=a.x+dx/dist*move,ny=a.y+dy/dist*move;
          if(personCollision(nx,ny,a)) {
            a.waitTime=(a.waitTime||0)+dt;
            if(a.waitTime>.6){go(a,destination(a),a.arrival);}
            break;
          }
          a.waitTime=0;a.x=nx;a.y=ny;
          a.distance+=move;budget-=move;if(move===dist){a.x=p.x;a.y=p.y;a.route.shift();}
        }
        if(!a.route.length){activeWalker=null;a.mode=a.arrival;a.dir=a.mode==='type'?3:0;a.idleTime=12+Math.random()*10;}
      } else if(a.requested==='idle') {
        a.idleTime-=dt;if(a.idleTime<=0)chooseLeisure(a);
      }
      a.frame=a.mode==='walk'?Math.floor(a.distance/4)%4:Math.floor((clock+a.phase)*metadata.animations[animationName(a)].fps)%metadata.animations[animationName(a)].frames.length;
    }
  }
  function spriteBox(a) {
    const s=layout.pixelScale,b=bodyBox(a);
    return {x:layout.ox+b.x*s,y:layout.oy+b.y*s,w:b.w*s,h:b.h*s};
  }
  const overlaps=(p,q,gap=0)=>p.x<q.x+q.w+gap&&p.x+p.w+gap>q.x&&p.y<q.y+q.h+gap&&p.y+p.h+gap>q.y;
  function updateLabels() {
    // Keyboard focus keeps its gold-rimmed plate as focus indicator; a mouse
    // click must not, or "click again to collapse" would never collapse.
    const focused=keyboardNav?residentId(document.activeElement):null;
    for(const a of actors) {
      const el=a.label;
      const state=a.requested===null?'连接中':ACTIVITIES[a.mode]||'歇一会';
      if(el.lastElementChild.textContent!==state)el.lastElementChild.textContent=state;
      el.classList.toggle('working',a.requested==='working');
      el.classList.toggle('pinned',pinned===a.id);
      // No permanent billboards: a plate exists only while it is being asked for.
      el.hidden=pinned!==a.id&&hovered!==a.id&&focused!==a.id;
    }
    const shown=actors.filter(a=>!a.label.hidden);
    if(!shown.length)return;
    const scale=layout.pixelScale,room=wrap.getBoundingClientRect();
    const gap=Math.max(8,Math.round(scale)*2);
    // Plates stay in the visible room, including when its edges are cropped.
    const bounds={
      left:Math.round(layout.ox+(scale<1?0:18*scale)),right:Math.round(layout.ox+(scale<1?480:466)*scale),
      top:Math.round(Math.max(layout.oy+(scale<1?0:10*scale),document.getElementById('bar').getBoundingClientRect().bottom-room.top+gap)),
      bottom:Math.round(Math.min(layout.oy+248*scale,document.getElementById('footer').getBoundingClientRect().top-room.top-gap)),
    };
    const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
    const crowds=actors.filter(a=>a.label.hidden).map(spriteBox),taken=[];
    for(const a of shown) {
      const el=a.label;el.style.maxWidth=`${Math.max(0,bounds.right-bounds.left)}px`;el.style.width='';
      const w=Math.min(el.offsetWidth,bounds.right-bounds.left),h=el.offsetHeight;
      // Anchor to the resident's live coordinates, so a plate never waits at the
      // workstation a walker just left.
      const cx=layout.ox+Math.round(a.x)*scale;
      const desired={x:Math.round(cx-w/2),y:Math.floor(layout.oy+headTop(a)*scale-gap-h)};
      // Stay over the resident's own head: lift the plate before stepping aside.
      const spots=[{x:desired.x,y:desired.y}];
      for(let step=1;step<=5;step++)spots.push({x:desired.x,y:desired.y-step*(h+gap)});
      for(let step=1;step<=3;step++)spots.push({x:desired.x-step*(w+gap),y:desired.y},{x:desired.x+step*(w+gap),y:desired.y});
      const fit=obstacles=>{
        for(const spot of spots) {
          const r={x:clamp(spot.x,bounds.left,bounds.right-w),y:clamp(spot.y,bounds.top,bounds.bottom-h),w,h};
          if(!obstacles.some(q=>overlaps(r,q,gap)))return r;
        }
        return null;
      };
      // Above the head first, then dodging the other residents, then merely
      // dodging the other plates; staying inside the room is not negotiable.
      const r=fit([...taken,...crowds])||fit(taken)||
        {x:clamp(desired.x,bounds.left,bounds.right-w),y:clamp(desired.y,bounds.top,bounds.bottom-h),w,h};
      taken.push(r);
      el.style.left=`${r.x}px`;el.style.top=`${r.y}px`;
      el.style.setProperty('--pointer-x',`${Math.max(8,Math.min(w-8,cx-r.x))}px`);
    }
  }
  function followResidents() {
    const layer=document.getElementById('interaction-targets');
    const residentOf=residentId;
    // Tab/Enter/Space count as keyboard travel, the mouse does not: that is
    // what decides whether a focused resident keeps its plate on screen.
    listen(document,'keydown',event=>{
      if(['Tab','Enter',' '].includes(event.key)){keyboardNav=true;updateLabels();}
    });
    listen(document,'pointerdown',()=>{
      if(keyboardNav){keyboardNav=false;updateLabels();}
    });
    listen(document,'focusin',()=>updateLabels());
    listen(document,'focusout',()=>updateLabels());
    // Hover reveals a plate; a click pins one; clicking again, clicking empty
    // room space or pressing Escape puts it away.
    // Hover and pins repaint the plates right away; waiting for the next frame
    // would let a click look ignored for a moment.
    listen(layer,'pointerover',event=>{
      const id=residentOf(event.target);
      if(id&&id!==hoverSuppressed){hovered=id;updateLabels();}
    });
    listen(layer,'pointerout',event=>{
      const id=residentOf(event.target);if(!id)return;
      let repaint=false;
      if(hovered===id){hovered=null;repaint=true;}
      // A clicked-shut plate stays shut while the pointer still rests on that
      // resident: the browser re-dispatches hover whenever a moving target
      // changes under a stationary cursor, so ask where the pointer really is.
      if(hoverSuppressed===id&&residentOf(document.elementFromPoint(event.clientX,event.clientY))!==id)
        hoverSuppressed=null;
      if(repaint)updateLabels();
    });
    listen(layer,'click',event=>{
      const id=residentOf(event.target);if(!id)return;
      if(pinned===id){pinned=null;hoverSuppressed=id;hovered=null;}
      else {pinned=id;hoverSuppressed=null;}
      updateLabels();
    });
    // Clicking any empty spot puts a pinned plate away; the greeting message's
    // own close button only closes the message.
    listen(document,'click',event=>{
      if(!residentOf(event.target)&&!event.target.closest?.('#interaction-note')){pinned=null;updateLabels();}
    });
    listen(document,'keydown',event=>{
      if(event.key==='Escape'){pinned=null;hovered=null;hoverSuppressed=null;updateLabels();}
    });
  }
  function render(now) {
    animation=0;if(disposed||document.hidden)return;
    const dt=lastTime?Math.min((now-lastTime)/1000,.08):0;lastTime=now;clock+=dt;
    updateActors(dt);weather.draw(ctx,Date.now(),reduced.matches);
    const sky=weather.snapshot(),weatherLabel=document.getElementById('weather');
    if(weatherLabel.textContent!==sky.name) {
      weatherLabel.textContent=sky.name;canvas.dataset.weather=sky.kind;
      document.body.dataset.time=sky.kind==='night'?'night':'day';
      document.documentElement.style.setProperty('--wall',sky.kind==='night'?roomSpec.nightPageBackground:roomSpec.pageBackground);updateRoster();
    }
    const drawables=[];
    actors.forEach(a=>drawables.push({depth:a.y,draw:()=>{
      const f=frameIndex(a);
      ctx.drawImage(sheets.get(a.sprite),(f%4)*64,Math.floor(f/4)*64,64,64,Math.round(a.x)-32,Math.round(a.y)-59,64,64);
      // The status icon rides along with its resident, even mid-stride, and
      // drifts upward while dozing so the nap still reads as a nap.
      const icon=iconBox(a);
      drawIcon(icon.name,icon.x,icon.y-(icon.name==='zzz'?Math.floor(clock)%3*2:0));
    }}));
    drawables.sort((a,b)=>a.depth-b.depth).forEach(d=>d.draw());
    interaction.update(now);interaction.draw(ctx,now,reduced.matches);
    updateLabels();animation=requestAnimationFrame(render);
  }
  function createLabels() {
    labels.replaceChildren();
    if(!actors.some(a=>a.id===pinned))pinned=null;
    if(!actors.some(a=>a.id===hovered))hovered=null;
    for(const a of actors) {
      const el=document.createElement('div');el.className='nameplate';el.style.setProperty('--agent-color',a.color);
      el.title=a.rosterName;el.dataset.actor=a.id;el.hidden=true;
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
      const a=actors.find(a=>a.id===t.id),color=a?.color||COLORS[i%COLORS.length];
      const el=document.createElement('span');el.className='agent-status';
      const dot=document.createElement('i'),name=document.createElement('span'),state=document.createElement('em');
      el.style.setProperty('--agent-color',color);el.style.setProperty('--status-color',t.status==='working'?'#b9d59c':'#edc57e');
      name.textContent=displayName(t);state.textContent=t.status==='working'?'干活中':'摸鱼中';
      el.append(dot,name,state);roster.append(el);
    }
    roster.scrollLeft=scroll;
    canvas.setAttribute('aria-label',`${weather?.snapshot().name||''}阁楼；`+tools.map(t=>`${displayName(t)}：${t.status==='working'?'干活中':'摸鱼中'}`).join('；'));
  }
  async function poll() {
    if(polling||disposed)return;polling=true;
    requestController=new AbortController();const timeout=setTimeout(()=>requestController?.abort(),15000);
    try {
      // A cold Windows process snapshot can take several seconds after a restart.
      // Keep one request in flight so short abort/retry cycles cannot pile up scans.
      const response=await fetch('api/status',{cache:'no-store',signal:requestController.signal});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      if(!Array.isArray(data.agents)||!Number.isFinite(data.ts))throw new Error('Invalid status response');
      if(disposed)return;latest=data;polls++;connected=true;
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
      if(disposed)return;connected=false;document.getElementById('connection').textContent='正在重连';document.getElementById('signal').className='signal error';
      notice.textContent=latest?'暂时无法同步，保留上次状态 · 正在重连':'无法连接小阁 · 正在重连';notice.hidden=false;
    } finally {clearTimeout(timeout);requestController=null;polling=false;}
  }
  Object.defineProperty(window,'officeDebug',{value:Object.freeze({
    snapshot:()=>({ready:initialized,connected,polls,clock,zoom:layout?.zoom,width:layout?.w,height:layout?.h,
      sample:layout?.sample,pixelScale:layout?.pixelScale,ox:layout?.ox,oy:layout?.oy,
      background:(weather?.snapshot().kind==='night'?nightBackground:background)?.getAttribute('src'),smoothing:ctx.imageSmoothingEnabled,
      weather:weather?.snapshot(),interactions:interaction?.snapshot(),capacity:CAPACITY,tools:tools.map(t=>({...t})),
      nameplates:{hovered,pinned,visible:actors.filter(a=>!a.label?.hidden).map(a=>a.id)},
      lifecycle:{disposed,animation:!!animation,pollTimer:!!pollTimer,sheets:sheets.size,weatherBuilds},
      actors:actors.map(a=>({id:a.id,name:a.name,characterName:a.characterName,sprite:a.sprite,body:bodyBox(a),spriteFrame:frameIndex(a),slot:a.slot,x:a.x,y:a.y,mode:a.mode,frame:a.frame,dir:a.dir,requested:a.requested,pending:a.pending?{...a.pending}:null,
        idleSlot:a.idleSlot,idleChanges:a.idleChanges,route:a.route.map(p=>({...p})),
        target:initialized?destination(a):null,walkable:initialized?walkable(a.x,a.y,a):false,
        icon:initialized?iconBox(a):null,
        monitorOn:a.mode==='type'&&a.requested==='working'})),
      obstacles:layout?.blocks.map(b=>({...b})),stations:layout?.desks.map(d=>({...d})),
      protected:layout?.protected.map(b=>({...b})),
      spots:layout?.spots.map(p=>({...p,walkable:walkable(p.x,p.y)})),
    }),
  }),writable:false});
  function suspend() {cancelAnimationFrame(animation);animation=0;clearInterval(pollTimer);pollTimer=0;lastTime=0;}
  function resume(refresh=true) {
    if(disposed||document.hidden)return;
    weather.update();if(refresh)poll();
    if(!animation)animation=requestAnimationFrame(render);
    if(!pollTimer)pollTimer=setInterval(poll,3000);
  }
  function dispose() {
    if(disposed)return;disposed=true;suspend();requestController?.abort();
    resizeObserver?.disconnect();lifecycle.abort();interaction?.dispose();weather?.dispose();sheets.clear();
  }
  async function start() {
    try {
      const loadImage=async url=>{const img=new Image();img.src=url;await img.decode();return img;};
      const json=async url=>{const r=await fetch(url,{signal:lifecycle.signal});if(!r.ok)throw new Error(`Missing ${url}`);return r.json();};
      const [room,night,source,manifest,zones]=await Promise.all([
        loadImage('static/assets/bg-c.png'),loadImage('static/assets/bg-c-night.png'),
        json('static/assets/layout.json'),json('static/assets/sprites/manifest.json'),json('static/interaction-zones.json')]);
      roomSpec=source.images.find(i=>i.id==='bg-c');
      if(!roomSpec||roomSpec.workstations.length!==CAPACITY||manifest.characters.length!==CAPACITY||
        zones.coordinateSpace?.width!==ROOM.w||zones.coordinateSpace?.height!==ROOM.h||!Array.isArray(zones.plants)||!zones.teaTable)
        throw new Error('Invalid room configuration');
      const zoneIds=new Set();
      for(const z of [...zones.plants,zones.teaTable]) {
        if(typeof z.id!=='string'||!z.id||zoneIds.has(z.id)||typeof z.name!=='string'||
          !['x','y','w','h'].every(k=>Number.isFinite(z[k]))||z.x<0||z.y<0||z.w<=0||z.h<=0||z.x+z.w>ROOM.w||z.y+z.h>ROOM.h)
          throw new Error('Invalid interaction zone');
        zoneIds.add(z.id);
      }
      metadata=manifest;residents=manifest.characters;background=room;nightBackground=night;
      for(const look of residents)look.actionBounds=Object.fromEntries(Object.entries(metadata.animations).map(([name,animation])=>{
        const bounds=animation.frames.map(f=>look.bounds[f]);
        return [name,{left:Math.min(...bounds.map(b=>b[0])),top:Math.min(...bounds.map(b=>b[1])),
          right:Math.max(...bounds.map(b=>b[2])),bottom:Math.max(...bounds.map(b=>b[3]))}];
      }));
      for(const look of residents) {
        const bounds=Object.entries(look.actionBounds).filter(([name])=>name.startsWith('walk_')).map(([,b])=>b);
        look.walkBounds={left:Math.min(...bounds.map(b=>b.left)),top:Math.min(...bounds.map(b=>b.top)),
          right:Math.max(...bounds.map(b=>b.right)),bottom:Math.max(...bounds.map(b=>b.bottom))};
      }
      await Promise.all(residents.map(async look=>sheets.set(look.id,await loadImage(`static/assets/${look.file}`))));
      if(disposed)return;
      const buffer=document.createElement('canvas');buffer.width=256;buffer.height=384;
      const bc=buffer.getContext('2d',{willReadFrequently:true});
      for(const look of residents) {
        bc.clearRect(0,0,256,384);bc.drawImage(sheets.get(look.id),0,0);
        const pixels=bc.getImageData(0,0,256,384).data;
        look.actionMasks=Object.fromEntries(Object.entries(metadata.animations).map(([name,animation])=>{
          const mask=new Uint8Array(64*64);
          for(const f of animation.frames)for(let y=0;y<64;y++)for(let x=0;x<64;x++)
            if(pixels[(((f>>2)*64+y)*256+(f%4)*64+x)*4+3])mask[y*64+x]=1;
          return [name,mask];
        }));
        look.walkMask=new Uint8Array(64*64);
        for(const [name,mask] of Object.entries(look.actionMasks))if(name.startsWith('walk_'))
          mask.forEach((v,i)=>{if(v)look.walkMask[i]=1;});
      }
      buffer.width=0;buffer.height=0;
      weather=AtticWeather.create(background,Date.now(),nightBackground);weatherBuilds++;fit();followResidents();
      interaction=AtticInteractions.create({canvas,getActors:()=>actors,getLayout:()=>layout,isConnected:()=>connected,zones,getBody:bodyBox});
      await poll();if(disposed)return;updateRoster();document.getElementById('loading').hidden=true;
      resizeObserver=new ResizeObserver(fit);resizeObserver.observe(wrap);
      listen(document,'visibilitychange',()=>{if(document.hidden)suspend();else resume();});
      listen(window,'pagehide',event=>{if(event.persisted)suspend();else dispose();});
      listen(window,'pageshow',event=>{if(event.persisted)resume();});
      resume(false);
    } catch(error) {if(!disposed){document.getElementById('loading').textContent='素材加载失败，请刷新页面';console.error(error);dispose();}}
  }
  start();
})();
