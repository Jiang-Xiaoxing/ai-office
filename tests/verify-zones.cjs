/* Reconfigure hit boxes and effect origin only in this browser, proving JSON owns coordinates. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {BASE}=require('./test-env.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'D:/tools/PixelAgents/node_modules/playwright');
const zones=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../static/interaction-zones.json'),'utf8'));
zones.plants[0]={...zones.plants[0],x:156,y:138,w:20,h:24};
Object.assign(zones.teaTable,{x:250,y:190,w:20,h:20,effectX:257,effectY:195});
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:process.env.OFFICE_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try {
  const p=await b.newPage({viewport:{width:1920,height:1080}});
  await p.route('**/static/interaction-zones.json',r=>r.fulfill({json:zones}));
  await p.route('**/api/status',r=>r.fulfill({json:{ts:1792026000,agents:[{id:'codex',name:'Codex',status:'idle'}]}}));
  await p.goto(BASE+'/');await p.waitForFunction(()=>officeDebug?.snapshot().interactions?.targets===5);
  const plant=p.locator('[data-target="plant-left"]'),box=await plant.boundingBox();
  assert.equal(box.x,156*4);assert.equal(box.y,138*4);assert.equal(box.width,80);assert.equal(box.height,96);
  await plant.click();
  let effects=await p.evaluate(()=>officeDebug.snapshot().interactions.effects);
  assert.deepEqual(effects.filter(e=>e.type==='water').map(e=>e.id),['plant-left']);
  assert.equal(effects[0].x,166);assert.equal(effects[0].y,147);
  await p.keyboard.press('Escape');await p.locator('[data-target="tea-table"]').click();
  effects=await p.evaluate(()=>officeDebug.snapshot().interactions.effects);
  const tea=effects.find(e=>e.type==='tea');assert.equal(tea.x,257);assert.equal(tea.y,195);
  console.log('PASS JSON-configured plant/table hit boxes, one-pot water and relocated tea effect');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
