const {BASE}=require('./test-env.cjs');
﻿/* Regression for readable labels when two residents share a nook. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'D:/tools/PixelAgents/node_modules/playwright');
const ROOT=path.resolve(__dirname,'..'),TMP=path.join(ROOT,'.browser-tmp');fs.mkdirSync(TMP,{recursive:true});
async function labelsFit(page) {
  const rects=await page.locator('.nameplate').evaluateAll(els=>els.map(el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};}));
  const size=page.viewportSize();
  const s=await page.evaluate(()=>window.officeDebug.snapshot()),room=await page.locator('#game').boundingBox();
  rects.forEach((a,i)=>{
    assert(a.x>=0&&a.y>=0&&a.x+a.w<=size.width&&a.y+a.h<=size.height);
    rects.slice(i+1).forEach(b=>assert(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y),'labels overlap'));
    s.actors.forEach(resident=>{
      const b={x:room.x+(Math.round(resident.x)-13)*s.pixelScale,
        y:room.y+(Math.round(resident.y)-(resident.mode==='type'?40:34))*s.pixelScale,
        w:26*s.pixelScale,h:36*s.pixelScale};
      assert(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y),'label covers a resident');
    });
  });
}
async function capture(page,name) {
  assert.equal(await page.locator('.nameplate').count(),3,'capture must include every resident label');
  const masks=await page.locator('.nameplate,#bar,#footer').evaluateAll(els=>els.map(el=>{
    const b=el.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};
  }));
  await page.screenshot({path:path.join(ROOT,`preview/${name}.png`)});
  fs.writeFileSync(path.join(TMP,`${name}-masks.json`),JSON.stringify(masks));
}
(async()=>{
  const browser=await chromium.launch({headless:true,env:{...process.env,TEMP:TMP,TMP:TMP},
    executablePath:process.env.OFFICE_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try {
    let mode='idle',failing=false;const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
    await context.route('**/api/status',route=>route.fulfill(failing?{status:503,body:'unavailable'}:
      {json:{ts:Math.floor(Date.now()/1000),agents:['codex','openrouter','claude-code'].map((id,i)=>({id,
        name:['Codex','Claude Code (OpenRouter)','Claude Code (DeepSeek)'][i],status:mode}))}}));
    await context.addInitScript(()=>{Math.random=()=>.01;Date.now=()=>Date.parse('2026-10-15T01:00:00Z');});
    const page=await context.newPage();await page.goto(`${BASE}/`);
    await page.waitForFunction(()=>{
      const s=window.officeDebug?.snapshot();
      return s?.connected&&s.actors.length===3&&s.actors.every(a=>['sleep','tea','read'].includes(a.mode));
    });
    await labelsFit(page);await capture(page,'attic-idle');
    mode='working';await page.waitForFunction(()=>{
      const s=window.officeDebug.snapshot();return s.connected&&s.actors.length===3&&s.actors.every(a=>a.mode==='type');
    },null,{timeout:22000});
    await labelsFit(page);await capture(page,'attic-work');
    console.log('PASS final desktop idle/work screenshots from latest code');
    failing=true;await page.waitForFunction(()=>!window.officeDebug.snapshot().connected);
    const notice=await page.locator('#notice').boundingBox(),footer=await page.locator('#footer').boundingBox();
    assert(notice.y+notice.height<footer.y,'reconnection notice stays above the footer');
    failing=false;
    await page.close();mode='idle';
    const mobile=await context.newPage();await mobile.setViewportSize({width:390,height:844});await mobile.goto(`${BASE}/`);
    await mobile.waitForFunction(()=>window.officeDebug?.snapshot().actors.filter(a=>a.mode==='sleep').length>=2,null,{timeout:30000});
    await labelsFit(mobile);await mobile.screenshot({path:path.join(TMP,'mobile-crowded.png')});
    console.log('PASS deterministic mobile crowding: two sleeping residents, readable nonoverlapping labels');
    await context.close();
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
