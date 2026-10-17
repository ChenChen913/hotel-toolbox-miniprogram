# StayKit 小程序 · 后续开发计划（基于 CHANGE-REQUESTS.md）

> 制定时间：2026-10-02 · 制定依据：`CHANGE-REQUESTS.md`（v1，三批反馈）+ 逐文件源码核查
> 本文档只做**计划**，不含代码改动。所有 `文件:行号` 均已实地核对。
> 工程位置：`D:/hotel-miniprogram/`（`miniprogramRoot = miniprogram/`）· AppID `wxab6a2e577bcdc940`

---

## 0. 核查结论（先看这个）

对 `CHANGE-REQUESTS.md` 里点名的每一处，我都打开源码核对过。**结论：问题全部属实，无一处是错觉。**

| 需求 | 核查结果 | 关键证据（已实测） |
|---|---|---|
| P0-1 按钮右溢出 | ✅ 属实 | `app.wxss:94-100` `.btn` 有 `width:100%` + `padding:0 28rpx`，且全文件**无任何 `box-sizing`** |
| P0-2 触摸目标偏小 | ✅ 属实 | `.btn.small` 76rpx；`.del` 仅 `padding:0 8rpx`（`item-row.wxss:102-107`）；`.copylink`/`.glink` 为纯文字热区 |
| P0-3 首页主按钮 | ✅ 属实 | `home.wxml:9`，刊头 `.masthead` 体量大 |
| P0-4 向导底栏跳动 | ✅ 属实 | `wizard.wxml:198/203/204` 三个按钮都在内容流里 |
| P0-5 删除按钮 | ✅ 属实 | `stay.wxml:97` 在 `prep/checkin/checkout` 三个 `wx:if` **之外**，三屏共用；且无 `margin-top`、`.btn.plain` 背景为 none |
| P0-6 系统弹窗 | ✅ 属实 | `stay.ts:301`、`home.ts`、`gear.ts` 三处 `wx.showModal` |
| P0-7 快捷日期 | ✅ 属实 | `app.wxss:157-169` `.qchip` 用 `--glass-border`（白）作描边；`wizard.wxss` 给 `width:48%`，content-box 下两列塞不下 |
| P0-8 人数按钮 | ✅ 属实 | `wizard.ts:164` `Math.max(this.data.draft.adults, n)` — 只能升不能降 |
| P1-1 回顶部 | ✅ 属实 | `stay.ts:92` `onPageScroll` 存在但只做「关衣物浮层」，无回顶逻辑 |
| P1-2 页签吸顶 | ✅ 属实 | `stay.wxss:48` `.seg` 是普通流式容器，无 sticky |
| P1-3 分组吸顶折叠 | ✅ 属实 | `stay.wxml:39-40` 是「`.sec-label` + `.glass card`」两段结构，无折叠 |
| P1-4 名称折行 | ✅ 属实 | `item-row.wxss:44-48` `.name` **无 `nowrap`**；`item-row.wxml` 一行 5 个元素 |
| P1-5 1 人问儿童 | ✅ 属实 | `wizard.wxml:64-96` 第 ③ 步**无任何人数判断** |
| P1-6 勾选删除线 | ✅ 属实 | `item-row.wxss:49-52` 与 `stay.wxss:108-111` 两处 `line-through` |
| P2-1 知识库模块折叠 | ✅ 属实 | `knowledge.wxml:54-85` 只有条目级 `k.open`，模块级无折叠 |
| P2-3/4/5 加场景/物品 | ✅ 属实 | `wizard.ts:82` `purposes` 只有 4 项；`core/data.ts` 无烧水壶/钥匙/水杯/耳机等 |
| §11.4 测试断言保护 bug | ✅ 属实 | 6 条静态断言全部在 `tests/acceptance.test.ts` 里逐条找到（见 §6） |

---

## 1. 文档与代码的 4 处不一致（以代码为准）

制定计划时发现 `CHANGE-REQUESTS.md` 有几处描述与当前代码不完全一致，**已在计划里按代码修正**，建议回写文档：

| # | 文档写的 | 代码实际 | 影响 |
|---|---|---|---|
| 1 | `app.wxss` 246 行 | **247 行** | 无 |
| 2 | `.page { padding: 0 32rpx calc(200rpx + env(...)) }`（像全局） | `app.wxss:49` 基础值是 `0 32rpx 80rpx`；`calc(200rpx+…)` 是 **home/knowledge/gear 三页各自**覆盖（各页 `.wxss:5`）。**stay / wizard 用的是 80rpx** | ⚠️ P0-4 给 `.page` 加 `padding-bottom` 时要落到 `wizard.wxss`，不是全局 |
| 3 | 「`stay.ts:92` 的 `onPageScroll` 现在是空实现」 | 它**已有逻辑**：滚动即关闭衣物浮层（`stay.ts:92-95`） | ⚠️ P1-1 必须**追加**回顶判断，不能覆盖掉关浮层 |
| 4 | `.btn.small` 也参与溢出 | `.btn.small` 已是 `width:auto`（`app.wxss:111`），本身不溢出 | 溢出主角是**全宽 `.btn`**；`.addbtn` 溢出属 C 类（flex 行） |

---

## 2. 待老板决策（阻塞项，共 5 个）

这几项**不决策就没法动**，按紧急度排序：

| # | 决策点 | 选项 | 我的建议 | 阻塞了哪些任务 |
|---|---|---|---|---|
| **D-1** | **红线怎么处理** | ① 直接改 `core/{types,data}.ts`（打破零差异）② 藏进 fallback ③ **自研扩展层 `core/extra.ts`** | **③ 自研扩展层** | P2-3 / P2-4 / P2-5 全部 |
| **D-2** | **做不做云同步** | 做（走微信云开发）/ 不做（保留剪贴板导出） | 先**不做**，把 UI 层收益先吃掉；云同步单独立项 | P2-2，及「我的」页的同步卡片 |
| **D-3** | **加不加「我的」页** | 加（四 tab 并排）/ 不加 | **加**——只要做云同步**或**要过提审（隐私政策无处安放），它就是必选项 | §11.3 整块 |
| **D-4** | **折叠状态是否跨会话记住** | 记住 / 每次全展开 | **记住**（存 UI 层 storage，不进 Stay 数据） | P1-3 |
| **D-5** | **敏感类目物品加不加** | 中性化一条概括 / 完全交给用户自定义 / 不加 | **交给用户自定义**，代码不预置 | P2-4 |
| **D-6** | `.btn` 全局改动是否接受 | 接受（4 页重新目视回归）/ 不接受 | **接受**——这是消灭溢出的唯一干净路径 | P0-1（若不接受，P0-1 无解） |

> **红线说明**：`core/{types,data,engine}.ts` 三个文件受 `npm run diff:types / diff:data / diff:engine` + 87 个测试守护，必须与源 Web 项目**零差异**。D-1 一旦选①，这条约束即永久放弃。

---

## 3. 分批执行计划

分 5 批。**批次 A / B / C 全部红线干净，决策只卡 D（扩展层）与 E（云同步）**。

```
批次 0  准备与决策采集         ← 先做，半天
批次 A  P0 可用性（能用）       ← 红线干净，可立即开工
批次 B  P1 交互（好用）         ← 红线干净
批次 C  P2 内容组织             ← 红线干净
批次 D  扩展层（等 D-1 决策）   ← 动红线或建扩展层
批次 E  我的页 + 云同步 + 提审   ← 等 D-2 / D-3 决策
```

每批之间跑一次 §7 自检，并在**安卓真机**复验（模拟器看不出玻璃模糊/自绘 tabBar/吸顶/阻尼）。

---

### 批次 0 · 准备与决策采集（0.5 天）

**目标**：确认基线，采集 D-1 ~ D-6。

| 步骤 | 动作 |
|---|---|
| 0.1 | 跑基线：`npm test`（须 87 passed）、`npm run typecheck`、`npm run typecheck:test` |
| 0.2 | 跑三条红线校验：`npm run diff:types && npm run diff:data && npm run diff:engine`（须无输出） |
| 0.3 | 把 D-1 ~ D-6 拿给老板拍板，结果写回本文档 |
| 0.4 | 确认安卓真机可用（开发者工具导入项目后扫码预览） |

**产出**：基线快照 + 决策记录。

---

### 批次 A · P0 可用性（红线干净，可立即开工）

> 这一批解决「能不能用」。**A1 很可能一次性解决半数溢出**，务必先做、先复测。

#### A1 · P0-1 全局按钮不再溢出（推荐首选）

- **定位**：`miniprogram/app.wxss:94-100`（`.btn`）
- **改法**：
  1. `.btn` **删掉 `width: 100%`**（它是 flex 块级容器，`width:auto` 时外框自动等于父内容宽，天然不溢出）
  2. 补 `border-box` 兜底（WXSS 不支持 `*`，须写显式元素列表）：`view, text, input, textarea, button, image, scroll-view, swiper, picker, label, navigator, icon, canvas, slider, progress { box-sizing: border-box; }`
  3. C 类 flex 行修法：`.addrow` 三元素一律 `min-width: 0`；`.qtyin`（`stay.wxss:161-165`）改 `width:128rpx; flex:0 0 128rpx;` 并加 border-box
- **验收**：安卓真机上任意 `.btn` 左右到屏幕边缘间距**完全一致**（应为 32rpx）
- **回归面**：⚠️ `.btn` 是全局类，影响 home / wizard / stay / gear **4 页 11 处**按钮，必须**四页全目视回归**
- **测试影响**：无（不涉及被断言的文案）

#### A2 · P0-7 快捷日期排版 + 配色（与 A1 同源，紧跟着做）

- **定位**：`app.wxss:157-169`（`.qchip`）、`wizard.wxss` 的 `.qchip{width:48%}`
- **改法**：
  1. `.quickrow` 改 `gap:16rpx`；`.qchip` 改 `width: calc(50% - 8rpx); flex-shrink:0; box-sizing:border-box;`
  2. 配色：`.qchip` 描边由 `--glass-border`（白）改 `--line`（`rgba(35,41,37,0.18)`）；背景改 `rgba(255,255,255,0.85)`
  3. **顺手排查同类**：`.chip`（`app.wxss:138-148`）用的也是 `--glass-border`，且第 ② 步人数、第 ③ 步年龄段都在 `.glass` 卡内 → **一并换 `--line`**
- **验收**：4 个按钮规整 2×2、左右间距一致；未选中态能看清边界
- **测试影响**：无

#### A3 · P0-2 触摸目标达标

- **定位**：`.btn.small`（`app.wxss:110-116`）、`.del`（`item-row.wxss:102-107`）、`.copylink`/`.backup-sum`/`.glink` 纯文字热区
- **改法**：`.btn.small` `min-height: 76rpx → 88rpx`；`.del` 热区撑到 `72rpx × 72rpx`；纯文字热区加 `padding: 20rpx 16rpx`（优先 padding 外扩，**不要**靠改行高）
- **验收**：开发者工具「调试 → 显示视图边界」，逐个量 ≥ 96rpx（主/危险操作）
- **测试影响**：无

#### A4 · P0-8 人数按钮 Math.max bug（1 行，收益极高）

- **定位**：`miniprogram/pages/wizard/wizard.ts:162-165`
- **改法**：`Math.max(this.data.draft.adults, n)` → **`n`**（直接赋值，允许降）
- **注意**：不要动 `wizard.wxml:50` 的 `draft.adults >= 3` 高亮条件；不要动步进器 `min={{3}} max={{10}}`
- **验收**：① 1→2→1 能回落且高亮跟随 ② 调到 5 再点「1 人」直接变 1、步进器消失 ③ 点「3 人及以上」→ 步进器出现且为 3
- **测试影响**：🔴 **必须同步改** `tests/acceptance.test.ts:139` 的断言 `toContain('Math.max(this.data.draft.adults, n)')` → `toContain('adults: n')`

#### A5 · P0-4 向导「下一步」固定底栏

- **定位**：`wizard.wxml:196-205`（三个按钮）、`wizard.wxss`
- **改法**：
  1. 抽 `.wiz-foot`：`position:fixed; left:0; right:0; bottom:0; z-index:900`（**必须 < tabBar 的 1000**），背景用实色 `rgba(233,230,223,0.92)`（**不要 backdrop-filter**），底部 `env(safe-area-inset-bottom)`
  2. **在 `wizard.wxss` 的 `.page`**（注意：不是 app.wxss）追加 `padding-bottom: calc(240rpx + env(safe-area-inset-bottom))`
  3. 第 ⑥ 步两按钮在底栏内**纵向并排**：主按钮在上，「返回修改」在下并降为次要样式
  4. 按钮文案、`第 ① 步显示「开始」其余「下一步」`的逻辑**一字不改**
- **验收**：连点「下一步」走完 6 步，按钮**纹丝不动**
- **回归面**：`tests/acceptance.test.ts` 有 wizard 静态文案断言，改模板别删错字符串
- **测试影响**：需确认 B2 断言（`并加入洗衣、晾衣用品`，在 `wizard.ts`）不受影响

#### A6 · P0-5 删除按钮重做

- **定位**：`stay.wxml:97-99`、`stay.wxss`
- **改法**：保留「三 stage 共用」结构，做成独立危险区：`.danger-zone{ margin-top:48rpx; padding-top:32rpx; border-top:1rpx dashed rgba(178,58,50,0.25); }` + `.danger-btn{ min-height:96rpx; border:2rpx solid rgba(178,58,50,0.35); background:rgba(178,58,50,0.06); color:var(--red); }`；上方补一行 `.tiny muted`「删除后不可恢复（含清单勾选记录）」
- **验收**：三屏底部一致、不溢出、不与 `.think` 卡粘连、一眼认出是危险按钮

#### A7 · P0-6 自定义确认弹窗组件

- **定位**：新建 `miniprogram/components/modal/`；替换 `stay.ts:301`、`home.ts`（导入覆盖）、`gear.ts`（删除/恢复好物）三处 `wx.showModal`
- **改法**：自绘浮层，`z-index: 1100`（**> tabBar 的 1000**）；`.glass` 卡 + `--ink` 标题 + 危险操作确认按钮 `--red` 实底；用 `bind:confirm`/`bind:cancel` 取代 `success` 回调，**调用处业务分支一个字别改**；动画用 CSS `transform: scale()` 200ms，**不要 `wx.createAnimation`**
- **雷点**：`catchtouchmove` 必须绑**真实存在的空方法** `noop(){}`，**不要**写 `catchtouchmove="false"`
- **验收**：三处均出现自定义样式；弹窗时背景列表**不可滑动**；点遮罩 = 取消
- **测试影响**：🔴 **必须同步改** `tests/acceptance.test.ts:305` 的 `toContain('showModal')` → 改断言 `components/modal` 被引用

#### A8 · P0-3 首页主按钮重设计

- **定位**：`home.wxml:4-12`、`home.wxss`
- **改法**：① 刊头瘦身（`.masthead` padding-top 60→32rpx、`.display` 66→52rpx、`.gold-rule` margin 收到 20/16rpx、`.tagline` margin-bottom 48→28rpx）② 主按钮变「大行动区」：min-height 100→112rpx、圆角 24→28rpx、字号 31→34rpx，右侧补 chevron
- **禁止**：❌ 不加悬浮 FAB（会挡 tabBar 上方列表）❌ 不改 `navigationStyle: custom`（会丢系统返回）❌ 不改左上角「＋」
- **验收**：安卓中等手势机型单手拇指自然活动区能碰到主按钮

**批次 A 完成标志**：安卓真机上四页按钮右留白均匀、底栏不跳、三处弹窗为自绘、人数可增可减；`npm test` = 87 passed（A4/A7 改断言后仍 87）。

---

### 批次 B · P1 交互（红线干净）

#### B1 · P1-5 同行人员按人数分支（依赖 A4 先修好）

- **定位**：`wizard.wxml:63-96`（第 ③ 步）、`wizard.ts`
- **改法**：纯 UI 层分支渲染，`draft` 字段不动：
  - `= 1 人`：只留「有宠物同行」
  - `= 2 人`：加「同行关系」单选（情侣/家人/朋友/同事）
  - `≥ 3 人`：保持现状（儿童步进器 + 年龄段 + 老人 + 宠物）
- **⚠️ 最容易漏的一点**：改人数时**清掉不适用的字段**（从 3 人改回 1 人，须把 `children=0 / elderly=false` 归零），否则清单会莫名多出儿童用品
- **验收**：1 人流程只见宠物一行；来回切人数无残留字段

#### B2 · P1-2 三段页签吸顶（做完**量出实际高度**给 B3 用）

- **定位**：`stay.wxss:48-54`（`.seg`）
- **改法**：`.seg { position:-webkit-sticky; position:sticky; top:0; z-index:800; padding:12rpx 6rpx; background:var(--bg); }`
- **雷点**：祖先**不能有** `overflow:hidden/auto`（改造前先 `grep -rn "overflow" pages/stay/` 确认干净）；`background` 必须**不透明**
- **禁止**：❌ 不要 `navigationStyle: custom`
- **验收**：准备清单滚到底，页签始终可见、内容不透视
- **产出**：记录 `.seg` 真机实际高度（px × 2 = rpx），供 B3 的 `top` 使用

#### B3 · P1-3 分组吸顶 + 折叠（依赖 B2 的高度）

- **定位**：`stay.wxml:39-40`、`stay.ts`（`render()` 生成的 `groups`）
- **改法**：把「`.sec-label` + `.glass card`」升级为可折叠 `.grp`；`.grp-head` 加 `position:sticky; top: <B2 实测高度>; z-index:700; min-height:88rpx; background:var(--bg)`
- **关键**：折叠态 `collapsed` 用**路径 setData**：`this.setData({ ['groups['+gi+'].collapsed']: !cur })`，**禁止**整份 `groups` 回传（R6）
- **持久化**（待 D-4）：存 UI 层独立 storage key，**不要塞进 Stay 数据**
- **验收**：滚过「洗漱」它停住；继续滚「衣物」接棒；箭头 180° 旋转；收起再展开勾选不丢

#### B4 · P1-1 一键回顶部（依赖 B2/B3 稳定后定位避让）

- **定位**：`stay.ts:92` `onPageScroll`（**已有关衣物浮层逻辑，须追加不能覆盖**）、`stay.wxml`
- **改法**：
  ```ts
  onPageScroll(e) {
    // 保留原有：关衣物浮层
    const c = this.selectComponent('#clothingAdd'); if (c?.close) c.close();
    // 追加：仅布尔翻转才 setData
    const show = e.scrollTop > 600;
    if (show !== this.data.showGoTop) this.setData({ showGoTop: show });
  }
  ```
  `.gotop`：`position:fixed; right:32rpx; bottom:calc(180rpx + env(safe-area-inset-bottom)); 96×96rpx; z-index:950; 实色背景`
- **禁止**：❌ 绝不改成 `<scroll-view>` 包整页（R1）
- **验收**：滚过一屏出现，点击 300ms 到顶，回顶自动消失，不与 tabBar 重叠

#### B5 · P1-4 物品名称一行显示

- **定位**：`item-row.wxss:44-48`、`item-row.wxml:8-31`
- **改法**：
  1. `.name { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }`，字号 30→29rpx
  2. `.meta` 三个小控件做减法：`.gearbtn` 文案缩短为「挑好物」或改图标；`.assign-in` 文案 ≤4 字
  3. 步进器（`components/stepper/stepper.wxss`）宽度若靠 padding 算出，同步按 A1 的 border-box 方案处理
- **验收**：真机逐组看，**无任何一项名称出现第二行**；3 人及以上行程仍成立

#### B6 · P1-6 勾选交互改造（§11.1，取消删除线）

- **定位**：**两处都要改**——`item-row.wxss:49-52`（准备清单）+ `stay.wxss:108-111`（入住/退房）
- **改法**：删 `line-through` 与文字变灰；改为 `.row.done{ background:rgba(63,125,84,0.10); }` + 右上角**常驻** `.row-check` 节点（`font-size:120rpx; color:rgba(63,125,84,0.16); pointer-events:none; opacity` 过渡）
- **⚠️ 四点**：① 左侧 `.tick` 必须保留（主热区 88rpx）② **绝不能**用 `wx:if` 控制对勾（会销毁重建，过渡失效）③ 与 `.zero`（不带）状态区分——不带保持半透明 ④ `.row` 加了圆角绿底后，相邻分隔线改细虚线或去掉
- **验收**：三界面看齐；`qty=0 且已勾选` 两种叠加仍分得清；长名称下水印不被压

**批次 B 完成标志**：真机上页签/分组两级吸顶不打架、回顶钮不与 tabBar 重叠、名称零折行、勾选为淡绿底 + 右上水印。

---

### 批次 C · P2 内容组织（红线干净）

#### C1 · P2-1 知识库模块级折叠

- **定位**：`knowledge.wxml:53-85`（模块循环）、`knowledge.ts`
- **改法**：给 `modules[mi]` 加 `open` 字段（**默认 false**，进来只见 11 个模块目录）；模块标题行改为可点（`点击行数 · 模块名 · 条数 · 右侧 chevron`）；支持手风琴式单选展开；从行程页 `setNav({knowModule})` 跳进来时**自动展开目标模块并滚动定位**
- **禁止**：🔴 免责声明（`.disclaimer`）与等级图例（`.legend`）**必须常驻不可折叠**（`04`/`06` 硬要求）；折叠用 `wx:if` 直接切，**不要**高度动画（44 条富文本会掉帧）
- **验收**：首屏只见免责 + 图例 + 11 个模块目录，总高 ≤3 屏
- **测试影响**：`D1` 断言 `wxml` 不含 `wx:if="{{discOpen`，保持不引入免责折叠开关即可

**批次 C 完成标志**：知识库首屏收拢为目录视图，跳转定位仍生效。

---

### 批次 D · 扩展层（⏸ 等 D-1 决策）

> 若 D-1 选③（推荐），统一建 `core/extra.ts`，一次性做完 P2-3/P2-4/P2-5，**不要分批打补丁**。

| 任务 | 内容 | 定位 |
|---|---|---|
| D0 | 新建 `core/extra.ts`（不属红线）：导出 `EXTRA_ITEMS` / `RELATIONS`；在 `buildPrep()` 结果之上做**增量合并** | 新建文件 |
| D1 | P2-3 加「情侣/朋友/同事」场景（`Relation` 联合类型，存独立 storage key） | `core/extra.ts` |
| D2 | P2-4 第二批物品（便携烧水壶、棋牌、中性化的成人用品） | `core/extra.ts` |
| D3 | P2-5 第三批物品（钥匙、水杯、耳机、玩偶、枕头、颈枕、学习资料/笔）+ 新建第 16 类「学习」 | `core/extra.ts` |
| D4 | **导出/导入带上扩展层**（M6 的 `exportData/importData` 走 core，须在 UI 层额外拼接） | `home.ts` |
| D5 | 补测试进 `tests/acceptance.test.ts`（保持「87 + 新增」计数口径） | `tests/` |

**三条硬性要求（选③时）**：
1. 扩展层物品必须遵守现有 `Item` 结构，`id` 加统一前缀（如 `x_kettle`）避免与源数据冲突
2. **导出/导入必须带上扩展数据**，否则用户备份后场景数据会丢
3. 分类新增要同步：`CAT_ORDER` 加「学习」（位置建议 `补给` 之后、`自定义` 之前）；`GEAR_CATS` 会自动跟随；确认空分类有 `wx:if` 兜底不渲染

**内容冲突预警**：`core/data.ts:424` 知识库明确「不要用枕头被褥围挡替代（窒息风险）」。若加「枕头」，`when` 须限定成人/大童并加备注（`prefs.sleep && !(children>0 && childAge==='0-3')`），否则同一份数据自相矛盾。

**折中选项**：若老板觉得为几条物品建扩展层不划算，**可只做批次 A/B/C（全红线干净）**，把加物品/加场景留到以后。

---

### 批次 E · 我的页 + 云同步 + 提审（⏸ 等 D-2 / D-3 决策）

#### E1 · §11.3 加「我的」页（依赖 D-3）

- **定位**：新建 `pages/mine/`；`app.json`（`pages` + `tabBar.list` 加第 4 项）；`custom-tab-bar/index.ts`（`TABS` 加 `{url:'/pages/mine/mine', text:'我的', icon:'user'}`）；`core/tabbar.ts`（认 `selected:3`）
- **⚠️ 图标**：`tools/gen-icons.py` 里**没有 `user` 图标**（只有 `users`）。二选一：① 推荐在 `gen-icons.py` 加 `circle-user` 重新生成 `icon.wxss` ② 省事复用现有 `sliders`。**必须走生成脚本，不要手写 base64**
- **信息架构**：数据概况 / 数据同步（仅云同步后显示）/ 备份与恢复（从 `home.wxml:59-74` 搬来）/ 偏好设置 / 关于（隐私政策·用户协议·免责声明）/ 清空数据
- **原则**：**绝不放账号登录/手机号/头像/昵称**——零账号是产品优势
- **可行性**：四 tab 时每个仍宽 210rpx（现有 280rpx），放得下
- **测试影响**：🔴 搬备份区后，`tests/acceptance.test.ts:477` 对 `home.ts` 的断言要对新路径调整；tabBar 无数量断言，加 tab 不破坏测试

#### E2 · P2-2 云同步（依赖 D-2，**先不要动代码**）

- 若做：走**微信云开发**（方案 A），云函数用 `cloud.getWXContext().OPENID`，**不要 `wx.login`/手机号/getUserProfile**；集合权限必须改「仅创建者可读写」（**R14：默认权限小程序端读不到且不报错**）；离线优先、静默降级；按 `Stay/Gear/CheckState` 三集合拆；`last-write-wins + 墓碑软删除`
- **合规**：首页 `home.wxml:78` 的「数据只保存在本机 · 不上传、不联网」须改写（**同步改 `tests/acceptance.test.ts` 静态文案断言**），mp 后台隐私指引同步更新

#### E3 · 提审收尾

- 真机 iOS + Android 各验一遍（`ACCEPTANCE.md` H1–H11）
- mp 后台配置隐私指引、勾选剪切板；截 5 张真实截图；确认 ICP 备案

---

## 4. 执行顺序（依赖图）

```
批次0 基线+决策
   │
   ├─ A1 溢出 ──→ 真机复测 ──→ A2 日期排版 ──→ A3 触摸目标
   │                                            │
   │                                            ├─→ A4 人数bug ──→ B1 人数分支
   │                                            │
   │                                A5 向导底栏 ─┤
   │                                A6 删除按钮 ─┤
   │                                A7 弹窗组件 ─┘
   │                                A8 首页主按钮
   │
   ├─ B2 页签吸顶 ──→ B3 分组吸顶折叠 ──→ B4 回顶部
   │                 B5 名称一行
   │                 B6 勾选改造
   │
   ├─ C1 知识库折叠
   │
   └─ [D-1 决策] ──→ D0 扩展层 ──→ D1/D2/D3 场景物品 ──→ D4 导出带上 ──→ D5 补测试
                     [D-2/D-3] ──→ E1 我的页 / E2 云同步 ──→ E3 提审
```

**严格顺序要点**：
- A1 必须最先做，且做完先真机复测（很可能解决半数溢出）
- A4 必须在 B1 之前（否则人数都改不动，无法测分支）
- B2 必须在 B3 之前（B3 的 `top` 值 = B2 实测高度）
- B4 必须在 B2/B3 稳定后（回顶钮避让位置依赖前两者）
- D 批次一次性做完，不要分批打补丁

---

## 5. 每步自检（改完必修）

```bash
cd D:/hotel-miniprogram

# 1) 测试（A4/A7/E1 改断言后仍须 87 passed）
npm test

# 2) 类型检查
npm run typecheck && npm run typecheck:test

# 3) 红线零差异（三条必须无输出）
npm run diff:types && npm run diff:data && npm run diff:engine && echo "零差异 OK"

# 4) WXML 结构 + 禁止裸 < 和 &&
python -c "
import xml.etree.ElementTree as ET, glob, re
bad = 0; n = 0
for f in glob.glob('miniprogram/**/*.wxml', recursive=True):
    n += 1
    s = re.sub(r'\bwx:else(?=[\s/>])', 'wx:else=\"1\"', open(f, encoding='utf-8').read())
    try:
        ET.fromstring('<root xmlns:wx=\"http://wx\" xmlns:bind=\"http://bind\" xmlns:catch=\"http://catch\">' + s + '</root>')
    except Exception as e:
        bad += 1; print('FAIL', f, e)
print(f'{n} 个模板 bad={bad}')
"
grep -rnoE '\{\{[^}]*<[^}]*\}\}' miniprogram --include=*.wxml   # 应无输出
grep -rn '&&' miniprogram --include=*.wxml                       # 应无输出

# 5) JSON 可解析 / 6) 零网络 / 7) 禁用词 / 8) 图标 class / 9) 包体积
#    （脚本同 CHANGE-REQUESTS.md §7，此处不重复）
```

---

## 6. 测试断言同步清单（改对应功能前先 grep 一遍）

`tests/acceptance.test.ts` 里有 **6 条静态断言正在「保护」bug**。改对应功能时**必须同步改断言**，否则测试变红会误判成自己改错：

| 行号 | 断言 | 冲突任务 | 改成 |
|---|---|---|---|
| `:139` | `toContain('Math.max(this.data.draft.adults, n)')` | **A4 人数 bug** | `toContain('adults: n')` |
| `:305` | `toContain('showModal')` | **A7 自定义弹窗** | 改断言 `components/modal` 被引用 |
| `:141-142` | `/min="\{\{3\}\}"/`、`/max="\{\{10\}\}"/` | A4/B1 | 别动这两个数字 |
| `:244` | `toContain("['全体', ...(s.guests || []).map(g => g.label)]")` | B5 名称布局 | 别误删这行 |
| `:404` | `toContain('先填物品名称，比如「充电宝」')` | D3 充电宝相关文案 | 改了文案同步改 |
| `:477` | `toContain('剪贴板里不是有效的备份 JSON')` | E1 备份搬到我的页 | 对新文件路径断言 |

**好消息**：tabBar 无数量断言，加第 4 个 tab 不破坏测试。

---

## 7. 雷区速查（改之前扫一眼）

| # | 雷 | 正确做法 |
|---|---|---|
| R1 | 用 `<scroll-view>` 包整页 | 保持页面级滚动，否则 sticky / `pageScrollTo` / `onPageScroll` 全废 |
| R2 | sticky 祖先有 `overflow:hidden` | 改造前 `grep -rn "overflow" pages/stay/` |
| R3 | `catchtouchmove="false"` | 绑真实空方法 `noop(){}` |
| R4 | 改 `core/{types,data,engine}.ts` | 三文件一字不动（除非 D-1 选①） |
| R5 | WXML 里裸 `<` 或 `&&` | 提前在 `.ts` 算成布尔/数字 |
| R6 | 整份数组 setData | 用数据路径 setData |
| R7 | 引第三方 UI 库/CDN/字体 | 图标走 `tools/gen-icons.py` 重新生成 |
| R8 | `navigationStyle: custom` | 用页面内 sticky |
| R9 | 删 `tabBar.custom: true` | 保留；退回时同步调所有页面底部留白 |
| R10 | `new Date('YYYY-MM-DD')` | 用 `new Date(y, m-1, d)` |
| R11 | 浮层 `z-index` < 1000 | 吸顶 700–800、底栏 900、回顶 950、模态 1100 |
| R12 | 继续用 `wx.showModal` | 换 `components/modal` |
| R13 | 改 `.btn` 只验一个页面 | 四页 11 处全回归 |
| R14 | 云开发集合忘改权限 | 改「仅创建者可读写」 |
| R15 | 用 `<cover-view>` 做普通弹窗 | 普通 `view` + `position:fixed` |
| R16 | 删知识库免责/图例 | 折叠只作用于 11 个模块区 |
| R17 | 忘同步改静态文案断言 | 见 §6 |
| R18 | 顺手启用 `darkmode: true` | 保持 `false` |
| R19 | 用禁用词 | 改完扫一遍 |
| R20 | 给折叠加高度过渡动画 | 用 `wx:if` 直切，最多给箭头旋转 |

---

## 8. 风险登记

| 风险 | 影响 | 缓解 |
|---|---|---|
| A1 改 `.btn` 全局类 | 四页 11 处按钮视觉全变 | 改完**逐页目视回归**；备选方案乙（border-box）有副作用，**甲为主乙为辅** |
| B2/B3 两级 sticky 打架 | 分组标题覆盖页签 | B3 的 `top` 必须等于 B2 实测高度；sticky 祖先须无 overflow |
| B4 覆盖 `onPageScroll` | 衣物浮层关不掉 | 追加而非覆盖，保留原逻辑 |
| D 批次破红线 | diff 报错、源项目更新无法合并 | 走方案③扩展层；`id` 加前缀；导出/导入带上扩展层 |
| E1 搬备份区 | 静态断言变红 | 见 §6，同步改 `:477` |
| 真机与模拟器差异 | 玻璃模糊/自绘 tabBar/吸顶/阻尼看不出来 | **必须安卓真机复验**，模拟器不算 |
| 时间炸弹 | `k5/k8/k10/k40` 的 `reviewBy` 在 2027-03/06 到期 | D6 用例动态比较，到期自动报警，不会 silent fail |

---

## 9. 一句话总结

**批次 A/B/C 共 15 个改动项全部红线干净，决策齐了就能立即开工**；真正卡住的是 **D-1（红线方案）** 与 **D-2/D-3（云同步 / 我的页）** 三个决策。
建议路径：**先做 A → B → C（吃掉 90% 的可用性与手感问题），同时并行把 D-1 拍板，再决定要不要上扩展层与云同步。**

---

*本计划基于 2026-10-02 的代码状态制定。执行时若发现描述与实际文件不符，以实际文件为准，并把差异记回本文档。*

---

## 10. 执行进度（2026-10-02 当日完成）

> 老板指令：「这些决策都按照你推荐的最好的方案去定下来就可以。现在开工，开始做任务」。
> 全部 6 个决策按 §2 的推荐方案敲定，批次 **0 / A / B / C / D / E1** 已全部落地。

| 批次 | 状态 | 说明 |
|---|---|---|
| 0 准备与基线 | ✅ | 87 passed、typecheck、红线零差异 |
| A · P0 可用性（A1–A8） | ✅ | 8 项全做完，含自绘 `modal` 组件 |
| B · P1 交互（B1–B6） | ✅ | 含 P1-4 名称一行、P1-6 勾选交互改造 |
| C · P2 内容组织（C1） | ✅ | 知识库模块级折叠 + 顺手补上知识库缺失的 `.grow` |
| D · 扩展层（D0–D5） | ✅ | `core/extra.ts`，红线三文件零改动 |
| E1 ·「我的」页 | ✅ | 四 tab 并排，备份与恢复已从首页搬来 |
| E2 · 云同步 | ⛔ 按 D-2 决策未做 | 保留剪贴板导出 |
| E3 · 提审收尾 | ⏳ 待真机 | 见 CHANGE-REQUESTS §13.5 |

**决策落地对照**

| 编号 | 决策 | 落地方式 |
|---|---|---|
| D-1 | ③ 自研扩展层 | `core/extra.ts`；`CAT_ORDER_EXT` / `GEAR_CATS_EXT` / `EXTRA_ITEMS`（`x_` 前缀）/ `buildPrepExt` / `sortItemsExt`；扩展状态存独立 key `htb_ext_v1` |
| D-2 | 云同步先不做 | 未引入任何网络调用（自检零命中） |
| D-3 | 加「我的」页 | 四 tab 并排，`syncTabBar(this, 3)` |
| D-4 | 折叠状态记住 | `htb_ui_collapsed_v1`，UI 层，不进 Stay |
| D-5 | 敏感物品交用户自定义 | `EXTRA_ITEMS` 明确不预置安全套/情趣用品（有测试守护） |
| D-6 | 接受 `.btn` 全局改动 | `width:100%` 删除 + 盒模型兜底 |

**测试口径变化**：87 → **105 passed**（38 源用例 + 67 验收用例）。
新增验收用例集中在两块：`D7`（知识库模块折叠）、`H1–H11`（扩展层）、`I1–I6`（我的页）。

**新增文件**
```
miniprogram/core/extra.ts        扩展层（关系 / 物品 / 分类 / 扩展 storage / 备份带 ext）
miniprogram/core/rich.ts         富文本预解析（知识库与我的页共用）
miniprogram/components/modal/    自绘确认弹窗（P0-6）
miniprogram/pages/mine/          我的页
```

**详细执行记录与未完成事项**：见 `CHANGE-REQUESTS.md` §13。

**收尾补充（2026-10-02）**：代码侧全绿后另做了两件事 ——

1. 修掉 `tools/gen-icons.py` 的**计数 bug**：`'n'` 是默认档、生成时被跳过，但打印语句没跳，一直多报 1 条（旧输出「76 变体」，实际 75）。现打印与实际规则数一致。
2. 订正三份交付文档的过时口径（`ACCEPTANCE.md` / `RELEASE-CHECK.md` / `PROGRESS.md`），明细见 `CHANGE-REQUESTS.md` §13.6。

> 说明：本文 §0–§9 里出现的「87 passed」是**制定计划时的基线口径**，属原始记录，未改动。
> 当前口径为 **105 passed**（38 源 + 67 验收）。

