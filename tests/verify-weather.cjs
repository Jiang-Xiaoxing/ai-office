/* Test time exists only in this browser context; production has no weather override. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'D:/tools/PixelAgents/node_modules/playwright');
const ROOT=path.resolve(__dirname,'..'),TMP=path.join(ROOT,'.browser-tmp');fs.mkdirSync(TMP,{recursive:true});
const ids=['codex','openrouter','claude-code'];
const times={sunny:'2026-10-15T01:00:00Z',cloudy:'2026-10-15T02:00:00Z',rain:'2026-10-15T03:00:00Z',snow:'2026-10-15T04:00:00Z',night:'2026-10-15T12:00:00Z'};
const read=p=>p.evaluate(()=>officeDebug.snapshot());
async function setTime(page,timestamp) {
  await page.evaluate(t=>{globalThis.__weatherTestTime=t;},timestamp);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function capture(page,name,final=false) {
  await page.screenshot({path:path.join(final?path.join(ROOT,'preview'):TMP,`${name}.png`)});
  if(final) {
    const masks=await page.locator('.nameplate,#bar,#footer').evaluateAll(els=>els.map(el=>{
      const b=el.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};
    }));
    fs.writeFileSync(path.join(TMP,`${name}-masks.json`),JSON.stringify(masks));
  }
}
async function pixelFrame(page) {
  return page.evaluate(()=>Array.from(document.querySelector('#game').getContext('2d').getImageData(0,0,480,270).data));
}
function inPane(x,y,polygons) {
  return polygons.some(poly=>{
    let hit=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
      const [xi,yi]=poly[i],[xj,yj]=poly[j];
      if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)hit=!hit;
    }
    return hit;
  });
}
(async()=>{
  const browser=await chromium.launch({headless:true,env:{...process.env,TEMP:TMP,TMP:TMP},
    executablePath:process.env.OFFICE_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try {
    // An American browser timezone must still open to the correct Beijing weather.
    const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,timezoneId:'America/Los_Angeles'});
    let work=false;
    await context.route('**/api/status',route=>route.fulfill({json:{ts:Math.floor(Date.now()/1000),agents:ids.map((id,i)=>({id,
      name:['Codex','Claude Code (OpenRouter)','Claude Code (DeepSeek)'][i],status:work?'working':'idle'}))}}));
    const errors=[];
    for(const [kind,iso] of Object.entries(times)) {
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      const t=Date.parse(iso);
      await page.addInitScript(t=>{globalThis.__weatherTestTime=t;Date.now=()=>globalThis.__weatherTestTime;Math.random=()=>.01;},t);
      await page.goto('http://127.0.0.1:8889/');
      await page.waitForFunction(()=>window.officeDebug?.snapshot().connected);
      let state=await read(page);
      assert.equal(state.weather.kind,kind);assert.equal(state.weather.weights[kind],1,'correct immediately, without initial fade');
      assert.equal(await page.locator('#weather').textContent(),state.weather.name);
      assert.equal(await page.locator('button,select,input').count(),0,'no manual switch');
      await page.reload();await page.waitForFunction(()=>window.officeDebug?.snapshot().connected);
      assert.equal((await read(page)).weather.kind,kind,'reload preserves the same hourly weather');
      await page.waitForFunction(()=>officeDebug.snapshot().actors.every(a=>['sleep','tea','read'].includes(a.mode)));
      await capture(page,`weather-${kind}`);
      if(kind==='rain'||kind==='snow') {
        const a=await pixelFrame(page);await setTime(page,t+350);const b=await pixelFrame(page);
        let moved=0;
        for(let y=20;y<50;y++)for(let x=90;x<390;x++) {
          const i=(y*480+x)*4;
          if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]) {
            moved++;assert(inPane(x+.5,y+.5,state.weather.panes),`particle escaped glass: ${x},${y}`);
          }
        }
        assert(moved>40,`${kind} particles animate: ${moved}`);
        await page.emulateMedia({reducedMotion:'reduce'});
        await setTime(page,t+600);const still=await pixelFrame(page);await setTime(page,t+1600);const still2=await pixelFrame(page);
        for(let y=20;y<50;y++)for(let x=90;x<390;x++) {
          const i=(y*480+x)*4;assert.deepEqual(still.slice(i,i+3),still2.slice(i,i+3),'reduced-motion keeps weather static');
        }
        await page.emulateMedia({reducedMotion:'no-preference'});
      }
      if(kind==='rain') {
        work=true;await page.waitForFunction(()=>officeDebug.snapshot().actors.every(a=>a.mode==='type'),null,{timeout:22000});
        state=await read(page);assert(state.actors.every(a=>a.walkable&&a.monitorOn));
        await capture(page,'attic-weather',true);work=false;
      }
      if(kind==='sunny') {
        const start=Date.parse(times.cloudy);await setTime(page,start);
        state=await read(page);assert.equal(state.weather.kind,'cloudy');assert.equal(state.weather.weights.sunny,1);
        await setTime(page,start+30000);state=await read(page);
        assert.equal(state.weather.weights.sunny,.5);assert.equal(state.weather.weights.cloudy,.5);
        await setTime(page,start+60000);state=await read(page);assert.equal(state.weather.weights.cloudy,1);
        // Jumping over hours (tab suspension) and returning across midnight remain valid.
        await setTime(page,Date.parse(times.night));await setTime(page,Date.parse(times.night)+60000);
        assert.equal((await read(page)).weather.weights.night,1);
        await setTime(page,Date.parse('2026-10-15T16:00:00Z'));
        assert.equal((await read(page)).weather.kind,'night');
      }
      if(kind==='night') {
        for(const size of [{width:390,height:844},{width:1366,height:768}]) {
          await page.setViewportSize(size);await page.waitForTimeout(100);
          const box=await page.locator('#game').boundingBox();
          assert(box.x>=0&&box.y>=0&&box.x+box.width<=size.width&&box.y+box.height<=size.height);
          assert.equal((await read(page)).smoothing,false);
        }
      }
      console.log(`PASS ${kind}: immediate Beijing selection, reload, rendering, ${kind==='rain'||kind==='snow'?'masked particles and reduced motion':'layout'}`);
      await page.close();
    }
    assert.deepEqual(errors,[]);await context.close();
    const live=await browser.newPage();await live.goto('http://127.0.0.1:8889/');
    await live.waitForFunction(()=>window.officeDebug?.snapshot().connected);
    const actual=await live.evaluate(()=>({state:officeDebug.snapshot().weather,expected:AtticWeather.weatherAt(Date.now())}));
    assert.equal(actual.state.kind,actual.expected.kind);await live.close();
    console.log('PASS live system time/status, smooth hourly transition and overnight resume; no browser exceptions');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
