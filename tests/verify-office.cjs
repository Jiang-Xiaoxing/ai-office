const {BASE,PYTHON}=require('./test-env.cjs');
﻿/* Hidden browser acceptance tests; mock state stays inside the browser context. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'D:/tools/PixelAgents/node_modules/playwright');
const ROOT=path.resolve(__dirname,'..'),TMP=path.join(ROOT,'.browser-tmp');
fs.mkdirSync(TMP,{recursive:true});
const read=p=>p.evaluate(()=>window.officeDebug.snapshot());
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ids=['codex','openrouter','claude-code'];
const names=['Codex','Claude Code (OpenRouter)','Claude Code (DeepSeek)'];
const providerScenarios=JSON.parse(execFileSync(PYTHON,
  [path.join(__dirname,'provider_scenarios.py')],{cwd:ROOT,windowsHide:true,encoding:'utf8'}));
const settled=(s,work)=>s.actors.every(a=>a.requested===(work?'working':'idle')&&!a.route.length&&
  (work?a.mode==='type':['sleep','tea','read'].includes(a.mode)));
async function arrive(page,work) {
  await page.waitForFunction(work=>{
    const s=window.officeDebug?.snapshot();return s?.connected&&s.actors.length===3&&s.actors.every(a=>a.requested===(work?'working':'idle')&&!a.route.length&&
      (work?a.mode==='type':['sleep','tea','read'].includes(a.mode)));
  },work,{timeout:45000});
}
async function checkFit(page) {
  const s=await read(page),box=await page.locator('#game').boundingBox(),room=await page.locator('#wrap').boundingBox();
  assert(s.zoom>0);assert.equal(s.smoothing,false);
  assert(box.x>=room.x-.01&&box.x+box.width<=room.x+room.width+.01,'side workstations stay visible');
  assert.equal(await page.locator('#wrap').evaluate(e=>getComputedStyle(e).overflow),'hidden','only decorative edges are clipped by the room');
  assert(Math.abs(box.width/box.height-480/270)<.001,'room retains its aspect ratio');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
  const bars=await page.locator('#bar,#footer').evaluateAll(els=>els.map(el=>{
    const b=el.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};
  }));
  const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  const text=await page.locator('h1,.owner,#weather,#connection,#ts,.agent-status,.agent-status em,.local,.refresh').evaluateAll(els=>els.filter(el=>el.getClientRects().length).map(el=>{
    const b=el.getBoundingClientRect();return {size:parseFloat(getComputedStyle(el).fontSize),x:b.x,y:b.y,w:b.width,h:b.height};
  }));
  for(const t of text) {
    assert(t.size>=18,`bar text stays readable: ${t.size}px`);
    assert(t.w>0&&t.h>0&&t.x>=0&&t.y>=0&&t.x+t.w<=page.viewportSize().width+.01&&t.y+t.h<=page.viewportSize().height+.01,'bar text stays visible');
  }
  if(page.viewportSize().width===1920&&page.viewportSize().height===1080) {
    assert.equal(s.sample,1);assert.equal(s.pixelScale,4);
    assert(Math.abs(box.width-room.width)<.1&&box.y<=room.y&&box.y+box.height>=room.y+room.height,'room fills both dimensions between bars');
    assert.equal(room.y,56);assert.equal(room.height,976);
    assert.equal(await page.locator('h1').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)),28);
    assert.equal(bars[0].h,56,'desktop timber header');assert.equal(bars[1].h,48,'readable status tags');
  }
  for(const a of s.actors)assert(a.walkable,`${a.id} blocked ${a.x},${a.y}`);
  for(const p of s.spots)assert(p.walkable,`leisure destination blocked ${p.x},${p.y}`);
  // Resting rooms carry no billboard: a plate only exists while it is hovered
  // or pinned, so nothing here may sit over the art or the residents.
  const plates=await page.locator('.nameplate:not([hidden])').evaluateAll(els=>els.map(e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};}));
  assert.deepEqual(plates,[],'no nameplate is drawn until a resident is hovered or pinned');
  for(const a of s.actors) {
    const q={x:box.x+a.body.x*s.pixelScale,y:box.y+a.body.y*s.pixelScale,
      w:a.body.w*s.pixelScale,h:a.body.h*s.pixelScale};
    assert(bars.every(b=>!overlaps(q,b)),'bars must not cover residents');
  }
  for(const d of s.stations) {
    const screen={x:box.x+d.screen.x*s.pixelScale,y:box.y+d.screen.y*s.pixelScale,w:d.screen.w*s.pixelScale,h:d.screen.h*s.pixelScale};
    assert(bars.every(b=>!overlaps(screen,b)),'bars must not cover workstations');
  }
  if(page.viewportSize().width===1920) {
    const fonts=await page.locator('.nameplate strong,.nameplate small,.nameplate span').evaluateAll(els=>els.map(e=>parseFloat(getComputedStyle(e).fontSize)));
    assert(fonts.every(size=>size>=16),`readable name/subtitle/status: ${fonts}`);
  }
}
async function checkBackground(page) {
  const result=await page.evaluate(async()=>{
    const s=window.officeDebug.snapshot(),game=document.getElementById('game');
    const image=new Image();image.src=s.background;await image.decode();
    const ref=document.createElement('canvas');ref.width=480;ref.height=270;
    const c=ref.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(image,0,0,480,270);
    const expected=c.getImageData(0,0,480,270).data,actual=game.getContext('2d').getImageData(0,0,480,270).data;
    const overlays=s.actors.map(a=>a.body);
    // The head-level status icon is canvas overlay too, and the napping Zz
    // drifts a few pixels up; mask the whole band it can reach.
    overlays.push(...s.actors.map(a=>a.icon).filter(Boolean).map(i=>({x:i.x,y:i.y-4,w:i.w,h:i.h+4})));
    overlays.push(...s.stations.map(d=>d.screen));
    let checked=0,bad=0;
    for(let y=0;y<270;y++)for(let x=0;x<480;x++) {
      if(overlays.some(b=>x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h))continue;
      checked++;const i=(y*480+x)*4;
      if(expected[i]!==actual[i]||expected[i+1]!==actual[i+1]||expected[i+2]!==actual[i+2])bad++;
    }
    return {checked,bad};
  });
  assert(result.checked>120000,`background coverage: ${result.checked}`);
  assert.equal(result.bad,0,'approved background stays pixel-identical outside residents and existing screens');
}
// Delivery captures record the resting room and their own HTML overlay bounds,
// so verify_screenshots.py can tell text from art without a stale mask file.
async function capture(page,name) {
  await page.mouse.move(1900,20);
  assert.equal(await page.locator('.nameplate:not([hidden])').count(),0,'captures record the plate-free room');
  await require('./capture.cjs')(page,name);
  await page.screenshot({path:path.join(ROOT,'preview',`${name}.png`)});
  const masks=await page.locator('.nameplate:not([hidden]),#bar,#footer').evaluateAll(els=>els.map(el=>{
    const b=el.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};
  }));
  fs.writeFileSync(path.join(TMP,`${name}-masks.json`),JSON.stringify(masks));
}
async function watchTravel(page,work) {
  let previous=await read(page),prevTime=Date.now(),moving=0;
  for(let i=0;i<600;i++) {
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
  // Keep the existing pixel-identity regression in the unchanged sunny scene.
  await context.addInitScript(()=>{Date.now=()=>Date.parse('2026-10-15T01:00:00Z');});
  const page=await context.newPage(),errors=[],calls=[],resources=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>resources.push({url:r.url(),status:r.status()}));
  let mode='idle',failing=false;
  function mock(route) {
    calls.push({url:route.request().url(),time:Date.now()});
    return route.fulfill(failing?{status:503,body:'unavailable'}:{json:{ts:Math.floor(Date.now()/1000),agents:ids.map((id,i)=>({id,name:names[i],status:Array.isArray(mode)?mode[i]:mode}))}});
  }
  await context.route('**/api/status',mock);
  await context.route('**/office/**',async route=>{
    const u=new URL(route.request().url());if(u.pathname.endsWith('/api/status'))return mock(route);
    u.pathname=u.pathname.replace(/^\/office\//,'/');
    const response=await route.fetch({url:u.href});await route.fulfill({response});
  });
  try {
    await page.goto(`${BASE}/`,{waitUntil:'networkidle'});await arrive(page,false);
    await checkFit(page);let s=await read(page);assert.equal(s.zoom,4);
    assert.equal(s.width,480);assert.equal(s.height,270);assert.equal(s.sample,1);
    assert.equal(s.background,'static/assets/bg-c.png');
    assert(fs.readFileSync(path.join(ROOT,'static/assets/bg-c.png')).equals(fs.readFileSync('D:/ai-office-bg/bg-c.png')),'background copied unchanged');
    assert.deepEqual(s.stations.map(d=>d.seat),[{x:62,y:129},{x:114,y:129},{x:209,y:116}]);
    await checkBackground(page);
    assert.deepEqual(s.actors.map(a=>a.mode),['sleep','tea','read']);
    assert(s.actors.every(a=>!a.monitorOn));
    assert.deepEqual(s.actors.map(a=>a.id),ids);
    assert.deepEqual(s.stations.map(d=>d.id),ids);
    assert.equal(await page.locator('.nameplate').nth(1).locator('strong').textContent(),'Claude Code');
    assert.equal(await page.locator('.nameplate').nth(1).locator('small').textContent(),'OpenRouter');
    assert.equal(await page.locator('.nameplate').nth(2).locator('small').textContent(),'DeepSeek');
    assert.equal(await page.locator('#roster .agent-status').nth(1).locator('span').textContent(),'Claude Code (OpenRouter)');
    assert.equal(await page.locator('body').textContent().then(s=>s.includes('CodeBuddy')),false);
    // All three residents must contribute nontransparent pixels, including the reading chair.
    await capture(page,'attic-idle');
    console.log('PASS 1920x1080 idle: 4x pixels fill one screen, thin readable bars, three leisure animations');
    mode='working';await page.waitForFunction(()=>window.officeDebug.snapshot().actors.every(a=>a.requested==='working'));
    assert((await read(page)).actors.some(a=>a.mode==='walk'));
    assert(await watchTravel(page,true)>0);await arrive(page,true);await checkFit(page);s=await read(page);
    assert(s.actors.every(a=>a.monitorOn&&Math.hypot(a.x-a.target.x,a.y-a.target.y)<.1));
    await checkBackground(page);
    const frames=s.actors.map(a=>a.frame);await sleep(270);
    assert((await read(page)).actors.some((a,i)=>frames[i]!==a.frame));
    await capture(page,'attic-work');
    console.log('PASS walking to own chairs, continuous movement, collision checks, typing and monitor wake');
    mode='idle';await page.waitForFunction(()=>window.officeDebug.snapshot().actors.every(a=>a.requested==='idle'));
    assert(await watchTravel(page,false)>0);await arrive(page,false);
    const changes=(await read(page)).actors.map(a=>a.idleChanges);
    await page.waitForFunction(changes=>{const actors=officeDebug.snapshot().actors;return actors.some((a,i)=>a.idleChanges>changes[i])&&actors.some(a=>a.mode==='walk');},changes,{timeout:45000});
    assert((await read(page)).actors.some(a=>a.mode==='walk'));
    await arrive(page,false);
    console.log('PASS leave work, randomly change leisure activity, walk to the next nook');
    for(const [provider,activeId] of [['deepseek','claude-code'],['openrouter','openrouter']]) {
      const payload=providerScenarios[provider];
      assert.deepEqual(payload.agents.filter(a=>a.status==='working').map(a=>a.id),[activeId]);
      mode=ids.map(id=>payload.agents.find(a=>a.id===id).status);
      await page.waitForFunction(activeId=>officeDebug.snapshot().actors.every(a=>
        a.requested===(a.id===activeId?'working':'idle')&&
        (a.id===activeId?a.mode==='type':a.mode!=='walk'&&a.mode!=='type')),activeId,{timeout:45000});
      const isolated=await read(page);
      assert.deepEqual(isolated.actors.filter(a=>a.monitorOn).map(a=>a.id),[activeId]);
      const plates=await page.locator('.nameplate').evaluateAll(els=>els.map(el=>el.classList.contains('working')));
      assert.deepEqual(plates,ids.map(id=>id===activeId));
      const states=await page.locator('#roster em').allTextContents();
      assert.deepEqual(states,ids.map(id=>id===activeId?'干活中':'摸鱼中'));
      await checkFit(page);
      await page.screenshot({path:path.join(TMP,`provider-${provider}.png`)});
      console.log(`PASS detector-to-page ${provider} only: one typing resident, one lit monitor, matching label and legend`);
    }
    mode=ids.map(id=>providerScenarios.both.agents.find(a=>a.id===id).status);
    await page.waitForFunction(()=>{const a=officeDebug.snapshot().actors;return a[0].requested==='idle'&&a.slice(1).every(a=>a.mode==='type');},null,{timeout:45000});
    assert.deepEqual((await read(page)).actors.filter(a=>a.monitorOn).map(a=>a.id),['openrouter','claude-code']);
    console.log('PASS both providers run independently at the same time');
    mode=['working','idle','working'];
    await page.waitForFunction(()=>{const a=window.officeDebug.snapshot().actors;return a[0].mode==='type'&&a[1].requested==='idle'&&a[2].mode==='type';},null,{timeout:45000});
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
    await startup.goto(`${BASE}/`);
    await startup.waitForFunction(()=>window.officeDebug?.snapshot().actors.length===3&&window.officeDebug.snapshot().actors.every(a=>a.requested==='working'));
    assert((await read(startup)).actors.some(a=>a.mode==='walk'));await arrive(startup,true);await startup.close();
    console.log('PASS first load with working status walks to work');
    mode='idle';await page.setViewportSize({width:1920,height:1080});
    await page.goto(`${BASE}/office/`,{waitUntil:'networkidle'});await arrive(page,false);
    for(const suffix of ['static/weather.js','static/office.js','static/office.css','static/assets/bg-c.png','static/assets/sprites/01-lin.png','static/assets/sprites/manifest.json','static/assets/layout.json','api/status'])
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
