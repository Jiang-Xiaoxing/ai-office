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

网页每 3 秒轮询 `/api/status`，前端 Canvas 重绘角色动画。

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

前端 `static/office.js` 的 `DESKS` 数组也要加一个工位配置（`id` 要和后端一致），角色配色自动用 `color` / `hair` 字段。

## 文件结构

```
D:\ai-office\
  server_app.py       # FastAPI 后端 (端口 8889, 绑 127.0.0.1)
  static/
    index.html        # 像素看板页面
    office.js         # Canvas 正俯视 RPG 像素画 + 角色动画
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
