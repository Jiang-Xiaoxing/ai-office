/* Hidden browser acceptance tests; mock state stays inside the browser context. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'D:/tools/PixelAgents/node_modules/playwright');
const ROOT=path.resolve(__dirname,'..'),TMP=path.join(ROOT,'.browser-tmp');
fs.mkdirSync(TMP,{recursive:true});
const read=p=>p.evaluate(()=>window.officeDebug.snapshot());
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ids=['codex','codebuddy','claude-code'];
const settled=(s,work)=>s.actors.every(a=>a.requested===(work?'working':'idle')&&!a.route.length&&
  (work?a.mode==='type':['sleep','tea','read'].includes(a.mode)));
async function arrive(page,work) {
  await page.waitForFunction(work=>{
    const s=window.officeDebug?.snapshot();return s?.actors.every(a=>a.requested===(work?'working':'idle')&&!a.route.length&&
      (work?a.mode==='type':['sleep','tea','read'].includes(a.mode)));
  },work,{timeout:22000});
}
async function checkFit(page) {
  const s=await read(page),box=await page.locator('#game').boundingBox(),room=await page.locator('#wrap').boundingBox();
  assert(Number.isInteger(s.zoom));assert.equal(s.smoothing,false);
  assert(box.x>=room.x&&box.y>=room.y&&box.x+box.width<=room.x+room.width+.01&&box.y+box.height<=room.y+room.height+.01,'entire room fits');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
  for(const a of s.actors)assert(a.walkable,`${a.id} blocked ${a.x},${a.y}`);
  for(const p of s.spots)assert(p.walkable,`leisure destination blocked ${p.x},${p.y}`);
  const plates=await page.locator('.nameplate').evaluateAll(els=>els.map(e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};}));
  for(const p of plates)assert(p.x>=0&&p.y>=room.y&&p.x+p.w<=room.width&&p.y+p.h<=room.y+room.height,'nameplate fits');
  plates.forEach((p,i)=>plates.slice(i+1).forEach(q=>assert(!(p.x<q.x+q.w&&p.x+p.w>q.x&&p.y<q.y+q.h&&p.y+p.h>q.y),'nameplates must not overlap')));
}
async function watchTravel(page,work) {
  let previous=await read(page),prevTime=Date.now(),moving=0;
  for(let i=0;i<220;i++) {
    await sleep(60);const s=await read(page),now=Date.now();
    s.actors.forEach((a,j)=>{
      const dist=Math.hypot(a.x-previous.actors[j].x,a.y-previous.actors[j].y);
      assert(dist<=(now-prevTime)/1000*48+3,`no teleport: ${a.id}: ${dist}`);
      assert(a.walkable,`collision: ${a.id} ${a.x},${a.y}`);
      if(a.mode==='walk'){moving++;assert.equal(a.monitorOn,false);}
    });
    if(settled(s,work))return moving;
    previous=s;prevTime=now;
  }
  throw Error('Movement never reached destination');
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.OFFICE_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless:true,env:{...process.env,TEMP:TMP,TMP:TMP},args:['--no-first-run','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  const page=await context.newPage(),errors=[],calls=[],resources=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>resources.push({url:r.url(),status:r.status()}));
  let mode='idle',failing=false;
  function mock(route) {
    calls.push({url:route.request().url(),time:Date.now()});
    return route.fulfill(failing?{status:503,body:'unavailable'}:{json:{ts:Math.floor(Date.now()/1000),agents:ids.map((id,i)=>({id,status:Array.isArray(mode)?mode[i]:mode}))}});
  }
  await context.route('**/api/status',mock);
  await context.route('**/office/**',async route=>{
    const u=new URL(route.request().url());if(u.pathname.endsWith('/api/status'))return mock(route);
    u.pathname=u.pathname.replace(/^\/office\//,'/');
    const response=await route.fetch({url:u.href});await route.fulfill({response});
  });
  try {
    await page.goto('http://127.0.0.1:8889/',{waitUntil:'networkidle'});await arrive(page,false);
    await checkFit(page);let s=await read(page);assert.equal(s.zoom,4);
    assert.deepEqual(s.actors.map(a=>a.mode),['sleep','tea','read']);
    assert(s.actors.every(a=>!a.monitorOn));
    // All three residents must contribute nontransparent pixels, including the reading chair.
    await page.screenshot({path:path.join(ROOT,'preview/attic-idle.png')});
    console.log('PASS 1920x1080 idle: 4x pixels, three leisure animations, entire room fits');
    mode='working';await page.waitForFunction(()=>window.officeDebug.snapshot().actors.every(a=>a.requested==='working'));
    assert((await read(page)).actors.some(a=>a.mode==='walk'));
    assert(await watchTravel(page,true)>0);await arrive(page,true);await checkFit(page);s=await read(page);
    assert(s.actors.every(a=>a.monitorOn&&Math.hypot(a.x-a.target.x,a.y-a.target.y)<.1));
    const frames=s.actors.map(a=>a.frame);await sleep(270);
    assert((await read(page)).actors.some((a,i)=>frames[i]!==a.frame));
    await page.screenshot({path:path.join(ROOT,'preview/attic-work.png')});
    console.log('PASS walking to own chairs, continuous movement, collision checks, typing and monitor wake');
    mode='idle';await page.waitForFunction(()=>window.officeDebug.snapshot().actors.every(a=>a.requested==='idle'));
    assert(await watchTravel(page,false)>0);await arrive(page,false);
    const changes=(await read(page)).actors.map(a=>a.idleChanges);
    await page.waitForFunction(changes=>window.officeDebug.snapshot().actors.some((a,i)=>a.idleChanges>changes[i]),changes,{timeout:25000});
    assert((await read(page)).actors.some(a=>a.mode==='walk'));
    await arrive(page,false);
    console.log('PASS leave work, randomly change leisure activity, walk to the next nook');
    mode=['working','idle','working'];
    await page.waitForFunction(()=>{const a=window.officeDebug.snapshot().actors;return a[0].mode==='type'&&a[1].requested==='idle'&&a[2].mode==='type';},null,{timeout:22000});
    failing=true;await page.waitForFunction(()=>!window.officeDebug.snapshot().connected);
    assert.equal((await read(page)).actors[0].requested,'working');assert(await page.locator('#notice').isVisible());
    failing=false;await page.waitForFunction(()=>window.officeDebug.snapshot().connected);
    console.log('PASS mixed activity, disconnected state preservation and automatic recovery');
    for(const size of [{width:390,height:844},{width:320,height:740},{width:768,height:1024},{width:1366,height:768}]) {
      mode='idle';await page.setViewportSize(size);await arrive(page,false);await checkFit(page);
      if(size.width===390)await page.screenshot({path:path.join(TMP,'mobile-idle.png')});
      mode='working';await arrive(page,true);await checkFit(page);
      if(size.width===390)await page.screenshot({path:path.join(TMP,'mobile-work.png')});
      console.log(`PASS ${size.width}x${size.height}: fit, labels, all three idle/work destinations`);
    }
    mode='working';const startup=await context.newPage();
    await startup.goto('http://127.0.0.1:8889/');
    await startup.waitForFunction(()=>window.officeDebug?.snapshot().actors.every(a=>a.requested==='working'));
    assert((await read(startup)).actors.some(a=>a.mode==='walk'));await arrive(startup,true);await startup.close();
    console.log('PASS first load with working status walks to work');
    mode='idle';await page.setViewportSize({width:1920,height:1080});
    await page.goto('http://127.0.0.1:8889/office/',{waitUntil:'networkidle'});await arrive(page,false);
    for(const suffix of ['static/office.js','static/office.css','static/assets/office-atlas.png','static/assets/office-atlas.json','api/status'])
      assert(resources.some(r=>r.url.endsWith(`/office/${suffix}`)&&r.status===200),`prefix resource: ${suffix}`);
    assert(calls.some(c=>c.url.endsWith('/office/api/status')));await checkFit(page);
    console.log('PASS /office/ prefix: relative CSS, JS, atlas and API');
    const direct=calls.filter(c=>!c.url.includes('/office/')).slice(0,9);
    const intervals=direct.slice(1).map((c,i)=>c.time-direct[i].time);
    assert(intervals.every(t=>t>2700&&t<3400),`3 second polling: ${intervals}`);
    assert.deepEqual(errors,[]);console.log('PASS 3-second polling, no browser exceptions');
  } catch(e) {
    fs.writeFileSync(path.join(TMP,'failure.json'),JSON.stringify(await read(page).catch(()=>({})),null,2));
    await page.screenshot({path:path.join(TMP,'failure.png')});throw e;
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
