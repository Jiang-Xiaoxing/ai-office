# AI 办公室

姜小星的温馨阁楼工作室，一个独立运行的像素 AI 工具状态看板。斜屋顶、晚间天窗、暖灯、木地板和三张错落的书桌，像小伙伴们在家里的楼上一起干活。

Codex、CodeBuddy、Claude Code（DeepSeek）各有一个原创像素角色。干活时沿家具间的通道走回自己的座位，坐下敲键盘，显示器亮起；空闲时离开工位，在看书、喝茶、打盹之间随机切换。前端每 3 秒读取一次 `api/status`，断线时保留最后一次状态并自动重连。

## 本机使用

双击 `start.vbs` 启动，浏览器打开 **http://127.0.0.1:8889/**。双击 `stop.vbs` 停止。脚本以隐藏窗口运行；不会设置开机自启或修改系统代理。

已有私人小站的入口为导航栏「AI 办公室」，路径 `/office/`。这个小站入口由小站自己的登录保护；本项目不依赖小站、登录或特定账号。

| 接口 | 用途 |
| --- | --- |
| `/` | 阁楼画面 |
| `/api/status` | 工具状态及 Unix 时间戳 |
| `/api/healthz` | 本机健康检查 |

**默认只监听 `127.0.0.1:8889`，不自带登录。需要外网访问时，请自行配置反向代理、HTTPS 和访问认证。** 不要直接把无认证后端暴露到公网。

反向代理可将 `/office/` 转发到 `http://127.0.0.1:8889/`，去掉前缀；将 `/office` 重定向到 `/office/`。HTML 中的样式、脚本、图集和 `api/status` 都使用相对地址，直接访问与前缀访问均正常。项目没有跨域代理或第三方服务依赖。

## 安装与运行依赖

本机已经有 D 盘虚拟环境，无需重装。其他 Windows 机器可使用自己的真实 Python 安装路径替换下面的 `D:\AITools\py312\python.exe`，不要使用指向 Microsoft Store 的空壳命令。

```powershell
& 'D:\AITools\py312\python.exe' -m venv 'D:\ai-office\venv'
& 'D:\ai-office\venv\Scripts\python.exe' -m pip install --cache-dir 'D:\pip_cache' -r 'D:\ai-office\requirements.txt'
```

第一行：`&` 执行引号中的程序；`-m` 表示运行 Python 模块，`venv` 创建隔离环境，末尾路径为 D 盘环境目录。第二行：`pip install` 安装依赖；`--cache-dir` 把下载缓存放在 D 盘；`-r` 从 `requirements.txt` 读取依赖清单。这些命令会下载并写入 D 盘文件，不修改系统代理或开机自启。安装后使用 `start.vbs` 隐藏启动即可。

后端运行只需 FastAPI、Uvicorn、psutil；不需要 Pillow 或浏览器自动化依赖。`requirements.txt` 记录本次已实测的运行版本。

## 检测清单与扩展接口

统一配置：**`config/tools.json`**。每个工具包含唯一 `id`、显示 `name` 和 `rules`。同一工具的多条规则是“任一命中即干活”。修改配置后重启办公室生效。

| 工具 | 当前识别规则 |
| --- | --- |
| Codex | `~/.codex/sessions/YYYY/MM/DD/*.jsonl` 近 3 天目录内、最近 30 秒修改的会话；或 `codex.exe` / `codex`，排除命令行中的 `app-server`、`exec-server`、`mcp-server`、`sandbox` |
| CodeBuddy | `node.exe` / `node`，命令行同时包含 `codebuddy-code`、`bin`、`codebuddy`；或原生 `codebuddy.exe` / `codebuddy` |
| Claude Code（DeepSeek） | 原生 `claude.exe` / `claude`；或 `node.exe` / `node`，命令行同时包含 `@anthropic-ai`、`claude-code` |

`process` 规则用 `names` 指定进程名；可用 `contains_all` 要求命令行包含所有片段，用 `exclude` 排除后台服务。`recent_files` 规则用 `root`、`pattern`、`active_seconds` 设置文件活动窗口，可用 `dated_directories` 和 `lookback_days` 扫日期目录。

检测保留原有语义：**CLI 进程存在也计作干活，包含等待输入的时间；会话文件刚更新属于活动推断。** 这不是模型逐 token 生成的精确检测，也不判断 Claude 的实际模型提供商。进程命令行只在本机内存匹配，接口仅返回工具 ID、名字和状态。

未来加工具先在配置里加一项即可扩展后端接口。需要特殊检测方式时，在 `detectors.py` 的 `RULE_DETECTORS` 注册 `callable(rule, processes, now) -> bool`。新增可见角色还需要开发者在 `static/office.js` 的 `DESKS`、`roomLayout()` 安排工位、素材和休息位置；本次不提供“自定义添加人物”的界面。

## 原创画面与素材

所有家具和人物均由 `scripts/draw_assets.py` 原创绘制，屋顶、天窗、灯串、地板、地毯和楼梯由 Canvas 绘制；没有下载或复制外部美术素材。图集包含 **225 个精灵，6 套人物各 36 帧**：四方向行走、敲键盘、喝茶、看书、打盹和站立。

`static/assets/residents.json` 保存配色与发型；`resident-*.png` 保存六个人物单独的站立图。当前使用 moss（眼镜、绿衣）、sky（卷发、蓝衣）、sun（短波波头、黄衣），备用 lilac（发髻）、rose（浅色短发）、fern（帽子）。绘制脚本使用固定种子，构建结果可复现。

1920×1080、浏览器 100% 缩放下，画布为 **480×244 原始像素，以 4 倍整数显示**，角色精灵框为 104×144 屏幕像素，桌子为 312×192；整间阁楼无需拖动。画布关闭平滑，屋顶斜线也采用逐像素绘制。其他窗口按整数倍重新计算房间尺寸，手机竖屏重新排列家具；名字使用独立文本标签保持可读。减少动态效果的系统偏好会减少原地动作，状态变化仍保留连续行走。

重绘素材仅需现有 D 盘 Python 与 Pillow；生成结果已提交，正常运行无需重绘。

```powershell
& 'D:\AITools\py312\python.exe' 'D:\ai-office\scripts\draw_assets.py'
```

这个命令运行素材绘制脚本，覆盖本项目 `static/assets/` 下的图集、人物 PNG 和人物配置，不连接外网。若重绘机器缺少 Pillow，可按前面的安装方式读取 `requirements-art.txt`，缓存仍指定 D 盘。

## 验证与交付截图

```powershell
& 'D:\ai-office\venv\Scripts\python.exe' 'D:\ai-office\tests\test_detectors.py'
node tests/verify-office.cjs
```

第一行使用隔离环境运行检测回归，验证进程白名单、后台排除、文件活动窗口、配置错误以及真实本机接口。临时文件只写本项目 `.browser-tmp/`，不启动或停止其他工具。

第二行中的 `node` 是 JavaScript 运行程序；`tests/verify-office.cjs` 是浏览器验收脚本，应在项目目录执行。脚本启动隐藏的无头 Edge，临时拦截浏览器中的状态请求，验证连续行走、家具碰撞、随机休息活动、打字帧、显示器、断线恢复、3 秒刷新、桌面/手机布局及 `/office/` 相对资源。模拟状态不写入后端，生产页面不含模拟开关。

浏览器测试默认复用 `D:/tools/PixelAgents/node_modules/playwright` 与系统 Edge；可用环境变量 `PLAYWRIGHT_MODULE`、`OFFICE_BROWSER` 指向其他已有安装。`tests/verify-site.cjs` 可在提供现有小站凭据的进程内环境下，只读验证真实小站反代和登录边界；不生成或保存凭据。

最终截图均为 **1920×1080**：

- `preview/attic-idle.png`：全部空闲，各自在阁楼休息。
- `preview/attic-work.png`：全部干活，全部到位、显示器亮起。

手机和失败诊断图仅写入 `.browser-tmp/`，交付前清理；`preview/rpg2.png` 为保留的历史参考图，不是素材来源。

## 文件结构

```text
server_app.py          独立 FastAPI 后端，只监听本机 8889
config/tools.json      工具检测规则清单
detectors.py           配置校验、规则匹配和扩展接口
static/                Canvas 场景、样式、六套原创像素人物
scripts/draw_assets.py 可复现的原创素材绘制脚本
tests/                 检测回归与隐藏浏览器验收
preview/               最终两张截图及保留的 rpg2.png
start.vbs / stop.vbs   本机隐藏启停
requirements*.txt     运行依赖 / 可选素材构建依赖
```
