/* Headless acceptance tests. Reuse an existing local Playwright installation:
 * node tests/verify-office.cjs
 * Override PLAYWRIGHT_MODULE / OFFICE_BROWSER if installed elsewhere.
 * All mock responses exist only inside this browser context.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'D:/tools/PixelAgents/node_modules/playwright');
const ROOT = path.resolve(__dirname, '..');
const temp = path.join(ROOT, '.browser-tmp');
fs.mkdirSync(temp, { recursive: true });
const read = page => page.evaluate(() => window.officeDebug.snapshot());
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const ids = ['codex', 'codebuddy', 'claude-code'];
const names = ['Codex', 'CodeBuddy', 'Claude Code'];
function status(mode) {
  return { ts: Math.floor(Date.now()/1000), agents: ids.map((id,i) => ({ id, name:names[i], status: typeof mode==='string'?mode:mode[i] })) };
}
async function settle(page, target) {
  await page.waitForFunction(target => window.officeDebug.snapshot().actors.every(a => a.mode === target), target, { timeout: 30000 });
}
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.OFFICE_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true, env: {...process.env, TEMP:temp, TMP:temp},
    args: ['--no-first-run','--disable-background-networking'],
  });
  const context = await browser.newContext({ viewport:{width:1440,height:900},deviceScaleFactor:1 });
  const page = await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let mode = 'idle', failing = false, statusCalls = [];
  await context.route('**/api/status', route => {
    statusCalls.push({ url:route.request().url(), time:Date.now() });
    if(failing)return route.fulfill({status:503,body:'unavailable'});
    return route.fulfill({json:status(mode)});
  });
  // Simulate only the site's path stripping, retaining real HTTP asset requests.
  // The existing authenticated small-site proxy is checked separately.
  await context.route('**/office/**', async route => {
    const u=new URL(route.request().url());
    if(u.pathname.endsWith('/api/status')) {
      statusCalls.push({url:u.href,time:Date.now()});
      return route.fulfill({json:status(mode)});
    }
    u.pathname=u.pathname.replace(/^\/office\//,'/');
    const response=await route.fetch({url:u.href});await route.fulfill({response});
  });
  async function checkWorkingStartup() {
    mode='working';
    const startupPage=await context.newPage();
    try {
      await startupPage.goto('http://127.0.0.1:8889/',{waitUntil:'networkidle'});
      await startupPage.waitForFunction(()=>window.officeDebug?.snapshot().actors.every(a=>a.requested==='working'));
      assert((await read(startupPage)).actors.some(a=>a.mode==='walk'),'initial active status must walk to work');
      await settle(startupPage,'type');
      for(const a of (await read(startupPage)).actors)assert(Math.hypot(a.x-a.target.x,a.y-a.target.y)<1);
      console.log('PASS first page load with active tools walks to desks without teleporting');
    } finally {await startupPage.close();}
  }
  try {
    if(process.env.OFFICE_SITE_AUTH) {
      const live = await browser.newContext({viewport:{width:1440,height:900},extraHTTPHeaders:{Authorization:process.env.OFFICE_SITE_AUTH}});
      const sitePage = await live.newPage();
      const resources=[];const siteErrors=[];
      sitePage.on('response',r=>{if(r.url().includes('/office/'))resources.push({path:new URL(r.url()).pathname,status:r.status()});});
      sitePage.on('pageerror',e=>siteErrors.push(e.message));
      const response = await sitePage.goto('http://127.0.0.1:8888/office/',{waitUntil:'networkidle'});
      assert.equal(response.status(),200);
      await sitePage.waitForFunction(()=>window.officeDebug?.snapshot().connected);
      assert.equal(await sitePage.locator('#loading').isVisible(),false);
      for(const suffix of ['static/office.js','static/office.css','static/assets/office-atlas.png','static/assets/office-atlas.json','api/status'])
        assert(resources.some(r=>r.path===`/office/${suffix}`&&r.status===200),`actual site resource ${suffix}`);
      assert.deepEqual(siteErrors,[]);
      console.log('PASS actual authenticated small-site /office/ page, assets and live API');
      await live.close();
      if(process.env.OFFICE_LIVE_SITE_ONLY==='1')return;
    }
    if(process.env.OFFICE_STARTUP_ONLY==='1'){await checkWorkingStartup();return;}
    await page.goto('http://127.0.0.1:8889/',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.officeDebug?.snapshot().ready);
    await settle(page,'tea');
    let s=await read(page);assert.equal(s.smoothing,false);assert.equal(s.zoom,2);
    assert.equal(new Set(s.actors.map(a=>`${a.x},${a.y}`)).size,3);
    const f=s.actors[0].frame;await sleep(800);assert.notEqual((await read(page)).actors[0].frame,f);
    await page.screenshot({path:path.join(ROOT,'preview/final-idle.png')});
    console.log('PASS desktop idle, separate positions, animated tea, integer scaling');

    mode='working';
    await page.waitForFunction(()=>window.officeDebug.snapshot().actors.every(a=>a.requested==='working'));
    s=await read(page);assert(s.actors.some(a=>a.mode==='walk'));
    const atStart=s.actors.map(a=>({x:a.x,y:a.y}));
    await sleep(250);s=await read(page);
    assert(s.actors.some((a,i)=>Math.hypot(a.x-atStart[i].x,a.y-atStart[i].y)>1));
    assert(s.actors.every((a,i)=>Math.hypot(a.x-atStart[i].x,a.y-atStart[i].y)<18),'must walk, never teleport');
    const directions=new Set();
    for(let i=0;i<180;i++) {
      s=await read(page);
      s.actors.forEach(a=>{if(a.mode==='walk')directions.add(a.dir);assert(a.walkable,`${a.id} collided at ${a.x},${a.y}`);});
      if(s.actors.every(a=>a.mode==='type'))break;
      await sleep(100);
    }
    await settle(page,'type');s=await read(page);
    for(const a of s.actors)assert(Math.hypot(a.x-a.target.x,a.y-a.target.y)<1);
    const typing=s.actors.map(a=>a.frame);await sleep(220);
    assert((await read(page)).actors.some((a,i)=>a.frame!==typing[i]));
    await page.screenshot({path:path.join(ROOT,'preview/final-work.png')});
    console.log('PASS idle → work, animated walk, collision-free routes, own desks, animated typing', [...directions]);

    mode='idle';await page.waitForFunction(()=>window.officeDebug.snapshot().actors.every(a=>a.requested==='idle'));
    assert((await read(page)).actors.some(a=>a.mode==='walk'));
    await settle(page,'tea');
    await page.waitForFunction(()=>window.officeDebug.snapshot().actors.some(a=>a.mode==='walk'),null,{timeout:14000});
    console.log('PASS work → idle, return walk and autonomous leisure wandering');

    mode=['working','idle','working'];
    await page.waitForFunction(()=>{const a=window.officeDebug.snapshot().actors;return a[0].mode==='type'&&a[1].requested==='idle'&&a[2].mode==='type';},null,{timeout:30000});
    failing=true;await page.waitForFunction(()=>!window.officeDebug.snapshot().connected);
    assert.equal((await read(page)).actors[0].requested,'working');
    assert(await page.locator('#notice').isVisible());
    failing=false;await page.waitForFunction(()=>window.officeDebug.snapshot().connected);
    console.log('PASS mixed states, API failure preserves last status, retry recovery');

    for(const viewport of [{width:390,height:844},{width:320,height:740},{width:768,height:1024},{width:1920,height:1080}]) {
      mode='idle';await page.setViewportSize(viewport);
      await page.waitForFunction(()=>window.officeDebug.snapshot().actors.every(a=>a.requested==='idle'));
      await settle(page,'tea');s=await read(page);
      assert.equal(s.smoothing,false);assert(Number.isInteger(s.zoom));
      const bounds=await page.locator('#game').boundingBox();
      const roomBounds=await page.locator('#wrap').boundingBox();
      assert(bounds.x>=roomBounds.x&&bounds.y>=roomBounds.y&&bounds.x+bounds.width<=roomBounds.x+roomBounds.width&&bounds.y+bounds.height<=roomBounds.y+roomBounds.height,'canvas must fit the viewport');
      for(const a of s.actors)assert(a.x>12&&a.x<s.width-12&&a.y<s.height-28);
      if(viewport.width===390)await page.screenshot({path:path.join(temp,'mobile-idle.png')});
      mode='working';await page.waitForFunction(()=>window.officeDebug.snapshot().actors.every(a=>a.requested==='working'));
      await settle(page,'type');
      for(const a of (await read(page)).actors)assert(Math.hypot(a.x-a.target.x,a.y-a.target.y)<1);
      if(viewport.width===390)await page.screenshot({path:path.join(temp,'mobile-work.png')});
      console.log(`PASS responsive ${viewport.width}x${viewport.height}: idle/work, all destinations reachable`);
    }
    await checkWorkingStartup();
    mode='idle';await page.setViewportSize({width:1440,height:900});
    await page.goto('http://127.0.0.1:8889/office/',{waitUntil:'networkidle'});
    await settle(page,'tea');
    assert(statusCalls.some(c=>c.url.includes('/office/api/status')));
    assert.equal(await page.locator('#loading').isVisible(),false);
    console.log('PASS /office/ relative script, stylesheet, atlas and API URLs');
    const intervals=statusCalls.filter(c=>!c.url.includes('/office/')).slice(1,8).map((c,i)=>c.time-statusCalls[i].time);
    assert(intervals.every(t=>t>2700&&t<3400),`3-second refresh: ${intervals}`);
    assert.deepEqual(errors,[]);
    console.log('PASS 3-second status polling and no browser exceptions');
  } catch(error) {
    fs.writeFileSync(path.join(temp,'failure.json'),JSON.stringify(await read(page).catch(()=>({error:error.message})),null,2));
    await page.screenshot({path:path.join(temp,'failure.png')});
    throw error;
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
