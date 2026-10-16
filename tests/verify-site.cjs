/* Read-only check through the configured authenticated proxy (private site by default).
 * OFFICE_SITE_AUTH is passed in memory by the local operator, never saved here.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'D:/tools/PixelAgents/node_modules/playwright');
(async()=>{
  assert(process.env.OFFICE_SITE_AUTH,'An existing site gateway credential is required');
  const temp=path.resolve(__dirname,'../.browser-tmp');fs.mkdirSync(temp,{recursive:true});
  const browser=await chromium.launch({headless:true,env:{...process.env,TEMP:temp,TMP:temp},
    executablePath:process.env.OFFICE_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try {
    const context=await browser.newContext({viewport:{width:1920,height:1080},extraHTTPHeaders:{Authorization:process.env.OFFICE_SITE_AUTH}});
    const page=await context.newPage(),resources=[],errors=[];
    page.on('response',r=>resources.push({path:new URL(r.url()).pathname,status:r.status()}));
    page.on('pageerror',e=>errors.push(e.message));
    const response=await page.goto((process.env.OFFICE_SITE_URL||'http://127.0.0.1:8888/office/'),{waitUntil:'networkidle'});
    assert.equal(response.status(),200);await page.waitForFunction(()=>window.officeDebug?.snapshot().connected);
    for(const suffix of ['static/weather.js','static/interaction.js','static/office.js','static/office.css','static/assets/bg-c.png','static/assets/sprites/01-lin.png','static/assets/sprites/manifest.json','api/status'])
      assert(resources.some(r=>r.path===`/office/${suffix}`&&r.status===200),suffix);
    assert.deepEqual(errors,[]);
    assert.equal((await page.evaluate(()=>window.officeDebug.snapshot())).zoom,4);
    await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.officeDebug?.snapshot().connected);
    console.log('PASS authenticated /office/ proxy: page, reload, CSS, JS, sprites, live status');
    await context.close();
    const anonymous=await browser.newContext();
    const denied=await anonymous.request.get((process.env.OFFICE_SITE_URL||'http://127.0.0.1:8888/office/'));
    assert.equal(denied.status(),404);console.log('PASS configured gateway rejects anonymous requests');
  } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
