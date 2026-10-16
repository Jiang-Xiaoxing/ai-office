/* Shared pixel UI, room-bounded crowding, density changes and delivery captures. */
const {BASE}=require('./test-env.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'D:/tools/PixelAgents/node_modules/playwright');
const ROOT=path.resolve(__dirname,'..'),TMP=path.join(ROOT,'.browser-tmp');
fs.mkdirSync(TMP,{recursive:true});
const overlap=(a,b,gap=0)=>a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;
async function roomState(page) {
  return page.evaluate(()=>{
    const s=officeDebug.snapshot(),r=document.getElementById('game').getBoundingClientRect();
    const box=el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};};
    return {s,room:{x:r.x,y:r.y,w:r.width,h:r.height},
      plates:[...document.querySelectorAll('.nameplate')].filter(el=>!el.hidden).map(el=>({...box(el),id:el.dataset.actor})),
      bodies:s.actors.map(a=>({id:a.id,x:r.x+a.body.x*s.pixelScale,
        y:r.y+a.body.y*s.pixelScale,w:a.body.w*s.pixelScale,h:a.body.h*s.pixelScale,
        cx:r.x+Math.round(a.x)*s.pixelScale}))};
  });
}
function checkIcons({s,room,bodies}) {
  assert.equal(s.actors.length,bodies.length);
  for(const a of s.actors) {
    const body=bodies.find(b=>b.id===a.id);
    assert(a.icon,`${a.id} wears a head-level status icon`);
    assert(a.icon.w>0&&a.icon.h>0&&a.icon.x>=0&&a.icon.y>=0&&a.icon.x+a.icon.w<=s.width&&a.icon.y+a.icon.h<=s.height,
      'status icon stays inside the room grid');
    assert(a.icon.x>=a.body.x+a.body.w||a.icon.x+a.icon.w<=a.body.x,'status icon never covers its resident');
    assert(Math.abs(room.y+a.icon.y*s.pixelScale-body.y)<=s.pixelScale*3,'status icon rides at the resident head');
  }
}
function checkPlates(page,{s,room,bodies,plates},expected) {
  assert.deepEqual(plates.map(p=>p.id).sort(),[...expected].sort(),'only the asked-for plates are on screen');
  plates.forEach((p,i)=>{
    assert(p.x>=room.x&&p.y>=room.y&&p.x+p.w<=room.x+room.w&&p.y+p.h<=room.y+room.h,'labels stay inside the rendered room: '+JSON.stringify({p,room,scale:s.pixelScale}));
    plates.slice(i+1).forEach(q=>assert(!overlap(p,q,8),'nameplates keep at least 8px separation'));
    bodies.forEach(q=>assert(!overlap(p,q),'nameplates preserve resident sprites'));
    assert(Number.isInteger(p.x)&&Number.isInteger(p.y),'pixel-aligned nameplate');
    if(page.viewportSize().width>=1000) {
      const body=bodies.find(b=>b.id===p.id);
      assert(p.y+p.h<=body.y-8,'nameplate above its own head: '+JSON.stringify({p,body,id:p.id}));
      if(body.cx-p.w/2>=room.x+18*s.pixelScale&&body.cx+p.w/2<=room.x+466*s.pixelScale)
        assert(Math.abs(p.x+p.w/2-body.cx)<=Math.max(1,s.pixelScale),'nameplate centered over its resident');
    }
  });
}
// Resting rooms show no billboard at all: only the small status icon travels
// with each resident until the pointer asks for a nameplate.
async function geometry(page) {
  const state=await roomState(page);
  checkIcons(state);
  checkPlates(page,state,[]);
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
      assert(Math.abs(s.pixelScale-size.width/480)<.001);
      const frame=await page.locator('#wrap').boundingBox(),art=await page.locator('#game').boundingBox();
      assert(Math.abs(art.x-frame.x)<.1&&Math.abs(art.width-frame.width)<.1&&art.y<=frame.y&&art.y+art.height>=frame.y+frame.height,'no large page-colour strips around the room');
      assert.equal(s.smoothing,false);
      assert.equal(await page.locator('body').getAttribute('data-time'),name==='ui-day'?'day':'night');
      assert.equal(await page.title(),'暖灯小阁 · 阁楼工作室');
      assert(!/姜小星|AI 办公室|仅限本机使用|每\s*3\s*秒同步/.test(await page.locator('body').textContent()));
      assert.equal(await page.locator('#water-plants,#brew-tea,.interaction-hint button').count(),0);
      assert.equal((await page.locator('#bar').boundingBox()).height,56);
      assert(await page.locator('h1').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=28));
      const typography=await page.locator('.owner,.interaction-hint span,.connection,#ts,.agent-status,.agent-status em').evaluateAll(els=>els.filter(e=>e.getClientRects().length).map(e=>parseFloat(getComputedStyle(e).fontSize)));
      assert(typography.every(n=>n>=18),'HUD text at least 18px');
      // A plate only exists while it is asked for, so hover one to read it.
      await page.waitForFunction(()=>officeDebug.snapshot().actors.every(a=>a.mode!=='walk'));
      await page.locator('[data-target="resident:codex"]').hover();
      const labels=await page.locator('.nameplate strong,.nameplate small,.nameplate span').evaluateAll(els=>els.filter(e=>e.getClientRects().length).map(e=>parseFloat(getComputedStyle(e).fontSize)));
      assert(labels.length>=2&&labels.every(n=>n>=16),'nameplates at least 16px');
      checkPlates(page,await roomState(page),['codex']);
      await page.mouse.move(size.width-4,20);
      checkPlates(page,await roomState(page),[]);
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
      for(const id of ['c-plant-1','c-plant-4','c-plant-2']) {
        await page.locator(`[data-target="${id}"]`).click();
        const effects=await page.evaluate(()=>officeDebug.snapshot().interactions.effects.filter(e=>e.type==='water'));
        assert(effects.some(e=>e.id===id));assert.equal(effects.filter(e=>e.id===id).length,1);
        await page.keyboard.press('Escape');
      }
      await page.locator('[data-target="c-tea-table"]').click();assert(await page.locator('#interaction-note').isVisible());await page.keyboard.press('Escape');
      // Park the pointer on the header strip: no resident can sit under it, so
      // the resting-room checks and the delivery screenshot stay plate-free.
      await page.mouse.move(size.width-4,20);
      await page.evaluate(()=>document.activeElement?.blur());
      await page.waitForTimeout(2800);
      await geometry(page);
      const masks=await page.locator('.nameplate:not([hidden]),#bar,#footer').evaluateAll(els=>els.map(el=>{
        const b=el.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};
      }));
      await require('./capture.cjs')(page,name);
      await page.screenshot({path:path.join(ROOT,'preview',name+'.png')});
      fs.writeFileSync(path.join(TMP,name+'-masks.json'),JSON.stringify(masks));
      // Exercise movement and repeated resize rather than only a single settled layout.
      working=true;
      await page.waitForFunction(()=>officeDebug.snapshot().actors.some(a=>a.mode==='walk'));
      for(let i=0;i<8;i++){await geometry(page);await page.waitForTimeout(180);}
      await page.waitForFunction(()=>officeDebug.snapshot().actors.every(a=>a.mode==='type'),null,{timeout:45000});
      await geometry(page);
      if(name==='ui-narrow') {
        for(const size of [{width:1000,height:600},{width:1024,height:600},{width:390,height:844},{width:1920,height:1080}]) {
          await page.setViewportSize(size);await page.waitForTimeout(150);await geometry(page);
        }
        count=6;await page.setViewportSize({width:1024,height:600});
        await page.waitForFunction(()=>officeDebug.snapshot().actors.length===6&&officeDebug.snapshot().actors.every(a=>a.mode==='type'),null,{timeout:45000});
        await geometry(page);working=false;
        await page.waitForFunction(()=>officeDebug.snapshot().actors.every(a=>['sleep','tea','read'].includes(a.mode)),null,{timeout:45000});
        await geometry(page);
      }
      assert.deepEqual(errors,[]);
      await context.close();console.log('PASS '+name+': timber HUD, head anchors, 8px gaps, pixel focus, scenery actions and movement');
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
