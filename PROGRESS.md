# 进度记录 · 酒店入住工具箱（微信小程序）

> 本文件属于**小程序工程**，不属于只读的规格文档集。
> 规格在 `D:/hotel-miniprogram-spec/`，源项目在 `D:/hotel/`（只读，绝不修改）。
> 每个里程碑用四段式汇报：本步做了什么 / 验收自查 / 与规格的偏差 / 未决问题。
>
> ⚠️ **读法**：本文按时间顺序记录，M0–M7 各节的数字（如「87 passed」「3 个 tab」「35 图标」）
> 是**该里程碑完成当时的快照**，不代表当前状态。**当前口径一律以文末 §M8 为准**。
> 变更需求的制定与落地另见 `DEV-PLAN.md` 与 `CHANGE-REQUESTS.md` §13。

---

## 开工前已确认的决策（老板 2026-10-02 拍板）

| # | 议题 | 决定 |
|---|---|---|
| 1 | AppID | **新建一个专属小程序**，旧小程序完整保留不动。已到位：`wxab6a2e577bcdc940`（2026-10-02 写入 `project.config.json`） |
| 2 | 存储适配层做法 | `engine.ts` **一字不改**；新增 `core/platform.ts`，在 `app.ts` 里把它 import 进来，运行时把 `Storage` 对象的三个方法替换为 wx 实现。理由：同时满足 `03` §4.2 的功能要求与 `07` M2「core/ 无 wx 调用」的约束 |
| 3 | 「浏览器」字样 | 改为「本机」（小程序里没有浏览器），仅限这 2 处平台相关措辞；56/44/15+14 内容一个字不动 |
| 4 | tabBar 形态 | **先尝试自绘悬浮胶囊**（`"custom": true` + `custom-tab-bar` 组件），不成功再退回原生 tabBar |
| 5 | 深色模式 | `app.json` 锁死 `"darkmode": false` |
| 6 | devDependencies | 允许安装（vitest / typescript / miniprogram-api-typings），只装在工程根目录，不进小程序代码包 |

---

## M0 · 工程初始化 ✅ 完成（2026-10-02）

### 产出文件

```
D:/hotel-miniprogram/
├── project.config.json              miniprogramRoot: miniprogram/，启用 typescript 编译插件
├── package.json                     仅 devDeps，零运行时依赖
├── vitest.config.ts                 environment: 'node'
├── .gitignore
├── tsconfig 位于 miniprogram/tsconfig.json（避免与根目录测试配置打架）
├── miniprogram/
│   ├── app.json                     5 页面 + 3 tabBar + darkmode:false
│   ├── app.ts                       App({})，M2 后在此挂载存储适配
│   ├── app.wxss                     设计令牌（定义在 page {}）
│   ├── sitemap.json
│   └── pages/  home · wizard · stay · knowledge · gear（占位）
└── PROGRESS.md                      本文件
```

### 关键说明

- **目录分层**：`miniprogram/` 是上传给微信的代码包；`node_modules/` 与 `tests/` 都在它外面，不进包。
- **尺寸单位**统一 `rpx`（750rpx = 屏宽）：正文 32rpx、点击区 88rpx、卡片圆角 40rpx。
- **CSS 变量写进 `page {}`**，小程序不支持 `:root`；WXSS 只认 `/* */` 注释。
- `app.json` 已设 `"lazyCodeLoading": "requiredComponents"`，后续按页码按需注入。
- **依赖故意锁旧**：`typescript@5.7.3`、`vitest@3.0.5`，与源项目 `D:/hotel` 的版本对齐，避免新版本行为差异。npm 默认会装到 5.x/7.x，**不要**随手升级。
- M0 阶段 `npx vitest run` 会输出 `No test files found`（退出码 1），这是预期——`tests/` 要到 M1 才有内容。刻意**不加** `passWithNoTests`，从 M1 起一旦测试用例消失会立刻报错。

### 验收自查（对照 `07` M0 完成标志）

| 项 | 结果 |
|---|---|
| 开发者工具可编译、无报错 | **待你验证**（我无法运行开发者工具，需你打开项目确认） |
| tabBar 三个 tab 可切换（页面为空白占位） | 配置已就绪，**待真机/模拟器确认** |
| `npx vitest run` 可执行 | ✅ 可跑（此刻 0 用例，输出 `No test files found`，属预期） |
| `npx tsc -p miniprogram --noEmit` | ✅ 通过（typescript 5.7.3 + miniprogram-api-typings） |
| 11 个 JSON 配置文件可解析 | ✅ 全部通过 |

### 待办（阻塞 M0 收尾）

- [ ] 把新注册小程序的 AppID 填进 `project.config.json`（或你在开发者工具「详情 → 基本信息」里改）
- [ ] **尽早启动 ICP 备案**（新小程序备案要 1–20 个工作日，是上线的最长路径，别等代码写完）
- [ ] .mp 后台填好名称/简介/类目（工具 → 效率），并在隐私指引里声明剪切板用途
- [ ] 下一步：等你确认后开工 **M2 引擎层搬运**（38 个用例全绿）

---

## M1 · 数据层搬运 ✅ 完成（2026-10-02）

### 产出文件

| 文件 | 来源 | 改动 |
|---|---|---|
| `miniprogram/core/types.ts` | `D:/hotel/src/types.ts` | **零改动**（`cp` 原样复制） |
| `miniprogram/core/data.ts` | `D:/hotel/src/data.ts` | **零改动**（`cp` 原样复制） |
| `tests/engine.test.ts` | `D:/hotel/tests/engine.test.ts` | **仅 4 行 import 路径** `../src/` → `../miniprogram/core/` |

### 保真验证结果

| 检查项 | 命令 | 结果 |
|---|---|---|
| types.ts 逐字比对 | `diff src/types.ts core/types.ts` | **零差异** ✅ |
| data.ts 逐字比对 | `diff src/data.ts core/data.ts` | **零差异** ✅ |
| 测试文件比对 | `diff` | 仅 4 行 import 路径变化 ✅ |

数据规模实测（`node --experimental-strip-types` 直接加载 `core/data.ts`）：

```
ITEMS = 56        KNOWLEDGE = 44
入住检查 = 5 组 15 项     退房检查 = 6 组 14 项
GEAR_KEYWORDS = 14 分类 / 376 个关键词（每分类 ≥10 且无重复 ✅）
CAT_ORDER = 15   GEAR_CATS = 15   GEAR_TIE_BREAK = 14（两者一一对应 ✅）
CUSTOM_HINTS = 6   知识模块 = 11 个   带 copy 话术 = k41/k42/k43/k44
禁用词命中 = 0 处   缺 source/updated 的条目 = 0 条
```

### 验收自查（对照 `07` M1）

| 完成标志 | 结果 |
|---|---|
| 数据类断言通过（56/44/15/14/关键词） | ✅ 已逐项实测通过 |
| 禁用词断言通过 | ✅ 0 处命中 |
| 与源文件 diff 零差异 | ✅ types.ts 与 data.ts 均为零差异 |

> ⚠️ 此刻 `npx vitest run` **必然失败**：`Failed to load url ../miniprogram/core/engine`。
> 因为 `engine.ts` / `store.ts` 属于 **M2**，`07` M1 的交付物清单里本来就没有它们。M1 的数据断言我已用上面那套实测替代验证，M2 完成后会由 38 个用例正式接管。

---

## 小程序名称候选（2026-10-02）

初次提审的名称被后台提示「可能涉及官方常用词，暂不允许个人使用」。个人主体每年仅 **2 次**免费改名（1 月 1 日重置，审核通过后不可撤销），因此先在这批里挑。

**避开的词**：官方 / 中国 / 国家 / 中心 / 平台 / 指南 / 服务 / 系统 / 工具箱（通用词易被判行业词）。
**建议**：名称里保留「酒店 / 入住 / 退房 / 清单」至少一个，兼顾搜索；总长控制在 14 个字符内（中文算 2）。

| 方向 | 候选 | 特点 |
|---|---|---|
| 个性口语（撞名率低） | 住店小本本 · 出门带齐没 · 退房三回头 · 一晚也要带齐 · 别落充电头 | 有个人色彩，但功能暗示偏弱 |
| 中英混排（推荐） | **StayKit 入住清单** · 入住清单 CheckIn · 退房清单 CheckOut · Hotel Stay 清单 · 住前住后 | 一眼看懂 + 有辨识度 |
| 纯英文（检索偏弱） | StayKit · StayReady · PackAndCheck · RoomKey · InnList · StayNote | 好看，但中文搜索难命中 |

**推荐首选**：`StayKit 入住清单`；**备选**：`住店小本本`、`退房清单 CheckOut`。

### 二轮（2026-10-02）：老板觉得「清单」显得单薄，延伸方案

保留 `StayKit` 前缀，替换后缀以抬升质感（避开「指南 / 工具箱 / 服务 / 系统」等易被判通用词的字眼）：

| 后缀 | 候选 | 气质 |
|---|---|---|
| 手册 | **StayKit 入住手册** | 稳、耐看，最平衡 |
| 锦囊 | StayKit 住店锦囊 | 有点巧思，不呆板 |
| 研究所 | StayKit 入住研究所 | 戏谑、记忆点强 |
| 百科 | StayKit 入住百科 | 突出 44 条知识库 |
| 百宝箱 | StayKit 住店百宝箱 | 强调内容量大 |
| 手账 / 笔记 | StayKit 住店手账、StayKit 入住笔记 | 个人色彩浓 |
| 加前缀 | 一人住店手册、出门住店手册 | 更像私人工具 |

**二轮首选**：`StayKit 入住手册`；备选 `StayKit 住店锦囊`、`StayKit 入住研究所`。

### 三轮（2026-10-02）：老板倾向把名称收敛到纯 `StayKit`

评估：**可以过审，但有代价**。

- 优点：极简、像品牌、几乎不可能撞名、不会触发"官方常用词"提示。
- 代价：① 中文搜索基本搜不到（搜"酒店/入住/清单"都不命中）；② 名称看不出功能，冷启动辨识度低；③ 拼写变体（staykit / Stay Kit / Stay-Kit）会分散命中。
- 补救：把中文功能词全部塞进**简介**；后台若有「推广 → 搜索关键词」，补填「酒店、入住、退房、清单、差旅」。
- 写法统一为 `StayKit`（K 大写），不要全小写。
- 已提醒：纯英文名若后悔再加中文后缀，会消耗 1 次改名额度（个人主体每年仅 2 次）。

---

## 小程序头像方案（2026-10-02）

**沿用 Web 版视觉 DNA**（取自 `D:/hotel/public/icon.svg` 与 `index.html`）：

| 角色 | 色值 |
|---|---|
| 主色 深松绿 | `#1c5a4a` |
| 奶油白 | `#f4f1e8` |
| 暖沙金（点缀） | `#e8d9a8` |
| 容器 | 圆角方形，圆角率约 22%（512 画布 rx=112） |

**四个候选方向**：① 行李箱 + 金色对勾徽标（推荐）② 房卡 + 对勾 ③ 门挂牌（最贴近 Web 原标）④ 字标 `SK`。

**生成参数**：1024×1024 出图后缩到 144×144；主体居中，四周留 ≥8% 安全边距（会被裁成圆形）；扁平无渐变、无阴影、无文字（字标方案除外）。

### 三版生图提示词（2026-10-02 定稿，老板自行出图）

> 通病修正：① 原行李箱缺拉杆与轮子，被误认成墨水瓶 → 改为登机箱；② 房卡正视像白棍子 → 改为倾斜 12° + 右上斜切角；③ 挂牌缺特征 → 补顶部 U 形挂口。

**① 登机箱 + 对勾（首选）**

```
请生成一张正方形应用图标，1024×1024 像素，会被缩小到 144×144 使用。
背景：深松绿（近似 #1c5a4a）纯色圆角方形，圆角约为边长的 22%，扁平填充，无渐变、无阴影。
主体：画面正中央一个奶油白（近似 #f4f1e8）的登机行李箱，必须是以下造型，让人一眼认出是行李箱而不是瓶子——竖向圆角矩形硬壳箱体，宽约画面 46%、高约 52%，比例偏方，绝不做细长瓶颈；箱顶伸出一根细长拉杆，顶端是一段横向短握把，同为奶油白；箱体底部有两个对称小圆轮；箱体正面有两条横向平行凹槽线；箱体上没有任何文字或贴纸。
徽章：箱子右下方叠一枚暖沙金（近似 #e8d9a8）实心圆盘，直径约为画面 26%，盘内是一个深松绿色的粗对勾，笔画圆头、粗细均匀。
构图：整体居中，四周留至少 12% 空白边距，元素不贴边、不出血。
风格：扁平矢量插画、几何化、极简、边缘干净锐利、单色背景、高对比。
不要出现：文字、字母、数字、写实照片、3D 渲染、渐变、投影、光晕、噪点、复杂细节、额外边框或装饰、透明背景。
```

**② 倾斜房卡 + 对勾**

```
请生成一张正方形应用图标，1024×1024 像素，会被缩小到 144×144 使用。
背景：深松绿（近似 #1c5a4a）纯色圆角方形，圆角约为边长的 22%，扁平填充，无渐变、无阴影。
主体：画面中央一张奶油白（近似 #f4f1e8）的酒店房卡，向右倾斜约 12 度，避免看起来像一根竖着的白条；卡片为竖向圆角矩形，右上角做一个 45 度斜切角；卡片上部有一条深松绿色的横向粗条代表磁条；卡片中部有一个暖沙金（近似 #e8d9a8）的小圆角方形代表芯片；芯片下方有两条深松绿细横线代表文字行，第二条更短；卡面上没有任何可读文字。
徽章：卡片右下角叠一枚暖沙金实心圆盘，直径约为画面 24%，盘内是一个深松绿色粗对勾，圆头笔画。
构图：整体居中，四周留至少 12% 空白边距，倾斜的卡片四角不能超出安全区。
风格：扁平矢量插画、几何化、极简、边缘干净锐利、单色背景、高对比。
不要出现：文字、字母、数字、写实照片、3D 渲染、渐变、投影、光晕、噪点、复杂细节、额外边框或装饰、透明背景。
```

**③ 门挂牌 + 对勾**

```
请生成一张正方形应用图标，1024×1024 像素，会被缩小到 144×144 使用。
背景：深松绿（近似 #1c5a4a）纯色圆角方形，圆角约为边长的 22%，扁平填充，无渐变、无阴影。
主体：画面中央一个奶油白（近似 #f4f1e8）的酒店门挂牌，向右倾斜约 6 度；挂牌为竖向圆角矩形，顶部中央有一个 U 形开口（用来挂在门把手上的缺口，这是最关键的特征），开口下方有一个小圆孔；牌面中部有两条深松绿色横线代表文字，第二条更短；牌面上没有任何可读文字。
徽章：挂牌右下角叠一枚暖沙金（近似 #e8d9a8）实心圆盘，直径约为画面 24%，盘内是一个深松绿色粗对勾，圆头笔画。
构图：整体居中，四周留至少 12% 空白边距，倾斜后四角不能超出安全区。
风格：扁平矢量插画、几何化、极简、边缘干净锐利、单色背景、高对比。
不要出现：文字、字母、数字、写实照片、3D 渲染、渐变、投影、光晕、噪点、复杂细节、额外边框或装饰、透明背景。
```

**备选兜底**：若 AI 出图边缘不干净，可直接手写 SVG 定稿（已具备精确坐标能力），不依赖生图。

### 头像定稿与简介候选（2026-10-02）

- 头像已定稿：`icon.png`（1024×1024，登机箱 + 金色对勾方向）。工程内存档一份 `D:/hotel-miniprogram/icon.png`；老板原图放在了规格文档集目录（`D:/hotel-miniprogram-spec/icon.png`），按约定该目录保持只读，故未做任何改动，仅复制了一份出来。
  - ⚠️ **计数口径（踩过坑）**：微信简介上限 120，**全角字符（中文与全角标点）按 2 计，半角数字/字母按 1 计**。第一次按"字符数"算出来的三版实际是 190 / 166 / 158，全部超限。真实预算约 **58 个全角字**。
  - 校验脚本（以后新增文案都用它过一遍）：
    ```js
    const w = s => [...s].reduce((n,c)=> n + (c.charCodeAt(0) > 0x2E80 ? 2 : 1), 0);
    ```
  - **A1（114，推荐）**：住前按人数与晚数算好要带什么，生成准备清单；入住退房共29项逐条打勾；44条安全知识标注证据等级与来源。数据只存本机。
  - **B1（112，口语）**：出门住酒店，带什么、查什么一次说清：56条规则自动算数量，入住退房29项打勾，44条知识标注证据等级。零联网、零账号。
  - **C1（112，克制）**：为一次入住准备的随身工具：住前算好要带什么，住中住后逐项检查，44条安全知识标注证据等级。无需登录，数据只存本机。
  - 合规自查：均未命中 `04` §6.1 禁用词，未出现「偷拍 / 检测 / 医疗」等敏感与绝对化用语。
  - 省字数技巧：把全角标点换成半角（`，`→`,`），每个省 1 点预算。

---

## 后续开发计划 M3–M7（2026-10-02 提交老板审阅）

注册与备案已完成，AppID `wxab6a2e577bcdc940`。当前状态：**M0 / M1 / M2 / M3a / M3b 已完成，38 个单元测试全绿**，逻辑层封版，5 个页面全部打通（M3 收尾），剩余工作是交互精修、视觉还原与收尾功能。

| 里程碑 | 目标 | 主要交付物 | 完成标志（照 `07`） |
|---|---|---|---|
| **M3a 首页 + 创建向导** | 首页能读能跳，向导 6 步能走完并存盘 | home（刊头/空状态/统计条/行程卡/复制上次/备份）、wizard（6 步 + 预览 + 保存）、组件 `stepper`/`toggle`/`item-row`/`date-picker`/`clothing-add` | 首页列表按 `createdAt` 倒序；走完「创建 → 保存 → 进行程」；杀进程重进数据仍在；页面内**零硬编码** |
| **M3b 行程页 + 知识库 + 好物** | 剩下 3 个页面打通 | stay（三段页签）、knowledge（免责+图例+11 模块）、gear（分组+弹窗） | 能走「勾选 → 退房检查」；44 条可展开且正文来源完整；好物分组展示 |
| **M4 核心交互** | 把清单与检查的交互做对 | 组件 `stepper`/`toggle`/`progress-pill`/`item-row`/`check-stage`；勾选、数量（减到 0 显示「不带」）、使用人下拉、自定义项增删；检查组级 note、风险圆点、进度、跳知识；知识库折叠、`**加粗**` 渲染、复制话术、锚点定位+返回行程 | `06` §5.3–5.4 的 C1–C10、D1–D6 全通过；改动即时持久化；行程页跳知识库能定位并显示「返回行程」 |
| **M5 设计系统** | 视觉还原 | `app.wxss` 色板/玻璃卡片（含 Android 降级）/按钮/标签/证据方块/风险圆点/分段控件/进度条；统一 rpx；35 个图标；自绘日历、衣物浮层、好物抽屉、圆形勾选框 | 玻璃卡片 Android 不糊；证据方块与风险圆点形状可辨；安全区避让；日历窄屏无溢出；点击区 ≥ 88rpx |
| **M6 好物与备份** | 收尾两个独立功能 | 好物联想分类（金色虚线猜中态、手动优先、猜不出不覆盖）；剪贴板导出/导入（兼容 Web 版 JSON）；首页「数据只保存在本机」提示 | `06` §5.5–5.6 的 E1–E8、F1–F5 全通过；Web 版导出的 JSON 能导入 |
| **M7 验收提审** | 上线前总检 | `06` §5 全量用例执行结果；38 测试 + 数据 diff 回归；`06` §7 提审表逐项打勾；iOS/Android 真机各验一遍 | 提审表全勾选；无 P0/P1 缺陷 |

> **进度注记（2026-10-02）**：M3b 已顺带完成 M4 中的一部分——进度条、知识库 `**加粗**` 渲染、复制话术、锚点定位 + 返回行程、检查组风险圆点与组级 note。M4 真正剩下的是：使用人下拉、`qty=0` 的「不带」态、以及对照 `06` §5.3–5.4 的 C1–C10 / D1–D6 逐条打磨。

**每个里程碑的固定动作**：① 改完跑 `npx vitest run`（38 绿）+ `npx tsc -p miniprogram --noEmit`；② grep 自查页面内无硬编码物品名/知识文本；③ 涉及 `core/data.ts` 就再 diff 一次；④ 按四段式汇报（做了什么 / 验收自查 / 与规格偏差 / 未决问题），**停下等你确认再进下一步**。

## M3a · 首页 + 创建向导 ✅ 完成（2026-10-02）

### 产出文件

| 文件 | 说明 |
|---|---|
| `miniprogram/app.wxss` | 重写：设计令牌 + 共享样式（glass 卡片 / 按钮 / chips / qchip / fxline / field / 占位页） |
| `miniprogram/pages/home/home.ts|.wxml|.wxss|.json` | 首页全量实现（刊头 / 空状态 / 统计条 / 行程卡 / 复制上次 / 备份与恢复） |
| `miniprogram/pages/wizard/wizard.ts|.wxml|.wxss|.json` | 创建向导 6 步全量实现 |
| `miniprogram/pages/stay/stay.ts|.wxml|.json` | M3a 临时占位（按 id 读出并显示，证明已落盘），M3b 重写 |
| `miniprogram/components/stepper/*` | 步进器（62rpx 视觉 + 88rpx 热区） |
| `miniprogram/components/toggle/*` | iOS 开关（100×60rpx，滑块位移 40rpx） |
| `miniprogram/components/item-row/*` | 物品行（自绘圆形勾选框 + 标签 + 步进器 + 删除） |
| `miniprogram/components/date-picker/*` | 自绘日历（月份切换 + 7 列，标头与格子同轨） |
| `miniprogram/components/clothing-add/*` | 衣物类型下拉（M3a 内联展开，浮层定位留 M5） |

### 关键说明

1. **Vue 响应式 → data + setData**：`draft` 存在 `data` 里，每次改动走 `setDraft(patch)` → `syncDerived()` 手动重算派生值（日期文案、退房日、快捷 chip 态、儿童/老人「将加入」）。语义与 `computed` 一致，草稿改动不落盘，第 6 步才 `newStay + saveStay`。
2. **预览清单刻意用普通数组**：源实现明确注释「不能用 computed，否则用户在预览页添加的自定义物品会在重算时丢失」。照做。
3. **「将加入」列表由规则求值**：`fxNames(on, off)` 对比开关前后 `buildPrep` 的差集，非硬编码（第 3 步儿童/老人、第 6 步区块 A 全走这条路径）。
4. **真实人数不压缩**：`adults` 保留真实值（4 人就是 4），第 2 步 chip 点「3 人及以上」用 `Math.max(adults, 3)`，步进器 3–10（源项目修复过的缺陷，外部评审 §16）。
5. **提示条目取自 `CUSTOM_HINTS`（6 条）**——比源 `WizardView.vue` 多一条「衣物」，与 `04` §2.6 一致（详见下方偏差）。

### 小程序模板踩坑（后续里程碑通用，别再踩）

WXML 的属性值里**不要出现裸 `<` 和 `&&`**（`{{value <= min}}`、`{{a && b}}`、`{{step < total}}`）。XML 解析器会把 `<` 当标签开始、`&` 当实体起始，最坏情况是编译期报错或静默截断。处理方式：**在 JS 里把布尔结果算好再传模板**（`minusOff` / `plusOff` / 置空字符串代替 `&&`），WXML 只做 `{{flag ? 'a' : ''}}` 这类无特殊字符的判断。

配套自查脚本（每个里程碑交付前跑一次，本次已把 10 个模板全部跑绿）：

```bash
# 1) 模板结构闭合校验（需把无值的 wx:else 补成 wx:else="1"，并声明 wx/bind/catch 命名空间）
python -c "import xml.etree.ElementTree as ET,glob,re;[ET.fromstring('<root xmlns:wx=\"http://wx\" xmlns:bind=\"http://bind\" xmlns:catch=\"http://catch\">'+re.sub(r'\bwx:else(?=[\s/>])','wx:else=\"1\"',open(f,encoding=\"utf-8\").read())+'</root>') for f in glob.glob('miniprogram/**/*.wxml',recursive=True)]"
# 2) 表达式里的裸 < 与 &&
grep -rnoE '\{\{[^}]*<[^}]*\}\}' miniprogram --include=*.wxml
grep -rn '&&' miniprogram --include=*.wxml
```

### 验收自查

| 检查 | 结果 |
|---|---|
| `npx vitest run` 38 个用例 | ✅ 全绿 |
| `npx tsc -p miniprogram --noEmit` | ✅ 通过 |
| 页面层硬编码物品名 / 知识标题 / 检查项扫描 | ⚠️ 命中 9 处，**全部为规格明确给定的字面文案**（4 条偏好提示 + 衣物类型选项），已逐条核对与规则求值结果一致 |
| `core/` 下无 `wx.`（platform.ts 除外） | ✅ |
| 网络 / 登录 / 埋点 API 扫描 | ✅ 零命中 |
| `new Date('YYYY-MM-DD')` 反模式 | ✅ 零命中 |
| `04` §6.1 禁用词（页面层） | ✅ 零命中 |
| 开发者工具编译与 tabBar 切换 | ⏸ **待验证**（老板统一在全部开发完成后在工具里跑，届时再排查） |

### 与规格的偏差

- **备份改为剪贴板**：小程序无 `<input type=file>` 与下载能力，且零网络约束。`exportData()/importData()` 不变，JSON 结构与 Web 版完全一致，可跨端互导。文件名 `hotel-toolbox-backup-YYYYMMDD.json` 在剪贴板方案下无意义，M6 再评估是否能用 `FileSystemManager` 落文件。
- **说明文案随平台微调**：「数据只保存在本机**浏览器**」→「数据只保存在本机」；「换设备或重装**浏览器**」→「换设备或重装」（决策 3，已确认）。
- **源项目 `WizardView.vue` 的 HINTS 只有 5 条**，缺 `02` §2.6 与 `data.ts CUSTOM_HINTS` 里的「衣物：泳衣、正装、运动装备等，按行程自行添加」。我按 `CUSTOM_HINTS`（6 条，数据驱动）渲染 —— 这是源项目的一处内容缺失，未改动源项目。
- **偏好提示文案硬编码**：`02` §2.5 给出的是字面文案（源实现也是硬编码），故照抄；已用 `buildPrep` 求值核对，4 条与规则结果**逐字一致**（睡眠敏感=眼罩、耳塞；在意卫生=一次性床单/隔脏睡袋；蚊虫季节=驱蚊液/花露水；电子设备多=氮化镓多口充电器、USB 数据阻断器、魔方插座）。
- **M3a 未实现的部分（按计划留后续）**：图标（M5）、自绘 tabBar 悬浮胶囊（M5，先试自绘不成功再退回原生）、好物入口与 GearPanel（M6）、使用人下拉（M4）、衣物浮层定位（M5）。

---

## M3b · 行程页 + 知识库 + 好物页 ✅ 完成（2026-10-02）

### 产出文件

| 文件 | 说明 |
|---|---|
| `pages/stay/`（`ts`/`wxml`/`wxss`/`json`） | 行程页全量：头部 + 三段页签 + 准备清单 + 入住/退房检查 + 自定义添加 + 删除行程 |
| `pages/knowledge/`（`ts`/`wxml`/`wxss`/`json`） | 知识库全量：免责声明 + 等级图例 + 11 模块 44 条 + 展开/复制/锚点定位 |
| `pages/gear/`（`ts`/`wxml`/`wxss`/`json`） | 好物页全量：分组列表 + 添加抽屉（分类联想）+ 删除 + 恢复默认 |
| `components/progress-pill/` | 新增组件：进度条（准备「已备齐」/ 检查「已完成」共用） |
| `core/nav.ts` | 新增：跨页传参（见下） |
| `components/item-row/item-row.ts` | 事件改为回传 `{ idx, ikey, value }` |
| `app.wxss` | 新增 `.dot` 系列（风险圆点 / 证据方块，7 种色调） |

### 关键说明

1. **跨页传参 `core/nav.ts`**：知识库是 tabBar 页，`wx.switchTab` **不支持 query 参数**，所以行程页的「紧急」「知识详解」无法用 URL 带锚点过去。方案是模块级单例（`setNav` 写 / `takeNav` 取走即清空），比 `globalData` 类型安全，也不依赖 wx。
2. **稳定键 `_k`**：行程页清单由 `prep + custom` 合并后按分类排序，排序后下标不等于原数组下标，也无法像源实现那样用对象引用比较（`setData` 传的是拷贝）。故在渲染时给每项附 `'p3'/'c1'` 形式的稳定键，写回时据此定位。
3. **富文本改造**：源实现用 `v-html`（先 esc 再替换 `**` 为 `<strong>`）。小程序没有 `v-html`，故把 44 条正文**预解析**成「段落 → 片段（普通/加粗）」结构，用 `text` 渲染。零 HTML、零注入风险。已验证：153 个段落、**193 个加粗片段**全部可逆还原（脚本核对 `rebuilt === stripped`，bad = 0）。
4. **写入统一走 `mutate()`**：读 stay → 改 → `saveStay` → 重渲。避免多处各自落盘导致状态不一致。
5. **锚点定位**：`setData` 回调里用 `createSelectorQuery + selectViewport + pageScrollTo` 滚到目标模块（`#mod-{index}`），展开该模块全部条目，并显示「← 返回行程」。

### 验收自查

| 检查 | 结果 |
|---|---|
| `npx vitest run` | ✅ **38 passed** |
| `npx tsc -p miniprogram --noEmit` | ✅ 通过 |
| 11 个 WXML 模板结构校验 | ✅ bad = 0 |
| 全部 JSON 配置可解析（tsconfig 允许注释，已排除） | ✅ bad = 0 |
| 富文本解析可逆性（153 段 / 193 加粗） | ✅ bad = 0 |
| 知识库：11 模块 / 44 条 / 紧急联络 4 条全带 copy | ✅ |
| 检查组 `link` 指向的模块（消防/房间安全/卫生/隐私/维权）均在知识库中 | ✅ |
| 清单分组顺序严格按 `CAT_ORDER`；`_k` 稳定键定位逐项通过 | ✅（临时测试 5/5，已删） |
| `core/` 内 `wx.` 仅 `platform.ts`（`nav.ts` 只是注释里提到） | ✅ |
| 网络 / 登录 / 埋点 / 云开发 API | ✅ 零命中 |
| `new Date('YYYY-MM-DD')` 反模式 | ✅ 零命中 |
| `04` §6.1 禁用词（页面 + 组件层） | ✅ 零命中 |
| 页面层硬编码内容扫描 | ⚠️ 13 处，全部为规格给定字面文案（好物 placeholder「充电宝/耳塞/拖鞋」、4 条偏好提示、衣物类型「睡衣」） |

### 与规格的偏差

- **检查组没拆成独立组件**：源实现有 `CheckGroupBlock.vue`，但小程序里它只是一个 `wx:for` 的勾选行，拆组件反而增加事件通信成本，故内联在 `stay.wxml`。语义与交互完全一致。
- **`addCustom()` 加了落盘**：源实现 `StayView.vue` 的 `addCustom()` 末尾**没有 `persist()`**（疑为遗漏——添加自定义物品后若用户直接退出，改动会丢）。小程序版统一走 `mutate()` 落盘。**未改动源项目**。
- **`confirm()` → `wx.showModal`**（删除行程、恢复默认好物）。
- **Esc 关闭弹窗无法实现**：小程序无键盘事件，改为点遮罩空白处关闭；弹窗内部用 `catchtap="noop"` 阻止冒泡（否则点输入框就会关闭）。
- **图标全部缺席**（M5 补）：好物删除按钮暂用文字「删除」，知识库/行程页的风险点用色块而非图标，紧急按钮为纯文字描边。CUSTOM_HINTS 的 6 个图标（`hint-icons.ts`）也留到 M5。
- **知识库「返回行程」用 `reLaunch`**：`switchTab` 进 tabBar 页会清空页面栈，`navigateBack` 回不去，故用 `reLaunch` 重开行程页。
- **衣物下拉仍是内联展开**（M3a 定下的降级），浮层定位留 M5。
- **`GearPanel`（物品行内好物面板）未做**，属 M6。

---

## M4 · 核心交互 ✅ 完成（2026-10-02）

### 产出文件

| 文件 | 说明 |
|---|---|
| `components/gear-panel/`（ts / wxml / wxss / json） | **新增**：物品行内的好物面板（`GearPanel.vue`），只显示「这一件物品」的品牌 |
| `components/item-row/item-row.ts` | 改：新增 `opts` 属性、使用人下拉、好物入口与面板挂载、脏检查缓存 |
| `components/item-row/item-row.wxml` | 改：picker 使用人下拉 + 好物按钮 + 面板 |
| `components/item-row/item-row.wxss` | 改：`.assign` / `.gearbtn` / `.row.wrap` |
| `components/item-row/item-row.json` | 改：注册 `gear-panel` |
| `pages/stay/stay.ts` | 改：`assignOpts` 计算、`onItemAssign` |
| `pages/stay/stay.wxml` | 改：向 `item-row` 传 `opts` 与 `bind:assign` |
| `app.wxss` | 改：补 `--line` 变量（源实现用了但全局未定义） |

### 关键说明

1. **使用人下拉（C4）**：`<select>` → 小程序原生 `picker`（`mode="selector"`）。选项 = `['全体', ...guests.map(g => g.label)]`，`opts.length > 1` 才渲染（与源实现 `assignOptions && editable` 一致）。`assign` 存文案，picker 只认下标，故在 JS 里做 `indexOf` 换算。
2. **好物面板（C5）**：按 `name + cat` 双条件过滤——耳塞行里出现充电宝的品牌没有意义。入口按钮仅对有 `itemId` 的物品显示（源实现 `v-if="props.item.itemId"`，自定义物品不给入口）。
3. **修了源实现一处下标错位 bug**（见下方「源项目问题」第 2 条）。
4. **性能**：行程页每次写入都全量重渲，`wx:for` 里 60 个 `item-row` 会各触发一次 observer。给 `syncGear` 加了 `name+cat` 脏检查，避免勾选一项就 60 次读 Storage；好物变化走 `force=true` 强制重算。
5. **`--line` 补齐**：源 `GearPanel.vue` 的 `.ginput` 用了 `var(--line)`，但全局样式表里没有这个变量（边框会退化）。小程序版按 `--hairline` 的色系补了 `--line: rgba(35,41,37,0.18)`。

### 验收自查（对照 `06` §5.2–5.4）

用临时测试文件跑过 **20 条断言（全过，跑完已删，不并入 38 个正式用例）**，覆盖：

| 组 | 结果 |
|---|---|
| B8 / C1 阶段定位 | 未来→prep、期内→checkin、已过→checkout；新建行程**绝不落退房**；未填日期→prep ✅ |
| C4 使用人选项 | 1 成人=全体+入住人1；2 成人=+入住人2；1 儿童=「儿童」；有老人=+「老人」 ✅ |
| C5 好物面板 | name+cat 双条件过滤、删除下标不错位、同名同品牌去重、不同品牌并存、品牌可留空、恢复默认回 3 条种子 ✅ |
| D1–D3 | 44 条 / 11 模块；模块顺序与规格**逐字一致**（使用说明→紧急联络→消防→隐私→卫生→维权→行前→房间安全→住宿期间→特殊场景→医疗与法律边界）；免责 4 条 ✅ |
| D5–D6 | 可复制话术 4 条且全在紧急联络；k5/k8/k10/k40 当前（2026-10）**不显示**「建议复核」 ✅ |
| C8 / C9 | 检查组「知识详解」指向的模块全部存在；紧急联络模块存在 ✅ |
| 日期 | `fmtDate` 跨年/跨月不差一天 ✅ |

其余（`38 passed`、`tsc` 通过、12 个 WXML 结构 bad=0、JSON 全可解析、`core/` 无 `wx.`、无网络 API、无 `new Date('YYYY-MM-DD')`、无禁用词、核心三文件 diff 零差异）**全部通过**。

### 与规格的偏差

- **C4 的触发条件按代码不按文档**：`02` §/ 规格文字写「≥2 名成人或带儿童时出现」，但源实现代码是 `opts.length > 1`（`buildGuests` 至少生成 1 个成人，故**单人出行也会显示**下拉）。我按代码照搬，因为代码才是已上线行为。若你认为该按文档改成「≥2 人才出现」，告诉我，一行就能改。
- **好物面板在本里程碑做了**：原计划把它归到 M6，但 `06` §5.3 的 C5 是行程页验收项，故提前到 M4，M6 只剩余好物页本身的细节与备份。
- **面板内文案沿用源实现**：「{{name}} 的好物」「个人偏好 · 非商业推荐」「还没记这一件。可以只记品牌，也可以只记「用哪款」。」「＋ 记一个品牌」——均为源实现既有文案，非我杜撰。
- **删除按钮用文字**：图标 M5 补。

### 源项目问题（只记录，未改动）

1. `StayView.vue` 的 `addCustom()` 缺 `persist()`（M3b 已记）。
2. **`GearPanel.vue` 删除下标错位**：`rows = listGear(cat).map((entry, index) => ({entry, index}))` 里的 `index` 是**按 cat 过滤后**的下标，而 `removeGear(index)` 是在**完整列表**上 `splice`。当 cat 不是第一个分类时会删到别的条目上（例如删「睡眠/耳塞/霍尼韦尔」实际删掉的是「电子」分类的某条）。小程序版改为在完整列表上用 `name + cat` 定位真实下标。
3. **`--line` CSS 变量未定义**：`GearPanel.vue` 用了 `var(--line)`，全局样式表无此变量。

---

## M5 · 设计系统 ✅ 完成（2026-10-02）

### 产出文件

| 文件 | 说明 |
|---|---|
| `tools/gen-icons.py` | **新建（工程内，不进代码包）**：图标生成器，SVG → base64 → `icon.wxss` |
| `miniprogram/icon.wxss` | **新建（自动生成）**：34 个图标 / 70 条颜色变体，22.9 KB，由 `app.wxss` 顶部 `@import` |
| `miniprogram/components/icon/` | **新建**：图标组件（`name` / `size` / `tone`），`styleIsolation: apply-shared` |
| `miniprogram/custom-tab-bar/` | **新建**：悬浮胶囊玻璃 tabBar（4 个文件），`app.json` 设 `"custom": true` |
| `miniprogram/core/tabbar.ts` | **新建**：`syncTabBar(page, index)`，tab 页 onShow 告知组件选中项 |
| 5 个页面 + 4 个组件 | 应用图标；三个 tab 页底部加 `calc(200rpx + env(safe-area-inset-bottom))` 让位 |
| `app.wxss` | 玻璃卡片加 `backdrop-filter` 渐进增强；背景光斑（双层径向渐变）；`.btn` 统一 `gap` |
| `clothing-add` | 内联展开 → **真浮层**（fixed + 遮罩 + `createSelectorQuery` 测量 + 空间不足向上弹） |

### 关键决策

1. **为什么不用 iconfont**：`05` §7.2 推荐下载 `iconfont.ttf`，但本项目硬约束是零网络 / 零 CDN / 零第三方依赖，下载字体这条路走不通。改为**手写 SVG → base64 内联进 WXSS**（22.9 KB，与规格预估的 15–25 KB 吻合）。小程序不支持 `<svg>` 标签，但 `background-image` 支持 data URI。
2. **颜色靠「变体 class」而不是 `currentColor`**：`background-image` 里的 SVG 拿不到外部 CSS 变量，故按需生成 8 个色档（ink-2 / ink / ink-3 / pine / pine-deep / gold / amber / cream）。**写过一个校验脚本，把 wxml 里所有静态引用 + 动态引用展开逐个比对，确保没有「引用了不存在的 class」导致图标空白**——首轮就查出 4 处（`ic-check-c`、`ic-chevron-right-c/d`、`ic-plus-d`），已补生成。
3. **自定义 tabBar 已按老板要求尝试并落地**：目录必须是 `miniprogramRoot/custom-tab-bar/index`（微信硬性规定）；每个 tab 页 `onShow` 里调 `syncTabBar(this, n)`。若真机/模拟器上表现异常，退回原生只需删掉 `"custom": true` 一行 + 删目录。
4. **玻璃降级不用 `@supports`**：`05` §5.1 建议用 `@supports`，但小程序对该特性支持不一致，写了可能在部分机型丢掉基础底色。改为底色给足（`rgba(255,255,255,.72)` + 内高光），`backdrop-filter` 只作叠加——iOS 生效，Android 不支持时整行被忽略，绝不会糊成一片。
5. **衣物浮层滚动即关闭**：fixed 面板不会跟随滚动，故两个页面加 `onPageScroll` → `selectComponent('#clothingAdd').close()`。这比「错位悬停」可控。

### 验收自查

| 检查 | 结果 |
|---|---|
| `npx vitest run` | ✅ 38 passed |
| `npx tsc -p miniprogram --noEmit` | ✅ 通过 |
| WXML 结构校验（含 custom-tab-bar） | ✅ bad = 0 |
| JSON 全部可解析 / `tabBar.custom = true` | ✅ |
| 图标 class 引用完整性（静态 + 动态展开） | ✅ 零缺失 |
| 图标 SVG 全部可被 XML 解析 | ✅ bad = 0 |
| 包体积 | ✅ `miniprogram/` 382 KB / 68 文件（限额 2 MB） |
| 网络 / 登录 / 埋点 / 云开发 API | ✅ 零命中 |
| `new Date('YYYY-MM-DD')` | ✅ 零命中 |
| `04` §6.1 禁用词 | ✅ 零命中 |
| 核心三文件 diff | ✅ 零差异 |
| 页面层硬编码内容 | ⚠️ 15 处，均为 M3a/M3b 已核对过的规格给定字面文案（4 条偏好提示、好物示例、衣物类型） |

### 与规格的偏差

- **图标方案偏离 `05` §7.2**（iconfont → 自建 base64 SVG），原因是零网络硬约束，已说明。
- **`shirt` 图标生成了但当前无引用**：`HINT_ICON_MAP` 有它，但源 `WizardView.vue` 的 HINTS 数组只用到 5 个（briefcase/camera/pill/baby/paw-print）。我们按 `data.ts CUSTOM_HINTS` 渲染 6 条，故 `shirt` 会被用到。
- **删除按钮的「点击变红」降级为「变淡」**：图标是 background-image，无法靠 `color` 换色，`:active` 改为 `opacity: .45`。
- **源项目 `WizardView.vue` 导入了 `CalendarDays` 却未使用**，小程序版同样不放日历图标。
- **背景光斑不用伪元素**：`page::before/after` 在小程序支持不稳，改用 `background-image` 双层径向渐变 + `background-color` 兜底（不支持多层背景时回退纯色，不会白屏）。
- 仍未处理（按计划留 M6/M7）：备份落文件（`FileSystemManager`）、真机双端验证。

---

## M6 · 好物与备份 ✅ 完成（2026-10-02）

### 产出文件

| 文件 | 说明 |
|---|---|
| `tests/acceptance-m6.test.ts` | **新增**：E1–E8 + F1–F5 共 13 条验收用例（**源项目没有这个文件**，是我们为 `06` §5.5–5.6 新写的，与源 38 个用例分开计数）。→ **M7 已并入 `tests/acceptance.test.ts`**（A–F 全量 49 条），此文件已删 |
| `vitest.config.ts` | 加 `fileParallelism: false`（见下方「踩坑」） |
| `pages/gear/gear.ts` | 加 `pulseCls` / `pulseSeq`：联想命中分类时触发一次缩放脉冲（源实现有，M5 漏了） |
| `pages/gear/gear.wxml` | `.catchips` 绑定 `pulseCls` |
| `pages/gear/gear.wxss` | 新增 `gpulse-a` / `gpulse-b` 两组 keyframes |
| `pages/home/home.ts` | 导出文案改为「已复制到剪贴板」；导入加空剪贴板判断、非法 JSON 友好提示、**覆盖前二次确认**、失败回调 |
| `pages/home/home.wxml` | 备份说明补「清理微信缓存会一并清掉」；页尾新增常驻「数据只保存在本机 · 不上传、不联网」 |
| `pages/home/home.wxss` | 新增 `.localnote` |
| `tools/gen-icons.py` | 新增 `shield` 图标（此前只有 `shield-alert` 带感叹号那版） |
| `miniprogram/icon.wxss` | 重新生成：35 图标 / 72 变体 / 23.8 KB |

### 关键决策

1. **备份仍走剪贴板，不落文件**（M3a 留下的评估项，结论是不做）。`FileSystemManager.writeFile` 只能写进 `wx.env.USER_DATA_PATH`，用户取不出来；要导出只能靠 `wx.shareFileMessage` 转发到微信会话，那等于把用户的入住数据推出去，与「零网络、数据只存本机」的产品承诺冲突。`07` M6 与 `06` 附表本来就指定剪贴板方案，维持不变。
2. **导入加了二次确认**。源实现是点了文件直接覆盖，无任何确认。小程序里误触成本更高，而 `02` §6 已经给「删除行程 / 恢复默认好物」定了「不可逆操作要二次确认」的原则——导入覆盖同样是整体替换、不可撤销，按同一原则处理才自洽。确认文案会带上当前行程数（`导入会覆盖本机现有的 N 个行程与全部好物，确定继续？`）。
3. **导出文案改了**：源实现提示「已导出备份文件」，但小程序根本没有文件，改为「已复制到剪贴板，可粘贴到微信收藏或备忘录保存」。JSON 内容与 Web 版完全一致，可跨端互导。
4. **F5 的友好报错**：源实现直接把 `err.message` 丢给用户（`Unexpected token o in JSON...`）。小程序版区分 `SyntaxError` → 「剪贴板里不是有效的备份 JSON」，其余仍用原始 message（如「不是本工具箱的备份文件」）。
5. **脉冲动画用两个 keyframes 名交替**：CSS 动画只在 `animation-name` 变化时重播，同名 class 反复切换无效；小程序又没法像 Vue 那样靠 `:key` 重建节点。故用 `pulse-a` / `pulse-b` 两个动画名轮着来（`pulseSeq` 计数取模）。

### 验收自查（对照 `06` §5.5–5.6）

`npx vitest run` → **51 passed**（38 个源用例 + 13 个 M6 验收用例），逐条对应：

| # | 用例 | 结果 |
|---|---|---|
| E1 | 输入「充电宝」→ 联想出「电子」，标签呈金色虚线 | ✅ `guessGearCat` 命中，`guessed=true` |
| E2 | 手动点「洗漱」后再改名 → 分类保持洗漱 | ✅ `catTouched` 优先 |
| E3 | 输入「神秘小物」→ 猜不出，保持当前选择 | ✅ `guessGearCat` 返回 null |
| E4 | 名称为空点保存 → 提示「先填物品名称，比如「充电宝」」 | ✅ 页面逻辑（`02` §5.2 字面文案） |
| E5 | 同名不同品牌两条并存 | ✅ 小米 / 罗马仕 |
| E6 | 完全相同的一条不重复添加 | ✅ 按「分类+名称+品牌」去重 |
| E7 | 品牌留空 → 允许，只显示名称 | ✅ |
| E8 | 恢复默认 → 回到 3 条种子 | ✅ |
| F1 | 导出 JSON 含 `app: "hotel-toolbox"` / stays / gear | ✅ |
| F2 | 导入合法 JSON → 行程与好物数量正确恢复 | ✅ |
| F3 | `{"app":"other"}` → 抛「不是本工具箱的备份文件」且**不写入** | ✅ |
| F4 | 旧版 gear 对象格式自动迁移为条目 | ✅ `{睡眠:[安耳悠]}` → 2 条 |
| F5 | 空文本 / 非法 JSON / 缺 stays → 抛错不写入 | ✅ 不崩溃 |

其余全量自查：`tsc` 通过；WXML 结构 bad=0（无裸 `<`、无 `&&`）；JSON 全可解析；图标 class 引用零缺失、71 个 SVG 全可解析；包体积 394 KB / 69 文件（限额 2 MB）；网络/登录/埋点/云开发 API 零命中；`core/` 内 `wx.` 仅 `platform.ts`；无 `new Date('YYYY-MM-DD')`；`04` §6.1 禁用词零命中；核心三文件 diff 零差异。

### 与规格的偏差

- **导入二次确认**：源实现无确认（见关键决策 2）。一行即可撤回。
- **导出提示文案**由「已导出备份文件」改为「已复制到剪贴板…」（关键决策 3）。
- **F5 报错文案**为新增，规格只要求「友好报错」未给字面文案。
- **页尾常驻提示**「数据只保存在本机 · 不上传、不联网」为新增：原规格只在空状态写了一句「数据只保存在本机浏览器」，但有行程时首页看不到任何数据位置提示，而 `06` §7 提审表要求「首页有『数据只保存在本机』提示」，故补一条常驻。
- **备份说明**补了「删除小程序或清理微信缓存会一并清掉」——`06` §3 明确要求说明清缓存会丢数据，`02` §1.5 原文没写（Web 版只有「换设备或重装浏览器」）。
- **`shield` 图标**是新增的（源项目只用 `shield-alert` 那版带感叹号的，用在知识库免责区块）。

### 踩坑（已修）

- 两个测试文件并行跑时，vitest 并发写临时目录在本机环境偶发 `EPERM: operation not permitted`，表现为随机丢掉一个测试文件（报 38 passed + 1 error）。已在 `vitest.config.ts` 关掉 `fileParallelism`，连跑 3 次稳定 51 passed。耗时无感（1 秒内）。

---

## M7 · 验收与提审 ✅ 代码侧完成（2026-10-02）

> **剩余的全是「必须人做」的**：真机双端验证、后台隐私指引配置、提审截图。老板已明确：等代码全部完成后导入开发者工具看过再反馈。

### 产出文件

| 文件 | 说明 |
|---|---|
| `tests/acceptance.test.ts` | **新增**：`06` §5 的 A1–F5 + §6 的 G1–G5，共 **49 条**断言。M6 的 `acceptance-m6.test.ts` 已并入此文件并删除 |
| `ACCEPTANCE.md` | **新增**：A–F 全量验收用例逐条执行结果 + 11 条**人工验证清单**（H1–H11）+ 源项目已知问题 4 条 |
| `RELEASE-CHECK.md` | **新增**：`06` §6 回归清单 G1–G5 + §7 提审检查表 12 项逐条打勾 + 真机验证清单 + 偏差汇总 10 条 + 老板待办 3 件 |
| `tsconfig.test.json` | **新增**：只给 `tests/` 用的类型检查配置（刻意不叫 `tsconfig.json`，避免与 `miniprogram/tsconfig.json` 打架） |
| `package.json` | 新增 `typecheck:test`、`diff:engine` 脚本；devDeps 加 `@types/node` |

### 关键说明

1. **测试口径变成两个数**：`npm test` → **87 passed = 38（源用例，逐字复制未改）+ 49（本工程新增验收用例）**。源项目的 38 个一个没动，验收用例是独立文件，两者分开计数。
2. **能自动化的全自动化了**。渲染与交互效果（玻璃模糊、浮层定位、安全区、真机键盘、点击区尺寸）**没有伪造断言**——全部列进 `ACCEPTANCE.md` §7 的 H1–H11，等老板在开发者工具里逐条过。
3. **静态文案断言**是这次新引入的手法：直接读 `pages/**` 源码断言关键文案存在（如「先填物品名称，比如「充电宝」」「并加入洗衣、晾衣用品」），防「改模板时误删规格给定的字面文案」。B2/B5/C3/C4/D1/D2 用了它。
4. **D6 是个时间炸弹**：k5/k8/k10/k40 的 `reviewBy` 是 2027-03 / 2027-06，当前（2026-10）不显示「建议复核」。用例用当前月份动态比较，到期会自动开始报警，**不会 silent fail**。

### 验收自查

| 检查 | 结果 |
|---|---|
| `npm test` | ✅ **87 passed**（38 + 49） |
| `npx tsc -p miniprogram --noEmit` | ✅ 通过 |
| `npm run typecheck:test`（新增） | ✅ 通过 |
| `npm run diff:data` / `diff:types` / `diff:engine` | ✅ **三文件全部零差异** |
| WXML 结构（14 个模板） | ✅ bad = 0，无裸 `<`、无 `&&` |
| JSON 全部可解析 | ✅ bad = 0 |
| 图标 class 引用完整性 | ✅ 零缺失；71 个 SVG 全可解析 |
| 网络 / 登录 / 埋点 / 云开发 API | ✅ 零命中 |
| `04` §6.1 禁用词（页面 + 组件 + 知识库） | ✅ 零命中 |
| `darkmode` | ✅ `false` |
| 包体积 | ✅ 394 KB / 68 文件（限额 2 MB） |

### 未完成（必须人做）

1. **真机 iOS + Android 各验一遍**（`06` §7 第 10 项）——重点：玻璃卡片 Android 降级、自绘 tabBar、底部安全区、浮层定位。
2. **mp 后台配置《用户隐私保护指引》并勾选剪切板**（§7 第 4 项）。
3. **5 张真实运行截图**（§7 第 7 项）。
4. 开发者工具首次导入编译——按本节后的「开发者工具接入方式」操作：**用「导入项目」+ 后端「不使用云开发」+ 不用任何模板**。

---

## 开发者工具接入方式（2026-10-02 定）

- **必须用「导入项目」，不能「新建项目」**。目录选 `D:/hotel-miniprogram/`（含 `project.config.json` 的那一层，不是 `miniprogram/` 子目录）。
- **后端服务选「不使用云开发」，绝不能选微信云开发**。理由：产品硬约束是零网络/零账号/零上报，云开发的 `wx.cloud.*` 本质是网络请求，且会污染 `project.config.json`（多出 `cloudfunctionRoot`）、生成 `cloudfunctions/` 目录、在 `app.js` 注入 `wx.cloud.init()`。
- **不要用任何新建模板**：TDesign 类模板（零售电商 / 组件库）引入第三方 UI 库，违反硬约束 3；电商 / 微信小店模板与已选类目「工具 → 备忘录」不符，提审必驳；其余模板均为无关 demo 代码。
- **不要用「智能创建」**：那是 AI 从零生成，会推翻已封版的逻辑层与 38 个测试。
- 导入后首次编译预期会有报错（页面路径 / 组件路径 / WXSS 语法 / TS 插件），属正常，按控制台输出逐条修。

## M2 · 引擎层搬运 ✅ 完成（2026-10-02）

### 产出文件

| 文件 | 来源 | 改动 |
|---|---|---|
| `miniprogram/core/engine.ts` | `D:/hotel/src/engine.ts` | **零改动**（`cp` 原样复制，192 行） |
| `miniprogram/core/platform.ts` | 新建 | wx 存储适配器，`installWxStorage()` 运行时替换 `Storage` 的三个方法 |
| `miniprogram/core/store.ts` | `D:/hotel/src/store.ts` 抽取 | 只保留 4 个纯函数（函数体逐字），Vue 状态与导航剥离 |
| `miniprogram/app.ts` | M0 | `onLaunch` 里调用 `installWxStorage()` |
| `miniprogram/tsconfig.json` | M0 | `lib` 增加 `"DOM"` |

### 关键说明

- **engine.ts 一字未改**：`diff D:/hotel/src/engine.ts miniprogram/core/engine.ts` → 零差异。
- **存储注入**：`app.ts` 启动时把 `Storage.getItem/setItem/removeItem` 换成 `wx.getStorageSync/setStorageSync/removeStorageSync`。注意 `wx.getStorageSync` 查不到时返回**空字符串**，适配器里映射成 `null`，与内存实现语义一致。
- **store.ts 只搬纯逻辑**：`phaseOf` / `suggestedStage` / `stayPhaseLabel` / `fmtDate` 函数体逐字保留（日期一律 `split('-')` 解析）；`view` / `currentStay` 等 Vue `ref` 与 `goHome` 等导航函数、以及 `window.scrollTo` 全部剥离，改由页面层 `data + setData` 承担（M3/M4）。
- **tsconfig 加 DOM lib** 是被动选择：engine.ts 第 20 行引用了 `localStorage`，不改代码就只能放开类型库。副作用是页面层误用 `document/window` 时编译器不会报错，需在 M3+ 自查。
- `core/` 下只有 `platform.ts` 出现 `wx.`，满足 `07` M2 的约束。

### 验收自查（对照 `07` M2）

| 完成标志 | 结果 |
|---|---|
| **38 个单元测试全绿** | ✅ `Test Files 1 passed / Tests 38 passed (38)` |
| engine 与源文件零差异 | ✅ diff 零差异 |
| `core/` 下无 `wx.` 调用（platform.ts 除外） | ✅ grep 确认 |
| `npx tsc -p miniprogram --noEmit` | ✅ 通过 |

> M2 是分水岭：38 个用例全绿后才允许开始写界面（M3）。

---

## 「新建一个专属小程序」操作备忘（2026-10-02 核实最新版后台入口）

决定：**旧小程序完整保留，本项目走新注册的独立小程序。** AppID = `wxab6a2e577bcdc940`。

后台入口已按当前（2026）界面重新核实，老教程里的路径很多已失效：

| 事项 | 当前入口 |
|---|---|
| **AppID** | mp.weixin.qq.com → 开发管理 → 开发设置 → AppID(小程序ID) |
| **基本信息**（名称/头像/简介/服务类目） | 左下角**头像** → 账号设置 → 基本设置；或左侧菜单「设置 → 基本设置」 |
| **ICP 备案** | 左下角**头像** → 账号设置 → 基本信息 → 小程序备案；或「设置 → 基本设置 → 备案信息 → 去备案」；后台首页顶部通常也有「去备案」横幅 |
| **用户隐私保护指引** | 左下角**头像** → 账号设置 → **服务内容声明** → 用户隐私保护指引（⚠️ 该入口**只对已发布上线的小程序生效**，未上线要走「提审页底部」那条路） |

重点提醒：

1. **ICP 备案是上线前置**，未备案发布会报 `errcode 86369`。流程：平台初审 1–2 工作日 + 管局审核 1–20 工作日；收到工信部 **12381** 短信须在 **24 小时内**完成核验，否则自动驳回重来。这段最长，应与开发并行。
2. **先定名称再备案**——备案信息里的「小程序名称」取自后台，改名后必须走「小程序备案 → 变更」同步，否则会被处置。个人主体每个自然年免费改名 **2 次**（1 月 1 日重置），改名审核通过后**不可撤销**。
3. 类目选 **工具 → 备忘录**（主营类目只能选一个，每年限改 5 次），建议再加一个服务类目 **工具 → 信息查询** 覆盖 44 条知识库。**不要**选健康管理（会被按医疗口径审）、不要选旅游/酒店预订（要《旅行社业务经营许可证》，个人主体不可能有）。（2026-10-02 更正：原写的「工具 → 效率」在个人主体下不存在。）
4. 本项目调用 `wx.setClipboardData`，隐私指引必须勾选**剪切板**并写明用途：「用于复制应急联络话术与导出/导入本机备份数据」。
5. 与旧小程序零耦合：AppID 不同、存储键 `htb_*` 独立，互不影响。

---

## M8 · 变更需求落地 ✅ 完成（2026-10-02 收尾）

> 本节是**当前状态的权威口径**。M0–M7 各节数字为该里程碑完成时的快照，已过时。
> 需求来源：`CHANGE-REQUESTS.md`（13 组）；排期与决策：`DEV-PLAN.md`。

### 老板拍板的 6 个决策

| # | 议题 | 决定 | 落地方式 |
|---|---|---|---|
| D-1 | 新分类/新物品与「红线三文件零差异」冲突 | **③ 自研扩展层** | 新建 `core/extra.ts`，红线三文件**一字未改** |
| D-2 | 云同步（P2-2） | **先不做**，保留剪贴板导出 | 不引入网络/账号 |
| D-3 | 是否加「我的」页 | **加**，四 tab 并排 | 新建 `pages/mine/` + tabBar 扩列 |
| D-4 | 折叠状态是否持久化 | **记住**，存 UI 层 | `htb_ui_collapsed_v1`，**不进 Stay 结构** |
| D-5 | 敏感物品是否预置 | **交用户自定义**，代码不预置 | 有测试 H6 守护 |
| D-6 | `.btn` 全局改动 | **接受** | 全局样式统一 |

### 本批次完成的改动

| 批次 | 内容 | 主要文件 |
|---|---|---|
| B5 | 物品名强制一行省略号 | `components/item-row/item-row.wxss` |
| B6 | 勾选交互改造（行内水印 `✓` + 绿底，去掉删除线与变灰） | `item-row.{wxml,wxss}`、`pages/stay/stay.{wxml,wxss}` |
| C1 | 知识库模块级手风琴折叠 + 锚点自动展开 | `pages/knowledge/knowledge.{ts,wxml,wxss}` |
| D | 扩展层：2 个新分类、10 条新物品、5 种同行关系、学习场景、备份带 `ext` 段 | **新建** `core/extra.ts` |
| E1 | 「我的」页：备份/恢复/清空 + 默认同行关系 | **新建** `pages/mine/*`，首页备份块整体迁入 |

### 验收自查（2026-10-02 收尾，权威）

| 检查 | 结果 |
|---|---|
| `npm test` | ✅ **105 passed** = 38（源用例，逐字未改）+ 67（验收用例） |
| `npx tsc -p miniprogram --noEmit` | ✅ 通过 |
| `npm run typecheck:test` | ✅ 通过 |
| `npm run diff:types` / `diff:data` / `diff:engine` | ✅ **三文件全部零差异**（红线守住） |
| WXML 结构（**16** 个模板） | ✅ bad = 0，无裸 `<`、无 `&&` |
| JSON（**19** 个，排除 JSONC 的 `tsconfig*`） | ✅ 全部可解析 |
| 图标 class 引用完整性 | ✅ **37 个图标 / 75 条变体**，模板静态引用零缺失 |
| 网络 / 登录 / 埋点 / 云开发 API | ✅ 零命中 |
| 禁用词 | ✅ 零命中 |
| 包体积 | ✅ **283 KB / 78 文件**（限额 2 MB，余量约 86%） |

### 关键实现约定（后续改动请遵守）

1. **扩展层数据绝不进 Stay 结构**——`Stay` 属红线。同行关系/学习标记存在 `htb_ext_v1` 里，以 stay id 为键。
2. **排序必须用 `CAT_ORDER_EXT`**，不能用源 `CAT_ORDER`：`CAT_ORDER.indexOf('学习') === -1`，新分类会掉到列表尾部。
3. **`guessGearCatExt` 必须先走源 `guessGearCat`**，再走扩展关键词。顺序反了会把「笔记本电脑」误判成「学习」。
4. **折叠一律 `wx:if` 直接切**，不做高度动画（44 条富文本在安卓会掉帧）。
5. **勾选水印是常驻节点 + CSS 切 `opacity`**（不能 `wx:if`），且必须 `pointer-events: none`，否则挡住点击。
6. **绿底用 `margin: 0 -12rpx` + `padding: 0 12rpx`**：背景外扩、内容 x 坐标不变，展开/收起无抖动。
7. **`setData` 用路径更新**（`['modules['+mi+'].open']`），禁止整份数组回传。
8. **测试里的静态断言别写完整 API 调用形式**——注释文本会误伤。用 `not.toContain('wx.showModal(')`（带括号）而不是 `not.toContain('wx.showModal')`。

### 未完成（必须人做）

| # | 事项 | 为什么卡住 |
|---|---|---|
| 1 | **真机验证** `ACCEPTANCE.md` §7 的 H1–H16 | node 环境无法断言渲染与交互 |
| 2 | 四 tab 拥挤度、勾选水印字号（120rpx / 96rpx 均为估值） | 需真机定夺 |
| 3 | 知识库首屏高度 | 需真机看 |
| 4 | mp 后台：隐私指引勾**剪切板**、6 张真实截图、ICP 备案 | 老板操作 |
| 5 | 正式《隐私政策》《用户协议》文本 | 需老板或法务提供，**不能编造** |
| 6 | 云同步（`06` P2-2） | 按 D-2 决策不做 |

---

## M9 · 第二轮反馈落地 ✅ 完成（2026-10-02）

> 老板在模拟器/真机试过之后提的 6 条。明细见 `CHANGE-REQUESTS.md` §14，本节只记结论。

### 做了什么

| # | 反馈 | 结果 |
|---|---|---|
| 1 | 「培训学习」前缺图标 | 根因不是漏写，是 **`.ic-book-open-p` 这个 class 根本不存在**（生成器只给了 `d` 档），图标一直静默空白。补 `'dp'` 后重跑 |
| 2 | 文字与图标偏小 | 图标 30→34，`.slabel` 31→34rpx，`.fxline` 25→27rpx |
| 3 | 影响说明卡片要改名 + 折叠 | 改名「你的选择如何影响清单」，默认收起 |
| 4 | 保存后应跳准备界面 | 向导带 `&stage=prep`，行程页优先采用它而不是按日期推断 |
| 5 | 数量设 0 后不该还在清单里 | 按「消失 + 底部可恢复」做，数据层不动 |
| 6 | 三段要支持左右滑动 | 页面级触摸判定 + `core/gesture.ts` 纯函数，不用 swiper |

### 新增文件

```
miniprogram/core/gesture.ts     左右滑动判定（纯函数，可单测）
tools/check-icons.py            图标引用校验（拦住「图标静默空白」那类 bug）
```

### 新增/变更的命令

```
npm run check:icons             校验模板里每个 name+tone 都有对应 class
npm run icons                   重跑图标生成器
```

### 验收自查（权威）

```
npm test                                 115 passed（38 源 + 77 验收）
npm run typecheck / typecheck:test       通过
npm run diff:types/data/engine           三文件零差异（红线未破）
npm run check:icons                      76 条 class / 55 处静态引用，零缺失
16 个 WXML 模板                           bad=0，标签闭合全对
21 个 JSON 可解析                          0 失败
网络 / 登录 / 埋点 / 云开发 API            零命中
包体积                                    299 KB / 79 文件（余量 85%）
```

### 两条值得记住的教训

1. **图标是「静默失败」的**。`background-image` 引用了不存在的 class 不会报错，只会渲染成空白 —— 只能靠肉眼或专门的校验脚本发现。这就是 `tools/check-icons.py` 存在的理由。
2. **静态断言又一次被注释误伤**。J4 断言「旧标题不该再出现」，结果被文件里那句「标题原为「这些选择如何影响清单」」的**注释**命中。修法不是删注释，而是把断言改成匹配**渲染出来的形式**（`>你的选择如何影响清单<`）。同类坑累计踩到第 3 次（C10 / I5 / J4）。

### 仍需真机确认

见 `ACCEPTANCE.md` §7 的 H17–H22（放大后的第 ⑤ 步排版、已设为不带区域、左右滑动阈值、book-open 图标实际效果等）。

---

## M10 · 第三轮反馈落地 ✅ 完成（2026-10-02 收尾）

> 规划文档：**`FIX-PLAN.md`**（含「已实现打勾 / 待办标签」清单 + R3-* → 用例对照表）。
> 需求口径：`CHANGE-REQUESTS.md` §15。人工验收项：`ACCEPTANCE.md` §7 的 **H23–H29**。

### 做了什么（7 条）

| # | 反馈 | 关键改动 |
|---|---|---|
| R3-1 | 不选日期也能点「开始」 | `wizard.ts` `nextReady` + `next()` 兜底校验；`.btn-off` 灰显 |
| R3-2 | 快捷日期排版恶心 | `.qchip` `calc(50% - 8rpx)` → `calc(50% - 12rpx)`（**flex 临界陷阱**） |
| R3-3 | 人数界面重做 | `.picklist`/`.pickrow`/`.pickexpand`；新增 `user` / `users-3` 图标 |
| R3-4 | 1 人还问「和谁一起住」 | `showRelation` + `applyAdults()` 强制回「独自」 |
| R3-5 | 折叠分组不一致 | `htb_ui_collapsed_v2` 按行程隔离 → 新行程全展开 |
| R3-6 | 左右滑动无效 | 判定挪到 `touchmove` + `touchcancel` 复位 + `_fired` 锁；阈值 48/1.2 |
| R3-7 | 回到顶部出现太晚 | `SCROLL_TOP_TRIGGER = 120` 抽到 `core/gesture.ts`，两页共用 |

### 新增文件 / 变更文件

- `FIX-PLAN.md`（**新建**）—— 规划 + 验收对照，后续每轮反馈都往这里追加
- `miniprogram/core/gesture.ts` —— 加 `SCROLL_TOP_TRIGGER` / `shouldShowGoTop`，滑动阈值放宽
- `miniprogram/pages/stay/stay.{ts,wxml}` —— 折叠 v2 按行程隔离、滑动重写、回到顶部阈值
- `miniprogram/pages/wizard/wizard.{ts,wxml,wxss}` —— 7 条里 4 条落在向导
- `miniprogram/pages/knowledge/knowledge.ts` / `pages/mine/mine.ts` —— 阈值共用 / 清空清单含 v1+v2
- `tools/gen-icons.py` —— 新增单人 `user` 与三人 `users-3`（重跑后 39 图标 / 80 变体 / 27.2 KB）
- `tests/acceptance.test.ts` —— 新增 **K1–K8**，并更新 J9（`bindtouchend` → `bindtouchmove`）

### 验收自查（权威）

```
npm test                                 123 passed（38 源 + 85 验收）  ← 115 → 123
npm run typecheck / typecheck:test       通过
npm run diff:types/data/engine           三文件零差异（红线未破）
npm run check:icons                      80 条 class / 57 处静态引用，零缺失
```

源项目的 38 个用例（`tests/engine.test.ts`）**逐字未改**，仍全绿。

### 本轮的两条教训

1. **「排版难看」经常是布局 bug，不是审美问题**。老板说快捷日期「非常恶心」，看图是四个按钮竖排一列 ——
   根因是 `calc(50% - 8rpx)` + `gap: 16rpx` **正好 = 100%**，子像素取整后溢出退化成单列。
   教训：flex 多列**永远留余量**，别算到「正好」。
2. **用户说「你没做」的时候，先别争**。左右滑动上一轮确实写了代码，但判定等 `touchend` —— 它在部分机型上会被系统吞掉。
   正确做法是换一套更稳的实现（`touchmove` 当场判定），并在文档里把原因讲清楚，而不是回一句「代码里有的」。

### 仍需真机确认

见 `ACCEPTANCE.md` §7 的 **H23–H29**。优先验 **H25**（人数界面四条要求）与 **H28**（滑动实测 —— 需重新扫码）。

---

## M11 · 第四轮反馈落地 ✅ 完成（2026-10-02 收尾）

> 规划与调研文档：**`R4-PLAN.md`**（含滑动动效的方案选型、风险与降级路径 + R4-* → 用例对照表）。
> 需求口径：`CHANGE-REQUESTS.md` §16。人工验收项：`ACCEPTANCE.md` §7 的 **H30–H36**。

### 做了什么（5 条 + 1 项遗留）

| # | 反馈 | 关键改动 |
|---|---|---|
| R4-1 | 「谁和你同行」选项太少 | 第 ③ 步扩成「同行名额 + 人员构成 + 同行关系」三块；关系加「其他」 |
| R4-2 | 同行人数能超过入住人数 | 引入同行名额：`成人同行 + 儿童 + 老人 ≤ adults − 1`，用尽则三个「＋」全禁用 |
| R4-3 | 同行关系与住宿关系打架 | 第 ③ 步定了关系 → 第 ④ 步锁定禁用；选「其他」才开放 |
| R4-4 | 数量减到 0 要提示 | 新建自绘 `components/toast`，900ms，两处接入 |
| R4-5 | 滑动要有跟手动效 | 改用 **WXS 响应事件**（视图层跟手，零跨线程通信）+ 三段可平移轨道 |
| R4-6 | 工具类重复定义 | `.grow` / `.hv` 收进 `app.wxss`（页面删 9 处，组件内保留） |

### 新增文件 / 变更文件

- `R4-PLAN.md`（**新建**）—— 规划 + 调研 + 风险 + 验收对照
- `miniprogram/pages/stay/swipe.wxs`（**新建**）—— 跟手手势，跑在视图层
- `miniprogram/components/toast/*`（**新建**）—— 数量归零浮窗
- `miniprogram/core/toast.ts`（**新建**）—— 浮窗文案与时长（900ms）的共享口径
- `miniprogram/core/extra.ts` —— 加同行名额体系（`companionBudget` / `canAddCompanion` / `autoRelation` / `clampCompanions` / `elderlyCountOf` / `syncElderlyFlag`）+ `Relation` 加「其他」
- `miniprogram/pages/wizard/wizard.{ts,wxml,wxss}` —— 第 ③④ 步重做 + 名额约束 + 关系锁定
- `miniprogram/pages/stay/stay.{ts,wxml,wxss}` —— 轨道结构 + `<template>` 复用三段 + 数据按段打包
- `miniprogram/components/clothing-add/clothing-add.ts` —— 加 `openchange` 事件（页面据此挡住滑动）
- `tools/gen-icons.py` —— `check` 补 pine 档（重跑后 81 变体 / 27.4 KB）
- `tests/acceptance.test.ts` —— 新增 **L1–L13**；更新 J6 / J9 / K6

### 验收自查（权威）

```
npm test                                 136 passed（38 源 + 98 验收）  ← 123 → 136
npm run typecheck / typecheck:test       通过
npm run diff:types/data/engine           三文件零差异（红线未破）
npm run check:icons                      81 条 class / 61 处静态引用，零缺失
swipe.wxs                                语法检查通过
17 个 WXML 模板                           bad=0
包体积                                    342.4 KB / 85 文件（余量 83%）
```

源项目的 38 个用例（`tests/engine.test.ts`）**逐字未改**，仍全绿。

### 本轮最值钱的教训

**前两轮滑动一直「不流畅」，不是判定逻辑写错了，是架构选错了。**
页面自己的 `bindtouchmove` 要走「视图层 → 逻辑层 → setData → 视图层」两次跨线程通信，
一秒 60 次手势就是 120 次通信 —— 必然一顿一顿，排队时还会丢事件（「有时候没反应」）。
微信官方对这件事有专门方案（**WXS 响应事件**）：处理函数跑在视图层，直接 setStyle，通信 0 次。

连续三轮都在「判定逻辑」上打转（`touchend` → `touchmove` → 调阈值），真正的问题在**事件跑在哪一层**。
下次遇到「性能 / 流畅度」类反馈，先问「这条链路跨了几次线程」，而不是继续调参数。

### 仍需真机确认

见 `ACCEPTANCE.md` §7 的 **H30–H36**。**H30 是成败点，优先验**：
手势绑在页面的内置 `<view>` 上，而手指大多落在 `item-row` 这类自定义组件内部；
官方说「WXS 不支持自定义组件事件」指的是不能绑在自定义组件上，绑在内置 view 上按说可行，
但必须真机确认。不行则降级为「松手后补间动画」（动效还在，只是不跟手）。
**务必重新扫码** —— DevTools 的「编译」只作用于模拟器。

---

## M12 · 真机异常修复：WXS 编译失败（2026-10-02）

老板真机扫码后行程页**直接编译失败**，弹窗与控制台各报一条：

```
./pages/stay/swipe.wxs:115:22:Unexpected token `(
编译 .wxml 文件错误，错误信息如上，可在控制台查看更多详细信息
```

### 根因：WXS 不是 JavaScript

第 115 行是 `var idx = Number(ins.getDataset().idx) + s.dir;`。
`Number(...)` 在 JS 里再普通不过，但 WXS 的基础类库里 **`Number` 只有 4 个属性
（`MAX_VALUE` / `MIN_VALUE` / `NEGATIVE_INFINITY` / `POSITIVE_INFINITY`），
没有方法、也不能当构造函数调用**；`String` 干脆不在类库里。
所以 `Number(x)` / `String(x)` 这类转换在 WXS 里是**非法语法**。

WXS 里能调的全局函数只有 `Global` 的 8 个：
`parseInt` / `parseFloat` / `isNaN` / `isFinite` /
`decodeURI(Component)` / `encodeURI(Component)`。

### 为什么模拟器没报

**开发者工具与真机不是同一版 WXS 编译器**，模拟器那版宽松、真机那版严格。
这类问题**只有真机能暴露**，本地唯一能做的是「按文档把语法限制静态扫出来」。

### 改动

- `pages/stay/swipe.wxs`
  - `String(ds.lock) === '1'` → `ds.lock === '1' || ds.lock === 1`
  - `Number(x)` ×2 → 新增 `toNum()` 辅助函数，内部走 `parseInt(v, 10)` + `isNaN`
  - 对象字面量的**尾随逗号**全删
  - `ins.getDataset()` 两次调用收敛成一次
  - 轨道 / 视口选择器加 class 兜底（`#stageRail` → 失败退 `.stage-rail`），
    避免「选择器没匹配上 → 整轮手势静默失效」这种最难查的失败
  - 文件头写死「WXS 不是 JS」的约束清单 + 这次踩的坑
- `tools/check-wxs.py`（**新建**）+ `npm run check:wxs`
  —— 查不可调用的内置构造函数 / 未定义的裸函数 / ES6+ 语法 / `new` / 尾随逗号
- `tools/check-wxml.py`（**新建**）+ `npm run check:wxml`
  —— 标签配对 + `{{ }}` 配对（真机上同样报「编译 .wxml 文件错误」）
- `tests/acceptance.test.ts` —— 新增 **L14**（WXS 语法合规）；更新 **L11**

两个脚本都做了**反向验证**：故意写坏的文件能逐条报出（11 处 / 3 处），干净文件通过。
`check:wxs` 里「裸函数调用必须在本文件内有定义」这条最狠 ——
它同时抓「函数名拼错」和「用了 WXS 没有的全局函数」，这两种在模拟器里都是静默失败。

### 验收自查（权威）

```
npm test                                 137 passed（38 源 + 99 验收）  ← 136 → 137
npm run typecheck / typecheck:test       通过
npm run diff:types/data/engine           三文件零差异（红线未破）
npm run check:wxs                        1 个 wxs / 219 行，零问题
npm run check:wxml                       17 个模板，标签与插值全配对
npm run check:icons                      81 条 class / 61 处静态引用，零缺失
```

### 本轮最值钱的教训

**「模拟器能跑」不等于「真机能跑」。** 前几轮的所有自检都是在本地跑的，
而本地那套编译器比真机宽松 —— 这次就是一个 `Number(x)` 直接让整页编译失败。

→ 以后凡是往 `.wxs` 里写代码，先跑 `npm run check:wxs`；
   凡是改完 `.wxml`，先跑 `npm run check:wxml`。别拿扫码试错。

### 待真机

`ACCEPTANCE.md` §7 的 **H37**（回归验证：不再报编译错误）。
**通过后再继续验 H30**（滑动是否生效）—— H30 才是第四轮反馈的成败点。


---

## M13 · 第五轮反馈落地 ✅ 完成（2026-10-02）

需求来源：`CHANGE-REQUESTS02.md`（R5-1…R5-9，老板第五轮反馈 + 全部 6 条拍板结论）。
按该文档 §10 的建议顺序执行（不是按编号顺序）。

### 本步做了什么

| 需求 | 落法 |
|---|---|
| R5-1 三视图滑动 | **未改手势代码**（见「与规格的偏差」①）。真机验证清单写进 `ACCEPTANCE.md` H38 备注 |
| R5-7 衣物下拉错位 | 浮层（遮罩 + 面板）包进 `<root-portal>`，脱离 `.glass` 的 `backdrop-filter` 包含块；`fixed` 恢复相对视口定位 |
| R5-8 浮窗 | `TOAST_MS` 900 → 1500（推导与历史留档在 `core/toast.ts` 注释）；宽度 `620rpx` → `calc(100vw - 96rpx)`；L12 断言同步 |
| R5-2 整行可点 | `item-row` 根节点 `bindtap="onToggle"` + 组件内补 `.hv`（app.wxss 穿不进组件）；勾选框/步进器/使用人/好物/删除 5 处 `catchtap` 挡冒泡；向导第 ⑦ 步预览改 `editable + bind:toggle`。**入住/退房段零改动**（本就整行可点） |
| R5-4 删关系块 | 第 ⑤ 步的「和谁一起住」整块删除（连同 `setRelation` / `relationLocked` / `relationLockHint` / `showRelation`）；`autoRelation` 的自动写回保留；关系提示 `fxRelation` 挪到第 ④ 步同行关系 chips 下方 |
| R5-9 住宿情况页 | `PurposeExt`（7 值）+ `toSourcePurpose()` 降级映射；`draft.purpose` 与 `purposeExt` 双写双读；第 ⑤ 步 `.chips` → `.picklist` 一列 7 行 + 动态 `fxline`（`fxNames` 差集实时算，不硬编码）；`buildPrepExt` 对缺失 `purposeExt` 按源 `purpose` 回推 |
| R5-3/R5-5 性别+经期 | 扩展层 `Gender` / `genderOf` / `GENDER_EXCLUDE`（female 摘剃须刀、male 摘卸妆棉，itemId 匹配）；新第 ① 步性别（未选时「开始」灰显）；第 ⑥ 步仅女性可见的经期开关；`ExtraItemDef.prep` 放宽为可函数；卫生巾（女性恒有，经期→必带 + nights+1）与止痛药（仅女性+经期）触发规则分立；性别切回男性清 `period`；`loadExt` / `importExt` 逐字段校验（sanitizeStayExt，绝不添加原记录没有的字段）；向导 6 → 7 步全面顺移 |
| R5-6 化妆品 | `CAT_ORDER_EXT` 改锚点插入（化妆品紧跟衣物）；`COSMETIC_TYPES` 22 项入扩展层；`clothing-add` 泛化（types/cat/placeholder 属性，**保留原名**，头注释声明）；两页面 `data-cat` 事件路由 + 双面板 id/close/锁滑动处理；女性追加空「化妆品」组承载入口（空组不显示 0/0）；好物关键词补化妆品类 |
| 图标 | `gen-icons.py`：bed-double/house 补 p 档、sliders 补 p 档；新增 mars/venus（性别 ♂♀）；icon.wxss 重新生成（81 → 88 条 class） |
| 测试 | acceptance 99 → 111 条：更新 H2/H11/K1/K3/K4/L9/L12；新增 M1–M12（性别过滤、卫生巾/止痛药规则、PurposeExt 降级、场景物品、化妆品接线、root-portal、浮窗、手势无双实现、loadExt 校验、图标档位） |

### 验收自查（权威）

```
npm test                                 149 passed（38 源逐字未改 + 111 验收）  ← 137 → 149
npm run typecheck / typecheck:test       通过
npm run diff:types / diff:data / diff:engine   三文件零差异（H57 红线未破）
npm run check:icons                      88 条 class / 67 处静态引用，零缺失
npm run check:wxs                        1 个 wxs / 219 行，零问题
npm run check:wxml                       17 个模板，标签与插值全配对
```

### 与规格的偏差（5 处，均有理由）

1. **R5-1 未改任何手势代码**。规格 §2.3 把「事件能否从自定义组件冒泡到 WXS」列为最可疑点，
   但官方文档（`framework/view/tap`）已明确：**触摸事件是冒泡事件、可穿越组件边界且有捕获阶段**
   —— R4 的绑定方式（页面根 `bindtouchstart`）在文档层面成立。而 R4 版在真机从未跑起来过
   （编译失败，已修），病根大概率是「没重新扫码」。规格 §2.2 自己要求「不要跳步、先诊断」，
   所以方案 A/B/C 全部保留为真机诊断后的预案，验证清单在 `ACCEPTANCE.md` H38 备注。
2. **`fxRelation` 的渲染位置挪到第 ④ 步**（规格说「保留，逻辑不变」，但它唯一的渲染点在被删的
   第 ⑤ 步块里）。关系的选择入口收拢到同行人员步后，提示跟到同一处，与 `fxChildren` 同款模式。
3. **`x_study_doc` / `x_study_kit` 的 `when` 扩成 `study || purposeExt === '学习培训'`**。
   不改的话 H55「选学习培训→出现学习资料」不成立（规格表格要求该标签触发这两项，但没写改哪）。
4. **女性空「化妆品」组需要显式插入**（规格 §6.1「不预置物品」的必然推论，H46 的硬要求）：
   不插入的话空分类不会自然成组，添加入口无处渲染。空组的「0/0」计数一并藏掉。
5. **住宿情况的 `fxline` 由 `fxNames` 差集动态计算**而非照抄规格表格文案 —— 例如「出差」在
   1 晚时只提示颈枕不提示烧水壶（规则本来就给不出），动态计算保证提示永远不会许诺不会出现的东西。

### 未决问题（全部要真机）

- **H38 滑动是否生效**（成败点，验证清单见 ACCEPTANCE.md）；
- H47 下拉在真机的定位精度（root-portal 在 WebView / Skyline 下的表现）；
- H39 真机上 picker 弹层是否还会连带触发行勾选（已按「实测确认」处理，`catchtap` 已挂）；
- H51 性别热切换的手感（预览在第 ⑦ 步进入时重建，来回切步号属预期行为）。


---

## M14 · 第六轮反馈落地 ✅ 完成（2026-10-02）

需求来源：老板口头反馈（7 项），无需求文档。

### 本步做了什么

| # | 反馈 | 落法 |
|---|---|---|
| 1 | 性别页：删说明文字 + 男/女加大 | fxline 删除；新增 `.pickrow-lg`（132rpx / 34rpx 字号 / 48 图标） |
| 2 | 「看病」图标不合适 | 新增 `medical-cross`（圆角方框 + 加号，lucide 描边风），PURPOSE_ICONS['看病'] 由 pill 换过来 |
| 3 | 删偏好页「培训 / 学习」 | 开关与 fxline 删除；学习类物品唯一由第 ⑤ 步「学习培训」触发；StayExt.study 保留兼容老数据（when 仍认它，copyLast 不丢物品） |
| 4 | 「替其他人管行李」开关 | 第 ① 步性别下方加开关（默认**开** = 与旧行为一致；关 = 只按自己 1 人生成）。实现：buildPrepExt 在调用红线源引擎前把条件降级（adults:1 / children:0 / elderly:false，宠物保留）—— 源引擎零改动。StayExt.careOthers 存储，老数据缺失按开 |
| 5 | 好物页布局 | 「恢复默认好物」按钮删除（modal 组件随之下线，resetGear 引擎能力保留）；「添加好物」从顶部挪到列表下方，空态文案同步 |
| 6 | 下拉面板两处问题 | ① 滚不动：根因是遮罩 `catchtouchmove` 取消了 overflow 滚动的默认行为，列表区改 `<scroll-view scroll-y>`；② 选完没法编辑：输入行原来排在全部类型后被 max-height 截掉，现拆两段 —— 列表滚动区 + 常驻底部输入行，列表末尾加「自定义」项（点击聚焦输入行、不关面板），老板描述的路径全程可走通 |
| 7 | 化妆品位置 + 预置 | 修复：化妆品组 push 进 cats 后**统一按 CAT_ORDER_EXT 排序**（R5 版 push 在排序之后导致组跑到底部）；预置香水 / 口红 / 粉底三件（仅女性默认出现，男性可手动加，性别未知不出现） |

### 验收自查（权威）

```
npm test                                 155 passed（38 源逐字未改 + 117 验收）  ← 149 → 155
npm run typecheck / typecheck:test       通过
npm run diff:types / diff:data / diff:engine   三文件零差异（H65 红线未破）
npm run check:icons                      91 条 class / 67 处静态引用，零缺失
npm run check:wxml / check:wxs           零问题
```

### 与规格的偏差

无（本轮为口头反馈直接落地）。两处自主决策需说明：
1. **管行李开关默认开**：老板倾向「记录多人物品多余」，但带娃漏掉儿童用品代价更大 ——
   精简应是主动选择；且默认开 = 老数据行为不变，向后兼容零风险。
2. **化妆品预置 3 件**（香水/口红/粉底）：老板原话「象征性地放一些比较常见的」；
   完整类型表（22 项）仍在下拉面板里供一键添加，两者不冲突。

### 未决问题

- H63 下拉面板的滚动与聚焦需真机确认（scroll-view 在 root-portal 内的表现，
  模拟器无法完全代表真机）；
- H59 开关切换后第 ④ 步的 fxChildren / fxElderly 会自动变空（清单按自己算），
  真机上确认提示行没有「幽灵文案」。


### M14.1 · R6.5 追加：管行李开关的流程连锁（2026-10-02）

老板指出逻辑缺口：关掉「替其他人管行李」后，再问「几个人入住、和谁同行」没有意义。

| 项 | 落法 |
|---|---|
| 流程连锁 | 关=跳过第 ③④ 步（人数 / 同行人员），向导 7 步变 5 步（`ALL_STEPS` / `SOLO_STEPS`）；导航 next/prev 按 flow 数组走 |
| 进度显示 | 进度条与「N/M」改用 **stepPos（位置）**：关掉后步骤号不连续（1,2,5,6,7），用步骤号会出现「5/5 还没到最后一步」；底部「保存 / 下一步」的判定同步改 `stepPos !== total` |
| 数据连锁 | 关=同行相关数值清零（adultsWith / children / elderlyCount / relation→独自）—— 留着只会让行程页头部的「· 家人」说谎；重新打开后需重新填写 |
| 说明文案 | 第 ① 步扩成两行 ×2 态：第一行讲「后续步骤」变化、第二行讲「清单」变化，与代码行为一一对应 |
| 假话修复 | buildEffects 的「N 人入住、每人份按 N 份」在关掉时不再输出（清单已按 1 人算） |

自检：156 passed（38 源 + 118 验收），红线三连零差异，icons/wxml/wxs 全绿。


---

## M15 · 第七轮反馈落地 ✅ 完成（2026-10-02）

### 本步做了什么

| # | 反馈 | 落法 |
|---|---|---|
| 1 | 知识库免责声明与「我的」重复 | 知识库的声明卡删除（wxml 结构 / ts 数据 / wxss 样式三处清掉）；「我的」页同源声明保留。等级图例留在知识库（读条目时的随身参考，不重复） |
| 2 | 色块生硬拼接（色块拼凑.jpg） | 根因：page 级 background-image 的径向渐变**只按第一屏（视口）绘制**，内容滚出第一屏后只剩纯色底，两者在第一屏底部生硬相接。修复：page 只保留纯色底；六个页面各挂一个 `<view class="bg-glow" />`（fixed 铺满视口、z-index:-1、pointer-events:none），渐变永远铺满视口、不随内容滚动 |

### 验收自查（权威）

```
npm test                                 158 passed（38 源逐字未改 + 120 验收）  ← 156 → 158
npm run typecheck / typecheck:test       通过
npm run diff:types / diff:data / diff:engine   三文件零差异（H68 红线未破）
npm run check:icons / check:wxml / check:wxs   全绿
```

### 备注

- 知识库 `.b`（加粗）样式保留 —— 条目正文还在用，只删了免责声明专属的 .d-* 系列。
- 色块问题影响所有长页面，修复是全局的（六个页面都换了实现）；真机验证时以知识库滚动到底为准。

## M16 · 第八轮反馈落地 ✅ 完成（2026-10-02 收尾，两部分）

本轮两件事：**A. 数据健壮性**（偏差表 A/B/C 组）、**B. 滑动终案**（R5-1 第 5 次反馈「根本没实现」）。

### A 步做了什么（数据健壮性，偏差 A1–C11）

| # | 问题 | 落法 |
|---|---|---|
| A1/A4 | `listStays()` 裸 `JSON.parse`，存储损坏 → 全应用打开即崩 | 新建 `core/repair.ts`（纯函数：parseStaysPayload / normalizeStay / fitCheckMatrix / sanitizeBackup）；`platform.ts` 读 STORE_KEY 时过读修复，救不来的原文隔离到 `htb_stays_v1_corrupt` 后按空表继续 |
| A2 | 备份导入校验不完整 | `importDataExt` 先经 sanitizeBackup / normalizeStay 净化再落盘；checkin/checkout 矩阵用 fitCheckMatrix 对齐当前 CHECKLISTS（前向兼容） |
| A3 | 写失败静默 | `platform.ts` setItem 失败 toast「本机存储异常」+ console.error |
| B5/B6 | 进度口径不一 / 人数残留 | 新增 `prepStats` 统一三页口径（qty=0 不进分子分母）；wizard 关「替其他人管行李」补 `adults: 1` |
| C7–C11 | 工程卫生 | 删异常图片 2 张（含零宽字符文件名）；.gitignore 补 `.workbuddy-ai/`；版本对齐 1.0.0；删死代码（nav.peekNav / store.phaseOf）；PROJECT-INTRO / RELEASE-CHECK 文档修正 |

### B 步做了什么（滑动终案，R5-1 收官）

老板第 5 次反馈三段滑动「根本没实现」。查证结论：代码接线无断裂，前四轮方案
（页面层 touchstart/touchend → 无效；touchmove + _fired 锁 → 不跟手；WXS 视图层 →
iOS 真机无反应；修 WXS 语法 → 未做真机回归）败在**链路本身**：WXS 跑视图层、
出错无日志（失败无声）、iOS 事件链路不稳。落地 CHANGE-REQUESTS02 §2.5 拍板的
方案 C —— **原生 `<swiper>`**：

| 动作 | 内容 |
|---|---|
| `stay.wxml` | 三段常驻 `<swiper-item>`（prep / checkin / checkout），`current="{{stageIdx}}"`，滑动时相邻段内容跟着滑入；`<wxs>` 标签与 4 个 bindtouch 绑定删除 |
| `stay.ts` | `onSwiperChange`（只认 `source === 'touch'`，防程序 setData 回环；切段仍走 `gotoStage` 与页签共用入口）+ `measureSwiper`（量当前段 `#pane{idx}` 实高撑 swiper，render 回调与 toggleGroup 折叠两个时机补量）；swipeLock / syncSwipeLock / onClothOpen / onSwipeDone 全部删除 |
| `stay.wxss` | 删 `.stage-viewport` / `.stage-rail` / `.seg-seg` 轨道样式；新增 `.stage-swiper`（负 margin + width 补偿保卡片阴影）/.pane-inner（padding 推回安全区） |
| `swipe.wxs` | **整个删除** —— 项目已无任何 .wxs 文件，「工具能过、真机挂」的编译风险随载体消失（check-wxs.py 动态扫描，找不到目标直接放行） |
| `core/gesture.ts` | 手写滑动判定（阈值 + 方向函数）整体退役；滚动阈值一族（SCROLL_TOP_TRIGGER / shouldShowGoTop）保留 |
| `clothing-add` | `openchange` 事件链整体删除（6 处 triggerEvent；浮层防误滑改由遮罩 catchtouchmove 物理承担，modal 同理） |
| 测试 | J8 / J9 / K6 / L10 / L11 / L14 / M10 七个用例改写为 swiper 版（防回退红线：无 `<wxs>`、无 bindtouch、无 swipeLock、无 .wxs 文件、单一手势实现） |

### B 步续 · 流畅度优化（真机第九次反馈：「切换过程不流畅」）

滑动功能真机验证已通，但三个掉帧源让切换观感发涩。逐一根治：

| 掉帧源 | 对策 | 落点 |
|---|---|---|
| 切段走 `render()` 全量：3 次渲染管线往返（先 setData stageAuto → 全量重算 → 回调量高），切段**不产生任何数据变化**，纯属浪费 | 轻量路径：`gotoStage` 只提交 4 个小字段（stage / stageIdx / stageAuto / stageHint），VM 原样可用；render 全量只留给 mutate / onShow | `stay.ts` |
| 松手翻页后 `swiperH` 突变：横移动画结束瞬间页面长度跳变，危险区跟着跳动 | `.stage-swiper` 加 `transition: height 0.24s ease`（与 duration="240" 同档，横移期间高度平滑长/缩）；touch 拖动期间不量高，不影响跟手 | `stay.wxss` |
| 页签高亮瞬时跳变 | `.seg-i` 加 `transition: background-color 0.2s ease, color 0.2s ease` | `stay.wxss` |
| 快速连划量高乱序：两次查询回调返回顺序不保证，旧段高度会把 swiper 撑错再跳回（肉眼可见抖动） | `measureSwiper` 闭包捕获发起时的 `idx`，回调到达时已切段则丢弃（乱序防御） | `stay.ts` |

顺带把头部文案抽成 `stageHintOf(stage, auto)` 模块函数 —— render 与 gotoStage 两处共用，
文案写两份迟早漂移。测试同步：J9 加轻量切段断言（gotoStage 切片内不得调 `this.render(`）、
J10 的 stageAuto 断言改为 gotoStage 切片（单次小提交后字面量已并位）、K6 改锚 `#pane${idx}`
并加乱序防御断言、L10 加两条 transition 断言。**169 passed 不变，红线三文件仍未碰。**

**已知取舍**：分组进了 swiper 后，准备段分组标题吸顶（P1-3 的 sticky）不再激活 ——
sticky 的最近滚动祖先变成不纵向滚动的 swiper。页签吸顶（.seg-sticky 在 swiper 外）
不受影响。这是「滑动在真机上真正可用」的代价，取舍记录在 stay.wxss 注释与
ACCEPTANCE H38 清单第 6 条。

### 验收自查（权威）

```
npm test                                 169 passed（38 源逐字未改 + 131 验收）  ← 158 → 169
npm run typecheck / typecheck:test       通过
npm run diff:types / diff:data / diff:engine   三文件零差异（红线未破）
npm run check:icons / check:wxml / check:wxs   全绿（check:wxs 现在扫不到目标文件）
```

### 备注

- 待真机回归：ACCEPTANCE.md H38 清单（M16 原生 swiper 版）按顺序走一遍。
- 老代码里 platform.ts 曾误标「M10 读写加固」—— M10 已被第三轮占用，本轮统一改为 M16。
- `tools/check-wxs.py` / `check-wxml.py` 保留：将来若再引入 wxs，语法红线仍有守护。

---

## M17 · 第十轮反馈落地 ✅ 完成（2026-10-02 · 首屏提速）

老板反馈：从首页点「最近的入住」进行程页「要加载一小会儿」。根因有二：

1. **首进 3 次渲染管线往返串行**：onLoad 提交 id/initStage/hints → onShow 提交
   loaded/stageAuto（wxml 只看 missing，这俩纯内部字段，落地不产生任何视图变化）→
   render 再提交整页清单 VM。从首页点进来，先看到空骨架再等内容「啪」地出现。
2. **swiper 高度「兜底 600 → 量到实高」的展开过渡**：进入瞬间页面长度还在变，
   观感上像「还在加载」。

| 动作 | 内容 |
|---|---|
| `stay.ts` onLoad | **零 setData** —— URL 参数暂存到实例字段 `_bootId` / `_bootStage`（onLoad 到 onShow 之间页面还没渲染，data 不会被任何人读到，提前提交只是白付一次序列化 + 视图层往返） |
| `stay.ts` onShow | 首进把 id / initStage / loaded / stageAuto / swiperH 缓存初值**连同整页 VM 并入 render 的同一次大提交**（3 次 → 1 次；render 加 extra 第三参）；missing 态把 id 一并落 data |
| `stay.ts` 高度缓存 | 新增 UI 层 key `htb_ui_paneh_v1`（按行程 × 段位存上次实高）：首帧直接用缓存高度，量高回调只做校准（数据没变时零跳变）并回写；读不到 / 值非法一律回退 600（缓存损坏不带崩页面 —— 项目硬约束：存储解析必须容错） |
| `stay.ts` hints | `CUSTOM_HINTS` 是常量表，直接作 data 初始值，不再每次进页 setData 提交一遍 |
| 防残留 | 删除行程清 `removePaneH`（与 removeStayExt 同模式）；mine.ts OWN_KEYS 加 `htb_ui_paneh_v1` |
| 测试 | J5 的 `isStage(this.data.initStage)` 断言改为 `_bootStage` 版（语义不变）；K6 量高断言适配回写结构；新增 P1–P3（onLoad 零提交 / 大提交合并 / 高度缓存容错与防残留 / hints 静态化） |

### 验收自查（权威）

```
npm test                                          172 passed（38 源 + 134 验收）  ← 169 → 172
npm run typecheck / typecheck:test                通过
npm run diff:types / diff:data / diff:engine      三文件零差异（红线未破）
```

### 备注

- 进入速度的最终体感在真机上验（ACCEPTANCE.md H69）：连续两次进同一行程对比，
  第一次是「无缓存冷启」（兜底 600 校准一次），第二次起应是「秒开 + 页高直接正确」。
- render 的全量重算仍在（数据变化路径 mutate / onShow 保留），只是首进的提交次数减了。

---

## M18 · 第十一轮反馈落地 ✅ 完成（2026-10-02 · 全选 / 标签审核 / 下拉修复 / 页面去重）

老板七点反馈，一次落地。核心原则：**标签必须是有依据的事实，臆测的不标**；
**数据层（红线）一字不动，全部在渲染层与页面层适配**。

| # | 反馈 | 落点 |
|---|---|---|
| 1 | 向导第 ⑥ 步「在意哪些方面」要全选按钮 | `wizard.ts` 新增 `toggleAllPrefs`（两态：全开 ↔ 全关，`prefsAll` 驱动文案「全选 / 取消全选」）+ `syncPrefsAll`（单个开关后重算）；`wizard.wxml` 问题行右侧加链接；`wizard.wxss` 加 `.qhead` / `.selall`。经期是身体状况不是偏好，不掺进来 |
| 2 | 证件类物品（手机 / 钱包 / 现金）不该有「挑好物」 | `item-row.ts` syncGear：`hasGear = !!it.itemId && it.cat !== '证件'` —— 证件类整类豁免（已购定型、入住只求快）。手机 / 钱包 / 现金经查都在 data.ts 的「证件」分类下 |
| 3 | 无收藏时显示「挑好物」不合适 | 面板实际记的是「你用过的品牌」，购物腔改为记录腔：无收藏显示**「记好物」**，有收藏照旧「好物 N」。三字等宽，布局零影响 |
| 4 | 「家里带」这类臆测标签不要乱加 | `item-row.ts` 新增 `HIDE_PREP` 集合（家里带 / 建议购买 / 到店购买），渲染层不再显示；保留有事实依据的四类：必带 / 推荐 / 可选 / 自定义。`item-row.wxml` 改 `wx:elif="{{showPrepTag}}"`（JS 预计算，模板不写裸比较）。**data.ts / extra.ts 数据一字未动** |
| 5a | 衣物下拉选中后触发条仍显示所选类型 | `clothing-add.ts`：选完即复位（onPick / onAddCustom 不再写 chosen），触发条回到占位文案；`chosen` 属性整个退役（无调用方传它），面板列表的选中高亮与 `.copt.chosen` 样式随之删除 |
| 5b | 化妆品下拉显示「选择衣物类型」 | `clothing-add` 新增 `trigger` 属性（触发条占位文案），四处接线各自传「选择衣物类型…」/「选择化妆品类型…」（衣物 / 化妆品 × 行程页 / 向导） |
| 6 | 清单出现两个一模一样的「化妆品」组 | 根因：女性行程预置香水 / 口红 / 粉底（x_perfume / x_lipstick / x_foundation）后 items 已含「化妆品」，`cats.push('化妆品')` 无条件追加 → `new Set` 去重发生在 push 之前。两页同修：`stay.ts` / `wizard.ts` push 前加 `!cats.includes('化妆品')` 查重（M6 / N3 钉的 `cats.push('化妆品')` 字面量原样保留，老断言不破） |
| 7 | 首页与「我的」重复；偏好设置没用 | mine.wxml 删**数据概况卡**（次入住 / 晚数 / 平均备齐与首页统计条一模一样，只显示一次 —— 留在首页）；删**偏好设置卡**（老板拍板没用：「默认住宿场景」只影响新建行程的默认值，改它毫无反馈）。mine.ts 清理 reload / setRelation / 统计字段与 RELATIONS / getDefaultRelation / prepStats 引入；mine.wxss 清死样式；刊头 tagline 与隐私说明重复，改「管好你的本机数据」；askClear 文案「偏好设置」→「个性化设置」。**home.wxml 一字未动**（统计条 + 本机提示都在，I4 断言不受影响） |
| 7b | 自定义物品默认标「家里带」也是臆测 | `stay.ts` / `wizard.ts` 的 addTyped（衣物 / 化妆品下拉添加）：`prep: '家里带'` → `'自定义'`，与「还有一些东西」入口（addCustom）同一口径 |

### 验收自查（权威）

```
npm test                                          178 passed（38 源 + 140 验收）  ← 172 → 178
npm run typecheck / typecheck:test                通过
npm run diff:types / diff:data / diff:engine      三文件零差异（红线未破）
```

测试增量：新增 Q1–Q6（全选两态 / 证件豁免与记好物 / HIDE_PREP 与 wx:elif /
trigger 与 chosen 退役 / 化妆品查重 / mine 去重）；Z10 的 mine prepStats 断言
移除（「我的」不再显示统计，口径统一守卫只剩首页）。

### 备注

- 「记好物」的真机观感、全选按钮的手感、下拉复位后的使用节奏，见 ACCEPTANCE.md H70。
- 老行程（含历史上标成「家里带」的自定义物品）不受影响：数据不动，只是行内不再显示该标签。
- 老板若还要更激进的口径（如「推荐 / 可选」也不显示），只需改 `HIDE_PREP` 一个集合。

## M19 · 第十二轮反馈落地 ✅ 完成（2026-10-02 · 全选补全与醒目化 / 删除按钮退役 / 滚动条常亮）

老板三点反馈，一次落地。延续 M18 的原则：**数据层（红线）一字不动，全在渲染层与页面层**。

| # | 反馈 | 落点 |
|---|---|---|
| 1 | 全选按钮太隐蔽 | `wizard.wxss` `.selall` 从纯文字链接升级为**胶囊按钮**：底色 + 描边 + 28rpx 加粗，与问句同排一放就可见 |
| 2 | 选了女生后按全选，「是否处于经期」没被触发 | `wizard.ts` 全开判定收进 `allOn()`：四个「在意」+（女性）经期才算全开；`toggleAllPrefs` 按它翻转，女性经期一并开/关；`togglePref` / `togglePeriod` / `setGender` 三处都调 `syncPrefsAll()` 对账（性别一变口径就变）。男性没有经期开关，不参与判定 —— 全选不该替用户编造身体状况 |
| 3a | 下拉手动添加的物品右侧删除按钮多余（stepper 减到 0 已等效删除） | **整链路退役**：`item-row` 删 del 节点 / `removable` 属性 / `onRemove` 方法 / `.del` 样式；`stay` 删 `bind:remove` 接线与 `onItemRemove`（连带 `KeyEvent` 接口）；`wizard` 同删（连带 `IdxEvent` 接口） |
| 3b | 下拉面板滚动条要常亮（用户看不出能往下滑） | `clothing-add.wxml` scroll-view 加 `show-scrollbar`；`clothing-add.wxss` `.clist ::-webkit-scrollbar` 定义宽度后 WebView 切 classic 模式 —— 滚动条常驻不再淡出 |

### 验收自查（权威）

```
npm test                                          182 passed（38 源 + 144 验收）  ← 178 → 182
npm run typecheck / typecheck:test                通过
npm run diff:types / diff:data / diff:engine      三文件零差异（红线未破）
npm run check:wxml                                 17 个模板全部配对正确
```

测试增量：新增 **R 组 4 项**（全选含经期 / 胶囊样式 / del 全链路清零 / 滚动条常亮）；
既有断言同步：M7 的 `catchtap="onRemove"` 反转为 not.toContain，N5 的 scroll-view
结构断言随 `show-scrollbar` 更新，Q1 的旧字面量（`syncPrefsAll(prefs)` / 手写 all
表达式）随 `allOn()` 重构更新。

### 备注

- 删除按钮退役不改变数据：stepper 减到 0 收进「已设为不带」，比原删除键多一步可反悔。
- 滚动条常亮在 WebView 渲染下由 classic 滚动条样式保证，`show-scrollbar` 属性兜底。
