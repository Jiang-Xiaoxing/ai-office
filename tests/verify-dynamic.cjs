const {BASE}=require('./test-env.cjs');
/* Config-driven residents, capacity, and real restarted-service screenshot acceptance. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'D:/tools/PixelAgents/node_modules/playwright');
const ROOT=path.resolve(__dirname,'..'),TMP=path.join(ROOT,'.browser-tmp');
fs.mkdirSync(TMP,{recursive:true});
const configured=JSON.parse(fs.readFileSync(path.join(ROOT,'config/tools.json'),'utf8')).tools;
const read=page=>page.evaluate(()=>officeDebug.snapshot());
async function settled(page,count,mode) {
  await page.waitForFunction(({count,mode})=>{
    const s=window.officeDebug?.snapshot();
    return s?.connected&&s.actors.length===count&&s.actors.every(a=>!a.route.length&&
      (mode==='working'?a.mode==='type':mode==='idle'?['sleep','tea','read'].includes(a.mode):a.mode!=='walk'));
  },{count,mode},{timeout:45000});
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
  assert.equal(await page.locator('.agent-status').count(),s.tools.length,'footer includes overflow');
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
  // All six workstations are baked into bg-c. Test the supplied navigation
  // footprint and reachability rather than the retired procedural desks.
  const free=(x,y,station)=>x>=12&&x<=468&&y>=109&&y<=259&&
    !s.obstacles.some(b=>b.station!==station&&x>b.x-7&&x<b.x+b.w+7&&y>b.y-3&&y<b.y+b.h+3);
  for(let y=128;y<=176;y+=4)assert(free(242,y),'central route remains open');
  for(const d of s.stations) {
    const queue=[{x:240,y:180}],seen=new Set(['240,180']);
    for(let i=0;i<queue.length;i++)for(const [dx,dy] of [[4,0],[-4,0],[0,4],[0,-4]]) {
      const p={x:queue[i].x+dx,y:queue[i].y+dy},key=`${p.x},${p.y}`;
      if(free(p.x,p.y,d.stationId)&&!seen.has(key)){seen.add(key);queue.push(p);}
    }
    for(const p of [d.seat,...s.spots])assert(queue.some(q=>Math.abs(q.x-p.x)<=2&&Math.abs(q.y-p.y)<=2),'all destinations are reachable');
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
async function capture(page,name) {
  await page.locator('#bar').hover();
  assert.equal(await page.locator('.nameplate:not([hidden])').count(),0,'captures record the resting room');
  await page.screenshot({path:path.join(ROOT,'preview',`${name}.png`)});
  const masks=await page.locator('.nameplate:not([hidden]),#bar,#footer').evaluateAll(els=>els.map(el=>{
    const b=el.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};
  }));
  fs.writeFileSync(path.join(TMP,`${name}-masks.json`),JSON.stringify(masks));
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.OFFICE_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    env:{...process.env,TEMP:TMP,TMP:TMP},args:['--no-first-run','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  // Stable sunny art only; live modes still use the actual backend configuration/status.
  await context.addInitScript(()=>{Date.now=()=>Date.parse('2026-10-15T01:00:00Z');});
  const page=await context.newPage(),errors=[],warnings=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
  page.on('requestfailed',r=>requests.push({url:r.url(),error:r.failure()?.errorText}));
  try {
    const live=process.argv.includes('--live6')?6:process.argv.includes('--live3')?3:0;
    if(live) {
      assert.equal(configured.length,live);
      await page.goto(`${BASE}/`);await settled(page,live);
      const s=await check(page,live),api=await page.request.get(`${BASE}/api/status`).then(r=>r.json());
      assert.deepEqual(s.tools.map(t=>t.id),configured.map(t=>t.id));
      assert.deepEqual(api.agents.map(t=>t.id),configured.map(t=>t.id));
      if(live===6)for(const a of s.actors)assert(a.monitorOn&&a.requested==='working','all six real test-config detectors drive typing');
      await capture(page,live===6?'attic-six':'attic-work');
      fs.writeFileSync(path.join(TMP,`live-${live}.json`),JSON.stringify(s,null,2));
      console.log(`PASS live restarted config: ${live} residents, matching labels/footer, nonoverlapping 1920x1080 4x screenshot`);
    } else {
      const base=configured.map(t=>({id:t.id,name:t.name}));
      const extra=Array.from({length:5},(_,i)=>({id:`extra-${i}`,name:`工具 ${i+4}`}));
      // Fill exactly to capacity with tools that hold a seat: the configured
      // count varies, and an idle catch-all stays in the footer only, so it must
      // not stand in for a resident here or a second capacity warning would fire
      // before the overflow assertions below.
      const FALLBACK=/认不出|未识别|无法识别|未知|unknown|other/i;
      const seated=base.filter(t=>!FALLBACK.test(`${t.id} ${t.name||''}`));
      let list=[...seated,...extra.slice(0,6-seated.length)],mode='working',fail=false;
      await context.route('**/api/status',r=>r.fulfill(fail?{status:503,body:'offline'}:
        {json:{ts:1792026000,agents:list.map(t=>({...t,status:mode}))}}));
      await page.goto(`${BASE}/`);await settled(page,6,mode);
      let s=await check(page,6);
      assert.deepEqual(s.actors.map(a=>a.sprite),['01-lin','02-zhou','03-yue','04-he','05-tang','06-bai']);
      assert.deepEqual(s.stations.slice(0,3).map(d=>d.seat),[{x:62,y:129},{x:114,y:129},{x:209,y:116}]);
      await page.screenshot({path:path.join(TMP,'six-capacity.png')});
      const frames=s.actors.map(a=>a.frame);await page.waitForTimeout(270);
      assert((await read(page)).actors.some((a,i)=>a.frame!==frames[i]),'all six typing animations advance');
      mode='idle';await settled(page,6,mode);await check(page,6);
      await page.screenshot({path:path.join(TMP,'six-idle.png')});
      const changes=(await read(page)).actors.map(a=>a.idleChanges);
      await page.waitForFunction(changes=>officeDebug.snapshot().actors.every((a,i)=>a.idleChanges>changes[i]),changes,{timeout:60000});
      await settled(page,6,mode);await check(page,6);
      console.log('PASS six distinct residents, keyboard frames, six reachable leisure destinations and changing activities');
      list=[...base,...extra];mode='working';await settled(page,6,mode);await check(page,6);
      assert(warnings.some(w=>w.includes('6')&&w.includes('extra-3')&&w.includes('extra-4')),'capacity warning names overflow');
      const polls=(await read(page)).polls;await page.waitForFunction(n=>officeDebug.snapshot().polls>n,polls);
      assert.equal(warnings.length,1,'warning does not repeat every poll');
      // Every footer tag can fit on the wide viewport. Exercise real overflow at
      // the supported narrow viewport rather than forcing a cap.
      await page.setViewportSize({width:1024,height:600});await page.waitForTimeout(150);
      await page.locator('#roster').evaluate(el=>{el.scrollLeft=el.scrollWidth;});
      assert(await page.locator('#roster').evaluate(el=>el.scrollLeft>0),'overflow footer can scroll');
      const before=(await read(page)).polls;await page.waitForFunction(n=>officeDebug.snapshot().polls>n,before);
      assert(await page.locator('#roster').evaluate(el=>el.scrollLeft>0),'poll preserves footer scroll position');
      await page.setViewportSize({width:1920,height:1080});await page.waitForTimeout(150);
      console.log(`PASS ${base.length+extra.length} tools: six residents and stations, matching footer statuses, one useful console warning`);
      fail=true;await page.waitForFunction(()=>!officeDebug.snapshot().connected);assert.equal((await read(page)).actors.length,6);fail=false;
      list=[extra[0],base[2],base[0],base[1]];await settled(page,4,mode);s=await check(page,4);
      assert.deepEqual(s.actors.map(a=>a.slot),[3,2,0,1],'legacy seats and looks survive reordered config');
      list=[{id:'brand-new',name:'<工具>（新名字）'}];await settled(page,1,mode);await check(page,1);
      assert.equal(await page.locator('.nameplate strong').textContent(),'<工具>');
      assert.equal(await page.locator('.nameplate small').textContent(),'新名字');
      // A backend model hint (e.g. the Flash model) must reach both the nameplate
      // subtitle and the footer name without disturbing the configured name. Both
      // lists below hold one tool, so wait for the next poll rather than a count change.
      const nextPoll=async()=>{const n=(await read(page)).polls;await page.waitForFunction(x=>officeDebug.snapshot().polls>x,n);};
      list=[{id:'flash',name:'Claude Code (DeepSeek)',detail:'Flash'}];await nextPoll();
      await settled(page,1,mode);await check(page,1);
      assert.equal(await page.locator('.nameplate strong').textContent(),'Claude Code');
      assert.equal(await page.locator('.nameplate small').textContent(),'DeepSeek · Flash');
      assert.equal(await page.locator('#roster .agent-status span').textContent(),'Claude Code (DeepSeek) · Flash');
      list=[{id:'plain',name:'Claude Code (DeepSeek)'}];await nextPoll();
      await settled(page,1,mode);await check(page,1);
      assert.equal(await page.locator('.nameplate small').textContent(),'DeepSeek','an absent hint adds no marker');
      list=[];await settled(page,0);await check(page,0);
      list=base;await settled(page,base.length,mode);await check(page,base.length);
      list=[...base,...Array.from({length:97},(_,i)=>({id:`overflow-${i}`,name:`额外工具 ${i}`}))];
      await settled(page,6,mode);await check(page,6);
      await page.setViewportSize({width:390,height:844});
      await page.waitForTimeout(150);
      const box=await page.locator('#game').boundingBox();
      assert(box.width>0&&box.height>0&&box.x>=0&&box.y>=0&&box.x+box.width<=390&&box.y+box.height<=844);
      assert.equal(await page.locator('.agent-status').count(),base.length+97);
      await page.locator('#roster').evaluate(el=>{el.scrollLeft=el.scrollWidth;});
      assert(await page.locator('#roster').evaluate(el=>el.scrollLeft>0),'all narrow-screen statuses remain scrollable');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
      console.log(`PASS ${base.length+97} tools on a small screen: bounded footer, scrollable statuses and a visible room`);
      const delayed=await context.newPage(),aborted=[];
      delayed.on('requestfailed',r=>aborted.push(r.url()));
      await delayed.route('**/api/status',async r=>{
        await new Promise(resolve=>setTimeout(resolve,3500));
        await r.fulfill({json:{ts:1792026000,agents:base.map(t=>({...t,status:'working'}))}});
      });
      await delayed.goto(`${BASE}/`);await settled(delayed,base.length,'working');
      assert.deepEqual(aborted,[],'a cold process snapshot exceeding 2.5s is allowed to finish');
      await delayed.close();console.log('PASS slow first status response without aborted scans');
      // A catch-all "cannot tell which service" tool is a fallback, not a
      // person: it holds a seat only while a session really works there.
      const fallback={id:'claude-code-other',name:'认不出服务的 Claude Code'};
      await page.setViewportSize({width:1920,height:1080});await page.waitForTimeout(150);
      list=[base[0],fallback];mode='idle';await settled(page,1,'idle');s=await check(page,1);
      assert.deepEqual(s.actors.map(a=>a.id),['codex'],'an idle catch-all keeps out of the room');
      assert.deepEqual(s.tools.map(t=>t.id),['codex','claude-code-other']);
      assert.equal(await page.locator('.agent-status').count(),2,'the footer still lists the idle catch-all');
      mode='working';await settled(page,2,'working');s=await check(page,2);
      assert.deepEqual(s.actors.map(a=>a.id).sort(),['claude-code-other','codex'],'a busy catch-all earns a seat');
      console.log('PASS fallback catch-all: footer-only while idle, seated only while its session really works');
      list=base;await settled(page,base.length,mode);await check(page,base.length);
      console.log('PASS reconnect, reorder, remove, rename, safe text rendering, empty config and repopulation');
    }
    assert.deepEqual(errors,[]);
  } catch(error) {
    fs.writeFileSync(path.join(TMP,'dynamic-failure.json'),JSON.stringify({...await read(page).catch(()=>({})),errors,requests},null,2));
    await page.screenshot({path:path.join(TMP,'dynamic-failure.png')});throw error;
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
