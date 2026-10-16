/* Mixed-state passage regression and opaque-pixel separation while walking. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'D:/tools/PixelAgents/node_modules/playwright');
const {BASE}=require('./test-env.cjs');
const TMP=path.resolve(__dirname,'../.browser-tmp');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.OFFICE_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',env:{...process.env,TEMP:TMP,TMP:TMP}});
 try {
  const page=await browser.newPage({viewport:{width:1024,height:600}});
  let statuses=['idle','working','idle'];
  await page.addInitScript(()=>{Date.now=()=>Date.parse('2026-10-15T01:00:00Z');Math.random=()=>.01;});
  await page.route('**/api/status',r=>r.fulfill({json:{ts:1792026000,agents:['codex','openrouter','claude-code'].map((id,i)=>({id,name:id,status:statuses[i]}))}}));
  await page.goto(BASE+'/');await page.waitForFunction(()=>officeDebug?.snapshot().connected);
  await page.evaluate(async()=>{
   const manifest=await fetch('static/assets/sprites/manifest.json').then(r=>r.json());
   const masks={};
   for(const person of manifest.characters) {
    const image=new Image();image.src='static/assets/'+person.file;await image.decode();
    const c=document.createElement('canvas');c.width=256;c.height=384;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);
    masks[person.id]=ctx.getImageData(0,0,256,384).data;c.width=0;c.height=0;
   }
   window.spriteMasks=masks;
  });
  // Force the leisure choice that used to send the centre resident into the
  // left lounge, where the occupied neighbouring chair trapped it on return.
  await page.waitForFunction(()=>officeDebug.snapshot().actors[2].idleChanges>0&&officeDebug.snapshot().actors.every(a=>!a.route.length&&!a.pending),null,{timeout:40000});
  let walking=0;
  for(const next of [['idle','working','working'],['working','working','working']]) {
   statuses=next;
   let arrived=false,previous;
   for(let i=0;i<220;i++) {
   const sample=await page.evaluate(()=>{
    const s=officeDebug.snapshot(),hits=[];
    for(let i=0;i<s.actors.length;i++)for(let j=i+1;j<s.actors.length;j++) {
     const a=s.actors[i],b=s.actors[j],ax=Math.round(a.x)-32,ay=Math.round(a.y)-59,bx=Math.round(b.x)-32,by=Math.round(b.y)-59;
     const opaque=(person,x,y)=>spriteMasks[person.sprite][((Math.floor(person.spriteFrame/4)*64+y)*256+(person.spriteFrame%4)*64+x)*4+3]>0;
     for(let y=Math.max(ay,by);y<Math.min(ay+64,by+64);y++)for(let x=Math.max(ax,bx);x<Math.min(ax+64,bx+64);x++)
      if(opaque(a,x-ax,y-ay)&&opaque(b,x-bx,y-by))hits.push([a.id,b.id,x,y]);
    }
    return {actors:s.actors,hits,time:performance.now()};
   });
   assert.deepEqual(sample.hits,[],'visible character pixels never overlap');
   sample.actors.forEach((actor,j)=>{
    if(previous)assert(Math.hypot(actor.x-previous.actors[j].x,actor.y-previous.actors[j].y)<=(sample.time-previous.time)/1000*48+3,'no teleport to escape the passage');
    if(actor.mode==='walk')walking++;
    if(actor.slot!==0&&actor.requested==='idle')assert(actor.x>140,'other residents cannot get trapped in the left bay');
   });
   previous=sample;
   if(sample.actors.every((a,j)=>a.requested===next[j]&&(next[j]==='working'?a.mode==='type':!a.pending&&!a.route.length))){arrived=true;break;}
   await page.waitForTimeout(80);
   }
   if(!arrived)fs.writeFileSync(path.join(TMP,'blocked-passage.json'),JSON.stringify(await page.evaluate(()=>officeDebug.snapshot()),null,2));
   assert(arrived,'mixed-state residents reach their own workstations');
  }
  assert(walking>0);
  console.log('PASS occupied left passage + mixed states: continuous arrival with zero overlapping opaque pixels');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
