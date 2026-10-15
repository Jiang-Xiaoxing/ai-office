# 暖灯小阁

阁楼工作室，一个独立运行的像素 AI 工具状态看板。沿用 `static/assets/attic-bg-2.png` 和现有人物素材，本轮不修改这些图片。人物和工位随配置自动生成，最多显示六人，在工位和休息区活动。

Codex、Claude Code (OpenRouter)、Claude Code（DeepSeek）各有一个原创像素角色。OpenRouter 沿用原蓝衣人物和右上工位，DeepSeek 仍使用黄衣人物和右下工位。干活时沿家具间的通道走回自己的座位，坐下敲键盘，显示器亮起；空闲时离开工位，在看书、喝茶、打盹之间随机切换。前端每 3 秒读取一次 `api/status`，断线时保留最后一次状态并自动重连。Windows 重启后的首次进程扫描可能较慢，单次请求最多等待 15 秒；等待期间不会堆积重复扫描请求。

## 自动天气与光线

天气是阁楼的场景氛围，不接入真实气象数据，不访问第三方服务，也没有手动开关。首次打开立即按**当前北京时间**选择天气，浏览器所在时区不影响选择：

- **06:00–18:00**：每个整点在晴、阴、雨、雪之间轮换。同一天、同一小时的结果固定，刷新页面不会重新抽取。
- **18:00–次日 06:00**：保持夜晚，天窗显示夜空、星星和月牙，吊灯与落地灯周围呈现暖光。
- 页面保持打开时，天气变化用 **60 秒平滑过渡**；后台标签页恢复时重新核对时刻。

晴天保持已选背景原图的明亮绿植色彩；阴天降低室内亮度并偏灰；雨天偏暗、偏湿冷，地板有淡淡反光；雪天为冷白光。两扇天窗的玻璃区域使用原生像素遮罩，替换天空时保留窗框与横梁。雨滴、雪花为轻量 Canvas 像素动画，只在窗外显示；系统偏好减少动画时保留静态雨雪。人物、亮屏、标签和状态同步继续使用既有逻辑。

`static/weather.js` 独立处理北京时间、小时选择、渐变权重、天窗遮罩、光线和粒子；不修改 `config/tools.json` 或后端接口。光线图在加载时生成并缓存，绘制仍使用 480×270 像素网格及整数缩放。

## 阁楼互动

界面使用统一的暖木框、纸质底板和像素压边，日夜自动适配。桌面顶栏高 56px、标题 28px，其余顶底栏文字至少 18px；每位伙伴一枚状态签。顶栏小木签只提示点击位置，不是按钮。人物名牌在头顶上方跟随，拥挤时向上分层，至少保留 8px 间距，字号至少 16px；窗口缩放后重新测量。极小手机窗口仅显示工具短名，允许横向避让；完整名字及状态保留在底栏和人物消息中。1920×1080 保持 4 倍像素显示，1024×600 使用 2 倍整数缩放。参考与取舍见 [像素 UI 调研](docs/pixel-ui-research.md)，验收截图为 `preview/ui-day.png`、`preview/ui-night.png`、`preview/ui-narrow.png`。

点击像素伙伴打招呼，屋顶区域会显示工具完整名字、最新状态和一句预设回应，人物上方飘出像素爱心。工作、走路、休息动作保持原样，消息随下一次状态同步更新；断线时明确标记“上次状态”。这是本地场景反馈，不调用 AI 对话。

点击左侧、中央或右下角的大盆栽，只给点中的那一盆浇水；点击左下角茶桌，桌上会出现热茶。每盆独立冷却，快速连点不会堆叠特效，也不影响工具真实状态。顶栏没有浇水或泡茶按钮。

花盆、茶桌区域从 `static/interaction-zones.json` 读取，使用 480×270 背景原生网格。`plants` 的 `x/y/w/h` 定义每盆矩形；`teaTable` 定义茶桌矩形及 `effectX/effectY` 热茶位置。更换背景后按新图修改该 JSON 并刷新页面，无需修改互动代码；当前坐标匹配旧背景。

所有入口支持 Tab 聚焦、Enter/空格触发。人物不显示浏览器虚线框，鼠标选中和键盘聚焦改用名牌金色描边；花盆与茶桌用像素底边提示键盘位置。按 Escape、点击消息的关闭按钮或画布空白处可收起消息，消息也会在约 6.5 秒后自动消失。窗口缩放后入口跟随画面，减少动画偏好保留静态反馈。没有账号、外网请求、音效、每日任务或持久存档。调研来源与取舍见 [互动调研](docs/interaction-research.md)。

图标由内置图像生成重画，代码只负责缩放和八色量化。16/32px 已检查屋顶轮廓和暖光天窗；图标输出、来源与提示词见 [图标说明](docs/icon-generation.md)。

## 本机使用

双击 `start.vbs` 启动，浏览器打开 **http://127.0.0.1:8889/**。双击 `stop.vbs` 停止。脚本以隐藏窗口运行；不会设置开机自启或修改系统代理。

已有私人小站的入口为导航栏「暖灯小阁」，路径 `/office/`。这个小站入口由小站自己的登录保护；本项目不依赖小站、登录或特定账号。

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
| Claude Code (OpenRouter)，ID `openrouter` | Claude CLI 自身或最近的启动祖先进程命令行包含 `cc-openrouter.cmd`，对应本机 `D:\Tools\ClaudeCode\cc-openrouter.cmd` |
| Claude Code（DeepSeek），ID `claude-code` | Claude CLI 自身或最近的启动祖先进程命令行包含 `cc-deepseek.cmd`，对应本机 `D:\Tools\ClaudeCode\cc-deepseek.cmd` |

`process` 规则用 `names` 指定进程名；可用 `contains_all` 要求命令行包含所有片段，用 `exclude` 排除后台服务。`recent_files` 规则用 `root`、`pattern`、`active_seconds` 设置文件活动窗口，可用 `dated_directories` 和 `lookback_days` 扫日期目录。

`claude_session` 规则用 `provider` 指定 `openrouter` 或 `deepseek`。先找原生 `claude.exe` / `claude` 或运行 `@anthropic-ai/claude-code/` 的 Node 进程，再沿 PID / 父 PID 最多检查 32 层，使用最近一层明确的启动脚本标记区分。脚本名按完整名称、不区分大小写匹配，`.cmd.bak` 等不算；遇到两种标记并存，或因祖先进程不可读、已退出等原因未找到标记时，不归属任何一方，防止两个角色一起误亮。祖先进程创建时间晚于子进程时也不关联，防止 PID 重用误判。只剩启动窗口而没有 Claude CLI 时计为空闲。

检测保留原有语义：**可识别归属的 CLI 进程存在也计作干活，包含等待输入的时间；会话文件刚更新属于活动推断。** 这不是模型逐 token 生成的精确检测。Claude 归属依据启动入口，不查询实际模型或远端服务；如绕过上述脚本启动且没有脚本标记，会显示空闲。进程命令行只在本机内存匹配，不读取启动脚本内容、环境变量或 API Key，接口仅返回工具 ID、名字和状态。

新增工具只需在配置里加一项并重启，状态接口、人物标签和底栏会自动读取工具清单，无需修改前端。需要特殊检测方式时，在 `detectors.py` 的 `RULE_DETECTORS` 注册 `callable(rule, processes, now) -> bool`。

## 如何添加新工具

**在 `config/tools.json` 加一行工具配置，重启后自动多一个像素人和工位，上限六人。** 例如在已有 `tools` 数组最后一项后补逗号，再追加这一项（将 `my-tool.exe` 换成真实进程名）：

```json
{ "id": "my-tool", "name": "我的工具", "rules": [{ "type": "process", "names": ["my-tool.exe"] }] }
```

原有 Codex、OpenRouter、DeepSeek 保留各自的位置和外观；新增工具按配置顺序使用未占用的工位与人物样式，原三项保留时依次启用后墙中间的紫衣发髻、前沿楼梯左侧的粉衣浅色短发、前沿楼梯右侧的绿衣帽子人物。新增桌椅电脑只在对应工位有人时出现；三个新增位置均靠墙，中央地板、楼梯口与沙发区保持通畅。配置的前六项进入画面，超过六项的工具仍在底栏显示状态（空间不足可横向滚动），浏览器控制台会提示上限和超出项，不会创建重叠工位。

### 1. 在配置中新增工具

打开 `config/tools.json`，在顶层 `tools` 数组里追加工具对象，保留原有工具。每项使用以下实际字段：

| 字段 | 必填情况 | 含义 |
| --- | --- | --- |
| `id` | 必填 | 非空且在整个配置中唯一的工具标识，状态接口和前端通过它对应工具；建议使用英文、数字和连字符。 |
| `name` | 必填 | 非空的显示名，同时用于人物标签和底栏；末尾括号中的内容会作为人物标签副标题。 |
| `rules` | 必填 | 非空的识别规则数组；其中任意一条规则命中，就显示为干活。 |
| `rules[].type` | 必填 | 识别方式：`process`（进程）、`recent_files`（近期文件活动）或 `claude_session`（当前支持的 Claude 启动入口）。 |
| `rules[].names` | `process` 必填 | 进程名数组，例如 `["claude.exe", "claude"]`；完整匹配进程名，不区分大小写，命中任一名称即可。 |
| `rules[].contains_all` | `process` 可选 | 命令行关键字数组；同一个进程的命令行必须包含其中所有片段。不区分大小写，匹配时将反斜杠统一为 `/`。省略时不限制命令行关键字。 |
| `rules[].exclude` | `process` 可选 | 命令行排除关键字数组；包含任意一个片段就忽略该进程，不区分大小写。省略时不排除。 |

其他识别方式的字段：

- `recent_files` 必填 `root`（监测目录，支持 `~`）；可选 `pattern`（文件匹配式，默认 `*`）、`active_seconds`（最近多少秒内修改算活动，默认 `30`）、`dated_directories`（是否扫描 `年/月/日` 子目录，默认关闭）、`lookback_days`（启用日期目录时扫描的天数，默认 `3`，含当天）。
- `claude_session` 必填 `provider`，目前只能填 `openrouter` 或 `deepseek`，分别识别前文的 `cc-openrouter.cmd` 和 `cc-deepseek.cmd` 启动入口。

### 2. 完整示例：区分两个同名进程

假设两个工具的进程名都是 `claude.exe`，但它们**各自实际进程命令行**分别包含 `project-alpha` 和 `project-beta`。将下面数组中的两项追加到现有 `tools` 数组，保留原有项；不要用这个示例覆盖整个配置文件。

```json
[
  {
    "id": "claude-project-alpha",
    "name": "Claude Code（项目 Alpha）",
    "rules": [
      {
        "type": "process",
        "names": ["claude.exe", "claude"],
        "contains_all": ["project-alpha"],
        "exclude": ["mcp-server", "sandbox"]
      }
    ]
  },
  {
    "id": "claude-project-beta",
    "name": "Claude Code（项目 Beta）",
    "rules": [
      {
        "type": "process",
        "names": ["claude.exe", "claude"],
        "contains_all": ["project-beta"],
        "exclude": ["mcp-server", "sandbox"]
      }
    ]
  }
]
```

请把示例关键字换成实际命令行中互不重叠的片段，例如已有参数中的项目路径或配置文件路径；`exclude` 也按实际需要保留或删除。JSON 中的 Windows 路径可写成 `D:/work/project-alpha`，或将反斜杠转义成 `D:\\work\\project-alpha`。配置使用双引号，不支持注释或末尾多余逗号。

`contains_all` 只是子串匹配，不会给进程自动添加参数，也不会读取工作目录。只从不同目录启动、但命令行没有区别时，不能据此区分；同一个进程若同时包含两组关键字，也可能让两项都亮起。所有必要关键字应放在**同一条规则**的 `contains_all` 中；不要另加一条只匹配 `claude.exe` 的宽泛规则，否则“任一规则命中”的机制会绕过区分条件。

普通 `process` 规则只检查进程自身的命令行，不向上查父进程。如果区分标记只在启动脚本或祖先进程中，当前 OpenRouter / DeepSeek 应继续使用已有的 `claude_session` 配置；不能直接把脚本名填入 `contains_all` 并假定能匹配到子进程。

### 3. 重启并确认生效

保存配置后，先双击项目目录的 `stop.vbs`，确认办公室已停止，再双击 `start.vbs`，等待启动就绪后打开或刷新 **http://127.0.0.1:8889/**。配置在后端启动时读取，单独刷新网页不会重新加载配置。可以打开 **http://127.0.0.1:8889/api/status**，确认 `agents` 数组中出现新增的 `id`、`name` 和状态：命中规则为 `working`，否则为 `idle`。

刷新页面后，新工具会自动出现在底栏；在六人上限内，还会自动得到人物标签、独立人物外观和工位。命中规则时走到工位敲键盘、显示器亮起，空闲时去看书、喝茶或打盹。删掉工具配置并重启后，对应人物、标签和新增家具也会移除；后台保留空配置或超过六项时画面仍能正常运行。

## 背景与人物素材

背景采用用户已选定的晴天绿植阁楼图，原有桌子、椅子、沙发和楼梯保持原图。原三人的工位对齐左上、右上和右下的椅子；新增三个候选工位分别位于后墙中间及前沿楼梯两侧，按占用情况绘制图集里的同款窄桌、电脑和原尺寸绿椅，并纳入天气光线与寻路障碍。占用相应工位时，局部场景移除后墙植物角或楼梯两侧盆栽，为桌子及座位侧面通道腾位；删掉工具后恢复原景，源背景 PNG 不改。干活时在显示器内部叠加亮屏和代码动画。`static/office.js` 的 `roomLayout()` 保存六个候选工位的座位、屏幕、障碍物与休息点，实际人物及工位清单来自 `/api/status`。

人物由 `scripts/draw_assets.py` 绘制。图集包含 **229 个精灵，6 套人物各 36 帧**：四方向行走、敲键盘、喝茶、看书、打盹和站立。新增工位的桌椅使用构建脚本从已选背景中按透明轮廓提取的同款家具，桌面在原生网格内以最近邻收窄至 64 像素，保持木纹、电脑样式和原尺寸绿椅；不带入原位置的墙面或地板，阴影单独叠加。三个局部清场补片取自原图同高度的干净墙板与地板，随对应工位显示。背景文件本身不修改，不需要下载第三方素材。布局依据见 [工位调研](docs/desk-layout-research.md)。

`static/assets/residents.json` 保存配色与发型，并由前端读取分配；`resident-*.png` 保存六个人物单独的站立图。六种样式为 moss（眼镜、绿衣）、sky（卷发、蓝衣）、sun（短波波头、黄衣）、lilac（发髻、紫衣）、rose（浅色短发、粉衣）、fern（帽子、浅绿衣）。每种人物都有同样完整的干活和三种摸鱼动作。绘制脚本使用固定种子，构建结果可复现。

背景 PNG 为 1920×1080，实测与其 **480×270 像素网格的 4 倍最近邻放大完全一致**。1920×1080、浏览器 100% 缩放下，画布按这一网格 **4 倍整数显示，完整铺满一屏**。顶栏高 44px、底栏高 36px，单行、无上下内边距，半透明叠加在背景上下边缘，不遮挡人物和工位；标题保持 28px，其余栏内文字至少 18px。人物标签和重连提示避让两栏。其他窗口保持完整背景和原有家具位置，选择能放下的最大整数倍，剩余区域用背景边缘色居中留白。宽度不超过 1100px 时两栏恢复独立占位，通过换行保留信息并按实际栏高调整画布空间；手机端标题 24px、栏内说明仍为 18px。小于原生网格的窗口先按整数步长最近邻抽样，再整数倍显示；不拉伸变形，所有 Canvas 绘制和 CSS 显示均关闭平滑。调整窗口只改变投影，保留人物位置与行走路线。

人物名字使用 24px、副标题和状态使用 20px，比原版约放大 2 倍；窄屏使用 16px 名字与 14px 状态。标签自动避让其他标签和人物，不遮住人物。减少动态效果的系统偏好会减少原地动作，状态变化仍保留连续行走。

重绘素材仅需现有 D 盘 Python 与 Pillow；生成结果已提交，正常运行无需重绘。

```powershell
& 'D:\AITools\py312\python.exe' 'D:\ai-office\scripts\draw_assets.py'
```

这个命令运行素材绘制脚本，覆盖本项目 `static/assets/` 下的图集、人物 PNG 和人物配置，不连接外网。若重绘机器缺少 Pillow，可按前面的安装方式读取 `requirements-art.txt`，缓存仍指定 D 盘。

## 验证与交付截图

独立 worktree 推荐在本项目目录运行完整验收：

```powershell
node tests/run-all.cjs
```

`node` 是已有的 JavaScript 运行程序，`tests/run-all.cjs` 是相对当前项目目录的测试运行器。它复用已有 D 盘 Python 环境、Playwright 和系统 Edge，在随机临时端口隐藏启动本 checkout 的服务（仅监听 `127.0.0.1`），不启动、停止或修改 8889。测试结束或失败都会关闭临时服务，并还原测试自动生成的三张历史截图。无需安装包或修改系统设置。

完整验收包括下面的原有回归和新增 `verify-interactions.cjs`。`verify-site.cjs` 在此运行器中使用临时鉴权反代夹具，检查本 worktree 的 `/office/` 前缀资源和匿名拒绝；不读取私人小站凭据，不宣称验证了实际小站部署。单独运行该脚本仍可按原方式验证真实小站。

可用进程环境变量 `OFFICE_URL` 指定测试目标地址、`OFFICE_PYTHON` 指定已有 Python；运行器会自动设置。截图检查在运行环境缺少 Pillow 时复用已有 `D:/AITools/py312/python.exe`，可用 `OFFICE_ART_PYTHON` 指定其他已有绘图环境，不会自动装包。新增截图 `preview/interaction-greeting.png`、`interaction-watering.png`、`interaction-tea.png`、`interaction-night.png` 展示鼠标操作后的实际画面，使用仅限测试浏览器的状态和时钟夹具。截图均为 1920×1080，并通过原有逐块 4×4 像素检查。

```powershell
& 'D:\ai-office\venv\Scripts\python.exe' 'D:\ai-office\tests\test_detectors.py'
node tests/verify-office.cjs
node tests/verify-labels.cjs
node tests/weather-clock.cjs
node tests/verify-weather.cjs
node tests/verify-dynamic.cjs
& 'D:\AITools\py312\python.exe' 'D:\ai-office\tests\verify_screenshots.py'
```

第一行使用隔离环境运行检测回归，验证进程白名单、后台排除、文件活动窗口、配置错误以及真实本机接口；还覆盖 DeepSeek / OpenRouter 各自单开、同时运行、原生 / Node CLI、未标记会话、祖先进程、冲突标记与 PID 重用。临时文件只写本项目 `.browser-tmp/`，不启动或停止其他工具。

第二行中的 `node` 是 JavaScript 运行程序；`tests/verify-office.cjs` 是浏览器验收脚本，应在项目目录执行。脚本启动隐藏的无头 Edge，临时拦截浏览器中的状态请求，验证背景复制一致、人物与屏幕以外超过 12 万个背景像素未被重绘、连续行走、家具碰撞、标签不遮人物且桌面文字不小于 16px、随机休息活动、打字帧、显示器、断线恢复、3 秒刷新、桌面/手机布局及 `/office/` 相对资源。`tests/provider_scenarios.py` 将模拟进程送入真实检测函数，浏览器使用所得状态分别验证仅 DeepSeek、仅 OpenRouter、两者同时工作时的角色、亮屏、标签和底栏；单开场景图仅写入 `.browser-tmp/`。模拟状态不写入后端，生产页面不含模拟开关，也不调用模型 API。

第三行运行标签拥挤场景检查，并覆盖两张晴天最终截图，将文字区域的坐标临时写入 `.browser-tmp/`。第四行验证北京时间的清晨、傍晚、跨日与跨年边界、小时内稳定及白天四种天气覆盖。第五行用隐藏无头浏览器验证五种天气、非中国浏览器时区、首次加载与刷新、60 秒渐变、雨雪动画遮罩、减少动画偏好、真实本机状态和小屏适配，并覆盖雨天截图 `attic-weather.png`；模拟时间只注入测试浏览器，不进入生产代码。

新增的 `node tests/verify-dynamic.cjs` 启动隐藏无头 Edge，使用仅限测试浏览器的状态响应验证六人完整动画、原三人位置与外观、工位和休息点、标签避让、八工具溢出、底栏滚动与同步后滚动位置保留、百工具小屏布局、配置换序/删减/改名/清空、重连及慢速首次响应。还按新增家具的实际非透明像素检查其不遮挡原家具、灯、书架、窗、挂画和楼梯；验证中央地板无新增家具、整个中央通路可行走，以及从楼梯口到全部座位和休息点的连通性；标签避让同样保护这些区域。附加参数 `--live6` 或 `--live3` 会读取真实服务与当前配置，分别要求六项或三项工具，并生成 `attic-six.png` 或 `attic-work.png`；不会改写配置、重启服务或伪造工具状态，只固定测试浏览器中的晴天时刻以便看清画面。六人模式要求全部六个真实测试配置检测均为干活。

最后一行使用已有 D 盘 Python 与 Pillow，默认核对四张截图为 1920×1080，避开文字区域后逐块验证 4×4 像素无平滑；需接着前面的截图测试和真实六人截图执行。完成真实配置的六人/三人截图后，可在脚本路径后附加 `attic-six.png attic-work.png`，只检查本次两张图；这两个参数是 `preview/` 下的图片文件名。每张图必须配套使用刚由相应截图脚本写入 `.browser-tmp/` 的文字坐标，截图生成与图片核对按顺序运行。检查只读本地图片，不访问网络。浏览器关闭并完成图片核对后，可以清理临时输出。

浏览器测试默认复用 `D:/tools/PixelAgents/node_modules/playwright` 与系统 Edge；可用环境变量 `PLAYWRIGHT_MODULE`、`OFFICE_BROWSER` 指向其他已有安装。`tests/verify-site.cjs` 可在提供现有小站凭据的进程内环境下，只读验证真实小站反代和登录边界；不生成或保存凭据。

最终截图均为 **1920×1080**：

- `preview/attic-idle.png`：全部空闲，各自在阁楼休息。
- `preview/attic-work.png`：移除临时工具并重启后，恢复原三工具的真实状态。
- `preview/attic-six.png`：临时增加 A/B/C 三个 `explorer.exe` 检测工具，并给原三工具临时增加相同的进程规则，重启后真实接口返回六人全部干活；截图后配置按原始字节恢复并再次重启。
- `preview/attic-weather.png`：雨天天窗、像素雨滴、偏暗湿冷光线与干活状态联动。

手机和失败诊断图仅写入 `.browser-tmp/`，交付前清理；保留 `preview/rpg2.png`、`attic-bg-1.png`、`attic-bg-2.png` 和所有 `*-reject.png` 参考图。

## 文件结构

```text
server_app.py          独立 FastAPI 后端，只监听本机 8889
config/tools.json      工具检测规则清单
detectors.py           配置校验、规则匹配和扩展接口
static/                晴天绿植背景、自动天气与光线、Canvas 场景、样式、六套像素人物
scripts/draw_assets.py 可复现的原创素材绘制脚本
tests/                 检测回归与隐藏浏览器验收
preview/               最终截图及保留的背景和历史参考图
start.vbs / stop.vbs   本机隐藏启停
requirements*.txt     运行依赖 / 可选素材构建依赖
```
