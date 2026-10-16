/* Save the native frame and projection so export QA checks the actual scaling. */
const fs=require('node:fs'),path=require('node:path');
module.exports=async function captureFrame(page,name){
 const root=path.resolve(__dirname,'..'),tmp=path.join(root,'.browser-tmp');
 const data=await page.locator('#game').evaluate(canvas=>{
  const r=canvas.getBoundingClientRect(),s=officeDebug.snapshot();
  const focused=document.querySelector('.interaction-target:not(.resident):focus-visible');
  const focus=focused?.getBoundingClientRect();
  return {png:canvas.toDataURL('image/png').split(',')[1],rect:{x:r.x,y:r.y,w:r.width,h:r.height,
   ui:focus?[{x:focus.x,y:focus.bottom-4,w:focus.width,h:4}]:[],
   moving:[...s.actors.map(a=>({x:a.body.x-3,y:a.body.y-9,w:a.body.w+6,h:a.body.h+12})),
    ...s.actors.map(a=>({x:a.icon.x,y:a.icon.y-4,w:a.icon.w,h:a.icon.h+4})),
    ...s.interactions.effects.filter(e=>!e.actor).map(e=>({x:e.x-10,y:e.y-12,w:24,h:32}))]}};
 });
 fs.writeFileSync(path.join(tmp,name+'-canvas.png'),Buffer.from(data.png,'base64'));
 fs.writeFileSync(path.join(tmp,name+'-projection.json'),JSON.stringify(data.rect));
};
