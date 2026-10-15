# AI 办公室

姜小星的温馨阁楼工作室，一个独立运行的像素 AI 工具状态看板。主背景使用已选定的晴天绿植图 `preview/attic-bg-2.png`，原样复制到 `static/assets/attic-bg-2.png`。人物在图中已有的三个工位和休息区活动。

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

## 背景与人物素材

背景采用用户已选定的晴天绿植阁楼图，桌子、椅子、沙发、绿植和楼梯均已包含在图中，页面不再叠加另一套家具。工位依次对齐左上、右上和右下的椅子；干活时只在已有显示器内部叠加亮屏和代码动画。`static/office.js` 的 `roomLayout()` 保存按背景测量的座位、屏幕、障碍物与休息点。

人物由 `scripts/draw_assets.py` 绘制。既有图集包含 **225 个精灵，6 套人物各 36 帧**：四方向行走、敲键盘、喝茶、看书、打盹和站立。图集中的旧家具仍作为历史素材保留，当前场景不绘制。

`static/assets/residents.json` 保存配色与发型；`resident-*.png` 保存六个人物单独的站立图。当前使用 moss（眼镜、绿衣）、sky（卷发、蓝衣）、sun（短波波头、黄衣），备用 lilac（发髻）、rose（浅色短发）、fern（帽子）。绘制脚本使用固定种子，构建结果可复现。

背景 PNG 为 1920×1080，实测与其 **480×270 像素网格的 4 倍最近邻放大完全一致**。1920×1080、浏览器 100% 缩放下，画布按这一网格 **4 倍整数显示，完整铺满一屏**；44px 顶栏与 36px 底栏位于背景原有的深色留白，不压缩或拉伸房间。其他窗口保持完整背景和原有家具位置，选择能放下的最大整数倍，剩余区域用背景边缘色居中留白。小于原生网格的窗口先按整数步长最近邻抽样，再整数倍显示；不拉伸变形，所有 Canvas 绘制和 CSS 显示均关闭平滑。调整窗口只改变投影，保留人物位置与行走路线。

人物名字使用 24px、副标题和状态使用 20px，比原版约放大 2 倍；窄屏使用 16px 名字与 14px 状态。标签自动避让其他标签和人物，不遮住人物。减少动态效果的系统偏好会减少原地动作，状态变化仍保留连续行走。

重绘素材仅需现有 D 盘 Python 与 Pillow；生成结果已提交，正常运行无需重绘。

```powershell
& 'D:\AITools\py312\python.exe' 'D:\ai-office\scripts\draw_assets.py'
```

这个命令运行素材绘制脚本，覆盖本项目 `static/assets/` 下的图集、人物 PNG 和人物配置，不连接外网。若重绘机器缺少 Pillow，可按前面的安装方式读取 `requirements-art.txt`，缓存仍指定 D 盘。

## 验证与交付截图

```powershell
& 'D:\ai-office\venv\Scripts\python.exe' 'D:\ai-office\tests\test_detectors.py'
node tests/verify-office.cjs
node tests/verify-labels.cjs
& 'D:\AITools\py312\python.exe' 'D:\ai-office\tests\verify_screenshots.py'
```

第一行使用隔离环境运行检测回归，验证进程白名单、后台排除、文件活动窗口、配置错误以及真实本机接口。临时文件只写本项目 `.browser-tmp/`，不启动或停止其他工具。

第二行中的 `node` 是 JavaScript 运行程序；`tests/verify-office.cjs` 是浏览器验收脚本，应在项目目录执行。脚本启动隐藏的无头 Edge，临时拦截浏览器中的状态请求，验证背景复制一致、人物与屏幕以外超过 12 万个背景像素未被重绘、连续行走、家具碰撞、标签不遮人物且桌面文字不小于 16px、随机休息活动、打字帧、显示器、断线恢复、3 秒刷新、桌面/手机布局及 `/office/` 相对资源。模拟状态不写入后端，生产页面不含模拟开关。

第三行运行标签拥挤场景检查，并覆盖两张最终截图，将文字区域的坐标临时写入 `.browser-tmp/`。第四行使用已有 D 盘 Python 与 Pillow，核对截图为 1920×1080，避开文字区域后逐块验证 4×4 像素无平滑；需接着第三行执行。检查只读本地图片，不访问网络。浏览器关闭并完成图片核对后，可以清理 `.browser-tmp/` 中的临时图和坐标文件。

浏览器测试默认复用 `D:/tools/PixelAgents/node_modules/playwright` 与系统 Edge；可用环境变量 `PLAYWRIGHT_MODULE`、`OFFICE_BROWSER` 指向其他已有安装。`tests/verify-site.cjs` 可在提供现有小站凭据的进程内环境下，只读验证真实小站反代和登录边界；不生成或保存凭据。

最终截图均为 **1920×1080**：

- `preview/attic-idle.png`：全部空闲，各自在阁楼休息。
- `preview/attic-work.png`：全部干活，全部到位、显示器亮起。

手机和失败诊断图仅写入 `.browser-tmp/`，交付前清理；保留 `preview/rpg2.png`、`attic-bg-1.png`、`attic-bg-2.png` 和所有 `*-reject.png` 参考图。

## 文件结构

```text
server_app.py          独立 FastAPI 后端，只监听本机 8889
config/tools.json      工具检测规则清单
detectors.py           配置校验、规则匹配和扩展接口
static/                晴天绿植背景、Canvas 场景、样式、六套像素人物
scripts/draw_assets.py 可复现的原创素材绘制脚本
tests/                 检测回归与隐藏浏览器验收
preview/               最终两张截图及保留的背景和历史参考图
start.vbs / stop.vbs   本机隐藏启停
requirements*.txt     运行依赖 / 可选素材构建依赖
```
