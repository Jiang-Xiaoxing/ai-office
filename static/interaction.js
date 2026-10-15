/* Local, decorative interactions. Never write tool state or interrupt a resident. */
(() => {
  'use strict';
  const LIFE = 2600, COOLDOWN = 3200;
  function create({canvas, getActors, getLayout, isConnected, zones}) {
    const PLANTS=zones.plants, TABLE=zones.teaTable;
    const layer=document.getElementById('interaction-targets');
    const note=document.getElementById('interaction-note');
    const heading=note.querySelector('strong'),message=note.querySelector('span');
    const buttons=new Map(),cooldowns=new Map();
    let effects=[],selected=null,expires=0,kind=null;
    function say(title,text,type,now) {
      heading.textContent=title;message.textContent=text;kind=type;
      note.hidden=false;expires=now+6500;
    }
    function dismiss() { note.hidden=true;selected=null;kind=null; }
    function available(id,now) {
      if(now<(cooldowns.get(id)??-Infinity)+COOLDOWN)return false;
      cooldowns.set(id,now);return true;
    }
    function addEffect(effect,now) {
      effects=effects.filter(e=>e.id!==effect.id&&now-e.start<LIFE);
      effects.push({...effect,start:now});effects=effects.slice(-8);
    }
    function residentText() {
      const a=getActors().find(a=>a.id===selected);
      if(!a){dismiss();return;}
      const status=a.requested==='working'?'干活中':a.requested==='idle'?'摸鱼中':'连接中';
      heading.textContent=`${a.rosterName} · ${status}${isConnected()?'':'（上次状态）'}`;
      message.textContent=!isConnected()?'正在重连，先保留上次状态。':a.requested==='working'?
        '收到招呼啦，我继续忙手头的活。':a.requested==='idle'?'嗨！在阁楼歇一会儿吧。':'等状态同步后再来打招呼吧。';
    }
    function greet(id) {
      const now=performance.now(),a=getActors().find(a=>a.id===id);
      if(!a)return;
      selected=id;say('', '', 'resident',now);residentText();
      if(available(`resident:${id}`,now))addEffect({id:`resident:${id}`,type:'heart',actor:id},now);
    }
    function water(plantId) {
      const p=PLANTS.find(p=>p.id===plantId);if(!p)return;
      const now=performance.now();selected=null;
      const ready=available(p.id,now);
      if(ready)addEffect({id:p.id,type:'water',x:p.x+p.w/2,y:p.y+9},now);
      say(ready?p.name:'刚刚浇过啦',ready?'水滴落下，叶子精神了一点。':'等水慢慢吸收，一会儿再来吧。','water',now);
    }
    function tea() {
      const now=performance.now();selected=null;
      if(available(TABLE.id,now)) {
        addEffect({id:TABLE.id,type:'tea',x:TABLE.effectX??TABLE.x+TABLE.w/2,y:TABLE.effectY??TABLE.y+4},now);
        say('茶泡好啦','热茶放在桌上，忙完了再慢慢喝。','tea',now);
      } else say('茶还温着呢','先歇一口气，一会儿再续上。','tea',now);
    }
    function button(id,label,action,resident=false) {
      let el=buttons.get(id);
      if(!el) {
        el=document.createElement('button');el.type='button';el.className=`interaction-target${resident?' resident':''}`;
        el.dataset.target=id;el.addEventListener('click',action);layer.append(el);buttons.set(id,el);
      }
      if(el.getAttribute('aria-label')!==label){el.setAttribute('aria-label',label);el.title=label;}
      return el;
    }
    function position(el,r,l) {
      const scale=l.pixelScale,w=Math.max(32,Math.round(r.w*scale)),h=Math.max(32,Math.round(r.h*scale));
      const width=layer.clientWidth,height=layer.clientHeight;
      const x=Math.max(0,Math.min(width-w,Math.round(l.ox+(r.x+r.w/2)*scale-w/2)));
      const y=Math.max(0,Math.min(height-h,Math.round(l.oy+(r.y+r.h/2)*scale-h/2)));
      Object.assign(el.style,{left:`${x}px`,top:`${y}px`,width:`${w}px`,height:`${h}px`});
    }
    function update(now) {
      const l=getLayout();if(!l?.pixelScale)return;
      for(const p of PLANTS)position(button(p.id,`${p.name}：浇水`,()=>water(p.id)),p,l);
      position(button(TABLE.id,'茶桌：泡一壶茶',tea),TABLE,l);
      const ids=new Set([...PLANTS.map(p=>p.id),TABLE.id]);
      for(const a of getActors()) {
        const id=`resident:${a.id}`;ids.add(id);
        a.label?.classList.toggle('selected',selected===a.id);
        a.label?.classList.toggle('keyboard-focused',document.activeElement?.dataset.target===id&&document.activeElement.matches(':focus-visible'));
        const status=a.requested==='working'?'干活中':a.requested==='idle'?'摸鱼中':'连接中';
        position(button(id,`${a.rosterName}：${status}${isConnected()?'':'（上次状态）'}，点击打招呼`,()=>greet(a.id),true),
          {x:Math.round(a.x)-13,y:Math.round(a.y)-(a.mode==='type'?40:34),w:26,h:36},l);
      }
      for(const [id,el] of buttons)if(!ids.has(id)){el.remove();buttons.delete(id);}
      const actorIds=new Set(getActors().map(a=>a.id));
      effects=effects.filter(e=>now-e.start<LIFE&&(!e.actor||actorIds.has(e.actor)));
      for(const id of cooldowns.keys())if(now-cooldowns.get(id)>COOLDOWN)cooldowns.delete(id);
      if(!note.hidden) {
        if(now>=expires)dismiss();
        else if(selected)residentText();
      }
    }
    function draw(ctx,now,reduced) {
      const pixel=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),w,h);};
      for(const e of effects) {
        const step=reduced?0:Math.floor((now-e.start)/160);
        if(e.type==='heart') {
          const a=getActors().find(a=>a.id===e.actor);if(!a)continue;
          const x=Math.round(a.x)-3,y=Math.round(a.y)-(a.mode==='type'?47:41)-(reduced?0:Math.min(5,Math.floor(step/3)));
          // Seven source pixels wide; nearest-neighbor scaling belongs to office.js.
          pixel(x+1,y,2,1,'#e5a48b');pixel(x+4,y,2,1,'#e5a48b');
          pixel(x,y+1,7,2,'#e5a48b');pixel(x+1,y+3,5,1,'#e5a48b');pixel(x+2,y+4,3,1,'#e5a48b');pixel(x+3,y+5,1,1,'#e5a48b');
        } else if(e.type==='water') {
          for(let i=0;i<3;i++) {
            const x=e.x-7+i*7,y=e.y+(reduced?i*3:(step*2+i*5)%17);
            pixel(x,y,1,3,'#a6c4e1');pixel(x-1,y+2,3,2,'#a6c4e1');pixel(x,y+2,1,1,'#f0e3ce');
          }
        } else {
          pixel(e.x,e.y,7,5,'#dfbd8a');pixel(e.x+7,e.y+1,2,3,'#dfbd8a');pixel(e.x+1,e.y,5,1,'#735247');
          for(let i=0;i<2;i++)pixel(e.x+1+i*4+(step%2),e.y-3-i*2-(step%4),1,2,'#f0e3ce');
        }
      }
    }
    note.querySelector('button').addEventListener('click',dismiss);
    canvas.addEventListener('click',dismiss);
    document.addEventListener('keydown',event=>{if(event.key==='Escape')dismiss();});
    return Object.freeze({update,draw,snapshot:()=>({selected,kind,visible:!note.hidden,
      effects:effects.map(e=>({...e})),targets:buttons.size})});
  }
  window.AtticInteractions=Object.freeze({create});
})();
