/* Decorative attic weather. Beijing time controls daylight; no network or controls. */
(() => {
  'use strict';
  const HOUR = 3600000, TRANSITION = 60000;
  const DAY = ['sunny', 'cloudy', 'rain', 'snow'];
  const NAMES = { sunny: '晴天', cloudy: '阴天', rain: '雨天', snow: '雪天', night: '夜晚' };
  const WIDTH = 480, HEIGHT = 270;
  // Glass interiors only, measured on attic-bg-2.png. Leave frames and mullions intact.
  const PANES = [
    [[102,23],[125,23],[122,35],[98,35]],
    [[127,23],[150,23],[147,35],[124,35]],
    [[98,37],[121,37],[119,47],[95,47]],
    [[123,37],[146,37],[143,47],[121,47]],
    [[330,23],[353,23],[356,35],[333,35]],
    [[355,23],[378,23],[381,35],[358,35]],
    [[334,37],[356,37],[359,47],[337,47]],
    [[359,37],[381,37],[384,47],[362,47]],
  ];
  function weatherAt(timestamp) {
    const local = new Date(timestamp + 8 * HOUR), hour = local.getUTCHours();
    const day = Math.floor((timestamp + 8 * HOUR) / (24 * HOUR));
    return { kind: hour < 6 || hour >= 18 ? 'night' : DAY[((day * 7 + hour) % 4 + 4) % 4],
      hour, slot: Math.floor(timestamp / HOUR), nextChange: (Math.floor(timestamp / HOUR) + 1) * HOUR };
  }
  function inside(x, y, polygon) {
    let hit = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }
  const surface = () => {
    const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT;
    return canvas;
  };
  function create(source, now = Date.now()) {
    const original = source.getContext('2d').getImageData(0, 0, WIDTH, HEIGHT);
    const mask = surface(), maskContext = mask.getContext('2d');
    const pixels = maskContext.createImageData(WIDTH, HEIGHT);
    for (let y = 23; y < 47; y++) for (let x = 94; x < 385; x++) {
      if (PANES.some(p => inside(x + .5, y + .5, p))) pixels.data[(y * WIDTH + x) * 4 + 3] = 255;
    }
    maskContext.putImageData(pixels, 0, 0);
    const scenes = { sunny: source };
    const palettes = {
      cloudy: { factor: [.72,.78,.85], tint: [133,153,169], mix: .10, sky: '#9aabb6', cloud: '#bac5c9', tree: '#5f7b77' },
      rain: { factor: [.53,.65,.77], tint: [77,105,128], mix: .10, sky: '#506b85', cloud: '#718798', tree: '#405d60' },
      snow: { factor: [.84,.91,1], tint: [216,235,245], mix: .24, sky: '#bfd5e3', cloud: '#eaf2f4', tree: '#92afad' },
      night: { factor: [.28,.34,.49], tint: [29,40,73], mix: .08, sky: '#18253f', cloud: '#293955', tree: '#233e4b' },
    };
    for (const [kind, p] of Object.entries(palettes)) {
      const layer = surface(), c = layer.getContext('2d'), data = c.createImageData(WIDTH, HEIGHT);
      for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
        const i = (y * WIDTH + x) * 4;
        const glow = kind === 'night' ? Math.max(
          Math.max(0, 1 - Math.hypot((x-240)/83, (y-65)/90)) * .85,
          Math.max(0, 1 - Math.hypot((x-27)/93, (y-175)/87)) * .95,
          Math.max(0, 1 - Math.hypot((x-102)/88, (y-218)/47)) * .32,
        ) : 0;
        for (let ch = 0; ch < 3; ch++) {
          const lit = original.data[i+ch] * (p.factor[ch] + glow * [.83,.62,.23][ch]);
          data.data[i+ch] = lit * (1-p.mix) + p.tint[ch] * p.mix;
        }
        data.data[i+3] = 255;
      }
      c.putImageData(data, 0, 0);
      if (kind === 'rain') {
        // Quiet, broken reflections in the floor; keep them on the native pixel grid.
        c.fillStyle = '#b5cfda'; c.globalAlpha = .07;
        for (let y = 124; y < 250; y += 19) for (const x of [95,345]) c.fillRect(x + y % 9, y, 24 + y % 17, 1);
        c.globalAlpha = 1;
      }
      const sky = surface(), s = sky.getContext('2d');
      s.fillStyle = p.sky; s.fillRect(90,22,300,28);
      for (const origin of [94,328]) {
        s.fillStyle = p.cloud;
        for (let j = 0; j < 3; j++) {
          const x = origin + 5 + j * 18, y = 26 + j % 2 * 4;
          s.fillRect(x,y,13,3); s.fillRect(x+3,y-2,7,2);
        }
        s.fillStyle = p.tree;
        for (let j = 0; j < 14; j++) {
          const x = origin + j*4, y = 42 + (j*7 % 5);
          s.fillRect(x,y,4,8); s.fillRect(x+1,y-2,2,2);
          if (kind === 'snow') { s.fillStyle = '#e4eff1'; s.fillRect(x,y,4,1); s.fillStyle = p.tree; }
        }
        if (kind === 'night') {
          s.fillStyle = '#dee8db'; s.fillRect(origin+38,25,5,7); s.fillRect(origin+37,27,7,3);
          s.fillStyle = p.sky; s.fillRect(origin+41,24,4,6);
          s.fillStyle = '#a2bbd4';
          for (const [x,y] of [[10,25],[26,30],[47,36],[16,39],[33,24]]) s.fillRect(origin+x,y,1,1);
        }
      }
      s.globalCompositeOperation = 'destination-in'; s.drawImage(mask,0,0);
      c.drawImage(sky,0,0); scenes[kind] = layer;
    }
    const particles = surface(), pc = particles.getContext('2d');
    const random = n => { const v = Math.sin(n * 127.1) * 43758.5453; return v - Math.floor(v); };
    const drops = Array.from({ length: 35 }, (_, i) => ({
      x: random(i+1)*62, y: random(i+81)*34, speed: random(i+163),
    }));
    let current = weatherAt(now), from = { [current.kind]: 1 }, started = now - TRANSITION;
    function weights(timestamp) {
      const t = Math.max(0, Math.min(1, (timestamp-started)/TRANSITION)), eased = t*t*(3-2*t);
      return Object.fromEntries(Object.keys(NAMES).map(k => [k, (from[k] || 0)*(1-eased) + (k===current.kind ? eased : 0)]));
    }
    function update(timestamp = Date.now()) {
      const next = weatherAt(timestamp);
      if (next.kind !== current.kind) { from = weights(timestamp); started = timestamp; }
      current = next;
    }
    function draw(c, timestamp, reducedMotion) {
      update(timestamp);
      const blend = weights(timestamp);
      // First layer is opaque. Subsequent layers use normalized source-over weights.
      let painted = 0;
      for (const [kind, weight] of Object.entries(blend)) {
        if (weight <= 0) continue;
        c.globalAlpha = painted ? weight / (painted+weight) : 1;
        c.drawImage(scenes[kind],0,0); painted += weight;
      }
      c.globalAlpha = 1; pc.clearRect(0,0,WIDTH,HEIGHT);
      const time = reducedMotion ? 0 : timestamp / 1000;
      for (const kind of ['rain','snow']) {
        if (!blend[kind]) continue;
        pc.globalAlpha = blend[kind]; pc.fillStyle = kind === 'rain' ? '#bddae7' : '#f4fafb';
        for (const origin of [94,328]) for (let i = 0; i < (kind === 'rain' ? 35 : 23); i++) {
          const drop = drops[i], speed = kind === 'rain' ? 27 + drop.speed*13 : 4 + drop.speed*5;
          const y = 19 + ((drop.y + time*speed)%34);
          const x = origin + ((drop.x - (kind === 'rain' ? time*8 : Math.floor(time*.8+i%3)*2))%62+62)%62;
          const px = Math.floor(x), py = Math.floor(y);
          pc.fillRect(px,py,1,kind === 'rain' ? 3 : 1);
          if (kind === 'rain') pc.fillRect(px-1,py+3,1,2);
          else if (i%4 === 0) { pc.fillRect(px-1,py+1,3,1); pc.fillRect(px,py+2,1,1); }
        }
      }
      pc.globalAlpha = 1; pc.globalCompositeOperation = 'destination-in'; pc.drawImage(mask,0,0);
      pc.globalCompositeOperation = 'source-over'; c.drawImage(particles,0,0);
    }
    return Object.freeze({ draw, update, snapshot: () => ({ ...current, name: NAMES[current.kind],
      transitionMs: TRANSITION, weights: weights(Date.now()), panes: PANES.map(p=>p.map(v=>[...v])) }) });
  }
  globalThis.AtticWeather = Object.freeze({ create, weatherAt });
})();
