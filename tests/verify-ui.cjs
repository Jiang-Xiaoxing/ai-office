/* Shared pixel UI, room-bounded crowding, density changes and delivery captures. */
const {BASE}=require('./test-env.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'D:/tools/PixelAgents/node_modules/playwright');
const ROOT=path.resolve(__dirname,'..'),TMP=path.join(ROOT,'.browser-tmp');
fs.mkdirSync(TMP,{recursive:true});
const overlap=(a,b,gap=0)=>a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;
async function geometry(page) {
  const result=await page.evaluate(()=>{
    const s=officeDebug.snapshot(),r=document.getElementById('game').getBoundingClientRect();
    const boxes=[...document.querySelectorAll('.nameplate')].map(el=>{
      const b=el.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};
    });
    const bodies=s.actors.map(a=>({x:r.x+(Math.round(a.x)-13)*s.pixelScale,
      y:r.y+(Math.round(a.y)-(a.mode==='type'?40:34))*s.pixelScale,w:26*s.pixelScale,h:36*s.pixelScale}));
    return {boxes,bodies,room:{x:r.x,y:r.y,w:r.width,h:r.height},s};
  });
  const {boxes,bodies,room,s}=result;
  assert.equal(boxes.length,s.actors.length);
  boxes.forEach((b,i)=>{
    assert(b.x>=room.x&&b.y>=room.y&&b.x+b.w<=room.x+room.w&&b.y+b.h<=room.y+room.h,'labels stay inside the rendered room: '+JSON.stringify({b,room,scale:s.pixelScale}));
    boxes.slice(i+1).forEach(q=>assert(!overlap(b,q,8),'nameplates keep at least 8px separation'));
    bodies.forEach(q=>assert(!overlap(b,q),'nameplates preserve resident sprites'));
    assert(Number.isInteger(b.x)&&Number.isInteger(b.y),'pixel-aligned nameplate');
    if(page.viewportSize().width>=1000) {
      assert(b.y+b.h<=bodies[i].y-8,'nameplate above its own head: '+JSON.stringify({b,body:bodies[i],id:s.actors[i].id}));
      const cx=room.x+Math.round(s.actors[i].x)*s.pixelScale;
      if(cx-b.w/2>=room.x+18*s.pixelScale&&cx+b.w/2<=room.x+466*s.pixelScale)
        assert(Math.abs(b.x+b.w/2-cx)<=Math.max(1,s.pixelScale),'nameplate centered over its resident');
    }
  });
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.OFFICE_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    env:{...process.env,TEMP:TMP,TMP:TMP}});
  try {
    for(const [name,size,date] of [
      ['ui-day',{width:1920,height:1080},'2026-10-15T01:00:00Z'],
      ['ui-night',{width:1920,height:1080},'2026-10-15T13:00:00Z'],
      ['ui-narrow',{width:1024,height:600},'2026-10-15T13:00:00Z'],
    ]) {
      const context=await browser.newContext({viewport:size,deviceScaleFactor:1});
      await context.addInitScript(date=>{Date.now=()=>Date.parse(date);Math.random=()=>.01;},date);
      let working=false,count=3;
      await context.route('**/api/status',route=>route.fulfill({json:{ts:Date.parse(date)/1000,
        agents:['codex','openrouter','claude-code','four','five','six'].slice(0,count).map((id,i)=>({id,name:['Codex','Claude Code (OpenRouter)','Claude Code (DeepSeek)','伙伴四','伙伴五','伙伴六'][i],status:working?'working':'idle'}))}}));
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(BASE+'/');
      await page.waitForFunction(()=>officeDebug?.snapshot().actors.length===3&&officeDebug.snapshot().actors.every(a=>['sleep','tea','read'].includes(a.mode)));
      await geometry(page);
      const s=await page.evaluate(()=>officeDebug.snapshot());
      assert.equal(s.pixelScale,size.width===1920?4:2);
      assert.equal(s.smoothing,false);
      assert.equal(await page.locator('body').getAttribute('data-time'),name==='ui-day'?'day':'night');
      assert.equal(await page.title(),'暖灯小阁 · 阁楼工作室');
      assert(!/姜小星|AI 办公室|仅限本机使用|每\s*3\s*秒同步/.test(await page.locator('body').textContent()));
      assert.equal(await page.locator('#water-plants,#brew-tea,.interaction-hint button').count(),0);
      assert.equal((await page.locator('#bar').boundingBox()).height,56);
      assert(await page.locator('h1').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=28));
      const typography=await page.locator('.owner,.interaction-hint span,.connection,#ts,.agent-status,.agent-status em').evaluateAll(els=>els.filter(e=>e.getClientRects().length).map(e=>parseFloat(getComputedStyle(e).fontSize)));
      assert(typography.every(n=>n>=18),'HUD text at least 18px');
      const labels=await page.locator('.nameplate strong,.nameplate small,.nameplate span').evaluateAll(els=>els.filter(e=>e.getClientRects().length).map(e=>parseFloat(getComputedStyle(e).fontSize)));
      assert(labels.every(n=>n>=16),'nameplates at least 16px');
      const header=await page.locator('#bar').evaluate(el=>{const b=el.getBoundingClientRect();return [...el.children].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,top:b.top,bottom:b.bottom};});});
      for(const r of header)assert(r.x>=0&&r.x+r.w<=size.width&&r.y>=r.top&&r.y+r.h<=r.bottom,'header stays in one row');
      assert(await page.locator('.office-icon').evaluate(e=>e.complete&&e.naturalWidth>0));
      const resident=page.locator('[data-target="resident:codex"]');
      await resident.hover();await resident.click();
      assert.equal(await resident.evaluate(e=>getComputedStyle(e).outlineStyle),'none');
      await page.waitForFunction(()=>document.querySelector('[data-actor="codex"]').classList.contains('selected'));
      await page.keyboard.press('Escape');await resident.focus();await page.keyboard.press('Enter');
      assert.equal(await resident.evaluate(e=>getComputedStyle(e).outlineStyle),'none');
      assert(await page.locator('#interaction-note').isVisible());await page.keyboard.press('Escape');
      for(const id of ['plant-left','plant-center','plant-right']) {
        await page.locator(`[data-target="${id}"]`).click();
        const effects=await page.evaluate(()=>officeDebug.snapshot().interactions.effects.filter(e=>e.type==='water'));
        assert(effects.some(e=>e.id===id));assert.equal(effects.filter(e=>e.id===id).length,1);
        await page.keyboard.press('Escape');
      }
      await page.locator('[data-target="tea-table"]').click();assert(await page.locator('#interaction-note').isVisible());await page.keyboard.press('Escape');
      await page.mouse.move(size.width-4,80);
      await page.evaluate(()=>document.activeElement?.blur());
      await page.waitForTimeout(2800);
      await geometry(page);
      const masks=await page.locator('.nameplate,#bar,#footer').evaluateAll(els=>els.map(el=>{
        const b=el.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};
      }));
      await page.screenshot({path:path.join(ROOT,'preview',name+'.png')});
      fs.writeFileSync(path.join(TMP,name+'-masks.json'),JSON.stringify(masks));
      // Exercise movement and repeated resize rather than only a single settled layout.
      working=true;
      await page.waitForFunction(()=>officeDebug.snapshot().actors.some(a=>a.mode==='walk'));
      for(let i=0;i<8;i++){await geometry(page);await page.waitForTimeout(180);}
      await page.waitForFunction(()=>officeDebug.snapshot().actors.every(a=>a.mode==='type'),null,{timeout:22000});
      await geometry(page);
      if(name==='ui-narrow') {
        for(const size of [{width:1000,height:600},{width:1024,height:600},{width:390,height:844},{width:1920,height:1080}]) {
          await page.setViewportSize(size);await page.waitForTimeout(150);await geometry(page);
        }
        count=6;await page.setViewportSize({width:1024,height:600});
        await page.waitForFunction(()=>officeDebug.snapshot().actors.length===6&&officeDebug.snapshot().actors.every(a=>a.mode==='type'),null,{timeout:22000});
        await geometry(page);working=false;
        await page.waitForFunction(()=>officeDebug.snapshot().actors.every(a=>['sleep','tea','read'].includes(a.mode)),null,{timeout:22000});
        await geometry(page);
      }
      assert.deepEqual(errors,[]);
      await context.close();console.log('PASS '+name+': timber HUD, head anchors, 8px gaps, pixel focus, scenery actions and movement');
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
