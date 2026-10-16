const {BASE}=require('./test-env.cjs');
/* Roster plumbing: reconnect, reorder, rename, safe text, overflow and the
   hidden-while-idle catch-all. The residents/room half lives in
   verify-dynamic.cjs; both files share tests/dynamic-lib.cjs. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'D:/tools/PixelAgents/node_modules/playwright');
const TMP=path.join(path.resolve(__dirname,'..'),'.browser-tmp');
const {configured,read,settled,check}=require('./dynamic-lib.cjs');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.OFFICE_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    env:{...process.env,TEMP:TMP,TMP:TMP},args:['--no-first-run','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  // Stable sunny art only; every roster below comes from the intercepted status.
  await context.addInitScript(()=>{Date.now=()=>Date.parse('2026-10-15T01:00:00Z');});
  const page=await context.newPage(),errors=[],warnings=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
  page.on('requestfailed',r=>requests.push({url:r.url(),error:r.failure()?.errorText}));
  try {
    const base=configured.map(t=>({id:t.id,name:t.name}));
    const extra=Array.from({length:5},(_,i)=>({id:`extra-${i}`,name:`工具 ${i+4}`}));
    let list=[...base,...extra],mode='working',fail=false;
    await context.route('**/api/status',r=>r.fulfill(fail?{status:503,body:'offline'}:
      {json:{ts:1792026000,agents:list.map(t=>({...t,status:mode}))}}));
    // A full working room is the state the reconnect check below starts from:
    // the offline snapshot must keep the residents it was already showing.
    await page.goto(`${BASE}/`);await settled(page,6,mode);await check(page,6);
    fail=true;await page.waitForFunction(()=>!officeDebug.snapshot().connected);assert.equal((await read(page)).actors.length,6);fail=false;
    list=[extra[0],base[2],base[0],base[1]];await settled(page,4,mode);const s=await check(page,4);
    assert.deepEqual(s.actors.map(a=>a.slot),[3,2,0,1],'legacy seats and looks survive reordered config');
    list=[{id:'brand-new',name:'<工具>（新名字）'}];await settled(page,1,mode);await check(page,1);
    assert.equal(await page.locator('.nameplate strong').textContent(),'<工具>');
    assert.equal(await page.locator('.nameplate small').textContent(),'新名字');
    // A backend model hint (e.g. the Flash model) must reach both the nameplate
    // subtitle and the footer name without disturbing the configured name. Both
    // lists below hold one tool, so wait for the next poll rather than a count change.
    const nextPoll=async()=>{const n=(await read(page)).polls;await page.waitForFunction(x=>officeDebug.snapshot().polls>x,n);};
    list=[{id:'flash',name:'Claude Code (DeepSeek)',detail:'Flash'}];await nextPoll();
    await settled(page,1,mode);await check(page,1);
    assert.equal(await page.locator('.nameplate strong').textContent(),'Claude Code');
    assert.equal(await page.locator('.nameplate small').textContent(),'DeepSeek · Flash');
    assert.equal(await page.locator('#roster .agent-status span').textContent(),'Claude Code (DeepSeek) · Flash');
    list=[{id:'plain',name:'Claude Code (DeepSeek)'}];await nextPoll();
    await settled(page,1,mode);await check(page,1);
    assert.equal(await page.locator('.nameplate small').textContent(),'DeepSeek','an absent hint adds no marker');
    list=[];await settled(page,0);await check(page,0);
    list=base;mode='working';await settled(page,base.length,mode);await check(page,base.length);
    list=[...base,...Array.from({length:97},(_,i)=>({id:`overflow-${i}`,name:`额外工具 ${i}`}))];
    await settled(page,6,mode);await check(page,6);
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(150);
    const box=await page.locator('#game').boundingBox();
    assert(box.width>0&&box.height>0&&box.x>=0&&box.y>=0&&box.x+box.width<=390&&box.y+box.height<=844);
    assert.equal(await page.locator('.agent-status').count(),base.length+97);
    await page.locator('#roster').evaluate(el=>{el.scrollLeft=el.scrollWidth;});
    assert(await page.locator('#roster').evaluate(el=>el.scrollLeft>0),'all narrow-screen statuses remain scrollable');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
    console.log(`PASS ${base.length+97} tools on a small screen: bounded footer, scrollable statuses and a visible room`);
    const delayed=await context.newPage(),aborted=[];
    delayed.on('requestfailed',r=>aborted.push(r.url()));
    await delayed.route('**/api/status',async r=>{
      await new Promise(resolve=>setTimeout(resolve,3500));
      await r.fulfill({json:{ts:1792026000,agents:base.map(t=>({...t,status:'working'}))}});
    });
    await delayed.goto(`${BASE}/`);await settled(delayed,base.length,'working');
    assert.deepEqual(aborted,[],'a cold process snapshot exceeding 2.5s is allowed to finish');
    await delayed.close();console.log('PASS slow first status response without aborted scans');
    // A catch-all "cannot tell which service" tool is a fallback, not a
    // person: it holds a seat and a status tag only while a session really
    // works there, so a resting room never shows a fourth "Claude Code".
    const fallback={id:'claude-code-other',name:'认不出服务的 Claude Code'};
    await page.setViewportSize({width:1920,height:1080});await page.waitForTimeout(150);
    list=[base[0],fallback];mode='idle';await settled(page,1,'idle');let room=await check(page,1);
    assert.deepEqual(room.actors.map(a=>a.id),['codex'],'an idle catch-all keeps out of the room');
    assert.deepEqual(room.tools.map(t=>t.id),['codex','claude-code-other']);
    assert.equal(await page.locator('.agent-status').count(),1,'the footer hides the idle catch-all too');
    assert.equal(await page.locator('#roster .agent-status span').textContent(),'Codex');
    assert(!warnings.some(w=>w.includes('claude-code-other')),'a hidden fallback is not reported as capacity overflow');
    mode='working';await settled(page,2,'working');room=await check(page,2);
    assert.deepEqual(room.actors.map(a=>a.id).sort(),['claude-code-other','codex'],'a busy catch-all earns a seat');
    mode='idle';await settled(page,1,'idle');await check(page,1);
    assert.equal(await page.locator('.agent-status').count(),1,'a catch-all disappears again when its session stops');
    console.log('PASS fallback catch-all: hidden while idle, seated and listed only while its session really works');
    list=base;mode='working';await settled(page,base.length,mode);await check(page,base.length);
    console.log('PASS reconnect, reorder, remove, rename, safe text rendering, empty config and repopulation');
    assert.deepEqual(errors,[]);
  } catch(error) {
    fs.writeFileSync(path.join(TMP,'dynamic-tools-failure.json'),JSON.stringify({...await read(page).catch(()=>({})),errors,requests},null,2));
    await page.screenshot({path:path.join(TMP,'dynamic-tools-failure.png')});throw error;
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
