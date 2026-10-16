/* Real pointer/keyboard interactions; status/time fixtures exist only in this browser. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'D:/tools/PixelAgents/node_modules/playwright');
const {BASE}=require('./test-env.cjs');
const ROOT=path.resolve(__dirname,'..'),TMP=path.join(ROOT,'.browser-tmp');fs.mkdirSync(TMP,{recursive:true});
const read=page=>page.evaluate(()=>officeDebug.snapshot());
const target=(page,id)=>page.locator(`[data-target="${id}"]`);
async function capture(page,name) {
  await page.mouse.move(1880,20);
  const masks=await page.locator('.nameplate,#bar,#footer,#interaction-note').evaluateAll(els=>els.filter(e=>!e.hidden).map(e=>{
    const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};
  }));
  await require('./capture.cjs')(page,name);
  await page.screenshot({path:path.join(ROOT,`preview/${name}.png`)});
  fs.writeFileSync(path.join(TMP,`${name}-masks.json`),JSON.stringify(masks));
}
async function settled(page,count=3,mode='type') {
  await page.waitForFunction(({count,mode})=>{
    const s=window.officeDebug?.snapshot();return s?.connected&&s.actors.length===count&&s.actors.every(a=>a.mode===mode)&&s.interactions?.targets===count+25;
  },{count,mode},{timeout:45000});
}
(async()=>{
  const browser=await chromium.launch({headless:true,env:{...process.env,TEMP:TMP,TMP:TMP},
    executablePath:process.env.OFFICE_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const errors=[],external=[];
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  let mode='working',failing=false,count=3;
  const tools=['Codex','Claude Code (OpenRouter)','Claude Code（DeepSeek）','新伙伴四','新伙伴五','新伙伴六'];
  const ids=['codex','openrouter','claude-code','four','five','six'];
  await context.addInitScript(()=>{Date.now=()=>Date.parse('2026-10-15T01:00:00Z');Math.random=()=>.01;});
  await context.route('**/api/status',route=>route.fulfill(failing?{status:503,body:'offline'}:{json:{ts:1792026000,
    agents:ids.slice(0,count).map((id,i)=>({id,name:tools[i],status:mode}))}}));
  await context.route('**/office/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/api/status'))return route.fulfill({json:{ts:1792026000,agents:[{id:'codex',name:'Codex',status:'working'}]}});
    url.pathname=url.pathname.replace(/^\/office\//,'/');await route.fulfill({response:await route.fetch({url:url.href})});
  });
  context.on('page',page=>{
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',req=>{if(!req.url().startsWith(BASE)&&!req.url().startsWith('data:'))external.push(req.url());});
  });
  const page=await context.newPage();
  try {
    await page.goto(`${BASE}/`);await settled(page);
    const first=await read(page);assert.equal(first.pixelScale,4);assert.equal(first.sample,1);
    await target(page,'resident:codex').click();
    await page.waitForFunction(()=>officeDebug.snapshot().interactions.selected==='codex');
    assert.match(await page.locator('#interaction-note').textContent(),/Codex.*干活中/);
    assert.match(await page.locator('#interaction-note').textContent(),/继续忙/);
    let s=await read(page);assert(s.actors.every(a=>a.monitorOn&&a.mode==='type'));
    assert(s.interactions.effects.some(e=>e.type==='heart'));
    await capture(page,'interaction-greeting');
    const frames=s.actors.map(a=>a.frame);await page.waitForTimeout(300);
    assert((await read(page)).actors.some((a,i)=>a.frame!==frames[i]),'greeting keeps typing animated');
    // Native buttons work with Tab/Enter/Space, including a complete provider name.
    await target(page,'resident:openrouter').focus();await page.keyboard.press('Enter');
    assert.match(await page.locator('#interaction-note strong').textContent(),/OpenRouter/);
    await page.keyboard.press('Escape');assert.equal(await page.locator('#interaction-note').isVisible(),false);
    await page.waitForFunction(()=>officeDebug.snapshot().interactions.effects.length===0,null,{timeout:4000});
    await target(page,'c-plant-1').focus();await page.keyboard.press('Space');
    s=await read(page);assert.equal(s.interactions.effects.filter(e=>e.type==='water').length,1);
    await capture(page,'interaction-watering');
    await target(page,'c-plant-1').click();
    assert.match(await page.locator('#interaction-note strong').textContent(),/刚刚浇过/);
    assert.equal((await read(page)).interactions.effects.filter(e=>e.type==='water').length,1);
    await page.waitForFunction(()=>officeDebug.snapshot().interactions.effects.length===0,null,{timeout:4000});
    await target(page,'c-tea-table').click();
    assert.match(await page.locator('#interaction-note strong').textContent(),/茶泡好/);
    assert((await read(page)).interactions.effects.some(e=>e.type==='tea'));
    await capture(page,'interaction-tea');
    for(let i=0;i<10;i++)await target(page,'c-tea-table').click();
    assert.match(await page.locator('#interaction-note strong').textContent(),/还温/);
    assert((await read(page)).interactions.effects.length<=8,'rapid clicks stay bounded');
    await page.waitForFunction(()=>officeDebug.snapshot().interactions.effects.length===0,null,{timeout:4000});
    await page.waitForTimeout(800); // Effects end before the watering cooldown.
    await target(page,'c-plant-4').click();
    assert.match(await page.locator('#interaction-note strong').textContent(),/楼梯左侧陶盆垂叶/);
    await page.locator('#interaction-note button').click();
    await page.waitForTimeout(3300);await target(page,'c-tea-table').click();
    assert.match(await page.locator('#interaction-note strong').textContent(),/茶泡好/);
    // Native Tab order reaches scenery and resident buttons without toolbar actions.
    await target(page,'c-tea-table').focus();await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.target),'resident:codex');
    const scenery=JSON.parse(fs.readFileSync(path.join(ROOT,'static/interaction-zones.json'),'utf8'));
    for(const plant of scenery.plants) {
      await page.keyboard.press('Escape');
      await target(page,plant.id).click();
      const state=await read(page);
      assert.equal(state.interactions.kind,'water',`${plant.id} has its own watering hit target`);
      assert(state.interactions.effects.some(e=>e.type==='water'&&e.id===plant.id));
    }
    await page.keyboard.press('Escape');
    console.log('PASS all 24 individual pots, including decorative children of table/desk rectangles');
    console.log('PASS pointer, keyboard, cooldowns, bounded effects, live typing and all scenery entrances');
    await target(page,'resident:codex').click();
    mode='idle';await page.waitForFunction(()=>officeDebug.snapshot().actors[0].requested==='idle'&&document.querySelector('#interaction-note strong').textContent.includes('摸鱼中'));
    assert.match(await page.locator('#interaction-note strong').textContent(),/摸鱼中/);
    assert.match(await target(page,'resident:codex').getAttribute('aria-label'),/摸鱼中/);
    failing=true;await page.waitForFunction(()=>!officeDebug.snapshot().connected);
    await target(page,'resident:codex').click();assert.match(await page.locator('#interaction-note strong').textContent(),/上次状态/);
    failing=false;mode='working';await settled(page);
    await target(page,'resident:codex').click();
    await page.waitForFunction(()=>!document.getElementById('interaction-note').hidden);
    await page.mouse.click(1200,620);assert.equal(await page.locator('#interaction-note').isVisible(),false);
    count=6;await settled(page,6);
    await target(page,'resident:six').click();assert.match(await page.locator('#interaction-note strong').textContent(),/新伙伴六/);
    count=3;await settled(page);assert.equal(await target(page,'resident:six').count(),0);
    assert.equal((await read(page)).interactions.selected,null);
    console.log('PASS polling changes, disconnection, reconnection, dismissal and six-person/removal sync');
    // Check projection after resizing, including minimum 32px touch targets.
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
    const box=await target(page,'resident:codex').boundingBox();assert(box.width>=32&&box.height>=32);
    await target(page,'c-plant-2').click();assert.match(await page.locator('#interaction-note strong').textContent(),/右下白盆虎尾兰/);
    const note=await page.locator('#interaction-note').boundingBox();assert(note.x>=0&&note.x+note.width<=390);
    await page.setViewportSize({width:1920,height:1080});await page.waitForTimeout(150);
    await page.emulateMedia({reducedMotion:'reduce'});await target(page,'c-tea-table').click();
    assert((await read(page)).interactions.effects.some(e=>e.type==='tea'));
    await page.mouse.move(0,0);
    const pixels=()=>page.locator('#game').evaluate(canvas=>Array.from(canvas.getContext('2d').getImageData(78,209,18,20).data));
    const staticTea=await pixels();await page.waitForTimeout(200);assert.deepEqual(await pixels(),staticTea,'reduced motion keeps tea steam static');
    await page.waitForFunction(()=>!officeDebug.snapshot().interactions.visible,null,{timeout:7000});
    console.log('PASS small-screen fit, scaled hit targets, reduced motion and auto-dismiss');
    const prefixed=await context.newPage();await prefixed.goto(`${BASE}/office/`);
    await settled(prefixed,1);await target(prefixed,'c-tea-table').click();
    assert.match(await prefixed.locator('#interaction-note strong').textContent(),/茶泡好/);await prefixed.close();
    // Fresh context: night weather plus tea still use the unchanged lighting engine.
    const nightContext=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
    await nightContext.addInitScript(()=>{Date.now=()=>Date.parse('2026-10-15T12:00:00Z');});
    await nightContext.route('**/api/status',r=>r.fulfill({json:{ts:Date.parse('2026-10-15T12:00:00Z')/1000,agents:ids.slice(0,3).map((id,i)=>({id,name:tools[i],status:'working'}))}}));
    const night=await nightContext.newPage();night.on('pageerror',e=>errors.push(e.message));
    await night.goto(`${BASE}/`);await settled(night);assert.equal((await read(night)).weather.kind,'night');
    await target(night,'c-tea-table').click();await capture(night,'interaction-night');await nightContext.close();
    assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
    console.log('PASS /office/ relative resources, night ambience and no external requests/errors');
  } catch(e) {
    fs.writeFileSync(path.join(TMP,'interaction-failure.json'),JSON.stringify(await read(page).catch(()=>({})),null,2));
    await page.screenshot({path:path.join(TMP,'interaction-failure.png')});throw e;
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
