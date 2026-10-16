/* Shared room/typography assertions for office behaviour and viewport checks. */
const assert=require('node:assert/strict');
const read=p=>p.evaluate(()=>window.officeDebug.snapshot());
const ids=['codex','openrouter','claude-code'];
const names=['Codex','Claude Code (OpenRouter)','Claude Code (DeepSeek)'];
async function arrive(page,work) {
  await page.waitForFunction(work=>{
    const s=window.officeDebug?.snapshot();return s?.connected&&s.actors.length===3&&s.actors.every(a=>a.requested===(work?'working':'idle')&&!a.route.length&&!a.pending&&
      (work?a.mode==='type':['sleep','tea','read'].includes(a.mode)));
  },work,{timeout:45000});
}
async function checkFit(page) {
  const s=await read(page),box=await page.locator('#game').boundingBox(),room=await page.locator('#wrap').boundingBox();
  assert(s.zoom>0);assert.equal(s.smoothing,false);
  assert(box.x>=room.x-.01&&box.x+box.width<=room.x+room.width+.01,'side workstations stay visible');
  assert.equal(await page.locator('#wrap').evaluate(e=>getComputedStyle(e).overflow),'hidden','only decorative edges are clipped by the room');
  assert(Math.abs(box.width/box.height-480/270)<.001,'room retains its aspect ratio');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
  const bars=await page.locator('#bar,#footer').evaluateAll(els=>els.map(el=>{
    const b=el.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};
  }));
  const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  const text=await page.locator('h1,.owner,#weather,#connection,#ts,.agent-status,.agent-status em,.local,.refresh').evaluateAll(els=>els.filter(el=>el.getClientRects().length).map(el=>{
    const b=el.getBoundingClientRect();return {size:parseFloat(getComputedStyle(el).fontSize),x:b.x,y:b.y,w:b.width,h:b.height};
  }));
  for(const t of text) {
    assert(t.size>=18,`bar text stays readable: ${t.size}px`);
    assert(t.w>0&&t.h>0&&t.x>=0&&t.y>=0&&t.x+t.w<=page.viewportSize().width+.01&&t.y+t.h<=page.viewportSize().height+.01,'bar text stays visible');
  }
  if(page.viewportSize().width===1920&&page.viewportSize().height===1080) {
    assert.equal(s.sample,1);assert.equal(s.pixelScale,4);
    assert(Math.abs(box.width-room.width)<.1&&box.y<=room.y&&box.y+box.height>=room.y+room.height,'room fills both dimensions between bars');
    assert.equal(room.y,56);assert.equal(room.height,976);
    assert.equal(await page.locator('h1').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)),28);
    assert.equal(bars[0].h,56,'desktop timber header');assert.equal(bars[1].h,48,'readable status tags');
  }
  for(const a of s.actors)assert(a.walkable,`${a.id} blocked ${a.x},${a.y}`);
  for(const p of s.spots)assert(p.walkable,`leisure destination blocked ${p.x},${p.y}`);
  // Resting rooms carry no billboard: a plate only exists while it is hovered
  // or pinned, so nothing here may sit over the art or the residents.
  const plates=await page.locator('.nameplate:not([hidden])').evaluateAll(els=>els.map(e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};}));
  assert.deepEqual(plates,[],'no nameplate is drawn until a resident is hovered or pinned');
  for(const a of s.actors) {
    const q={x:box.x+a.body.x*s.pixelScale,y:box.y+a.body.y*s.pixelScale,
      w:a.body.w*s.pixelScale,h:a.body.h*s.pixelScale};
    assert(bars.every(b=>!overlaps(q,b)),'bars must not cover residents');
  }
  for(const d of s.stations) {
    const screen={x:box.x+d.screen.x*s.pixelScale,y:box.y+d.screen.y*s.pixelScale,w:d.screen.w*s.pixelScale,h:d.screen.h*s.pixelScale};
    assert(bars.every(b=>!overlaps(screen,b)),'bars must not cover workstations');
  }
  if(page.viewportSize().width===1920) {
    const fonts=await page.locator('.nameplate strong,.nameplate small,.nameplate span').evaluateAll(els=>els.map(e=>parseFloat(getComputedStyle(e).fontSize)));
    assert(fonts.every(size=>size>=16),`readable name/subtitle/status: ${fonts}`);
  }
}

module.exports={read,arrive,checkFit,ids,names};
