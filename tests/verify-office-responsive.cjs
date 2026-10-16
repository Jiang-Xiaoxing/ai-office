/* Keep every responsive idle/work transition under its own 240s file budget. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'D:/tools/PixelAgents/node_modules/playwright');
const {BASE}=require('./test-env.cjs'),{read,arrive,checkFit,ids,names}=require('./office-lib.cjs');
const TMP=path.resolve(__dirname,'../.browser-tmp');
fs.mkdirSync(TMP,{recursive:true});
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.OFFICE_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless:true,env:{...process.env,TEMP:TMP,TMP:TMP},args:['--no-first-run','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  await context.addInitScript(()=>{Date.now=()=>Date.parse('2026-10-15T01:00:00Z');});
  let mode=['working','idle','working'];
  await context.route('**/api/status',r=>r.fulfill({json:{ts:1792026000,
    agents:ids.map((id,i)=>({id,name:names[i],status:Array.isArray(mode)?mode[i]:mode}))}}));
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.goto(BASE+'/');
    await page.waitForFunction(()=>officeDebug?.snapshot().actors.length===3&&
      officeDebug.snapshot().actors.every((a,i)=>!a.route.length&&!a.pending&&(i===1?a.requested==='idle':a.mode==='type')),
      null,{timeout:45000});
    for(const size of [{width:390,height:844},{width:320,height:740},{width:768,height:1024},{width:1366,height:768}]) {
      mode='idle';await page.setViewportSize(size);await arrive(page,false);await checkFit(page);
      if(size.width===390)await page.screenshot({path:path.join(TMP,'mobile-idle.png')});
      mode='working';await arrive(page,true);await checkFit(page);
      if(size.width===390)await page.screenshot({path:path.join(TMP,'mobile-work.png')});
      console.log(`PASS ${size.width}x${size.height}: fit, labels, all three idle/work destinations`);
    }

    assert.deepEqual(errors,[]);
  } catch(error) {
    fs.writeFileSync(path.join(TMP,'responsive-failure.json'),JSON.stringify(await read(page).catch(()=>({})),null,2));
    await page.screenshot({path:path.join(TMP,'responsive-failure.png')});throw error;
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
