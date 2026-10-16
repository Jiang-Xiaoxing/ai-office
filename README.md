# 暖灯小阁

阁楼工作室，一个仅限本机使用的像素 AI 工具状态看板。背景使用已确认的 `bg-c.png` 与 `bg-c-night.png`，最多显示六位伙伴，按真实检测状态回工位或休息。

小林、小周、小月、小禾、小棠、小白均使用用户提供的 imagegen 原始精灵表，每套 24 帧、单帧 64×64。Codex、OpenRouter、DeepSeek 保留固定角色索引，其余工具使用空余角色；名字和服务仍按检测清单显示。干活时走回自己的座位敲键盘，空闲时喝茶、看书、打盹；无法识别服务的 `claude-code-other` 仅在检测到工作时出现在房间与底栏，空闲时均隐藏。前端每 3 秒读取一次 `api/status`，断线保留上次状态，慢请求最多等待 15 秒，同一页面只保留一个在途请求。

## 自动天气与光线

天气是阁楼的场景氛围，不接入真实气象数据，不访问第三方服务，也没有手动开关。首次打开立即按**当前北京时间**选择天气，浏览器所在时区不影响选择：

- **06:00–18:00**：每个整点在晴、阴、雨、雪之间轮换。同一天、同一小时的结果固定，刷新页面不会重新抽取。
- **18:00–次日 06:00**：保持夜晚，天窗显示夜空、星星和月牙，吊灯与落地灯周围呈现暖光。
- 页面保持打开时，天气变化用 **60 秒平滑过渡**；后台标签页恢复时重新核对时刻。

晴天保持已选背景原图的明亮绿植色彩；阴天降低室内亮度并偏灰；雨天偏暗、偏湿冷，地板有淡淡反光；雪天为冷白光。两扇天窗的玻璃区域使用原生像素遮罩，替换天空时保留窗框与横梁。雨滴、雪花为轻量 Canvas 像素动画，只在窗外显示；系统偏好减少动画时保留静态雨雪。人物、标签和状态同步保留；夜晚直接使用提供的夜景图。

`static/weather.js` 独立处理北京时间、小时选择、渐变权重、天窗遮罩、光线和粒子；不修改 `config/tools.json` 或后端接口。光线图在加载时生成并缓存，绘制使用 480×270 原生像素网格，天气画布只创建一次。

## 阁楼互动

界面使用统一的暖木框、纸质底板和像素压边，日夜自动适配。桌面顶栏高 56px、标题 28px，其余顶底栏文字至少 18px；每位伙伴一枚状态签。顶栏小木签只提示点击位置，不是按钮。平时不再显示头顶大名牌，只留一枚贴着人物的小状态图标（敲键盘、喝茶、看书、打盹、走路），随人物实时移动；鼠标悬停或点击人物时才在头顶弹出暖纸小名牌，跟随人物坐标、始终留在房间内、多张同时弹出也不重叠，移开鼠标、再点一次或点击空白处即收起，字号至少 16px，窗口缩放后重新测量。极小手机窗口仅显示工具短名，允许横向避让；完整名字及状态保留在底栏和人物消息中。顶栏和底栏独立占位，房间在两栏之间保持完整比例并尽量放大，余边使用日夜背景指定颜色。参考与取舍见 [像素 UI 调研](docs/pixel-ui-research.md)，验收截图为 `preview/ui-day.png`、`preview/ui-night.png`、`preview/ui-narrow.png`。

点击像素伙伴打招呼，屋顶区域会显示工具完整名字、最新状态和一句预设回应，人物上方飘出像素爱心。工作、走路、休息动作保持原样，消息随下一次状态同步更新；断线时明确标记“上次状态”。这是本地场景反馈，不调用 AI 对话。

点击左侧、中央或右下角的大盆栽，只给点中的那一盆浇水；点击左下角茶桌，桌上会出现热茶。每盆独立冷却，快速连点不会堆叠特效，也不影响工具真实状态。顶栏没有浇水或泡茶按钮。

花盆、茶桌区域从 `static/interaction-zones.json` 读取，使用 480×270 背景原生网格。`plants` 的 `x/y/w/h` 定义每盆矩形；`teaTable` 定义茶桌矩形及 `effectX/effectY` 热茶位置。更换背景后按新图修改该 JSON 并刷新页面，无需修改互动代码；当前坐标由 `static/assets/layout.json` 的 `bg-c` 项换算，覆盖五盆落地绿植、十九盆装饰绿植和茶桌；重叠子区域按优先级命中。

所有入口支持 Tab 聚焦、Enter/空格触发。人物不显示浏览器虚线框，鼠标选中和键盘聚焦改用名牌金色描边（名牌未展开时也保留在悬停态）；花盆与茶桌用像素底边提示键盘位置。按 Escape、点击消息的关闭按钮或画布空白处可收起消息，消息也会在约 6.5 秒后自动消失。窗口缩放后入口跟随画面，减少动画偏好保留静态反馈。没有账号、外网请求、音效、每日任务或持久存档。调研来源与取舍见 [互动调研](docs/interaction-research.md)。

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
| Codex | 任意 `codex.exe` / `codex` 进程：`codex exec`、CLI 交互、桌面端后台（`app-server`、`exec-server` 等）都算干活，不依赖安装路径、版本哈希或启动文件 |
| Claude Code (OpenRouter)，ID `openrouter` | 任一 Claude Code CLI，且其进程环境 / 命令行的 base URL 或模型名指向 openrouter |
| Claude Code（DeepSeek），ID `claude-code` | 任一 Claude Code CLI，且其 base URL / 模型名指向 deepseek；模型名含 `flash` 时名牌与底栏标注 “Flash” |
| Claude Code，ID `claude-code-other` | 其余认不出服务的 Claude Code CLI（例如直接运行 `claude`、未知 base URL 或模型名） |

`process` 规则用 `names` 指定进程名；可用 `contains_all` 要求命令行包含所有片段，用 `exclude` 排除后台服务。`recent_files` 规则用 `root`、`pattern`、`active_seconds` 设置文件活动窗口，可用 `dated_directories` 和 `lookback_days` 扫日期目录。

`claude_session` 规则用 `provider` 指定 `openrouter`、`deepseek` 或 `other`。检测器先找原生 `claude.exe` / `claude` 或运行 `@anthropic-ai/claude-code/` 的 Node 进程：任一在运行就计作干活（含等待输入的时间），再按「进程环境变量里的 base URL → 模型名 → 进程及祖先进程命令行」的顺序判断实际服务，归到对应角色；认不出服务的归到 `other`，同样显示干活而不是摸鱼。只读取 `ANTHROPIC_BASE_URL`、`ANTHROPIC_MODEL` 等非敏感键，绝不读取 API Key 或令牌，也不导出进程参数。检测不依赖任何 `cc-*.cmd` 文件名，以后新增 `cc-deepseek-xxx.cmd` 等启动文件无需改代码或配置。祖先进程创建时间晚于子进程时不关联，防止 PID 重用误判；只剩启动窗口而没有 Claude CLI 时计为空闲。

检测保留原有语义：**可识别归属的 CLI 进程存在也计作干活，包含等待输入的时间。** 这不是模型逐 token 生成的精确检测。Claude Code 的归属依据进程环境与命令行里的 base URL / 模型名，Codex 依据进程名，都不依赖启动文件或安装路径。进程环境与命令行只在本机内存匹配，不读取启动脚本内容或 API Key，接口仅返回工具 ID、名字、状态和可选的 Flash 标记。

新增工具只需在配置里加一项并重启，状态接口、人物标签和底栏会自动读取工具清单，无需修改前端。需要特殊检测方式时，在 `detectors.py` 的 `RULE_DETECTORS` 注册 `callable(rule, processes, now) -> bool 或匹配字典`。

## 如何添加新工具

**在 `config/tools.json` 加一行工具配置，重启后自动多一个像素人和工位，上限六人。** 例如在已有 `tools` 数组最后一项后补逗号，再追加这一项（将 `my-tool.exe` 换成真实进程名）：

```json
{ "id": "my-tool", "name": "我的工具", "rules": [{ "type": "process", "names": ["my-tool.exe"] }] }
```

六个工位均由背景提供，位置与通道障碍来自 `layout.json`。新增工具按配置顺序使用空余工位与六套精灵，不再用代码拼画人物或追加桌椅。超出六人的工具继续在底栏显示，可横向滚动；控制台只在超出名单变化时提示。

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
- `claude_session` 必填 `provider`，可填 `openrouter`、`deepseek` 或 `other`，分别对应前文的 OpenRouter、DeepSeek 与「认不出服务的通用 Claude Code」角色；识别依据进程环境与命令行的 base URL / 模型名，不依赖启动文件名。

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

普通 `process` 规则只检查进程自身的命令行，不向上查父进程。要区分 Claude Code 使用的服务，请使用 `claude_session` 规则（依据进程环境与命令行的 base URL / 模型名判断）；不要给 `claude.exe` 加一条只匹配进程名的宽泛 `process` 规则，否则它会命中所有 Claude Code，绕过服务归属。

### 3. 重启并确认生效

保存配置后，先双击项目目录的 `stop.vbs`，确认办公室已停止，再双击 `start.vbs`，等待启动就绪后打开或刷新 **http://127.0.0.1:8889/**。配置在后端启动时读取，单独刷新网页不会重新加载配置。可以打开 **http://127.0.0.1:8889/api/status**，确认 `agents` 数组中出现新增的 `id`、`name` 和状态：命中规则为 `working`，否则为 `idle`。

刷新页面后，新工具会自动出现在底栏；在六人上限内，还会自动得到人物标签、独立人物外观和工位。命中规则时走到工位敲键盘，空闲时去看书、喝茶或打盹。删掉工具配置并重启后，对应人物和标签也会移除；后台保留空配置或超过六项时画面仍能正常运行。

## 背景与人物素材

`static/assets/bg-c.png`、`bg-c-night.png`、`layout.json` 从 `D:\ai-office-bg` 原样复制；`static/assets/sprites/` 下六张 PNG 与 manifest 从 `D:\ai-office-chars\sprites` 原样复制。源目录不参与运行，不会被写入。`import-sha256.json` 记录导入文件的哈希，测试同时核对 144 帧及全部交互坐标。

工位使用布局给出的 `sprite.groundAnchor`（脚底）和 `sprite.topLeft`，不把椅子坐点当脚底。人物取完整 64×64 帧，四方向行走使用对应行，工作使用第 5 行，喝茶、阅读、打盹使用第 6 行。座位和路线上保留人物间距，通道逐人放行；休息点被堵时寻找可到达的空位，并按需让路。休息坐标由 bg-c 家具布局换算：喝茶在茶桌或阅读边桌旁，看书在沙发、扶手椅或书架旁，打盹在沙发上；中央走道和楼梯口不设休息点。没有空位时保留当前位置对应的活动，等当前行走结束再闲逛。窄窗底栏只省略工具长名字，完整名字可悬停查看，状态文字保持完整。旧 `draw_assets.py` 与旧图集仅作为历史文件保留，当前页面不加载或生成这些人物。

房间保持原图比例，在 56px 顶栏与 48px 底栏之间尽量铺满宽高，两栏独立占位。1920×1080 使用 4 倍显示，1024×600 等比缩小到约 2.133 倍；房间容器居中裁去少量屋顶和地板边缘，人物与工位保持可见，没有页面滚动条。极扁窗口每侧最多裁去 20 个原生像素，竖屏保留完整房间宽度。Canvas 使用原生 480×270 网格、关闭绘制平滑；CSS 使用像素采样。窗口缩放只改变投影，不传送人物，点击区按可见范围裁切。日景余边为 `#382B29`，夜景为 `#171A30`。

名牌仅在悬停、点击或键盘聚焦时弹出，跟随人物实际外框，避让其他名牌、人物和两栏。人物身份来自工具清单；素材角色名可在调试快照的 `characterName` 查看。减少动态偏好会冻结原地动作与天气粒子，状态变化仍保留行走。

前端隐藏时暂停动画帧和轮询，恢复时只建立一条动画循环与一个轮询计时器；离开页面释放请求、监听器、ResizeObserver、互动节点与天气画布。后端只合并正在执行的检测，不缓存历史状态，不改变 `detectors.py` 或 `config/tools.json` 的识别规则。

## 验证与交付截图

在项目目录运行：

```powershell
node tests/run-all.cjs
```

`node` 是已有的 JavaScript 运行程序，`tests/run-all.cjs` 是当前项目的测试运行器。它复用 D 盘 Python、Playwright 和系统 Edge，在随机临时端口运行隔离服务，验证后关闭，不操作 8889、不装包或改系统设置。覆盖检测规则、并发断连、导入素材、天气、行走、六人容量、悬停名牌、逐盆浇水、泡茶、窄窗、代理相对路径、持续运行内存和页面退出清理。

测试浏览器的模拟状态与时间不会写入生产配置。每个测试文件仍限时 240 秒；动态房间与工具清单拆为 `verify-dynamic.cjs`、`verify-dynamic-tools.cjs`，多尺寸完整往返单独放在 `verify-office-responsive.cjs`，保留全部行为断言，并逐文件输出耗时。动态等待会检查路线与待重试目标都已清空，失败时报告未到位角色。

历史截图验证后还原，当前实际服务交付见 `preview/final-day.png`、`final-night.png`、`final-narrow.png`、`final-hover.png`。`node tests/capture-final.cjs` 重新生成这些图，并额外生成 `preview/final-narrow-four-tools.png`：仅在该浏览器测试场景将兜底工具置为工作，验证 1024×600 四个标签完整；实际服务的空闲兜底工具仍隐藏。截图检查按实际画布投影核对原生像素颜色，适配最大等比缩放，不再假设屏幕始终是 4 倍整数。内存证据与重启结果见 [阁楼交付记录](docs/bg-c-delivery.md)。

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
