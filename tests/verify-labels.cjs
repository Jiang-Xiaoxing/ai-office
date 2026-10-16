const {BASE}=require('./test-env.cjs');
/* Regression for the hover nameplate and the head-level status icon: no
 * permanent billboard, live tracking while walking, room-bounded plates. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'D:/tools/PixelAgents/node_modules/playwright');
const ROOT=path.resolve(__dirname,'..'),TMP=path.join(ROOT,'.browser-tmp');fs.mkdirSync(TMP,{recursive:true});
const read=page=>page.evaluate(()=>officeDebug.snapshot());
const overlap=(a,b,gap=0)=>a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;
const target=(page,id)=>page.locator(`[data-target="${id}"]`);
const shown=page=>page.evaluate(()=>{
  const room=document.getElementById('game').getBoundingClientRect();
  const s=officeDebug.snapshot();
  const plates=[...document.querySelectorAll('.nameplate')].filter(el=>!el.hidden).map(el=>{
    const b=el.getBoundingClientRect();
    return {id:el.dataset.actor,x:b.x,y:b.y,w:b.width,h:b.height,text:el.textContent};
  });
  return {room:{x:room.x,y:room.y,w:room.width,h:room.height},plates,s,
    bodies:s.actors.map(a=>({id:a.id,x:room.x+a.body.x*s.pixelScale,
      y:room.y+a.body.y*s.pixelScale,w:a.body.w*s.pixelScale,h:a.body.h*s.pixelScale,
      head:room.y+a.body.y*s.pixelScale,
      cx:room.x+Math.round(a.x)*s.pixelScale}))};
});
async function assertPlates(page,expected) {
  const {room,plates,s,bodies}=await shown(page);
  assert.deepEqual([...s.nameplates.visible].sort(),[...expected].sort(),'debug snapshot matches the DOM');
  assert.deepEqual(plates.map(p=>p.id).sort(),[...expected].sort(),'only the asked-for plates are on screen');
  plates.forEach((p,i)=>{
    assert(p.x>=room.x&&p.y>=room.y&&p.x+p.w<=room.x+room.w&&p.y+p.h<=room.y+room.h,
      'plate stays inside the room: '+JSON.stringify({p,room,scale:s.pixelScale}));
    plates.slice(i+1).forEach(q=>assert(!overlap(p,q),'plates never overlap'));
    const body=bodies.find(b=>b.id===p.id);
    assert(p.y+p.h<=body.head+2,'plate sits above its own head: '+JSON.stringify({p,body}));
    // Decide from the centred position, not the already-clamped DOM box:
    // offsetWidth rounds 116.765625px to 117px at the 390px room edge.
    if(body.cx-p.w/2>=room.x+1&&body.cx+p.w/2<=room.x+room.w-1)
      assert(Math.abs(p.x+p.w/2-body.cx)<=s.pixelScale+1,'plate centres over its resident');
    else assert(body.cx>=p.x&&body.cx<=p.x+p.w,'edge-clamped plate still points at its resident');
  });
  return plates;
}
async function assertIcons(page) {
  const {room,s}=await shown(page);
  for(const a of s.actors) {
    assert.equal(a.icon.x,a.body.x+a.body.w+2,'icon sits just beside the sprite');
    assert(a.icon.x>=a.body.x+a.body.w||a.icon.x+a.icon.w<=a.body.x,'icon never covers its resident');
    assert(a.icon.x>=0&&a.icon.y>=0&&a.icon.x+a.icon.w<=s.width&&a.icon.y+a.icon.h<=s.height,
      'icon stays inside the room grid');
    const head=room.y+a.body.y*s.pixelScale;
    assert(Math.abs(room.y+a.icon.y*s.pixelScale-head)<=s.pixelScale*3,'icon rides at head height');
  }
  // The icon is really painted, and it is painted where the snapshot says.
  // Below a whole-number zoom the decimated canvas resamples every pixel, so
  // only the full 480x270 grid can be sampled pixel by pixel.
  if(s.sample!==1)return [];
  const painted=await page.evaluate(()=>{
    const s=officeDebug.snapshot(),c=document.getElementById('game').getContext('2d');
    return s.actors.map(a=>{
      const d=c.getImageData(a.icon.x,a.icon.y-4,a.icon.w,a.icon.h+4).data;
      let gold=0;for(let i=0;i<d.length;i+=4)if(d[i]===255&&d[i+1]===217&&d[i+2]===138)gold++;
      return {id:a.id,name:a.icon.name,gold};
    });
  });
  for(const p of painted)assert(p.gold>0,`${p.id} draws its ${p.name} icon`);
  return painted;
}
async function capture(page,name,dir=path.join(ROOT,'preview')) {
  await page.mouse.move(1900,20);
  assert.deepEqual((await shown(page)).plates,[],'captures record the resting room');
  const masks=await page.locator('.nameplate:not([hidden]),#bar,#footer').evaluateAll(els=>els.map(el=>{
    const b=el.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};
  }));
  await require('./capture.cjs')(page,name);
  await page.screenshot({path:path.join(dir,`${name}.png`)});
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
    // Resting room: icons only, the parchment plates stay out of the way.
    await assertPlates(page,[]);
    const icons=await assertIcons(page);
    assert.deepEqual(icons.map(i=>i.name).sort(),['book','cup','zzz'],'leisure states own their own icon');
    await capture(page,'tags-idle',TMP);
    // Hover pops one plate above its head, leaving it collapses again.
    await target(page,'resident:codex').hover();
    let plates=await assertPlates(page,['codex']);
    assert.match(plates[0].text,/Codex/);assert.match(plates[0].text,/打盹/);
    assert.match(plates[0].text,/^Codex打盹$/,'a provider-less resident keeps a single-line plate');
    await target(page,'resident:openrouter').hover();
    plates=await assertPlates(page,['openrouter']);
    assert.match(plates[0].text,/Claude CodeOpenRouter喝茶/,'provider stays on its own line');
    await page.mouse.move(1900,20);
    await assertPlates(page,[]);
    // Clicking pins a second plate: the two must not overlap or leave the room.
    await target(page,'resident:openrouter').click();
    await page.waitForFunction(()=>document.querySelector('[data-actor="openrouter"]').classList.contains('pinned'));
    await target(page,'resident:codex').hover();
    plates=await assertPlates(page,['codex','openrouter']);
    await page.screenshot({path:path.join(TMP,'tags-hover.png')});
    // A pinned plate follows the walker instead of waiting at the old desk.
    mode='working';
    await page.waitForFunction(()=>officeDebug.snapshot().actors.some(a=>a.mode==='walk'));
    let tracked=0;
    for(let i=0;i<12;i++) {
      const sample=await page.evaluate(()=>{
        const s=officeDebug.snapshot(),el=document.querySelector('.nameplate:not([hidden])');
        const b=el.getBoundingClientRect(),room=document.getElementById('game').getBoundingClientRect();
        const a=s.actors.find(a=>a.id===el.dataset.actor);
        return {id:a.id,walking:a.mode==='walk',actorX:a.x,bodyRight:a.body.x+a.body.w,plateX:b.x+b.width/2,
          iconX:a.icon.x,roomX:room.x,scale:s.pixelScale};
      });
      if(sample.walking) {
        tracked++;
        assert.equal(sample.iconX,sample.bodyRight+2,'icon follows the walker');
        assert(Math.abs(sample.plateX-(sample.roomX+Math.round(sample.actorX)*sample.scale))<=sample.scale+1,
          'pinned plate follows the walker: '+JSON.stringify(sample));
      }
      await page.waitForTimeout(60);
    }
    assert(tracked>0,'at least one walking sample covered the moving plate');
    // Clicking the resident again, or any empty spot, puts the plate away.
    await page.waitForFunction(()=>{
      const s=window.officeDebug.snapshot();return s.actors.length===3&&s.actors.every(a=>a.mode==='type');
    },null,{timeout:45000});
    assert(!await page.evaluate(()=>document.elementFromPoint(1200,620)?.dataset?.target?.startsWith('resident:')),
      'the middle of the floor stays free for a dismissal click');
    await target(page,'resident:openrouter').click();
    await assertPlates(page,[]);
    await target(page,'resident:codex').click();await page.waitForFunction(()=>officeDebug.snapshot().nameplates.visible.length===1);
    await page.mouse.click(1200,620);await assertPlates(page,[]);
    await target(page,'resident:codex').click();await page.waitForFunction(()=>officeDebug.snapshot().nameplates.visible.length===1);
    // Escape collapses a pin; the pointer still resting on the resident keeps it
    // hovered, so the plate only goes once the mouse steps away too.
    await page.keyboard.press('Escape');
    await page.mouse.move(1900,20);await assertPlates(page,[]);
    await capture(page,'attic-work');
    console.log('PASS hover/pin plates, walking tracking, dismissal and status icons in motion');
    failing=true;await page.waitForFunction(()=>!window.officeDebug.snapshot().connected);
    const notice=await page.locator('#notice').boundingBox(),footer=await page.locator('#footer').boundingBox();
    assert(notice.y+notice.height<footer.y,'reconnection notice stays above the footer');
    failing=false;
    await page.close();mode='idle';
    const mobile=await context.newPage();await mobile.setViewportSize({width:390,height:844});await mobile.goto(`${BASE}/`);
    await mobile.waitForFunction(()=>window.officeDebug?.snapshot().actors.every(a=>['sleep','tea','read'].includes(a.mode)),null,{timeout:30000});
    await assertIcons(mobile);
    for(const id of ['codex','openrouter','claude-code']) {
      await target(mobile,`resident:${id}`).click();
      await assertPlates(mobile,[id]);
      await target(mobile,`resident:${id}`).click();
      await mobile.mouse.move(2,2);await assertPlates(mobile,[]);
    }
    await mobile.mouse.move(2,2);
    await mobile.screenshot({path:path.join(TMP,'mobile-crowded.png')});
    console.log('PASS deterministic mobile crowding: every plate stays inside the narrow room');
    await context.close();
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
