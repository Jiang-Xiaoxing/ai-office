// ============================================================
//  AI 办公室 —— 像素 RPG 风格办公室 (正俯视)
//  Canvas 全手绘像素画，3 秒轮询 /api/status
// ============================================================
(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var tsEl = document.getElementById('ts');

  // ---- 像素画布尺寸 ----
  var TILE = 32;           // 每格 32 像素
  var COLS = 16, ROWS = 12;
  var W = TILE * COLS, H = TILE * ROWS;
  canvas.width = W;
  canvas.height = H;

  // 缩放适配窗口
  function fit() {
    var wrap = document.getElementById('wrap');
    var ww = wrap.clientWidth, wh = wrap.clientHeight;
    var scale = Math.min(ww / W, wh / H, 1.5);
    canvas.style.width = (W * scale) + 'px';
    canvas.style.height = (H * scale) + 'px';
  }
  window.addEventListener('resize', fit);
  fit();

  // ---- 关闭抗锯齿 ----
  ctx.imageSmoothingEnabled = false;

  // ---- 调色板 ----
  var C = {
    floor: '#3a3a5c', floor2: '#333352', floor3: '#2e2e4a',
    wall: '#5a4a6a', wallTop: '#6b5a7b', wallShadow: '#3d3148',
    desk: '#8B6940', deskTop: '#A07848', deskLeg: '#5C4420',
    monitor: '#1a1a2e', monitorFrame: '#444', screen: '#2a4a3a',
    screenOn: '#3d6b4a',
    chair: '#555', chairLeg: '#333',
    plantPot: '#7a5c3a', plantLeaf: '#3a7a3a',
    rug: '#6b3a5c', rugPattern: '#8a4a6e',
    cup: '#d0d0d0', tea: '#8B4513',
    skin: '#F4C2A1', hair: '#3a2818', shirt: '#4488aa', shirt2: '#336688',
    pants: '#333355',
    codexShirt: '#4ecca3', codexHair: '#2a2a2a',
    codebuddyShirt: '#e94560', codebuddyHair: '#5a3a1a',
    claudeShirt: '#f0a500', claudeHair: '#4a2a1a',
  };

  // ---- 像素绘制辅助 ----
  function px(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * 1, y * 1, w, h);
  }
  // 画一个像素"精灵"——用颜色数组拼
  function sprite(ox, oy, data, scale) {
    scale = scale || 1;
    for (var r = 0; r < data.length; r++) {
      var row = data[r];
      for (var c = 0; c < row.length; c++) {
        var col = row[c];
        if (col === 0 || col === '.') continue;
        ctx.fillStyle = col;
        ctx.fillRect((ox + c * scale) * 1, (oy + r * scale) * 1, scale, scale);
      }
    }
  }

  // ---- 动画帧 ----
  var frame = 0;
  var lastAgents = null;

  // ---- 工位布局: 3 个工位 + 茶水区 ----
  // 每个 desk: { x, y } 是工位左上角(格子坐标)
  var DESKS = [
    { id: 'codex',       x: 2,  y: 3, color: C.codexShirt,    hair: C.codexHair,    name: 'Codex' },
    { id: 'codebuddy',   x: 7,  y: 3, color: C.codebuddyShirt, hair: C.codebuddyHair, name: 'CodeBuddy' },
    { id: 'claude-code', x: 12, y: 3, color: C.claudeShirt,   hair: C.claudeHair,   name: 'Claude Code' },
  ];
  // 茶水区(摸鱼处)
  var TEA_SPOT = { x: 8, y: 9 };
  // 工位中心(角色坐的位置)
  function deskCharPos(d) {
    return { x: (d.x + 1.5) * TILE, y: (d.y + 2) * TILE };
  }

  // ===================== 场景绘制 =====================

  function drawFloor() {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var base = ((r + c) % 2 === 0) ? C.floor : C.floor2;
        ctx.fillStyle = base;
        ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      }
    }
    // 地毯
    ctx.fillStyle = C.rug;
    ctx.fillRect(4 * TILE, 8 * TILE, 8 * TILE, 3 * TILE);
    ctx.fillStyle = C.rugPattern;
    for (var i = 0; i < 8; i += 2) {
      ctx.fillRect((4 + i) * TILE + 4, 8 * TILE + 4, TILE - 8, TILE - 8);
      ctx.fillRect((4 + i + 1) * TILE + 4, (8 + 1) * TILE + 4, TILE - 8, TILE - 8);
      ctx.fillRect((4 + i) * TILE + 4, (8 + 2) * TILE + 4, TILE - 8, TILE - 8);
    }
  }

  function drawWalls() {
    // 上墙
    ctx.fillStyle = C.wall;
    ctx.fillRect(0, 0, W, 2 * TILE);
    ctx.fillStyle = C.wallTop;
    ctx.fillRect(0, 0, W, 6);
    ctx.fillStyle = C.wallShadow;
    ctx.fillRect(0, 2 * TILE - 4, W, 4);
    // 左右墙
    ctx.fillStyle = C.wall;
    ctx.fillRect(0, 0, 4, H);
    ctx.fillRect(W - 4, 0, 4, H);
  }

  function drawDesk(d) {
    var dx = d.x * TILE, dy = d.y * TILE;
    var dw = 3 * TILE, dh = 2 * TILE;
    // 桌面
    ctx.fillStyle = C.deskTop;
    ctx.fillRect(dx, dy, dw, dh);
    // 桌侧(阴影)
    ctx.fillStyle = C.desk;
    ctx.fillRect(dx, dy + dh - 6, dw, 6);
    // 显示器
    var mw = TILE * 1.2, mh = TILE * 0.9;
    var mx = dx + (dw - mw) / 2, my = dy + 4;
    ctx.fillStyle = C.monitorFrame;
    ctx.fillRect(mx - 2, my - 2, mw + 4, mh + 4);
    ctx.fillStyle = d.screenOn ? C.screenOn : C.screen;
    ctx.fillRect(mx, my, mw, mh);
    // 底座
    ctx.fillStyle = C.monitorFrame;
    ctx.fillRect(mx + mw / 2 - 6, my + mh, 12, 4);
    ctx.fillRect(mx + mw / 2 - 10, my + mh + 4, 20, 3);
    // 键盘
    ctx.fillStyle = '#222';
    ctx.fillRect(dx + (dw - TILE * 1.4) / 2, dy + dh - 14, TILE * 1.4, 8);
    // 名牌
    ctx.fillStyle = '#ddd';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(d.name, dx + dw / 2, dy + dh - 2);
  }

  function drawPlant(gx, gy) {
    var bx = gx * TILE, by = gy * TILE;
    ctx.fillStyle = C.plantPot;
    ctx.fillRect(bx + 8, by + 16, 16, 14);
    ctx.fillStyle = C.plantLeaf;
    ctx.fillRect(bx + 6, by + 6, 20, 12);
    ctx.fillRect(bx + 10, by + 2, 12, 8);
    ctx.fillRect(bx + 4, by + 10, 6, 8);
    ctx.fillRect(bx + 22, by + 10, 6, 8);
  }

  function drawChair(gx, gy) {
    var cx = gx * TILE, cy = gy * TILE;
    ctx.fillStyle = C.chair;
    ctx.fillRect(cx + 6, cy + 8, 20, 18);
    ctx.fillStyle = C.chairLeg;
    ctx.fillRect(cx + 8, cy + 26, 4, 4);
    ctx.fillRect(cx + 20, cy + 26, 4, 4);
  }

  function drawTeaArea() {
    var tx = TEA_SPOT.x * TILE, ty = TEA_SPOT.y * TILE;
    // 小圆桌
    ctx.fillStyle = C.deskTop;
    ctx.beginPath();
    ctx.arc(tx + TILE, ty + TILE, TILE * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.desk;
    ctx.fillRect(tx + TILE - 3, ty + TILE + 8, 6, 16);
  }

  // ===================== 角色绘制 =====================

  // 正俯视角色: 头顶 + 肩膀 + 手臂 (敲键盘时手臂动)
  function drawCharacter(x, y, shirt, hair, working) {
    // x, y 是角色中心(脚的位置)
    var s = 3; // 像素大小
    var bob = working ? Math.sin(frame * 0.3) * 1 : Math.sin(frame * 0.06) * 1;

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 椅子靠背(在角色后面)
    ctx.fillStyle = C.chair;
    ctx.fillRect(x - 10, y - 30, 20, 6);

    // 身体/肩膀
    var bodyY = y - 20 + bob;
    ctx.fillStyle = shirt;
    ctx.fillRect(x - 9, bodyY, 18, 12);
    ctx.fillStyle = C.shirt2;
    ctx.fillRect(x - 9, bodyY + 10, 18, 2);

    // 头
    var headY = bodyY - 10;
    ctx.fillStyle = C.skin;
    ctx.fillRect(x - 6, headY, 12, 10);
    // 头发
    ctx.fillStyle = hair;
    ctx.fillRect(x - 7, headY - 3, 14, 5);
    ctx.fillRect(x - 7, headY - 3, 3, 8);
    ctx.fillRect(x + 4, headY - 3, 3, 8);

    // 手臂
    var armOffset = working ? Math.sin(frame * 0.5) * 2 : 0;
    ctx.fillStyle = shirt;
    ctx.fillRect(x - 12, bodyY + 2 + armOffset, 4, 8);
    ctx.fillRect(x + 8, bodyY + 2 - armOffset, 4, 8);
    // 手
    ctx.fillStyle = C.skin;
    ctx.fillRect(x - 12, bodyY + 10 + armOffset, 4, 3);
    ctx.fillRect(x + 8, bodyY + 10 - armOffset, 4, 3);
  }

  // 站立喝茶的角色(侧面)
  function drawTeaDrinker(x, y, shirt, hair) {
    var bob = Math.sin(frame * 0.08) * 1;
    // 影子
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    var bodyY = y - 18 + bob;
    // 身体
    ctx.fillStyle = shirt;
    ctx.fillRect(x - 7, bodyY, 14, 14);
    // 头
    var headY = bodyY - 10;
    ctx.fillStyle = C.skin;
    ctx.fillRect(x - 5, headY, 10, 9);
    ctx.fillStyle = hair;
    ctx.fillRect(x - 6, headY - 3, 12, 5);
    ctx.fillRect(x - 6, headY - 3, 3, 7);

    // 手臂举杯子
    ctx.fillStyle = shirt;
    ctx.fillRect(x + 5, bodyY, 4, 6);
    ctx.fillStyle = C.skin;
    ctx.fillRect(x + 5, bodyY + 6, 4, 3);
    // 茶杯
    ctx.fillStyle = C.cup;
    ctx.fillRect(x + 4, bodyY + 2, 6, 5);
    ctx.fillStyle = C.tea;
    ctx.fillRect(x + 5, bodyY + 3, 4, 2);
    // 蒸汽
    var steam = Math.sin(frame * 0.15) * 2;
    ctx.fillStyle = 'rgba(200,200,200,.4)';
    ctx.fillRect(x + 6, bodyY - 4 + steam, 2, 4);
    ctx.fillRect(x + 8, bodyY - 6 - steam, 2, 5);
  }

  // ===================== 主渲染循环 =====================

  function render() {
    ctx.clearRect(0, 0, W, H);

    // 1. 地板
    drawFloor();
    // 2. 墙
    drawWalls();
    // 3. 装饰
    drawPlant(1, 1);
    drawPlant(14, 1);
    // 4. 茶水区
    drawTeaArea();
    // 5. 工位
    DESKS.forEach(function (d) {
      drawDesk(d);
      drawChair(d.x + 1, d.y + 2);
    });

    // 6. 角色
    if (lastAgents) {
      lastAgents.forEach(function (a) {
        var desk = DESKS.find(function (d) { return d.id === a.id; });
        if (!desk) return;
        var pos = deskCharPos(desk);
        desk.screenOn = (a.status === 'working');
        if (a.status === 'working') {
          drawCharacter(pos.x, pos.y, desk.color, desk.hair, true);
        } else {
          // 摸鱼: 去茶水区, 每个角色错开站位
          var idx = DESKS.indexOf(desk);
          var tx = TEA_SPOT.x * TILE + TILE + (idx - 1) * 24;
          var ty = TEA_SPOT.y * TILE + TILE;
          drawTeaDrinker(tx, ty, desk.color, desk.hair);
        }
      });
    }

    // 7. 装饰: 窗户(上墙)
    ctx.fillStyle = '#2a3a5a';
    ctx.fillRect(5 * TILE, 4, 2 * TILE, 12);
    ctx.fillRect(9 * TILE, 4, 2 * TILE, 12);
    ctx.fillStyle = '#3a5a8a';
    ctx.fillRect(5 * TILE + 2, 6, 2 * TILE - 4, 8);
    ctx.fillRect(9 * TILE + 2, 6, 2 * TILE - 4, 8);

    frame++;
    requestAnimationFrame(render);
  }

  // ===================== 状态轮询 =====================

  function poll() {
    fetch('api/status', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (data) {
      lastAgents = data.agents || [];
      var d = new Date(data.ts * 1000);
      tsEl.textContent = d.toLocaleTimeString('zh-CN');
    }).catch(function () {
      tsEl.textContent = '连接失败';
    });
    setTimeout(poll, 3000);
  }

  // 启动
  poll();
  render();
})();
