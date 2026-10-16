/* Repeated roster/weather changes and page lifecycle must retain bounded state. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'D:/tools/PixelAgents/node_modules/playwright');
const {BASE}=require('./test-env.cjs');
const TMP=path.resolve(__dirname,'../.browser-tmp');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.OFFICE_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',env:{...process.env,TEMP:TMP,TMP:TMP}});
 try {
  const page=await browser.newPage({viewport:{width:1024,height:600}}),errors=[],images=[];
  let revision=0;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/assets\/(bg-c.*|sprites\/.*)\.png$/.test(r.url()))images.push(r.url());});
  await page.route('**/api/status',r=>r.fulfill({json:{ts:1792026000,agents:Array.from({length:revision%2?6:3},(_,i)=>({id:`tool-${i}`,name:`伙伴 ${i+1} ${revision}`,status:revision%3?'working':'idle'}))}}));
  await page.addInitScript(()=>{globalThis.testTime=Date.parse('2026-10-15T01:00:00Z');Date.now=()=>globalThis.testTime;});
  await page.goto(BASE+'/');await page.waitForFunction(()=>officeDebug?.snapshot().connected);
  const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
  const metrics=async()=>{
   await cdp.send('HeapProfiler.collectGarbage');
   const {metrics}=await cdp.send('Performance.getMetrics');
   return Object.fromEntries(metrics.filter(m=>['JSHeapUsedSize','Nodes','JSEventListeners','Documents'].includes(m.name)).map(m=>[m.name,m.value]));
  };
  const samples=[];
  for(let i=0;i<36;i++) {
   revision++;
   await page.evaluate(i=>globalThis.testTime=Date.parse('2026-10-15T01:00:00Z')+i*3600000+60000,i);
   const n=await page.evaluate(()=>officeDebug.snapshot().polls);
   await page.waitForFunction(n=>officeDebug.snapshot().polls>n,n);
   await page.setViewportSize(i%2?{width:1024,height:600}:{width:1366,height:768});
   const s=await page.evaluate(()=>officeDebug.snapshot());
   assert(s.actors.length<=6);assert.equal(s.lifecycle.sheets,6);assert.equal(s.lifecycle.weatherBuilds,1);
   assert(s.interactions.targets<=31,'only current scenery and actors have buttons');
   if(i%6===5)samples.push(await metrics());
  }
  const first=samples[0],last=samples.at(-1);
  assert(last.JSHeapUsedSize-first.JSHeapUsedSize<2*1024*1024,JSON.stringify(samples));
  assert(last.Nodes<=first.Nodes+100,'detached DOM does not accumulate');
  assert(last.JSEventListeners<=first.JSEventListeners+6,'listeners stay bounded');
  assert.equal(last.Documents,first.Documents);
  assert.equal(images.length,8,'backgrounds and six sprite sheets load once');
  // BFCache suspension resumes a single loop; normal departure releases all owners.
  await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
  let state=await page.evaluate(()=>officeDebug.snapshot().lifecycle);
  assert(!state.animation&&!state.pollTimer&&!state.disposed);
  await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await page.waitForFunction(()=>officeDebug.snapshot().lifecycle.pollTimer);
  await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));
  state=await page.evaluate(()=>officeDebug.snapshot().lifecycle);
  assert(state.disposed&&!state.animation&&!state.pollTimer&&state.sheets===0);
  assert.equal(await page.locator('.interaction-target').count(),0);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(TMP,'memory-frontend.json'),JSON.stringify({seconds:108,samples,images:images.length,lifecycle:state},null,2));
  console.log(`PASS 108s roster/weather/resize soak: heap ${first.JSHeapUsedSize} -> ${last.JSHeapUsedSize}, nodes ${first.Nodes} -> ${last.Nodes}, listeners ${first.JSEventListeners} -> ${last.JSEventListeners}; 8 image loads; lifecycle released`);
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
