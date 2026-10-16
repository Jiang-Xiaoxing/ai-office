/* Room edges, actual pointer alignment and hover labels on both target sizes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'D:/tools/PixelAgents/node_modules/playwright');
const {BASE}=require('./test-env.cjs');
const TMP=path.resolve(__dirname,'../.browser-tmp');
const zones=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../static/interaction-zones.json'),'utf8'));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.OFFICE_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',env:{...process.env,TEMP:TMP,TMP:TMP}});
 try {
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>Date.now=()=>Date.parse('2026-10-15T01:00:00Z'));
  await page.route('**/api/status',r=>r.fulfill({json:{ts:1792026000,agents:['codex','openrouter','claude-code','four','five','six'].map(id=>({id,name:id,status:'working'}))}}));
  await page.goto(BASE+'/');
  await page.waitForFunction(()=>officeDebug?.snapshot().actors.length===6&&officeDebug.snapshot().actors.every(a=>a.mode==='type'),null,{timeout:45000});
  for(const size of [{width:1920,height:1080},{width:1024,height:600}]) {
   await page.setViewportSize(size);
   await page.waitForFunction(w=>document.getElementById('game').getBoundingClientRect().width===w,size.width);
   const geometry=await page.evaluate(()=>{
    const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
    return {bar:box('bar'),footer:box('footer'),wrap:box('wrap'),game:box('game'),scroll:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight};
   });
   const {bar,footer,wrap,game}=geometry;
   assert.equal(bar.h,56);assert.equal(footer.h,48);
   assert.equal(wrap.y,bar.h);assert.equal(wrap.y+wrap.h,footer.y);
   assert(Math.abs(game.w/game.h-16/9)<.001,'same scale on both axes');
   assert(game.x<=wrap.x+.1&&game.x+game.w>=wrap.x+wrap.w-.1&&game.y<=wrap.y+.1&&game.y+game.h>=footer.y-.1,'all four room edges reach their frame');
   assert.equal(geometry.scroll,false);
   // Every supplied plant must have an actual visible, unoccluded pointer
   // position. This also detects shunted edge targets and wrong z-order.
   for(const zone of [...zones.plants,zones.teaTable]) {
    const point=await page.locator(`[data-target="${zone.id}"]`).evaluate(el=>{
     const r=el.getBoundingClientRect();
     for(let iy=1;iy<20;iy++)for(let ix=1;ix<20;ix++) {
      const x=r.x+r.width*ix/20,y=r.y+r.height*iy/20;
      if(document.elementFromPoint(x,y)===el)return {x,y};
     }
     return null;
    });
    assert(point,`visible pointer target ${zone.id} at ${size.width}`);
    await page.mouse.click(point.x,point.y);
    const effect=await page.evaluate(id=>officeDebug.snapshot().interactions.effects.find(e=>e.id===id),zone.id);
    assert(effect,`only the clicked object receives its effect: ${zone.id}`);
    assert.equal(effect.x,zone.effectX);assert.equal(effect.y,zone.effectY);
    await page.keyboard.press('Escape');
   }
   for(const id of ['codex','openrouter','claude-code','four','five','six']) {
    await page.locator(`[data-target="resident:${id}"]`).hover();
    const plate=await page.locator(`[data-actor="${id}"]`).boundingBox();
    assert(plate&&plate.x>=wrap.x&&plate.y>=wrap.y&&plate.x+plate.width<=wrap.x+wrap.w&&plate.y+plate.height<=footer.y,'hover remains inside the visible room');
   }
   await page.locator('#bar').hover();
   console.log(`PASS ${size.width}x${size.height}: four filled edges, independent bars, 24 plants + tea pointer targets, six bounded hover plates`);
   // A second viewport must exercise fresh clicks after the per-object cooldown.
   await page.waitForTimeout(3300);
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
