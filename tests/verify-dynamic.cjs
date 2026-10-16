const {BASE}=require('./test-env.cjs');
/* Residents: config-driven looks, seats, leisure furniture, capacity and the
   narrow footer. The roster/fallback half lives in verify-dynamic-tools.cjs. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'D:/tools/PixelAgents/node_modules/playwright');
const ROOT=path.resolve(__dirname,'..'),TMP=path.join(ROOT,'.browser-tmp');
const {configured,FALLBACK,read,settled,check}=require('./dynamic-lib.cjs');
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
      // count varies, and an idle catch-all stays hidden, so it must
      // not stand in for a resident here or a second capacity warning would fire
      // before the overflow assertions below.
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
    }
    assert.deepEqual(errors,[]);
  } catch(error) {
    fs.writeFileSync(path.join(TMP,'dynamic-failure.json'),JSON.stringify({...await read(page).catch(()=>({})),errors,requests},null,2));
    await page.screenshot({path:path.join(TMP,'dynamic-failure.png')});throw error;
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
