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
  },{count,mode},{timeout:25000});
}
async function check(page,count) {
  const s=await read(page);assert.equal(s.actors.length,count);assert.equal(s.stations.length,count);
  assert.equal(new Set(s.actors.map(a=>a.sprite)).size,count,'each visible tool has a distinct look');
  assert.equal(new Set(s.stations.map(d=>d.slot)).size,count,'each visible tool has its own station');
  assert.equal(await page.locator('.nameplate').count(),count);
  assert.equal(await page.locator('.agent-status').count(),s.tools.length,'footer includes overflow');
  assert.equal(s.pixelScale,4);assert.equal(s.smoothing,false);
  assert.deepEqual(await page.locator('#game').boundingBox(),{x:0,y:0,width:1920,height:1080});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
  const boxes=await page.locator('.nameplate,#bar,#footer').evaluateAll(els=>els.map(el=>{
    const b=el.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};
  }));
  const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  const bodies=s.actors.map(a=>({x:(Math.round(a.x)-13)*4,y:(Math.round(a.y)-(a.mode==='type'?40:34))*4,w:104,h:144}));
  boxes.forEach((b,i)=>{
    assert(b.x>=0&&b.y>=0&&b.x+b.w<=1920&&b.y+b.h<=1080,'label/bar fits screen');
    boxes.slice(i+1).forEach(q=>assert(!overlaps(b,q),'labels/bars do not overlap'));
    bodies.forEach(q=>assert(!overlaps(b,q),'labels/bars do not cover people'));
  });
  bodies.forEach((b,i)=>bodies.slice(i+1).forEach(q=>assert(!overlaps(b,q),'people do not overlap')));
  for(const a of s.actors)assert(a.walkable,`${a.id} has a reachable position`);
  for(const d of s.stations)if(d.furniture) {
    const pixels={x:d.furniture.x*4,y:d.furniture.y*4,w:d.furniture.w*4,h:d.furniture.h*4};
    boxes.slice(0,count).forEach(b=>assert(!overlaps(b,pixels),'labels do not cover added desks/computers'));
  }
  // The sprite's transparent corners extend past the legs. Test visible pixels,
  // not a rectangular box that would incorrectly include those empty corners.
  const collisions=await page.evaluate(async()=>{
    const s=officeDebug.snapshot(),meta=await fetch('static/assets/office-atlas.json').then(r=>r.json());
    const atlas=new Image();atlas.src='static/assets/office-atlas.png';await atlas.decode();
    const canvas=document.createElement('canvas');canvas.width=atlas.width;canvas.height=atlas.height;
    const c=canvas.getContext('2d');c.drawImage(atlas,0,0);const pixels=c.getImageData(0,0,canvas.width,canvas.height).data;
    const fixed=s.protected.filter(q=>!s.stations.some(d=>d.furniture&&d.furniture.x===q.x&&d.furniture.y===q.y));
    const hits=[];
    for(const d of s.stations.filter(d=>d.furniture))for(const [name,x,y] of [
      ['desk',d.furniture.x,d.furniture.y],['chair',d.seat.x-13,d.seat.y-19]]) {
      const [sx,sy,w,h]=meta[name];
      for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++)if(pixels[((sy+dy)*canvas.width+sx+dx)*4+3]&&
        fixed.some(q=>x+dx>=q.x&&x+dx<q.x+q.w&&y+dy>=q.y&&y+dy<q.y+q.h))hits.push([d.slot,name,x+dx,y+dy]);
    }
    return hits;
  });
  assert.deepEqual(collisions,[],'visible furniture preserves lounge, lamps, stairs, windows and shelves');
  for(const q of s.protected)for(const b of boxes.slice(0,count))
    assert(!overlaps(b,{x:q.x*4,y:q.y*4,w:q.w*4,h:q.h*4}),'labels preserve background furniture, lamps, windows and stairs');
  const atlas=JSON.parse(fs.readFileSync(path.join(ROOT,'static/assets/office-atlas.json'),'utf8'));
  for(const a of s.actors)for(const action of ['type','tea','read','sleep'])for(let f=0;f<4;f++)
    assert(atlas[`${a.sprite}-${action}-0-${f}`],`${a.sprite} has ${action} animation`);
  return s;
}
async function capture(page,name) {
  await page.screenshot({path:path.join(ROOT,'preview',`${name}.png`)});
  const masks=await page.locator('.nameplate,#bar,#footer').evaluateAll(els=>els.map(el=>{
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
      await page.goto('http://127.0.0.1:8889/');await settled(page,live);
      const s=await check(page,live),api=await page.request.get('http://127.0.0.1:8889/api/status').then(r=>r.json());
      assert.deepEqual(s.tools.map(t=>t.id),configured.map(t=>t.id));
      assert.deepEqual(api.agents.map(t=>t.id),configured.map(t=>t.id));
      if(live===6)for(const a of s.actors.slice(3))assert(a.monitorOn&&a.requested==='working','real explorer detector drives typing');
      await capture(page,live===6?'attic-six':'attic-work');
      fs.writeFileSync(path.join(TMP,`live-${live}.json`),JSON.stringify(s,null,2));
      console.log(`PASS live restarted config: ${live} residents, matching labels/footer, nonoverlapping 1920x1080 4x screenshot`);
    } else {
      const base=configured.map(t=>({id:t.id,name:t.name}));
      const extra=Array.from({length:5},(_,i)=>({id:`extra-${i}`,name:`工具 ${i+4}`}));
      let list=[...base,...extra.slice(0,3)],mode='working',fail=false;
      await context.route('**/api/status',r=>r.fulfill(fail?{status:503,body:'offline'}:
        {json:{ts:1792026000,agents:list.map(t=>({...t,status:mode}))}}));
      await page.goto('http://127.0.0.1:8889/');await settled(page,6,mode);
      let s=await check(page,6);
      assert.deepEqual(s.actors.map(a=>a.sprite),['moss','sky','sun','lilac','rose','fern']);
      assert.deepEqual(s.stations.slice(0,3).map(d=>d.seat),[{x:96,y:118},{x:384,y:118},{x:406,y:237}]);
      await page.screenshot({path:path.join(TMP,'six-capacity.png')});
      const frames=s.actors.map(a=>a.frame);await page.waitForTimeout(270);
      assert((await read(page)).actors.every((a,i)=>a.frame!==frames[i]),'all six typing animations advance');
      mode='idle';await settled(page,6,mode);await check(page,6);
      await page.screenshot({path:path.join(TMP,'six-idle.png')});
      const changes=(await read(page)).actors.map(a=>a.idleChanges);
      await page.waitForFunction(changes=>officeDebug.snapshot().actors.every((a,i)=>a.idleChanges>changes[i]),changes,{timeout:35000});
      await settled(page,6,mode);await check(page,6);
      console.log('PASS six distinct residents, keyboard frames, six reachable leisure destinations and changing activities');
      list=[...base,...extra];mode='working';await settled(page,6,mode);await check(page,6);
      assert(warnings.some(w=>w.includes('6')&&w.includes('extra-3')&&w.includes('extra-4')),'capacity warning names overflow');
      const polls=(await read(page)).polls;await page.waitForFunction(n=>officeDebug.snapshot().polls>n,polls);
      assert.equal(warnings.length,1,'warning does not repeat every poll');
      await page.locator('#roster').evaluate(el=>{el.scrollLeft=el.scrollWidth;});
      assert(await page.locator('#roster').evaluate(el=>el.scrollLeft>0),'overflow footer can scroll');
      const before=(await read(page)).polls;await page.waitForFunction(n=>officeDebug.snapshot().polls>n,before);
      assert(await page.locator('#roster').evaluate(el=>el.scrollLeft>0),'poll preserves footer scroll position');
      console.log('PASS eight tools: six residents and stations, eight footer statuses, one useful console warning');
      fail=true;await page.waitForFunction(()=>!officeDebug.snapshot().connected);assert.equal((await read(page)).actors.length,6);fail=false;
      list=[extra[0],base[2],base[0],base[1]];await settled(page,4,mode);s=await check(page,4);
      assert.deepEqual(s.actors.map(a=>a.slot),[3,2,0,1],'legacy seats and looks survive reordered config');
      list=[{id:'brand-new',name:'<工具>（新名字）'}];await settled(page,1,mode);await check(page,1);
      assert.equal(await page.locator('.nameplate strong').textContent(),'<工具>');
      assert.equal(await page.locator('.nameplate small').textContent(),'新名字');
      list=[];await settled(page,0);await check(page,0);
      list=base;await settled(page,3,mode);await check(page,3);
      list=[...base,...Array.from({length:97},(_,i)=>({id:`overflow-${i}`,name:`额外工具 ${i}`}))];
      await settled(page,6,mode);await check(page,6);
      await page.setViewportSize({width:390,height:844});
      await page.waitForTimeout(150);
      const box=await page.locator('#game').boundingBox();
      assert(box.width>0&&box.height>0&&box.x>=0&&box.y>=0&&box.x+box.width<=390&&box.y+box.height<=844);
      assert.equal(await page.locator('.agent-status').count(),100);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
      console.log('PASS 100 tools on a small screen: bounded footer, scrollable statuses and a visible room');
      const delayed=await context.newPage(),aborted=[];
      delayed.on('requestfailed',r=>aborted.push(r.url()));
      await delayed.route('**/api/status',async r=>{
        await new Promise(resolve=>setTimeout(resolve,3500));
        await r.fulfill({json:{ts:1792026000,agents:base.map(t=>({...t,status:'working'}))}});
      });
      await delayed.goto('http://127.0.0.1:8889/');await settled(delayed,3,'working');
      assert.deepEqual(aborted,[],'a cold process snapshot exceeding 2.5s is allowed to finish');
      await delayed.close();console.log('PASS slow first status response without aborted scans');
      console.log('PASS reconnect, reorder, remove, rename, safe text rendering, empty config and repopulation');
    }
    assert.deepEqual(errors,[]);
  } catch(error) {
    fs.writeFileSync(path.join(TMP,'dynamic-failure.json'),JSON.stringify({...await read(page).catch(()=>({})),errors,requests},null,2));
    await page.screenshot({path:path.join(TMP,'dynamic-failure.png')});throw error;
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
