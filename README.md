# AI 办公室

像素 RPG 风格的 AI 工具状态看板，主人姜小星。

一眼看到电脑上的 AI 工具（Codex / CodeBuddy / Claude Code）是在干活还是摸鱼。干活的角色在工位敲键盘，空闲的去喝茶。

## 怎么启动

**方法一：双击 `start.vbs`**
后端隐藏窗口后台运行，绝不弹终端。等 1~2 秒后浏览器打开 `http://127.0.0.1:8889/`。

**方法二：命令行**
```bash
D:\ai-office\venv\Scripts\pythonw.exe D:\ai-office\server_app.py
```
然后浏览器访问 `http://127.0.0.1:8889/`。

## 怎么停止

双击 `stop.vbs`，或在任务管理器结束 `pythonw.exe`（命令行含 `ai-office\server_app.py`）。

## 地址

| 用途 | 地址 |
|------|------|
| 前端看板 | http://127.0.0.1:8889/ |
| 状态接口 | http://127.0.0.1:8889/api/status |
| 健康检查 | http://127.0.0.1:8889/api/healthz |
| 小站登录入口 | https://laptop-ubv43gdg.tail2aec95.ts.net/office/ |
| 小站代理状态接口 | https://laptop-ubv43gdg.tail2aec95.ts.net/office/api/status |

后端绑 `127.0.0.1:8889`，外网不可达。从小站 `D:\studio` 的导航栏「AI 办公室」入口也能跳过来（不绕开小站登录保护）。

小站将 `/office` 重定向到 `/office/`，再反代至本机 8889；页面的脚本、图片和接口地址须使用相对路径（例如 `static/office.js`、`api/status`），以同时支持直接访问与小站前缀。小站代理在现有登录校验之后执行，本机直接访问 `8888/office` 也需要有效的网关凭据。

## 状态检测原理

| 工具 | 检测方式 |
|------|----------|
| Codex | 扫 `~/.codex/sessions` 近 3 天的 `.jsonl` 会话文件，30 秒内修改过=干活；也看 `codex.exe` 进程（排除 app-server / exec-server 等后台子进程） |
| CodeBuddy | `node.exe` 进程命令行含 `codebuddy-code/bin/codebuddy` = 干活 |
| Claude Code | `claude.exe` 进程存在 = 干活 |

网页每 3 秒轮询 `/api/status`，前端 Canvas 重绘角色动画。状态变化后，角色从当前位置沿四方向路线走到自己的工位或休息区；到达工位才坐下打字。路线按家具碰撞区域寻路，角色不会穿桌子或瞬移。空闲角色喝茶、等待和闲逛，三个人有独立站位。

画面使用项目原创 PNG 精灵图：木纹地板、织纹地毯、电脑键盘、椅子、书架、挂画、沙发、茶几、咖啡柜、文件柜和绿植。三个人分别有眼镜与深色短发、浅棕发与蓝色外套、红棕发与金色外套；Claude Code 同时标注 `(DeepSeek)`。走路每个方向 4 帧，打字、喝茶、等待分别 4 帧。

画布关闭图像平滑，按整数倍显示。布局随窗口尺寸重新安排，竖屏时工作室在上、茶水间在下，保持三个工位和休息区可见。素材与接口全部使用相对地址，支持小站 `/office/` 前缀。连接失败时保留上次状态并继续重试。

## 怎么加新工具

编辑 `server_app.py`，在 `TOOLS` 列表里加一个 dict：

```python
TOOLS = [
    {"id": "codex",       "name": "Codex",       "check": _check_codex},
    {"id": "codebuddy",   "name": "CodeBuddy",   "check": _check_codebuddy},
    {"id": "claude-code", "name": "Claude Code", "check": _check_claude_code},
    # 新增：
    {"id": "your-tool",   "name": "你的工具",     "check": _check_your_tool},
]
```

`_check_your_tool()` 是一个无参数函数，返回 `True`（干活中）或 `False`（空闲）。用 `psutil.process_iter` 查进程、`os.path.getmtime` 查文件修改时间等。

前端 `static/office.js` 的 `DESKS` 数组也要加一个工位配置（`id` 要和后端一致），设置 `name`、`sprite` 和 `color`。`sprite` 可先复用现有角色 `codex`、`codebuddy` 或 `claude-code`；随后在 `roomLayout()` 中为新角色安排独立工位、休息站位和碰撞区域。新工具检测器的后端注册接口保持不变。

## 素材与自查

`scripts/draw_assets.py` 保存所有原创像素素材的绘制逻辑，输出 `static/assets/office-atlas.png` 和 `office-atlas.json`。当前图集有 106 个精灵，包括 84 个角色动画帧。只在重新绘制素材时需要 Pillow，后端运行不需要它。

`tests/verify-office.cjs` 使用现有的本地 Playwright 与无头 Edge 验证：独立站位、喝茶和打字帧变化、状态切换连续行走、家具碰撞、休息区往返、闲逛、混合状态、断线恢复、3 秒刷新、手机/平板/桌面布局及 `/office/` 相对路径。模拟状态只在测试浏览器中拦截接口，不修改真实检测器，也没有给生产页面添加模拟开关。

运行自查用 `node tests/verify-office.cjs`：`node` 是 JavaScript 运行程序，后面的相对路径指向本项目的验收脚本；它只启动隐藏的无头浏览器、读取本机办公室并写截图，不改变系统设置或真实工具状态。默认复用 `D:/tools/PixelAgents/node_modules/playwright`，可通过 `PLAYWRIGHT_MODULE` 指定已有安装位置；`OFFICE_BROWSER` 可指定浏览器程序位置。

最终截图：`preview/final-idle.png`（全部空闲）、`preview/final-work.png`（全部干活）。测试过程的手机截图和失败诊断只写到被 Git 忽略的 `.browser-tmp/`，交付前清理。

## 文件结构

```
D:\ai-office\
  server_app.py       # FastAPI 后端 (端口 8889, 绑 127.0.0.1)
  static/
    index.html        # 像素看板页面
    office.js         # Canvas 正俯视 RPG 像素画 + 角色动画
    office.css        # 自适应页面与状态栏
    assets/           # 原创 PNG 精灵图集与坐标元数据
  scripts/
    draw_assets.py    # 可复现的像素素材绘制脚本
  tests/
    verify-office.cjs # 无头浏览器验收
  start.vbs            # 隐藏窗口启动脚本
  stop.vbs             # 停止脚本
  venv/                # Python 虚拟环境 (fastapi + uvicorn + psutil)
  .gitignore
  README.md            # 本文件
  preview/             # 参考图 (画风参考, 非素材来源)
```

## 规矩

- 所有程序隐藏窗口后台跑，绝不弹终端。
- 不设开机自启。
- 不改系统设置。
- 临时文件用完删掉。
- 不推送（本地 git 提交即可）。
