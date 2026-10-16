/* Actual restarted service/status; only the weather clock is a browser fixture. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'D:/tools/PixelAgents/node_modules/playwright');
const {BASE}=require('./test-env.cjs'),capture=require('./capture.cjs');
const ROOT=path.resolve(__dirname,'..'),TMP=path.join(ROOT,'.browser-tmp');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.OFFICE_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',env:{...process.env,TEMP:TMP,TMP:TMP}});
 const evidence=[];
 try {
  for(const [name,width,height,time] of [
   ['final-day',1920,1080,'2026-10-15T01:00:00Z'],
   ['final-night',1920,1080,'2026-10-15T12:00:00Z'],
   ['final-narrow',1024,600,'2026-10-15T01:00:00Z'],
   ['final-hover',1920,1080,'2026-10-15T01:00:00Z'],
  ]) {
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
   await context.addInitScript(iso=>Date.now=()=>Date.parse(iso),time);
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(BASE+'/');
   await page.waitForFunction(()=>{
    const s=window.officeDebug?.snapshot();return s?.connected&&s.actors.every(a=>!a.route.length&&['type','tea','read','sleep'].includes(a.mode));
   },null,{timeout:60000});
   await page.mouse.move(width-5,20);
   let state=await page.evaluate(()=>officeDebug.snapshot());
   assert(state.actors.length<=6);
   assert(!state.actors.some(a=>a.id==='claude-code-other'&&a.requested==='idle'));
   assert.equal(await page.title(),'暖灯小阁 · 阁楼工作室');
   const night=name==='final-night';
   assert.equal(state.background,`static/assets/bg-c${night?'-night':''}.png`);
   assert.equal(await page.locator('#wrap').evaluate(e=>getComputedStyle(e).backgroundColor),night?'rgb(23, 26, 48)':'rgb(56, 43, 41)');
   const room=await page.locator('#game').boundingBox(),wrap=await page.locator('#wrap').boundingBox();
   const bar=await page.locator('#bar').boundingBox(),footer=await page.locator('#footer').boundingBox();
   assert.equal(wrap.y,bar.y+bar.height);assert.equal(wrap.y+wrap.height,footer.y);
   assert.equal(bar.height,56);assert.equal(footer.height,48);
   assert(Math.abs(room.x-wrap.x)<.1&&Math.abs(room.width-wrap.width)<.1&&room.y<=wrap.y&&room.y+room.height>=footer.y,'room fills the area between the independently laid-out bars');
   assert(Math.abs(room.width/room.height-480/270)<.001,'proportional scaling');
   for(const a of state.actors) {
    const b=a.body;
    assert(room.x+b.x*state.pixelScale>=wrap.x&&room.x+(b.x+b.w)*state.pixelScale<=wrap.x+wrap.width);
    assert(room.y+b.y*state.pixelScale>=wrap.y&&room.y+(b.y+b.h)*state.pixelScale<=footer.y,'residents stay fully visible');
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
   if(name==='final-hover'&&state.actors.length) {
    const id=state.actors.find(a=>a.id==='openrouter')?.id||state.actors[0].id;
    await page.locator(`[data-target="resident:${id}"]`).hover();
    const plate=await page.locator(`[data-actor="${id}"]`).boundingBox();
    assert(plate&&plate.x>=wrap.x&&plate.y>=wrap.y&&plate.x+plate.width<=wrap.x+wrap.width&&plate.y+plate.height<=footer.y);
   }
   state=await page.evaluate(()=>officeDebug.snapshot());
   const masks=await page.locator('.nameplate:not([hidden]),#bar,#footer').evaluateAll(els=>els.map(e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};}));
   fs.writeFileSync(path.join(TMP,name+'-masks.json'),JSON.stringify(masks));
   await capture(page,name);await page.screenshot({path:path.join(ROOT,'preview',name+'.png')});
   assert.deepEqual(errors,[]);
   evidence.push({name,viewport:{width,height},room,scale:state.pixelScale,background:state.background,weather:state.weather.kind,
    actors:state.actors.map(a=>({id:a.id,character:a.characterName,mode:a.mode,status:a.requested})),lifecycle:state.lifecycle});
   await context.close();console.log(`PASS ${name}: actual status, background, maximum room fit, bounded labels, no browser errors`);
  }
  fs.writeFileSync(path.join(TMP,'final-evidence.json'),JSON.stringify(evidence,null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
