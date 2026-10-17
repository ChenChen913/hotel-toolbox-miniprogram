# CHANGE-REQUESTS02 · 第五轮反馈（2026-10-02）

> **这份文档是什么**
> 老板第五轮反馈的**需求说明书**，交给执行 Agent 落地。本轮**不改代码**，只沉淀需求。
>
> **怎么用**
> 1. 先读 §0（项目速览）与 §0.6（三个已经踩过的坑）—— 不读这三条，你会重蹈覆辙。
> 2. 再按 §12 的**建议实施顺序**做，不要按编号顺序做。
> 3. 每条需求都写了「改哪个文件 / 改成什么样 / 为什么」，但**没有写完整代码** —— 具体实现你自己定。
> 4. 做完一条就跑一次 §0.5 的自检，别攒到最后。
> 5. §11 是**必须找老板拍板**的问题，遇到时先问，别自己猜。

---

## 0. 项目速览（先读这一段）

### 0.1 这是什么

`D:/hotel-miniprogram` —— 一个「酒店入住工具箱」**微信小程序**，是 Web 版（`D:/hotel/`）的原生移植。

围绕**一次具体的入住行程（Stay）**：住前按人数/晚数自动算好要带什么，住中、走前逐项打勾检查，另配一本带证据分级的酒店知识册子。

- 平台：**原生微信小程序**（不是 uni-app / Taro），**TypeScript**
- 运行时依赖：**零**。不引入任何 npm 运行时包、第三方 UI 库、CDN
- 存储：`wx.getStorageSync / setStorageSync`，**零网络、零账号、零上报**

### 0.2 目录与职责

```
miniprogram/
  core/       types · data · engine · store · platform · nav · extra · gesture · toast
              ↑ 纯 TypeScript，**不碰 wx.\***（用 engine 导出的 Storage），可在 vitest 里直接跑
  pages/      home · wizard（创建向导）· stay（行程页）· knowledge · gear
  components/ stepper · toggle · item-row · date-picker · clothing-add
              progress-pill · gear-panel · modal · icon · toast
  icon.wxss   手写 SVG → base64 内联的图标表（81 个变体）
tools/        gen-icons.py · check-icons.py · check-wxs.py · check-wxml.py
tests/        engine.test.ts（源项目 38 条，逐字未改）+ acceptance.test.ts（验收用例）
```

### 0.3 🔴 红线：三个文件必须与源项目零差异

`miniprogram/core/{types,data,engine}.ts` 必须与 `D:/hotel/src/` **逐字相同**，
由 `npm run diff:types / diff:data / diff:engine` 守护。

**这直接决定了本轮的改法**：老板要求「女性清单里不要有剃须刀」，而 `剃须刀` 定义在
`core/data.ts:21`（红线内，`when: () => true`）。**不能改 data.ts。**
→ 一律去 `core/extra.ts`（扩展层）里解决，见 §4.4。

### 0.4 扩展层 `core/extra.ts` —— 本轮改动的主战场

`extra.ts` 是「**在不改红线的前提下，往源数据之上追加内容**」的一层。约定：

| 约定 | 说明 |
|---|---|
| 新增物品 | 一律放 `EXTRA_ITEMS`，id 用 `x_` 前缀（与源 id 绝不冲突） |
| 新增分类 | 放 `EXTRA_CATS`，用 `CAT_ORDER_EXT` 代替 `CAT_ORDER` 排序 |
| 新增维度 | 放 `ConditionsExt`（扩展 `Conditions`，字段全可选） |
| **新增枚举值** | **绝不能加进源枚举**（如 `Purpose`）。做法：扩展层定义 `XxxExt` 联合类型 + 一个 `toSourceXxx()` 降级映射函数，源字段永远只存源值。见 §5.3.2 |
| 行程级持久化 | 放 `StayExt`，存独立 storage key `htb_ext_v1`，**绝不写进 `Stay`** |
| 整层可删 | 删掉后 `buildPrep` 仍是源函数，行为退化成源项目的样子 |

⚠️ **`CAT_ORDER_EXT` 的坑**：`CAT_ORDER.indexOf('学习')` 是 `-1`，直接拿源数组排序会把扩展分类顶到最前面。排序**必须**用 `CAT_ORDER_EXT`。

⚠️ **`StayExt` 的字段一律可选**（`purposeExt?` / `study?` / `adultsWith?`…）——
因为老数据（用户手机上已存的行程）没有这些字段。**读到 `undefined` 必须能正常降级**，
不能抛异常、也不能把用户的选择吞掉。每个新字段都要想清楚「老数据读到时怎么办」。

### 0.5 改完必跑的自检

```bash
npm test                 # 现在 137 passed（38 源逐字未改 + 99 验收）
npm run typecheck        # 小程序 TS
npm run typecheck:test   # 测试 TS
npm run diff:types && npm run diff:data && npm run diff:engine   # 红线
npm run check:icons      # 图标 class 是否存在（写错会静默渲染成空白）
npm run check:wxs        # 改过 .wxs 必跑
npm run check:wxml       # 改过 .wxml 必跑
```

### 0.6 ⚠️ 已经踩过的坑（8 个，会咬人，务必先读）

> 这一节的每一条都是**本项目真实踩过并付出代价**的，不是抄来的通用建议。
> 动手前通读一遍，能省掉一轮真机调试。

#### 坑一：WXS 不是 JavaScript，模拟器能过 ≠ 真机能过

**开发者工具与真机用的不是同一版 WXS 编译器**，模拟器宽松、真机严格。
本项目已因此让**整页在真机上编译失败**（报 `swipe.wxs:115:22:Unexpected token (`），
根因只是一个 `Number(x)`。

WXS 基础类库**只有**：`console` / `Math` / `JSON` /
`Number`（**仅 4 个属性，不可调用**）/ `Date`（**仅 3 个属性**）/ `Global`。
可调用的全局函数只有 `Global` 的 8 个：
`parseInt` / `parseFloat` / `isNaN` / `isFinite` / `decodeURI(Component)` / `encodeURI(Component)`。

- 转数字用 `parseInt(s, 10)`；转字符串用 `'' + v`。**不要写 `Number(x)` / `String(x)`。**
- 不支持 `let` / `const` / 箭头函数 / 模板字符串 / 展开 / 可选链 / `??` / `class` / `new`
- 对象、数组字面量**不能有尾随逗号**
- 改 `.wxs` 前先跑 `npm run check:wxs`

#### 坑二：`backdrop-filter` 会吃掉 `position: fixed`

`.glass`（`app.wxss:70`）上有 `backdrop-filter: blur(24px) saturate(1.5)`。
按 CSS 规范，**带 `backdrop-filter` 的元素会成为其后代 `position: fixed` 的包含块** ——
也就是说，`.glass` 卡片里的 `fixed` 浮层，`top` 是相对**卡片**算的，不是相对屏幕。

这正是 §7「衣物下拉错位」的根因。以后凡是往 `.glass` 卡片里放浮层，都要先想到这条。
**首选解法是 `<root-portal>`**（见 §7.3）。

#### 坑三：图标 `tone` 档位缺失会**静默**渲染成空白

本项目图标是「手写 SVG → base64 → `icon.wxss`」生成的，档位表在 `tools/gen-icons.py` 的
`VARIANTS` 里。写 `<icon name="house" tone="p" />` 时，如果 `house` 没生成 `p` 档，
**不会报错、不会警告**，就是渲染成一片空白。

> 已经踩过一次：`book-open` 只给了 `d` 档，第 ⑤ 步「培训 / 学习」那一行的图标整个消失。

**规矩**：新增任何 `<icon name="x" tone="y" />` 之后，**必须跑 `npm run check:icons`**。

#### 坑四：`catchtap` 阻止冒泡，但**元素自己的 handler 照常执行**

`catch` 的作用是「阻止事件继续向上冒泡」，**不是**「阻止自己响应」。
所以 `catchtap="onToggle"` 的元素，点它仍然会执行 `onToggle`，只是不会再触发父节点的事件。

这条决定了 §3 的整行可点怎么做：

| 场景 | 用什么 | 为什么 |
|---|---|---|
| 根节点要「整行可点」 | `bindtap` | 需要子元素冒泡上来 |
| 行内子元素有自己的功能 | `catchtap` | 既执行自己，又不冒泡到根节点 |
| 只想「吃掉」事件、不做任何事 | `catchtap="noop"` | `noop` **必须是真实存在的空方法** |

> 踩过的坑：写过 `catchtap="false"`，**部分真机不生效**（会当成字符串去找同名方法）。

#### 坑五：`<template>` 只能看到**显式传进去**的 data

`<template is="xxx" data="{{a: 1, b: 2}}" />` —— 模板内部**看不到页面 data**，
只能用 `data` 里显式传进去的那几个字段。少传一个，模板里就是 `undefined`。

> 本项目 `stay.wxml` 的 `prepBody` / `checkBody` 都显式传了 `p`/`c`（数据）+ `k`（公共字段）
> + `isCur`（当前段标记）。加字段时**记得三个调用点一起加**（上一段 / 当前段 / 下一段）。

#### 坑六：组件样式默认隔离，但 **CSS 自定义属性会继承**

自定义组件的 `.row` 不会受页面 `.row` 影响，反之亦然 —— 这是默认的样式隔离。
**但是** `--ink` / `--pine` 这类 **CSS 自定义属性是继承属性**，会从 page 一路继承进组件内部。

> 所以组件里可以放心用 `color: var(--ink)`，**但不要**指望页面的 `.some-class` 能改到组件内部；
> 需要外部控制组件样式时，用 `externalClasses` 或把值当属性传进去。

#### 坑七：`setData` 是**唯一**能改视图的途径，且要合并调用

- 直接改 `this.data.xxx = 1` **不会**刷新视图（这是逻辑层与视图层分离的必然结果）
- 高频 `setData` 会明显卡顿 —— 一次能改完的，不要拆成多次
- 只传变化的部分：`setData({ 'preview[3].done': true })` 比整个 `preview` 重传便宜得多
- **data 里用到的字段要提前初始化**，动态新增字段有时不触发更新

> 本项目 `stay.ts` 的 `mutate()` / `render()` 就是按这个思路写的：改完数据一次性重算、
> 一次性 `setData`。改交互时**不要**在事件里连着调多次 `setData`。

#### 坑八：静态断言会被注释和字符串误伤

`tests/acceptance.test.ts` 的断言是对着**源码文本**做的。写 `expect(src).not.toContain('Number(')`
这类断言时，注释里出现的 `Number(` 和字符串里的 `'cubic-bezier('` 都会让它失败。

→ **断言前先剥注释、再屏蔽字符串内容**（参考现有用例 **L14** 的写法）：

```ts
const code = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')          // 块注释
  .replace(/\/\/[^\n]*/g, '')                // 行注释
  .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")     // 单引号字符串
  .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');    // 双引号字符串
```

---

## 0.7 微信小程序平台规则与最新文档要点（2026-10-02 核对）

> 老板要求：「去网络上搜索关于微信小程序最新的开发文档，明确在代码逻辑、功能等方面需要注意哪些问题。」
> 以下是**对着官方文档核对过**的结论。凡是与本项目相关的，都标了「本项目」怎么处理。

### 0.7.1 基础库版本（截至 2026-08-20）

| 版本 | 日期 | 备注 |
|---|---|---|
| **v3.17.3** | 2026-08-20 | 当前最新 |
| v3.17.2 | 2026-07-17 | |
| v3.17.0 | 2026-06-17 | 修复「skyline 下 touch 阻止默认行为后不应再响应 tap」 |
| v3.15.2 | 2026-03-25 | 修复「iOS 内存压力过大时，**WXS 响应函数可能无法执行**」 |

**本项目**：`project.config.json` 里的基础库设置要 ≥ **2.26.1**（见下），
并且**不要**在低版本上依赖新 API —— 需要时用 `wx.canIUse()` 判断。

> ⚠️ 值得注意的一条：**v3.15.2 才修掉「iOS 内存压力大时 WXS 响应函数不执行」**。
> 也就是说 R5-1 的滑动方案 A（WXS 事件链路）在**低版本 iOS 上本来就可能不响应**。
> 这是方案 B（页面层 + 补间动画）必须保留作为保底的真实理由，不是「以防万一」。

### 0.7.2 WXS 响应事件（本项目 R5-1 的关键）

官方原文（`framework/view/interactive-animation.html`，2026-09-24 更新）：

> 使用 WXS 函数用来响应小程序事件，**目前只能响应内置组件的事件，不支持自定义组件事件**。

- **基础库 2.4.4 开始支持**，低版本需做兼容处理
- 原理：把事件响应从**逻辑层**下沉到**视图层（Webview）**，跨线程通信次数从 2 次降到 0 次
- **2.7.1** 起事件对象新增 `mark` 属性，用于识别事件源节点

**本项目**：`stay.wxml` 的滑动就是挂在 `<view class="page">` 这个**内置组件**上的，
所以能用 WXS 响应事件。但**如果将来把整段包进自定义组件**，WXS 会直接失效 —— 别包。

### 0.7.3 `<root-portal>`（§7 修下拉错位的首选）

| 项 | 值 |
|---|---|
| 基础库 | **2.25.2** 起支持 |
| `enable` 属性 | **2.26.1** 起支持 |
| 渲染框架 | **Skyline 与 WebView 都支持** |
| 平台 | 微信 Windows / Mac / 鸿蒙 OS 版均支持 |
| 作用 | 「使整个子树从页面中脱离出来，类似于在 CSS 中使用 fixed position 的效果」 |

**本项目**：用它把衣物/化妆品下拉面板从 `.glass` 卡片里「摘出去」，
绕开坑二的 `backdrop-filter` 包含块问题（详见 §7.3）。

### 0.7.4 触摸目标最小尺寸

人因工程与跨端可访问性的通行下限是 **44×44 pt**（iOS）/ 48dp（Android），
折算到 750rpx 设计稿上就是 **88rpx**。

**本项目**：`.pickrow` 的 `min-height: 88rpx` 就是按这条定的（`wizard.wxss:198`，注释里标了 P0-2）。
**新增任何可点行，都要满足 88rpx**，不要再往上加 padding 撑大（会破坏「一屏能看到几项」的节奏）。

### 0.7.5 包体积与分包

- 小程序**主包限制 2MB**，超出无法上传；分包也有体积限制
- 非核心页面、静态资源应放分包；**主包不得引用分包资源**

**本项目**：当前包体积 **344.6 KB / 85 文件**，离 2MB 很远，**不需要分包**。
但新增资源时留意：图标是 base64 内联进 `icon.wxss` 的，图标越多这个文件越大。

### 0.7.6 隐私与权限合规（2026 年审核重点）

- 自 **2026 年 10 月起，隐私政策弹窗为小程序必备配置**
- 权限最小化：只申请业务必需的定位 / 相机 / 相册 / 手机号
- 首次打开需隐私弹窗授权，无授权不得调用敏感 API（`wx.requirePrivacyAuthorize`）
- 诱导分享、强制关注、虚拟支付违规是三大高频拒审原因

**本项目**：**零网络、零账号、零权限** —— 不申请任何权限、不调用任何需要授权的 API，
**因此不涉及隐私弹窗，也不需要配隐私政策**。
⚠️ **这是本项目的既定架构决策，不要为了「加个云同步 / 登录」而破坏它** ——
一旦引入账号或网络，上面这一整套合规要求立刻全部适用。

### 0.7.7 提审内容红线（与本项目直接相关）

项目有一条既定决策（`core/extra.ts:242` 注释）：

> 🔴 刻意**不收录**安全套 / 情趣用品：这类提审敏感内容交给用户自己在
> 「还有一些东西，只有你自己知道」里添加，代码不预置
> （否则有被判定「内容不符合所选类目」而驳回的风险）。

**同理**（见 §4.8）：止痛药**只给一个中性条目名**，不写具体药名、剂量、服用建议。

> 这两条都属于「**提审红线，不是产品细节**」。后续任何人觉得「写得再贴心一点更好」——
> **不要改**。

### 0.7.8 其它与本项目相关的官方修复记录

| 版本 | 内容 | 对本项目的意义 |
|---|---|---|
| v3.17.1 (2026-07-01) | 修复 `scroll-view` 首次加载时异常高度 | 若后续改用 `scroll-view` 承载列表，注意此问题 |
| v3.17.0 (2026-06-17) | skyline 下 touch 阻止默认行为后**不应**再响应 tap | §3.4「滑动后不要误触发行勾选」正是这个语义 |
| v3.14.0 (2025-12-31) | 安卓 `scroll-view` 横向滚动不显示 scrollbar | 横向轨道（`.stage-rail`）相关 |
| v3.12.1 (2025-11-21) | `root-portal` 脱离页面时需屏蔽 portal 组件 | 用 `root-portal` 时留意 |
| v3.9.2 (2025-08-07) | `root-portal` 支持 `externalClass` | 需要外部控制 portal 内样式时可用 |
| v3.6.4 (2024-10-23) | 完善 Skyline WXS 特性 | WXS 在 Skyline 下的行为仍在演进 |

### 0.7.9 一句话总结（给接手的人）

> **模拟器通过 ≠ 真机通过；真机通过 ≠ 低版本真机通过。**
> 本项目踩过的三个真机专属问题（WXS 编译、`backdrop-filter` 包含块、图标空白）
> **在模拟器上全部不会复现**。凡是碰 `.wxs` / 浮层 / 图标，**必须真机验一次**。

---

## 1. 需求总览

| # | 需求 | 类型 | 影响面 | 优先级 |
|---|---|---|---|---|
| **R5-1** | 三视图（准备/入住/退房）左右滑动切换**仍未实现** | 修 bug | `pages/stay/` | 🔴 高（第 4 次提） |
| **R5-2** | 点物品**任意处**即可选中/取消（四个视图） | 交互 | `components/item-row/` + 3 个页面 | 🔴 高 |
| **R5-3** | 新增**性别**维度，物品按性别适配 | 新功能 | `core/extra.ts` + 向导 + 行程页 | 🔴 高 |
| **R5-4** | 删掉第 ④ 步的「和谁一起住」，关系只在上一步定 | 逻辑收敛 | `pages/wizard/` | 🔴 高 |
| **R5-5** | 女性专属「是否处于经期」开关 + 默认加卫生巾 | 新功能 | 并入 R5-3 | 🟡 中 |
| **R5-6** | 化妆品：像衣物一样可自定义添加 | 新功能 | 泛化 `clothing-add` | 🟡 中 |
| **R5-7** | 衣物下拉**错位**（面板跑到列表顶部） | 修 bug | `components/clothing-add/` | 🔴 高 |
| **R5-8** | 浮窗：时长加长 / 加宽自适应 / 尽量单行 | 调整 | `components/toast/` + `core/toast.ts` | 🟢 低 |
| **R5-9** | **住宿情况页**：保持独立 + 每个标签配扩展提示 + 扩充到 7 个标签（含「其他」）+ 改一列排放 | 新功能 | `core/extra.ts` + 向导第 ⑤ 步 | 🟡 中 |

> ✅ **老板已经把全部 6 条悬而未决的问题拍板了**（2026-10-02）。动手前先看 §11 ——
> **照做即可，不要再问第二遍**。要点速览：
>
> | 拍板项 | 结论 | 正文位置 |
> |---|---|---|
> | 浮窗时长 | `TOAST_MS = 1500` | §8.2 |
> | 「入住界面」统一 | 物品行整行可点；**(b)(c) 不用改代码** | §3.0 / §3.0.1 |
> | 化妆品入口 | **只给女性**；男性走通用输入 | §4.5 B 表 / §6 |
> | 止痛药 | **女性 + 经期 → 默认加入**；男性可自加 | §4.8 |
> | 第 ⑤ 步要不要合并 | ✅ **保持独立（仍是 7 步）**，并把这一页做实 | §5.3 |
> | 住宿情况页扩展 | 7 个标签 + 一列排放 + 每项配提示 | §5.3 |

---

## 2. R5-1 · 三视图左右滑动切换「仍未实现」

> 老板原话：「还是切换的问题，三个视图的滑动切换你还是没有实现。」
> 这是他**第四次**提这件事。

### 2.1 已经做过什么（别重复劳动）

| 轮次 | 做法 | 结果 |
|---|---|---|
| R2 | 页面 `bindtouchend` 判定 | 老板：「有时候不能用」 |
| R3 | 判定挪到 `bindtouchmove`，阈值降到 48px / 1.2 倍 | 老板：「还是不流畅」 |
| R4 | **改用 WXS 响应事件**（视图层跑，零跨线程通信）+ 三段可平移轨道 + 补间动画 | 真机**编译失败**（`Number(x)`，已修） |

R4 的实现在 `pages/stay/swipe.wxs`（手势判定 + 位移 + 动画，全在视图层）与
`pages/stay/stay.wxml`（`.stage-viewport > .stage-rail > .seg-seg.is-prev/.is-cur/.is-next`）。

**关键事实**：R4 那版**在真机上从未跑起来过** —— 它编译就挂了。
所以「滑动没实现」很可能只是**编译错误的后遗症**，而不是手势逻辑有问题。

### 2.2 ⚠️ 第一步：先分清是哪种「没实现」（不要跳步）

**动手改代码之前，先做这三件事**：

1. **确认老板已经重新扫码**。DevTools 的「编译」只作用于模拟器，真机必须重新扫码才加载新代码。
   如果没扫，那看到的还是 R4 那版**编译失败**的页面 —— 自然「没有滑动」。
2. 打开行程页，看控制台是否还有 `swipe.wxs:...Unexpected token` 之类的编译错误。
   **有 → 先修编译错误，本节结束**（`npm run check:wxs` 应该已经能防住）。
3. 编译干净了但滑动仍无效 → 在 `swipe.wxs` 的 `start` / `move` / `end` 里各加一句
   `console.log('wxs:start')` 之类（WXS 只支持 `console.log`），真机上看控制台：
   - **一句都没有** → WXS 事件压根没收到 → 走 §2.3
   - **有 start 没有 move** → `touchmove` 被吞 → 走 §2.3
   - **有 move 但页面不动** → `selectComponent` / `setStyle` 的问题 → 见 §2.3 的排查点

### 2.3 方案 A（首选）：修 WXS 事件链路

**最可疑的一点**：WXS 函数「目前只能响应**内置组件**的事件，**不支持自定义组件事件**」
（官方原文）。而手势绑在页面根节点 `<view class="page">` 上，手指却大多落在
`<item-row>`（自定义组件）内部 —— 事件能不能从自定义组件里冒泡到 WXS 处理器，
**这一点官方没有明说，必须实测**。

按可疑度从高到低试：

**A-1. 改用捕获阶段绑定**
把 `stay.wxml` 根节点上的绑定从冒泡改成捕获：

```html
<!-- 现在 -->
bindtouchstart="{{swipe.start}}" bindtouchmove="{{swipe.move}}"
bindtouchend="{{swipe.end}}"     bindtouchcancel="{{swipe.cancel}}"

<!-- 改成（捕获阶段：在事件下行的路上就截住，子组件 catch 不掉） -->
capture-bind:touchstart="{{swipe.start}}" capture-bind:touchmove="{{swipe.move}}"
capture-bind:touchend="{{swipe.end}}"     capture-bind:touchcancel="{{swipe.cancel}}"
```

`capture-bind` 是 WXML 标准的事件绑定形式，理论上对 WXS 同样成立，但**需要真机确认**。

**A-2. 把绑定下移到 `.stage-viewport`**
现在绑在页面根节点，离触摸点隔了 5 层。改绑到 `.stage-viewport`
（`stay.wxml:157`，一个内置 `<view>`，直接包着轨道），链路更短、更可控。

**A-3. 排查点**（如果日志有、但页面不动）
- `ins.selectComponent('#stageRail')` 返回 `null` → 换成 `selectAllComponents` 或改用 class 选择器
- `setStyle` 没效果 → 确认目标节点是**内置组件**（`setStyle` 不能设置最顶层页面的样式）
- `getBoundingClientRect()` 返回 0 宽 → 它在 `skyline` 下是异步回调式，`webview` 下才是同步返回；
  本项目用默认 `webview`，应该是同步的。拿不到宽度时会回退 `375`，不至于不动。

### 2.4 方案 B（保底，100% 可用）：退回页面层 + 松手补间动画

**如果 A 怎么试都不行，就用这条。** 它的依据很硬：
**R2/R3 用的就是页面层 `bindtouchmove`，那条链路被证明是能收到事件的**（老板说「有时候能用」）。

做法：

1. 手势判定回到页面层（`stay.ts`）：`bindtouchstart` / `bindtouchmove` / `bindtouchend`
2. 页面层**只做判定**（用 `core/gesture.ts` 现成的 `swipeDir(dx, dy)`），**不做逐帧位移**
3. 松手时用 CSS transition 做**切换动效**：

```css
/* stay.wxss */
.stage-rail {
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}
```

`setData({ railX: -w })` → 轨道平滑滑过去 → 两帧后复位到 0 并切段。

**结果**：有完整的「翻页」动效，**但不跟手**（拖动过程中内容不动，松手才滑）。
这正好是 `R4-PLAN.md` §0.4 早就写好的降级路径。

> **为什么不能既在页面层判定、又做到跟手**：页面层的每一次 `touchmove` 都要
> 「视图层 → 逻辑层 → setData → 视图层」两次跨线程通信，一秒 60 次手势 = 120 次通信，
> 必然顿。**跟手必须让代码跑在视图层**（WXS）或**用原生组件**（见方案 C）。

### 2.5 方案 C（真正原生跟手，改动最大）：用 `<swiper>`

老板要的是「跟翻书一样」—— 最接近这个体感的其实是原生 `<swiper>`：
手势与动画都由原生实现，天然流畅，还自带 `easing-function`。

**为什么当初没用**（`stay.ts:356` 的注释）：三段是长列表、高度差很大，
`swiper` 必须有确定高度，嵌在可滚动页面里还要给每段套 `scroll-view`，
会把现有「页签吸顶 + 整页滚动」的布局全打翻。

**如果要用，需要**：
- `swiper` 高度用 `wx.createSelectorQuery` 量当前段，`style="height: {{h}}px"`；切段后重量
- 每段内部改 `scroll-view`（否则 `swiper` 撑不满）
- 页签吸顶要重做（`scroll-view` 内 `sticky` 不可靠）
- 危险区（删除按钮）要移出 `swiper`

**这是最大的一笔改动，只在 A 和 B 都不能让老板满意时才上。**

### 2.6 不要做的事

- ❌ **不要再用 `<swiper>` 之外的方式追求「跟手」**：只要位移是页面层 `setData` 驱动的，就一定顿。
- ❌ **不要再调阈值**（48px / 1.2 倍）来「修」不流畅。阈值只影响**判定**，不影响**流畅度**。
  前三轮都在这上面打转，别再重复。
- ❌ **不要同时保留两套手势实现**（WXS + 页面层）。会双触发，表现为「一次滑动跳两段」。
  用哪套就把另一套删干净，包括 `stay.wxml` 的绑定和 `stay.ts` 的 handler。

---

## 3. R5-2 · 点物品「任意处」即可选中/取消

> 老板原话：「点击物品的标签或界面的任何地方，就可以直接选中、添加或取消该物品。」

### 3.0 ✅ 统一规则（2026-10-02 老板拍板：「入住界面，你去统一一下，按你觉得最好的方案去定」）

**结论一句话：凡是「物品行」，整行可点；物品行之外的分组标题与说明文字保持原样。**

四个视图全部收敛到同一条规则上，不再出现「这个界面能点、那个界面不能点」：

| 老板说的界面 | 实际位置 | 谁渲染 | 统一后 | 怎么实现 |
|---|---|---|---|---|
| **(a) 清单界面** | 向导第 ⑦ 步「确认清单」 | `item-row` | ✅ 整行可点 | `editable="{{true}}"` + `bind:toggle`，见 §3.5 |
| **(d) 准备界面** | 行程页「准备」段 | `item-row` | ✅ 整行可点 | 组件内改一处，两处自动生效 |
| **(b) 入住界面** | 行程页「入住」段 | `<template name="checkBody">` 的 `.crow` | ✅ **本来就已经能**（`bindtap="onCheck"` 挂在整行上） | **不改代码** |
| **(c) 退房界面** | 行程页「退房」段 | **与 (b) 是同一个模板** | ✅ 同上 | **不改代码** |

> ⚠️ **(b) 与 (c) 共用 `<template name="checkBody">`**（`stay.wxml:87-110`），
> 两者的物品行是**一模一样的代码**。所以老板反馈的「入住不能点、退房能点」**不可能**来自
> 模板差异 —— 真实原因见 §3.0.1。

#### 3.0.1 「入住」段为什么会有「点不动」的感觉

`checkBody` 的真实结构（`stay.wxml:91-108`，已逐行核对）：

```
<view class="sec-label sec-flex">                          ← ① 分组标题行：只有右侧 glink 能点
  <view class="dot {{g.tone}}"></view>
  <text class="grow">{{g.name}}</text>
  <view class="glink" bindtap="goKnow">知识详解 ›</view>    ← 有自己的行为
</view>
<view class="gnote">{{g.note}}</view>                      ← ② 分组说明文字：**全组唯一完全没绑事件的区域**
<view class="glass card">
  <view class="crow" bindtap="onCheck">…</view>            ← ③ 物品行：整行可点，本来就能点
</view>
```

**结论**：check 段的物品行（③）本来就是整行可点（`onCheck` 已挂整行，`data-gi`/`data-ii` 齐全）。
点不动的只有 ① 的组名区域和 ② 的说明文字 —— 老板大概率点到了 ②。

> 注意：check 段（入住/退房）的物品是**布尔勾选**（`ci.done`），**没有 `qty` 概念**，
> 所以不存在「因为数量为 0 所以点不动」这种情况。`onCheck` 里那句 `if (stage === 'prep') return`
> 是因为「准备」段走的是另一个模板 `prepBody`，与本问题无关。

**统一处理（照此做）：**

| 区域 | 处理 | 理由 |
|---|---|---|
| ③ `.crow` 物品行 | **不动** | 已经是整行可点 |
| ② `.gnote` 分组说明 | **不要并入 `onCheck`** | 它是「这一组为什么建议带」的解释，不是物品。点说明文字就勾选某一项，语义是错的 |
| ① `.glink` 知识详解 | **保持独立** | 有明确功能，并进去会变成「点一次做两件事」 |

> 所以 **(b)(c) 两段不需要改任何代码**。如果老板在真机上仍觉得「点不动」，请先确认点的是不是
> ② 那块灰字说明 —— 若是，且确实要求它也可点，**另行提出**；那时的正确做法是给 `.gnote` 加
> `data-gi="{{gi}}"` 并接「展开/收起该组」，而**不是**接 `onCheck`。

### 3.1 四个视图的现状对照

| 老板说的界面 | 实际位置 | 现在能不能整行点 | 要做什么 |
|---|---|---|---|
| **(a) 清单界面** | 向导第 ⑥ 步「确认清单」 | ❌ 不能。`item-row` 传了 `editable="{{false}}"`，勾选框根本不渲染，也没接 `toggle` 事件 | 改成可勾选 |
| **(b) 入住界面** | 行程页「入住」段 | ⚠️ **代码上已经能**（`stay.wxml:100-107` 的 `.crow` 整行 `bindtap="onCheck"`） | **先实测确认**，见下 |
| **(c) 退房界面** | 行程页「退房」段 | ✅ 能（与入住段**共用同一个 `<template name="checkBody">`**） | 不用改 |
| **(d) 准备界面** | 行程页「准备」段 | ❌ 不能。只有左上角那个小勾选框可点（`item-row.wxml:8-12`） | 整行可点 |

> ⚠️ **(b) 与 (c) 共用同一个模板**，所以「退房能点、入住不能点」在代码上说不通。
> 可能的原因：老板点到了**分组说明**（`gnote`）或**「知识详解」链接**（`glink`）—— 这两块在
> `.crow` **外面**，点了没反应。**先实测确认，再决定要不要改**；如果确实只是这两块的问题，
> 把它们的可点区域也纳入即可。

### 3.2 改法：让 `item-row` 整行可点

**核心改动只有一处** —— `components/item-row/item-row.wxml` 的根节点加 `bindtap`：

```html
<!-- 现在：根节点没有任何点击事件 -->
<view class="row {{item.done ? 'done' : ''}} ...">

<!-- 改成 -->
<view class="row {{item.done ? 'done' : ''}} ..." bindtap="onToggle" hover-class="hv">
```

`item-row.ts` 里 `onToggle()` **已经存在**（第 116 行），逻辑也现成：
`qty === 0` 时直接 return（不带的东西不该被勾选），否则 `triggerEvent('toggle', ...)`。
**不用新写逻辑，只要把事件接上。**

### 3.3 ⚠️ 关键：哪些区域必须「挡住」冒泡

整行可点之后，**行内其它可点元素会连带触发 toggle**（子元素 tap 冒泡到根节点）。
必须逐个用 **`catchtap`**（不是 `bindtap`）截住：

| 元素 | 位置 | 现在的绑定 | 改成 |
|---|---|---|---|
| 勾选框 `.tick` | `item-row.wxml:10` | `bindtap="onToggle"` | **`catchtap="onToggle"`**（否则点勾选框会触发两次，等于没点） |
| 步进器 `<stepper>` | `item-row.wxml:40` | 组件内 `bindtap="onStep"` | 外面包一层 `<view catchtap="noop">` |
| 好物入口 `.gearbtn` | `item-row.wxml:35` | `bindtap="toggleGear"` | **`catchtap="toggleGear"`** |
| 删除按钮 `.del` | `item-row.wxml:43` | `bindtap="onRemove"` | **`catchtap="onRemove"`** |
| 使用人 `<picker>` | `item-row.wxml:22` | 原生组件 | 一般会自己吞掉；**实测确认**，不行就包一层 `catchtap` |
| `<gear-panel>` | `item-row.wxml:47` | 组件根已有 `catchtap="noop"`（`gear-panel.wxml:1`） | ✅ 已经挡住了，不用改 |

> **`catchtap` 的原理**：`catch` 阻止事件继续向上冒泡，但**元素自己内部的 handler 照常执行**。
> 所以「点步进器 → 只加减数量，不切换勾选」这个效果靠它实现。

`noop` 必须是**真实存在的空方法**（本项目在 `modal` 组件上踩过：写 `catchtap="false"` 部分真机不生效）。

### 3.4 ⚠️ 与 R5-1 滑动手势的冲突

整行可点之后，「横向拖拽」的起手也是落在同一行上。要保证：

- **一次横向滑动结束后不要顺带触发 toggle**。小程序 `bindtap` 本身有位移容差
  （手指移动超过阈值就不算 tap），通常够用；但**方案 A/B 里如果自己处理了 touch 事件，
  要确保 `touchend` 后不额外派发 tap**。
- 真机验收时**专门测这条**：滑一段之后，起点那一行有没有被误勾上。

### 3.5 (a) 向导第 ⑥ 步的额外改动

`pages/wizard/wizard.wxml:250-256` 现在传的是：

```html
<item-row ... editable="{{false}}" removable="{{it.source === '自定义'}}" bind:qty="onItemQty" bind:remove="removeItem" />
```

改成：

```html
<item-row ... editable="{{true}}" removable="{{it.source === '自定义'}}"
           bind:toggle="onPreviewToggle" bind:qty="onItemQty" bind:remove="removeItem" />
```

并在 `wizard.ts` 新增（与行程页 `onItemToggle` 同一语义，只是按 `_i` 下标定位）：

```ts
onPreviewToggle(e: { detail: { idx: number; value: boolean } }) {
  const i = Number(e.detail.idx);
  if (!Number.isInteger(i) || i < 0) return;
  this.setData({ [`preview[${i}].done`]: !!e.detail.value });
  this.rebuildGroups();   // 进度与分组计数要跟着变
}
```

> 注意 `item-row` 的 `idx` 属性在向导里传的是 `it._i`（`wizard.wxml:252`），
> 事件回传的 `detail.idx` 就是它，可以直接用。

---

## 4. R5-3 / R5-5 · 性别维度 + 经期

> 老板原话：「每次刚开始入住的时候，都需要选择性别。如果是女性，后续的物品清单里面就应该有『卫生巾』的选项。」
> 「如果选择了女生，在『你在意哪些方面』的界面里，就可以加上一个标签，叫做『是否处于经期』。如果是的话，就默认给卫生巾加上。」
> 「如果是男性，就不要加上这种标签和选项。」
> 「男女一定要做好适配……这个逻辑上一定要跑得通。」

### 4.1 设计原则（老板明确给的两条，务必照做）

1. **性别只影响「默认生成的清单」，不影响「用户手动添加」。**
   - 男性 → 默认没有卫生巾，但**可以自己加**（他可能是给对象带的）
   - 女性 → 默认没有剃须刀，但**可以自己加**（她可能是给对象带的）
   - ⇒ 衣物 / 化妆品这类**用户主动打开的下拉面板，一律不做性别过滤**，保留全部选项。

2. **性别未知（老数据 / 导入的数据）时，一个物品都不摘。**
   行为与现在**完全一致** —— 这是向后兼容的底线，绝不能因为加了性别维度就让老行程的清单变了。

### 4.2 数据模型怎么加（`core/extra.ts`）

**绝对不要动 `core/types.ts`**（红线）。加在扩展层：

```ts
export type Gender = 'male' | 'female';

export interface ConditionsExt extends Conditions {
  // ...已有字段
  /** 性别。老数据没有 → undefined → 不做任何性别过滤 */
  gender?: Gender;
  /** 是否处于经期。仅女性可见、可开 */
  period?: boolean;
}

export interface StayExt {
  relation: Relation;
  // ...已有字段
  gender?: Gender;
  period?: boolean;
}

/** 取性别；非法/缺失一律当「未知」 */
export function genderOf(c: ConditionsExt): Gender | undefined {
  return c.gender === 'male' || c.gender === 'female' ? c.gender : undefined;
}
```

⚠️ 还要同步改 `loadExt()` 的解析（它现在只校验 `relation`）——
别让一个非法的 `gender` 值把整份扩展数据带坏。参考现有写法：非法值静默回落，**不抛错**。

### 4.3 向导改动

**新增第 ① 步「你的性别」**，原 ①–⑥ 顺移为 ②–⑦，`TOTAL = 6 → 7`。

| 新步号 | 内容 | 备注 |
|---|---|---|
| ① | **性别**（新） | 二选一，必选；未选时「下一步」灰显 |
| ② | 日期与晚数 | 原 ①，**「必须选日期」的校验跟着从 `step === 1` 改成 `step === 2`** |
| ③ | 人数 | 原 ② |
| ④ | 同行人员 | 原 ③ |
| ⑤ | 住宿情况 | 原 ④，**删掉「和谁一起住」**，见 §5 |
| ⑥ | 偏好 | 原 ⑤，**女性新增「是否处于经期」开关** |
| ⑦ | 确认清单 | 原 ⑥ |

**要同步改的地方**（容易漏）：

- `wizard.ts`：`TOTAL`、`next()` 里的 `step === 1 && !date` 校验、`step === 5` 生成预览的条件
- `wizard.wxml`：所有 `wx:if="{{step === N}}"` / `wx:elif` / 最后的 `wx:else` 全部顺移一位
- `nextReady` 现在只表示「日期选没选」，加了性别步之后要**按当前步判断**：
  第 ① 步看性别，第 ② 步看日期，其余恒 `true`
- `save()`：把 `gender` / `period` 写进 `setStayExt(...)`

**性别不进 `draft`** —— `draft` 是源 `Conditions` 的形状，存进 `Stay` 后必须与源项目一致。
照 `relation` / `study` 的现有做法，放 `data.gender` / `data.period`。

### 4.4 🔑 物品过滤机制（本节最关键）

`剃须刀`（`core/data.ts:21`）和 `卸妆棉`（`core/data.ts:22`）都是 `when: () => true`，
即**恒真、永远出现在清单里**。而它们在红线文件里，改不了。

**解法：在扩展层按性别「摘掉」源清单里的项。**

```ts
// core/extra.ts

/**
 * 源清单里「只在某一性别下才默认出现」的项。
 * 源的 when 恒为 true（改不了，红线），所以由扩展层在合并前摘掉。
 * ⚠️ 用 itemId 匹配，不要用名称（名称将来可能改）。
 */
const GENDER_EXCLUDE: Record<Gender, string[]> = {
  male:   ['makeup_remover'],   // 卸妆棉
  female: ['razor'],            // 剃须刀
};

function genderFilter(items: PrepItem[], c: ConditionsExt): PrepItem[] {
  const g = genderOf(c);
  if (!g) return items;                       // 性别未知 → 一个都不摘（向后兼容）
  const drop = new Set(GENDER_EXCLUDE[g]);
  return items.filter(i => !(i.itemId && drop.has(i.itemId)));
}

export function buildPrepExt(c: ConditionsExt): PrepItem[] {
  const base = genderFilter(buildPrep(c), c);   // ← 只加这一层
  const extra = EXTRA_ITEMS.filter(it => it.when(c)).map(it => toPrepItem(it, c));
  return sortItemsExt([...base, ...extra]);
}
```

**为什么这样是对的**：
- `buildPrep` 本身不动 → 源项目那 38 条测试继续全绿，红线不破
- 摘的是「默认清单」，用户仍能在第 ⑦ 步手动加回来
- 只摘 2 项，改动面最小

### 4.5 男女适配总表（老板要求「分析每一个物品」）

全部 **72 项**（源 56 + 扩展 10 + 本轮新增 6）逐条过了一遍，结论：
**只有 4 项需要按性别区分，其余 68 项男女通用。**

> 需要区分的 4 项 = 剃须刀、卸妆棉（B 表 A 段）+ 卫生巾、止痛药（B 表新增）。
> 「化妆品」是**分类入口**不是物品，单列在 B 表末行。

#### A. 需要按性别默认隐藏（2 项）

| 物品 | 位置 | 分类 | 现状 | 女性 | 男性 | 处理 |
|---|---|---|---|---|---|---|
| **剃须刀** | `data.ts:21` | 洗漱 | 恒显示 | ❌ 默认隐藏 | ✅ 默认显示 | `GENDER_EXCLUDE.female` |
| **卸妆棉** | `data.ts:22` | 洗漱 | 恒显示 | ✅ 默认显示 | ❌ 默认隐藏 | `GENDER_EXCLUDE.male` |

> 只摘这 2 项，**不做「女性自动加化妆品、男性自动加剃须泡」这类推断** ——
> 老板只要求「不要出现不该出现的」，没要求「自动补上该有的」。

#### B. 需要新增的物品（8 项）+ 1 个新分类

| 新 id | 名称 | 分类 | 性别 | 何时出现 | 说明 |
|---|---|---|---|---|---|
| `x_sanitary_pad` | 卫生巾/护垫 | 卫生 | **仅女性** | `gender === 'female'` | 见 §4.6 |
| `x_lens` | 隐形眼镜（含护理液、镜盒） | 洗漱 | 通用 | 恒真 | 老板点名遗漏项 |
| `x_glasses` | 眼镜/备用眼镜 | 出行 | 通用 | 恒真 | 经典遗漏项 |
| `x_disposable_underwear` | 一次性内裤 | 衣物 | 通用 | `nights >= 2 \|\| purposeExt === '旅游'` | 长住/旅游高频 |
| `x_sunscreen` | 防晒霜 | 洗漱 | 通用 | `purposeExt === '旅游'` | 海边/户外高频 |
| `x_painkiller` | 止痛药 | 健康 | **仅女性 + 经期** | `gender === 'female' && period` | ✅ 老板已拍板，见 §4.8 |
| **`x_gift`** | **探亲礼物/伴手礼** | 出行 | 通用 | `purposeExt === '探亲'` | 老板第 2 条要求，见 §5.3.3 |
| **`x_medical_record`** | **病历本/就诊卡** | 证件 | 通用 | `purposeExt === '看病'` | 老板第 2 条要求，见 §5.3.3 |
| （新分类） | **化妆品** | 化妆品 | **仅女性**显示入口 | — | ✅ 老板已拍板只给女性。见 §6，**不预置物品** |

> ⚠️ **扩展层物品的 `when` 一律用 `purposeExt`，不要用 `purpose`** ——
> 原因见 §5.3.2：源 `purpose` 里没有「学习培训 / 看病 / 其他」这三个值，
> 用 `purpose` 判会永远为假。
> 同时 `buildPrepExt()` 里要保证 `c.purposeExt` 一定有值（缺失时用 `c.purpose` 回推），
> 否则老行程的 `x_sunscreen` 等会突然消失。

> **关于化妆品入口（老板第 3 条已拍板）**：**只给女性**。
> 男性**不显示**这个分类入口，但**仍能自由添加** —— 走第 ⑦ 步的
> 「还有一些东西，只有你自己知道」通用输入框（`wizard.wxml:280`），与卫生巾完全同理。
> 老板原话：「化妆品入口不用给男性。当然，男性也可以自由添加，就跟卫生巾一样，
> 万一是他给他对象买的呢。」

> **关于安全套 / 情趣用品**：项目有一条既定决策（`extra.ts:242` 的注释）——
> 这类提审敏感内容**不预置**，交给用户自己在「还有一些东西，只有你自己知道」里加。
> **本轮不要推翻它。**
>
> **关于止痛药**：✅ **老板已拍板：加**。规则见 §4.8 ——
> **女性 + 经期 → 默认加入**；男性不默认出现，但可在第 ⑦ 步自行添加。
> ⚠️ 医疗红线（知识条目 `k39`）不变：**只加一个不带任何用法、剂量的中性条目名**，
> 不在任何文案里出现「吃什么药、吃多少」。

#### C. 男女通用（原 64 项 + 新增 4 项 = 68 项，逐条确认过）

以下是**全部**通用物品。之所以全部列出来，是因为老板明确要求「分析每一个物品」——
**这一节就是分析结论**，请勿跳过。

> B 表里新增的 4 个**通用**物品（隐形眼镜 / 眼镜 / 一次性内裤 / 防晒霜）不在这里重复列，
> 它们已经在上表中写清了触发条件。

**源清单（54 项，除剃须刀 / 卸妆棉外）**

| 分类 | 物品 |
|---|---|
| 证件 | 身份证、护照、手机、钱包、小额现金 |
| 电子 | 充电器、数据线、充电宝、氮化镓多口充电器、USB 数据阻断器、魔方插座 |
| 洗漱 | 牙刷、牙膏、毛巾/压缩毛巾、拖鞋、便携过滤花洒、分装瓶、速干浴巾、折叠漱口杯、便携餐具 |
| 卫生 | 一次性马桶垫、湿巾/酒精湿巾、一次性隔离贴膜、一次性浴缸套、粘毛器、一次性床单/隔脏睡袋 |
| 安全 | 小型手电筒、阻门器/顶门器 |
| 衣物 | 内衣裤、袜子、换洗上衣、裤子/下装、睡衣、外套、密封袋/脏衣袋、儿童换洗衣物 |
| 睡眠 | 眼罩、耳塞 |
| 驱蚊 | 驱蚊液/花露水 |
| 适老 | 防滑拖鞋、感应小夜灯 |
| 健康 | 常用药品 |
| 儿童 | 纸尿裤、婴儿湿巾、恒温水壶、床围挡、儿童牙刷、儿童拖鞋 |
| 长住 | 洗衣片/便携洗衣液、折叠晾衣架 |
| 出行 | 折叠伞 |
| 补给 | 大桶矿泉水、抽纸、湿厕纸 |

**扩展清单（10 项，全部通用）**

便携烧水壶、棋牌/便携桌游、钥匙/房卡套、随身水杯/保温杯、耳机、儿童安抚玩偶、
惯用枕头/枕巾、U 型颈枕、学习/培训资料、笔记本/笔

#### D. 刻意不按性别区分的几处（说明理由，避免被「顺手改了」）

| 物品 | 为什么不区分 |
|---|---|
| 速干浴巾 / 毛巾 | 长发确实更常用，但物品本身中性，不做推断 |
| 分装瓶 / 洗漱包 | 同上 |
| 湿厕纸 / 一次性马桶垫 | 女性用量可能更大，但物品中性 |
| 阻门器 / 手电筒 | 常被推荐给独自出行的女性，但**对任何人都有用**，不该按性别摘 |
| 衣物的下拉类型表（含「裙子」） | 用户主动添加的入口，**不做性别过滤**（见 §4.1 原则 1） |

### 4.6 卫生巾的触发规则

老板的两句话要拆成两层：

| 条件 | 结果 |
|---|---|
| 女性 | 清单里**有**卫生巾这个条目（`prep: '可选'`，默认 `qty: 1`） |
| 女性 **且** 经期开关打开 | 卫生巾**默认带上**（`prep` 升级为 `'必带'`，`qty` 按晚数算，如 `nights + 1`） |
| 男性 / 性别未知 | **不出现**（但可在第 ⑦ 步手动添加） |

⚠️ **实现上有个坑**：`ExtraItemDef.prep` 现在是**静态字符串**（`extra.ts:230`），
没法按条件变。要支持「经期时升级为必带」，建议把它放宽成**可以是函数**：

```ts
export interface ExtraItemDef {
  // ...
  prep: Prep | ((c: ConditionsExt) => Prep);   // ← 允许函数
}

function toPrepItem(it: ExtraItemDef, c: ConditionsExt): PrepItem {
  const prep = typeof it.prep === 'function' ? it.prep(c) : it.prep;
  // ...下面照旧，用 prep 替换原来的 it.prep
}
```

改完后卫生巾这样写：

```ts
{ id: 'x_sanitary_pad', name: '卫生巾/护垫', cat: '卫生', users: 'adult', unit: '包',
  prep: c => (c.period ? '必带' : '可选'),
  qty:  c => (c.period ? c.nights + 1 : 1),
  when: c => genderOf(c) === 'female' },
```

> 这是扩展层内部的接口放宽，**不碰红线**，也不影响现有 10 个扩展物品（它们传的仍是字符串）。

### 4.7 经期开关放哪、什么条件显示

- 位置：向导第 ⑥ 步（原第 ⑤ 步「你在意哪些方面？」）内，与其他偏好开关并列
- 显示条件：**`gender === 'female'` 才渲染**（男性与性别未知都不显示）
- 交互：一个 `<toggle>`，样式与现有四个偏好开关一致（`wizard.wxml:185-215` 是模板）
- 提示行：打开时给一条 `fxline`，说明「＋将加入：卫生巾/护垫、止痛药」（两件一起加，见 §4.8）

⚠️ **性别改回男性时，`period` 必须一起清掉**（否则会留下一个「男性 + 经期」的脏状态，
清单里可能残留卫生巾）。参考 `applyAdults` 里清理儿童/老人字段的写法。

### 4.8 止痛药（2026-10-02 老板拍板：加）

> 老板原话：「止痛药可以给男性自定义添加；当女性有经期的时候，可以加上止痛药。」

**规则（三层，别搞混）：**

| 性别 / 状态 | 止痛药是否出现在清单里 | 默认带不带 |
|---|---|---|
| 女性 **且** 经期开关打开 | ✅ 出现 | ✅ **默认带上**（`prep: '必带'`） |
| 女性，经期开关**关闭** | ❌ **不出现**（不是「出现但可选」） | — |
| 男性 / 性别未知 | ❌ 不出现 | — |
| 任何性别，用户主动添加 | ✅ 出现 | 用户自己决定 |

定义（加到 `EXTRA_ITEMS`）：

```ts
{ id: 'x_painkiller', name: '止痛药', cat: '健康', users: 'adult', unit: '盒',
  prep: c => (c.period ? '必带' : '可选'),
  qty:  () => 1,
  when: c => genderOf(c) === 'female' && !!c.period },
```

> **⚠️ 为什么不用「女性恒显示、经期升级为必带」这种写法（卫生巾那样）？**
> 因为老板对这两件东西的措辞**不一样**：
>
> | 物品 | 老板原话 | 提炼出的条件 |
> |---|---|---|
> | 卫生巾 | 「如果是女性，后续的物品清单里面就**应该**有『卫生巾』的选项」 | **女性恒显示** → `when: female` |
> | 止痛药 | 「当女性**有经期**的时候，**可以加上**止痛药」 | **只在经期出现** → `when: female && period` |
>
> **两件的 `when` 不要写成一样。** 卫生巾是「有经期的可能就备着」，止痛药是「疼了才要」。

#### 4.8.1 ⚠️ 医疗红线：只给名字，不给任何用法

项目有一条既定红线 —— 知识条目 `k39` 明确「**不给任何药物 + 剂量组合建议**」。所以：

| ✅ 可以做 | ❌ 绝对不要做 |
|---|---|
| 条目名就叫「止痛药」 | 写「布洛芬 400mg」这类**具体药品 + 剂量** |
| 单位用「盒」 | 写「痛经时吃 1 片」这类**服用建议** |
| `users: 'adult'` | 给儿童 / 老人默认加任何药品 |
| 经期打开时给一条 `fxline`：「＋将加入：卫生巾/护垫、止痛药」 | 在知识库或说明文案里补「痛经怎么办」的内容 |

> 这一条**同样约束审阅者**：如果后续有人觉得「只写『止痛药』太笼统，不如写具体药名更贴心」——
> **不要改**。这是提审红线，不是产品细节。

#### 4.8.2 男性怎么「自定义添加」

老板要的「男性也可以自己加」，**不需要新写任何代码** —— 第 ⑦ 步的
「还有一些东西，只有你自己知道」通用输入框（`wizard.wxml:280`，行程页对应 `stay.wxml:69`）
本来就能加任意物品，落进「其他」分类。验收清单里专门留了 **H52** 来测这条路径。

#### 4.8.3 经期关掉 / 性别改回男性时，止痛药要跟着消失

因为 `when` 是条件函数，`period` 一关（或性别改成男性），`buildPrepExt` 重算时
止痛药**自动不出现** —— 不需要额外的清理代码。
但**已经加进清单的手动项**不会被自动删（用户自己加的，保留），这是正确行为。

> 与 §4.7 末尾那条一致：性别改回男性时 `period` 必须一起清掉，否则会留下
> 「男性 + 经期」的脏状态，止痛药会跟着冒出来。

---

## 5. R5-4 · 关系逻辑收敛：删掉第 ④ 步的「和谁一起住」

> 老板原话：「我在上一个界面已经确定了是情侣关系，下一个界面你又是可改的，这是什么逻辑呢？」
> 「在『你问我这次住宿属于哪种情况』的界面里，『和谁一起住』下面的这些标签可以不要了。」

### 5.1 为什么 R4 的「锁定」没生效

R4 确实做了关系锁定（`relationLocked`），但**锁的条件不对**：

```ts
// core/extra.ts:130
export function autoRelation(c: ConditionsExt): Relation | null {
  if (int0(c.adultsWith) > 0) return null;   // ← 有成人同行 → 返回 null → 不锁
  if (elderlyCountOf(c) > 0) return '家人';
  if (int0(c.children) > 0) return '家人';
  return '独自';
}
```

`relationLocked = (autoRelation(...) !== null)`。

所以：
- 「老人同行」（无成人同行）→ `auto` = `'家人'` → **锁上** ✅（这是 R4 修的场景）
- 「情侣同行」（有成人同行）→ `auto` = `null` → **不锁** ❌ ← **老板踩的正是这个**

老板在第 ④ 步看到「情侣」已经选中，却还能点成「同事」—— 因为那时 `relationLocked` 是 `false`。

### 5.2 改法：第 ④ 步整块删掉，关系以第 ③ 步为唯一来源

**删的东西**：

| 位置 | 删什么 |
|---|---|
| `wizard.wxml:165-174` | 整个 `<block wx:if="{{showRelation}}">`（「和谁一起住」标题 + chips + 锁定提示 + 影响说明） |
| `wizard.ts` | `setRelation()` 方法 |
| `wizard.ts` | `data.showRelation`、`data.relationLocked`、`data.relationLockHint` |
| `wizard.ts` | `syncDerived()` 里算这三个值的代码 |
| `wizard.ts` | import 里的 `RELATIONS`（第 ④ 步不用了；`RELATIONS` 仍被 `extra.ts` 内部使用，**不要从 extra.ts 删**） |

**保留 / 改的东西**：

- **第 ③ 步的「和你同行的是什么关系？」（`wizard.wxml:128-135`）保留**，它成为唯一入口
- `relationLocked` 的语义简化成：**只有「没有成人同行」时才需要自动判定**。
  第 ④ 步没了，这个标志不再需要暴露给模板，但 `syncDerived()` 里「自动判定后写回 `relation`」
  的逻辑**要保留**（否则老人/儿童同行时关系会停在默认值）：
  ```ts
  if (auto !== null && auto !== this.data.relation) patch.relation = auto;
  ```
- `fxRelation`（第 ⑦ 步「你的选择如何影响清单」里的一行）保留，逻辑不变

**删完之后第 ⑤ 步（原 ④）只剩「住宿情况」那一组标签**，会很单薄。

> ✅ **2026-10-02 老板已拍板：保持独立（仍是 7 步），并把这一页做实。**
> 老板原话：「关于这 4 个标签的问题，我建议**保持独立**，并做以下扩展与调整……」
> 具体扩展见 §5.3。**不要再提「合并步骤」这件事了。**

### 5.3 住宿情况页的扩展（2026-10-02 老板追加要求）

> 老板原话：
> 1. **增加扩展提示**：扩展方式与第 6 个页面的「偏好」类似。选中某个标签后，下方会加入相应的提示或用品。
>    (a) 选「注意卫生」，下面就加入一些卫生用品的提示；(b) 选「旅游」，就加上一些旅游用品；(c) 选「探亲」，就加上一些礼物的提示。
> 2. **扩充标签选项**：建议再多加一些标签，比如「学习培训」、「看病」等。同时**一定要加上「其他」**这个选项，因为用户可能比较注重保密。
> 3. **调整排版布局**：这一页的标签**不要放在一行，改为一列排放**，排布方式参考下一个「偏好」界面。

#### 5.3.1 🔴 第一道坎：`Purpose` 是红线，不能加值

```ts
// core/types.ts:3   ← 🔴 红线文件，必须与源项目零差异
export type Purpose = '普通短住' | '出差' | '旅游' | '探亲';
```

「学习培训」「看病」「其他」**不能**加进这个联合类型 —— 一加，`npm run diff:types` 立刻红。
而且源 `data.ts` / `engine.ts` 里有大量 `when: c => c.purpose === '旅游'` 这类规则，
它们都是对着这 4 个字面量写的，加了新值源规则也不会认。

**好消息**：向导里那个选项数组**不是**从红线文件读的，而是写死在页面里：

```ts
// pages/wizard/wizard.ts:92
purposes: ['普通短住', '出差', '旅游', '探亲'] as Purpose[],
```

所以**可以放心替换这个数组**，只要保证 `draft.purpose` 最终仍是那 4 个值之一。

#### 5.3.2 方案：扩展层加 `PurposeExt`，源字段做降级映射

```ts
// core/extra.ts（扩展层，随便改）
export type PurposeExt = Purpose | '学习培训' | '看病' | '其他';

export const PURPOSES_EXT: PurposeExt[] = [
  '普通短住', '出差', '旅游', '探亲', '学习培训', '看病', '其他',
];

/** 界面展示值 → 源 Purpose（给源清单规则用） */
export function toSourcePurpose(p: PurposeExt): Purpose {
  switch (p) {
    case '出差': return '出差';
    case '旅游': return '旅游';
    case '探亲': return '探亲';
    // 「学习培训」「看病」「其他」在源枚举里没有对应值 → 一律落到「普通短住」。
    // 语义上也成立：这三种都是「按常规住宿准备，再额外补几样」。
    default: return '普通短住';
  }
}
```

写进 `StayExt`：

```ts
export interface StayExt {
  relation: Relation;
  purposeExt?: PurposeExt;   // ← 新增。老数据缺失时按 conditions.purpose 回推
  // ...其余不变
}
```

**关键约束（必须遵守）：**

| 字段 | 存什么 | 谁在用 |
|---|---|---|
| `draft.purpose` → `Stay.conditions.purpose` | **只能是源 4 值之一**（`toSourcePurpose()` 的结果） | 源 `engine.ts` / `data.ts` 的清单规则 |
| `data.purposeExt` → `StayExt.purposeExt` | 用户真正点的那个（7 值） | 扩展层物品的 `when`、界面回显 |

> ⚠️ **两个字段必须同时写、同时读。**
> 只写 `purposeExt` → 保存后重进向导，选中项会丢；
> 只写 `purpose` → 「学习培训」被存成「普通短住」，用户的选择被吞掉。

**回显逻辑**（进入向导 / 编辑已有行程时）：

```ts
const pe = ext?.purposeExt ?? c.purpose;   // 老数据没有 purposeExt → 用源 purpose 回推
```

**扩展层物品的 `when` 一律用 `purposeExt`，不要用 `purpose`：**

```ts
{ id: 'x_gift', name: '探亲礼物/伴手礼', cat: '出行', users: 'shared', prep: '可选', unit: '份',
  when: c => c.purposeExt === '探亲' },
```

#### 5.3.3 七个标签、图标与扩展提示

| 序 | 标签 | 图标 | 选中后的 `fxline` 提示 | 实际会加入的物品 |
|---|---|---|---|---|
| 1 | 普通短住 | `bed-double` | ＋按常规短住清单准备 | — |
| 2 | 出差 | `briefcase` | ＋将加入：便携烧水壶、U 型颈枕 | `x_kettle`、`x_neckpillow` |
| 3 | 旅游 | `compass` | ＋将加入：防晒霜、一次性内裤 | `x_sunscreen`、`x_disposable_underwear` |
| 4 | 探亲 | `house` | ＋将加入：便携烧水壶、探亲礼物 | `x_kettle`、**`x_gift`（新）** |
| 5 | 学习培训 | `book-open` | ＋将加入：学习/培训资料、笔记本/笔 | `x_study_doc`、`x_study_kit` |
| 6 | 看病 | `pill` | ＋将加入：病历本/就诊卡、常用药品 | **`x_medical_record`（新）**、「常用药品」（源已有） |
| 7 | 其他 | `sliders` | 不显示提示（或一条中性说明，见 §5.3.4） | — |

> ⚠️ **图标 tone 档位**：`.pickrow` 里第 ② 步用的是 `tone="p"`（pine）。
> 上表 7 个图标中，`bed-double` 和 `house` 现在**只有 `d` 档**、`sliders` **只有默认档**，
> 直接写 `tone="p"` 会**静默渲染成空白**（不报错、不警告）。
> 必须同步改 `tools/gen-icons.py` 的 `VARIANTS`：
>
> ```python
> 'bed-double': 'dp',    # 原 'd'  → 补 p
> 'house':      'dp',    # 原 'd'  → 补 p
> 'sliders':    'p',     # 原 ''   → 补 p
> ```
>
> 改完跑 `npm run check:icons` 确认（它会数 class 数与引用数）。

#### 5.3.4 「其他」的语义：不推断、不打扰

老板要「其他」的理由是「用户可能比较注重保密」。所以：

| 项 | 规则 |
|---|---|
| 存什么 | `purposeExt: '其他'`；`conditions.purpose: '普通短住'` |
| 清单 | 与「普通短住」**完全一致**（最中性的基线，不做任何按目的的推断） |
| 提示行 | 一条中性说明：「按通用清单准备，不会根据住宿目的推荐任何东西」 |
| 界面回显 | **「其他」保持选中**（不能显示成「普通短住」，否则用户会以为自己的选择被改了） |

> **不要把「其他」实现成「普通短住」的别名。** 两者源清单一样，但：
> ① 用户心理预期不同（一个是我没特别情况，一个是我不想说）；
> ② 扩展层物品的 `when` 要能区分（将来若给「普通短住」加东西，「其他」不该跟着变）。

#### 5.3.5 一列排放：直接复用第 ② 步的 `.picklist`

第 ② 步（人数）已经有一套现成的纵向单选列表，**样式一个字都不用新写**：

```html
<view class="picklist">
  <view wx:for="{{purposesExt}}" wx:key="k"
        class="pickrow {{purposeExt === item.k ? 'on' : ''}}"
        data-k="{{item.k}}" bindtap="setPurpose" hover-class="hv">
    <icon name="{{item.icon}}" size="38" tone="p" />
    <text class="picklabel">{{item.k}}</text>
    <view class="pickcheck"><icon wx:if="{{purposeExt === item.k}}" name="check" size="24" tone="c" /></view>
  </view>
</view>
<view wx:if="{{purposeFx}}" class="fxline">{{purposeFx}}</view>
```

复用到的类（`wizard.wxss:189-230`）：`.picklist`（纵向 + 12rpx 间距）、
`.pickrow`（`min-height: 88rpx` = 触摸目标下限）、`.pickrow.on`（松绿边框 + 浅底 + 加粗）、
`.picklabel`（`flex:1` 撑开）、`.pickcheck`（右侧圆形选中勾）。

**高度估算**：7 行 × 88rpx + 6 × 12rpx 间距 = 616 + 72 = **688rpx ≈ 344px**
（iPhone SE 的 667px 屏高够用）。加上 `.q` 标题和 `fxline`，整页需要滚动 ——
向导页本来就是可滚动的，没问题。

**提示行放哪**：紧跟在整个 `.picklist` **下面**（不是每行下面）。
因为住宿情况是**单选**，一次只可能选中一个，与「偏好」页（多个独立开关、每个下面各跟一条）不同。

> 老板说「选中某个标签后，**下方**会加入相应的提示」——
> 若想让提示紧贴**被选中的那一行**，就把 `fxline` 用 `wx:if` 放进 `wx:for` 内部、
> 判断 `purposeExt === item.k`。两种都行，**推荐放在列表下方**：整块更稳，
> 切换选项时不会撑动其它行的位置。

**配套改动**（容易漏）：

| 位置 | 改什么 |
|---|---|
| `wizard.ts:92` | `purposes` 换成 `purposesExt`（带 `{ k, icon }` 的结构） |
| `wizard.ts` | `setPurpose()` 改成同时写 `draft.purpose`（源值）和 `purposeExt` |
| `wizard.ts` | `syncDerived()` 里算 `purposeFx`（当前选中项对应的提示文案） |
| `wizard.ts` | `save()` 把 `purposeExt` 写进 `setStayExt(...)` |
| `wizard.ts` | `buildEffects()` / `setPreview()` 里凡是读 `draft.purpose` 的地方，**改用 `purposeExt`** |
| `wizard.wxml` | 第 ⑤ 步的 `.chips` 整块换成 `.picklist`；删掉 `<block wx:if="{{showRelation}}">`（§5.2） |

#### 5.3.6 关于老板举的「注意卫生」

老板举例说「选『注意卫生』，下面就加入一些卫生用品的提示」。
但 **「注意卫生」不在住宿情况这一页** —— 它是第 ⑥ 步（偏好）里的一个开关
（`wizard.wxml:191-195`，`prefs.hygiene`），而且**提示早就实现了**：

```html
<view class="srow">
  <view class="slabel"><icon name="droplets" size="34" tone="p" />在意卫生</view>
  <toggle value="{{draft.prefs.hygiene}}" bind:change="togglePref" data-k="hygiene" />
</view>
<view wx:if="{{draft.prefs.hygiene}}" class="fxline">＋将加入：一次性床单/隔脏睡袋</view>
```

所以：

- **住宿情况页不重复设「注意卫生」** —— 同一个概念出现在两页，用户会不知道该点哪个。
- 老板要的「机制」在第 ⑥ 步**本来就有**，本次只是把同一套机制搬到第 ⑤ 步（见 §5.3.3）。
- 如果确实想让住宿情况也能影响卫生用品，**不要加标签**，而是把它并进某个场景标签的提示里
  （例如「看病」那条带上卫生用品），或者干脆不做 —— 两页的职责要分开（见 §5.3.7）。

#### 5.3.7 两页的职责边界（避免以后又混）

| 页面 | 问的是 | 影响清单的方式 |
|---|---|---|
| 第 ⑤ 步 住宿情况 | **这次住宿的客观类型**（出差 / 旅游 / 看病…） | 按场景补物品（扩展层 `when`） |
| 第 ⑥ 步 偏好 | **你在意什么**（卫生 / 蚊虫 / 睡眠…） | 按在意点补物品（源 `prefs` + 扩展层） |

> 客观事实 vs 主观在意点 —— 这也正是 §11 里不推荐把两页合并（选项 C）的理由。

---

## 6. R5-6 · 化妆品：像衣物一样可自定义添加

> 老板原话：「如果是女生，可能还会有各种各样的化妆品。关于化妆品的添加逻辑，应该和衣物差不多：
> 具体添加什么化妆品咱就不管了；它的处理逻辑应该就像衣物一样。」

### 6.1 要做的事

1. **新增分类 `化妆品`**，插在 `衣物` **后面**（不是列表末尾）
2. **把 `clothing-add` 泛化成通用的「分类下拉」组件**，衣物和化妆品共用
3. **化妆品不预置任何物品** —— 只有「添加入口」，加什么由用户决定

### 6.2 `CAT_ORDER_EXT` 要改插入位置

现在的实现（`extra.ts:186-191`）把 `EXTRA_CATS` 一股脑插在「自定义」之前。
「化妆品」应该紧跟「衣物」，所以改成**按锚点插入**：

```ts
export const EXTRA_CATS = ['娱乐', '学习', '化妆品'];

export const CAT_ORDER_EXT: string[] = (() => {
  const out = [...CAT_ORDER];
  const after = (anchor: string, cats: string[]) => {
    const at = out.indexOf(anchor);
    out.splice(at < 0 ? out.length : at + 1, 0, ...cats);
  };
  after('衣物', ['化妆品']);      // 化妆品紧跟衣物
  after('补给', ['娱乐', '学习']); // 娱乐/学习位置不变（补给原本就在「自定义」前一个）
  return out;
})();
```

⚠️ **现有测试可能断言 `CAT_ORDER_EXT` 的内容与顺序，改完要一起更新。**

### 6.3 泛化 `clothing-add`

现在这个组件的类型表是**写死的**（`clothing-add.ts:9`），分类也是调用方写死的
（`stay.ts:503` 的 `cat: '衣物'`）。改成**由外部传入**：

```ts
// components/clothing-add/clothing-add.ts
Component({
  properties: {
    chosen: { type: String, value: '' },
    /** 面板里可选的类型列表 */
    types: { type: Array, value: [] as string[] },
    /** 新增项要落到哪个分类 */
    cat:   { type: String, value: '' },
    /** 输入框的 placeholder（衣物是「防晒衣」，化妆品是「面膜」） */
    placeholder: { type: String, value: '输入名称' },
  },
  // ...
});
```

调用方（`stay.wxml` / `wizard.wxml`）传进去：

```html
<!-- 衣物 -->
<clothing-add wx:if="{{isCur && g.cat === '衣物'}}" id="addClothing" cat="衣物"
              types="{{clothTypes}}" placeholder="输入衣物名称，如：防晒衣"
              bind:add="addTyped" bind:openchange="onClothOpen" />

<!-- 化妆品（仅女性渲染） -->
<clothing-add wx:if="{{isCur && g.cat === '化妆品'}}" id="addCosmetic" cat="化妆品"
              types="{{cosmeticTypes}}" placeholder="输入化妆品名称，如：面膜"
              bind:add="addTyped" bind:openchange="onClothOpen" />
```

> **命名建议**：组件已经通用了，`clothing-add` 这个名字会误导后来的人。
> 建议改名为 `type-add`（目录 + 4 个文件 + 2 处 `usingComponents` + `selectComponent` 的引用）。
> 改名是有成本的（约 8 处），**如果嫌麻烦，保留原名也行，但请在文件头注释里写明它已泛化**。

**⚠️ `id` 必须唯一**：现在页面用 `selectComponent('#clothingAdd')` 找它
（`stay.ts:200`、`stay.ts:383`、`wizard.ts:622`），一页出现两个之后会取错。
改成 `selectAllComponents('.catadd')` 逐个处理，或维护两个 id 分别取。

### 6.4 化妆品类型表（下拉里的预设）

老板说「具体添加什么化妆品咱就不管了」，所以这张表由我们定，**并且用户可以自由输入自定义项**：

```
洗面奶 · 水乳 · 精华 · 面霜 · 防晒 · 隔离 · 粉底 · 遮瑕 · 散粉
眼影 · 眼线 · 睫毛膏 · 眉笔 · 腮红 · 口红 · 润唇膏
卸妆水 · 卸妆棉 · 化妆刷 · 美妆蛋 · 化妆包 · 面膜
```

放在 `core/extra.ts` 里导出（例如 `COSMETIC_TYPES`），别写死在页面里 ——
与 `clothing-add.ts:9` 的 `TYPES` 一样，是数据不是逻辑。

### 6.5 新增项落到哪

参照 `addClothing`（`stay.ts:494`、`wizard.ts:574`）：新增项 push 到 `custom` 数组，
`cat` 用传入的分类，`source: '自定义'`。**同名同分类去重**。

---

## 7. R5-7 · 衣物下拉错位（面板跑到列表顶部）

### 7.1 现象（老板截图 `衣物异常.jpg`）

点「选择衣物类型…」之后，下拉面板**出现在页面顶部**（盖在「内衣 / 外套 / 睡衣」那几行上），
而触发条在**底部**（「裤子/下装」下面）。两者完全脱节。

### 7.2 根因：`backdrop-filter` 把 `position: fixed` 的包含块换掉了

`clothing-add.wxml:9-28` 的遮罩与面板是 `position: fixed`，位置由
`clothing-add.ts` 的 `place()` 用 `boundingClientRect()` 量出来再 `setData` 定位：

```ts
panelTop: r.bottom + 8,   // r 是触发条在**视口**里的位置
```

但面板在 DOM 上位于 `.glass card` **内部**，而 `.glass`（`app.wxss:70`）有：

```css
backdrop-filter: blur(24px) saturate(1.5);
-webkit-backdrop-filter: blur(24px) saturate(1.5);
```

按 CSS 规范，**带 `backdrop-filter`（非 none）的元素会成为其后代 `position: fixed` 的包含块**。
于是 `top: 602px` 不再是「距屏幕顶 602px」，而是「**距这张卡片顶 602px**」——
面板当然会跑到别的地方去。`left` / `width` 同理，也会偏。

> 这也是为什么它「在开发者工具里看着还行、真机上乱跑」：两端渲染细节不同，但错位是必然的。

### 7.3 修法（按推荐度排序）

#### ✅ 首选：用 `<root-portal>` 把浮层从页面里「摘出去」

`<root-portal>` 是官方组件（**基础库 2.25.2+**，**WebView 与 Skyline 都支持**），
作用就是「使整个子树从页面中脱离出来，类似于在 CSS 中使用 fixed position 的效果」。
项目 `libVersion` 是 `2.32.3`，可用。

```html
<!-- clothing-add.wxml -->
<view class="cwrap">
  <view class="ctrigger ..." bindtap="onToggle"> ... </view>
</view>

<root-portal wx:if="{{open}}">
  <view class="cmask" bindtap="close" catchtouchmove="noop">
    <view class="cpanel ..." catchtap="noop"> ... </view>
  </view>
</root-portal>
```

一行改动，**保留现有的浮层体验**（面板浮在卡片之上、不挤压下方物品行、带遮罩）。

#### 备选一：改成「锚在触发条下方的内联浮层」

不用 `fixed`，改用**相对定位**：

```css
.cwrap { position: relative; }                 /* 触发条的容器当锚点 */
.cpanel {
  position: absolute;
  top: 100%;  left: 0;  right: 0;              /* 紧贴触发条下方 */
  margin-top: 8rpx;
  z-index: 10;
}
```

- ✅ 不需要 JS 量位置，**天然不会错位**
- ✅ 不受 `backdrop-filter` 影响
- ⚠️ **会被后面的卡片盖住**：`.glass` 有 `backdrop-filter` → 创建**层叠上下文** →
  面板的 `z-index` 被限制在卡片内部，而后面的卡片（出行 / 卫生 / …）会画在它上面。
  需要给宿主卡片临时加 `position: relative; z-index: 20`（由页面在 `openchange` 时切一个 class）

#### 备选二：内联展开（最土但最稳）

面板直接**在流内**展开在触发条下面，撑开卡片。没有定位、没有遮罩、没有层叠问题。
代价是会**把下面的物品行推下去** —— 但下拉菜单本来就可以这样，用户不会觉得奇怪。

> 这是 `clothing-add.ts:1-8` 注释里提到的「M5 之前」的做法。如果上面两条都不顺，退到这条，
> **别再回到 `fixed` + JS 测量**。

#### ❌ 不要做的事

- ❌ **不要去调 `PANEL_H`（`clothing-add.ts:12`）或 `roomBelow` 的判断阈值**。位置算错不是阈值问题。
- ❌ **不要靠「滚动时关闭面板」来掩盖**（`onPageScroll` 里那个 `close()`）。
  它只是补丁，面板打开的那一瞬间就已经错了。

---

## 8. R5-8 · 浮窗调整（时长 / 宽度 / 排版）

> 老板原话：「浮窗已经实现了，但：1. 显示时间尽量稍微再加长一些；
> 2. 长度加宽，并且要根据手机尺寸进行自适应；3. 文字尽量在一行内显示，手机尺寸小再换行两行。」

### 8.1 现状

| 项 | 现状 | 位置 |
|---|---|---|
| 时长 | `TOAST_MS = 900` | `core/toast.ts:16` |
| 宽度 | `max-width: 620rpx`（写死） | `components/toast/toast.wxss:13` |
| 排版 | `white-space: normal`（会换行） | `components/toast/toast.wxss:35` |

### 8.2 时长：**已定为 `TOAST_MS = 1500`**（老板授权我定，照此执行）

**背景**：老板 R4 的原话是「显示的时间不要太长，**大概在 1 秒以内，不得超过 1 秒**」，
当时据此定了 `TOAST_MS = 900`，并写了测试（`tests/acceptance.test.ts` 的 L12
断言 `TOAST_MS <= 1000`）与验收项（`ACCEPTANCE.md` H36）。
这次他说「稍微再加长一些」—— **两条要求互斥**，老板已明确授权由我定夺。

**推导过程**（把这个算清楚，比拍脑袋给个数更有用）：

| 项 | 值 |
|---|---|
| 文案长度 | 「已记录到下方「已设为不带」，随时可恢复」= **18 个汉字** |
| 一眼读完所需 | 约 **1.2s 的完全不透明**时间 |
| 淡入耗时（`toast.wxss:26`） | 0.22s —— 完全不透明从 0.22s 才开始 |
| ⇒ `TOAST_MS` | 0.22 + 1.2 ≈ **1.42s** → 取整 **1500ms** |

**取值对比**：

| | 完全不透明 | 总在屏时间 |
|---|---|---|
| 原 `900` | 0.68s | 1.12s |
| **新 `1500`** | **1.28s** | **1.72s** |

**为什么敢取到 1500（而不是「稍微」只加 300ms）**：`.toast` 有 `pointer-events: none`
（`toast.wxss:27`），**它不会挡住任何操作**，停留久一点的代价极低；
而如果太短、用户没读到，就会误以为「东西被删掉了」—— 这个信息丢失是不可逆的。
风险不对称，所以往长了取。

**必须同步更新的三处**（否则测试会挂、文档会自相矛盾）：

1. `core/toast.ts` —— 常量改 `1500`，并把那段「不超过 1 秒」的注释改写成上面的推导
2. `tests/acceptance.test.ts` L12 —— 删掉 `expect(TOAST_MS).toBe(900)`
   和 `expect(TOAST_MS).toBeLessThanOrEqual(1000)`，改成断言新值
3. `ACCEPTANCE.md` H36 —— 把「不超过 1 秒」的描述改成实际时长

> ⚠️ **不要再保留「≤1 秒」这条约束** —— 老板已经明确改口，留着会让后来的人以为测试写错了。
> 但要在 `core/toast.ts` 的注释里**写明这段历史**（原要求是什么、什么时候改的、为什么），
> 免得下次有人看到「1500」以为是随手写的。


### 8.3 宽度与排版：一条 CSS 改动就够

老板要的效果是「**内容多宽就多宽，但不超过屏幕；只有屏幕太窄时才换行**」。
这正是 `max-width` + `shrink-to-fit` 的默认行为 —— 把写死的 `620rpx` 换成**视口相对值**即可：

```css
/* components/toast/toast.wxss */
.toast {
  /* ...其余不变 */
  max-width: calc(100vw - 96rpx);   /* ← 由 620rpx 改这里；两侧各留 48rpx 呼吸位 */
}
```

- `.toast` 是 `position: fixed` 且没有显式 `width` → **宽度按内容收缩**（shrink-to-fit）
- 内容窄 → 单行，不换行 ✅
- 内容宽 → 撑到 `max-width` 为止，再换行 ✅
- `calc(100vw - …)` → 自动适配所有屏宽 ✅

**不需要** `width: max-content`（部分机型支持不稳），也不需要 JS 算宽度。

`white-space: normal`（`toast.wxss:35`）保持不动即可 —— 它正是「允许换行」的开关。

### 8.4 顺带检查

- 现有文案「已记录到下方「已设为不带」，随时可恢复」18 个字，26rpx 字号
  → 单行约 470rpx + 图标 + 内边距 ≈ 590rpx，**在 750rpx 设计宽度下本来就能单行**。
  老板觉得挤，很可能是因为 `620rpx` 上限卡得太紧，改完就正常了。
- `bottom: 240rpx`（避开固定底栏）保持不变。
- 两个接入点（向导第 ⑦ 步、行程页准备段）**共用同一个组件**，改一处两边同时生效。

---

## 9. 验收清单（新增 H 系列，写进 `ACCEPTANCE.md` §7）

| # | 项 | 在哪看 |
|---|---|---|
| **H38** | 行程页三段能左右滑动切换，有跟手或补间动效（对应 R5-1） | 行程页 |
| **H39** | 点物品行的**任意位置**（名称 / 标签 / 空白）都能选中或取消；点步进器、好物入口、删除按钮**不会**误触发选中（对应 R5-2）。**注**：入住 / 退房两段本来就能整行点，本轮**无需改代码**，见 §3.0.1 | 向导第 ⑦ 步 + 行程页三段 |
| **H40** | 向导第 ① 步能选性别；不选时「下一步」是灰的（对应 R5-3） | 向导第 ① 步 |
| **H41** | 选**男性** → 清单里**没有**卫生巾、**有**剃须刀；选**女性** → 相反（对应 R5-3） | 向导第 ⑦ 步 |
| **H42** | 选女性时，第 ⑥ 步出现「是否处于经期」；选男性时**这个开关完全不出现**（对应 R5-5） | 向导第 ⑥ 步 |
| **H43** | 女性 + 打开经期 → 清单里卫生巾是「必带」且数量按晚数算；关掉经期 → 卫生巾仍在但降为「可选」、数量 1（对应 R5-5） | 向导第 ⑦ 步 |
| **H44** | **反向可加性**：男性清单里能手动添加**卫生巾**和**化妆品**；女性清单里能手动添加**剃须刀** —— 都走「还有一些东西，只有你自己知道」通用输入（对应 R5-3 原则 1 + 老板第 3 条拍板） | 向导第 ⑦ 步 |
| **H45** | 第 ④ 步**已经没有任何**「和谁一起住」标签；关系只能在上一步（同行人员）选（对应 R5-4） | 向导第 ④ → ⑤ 步 |
| **H46** | **女性** + 衣物分组下方出现**化妆品**分组与添加面板；能选预设类型、也能自定义输入；添加后落到「化妆品」分组（对应 R5-6）。**男性：没有这个分组入口**，但 H44 的通用输入仍可加（老板第 3 条拍板） | 向导第 ⑦ 步 + 行程页准备段 |
| **H47** | 点「选择衣物类型…」→ 面板**紧贴触发条下方**弹出，不再跑到列表顶部（对应 R5-7） | 向导第 ⑦ 步 |
| **H48** | 浮窗变宽且随屏宽自适应、文案单行显示；显示时间比之前长（对应 R5-8） | 向导第 ⑦ 步 + 行程页准备段 |
| **H49** | **回归**：老行程（性别字段缺失）打开后清单与改动前**完全一致**（剃须刀和卸妆棉都在）（对应 §4.1 原则 2） | 行程页 |
| **H50** | **回归**：一次横向滑动只跳一段，且**不会**顺带把起点那一行勾上（对应 §3.4） | 行程页 |
| **H51** | **性别热切换**：女性 ↔ 男性来回切，卫生巾 / 剃须刀 / 卸妆棉 / 化妆品入口**立刻同时进出**；切回男性后 `period` 被清掉（第 ⑥ 步的「是否处于经期」消失且不残留）（对应 §4.7 末段 + 老板第 3 条） | 向导第 ① ↔ ⑥ ↔ ⑦ 步 |
| **H52** | **止痛药**（对应 §4.8）：① 女性 + 打开经期 → 清单里出现止痛药且是「必带」；② **关掉经期 → 止痛药整条消失**（不是降级为可选）；③ 男性清单里从头到尾**没有**止痛药；④ 男性也能在通用输入里手动加进去 | 向导第 ⑥ ⑦ 步 |
| **H53** | **住宿情况是一列**（对应 §5.3.5）：7 个标签**竖排**、一行一个、占满卡片宽，每行高 ≥ 88rpx，右侧有圆形选中勾 —— 不是原来那排横着挤的 chips | 向导第 ⑤ 步 |
| **H54** | **每个标签都有提示**（对应 §5.3.3）：点「出差」→ 下方出现「＋将加入：便携烧水壶、U 型颈枕」；点「旅游」→ 换成防晒霜那条；**切换标签时提示跟着换**，不会两条同时显示 | 向导第 ⑤ 步 |
| **H55** | **新标签真的生效**（对应 §5.3.3）：选「学习培训」→ 清单里出现「学习/培训资料、笔记本/笔」；选「看病」→ 出现「病历本/就诊卡」和「常用药品」；选「探亲」→ 出现「探亲礼物/伴手礼」 | 向导第 ⑤ ⑦ 步 |
| **H56** | **「其他」不被吞掉**（对应 §5.3.4）：选「其他」→ 清单与「普通短住」一致、且**不出现任何按目的推荐的物品**；保存后**重新进入向导，「其他」仍然是选中的**（不能显示成「普通短住」） | 向导第 ⑤ 步 |
| **H57** | **回归（红线）**：`npm run diff:types` / `diff:data` / `diff:engine` **三个都零差异** —— 证明「学习培训 / 看病 / 其他」没有污染源 `Purpose` 枚举（对应 §5.3.1） | 命令行 |

> 验之前**务必重新扫码** —— DevTools 的「编译」只作用于模拟器。

---

## 10. 建议的实施顺序

按「依赖关系 + 风险」排的，**不要按需求编号顺序做**。

| 顺序 | 做什么 | 为什么排这里 |
|---|---|---|
| 1 | **§2.2 先做 R5-1 的诊断**（确认是否只是编译错误的后遗症） | 如果是，R5-1 直接收工，省下一大块工作 |
| 2 | **§7 R5-7 修下拉错位** | 独立、改动小、老板马上能看见效果 |
| 3 | **§8 R5-8 浮窗调整** | 独立、一行 CSS，顺手就做完了 |
| 4 | **§3 R5-2 整行可点** | 独立；但要注意 §3.3 的 `catchtap` 清单，别漏 |
| 5 | **§5.2 R5-4 删掉第 ④ 步的关系** | 是 §4 的前置（关系逻辑先收敛干净，再加性别维度） |
| 6 | **§5.3 R5-9 住宿情况页扩展** | 与第 5 步**动的是同一屏**，紧接着做省得来回改；且必须在 §4 的步号顺移**之前**完成 |
| 7 | **§4 R5-3/R5-5 性别维度 + 经期** | 最大的一块，且要动向导步号（顺移） |
| 8 | **§6 R5-6 化妆品** | 依赖 §4 的分类体系（`CAT_ORDER_EXT`）与泛化后的组件 |
| 9 | 补用例 + 更新四份文档 + 跑全量自检 | 见 §0.5 |

**每完成一条**：跑一次 §0.5 的自检 → 更新 `CHANGE-REQUESTS.md` / `PROGRESS.md` / `ACCEPTANCE.md`。
**别攒到最后一起做** —— 本轮改动横跨数据层、向导、行程页、三个组件，攒着改容易互相打架。

> ⚠️ **第 5、6 两步的顺序不能反**：`§5.2` 删关系块、`§5.3` 改住宿情况，
> 动的是同一个 `<block wx:elif="{{step === 4}}">`。分开两次改，第二次的 diff 会难看得多，
> 而且容易漏删。**一次改完。**

---

## 11. ✅ 待拍板问题的结论（2026-10-02 老板已拍板，**照此执行，不要再问**）

| # | 问题 | **结论** |
|---|---|---|
| 1 | 浮窗时长 | **由我定 → `TOAST_MS = 1500`**。见 §8.2 的推导 |
| 2 | 「入住界面」到底指哪个 | **由我统一**。四个视图（向导预览 / 准备 / 入住 / 退房）用**同一条规则**，见 §3.0 |
| 3 | 化妆品入口给谁 | **只给女性**。男性不加这个入口，但仍可用「还有一些东西，只有你自己知道」的通用输入自由添加（与卫生巾同理） |
| 4 | 止痛药 | **加**。规则：**女性 + 经期 → 默认加入**；男性不默认出现，但可自行添加。见 §4.8 |
| 5 | 第 ⑤ 步要不要合并 | ✅ **保持独立（仍是 7 步）**，并把这一页**做实**：扩充到 7 个标签、每个配扩展提示、改一列排放。见 §5.3 |
| 6 | 住宿情况页的扩展 | ✅ 同 §5.3（老板追加的 3 条要求：扩展提示 / 扩充标签含「其他」/ 一列排放） |

### 第 5 条的来龙去脉（已闭环，留档备查）

> 老板曾追问：「你说删掉关系之后只剩 4 个标签，要不要合并。这个问题我没听懂你啥意思，
> 你先给我解释一下，这个『删标签要不要合并』是啥意思？」

**解释**：不是「标签合并」，是**「步骤合并」**。

§5 要求把第 ④ 步（住宿情况）里的「和谁一起住」标签删掉之后，**那一步就只剩下
「普通短住 / 出差 / 旅游 / 探亲」这 4 个标签了** —— 用户点一下就过，却仍然占着独立的一屏
和一次「下一步」。所谓「合并」，指的是**要不要把这 4 个标签搬进相邻的某一步，
让总步数从 7 降回 6**。

| 选项 | 结果 | 评价 |
|---|---|---|
| **A. 保持独立** ✅ **老板已选这个** | 仍是 7 步，第 ⑤ 步是一个轻量屏 | ✅ 每一步只问一件事，认知负担最低；删掉关系后这一步本身已经很干净。老板进一步要求**把它做实**（§5.3），从此不再是「轻量屏」 |
| B. 并进第 ② 步（日期与晚数） | 6 步 | 语义最搭，但那一屏已有日期大标 + 4 个快捷日期 + 日历 + 晚数步进器，再塞会挤 |
| C. 并进第 ⑥ 步（偏好） | 6 步 | 语义不搭 —— 「住宿情况」是客观事实，「偏好」是主观在意点，混一屏会让人犹豫 |

> **结论：A。7 步不变。** 第 ⑤ 步通过 §5.3 的扩展获得足够的内容量，
> 「一屏只问一件事」和「这一屏有实质内容」两个目标同时达成。
> ⚠️ **不要再提合并步骤这件事。**


---

## 12. 附：本轮会碰到的文件清单（自查用）

```
core/extra.ts              ← 主要改动：Gender / period / genderFilter / EXTRA_CATS / CAT_ORDER_EXT
                             / EXTRA_ITEMS 新增 8 项（含 x_sanitary_pad、x_painkiller、
                               x_gift、x_medical_record）
                             / ExtraItemDef.prep 放宽为「字符串或函数」 / StayExt 加字段
                             / 🔑 PurposeExt + PURPOSES_EXT + toSourcePurpose()（§5.3.2）
core/toast.ts              ← TOAST_MS 900 → 1500（已定，见 §8.2）
core/gesture.ts            ← 可能要用（R5-1 方案 B 复用 swipeDir）

pages/wizard/wizard.ts     ← 步号顺移 / 性别 / 经期 / 删 setRelation / onPreviewToggle / save 写 gender
                             / 🔑 purposes 换成 purposesExt / setPurpose 双写 / purposeFx / save 写 purposeExt
pages/wizard/wizard.wxml   ← 新第 ① 步 / 步号顺移 / 删关系块 / 加经期开关 / item-row 改 editable / 化妆品面板
                             / 🔑 第 ⑤ 步 .chips → .picklist（7 行一列）+ fxline 提示
pages/wizard/wizard.wxss   ← 性别选项样式 / 经期开关（尽量复用现有 .srow / .chips / .pickrow）
                             ← 第 ⑤ 步**不用新写样式**，直接复用 .picklist / .pickrow / .picklabel / .pickcheck

pages/stay/stay.ts         ← 滑动手势（视方案而定）/ addTyped / selectAllComponents 处理两个面板
pages/stay/stay.wxml       ← 滑动手势绑定（视方案而定）/ 化妆品面板 / 衣物面板传参
pages/stay/stay.wxss       ← 轨道 transition（方案 B 才需要）

components/item-row/item-row.wxml   ← 根节点加 bindtap；4 处改 catchtap
components/item-row/item-row.ts     ← onToggle 已存在，基本不用改
components/clothing-add/*           ← root-portal 修错位 / 加 types·cat·placeholder 属性（建议改名 type-add）
components/toast/toast.wxss         ← max-width 改 calc(100vw - 96rpx)

tools/gen-icons.py         ← 🔑 VARIANTS 要补三个 p 档（§5.3.3）：
                               'bed-double': 'dp' / 'house': 'dp' / 'sliders': 'p'
                             改完跑 npm run check:icons
tests/acceptance.test.ts   ← 新增 L15+ / 更新 L12 / 可能更新 CAT_ORDER_EXT 相关断言
ACCEPTANCE.md / CHANGE-REQUESTS.md / PROGRESS.md   ← 三份文档同步
```

> 🔴 **红线自查**：本轮所有新功能（性别 / 经期 / 住宿情况扩展 / 化妆品 / 止痛药）
> **一律走扩展层 `core/extra.ts`**。
> `core/types.ts`（`Purpose` / `Conditions`）、`core/data.ts`、`core/engine.ts`
> **一个字都不许改**。改完必跑：
>
> ```bash
> npm run diff:types && npm run diff:data && npm run diff:engine
> ```
>
> 三个都必须零差异。**这是硬性验收项（H57）**。

> **图标提醒**：本项目图标是「手写 SVG → base64 → `icon.wxss`」生成的，
> `tone` 档位缺一个就会**静默渲染成空白**（不报错）。
> 新增任何 `<icon name="x" tone="p" />` 之后，必须跑 `npm run check:icons`。
