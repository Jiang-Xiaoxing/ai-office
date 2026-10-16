/* Shared assertions for the two verify-dynamic halves: one file drives the
   residents and the room, the other the roster and the detection plumbing.
   Both halves used to share one process, whose real-time settles (residents
   walk one at a time, and the page polls every 3s) pushed the single file past
   the runner's per-file budget. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..'),TMP=path.join(ROOT,'.browser-tmp');
fs.mkdirSync(TMP,{recursive:true});
const configured=JSON.parse(fs.readFileSync(path.join(ROOT,'config/tools.json'),'utf8')).tools;
// A catch-all "cannot tell which service" tool only counts while it works.
const FALLBACK=/认不出|未识别|无法识别|未知|unknown|other/i;
const visibleTools=s=>s.tools.filter(t=>t.status==='working'||!FALLBACK.test(`${t.id} ${t.name||''}`));
const read=page=>page.evaluate(()=>officeDebug.snapshot());
// Residents walk one at a time. Bound each transition separately and report
// the remaining routes/pending targets when it fails, before the file budget.
async function settled(page,count,mode) {
  try {
    await page.waitForFunction(({count,mode})=>{
      const s=window.officeDebug?.snapshot();
      return s?.connected&&s.actors.length===count&&s.actors.every(a=>!a.route.length&&!a.pending&&
        (!mode||a.requested===mode)&&
        (mode==='working'?a.mode==='type':mode==='idle'?['sleep','tea','read'].includes(a.mode):a.mode!=='walk'));
    },{count,mode},{timeout:60000});
  } catch(error) {
    const state=await read(page).catch(()=>null);
    throw new Error(`Could not settle ${count} residents in ${mode||'any'} mode: ${JSON.stringify(state&&{
      connected:state.connected,actors:state.actors.map(({id,mode,requested,x,y,route,pending})=>
        ({id,mode,requested,x,y,remaining:route.length,pending}))})}`,{cause:error});
  }
}
// Hovering one resident must pop its own plate, hugging its head, and the
// plate must collapse again the moment the pointer leaves.
async function probe(page,index) {
  const actor=(await read(page)).actors[index];
  await page.locator(`[data-target="resident:${actor.id}"]`).hover();
  const state=await page.evaluate(()=>{
    const s=officeDebug.snapshot(),r=document.getElementById('game').getBoundingClientRect();
    const boxes=[...document.querySelectorAll('.nameplate:not([hidden])')].map(el=>{
      const b=el.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,id:el.dataset.actor};
    });
    return {boxes,scale:s.pixelScale,bodies:s.actors.map(a=>({id:a.id,x:r.x+a.body.x*s.pixelScale,
      y:r.y+a.body.y*s.pixelScale,w:a.body.w*s.pixelScale,h:a.body.h*s.pixelScale,
      cx:r.x+Math.round(a.x)*s.pixelScale}))};
  });
  assert.deepEqual(state.boxes.map(b=>b.id),[actor.id],'hovering a resident pops exactly its own plate');
  const b=state.boxes[0],body=state.bodies.find(q=>q.id===actor.id),overlaps=(p,q)=>p.x<q.x+q.w&&p.x+p.w>q.x&&p.y<q.y+q.h&&p.y+p.h>q.y;
  assert(b.x>=0&&b.y>=0&&b.x+b.w<=1920&&b.y+b.h<=1080,'hovered plate stays inside the room');
  assert(b.y+b.h<=body.y-8,'hovered plate remains above its resident head');
  if(body.cx-b.w/2>=0&&body.cx+b.w/2<=1920)
    assert(Math.abs(b.x+b.w/2-body.cx)<=state.scale+1,'hovered plate centers over its resident');
  for(const q of state.bodies)if(q.id!==actor.id)assert(!overlaps(b,q),'hovered plate never covers another resident');
  await page.locator('#bar').hover();
  assert.equal(await page.locator('.nameplate:not([hidden])').count(),0,'the plate collapses when the pointer leaves');
}
async function check(page,count) {
  const s=await read(page);assert.equal(s.actors.length,count);assert.equal(s.stations.length,count);
  assert.equal(new Set(s.actors.map(a=>a.sprite)).size,count,'each visible tool has a distinct look');
  assert.equal(new Set(s.stations.map(d=>d.slot)).size,count,'each visible tool has its own station');
  assert.equal(await page.locator('.nameplate').count(),count);
  assert.equal(await page.locator('.agent-status').count(),visibleTools(s).length,'footer lists every visible tool, overflow included');
  assert.equal(s.pixelScale,4);assert.equal(s.smoothing,false);
  assert.equal((await page.locator('#wrap').boundingBox()).height,976);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
  // A resting room shows the status icons only; the plates appear on demand.
  assert.equal(await page.locator('.nameplate:not([hidden])').count(),0,'a resting room keeps its plates out of the way');
  const boxes=await page.locator('.nameplate:not([hidden]),#bar,#footer').evaluateAll(els=>[...els].sort((a,b)=>Number(b.classList.contains('nameplate'))-Number(a.classList.contains('nameplate'))).map(el=>{
    const b=el.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};
  }));
  const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  const bodies=s.actors.map(a=>({x:s.ox+a.body.x*s.pixelScale,y:56+s.oy+a.body.y*s.pixelScale,w:a.body.w*s.pixelScale,h:a.body.h*s.pixelScale}));
  boxes.forEach((b,i)=>{
    assert(b.x>=0&&b.y>=0&&b.x+b.w<=1920&&b.y+b.h<=1080,'label/bar fits screen');
    boxes.slice(i+1).forEach(q=>assert(!overlaps(b,q),'labels/bars do not overlap'));
    bodies.forEach(q=>assert(!overlaps(b,q),'labels/bars do not cover people'));
  });
  bodies.forEach((b,i)=>bodies.slice(i+1).forEach(q=>assert(!overlaps(b,q),'people do not overlap')));
  for(const a of s.actors)assert(a.walkable,`${a.id} has a reachable position`);
  for(const a of s.actors)if(a.requested==='idle'&&!a.route.length&&!a.pending) {
    const spot=s.spots.find(p=>Math.abs(p.x-a.x)<.01&&Math.abs(p.y-a.y)<.01);
    assert(spot&&spot.action===a.mode,'settled activity matches its furniture, even after leisure timers fire');
    if(a.mode==='sleep')assert.equal(spot.furniture,'c-obstacle-sofa','naps belong on the sofa');
  }
  // All six workstations are baked into bg-c. Test the supplied navigation
  // footprint and reachability rather than the retired procedural desks.
  const free=(x,y,station,furniture)=>x>=12&&x<=468&&y>=109&&y<=259&&
    !s.obstacles.some(b=>b.id!==furniture&&!(station==='c-workstation-1'&&b.id==='c-obstacle-sofa')&&b.station!==station&&x>b.x-7&&x<b.x+b.w+7&&y>b.y-3&&y<b.y+b.h+3);
  for(let y=128;y<=176;y+=4)assert(free(242,y),'central route remains open');
  for(const d of s.stations)for(const furniture of new Set([undefined,...s.spots.map(p=>p.furniture)])) {
    const queue=[{x:240,y:180}],seen=new Set(['240,180']);
    for(let i=0;i<queue.length;i++)for(const [dx,dy] of [[4,0],[-4,0],[0,4],[0,-4]]) {
      const p={x:queue[i].x+dx,y:queue[i].y+dy},key=`${p.x},${p.y}`;
      if(free(p.x,p.y,d.stationId,furniture)&&!seen.has(key)){seen.add(key);queue.push(p);}
    }
    for(const p of [d.seat,...s.spots].filter(p=>p.furniture===furniture))
      assert(queue.some(q=>Math.abs(q.x-p.x)<=2&&Math.abs(q.y-p.y)<=2),'all destinations are reachable, including an occupied sofa cushion');
  }
  // The approved redesign anchors a plate above the head it belongs to, and
  // only while that resident is hovered or pinned; probe the first and the
  // last resident, so a crowded room cannot hide a stray plate.
  if(count) {
    await probe(page,0);
    if(count>1)await probe(page,count-1);
  }
  const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'static/assets/sprites/manifest.json'),'utf8'));
  for(const a of s.actors) {
    assert(manifest.characters.some(c=>c.id===a.sprite));
    for(const action of ['typing_back','tea','reading','napping','walk_up','walk_down','walk_left','walk_right'])
      assert(manifest.animations[action].frames.length>0);
  }
  return s;
}
module.exports={ROOT,TMP,configured,FALLBACK,visibleTools,read,settled,probe,check};
