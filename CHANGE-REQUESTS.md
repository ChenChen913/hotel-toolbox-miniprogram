# StayKit 小程序 · 安卓真机整改需求单

> 面向：后续执行修改的 AI Agent / 开发者
> 版本：v1 · 2026-10-02
> 背景来源：老板在**安卓真机**上完成首轮试用后提出的修改意见
> 本次任务：**不写业务代码**，把需求、定位、根因、改法、注意事项与雷区固化成这份文档

---

## 0. 读这份文档前先记住 6 件事

| # | 约束 | 为什么 |
|---|---|---|
| 1 | **不要动** `miniprogram/core/types.ts`、`data.ts`、`engine.ts` 里的**任何一个字符** | 这是整个移植项目的红线：逻辑层必须与原 Web 项目**零差异**。有 `npm run diff:types / diff:data / diff:engine` 三条命令守着，还有 87 个单元测试 |
| 2 | 修改前先跑一遍基线，改完再跑一遍，**必须同为 `87 passed`** | `cd D:/hotel-miniprogram && npm test` |
| 2b | ⚠️ **本节为本文档写就时的口径**。本轮落地后验收用例由 49 增至 67，`npm test` 当前为 **105 passed**（38 源 + 67 验收）。判据不是「数字等于 87」，而是**源项目那 38 个用例逐字未改且全绿** | 见 §13.4 |
| 3 | 小程序默认 `box-sizing` 是 **content-box**，且 WXSS **不支持 `*` 通配符选择器** | 本轮「按钮溢出屏幕」的头号根因，见 P0-1 |
| 4 | WXML 的属性值里**不能出现裸 `<` 和 `&&`** | 本项目已踩过 3 次，会让整个页面白屏报错。判断一律提前在 `.ts` 里算成布尔/数字再传 |
| 5 | 全程保持**零网络 / 零埋点 / 零登录 / 零第三方运行时依赖** | 除了 P2-2 云同步（需老板另行拍板），其他改动不得引入任何网络请求、SDK、CDN 字体 |
| 6 | 改完必须**安卓真机复验**，模拟器不等于真机 | 玻璃模糊、自绘 tabBar、sticky 吸顶、阻尼手感四件事模拟器都看不出来 |

> 📌 **第二批反馈的排查结论见 §10**（人数按钮 bug、同行人员逻辑、清单物品核查、快捷日期排版）。
> 其中 **P2-3 / P2-4 会动红线文件，必须先拿到 §9-5 的决策**；其余均在 UI 层，可直接开工。

工程位置：`D:/hotel-miniprogram/`（`miniprogramRoot = miniprogram/`）
AppID：`wxab6a2e577bcdc940`
类型：原生小程序 + TypeScript，零运行时依赖，Vitest 3.0.5 + TS 5.7.3（**已锁版，不要升级**）

---

## 1. 现状速查（改动前请先看一眼这几个文件）

| 文件 | 行数 | 本次涉及 |
|---|---|---|
| `miniprogram/app.wxss` | 246 | **P0-1 缺 `box-sizing`；`.btn` 定义在 94 行** |
| `miniprogram/pages/home/home.wxml` / `.wxss` | 81 / 242 | P0-3 首页主按钮 |
| `miniprogram/pages/wizard/wizard.wxml` / `.wxss` | 207 / 219 | P0-4 下一步按钮跳动；P0-1 溢出 |
| `miniprogram/pages/stay/stay.wxml` / `.wxss` / `.ts` | 101 / 169 / ~310 | **改动最集中**：P1-2 吸顶、P1-3 分组折叠、P1-4 名称一行、P0-5 删除按钮、P0-6 自定义弹窗、P1-1 回顶部 |
| `miniprogram/pages/knowledge/knowledge.wxml` / `.wxss` | 86 / 220 | P2-1 模块折叠 |
| `miniprogram/pages/gear/gear.wxml` / `.ts` | ~80 / ~230 | P0-6 自定义弹窗（删好物、恢复默认） |
| `miniprogram/components/item-row/item-row.wxml` / `.wxss` | 45 / 153 | P1-4 物品名称一行显示 |
| `miniprogram/custom-tab-bar/index.wxss` | 56 | 悬浮胶囊 tabBar，`z-index: 1000`，**任何浮层都要 > 1000** |

当前体量：`miniprogram/` 394 KB / 69 文件（上限 2 MB，余量充足）
当前测试：87 passed = 38（源项目用例）+ 49（`tests/acceptance.test.ts` 新增验收）

---

## 2. 关键发现：所有按钮溢出是**同一个 bug**

### 根因推导（已实测验算，可直接照抄）

```css
/* app.wxss:94 —— 现状 */
.btn {
  width: 100%;          /* ← 罪魁祸首 */
  padding: 0 28rpx;     /* ← 帮凶 */
  /* 无 box-sizing，小程序默认 content-box */
}

/* 每个页面的容器 —— 现状 */
.page { padding: 0 32rpx calc(200rpx + env(safe-area-inset-bottom)); }
```

屏宽恒为 **750rpx**。在 content-box 下，`width:100%` 指的是**内容宽**，padding 额外往外长：

```
父容器 .page 内容宽      = 750 - 32×2      = 686rpx
.btn 实际占位宽          = 686 + 28×2       = 742rpx
.btn 左边起点            = 32rpx（page 的 padding）
.btn 右边终点            = 32 + 742         = 774rpx   ← 超出屏幕 24rpx！
```

**结论：`.btn` 系列一律右溢出 24rpx（`.btn.plain` 还有 1rpx 边框，溢出 26rpx）。**
这与老板反馈的「保存 / 这次入住 / 返回 / 修改 右边超出屏幕」完全吻合——它们都是同一个 `.btn`。

### 修复方案（二选一，推荐甲）

**甲 · 删掉 `width: 100%`（推荐，零依赖零副作用）**
`.btn` 是 `display: flex`，属于**块级**容器，`width: auto` 时它的**外框**自动等于父内容宽，padding 被算在里面，**天然不会溢出**。

```css
.btn {
  /* 删除 width: 100%; */
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100rpx;
  padding: 0 28rpx;
  ...
}
```

**乙 · 显式改 border-box（作辅助保护，不要单用）**
WXSS **不支持 `*` 通配符**，必须写元素列表：

```css
view, text, input, textarea, button, image, scroll-view, swiper,
picker, label, navigator, icon, canvas, slider, progress { box-sizing: border-box; }
```

> ⚠️ 单用方案乙有副作用：全局盒模型从 content-box 翻成 border-box，**所有既有宽高都会缩一圈**，原来靠 content-box 撑出来的留白会变化，等于要重新验收 4 个页面。**推荐甲为主、乙为辅**（甲解决 `.btn`，乙顺手兜住 input 之类）。

### P0-1 溢出审计清单（逐条核对，改完必须从第 1 条重看一遍）

> 「估算溢出」为按 750rpx 屏宽的理论值，改完请**在真机上逐条目视确认**，不要只看数字。

| # | 按钮 | 文件 : 行 | 类型 | 估算溢出 |
|---|---|---|---|---|
| 1 | 创建一次入住 | `home.wxml:9` → `app.wxss:94` | A 主按钮 | 右 24rpx |
| 2 | 下一步 / 开始 | `wizard.wxml:198` | A 主按钮 | 右 24rpx |
| 3 | 保存这次入住 | `wizard.wxml:203` | A 主按钮 | 右 24rpx |
| 4 | 返回修改 | `wizard.wxml:204` | A + `.plain` 有 1rpx 边框 | 右 26rpx |
| 5 | 删除这次入住 | `stay.wxml:97` | A + `.plain` 边框 | 右 26rpx |
| 6 | 取消 / 保存（好物） | `gear.wxml:74-75` | A 主按钮 | 右 24rpx |
| 7 | 恢复默认好物 | `gear.wxml:32` | A + `.plain` | 右 26rpx |
| 8 | 「添加」圆钮 + 两个 input | `wizard.wxml:180-191`（`wizard.wxss:175-193`） | C flex 行 | 整行约 **40rpx** |
| 9 | 添加我的必带物品行 | `stay.wxml:61-69`（`stay.wxss:152-165`） | C flex 行 | 整行约 **40rpx** |
| 10 | 导出 / 导入备份 | `home.wxml:69-70` | C flex 行 | 理论上不溢出，但**窄屏临界**，务必真机看 |

**C 类（8、9）单独说明**，它跟 `.btn` 不是一个病因，删 `width:100%` 治不好：

```css
/* stay.wxss:161 —— 现状 */
.qtyin { width: 120rpx; margin: 0 16rpx; text-align: center; }
/* .field 还有 padding: 0 20rpx（app.wxss:188），content-box 下实宽 = 120 + 40 = 160rpx */
```

可用宽度核算（`stay.wxml` 的 `.think` 卡片 padding 36rpx×2）：

```
容器可用宽 = 750 - 64(page) - 72(card) = 614rpx
数量输入框实占 = 120 + 40(padding) + 32(margin) = 192rpx
添加钮实占    = 60(padding) + 30(icon)         ≈  90rpx
名称输入实占  = flex:1 → 应得 332rpx，但它自身还有 40rpx padding → 实需 372rpx
→ 溢出约 40rpx
```

修法：`.addrow` 的三个子元素一律 `min-width: 0`；`.qtyin` 改 `width: 128rpx; flex: 0 0 128rpx;` 并加 border-box；`.growfield` / `.grow` 确保 `flex: 1 1 0; min-width: 0;`。**移动端输入框的最小舒适宽度是 200rpx**，若算下来名称框不足 200rpx，就说明这一行塞不下三样东西——**把「添加」按钮单独挪到下一行做成全宽主按钮**，而不是硬挤。

---

## 3. 修改清单

优先级：**P0 = 能用（溢出/点不动/危险操作），P1 = 好用（导航手感），P2 = 内容组织与远期**

---

### P0-1 · 全局按钮不再溢出屏幕

- **现象**：保存 / 这次入住 / 返回 / 修改 / 删除等按钮右侧超出安卓屏幕
- **定位**：见 §2 的清单，核心一处是 `app.wxss:94` `.btn`
- **改法**：
  1. `.btn` 删 `width: 100%`（方案甲）
  2. `view, text, input, ...` 加 border-box（方案乙，辅助）
  3. `.addrow` 三元素补 `min-width: 0`，`.qtyin` 改 `flex: 0 0 128rpx`
  4. 所有页面左右留白统一由 `.page { padding: 0 32rpx }` 提供，**子元素不要再写左右 margin 去对齐**
- **验收**：安卓真机上，任意 `.btn` 左右两侧到屏幕边缘的间距**完全一致**（应为 32rpx）
- **回归面**：⚠️ `.btn` 是全局类，一处改动影响 home / wizard / stay / gear 四个页面共 11 处按钮，**必须全页面目视回归**

---

### P0-2 · 触摸目标达标

- **现象**：按钮偏小偏窄，按下去费劲
- **现状**：`.btn` min-height 100rpx；`.btn.small` min-height 76rpx；`.icon-btn` 76×76rpx；`.copylink` 只有 8rpx padding（**这是最严重的，垂直不到 40rpx**）
- **标准**：微信官方建议触摸目标不小于 **44pt ≈ 88rpx**，结合本项目实操取 **≥ 96rpx 高、≥ 200rpx 宽**（主要操作 / 危险操作必须达标）
- **改法**：
  - `.btn.small` min-height `76rpx` → `88rpx`
  - `.copylink`、`.backup-sum`、`.glink` 这类**纯文字热区**加 `padding: 20rpx 16rpx`，或用**负 margin + padding** 外扩热区保留视觉密度
  - `.del`（删除单项）现在只有 32rpx 图标 + `padding: 0 8rpx` → 热区撑到至少 `72rpx × 72rpx`
  - `.tick`（勾选圈）视觉 44rpx，`margin: 22rpx 0` 把可点区撑到 88rpx ✅ 这个做法是对的，**请沿用这个套路处理其他小图标热区**
- **验收**：开发者工具打开「调试 → 显示视图边界」，逐个按钮量高度 ≥ 96rpx
- **注意**：不要为了达标把所有留白都拉大，优先用 padding 外扩而非改行高

---

### P0-3 · 首页主按钮重新设计

- **现象**：主按钮小、窄、靠上，不像小程序的手感
- **现状**：`home.wxml:4-12` 刊头占了超大一块——`.overline`(22rpx) + `.display`(66rpx) + `.gold-rule` + `.tagline`(28rpx) + 一堆 margin/padding，`.masthead` 还自带 `padding-top: 60rpx`。叠加下来「创建」按钮落在屏幕上方约 1/4 处，且宽度受 `.btn` content-box 影响偏窄、视觉重心单薄
- **改法（建议按此方案，可微调）**：
  1. **刊头瘦身**：`.masthead` padding-top `60rpx → 32rpx`；`.display` `66rpx → 52rpx`；`.gold-rule` 上下的 `32/28rpx` margin 收到 `20/16rpx`；`.tagline` margin-bottom `48rpx → 28rpx`
  2. **主按钮变成「大行动区」**：全宽（修好 P0-1 后自然全宽）、min-height `100rpx → 112rpx`、圆角 `24rpx → 28rpx`、字号 `31rpx → 34rpx`，保留现有松绿渐变底 + 白色「＋」图标，右侧再补一个 chevron 强化"点进去"的暗示
  3. **不要加悬浮 FAB**：本项目底部已有悬浮胶囊 tabBar（`z-index: 1000`），再加悬浮球会挡住列表最后一条
  4. **不要**改成左上角的「＋」，也不要改用自定义 navigationBar（会丢掉系统返回，见 §5-R8）
- **验收**：安卓中等手势机型上，单手持机时拇指自然活动区间（屏幕下半部）至少能碰到主按钮边缘；如果够不到，就把刊头再压一压

---

### P0-4 · 向导「下一步」按钮必须固定位置

- **现象**：每切一屏，「下一步」按钮就晃一下/换个高度
- **根因**：它是内容流里的普通元素（`wizard.wxml:198`），位置 = 上方内容总高。6 个步骤内容高度各不相同（第 ① 步有日期卡、第 ⑥ 步有整份清单预览），按钮自然上下跳。第 ⑥ 步还要滚很久才能到底部才见到按钮。
- **改法**：抽成**固定在视口底部的安全区底栏**
  ```css
  .wiz-foot {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 900;  /* 必须 < tabBar 的 1000 */
    padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
    background: rgba(233, 230, 223, 0.92);   /* 用 --bg，不要半透明玻璃：安卓 backdrop-filter 大概率不支持 */
    border-top: 1rpx solid var(--hairline);
  }
  ```
  1. `wizard.wxml` 把底部的两块（`wx:if step!==total` 的主按钮 + `wx:else` 的双按钮）移进 `.wiz-foot`
  2. `.page` 追加 `padding-bottom: calc(240rpx + env(safe-area-inset-bottom))`，给底栏留位，**否则最后一个分组会被永久挡住**
  3. 第 ⑥ 步两个按钮（保存 / 返回修改）在底栏内**纵向并排**：主按钮在上，`返回修改` 在下并降到次要样式，垂直间距 16rpx
  4. 按钮文案、图标、**第 ① 步显示「开始」其余显示「下一步」的逻辑一律不变**（`tests/acceptance.test.ts` 有断言盯着）
- **验收**：快速连点「下一步」走完全流程，按钮**在屏幕上纹丝不动**；到底不是满屏内容窗口能被底栏遮挡
- **回归面**：`tests/acceptance.test.ts` 里有针对 wizard 的静态文案断言，改模板时别删错字符串

---

### P0-5 · 「删除这次入住」重做（三个 stage 共用，务必做扎实）

- **现象**：① 右侧溢出 ② 和上方的 `.think` 卡片边缘贴死/重叠 ③ 太虚弱看不出是按钮 ④ 准备/入住/退房三屏都有，观感混乱
- **根因**：
  - 溢出 → P0-1
  - 重叠 → `.think { margin-top: 28rpx }` 有上间距，但**删除按钮自己完全没有 `margin-top`**（对比 wizard 里 `.btn-plain { margin-top: 20rpx }` 是有的，stay 页漏了），且 `.btn.plain` 是 `background: none` + 极淡边框，视觉几乎融进背景
  - 三屏都有 → `stay.wxml:97` 的按钮写在两个 `<block wx:if/wx:else>` **之外**，所以三个 stage 都会渲染
- **改法**：
  1. 保留「三个 stage 共用」的结构（这是合理的：删除针对的是整次入住，不属于某个阶段），但把它做成**独立的危险区**：
     ```css
     .danger-zone {
       margin-top: 48rpx;                /* 与上方卡片彻底拉开 */
       padding-top: 32rpx;
       border-top: 1rpx dashed rgba(178, 58, 50, 0.25);
     }
     .danger-btn {
       min-height: 96rpx;                /* 危险操作也要达标 */
       border: 2rpx solid rgba(178, 58, 50, 0.35);
       background: rgba(178, 58, 50, 0.06);
       color: var(--red);
       font-weight: 650;
     }
     ```
  2. 上方补一行说明文字：`删除后不可恢复（含清单勾选记录）`，`.tiny muted`
  3. 图标用现有 `trash`，**不要用纯色调过淡的 tone**
- **验收**：三屏底部都一致、不溢出、不与上方卡片粘连、一眼能认出是「危险按钮」

---

### P0-6 · 自定义确认弹窗，替代 `wx.showModal`

- **现象**：删除弹出来的是微信系统弹窗，跟项目色调（米白 + 松绿 + 古铜金）不一致
- **现状**：3 处在用原生——`stay.ts:301`（删除入住）、`home.ts:126`（导入覆盖）、`gear.ts:162`（删除/恢复好物）
- **改法**：新建 `miniprogram/components/modal/`，做成自绘浮层组件

  ```wxml
  <!-- modal.wxml 骨架 -->
  <view wx:if="{{show}}" class="mask" bindtap="onCancel" catchtouchmove="noop">
    <view class="dialog glass" catchtap="noop">
      <view class="dlg-title">{{title}}</view>
      <view class="dlg-body">{{content}}</view>
      <view class="dlg-foot">
        <view class="btn plain" bindtap="onCancel">{{cancelText}}</view>
        <view class="btn {{danger ? 'btn-danger' : ''}}" bindtap="onConfirm">{{confirmText}}</view>
      </view>
    </view>
  </view>
  ```
  - 配色走现有令牌：`.glass` 卡 + `--ink` 标题 + `--red` 危险主按钮
  - `z-index: 1100`（**必须 > tabBar 的 1000**，否则被胶囊导航压住）
  - 危险操作的确认按钮用 `--red` 实底，取消用 `.plain`
  - 用组件事件 `bind:confirm` / `bind:cancel` 取代原来 `wx.showModal` 的 `success` 回调，**调用处的业务分支逻辑一个字都别改**

- **雷点（重要，见 §5-R3）**：`catchtouchmove` 必须绑定**一个真实存在的空方法**，不要写 `catchtouchmove="false"` 或 `"return false"`
- **验收**：三处弹窗均出现自定义样式；弹窗出现时**背景列表无法滑动**；点遮罩 = 取消；动画建议 200ms 缩放淡入（`transform: scale()`，**不要**用 `wx.createAnimation`，CSS transition 更稳）

---

### P1-1 · 一键返回顶部

- **适用页**：行程页准备清单（`stay`）为主；知识库页内容长，一并加
- **前提**：这两页目前是**页面级滚动**（`app.json` 未做特殊配置），所以可以用 `wx.pageScrollTo`。⚠️ **绝不能改成 `<scroll-view>` 包整页**，改了吸顶和回顶一起失效（§5-R1）
- **改法**：
  ```ts
  // stay.ts —— 已存在空的 onPageScroll()，把实现填进去
  onPageScroll(e: WechatMiniprogram.Page.IPageScrollOption) {
    const show = e.scrollTop > 600;              // 阈值用 rpx 折算或直接取系统值，别写死 px
    if (show !== this.data.showGoTop) this.setData({ showGoTop: show });  // 只在翻转时 setData
  },
  goTop() {
    wx.pageScrollTo({ scrollTop: 0, duration: 300 });
  },
  ```
  ```css
  .gotop {
    position: fixed;
    right: 32rpx;
    bottom: calc(180rpx + env(safe-area-inset-bottom));  /* 必须抬到悬浮 tabBar 之上 */
    width: 96rpx; height: 96rpx;
    border-radius: 50%;
    z-index: 950;                                 /* < tabBar 1000，但 > 内容 */
    background: rgba(255, 255, 255, 0.92);        /* 实色，别依赖 backdrop-filter */
    border: 1rpx solid var(--glass-border);
    box-shadow: 0 10rpx 28rpx -12rpx rgba(28, 45, 38, 0.35);
  }
  ```
- **细节**：`onPageScroll` 是**每帧触发**的高频回调，绝不能在里面无条件 `setData` 大对象，只做上面的布尔翻转判断（本项目 `stay.ts:92` 的 `onPageScroll` 现在是空实现，正好补）
- **验收**：滚动超过一屏出现，点击 300ms 平滑到顶，回顶后自动消失，不与底部 tabBar 重叠

---

### P1-2 · 三段页签（准备 / 入住 / 退房）吸顶

- **现象**：往下翻一会儿就看不到切换开关了
- **前提澄清（非常重要）**：`.seg`（`stay.wxml:25-33`）是**页面内的一个普通容器**，不是系统导航栏。所以：
  - **不要** `navigationStyle: custom`（会丢掉系统返回和胶囊，见 §5-R12）
  - 保持在页面内做 sticky 即可
- **改法**：
  ```css
  .seg {
    position: -webkit-sticky;   /* 兼容老基础库 */
    position: sticky;
    top: 0;                      /* 页面坐标系里 top:0 就是紧贴导航栏下沿，不用算导航栏高度 */
    z-index: 800;
    padding: 12rpx 6rpx;         /* 补背景上下留白 */
    background: var(--bg);       /* 必须给不透明背景，否则滚动时内容会透过来 */
  }
  ```
- **雷点**：**它的所有祖先都不能有 `overflow: hidden / auto`**，否则 sticky 直接失效（§5-R2）。stay 页当前没有，改的时候别顺手加
- **验收**：准备清单滚到底部时页签始终可见，且**不会有内容从页签边缘透出来**

---

### P1-3 · 分组标题吸顶 + 折叠展开

- **需求**：滚动时「洗漱」「衣物」这类分组标题吸顶；标题右侧加折叠箭头，点一下收起该组

- **改法（结构改造，同时满足 P1-4）**，把现在的「标题 + 卡片」两段结构升级成「可折叠分组」：
  ```wxml
  <!-- stay.wxml 准备阶段改造后 -->
  <view wx:for="{{groups}}" wx:for-item="g" wx:for-index="gi" wx:key="cat" class="grp">
    <view class="grp-head" data-gi="{{gi}}" bindtap="toggleGroup" hover-class="hv">
      <text class="grow">{{g.cat}}</text>
      <text class="grp-cnt">{{g.done}}/{{g.total}}</text>
      <icon name="chevron-down" size="30" tone="k" class="grp-arrow {{g.collapsed ? 'rot' : ''}}" />
    </view>
    <view class="glass card" wx:if="{{!g.collapsed}}">
      <item-row ... />
    </view>
  </view>
  ```
  ```css
  .grp-head {
    position: -webkit-sticky; position: sticky;
    top: 108rpx;                 /* = .seg 实际高度（含新增 padding），务必在真机量一次再填 */
    z-index: 700;
    display: flex; align-items: center;
    min-height: 88rpx;           /* 满足触摸目标 */
    padding: 0 8rpx;
    background: var(--bg);       /* 不透明，防止内容穿透 */
  }
  ```
- **关键细节**：
  1. `top` 必须**等于上方 P1-2 页签的实际高度**，否则两组 sticky 会打架覆盖。先做 P1-2，量出 `.seg` 真实高度（px）×2 转 rpx 再填
  2. sticky 元素**撑满父容器宽度**，背景必须不透明
  3. 折叠状态 `g.collapsed` 存在 `this.data.groups[gi]` 上，用**路径 setData** 更新：`this.setData({ ['groups[' + gi + '].collapsed']: !cur })`，**不要**整份 groups 回传（§5-R6）
  4. 折叠状态**要不要持久化**：建议存进 `core/store.ts` 之外的 UI 层 storage key（不要塞进 Stay 数据，否则会破坏与源项目的数据一致性）
  5. 默认全部展开；至少保留分组的**进度计数**在标题上，收起时也能看到备齐情况

- **验收**：滚过「洗漱」时它停住不动；继续滚到「衣物」时「洗漱」被顶走、「衣物」接棒；折叠箭头有 180° 旋转过渡；收起后再展开内容完好、勾选状态不丢

---

### P1-4 · 物品名称必须一行显示

- **现象**：衣物里的「密封袋」「脏衣袋」「脏衣分装」会折行，观感差
- **根因**：`item-row.wxml` 一行横向塞了 **5 样东西**——勾选圈(44) + gap(18) + 名称区(flex:1) + gap + 数量步进器 + gap + 删除图标，名称可用宽度被压到很少：
  ```
  卡片可用宽 = 750 - 64(page) - 72(card) = 614rpx
  勾选圈 44 + gap 18 + 步进器(约 180rpx) + gap 18 + 删除 40 + gap 18 = 318rpx
  名称可用宽 ≈ 614 - 318 = 296rpx    ← 「密封袋」30rpx×3 字 = 90rpx 其实够
  ```
  所以真正导致折行的多半不是名称本身，而是：① `.meta` 行内还有「使用人下拉 + 状态标签 + 好物入口」三个小控件，`flex-wrap: wrap` 把它们挤到下一行；② 多人行程时 `.assign-in` 文案（如「所有人 / 儿童1」）较长，把整行撑高
- **改法**：
  1. **名称独占一行，禁止折行**：`.name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`，同时把字号 `30rpx → 29rpx`、右侧留白留足
  2. **`.meta` 第二行的三个小控件做减法**：
     - 「好物入口」的文案（现 `.gearbtn`）缩短为「挑好物」或直接改成图标按钮
     - 「使用人下拉」的 `opts` 文案控制在 4 字以内
     - 状态标签保持胶囊不变
  3. **兜底策略**：若某项组合仍会挤出第二行，允许 `.meta` 保留 `flex-wrap: wrap`，但**名称那一行永远 nowrap**
  4. 步进器：`components/stepper/stepper.wxss` 若宽度靠横向 Padding 算出来的，同步按 P0-1 的乙方案处理
- **验收**：真机上逐组看清单，**没有任何一项名称出现第二行**；多人行程（3 人及以上）下依然成立

---

### P2-1 · 知识库模块级折叠

- **现象**：11 个模块 44 条全摊开，视觉上太满
- **现状**：`knowledge.wxml:57-83` 已有**条目级**折叠（`k.open` 驱动），但缺**模块级**折叠
- **改法**：
  1. 给 `modules[mi]` 增加 `open` 字段（默认 **false**，进来只看到 11 个模块目录）
  2. 模块标题 `.sec-label.sec-flex`（`knowledge.wxml:55`）改成可点行：`点击行数 · 模块名 · 条数 · 右侧 chevron`
  3. 支持三种展开：① 默认全收起 ② 点击手风琴式单选展开 ③ 从行程页跳转过来时（`setNav({knowModule})`）自动展开目标模块并滚动定位
  4. 免责声明（`.disclaimer`）与等级图例（`.legend`）**保持常驻不可折叠**——这是 `04`/`06` 规格的硬要求，别顺手折了
  5. 展开/收起用 `wx:if` 直接切换即可，**不要**做高度动画（44 条富文本内容，高度动画在安卓会掉帧）
- **验收**：首屏只看得见免责 + 图例 + 11 个模块目录，总高度不超过 3 屏；从 knowledge 跳转进来的模块自动展开

---

### P2-2 · 数据云同步（⚠️ 需老板先拍板，先不要动代码）

- **需求**：换手机 / 在电脑微信上也能看到原来数据
- **现状**：`core/platform.ts` 注入 wx storage，**纯本机**。导出只能走剪贴板（`FileSystemManager.writeFile` 只能写 `wx.env.USER_DATA_PATH` 内，用户取不出来；`wx.shareFileMessage` 要把数据转发到微信会话，与「数据不出本机」的承诺冲突）

#### 三个候选方案

| 方案 | 怎么做 | 优点 | 代价 / 风险 | 结论 |
|---|---|---|---|---|
| **A · 微信云开发**（推荐） | `wx.cloud.init` + 云数据库集合 | 免域名、免备案、免自建鉴权、免费额度对个人小工具足够；**同一微信号在同一 AppID 下 OPENID 恒定**，安卓/iOS/PC 微信三端天然同一份数据；不需要用户注册登录 | 属于「联网」，要更新隐私指引；要看 [§5-R14](#雷区清单) 的权限坑 | ✅ 推荐 |
| B · 第三方后端（WorkBuddy 云 / Supabase 等） | 需自定义域名 + request 合法域名白名单 | 自由度高 | **域名需 ICP 备案**，个人主体折腾成本高；还得自建账号体系 | ❌ 不推荐 |
| C · 加强剪贴板导出 | 优化导出流程与引导 | 零网络、零合规负担 | 换设备要手动搬运，不算"同步" | 🔶 保留作为兜底逃生舱 |

#### 若采用方案 A，请严格遵守以下设计

1. **鉴权**：云函数里用 `cloud.getWXContext().OPENID` 作用户标识。**不要调 `wx.login`、不要索要手机号、不要 `getUserProfile`** —— 这样用户无感，也最省合规成本
2. **集合权限是最大的坑**（§5-R14）：新建集合默认是「仅管理端可读写」，**小程序端直接读不到**。必须改成「仅创建者可读写」，每条记录自动带 `_openid`
3. **离线优先**：本地 storage 仍是主数据源，云只是同步层。云不可用时**静默降级**，只在备份区显示一个「尚未同步」的状态点，**不要弹窗打断**
4. **数据模型**：按 `Stay` / `Gear` / `CheckState` 三张集合拆，字段复用 `core/types.ts` 的定义，**不要**把整份 `exportData()` 的 JSON 当 blob 塞一个字段（那样无法增量同步，也不可恢复单条）
5. **合并策略**（多设备必然冲突）：每条记录带 `updatedAt`，采用 **last-write-wins + 墓碑软删除**（删除时写 `deleted: true` 不物理删），避免出现「旧手机把云端新数据覆盖回去」
6. **隐私合规**：启用同步后必须在 mp 后台补充更新《用户隐私保护指引》，并在首页把「数据只保存在本机 · 不上传、不联网」这句**改成对应的新文案**（现有文案在 `home.wxml:78`，改了别忘了同步更新 `tests/acceptance.test.ts` 里的静态文案断言，否则会挂）
7. **逃生舱保留**：开放同步的同时，剪贴板导出/导入**必须保留**，且 UI 上说明清楚区别

---

## 4. 微信小程序开发注意事项

### 4.1 单位与适配

- **rpx**：`750rpx = 屏宽`，唯一推荐单位。**不要用 px**（不缩放）、**不要用 vw/vh**（`WXSS` 不支持）、**不要用 rem**
- **安全区**：底部一律 `env(safe-area-inset-bottom)`，老 iOS 需再写一条 `constant(safe-area-inset-bottom)` 兜底
  本项目首页已用：`padding-bottom: calc(200rpx + env(safe-area-inset-bottom))`
- **安卓机型碎片化**：20:9 长屏、挖孔、曲面边缘都要考虑。**凡是 fixed 到底部的元素，都必须加安全区**，否则会被手势条吞掉
- 触摸目标尺寸换算：**44pt ≈ 88rpx**，本项目取 ≥ 96rpx

### 4.2 滚动模型（本轮改动的核心）

- 小程序页面**默认就是页面级滚动**，不要自己套 `<scroll-view>` 包全页（§5-R1）
- 只有页面级滚动，以下 API/能力才生效：`wx.pageScrollTo`、`onPageScroll`、`position: sticky`
- `scroll-view` 组件只适合做局部滚动（如横向 chips）（如横向 chips），且一旦使用，内部的 sticky/fixed 行为会异常

### 4.3 定位相关

- `position: fixed` 推荐使用，但注意：
  - **被键盘顶开**：安卓上输入法弹起时，fixed 底栏位置会飘。解决方案：input 保持默认 `adjust-position: true` 让系统推页面，或监听 `bindkeyboardheightchange` 手动位移
  - **层级**：本项目 tabBar 是 `z-index: 1000`。普通浮层建议：**吸顶 700–800、固定底栏 900、回到顶部 950、模态 1100**
- `position: sticky` 使用条件（苛刻，缺一不可）：
  1. 所有**祖先**元素都不能有 `overflow: hidden/auto/scroll`
  2. 父容器高度 > sticky 元素高度
  3. 必须给 `background`（不透明）
  4. 写 `-webkit-sticky` 兜底
  5. `top` 值 0 表示紧贴可视区顶部（页面坐标系里已在导航栏下方，**不需要**自己算导航栏高度，这点跟 Web 不一样）

### 4.4 WXSS 是 CSS 的子集（不支持的写法）

| 不支持 | 替代方案 |
|---|---|
| `:root {}` | 写在 `page {}` 上（本项目已这么做） |
| `*` 通配符 | 写显式元素列表 |
| `vw / vh / rem / calc` 之外的复杂单位 | 用 rpx + flex |
| 大部分伪类（`:hover`、`:first-child`） | 用 `hover-class` 或 JS 计算 class |
| CSS 变量写在 `:root` | 写在 `page {}`（本项目令牌已在此） |
| 动画靠 class 名切换重播 | **两个 keyframes 名交替**（本项目 M6 已用此手法：pulse-a / pulse-b） |

### 4.5 WXML 表达式限制（本项目已踩 3 次）

- 属性值里**禁止裸 `<`**：`wx:if="{{a < b}}"` ❌ → 在 ts 里算成 `{{aLtB}}` ✅
- 属性值里**禁止 `&&`**：`wx:if="{{a && b}}"` ❌ → 在 ts 里算成 `{{aAndB}}` ✅
- 不支持复杂运算和方法调用，只能在数据里预置
- 本项目因这个限制白屏过 3 次：改完模板后务必跑一遍 §7 的自检脚本

### 4.6 组件样式隔离

- 自定义组件的样式**默认隔离**：在 `pages/stay/stay.wxss` 里写 `.row` 改不到 `item-row` 组件内部
- 需要父影响子时，在 `components/xxx/xxx.json` 里加 `"styleIsolation": "apply-shared"`
- **建议**：改 `item-row` 就直接在 `item-row.wxss` 里改，不要跨组件打补丁

### 4.7 setData 性能

- 单次 `setData` 数据上限 **256 KB**，且 JSON 序列化有开销
- 长列表（准备清单有 40+ 行）**必须用路径更新**：
  ```ts
  this.setData({ ['groups[' + gi + '].items[' + ii + '].done']: value });   // ✅
  this.setData({ groups: entireNewArray });                                  // ❌ 卡顿
  ```
- `onPageScroll` 每帧触发，**只做布尔翻转判断**，禁止在其中构造大对象

---

## 5. 雷区清单

> 每一条都是本项目已经踩过，或改动本轮需求时**极容易踩**的坑。

| # | 雷 | 后果 | 正确做法 |
|---|---|---|---|
| **R1** | 用 `<scroll-view>` 包整页做滚动 | `position: sticky`、`wx.pageScrollTo`、`onPageScroll` **全部失效**；安卓失去回弹手感；P1-1/P1-2/P1-3 三个需求全废 | 保持页面级滚动，不要用 scroll-view 包全页 |
| **R2** | sticky 元素的祖先有 `overflow: hidden` | sticky **静默失效**，且不报错，很难排查 | 改造前先 `grep -rn "overflow" pages/stay/` 确认祖先链干净 |
| **R3** | 遮罩层写 `catchtouchmove="false"` / `"return false"` | 部分真机不生效或不识别，背景照样跟着滑 | 绑定一个**真实存在的空方法**：`catchtouchmove="noop"`，并在 ts 里 `noop() {}` |
| **R4** | 改了 `core/types.ts`、`data.ts`、`engine.ts` | 违背移植硬约束，diff 非零 | 三个文件**一字不动**。要改业务逻辑，在页面/组件层做适配 |
| **R5** | WXML 里出现裸 `<` 或 `&&` | 页面**白屏编译错误** | 一律提前在 `.ts` 算布尔值 |
| **R6** | 折叠/勾选时用整份数组 `setData` | 40+ 行列表安卓明显卡顿 | 用数据路径 `setData` |
| **R7** | 引入第三方 UI 库 / CDN / iconfont.ttf | 违反零网络约束，且 CDN 字体在小程序里基本加载不出来 | 图标继续用 `tools/gen-icons.py`（SVG→base64 内联），改完重新生成 `icon.wxss` |
| **R8** | `navigationStyle: custom` 做顶部导航 | 丢掉系统返回按钮、安卓物理返回失效、胶囊位置要自己算 | P1-2 用**页面内 sticky**，不要用自定义导航栏 |
| **R9** | 删掉 `app.json` 的 `"tabBar.custom": true` | 悬浮胶囊 tabBar 消失，但各页面 `padding-bottom: 200rpx` 还在，底部出现大片空白 | 除非明确要退回原生 tabBar，否则保留；退回时**同步调整**所有页面的底部留白 |
| **R10** | `new Date('2026-10-02')` 这种写法 | iOS 上得到 `Invalid Date` | 用 `new Date(2026, 9, 2)`，本项目 `core/store.ts` 已有正确实现，沿用即可 |
| **R11** | 浮动元素的 `z-index` 低于 1000 | 被悬浮胶囊 tabBar 压住，回顶部按钮点不到 | tabBar=1000，浮动 UX ≥ 950 但要错位避让；模态 1100 |
| **R12** | 继续用 `wx.showModal` | 视觉割裂（本项目色调 ∞ 微信系统弹窗） | 全部换成 `components/modal`（P0-6） |
| **R13** | 修改 `.btn` 后只验收一个页面 | `.btn` 是全局类，影响 4 页 11 处 | 改完**必须**首页/向导/行程/好物四页全跑一遍 |
| **R14** | 云开发集合忘了改权限 | 默认「仅管理端可读写」，**小程序端读不到数据，也不报错**，只返回空 | 必须改成「仅创建者可读写」 |
| **R15** | 用 `<cover-view>` 做普通弹窗 | 它是专门盖在原生组件（video/map）上的，层级和事件模型都特殊 | 普通 `view` + `position: fixed` 就够 |
| **R16** | 删了知识库里的免责声明/图例 | 违反 `04`/`06` 规格硬要求（它们明确规定不可折叠、不可精简） | P2-1 折叠只作用于 11 个模块区域 |
| **R17** | 忘了同步更新 `tests/acceptance.test.ts` 的静态文案断言 | 改了 UI 文案 → 测试红 → 误判成回滚 | 凡是动了被断言的文案（如首页那句存储声明），同步改测试文件 |
| **R18** | 顺手启用 `darkmode: true` | 本项目全套浅色令牌，**深色模式下文字会不可读** | 保持 `darkmode: false` |
| **R19** | 用了禁用词（绝对不要/万能/百分百/根治/神物/硬核…） | 违反内容红线 | 详见 `04-内容资产清单.md` §6.1，改完用下面的脚本扫一遍 |
| **R20** | 给折叠加 CSS 高度过渡动画 | 44 条富文本内容做高度动画，安卓明显掉帧 | 折叠用 `wx:if` 直接切，最多给箭头加 180° 旋转过渡 |

---

## 6. 执行顺序建议

严格按序做，前一步是后一步的地基：

```
① P0-1（删 width:100% + border-box 兜底）   ← 先做这个，很可能解决半数溢出
② 真机复测一遍所有按钮，把「仍然溢出 / 溢出量变了」的记下来
③ P0-2 触摸目标达标
④ P0-4 向导底栏固定      ← 会影响 P1-2/P1-3 的布局基准
⑤ P0-5 删除按钮重做
⑥ P0-6 自定义弹窗组件
⑦ P1-2 三段页签吸顶      ← 做完先量出实际高度，供 P1-3 用
⑧ P1-3 分组吸顶 + 折叠
⑨ P1-1 回到顶部         ← 依赖⑦⑧稳定后确定避让位置
⑩ P1-4 名称一行显示
⑪ P2-1 知识库模块折叠
⑫ P2-2 云同步（待老板拍板后再开始）
```

**第二批追加项**（详见 §10，编号沿用上面的体系，可直接插进上面的序列）：

```
插在 ① 之后、② 之前：
  P0-7 快捷日期 2×2 排版 + 配色（§10.5）  ← 同为 content-box 家族，和 P0-1 一起改最省事
插在 ③ 之后：
  P0-8 人数按钮 Math.max bug（§10.1）     ← 纯页面层，改 1 行，收益极高
  P1-5 同行人员按人数分支（§10.2）         ← 依赖 P0-8 先修好，否则人数都改不动无法测
最后：
  P2-3 加「情侣/朋友」场景（§10.3）        ⚠️ 动红线，等老板选方案
  P2-4 补清单物品（§10.4）                 ⚠️ 动红线，等老板选方案
```

⚠️ **红线提示**：P2-3 / P2-4 会改到 `core/data.ts`、`core/types.ts`，**必须先拿到 §9-5 的老板决策**才能动手。
其余四条（P0-7、P0-8、P1-5、以及 §10.5 附带提到的 `.chip` 描边统一）**全部在 UI 层，红线干净，可以立即开工**。

每一步之间**跑一次下面的自检**，不要堆到最后一起验。

---

## 7. 每步的自检脚本（改完必修 —— 直接复制执行）

```bash
cd D:/hotel-miniprogram

# 1) 测试必须同为 87 passed
npm test

# 2) 类型检查（小程序 + tests 两份）
npm run typecheck
npm run typecheck:test

# 3) 逻辑层零差异（三条命令必须全部无输出）
npm run diff:types && npm run diff:data && npm run diff:engine && echo "零差异 OK"
```

```bash
# 4) WXML 结构合法性 + 禁止裸 < 和 &&
cd D:/hotel-miniprogram && python -c "
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
```

```bash
# 5) JSON 全部可解析
cd D:/hotel-miniprogram && python -c "
import json, glob
bad = 0
for f in glob.glob('miniprogram/**/*.json', recursive=True):
    if 'tsconfig' in f: continue
    try: json.load(open(f, encoding='utf-8'))
    except Exception as e: bad += 1; print('FAIL', f, e)
print('JSON bad =', bad)
"

# 6) 合规：零网络 / 零登录 / 零埋点 / 零云开发
grep -rnE 'wx\.request|wx\.cloud|wx\.login|wx\.getUserInfo|wx\.getUserProfile|fetch\(|XMLHttpRequest' \
  miniprogram --include=*.ts --include=*.wxml    # 应无输出（做云同步前）

# 7) 禁用词
grep -rnE '绝对不要|坚决不用|千万别|无脑|必用|万能|百分百|根治|神物|硬核' \
  miniprogram/pages miniprogram/components miniprogram/custom-tab-bar   # 应无输出

# 8) 图标 class 是否缺失（改了图标后必跑）
cd D:/hotel-miniprogram && python -c "
import re, glob
wxss = open('miniprogram/icon.wxss', encoding='utf-8').read()
have = set(re.findall(r'^\.(ic-[a-z0-9-]+)', wxss, re.M))
used = set()
for f in glob.glob('miniprogram/**/*.wxml', recursive=True):
    s = open(f, encoding='utf-8').read()
    for m in re.finditer(r'<icon[^>]*name=\"([a-z0-9-]+)\"[^>]*>', s):
        t = re.search(r'tone=\"([a-z])\"', m.group(0))
        used.add('ic-' + m.group(1) + ('-' + t.group(1) if t else ''))
print('缺失:', sorted(used - have))
"

# 9) 包体积不得超 2MB
du -sh miniprogram
```

---

## 8. 必须人工/真机验证的部分（node 环境测不出来）

以下 6 项**不要写假断言假装通过**，请在安卓真机上逐条目视确认：

| # | 项目 | 怎么验 |
|---|---|---|
| 1 | 所有按钮右侧不再溢出 | 逐个页面看右侧留白是否均匀 32rpx |
| 2 | 「下一步」底栏固定不跳 | 快速连点走完 6 步，按钮位置纹丝不动 |
| 3 | 吸顶行为正确 | 页签、分组标题两级吸顶不互相覆盖、背景不透视 |
| 4 | 名称不折行 | 3 人及以上行程下，逐组清单确认无第二行 |
| 5 | 自绘弹窗与 tabBar 不打架 | 弹窗高于胶囊导航，背景不可滑动 |
| 6 | 回到顶部不与 tabBar 重叠 | 悬浮圆钮完整显示在胶囊导航**上方** |

---

## 9. 待老板决策的事项

1. **P2-2 是否做云同步**：做 → 选方案 A（微信云开发）；不做 → 保留剪贴板导出
2. **若做云同步**：首页现有的「数据只保存在本机 · 不上传、不联网」文案需要改写，**这需要你确认新文案**，且 mp 后台隐私指引要同步更新
3. **P1-3 折叠状态是否跨会话记住**：默认采用「记住」（存在 UI 层 storage，不进 Stay 数据），若要改成每次进来全展开请说明
4. **`.btn` 全局改动是否接受**：消灭溢出必须动这个全局类，代价是 4 个页面都要重新目视回归
5. **【第二批】是否允许打破「逻辑层零差异」红线**：处理 P0-7 / P1-5 / P2-3 / P2-4 时，都要给清单加物品或加新的住宿场景，这必然会改到 `core/data.ts` 和 `core/types.ts` 这两个**红线文件**。请在 §10.6 的三个方案里选一个，我推荐**方案③（自研扩展层）**
6. **【第二批】敏感类目物品是否加入**：「安全套」「情趣用品」属于提审敏感内容，建议按 §10.4 的**中性化处理**方案执行，或明确不加入
7. **【第三批】加不加「我的」页**：建议**加**，采用 §11.3 的方案 A（四 tab 并排，放最右）。已核算每个 tab 仍有 210rpx，挤不下的问题不存在。它真正的紧迫性取决于——**只要做云同步、或要过提审（隐私政策没地方放），它就是必选项；两者都不做则可以缓**
8. **【第三批】加物品/加场景的红线怎么处理**：§10.3 的新关系选项、§10.4 的物品补充、§11.2 的 8 条新物品 +「学习」分类，**这三类需求都要碰到 `core/data.ts` 或 `core/types.ts`**。我的建议是：**别分批打补丁，一次性在同一个「自研扩展层 `core/extra.ts`」（§10.6 方案③）里做完**，红线保持纯净，将来也能整块卸载

---

## 10. 第二批反馈排查结论（追加）

> 老板反馈后我逐条查了代码，**下面每一个问题都真实存在**，没有一个是错觉。
> 但其中两个（人数按钮、快捷日期排版）的根因，和第一批的 P0-1 是**同一个家族**——content-box 盒模型。

### 10.0 结论速览

| # | 反馈 | 是否属实 | 根因 | 是否触及红线 |
|---|---|---|---|---|
| 1 | 人数按钮失效 | ✅ **真 bug**（源项目遗留） | `Math.max` 导致人数只增不减 | ❌ 否，在 UI 层 |
| 2 | 1 人还问儿童/老人 | ✅ **真缺陷** | step3 无条件渲染，不看人数 | ❌ 否，在 UI 层 |
| 3 | 缺「情侣/朋友」场景 | ✅ **确实没有** | `purposes` 只有 4 个选项 | ⚠️ **是**，动 `types.ts` |
| 4 | 缺物品（烧水壶等） | ⚠️ **部分属实** | 毛巾/浴巾/拖鞋**都已有**；烧水壶等 4 类确实没有 | ⚠️ **是**，动 `data.ts` |
| 5 | 日期按钮排版差 | ✅ **真 bug** | 又是 content-box，2 列变 1 列 | ❌ 否，在 WXSS |
| 6 | 日期按钮颜色不清 | ✅ **真 bug** | 描边用了白色高光令牌，白底＋白边 | ❌ 否，在 WXSS |

---

### 10.1 · 人数按钮「按不下去」—— 确认是 bug，源头在源项目

**复现路径**（与老板描述完全一致）：

```
初始 adults = 1
点「2 人」  → Math.max(1, 2) = 2   ✅ 生效
下一步到第 ③ 步，再返回第 ② 步
点「1 人」  → Math.max(2, 1) = 2   ❌ 值没变，按钮看起来"按不动"
初次就点「1 人」→ Math.max(1, 1) = 1  ✅ 所以第一次能用
```

**代码定位**：

```ts
// miniprogram/pages/wizard/wizard.ts:162-165
setAdults(e: WechatMiniprogram.TouchEvent) {
  const n = Number(e.currentTarget.dataset.n);
  this.setDraft({ adults: Math.max(this.data.draft.adults, n) });   // ← BUG
},
```
```vue
<!-- 源 D:/hotel/src/components/WizardView.vue:147（一模一样的写法） -->
@click="draft.adults = Math.max(draft.adults, n)"
```

**根因**：`Math.max(当前值, 点击值)` 让人数**只能升不能降**。

**连带后果**（比老板发现的还严重）：
- 一旦在第 ② 步把人数调到 `5`（走「3 人及以上」的步进器），此后点「2 人」「1 人」都回不去，永远卡在 5
- `wizard.wxml:50` 的高亮条件是 `draft.adults >= 3 ? 'on'`，所以即使点了「1 人」，高亮还赖在「3 人及以上」上，视觉上更像"按钮没反应"

**红线判定**：✅ **可以改**。这段代码在**页面层**（`pages/wizard/wizard.ts`）和源项目的 `WizardView.vue`（同样是 UI 层），**不在** `core/types.ts`、`data.ts`、`engine.ts` 三条红线内。改它不影响 `diff:xxx` 三条命令。

**改法**：
```ts
setAdults(e: WechatMiniprogram.TouchEvent) {
  const n = Number(e.currentTarget.dataset.n);
  this.setDraft({ adults: n });          // 直接赋值，允许降
},
```
顺带修 `wizard.wxml:50` 的高亮条件——现在写成 `draft.adults >= 3`，但点「3 人及以上」时 draft.adults 仍是 3，逻辑自洽；如果之后人数被改成 5，需要保持高亮，这点**保持不变即可**。

**一个必须注意的副作用**：原注释写着「内部保存真实人数（4 人就是 4），不允许压缩成 3（源项目修复过的缺陷，外部评审 §16）」。这条约束针对的是**步进器把 4 压回 3** 的情况，改 `setAdults` 不影响它——因为用户手点「3 人及以上」时我们仍然写的是 `3`，真实人数由步进器决定。**改完请重点复测：调到 5 人 → 点「2 人」→ 应变回 2 且步进器隐藏。**

**验收**：
1. 初始 1 → 点 2 → 回退点 1，人数变回 1，高亮跟着走 ✅
2. 调到 5 → 点「1 人」，直接变 1，步进器消失 ✅
3. 点「3 人及以上」→ 步进器出现且值为 3 → 保持原样 ✅

---

### 10.2 · 1 人住还问「是否有儿童/老人」—— 确认是逻辑缺陷

**现状**：`pages/wizard/wizard.wxml:63-95`，第 ③ 步整个 block **没有任何人数判断**，无论 `adults` 是 1 还是 10，都照问：
- 「儿童」步进器
- 「有老人同行」开关
- 「有宠物同行」开关

老板说得对：**1 个人入住还问带不带儿童，逻辑上说不通。**

**建议的分支逻辑**（= P1-5，请在 UI 层实现）：

| 人数 | 第 ③ 步问什么 | 不显示什么 |
|---|---|---|
| **= 1 人** | 只保留「有宠物同行」+ 新增「这次出行主要是？」(可留空) | 隐藏儿童步进器、隐藏老人开关 |
| **= 2 人** | **同行关系**：情侣 / 家人 / 朋友 / 同事（单选）→ 决定第 ④ 步之后追加什么物品；再保留宠物开关 | 隐藏儿童步进器？（情侣场景不需要，家人/朋友场景保留） |
| **≥ 3 人** | 儿童步进器 + 年龄段 + 老人开关 + 宠物开关（保持现状） | — |

**红线判定**：✅ **可以改**，纯 UI 层分支渲染，`draft` 里的字段一个都不用动。

**验收**：1 人流程从第 ② 步下一步后，只看到宠物一行；切回 2 人/3 人时对应选项出现；**往回退再改人数，字段不会被残留**（改人数时要清掉不适用的字段，例如从 3 人改回 1 人，要把 `children=0 / elderly=false` 归零，否则清单里会莫名多出儿童用品）。⚠️ **这一点很容易漏，务必做。**

---

### 10.3 · 缺「情侣 / 朋友」住宿场景 —— 确实没有，且**这是本批唯一动到 types.ts 的需求**

**现状**：`pages/wizard/wizard.ts:82`
```ts
purposes: ['普通短住', '出差', '旅游', '探亲'] as Purpose[],
```

`Purpose` 是 `core/types.ts` 里定义的联合类型，`Stay.purpose` 用的也是它。**想加「情侣出行」「朋友同行」，必须改 `core/types.ts` → 撞红线。**

**三个方案**（对应 §10.6）：

| 方案 | 做法 | 代价 |
|---|---|---|
| ① 直接改 `core/types.ts` + `core/data.ts` | 加新 Purpose 字面量 | ❌ **打破零差异红线**，`diff:types` 会立刻报错，且源项目将来更新会冲突 |
| ② 复用现有值 | 把「探亲」改语义当「家人」用 | ❌ 语义错位，情侣/朋友表达不了 |
| ③ **自研扩展层**（推荐） | 新建 `core/relation.ts` 定义 `type Relation = '独自' \| '情侣' \| '家人' \| '朋友' \| '同事'`，存在独立的 `StayExt` 里（独立 storage key / 或 Stay 的一个可选扩展示例字段） | ✅ 红线干净，但需要多一层合并逻辑 + 我自己写测试 |

**推荐方案③**，理由：红线是整个移植项目的地基，为了两个场景选项去炸地基不值当；放扩展层将来还能干净地整块卸载。

---

### 10.4 · 清单物品核查 —— 逐条回答老板列的清单

我对 `core/data.ts` 全文 grep 了一遍，结果是**一半有、一半没有**：

| 老板提的物品 | 存在？ | 现有条目（data.ts 行号） |
|---|---|---|
| 毛巾 | ✅ **已有** | `:16` `towel` 毛巾/压缩毛巾，洗漱类，`when: () => true` 无条件加入 |
| 浴巾 | ✅ **已有** | `:20` `bath_towel` 速干浴巾，洗漱类，`prep: '可选'` |
| 拖鞋 | ✅ **已有** | `:17` `slippers` 拖鞋，洗漱类，无条件加入 |
| 烧水壶 | ❌ **没有** | 只有 `:69` `thermos` 恒温水壶，且限定 `children>0 && childAge==='0-3'`（婴儿冲奶用）。**成人场景的便携烧水壶确实缺失** |
| 安全套 | ❌ **没有** | 全库零命中 |
| 情趣用品 | ❌ **没有** | 全库零命中 |
| 棋牌类 | ❌ **没有** | 扑克/麻将/棋牌 全库零命中 |

补充发现：牙刷、牙膏、洗发、沐浴也**都有**（`:18-19` 附近），不存在缺失。

**分类归属建议**（若决定新增）：

| 新增物品 | 建议 cat | 建议触发条件 `when` | prep |
|---|---|---|---|
| 便携烧水壶 / 折叠电热水壶 | `补给` 或 `卫生` | `c.purpose === '探亲' \|\| c.purpose === '旅游'` 或做成偏好开关 「在意饮水」 | 可选 |
| 棋牌 / 便携桌游 | 新建 `娱乐` 类 | `relation === '朋友'`（走 §10.3 扩展层）或偏好开关 | 可选 |
| 安全套 | `健康` | `relation === '情侣'` | 可选（见下方敏感提示） |
| 情趣用品 | —— | 见下方敏感提示 | —— |

**⚠️ 敏感内容提示（重要，请老板看一眼）**：「安全套」「情趣用品」属于**小程序提审敏感内容**。类目选的是「工具→备忘录」，如果清单里大咧咧出现情趣用品，有被判定为「内容不符合所选类目」而驳回的风险。建议两种处理之一：
- **中性化**：只加「成人用品（按需自备）」一条概括项，`prep: '可选'`，不展开具体物品
- **交给用户自定义**：这类物品完全由用户在「还有只有你自己知道的东西」里自行添加，代码不预置

**红线判定**：加任何物品都要改 `core/data.ts` → **撞红线**。同样适用 §10.6 的三个方案，推荐**方案③**。

---

### 10.5 · 快捷日期 4 个按钮 —— 排版和配色都是**真 bug**

这是本次排查里第二个「同一个家族的坑」。

#### (a) 为什么变成一列竖排

```css
/* app.wxss:157-169 */
.qchip {
  min-height: 80rpx;
  padding: 0 8rpx;
  border: 2rpx solid var(--glass-border);
  background: rgba(255, 255, 255, 0.6);
}
/* wizard.wxss:96-99 */
.qchip { width: 48%; flex-shrink: 0; }
```

按 content-box 精确算：

```
.quickrow 可用宽 = 750 - 64(page) - 72(card padding) = 614rpx
.qchip 内容宽   = 614 × 48%                = 294.72rpx
.qchip 实际占位 = 294.72 + 16(padding) + 4(border) = 314.72rpx
两个 qchip       = 314.72×2 + 16(gap)      = 645.44rpx   >  614rpx  ❌
```

**一行塞不下两个**，`flex-wrap` 只能让第二个换行 → 结果是**一列 4 行**，每行右边空出 `614 - 314.72 ≈ 299rpx`（快半屏）的空白。这正是老板说的「靠左显示，非常不好看」。

#### (b) 为什么看不清

```
父卡片 .glass 背景   = rgba(255,255,255, 0.72)   ← 白
.qchip 背景         = rgba(255,255,255, 0.6)    ← 白
.qchip 描边         = var(--glass-border) = rgba(255,255,255, 0.65)  ← 也是白！
```

**三层白叠在一起**。根因是 `--glass-border` 这个令牌的本职工作是给玻璃卡片做「顶部高光边缘」，被误用在了需要对比度的 chip 描边上。（对比参考：普通 `.chip` 用的同一个令牌，但它多数时候不在白色玻璃卡内，所以没暴露问题。）

#### (c) 改法（P0-7）

```css
/* 排版：改成真正的 2×2，留出净 gap */
.quickrow {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin: 24rpx 0;
}
.qchip {
  width: calc(50% - 8rpx);      /* 50% 减去半个 gap，两个刚好填满一行 */
  flex-shrink: 0;
  box-sizing: border-box;       /* 关键：让 padding 和 border 算在宽度内 */
  justify-content: center;
}
```
> 如果想改成 4 列一行：`width: calc(25% - 12rpx)`（3 个 gap 共 48rpx / 4 = 12rpx）。但「自选日期」是 4 个字，4 列在窄屏会挤，**推荐保持 2×2**。

```css
/* 配色：描边换成有对比度的令牌，别再用高光色 */
.qchip {
  border: 2rpx solid var(--line);                 /* rgba(35,41,37,0.18)，比白边清楚得多 */
  background: rgba(255, 255, 255, 0.85);          /* 比卡片更实一点，浮出来 */
}
.qchip.on {
  border-color: var(--pine);
  background: rgba(28, 90, 74, 0.1);
  color: var(--pine-deep);
  font-weight: 650;
}
.qchip-hover { background: rgba(28, 90, 74, 0.06); }
```

**验收**：4 个按钮落成规整 2×2、左右间距一致；未选中状态**能清楚看出按钮边界**；选中态松绿实心反馈明确。

**顺手建议排查同类**：`.chip`（普通标签）用的也是 `--glass-border`。虽然它多数场景不糊，但如果某个 chip 落在 `.glass` 卡片内（比如第 ② 步人数、第 ③ 步年龄段、**都在 glass card 里**），会有同样的看不清问题。**请一并换成 `--line`。**

---

### 10.6 · 本批红线冲突汇总（⚠️ 需要老板先选方案）

本批 6 个问题里，有 **2 个必须动到红线文件**（`core/data.ts` 加物品、`core/types.ts` 加场景），而这两个文件受到：

> **硬约束**：`core/{types,data,engine}.ts` 必须与源 Web 项目**零差异**，由 `npm run diff:types / diff:data / diff:engine` + 87 个测试守护。

三个可选路径：

| 方案 | 做法 | 优点 | 代价 |
|---|---|---|---|
| ① **打破红线** | 直接编辑 core 三文件 | 最干净、最直观，将来维护和源项目一样 | diff 全程报错，等于放弃这条硬约束；源项目更新时无法自动合并 |
| ② **写进 fallback** | 把新物品塞在 `engine.ts` 的副本里 | —— | ❌ 同①，还藏得更深，不推荐 |
| ③ **自研扩展层**（推荐） | 新建 `core/extra.ts`（不属红线），导出 `EXTRA_ITEMS` 和 `RELATIONS`，在 `buildPrep()` 结果之上做**增量合并**；`Stay` 的扩展字段单独存一个 storage key | 红线保持纯净；一眼能看出哪些是我们加的；将来可整块卸载 | 需要自己补测试用例；数据分布在两个地方，导出/导入（M6 的 F1–F5）要同步带上扩展层 |

**若选方案③，请务必同时做这 3 件事**：
1. 扩展层的物品必须遵守现有 `Item` 结构（`id/name/cat/users/prep/unit/when/qty`），`id` 加统一前缀（如 `x_kettle`）避免与源数据冲突
2. **导出/导入要带上扩展数据**——M6 的 `exportData/importData` 走的是 core，需要在 UI 层额外拼接，否则用户备份后场景数据会丢
3. 为扩展层补测试，写进 `tests/acceptance.test.ts`（保持 87 + 新增 的计数口径）

**如果老板觉得为了几个物品搞这么重不值当**，还有一个折中：**只做设在 UI 层的部分**（10.1 人数 bug、10.2 逻辑分支、10.5 排版配色 —— 这三个都不碰红线，收益最大），把加物品和加场景留到以后。**推荐先做 UI 层这三个。**

---

## 11. 第三批反馈 · 交互改造 / 清单扩容 / 「我的」页方案

> 老板提的三件事：**勾选交互改造**、**清单补物品并分类**、**要不要加「我的」页**。
> 前两件我都查了代码，第三件给了完整设计方案。**依然是扩展方案，不要急着写代码。**

### 11.1 · 勾选交互改造（取消删除线，改淡绿标签 + 右上角虚化对勾）

#### 现状（两套实现，都要改）

这套做完/未完成的状态，在 project 里**分散在两个地方**，别改漏：

| 位置 | 文件 | 现在长什么样 |
|---|---|---|
| **准备清单**（物品行） | `components/item-row/item-row.wxss:49-55` | `.row.done .name { color: var(--ink-2); text-decoration: line-through; }` 名称变灰 + 删除线 |
| **入住 / 退房**（检查项） | `pages/stay/stay.wxss:108-111` | `.crow.done .name { color: var(--ink-3); text-decoration: line-through; }` 同上，颜色更淡 |

配套还有 `.tick.on`（`stay.wxss:126-133`）左侧圆圈勾选 + `.tick.on::after { content: "✓" }`，以及 `.row.zero { opacity: 0.5 }`（数量=0「不带」的状态）。

#### 目标效果

- (a) 打勾后，整行/整张标签的**底色变淡绿**
- (b) **右上角**显示一个**虚化（低透明度）的大号对勾**
- (c) 取消勾选**完全恢复**原样
- ❌ **去掉**删除线和文字虚化

#### 改法

```css
/* ===== item-row.wxss（准备清单）===== */
.row {
  position: relative;              /* 关键：给右上角水印提供定位父级 */
  overflow: visible;               /* 别写成 hidden，否则水印被裁 */
  transition: background-color .2s ease;
  border-radius: 20rpx;
}
/* 完成态：淡绿底 + 左右各 8rpx 内补淡出（比原来只改文字色更有整体感） */
.row.done {
  background: rgba(63, 125, 84, 0.10);     /* --green 的 10% */
  padding-left: 16rpx;                      /* 补偿视觉，让绿底有呼吸 */
  padding-right: 16rpx;
}
/* 删除线：直接删掉 */
.row.done .name { color: var(--ink); }      /* 不再变灰，不再 line-through */

/* 右上角虚化对勾：装饰性，不接收点击 */
.row-check {
  position: absolute;
  right: 8rpx;
  top: 4rpx;
  font-size: 120rpx;                        /* 大字号做水印 */
  line-height: 1;
  font-weight: 700;
  color: rgba(63, 125, 84, 0.16);           /* 虚化 */
  pointer-events: none;                     /* 关键：不挡任何点击 */
  z-index: 0;
  opacity: 0;
  transition: opacity .2s ease;
}
.row.done .row-check { opacity: 1; }
```

```css
/* ===== stay.wxss（入住 / 退房检查项）===== */
.crow {
  position: relative;
  overflow: visible;
  transition: background-color .2s ease;
  border-radius: 16rpx;
  padding: 22rpx 12rpx;                     /* 原来是 22rpx 0，加 12rpx 给绿底 */
}
.crow.done { background: rgba(63, 125, 84, 0.10); }
.crow.done .name { color: var(--ink); }     /* 去掉 line-through 与变灰 */
.crow-check { /* 同 .row-check */ }
```

```wxml
<!-- item-row.wxml：在 rx-wx:if 内、.grow 之前插入；用 class 控制而非 wx:if -->
<text class="row-check">✓</text>
<!-- 同理 stay.wxml 的 .crow 内 -->
<text class="crow-check">✓</text>
```

#### ⚠️ 四个必须注意的点

1. **左侧勾选圈 `.tick` 要保留**。它是主要点击热区（88rpx），右上角对勾只是装饰水印。**不要**为了做批注把左侧圆圈删掉，否则会退化成「点整行切换」，与 P0-2 的热区标准冲突。
2. **绝不能用 `wx:if` 控制对勾**。`wx:if` 会销毁重建节点，`opacity` 过渡就失效了，会出现"啪一下跳出来"。上面写成常驻节点 + class 切换 `opacity` 就是为了这个。
3. **与 `.zero`（「不带」）状态区分开**。现在 `qty=0` 用 `opacity: 0.5` 表示不带，**也是变淡**——如果完成态也变淡绿，两种状态容易混淆。建议：
   - 完成 = **淡绿底 + 右上角水印勾**（本次新方案）
   - 不带 = 保持现有的**整行半透明**，但把透明度从 `0.5` 提到 `0.45`，并在标签里保留「不带」二字（已有）
   - 验收时要特地造一条 `qty=0 且已勾选` 的数据，看两者叠加是否还分得清
4. **`.row` 是 flex + `border-bottom` 分隔线**（`item-row.wxss:8-10`）。加了 `border-radius` 和绿底后，相邻两行的分隔线会显得割裂，**建议改为 `:not(:last-child)` 的细虚线或直接去掉**，改用间距区分。

**验收**：准备/入住/退房三个界面看齐一致；iOS + 安卓都验（伪元素和 opacity 没差异，但绝对定位在不同行高下要目视确认没跑位）；长名称（如「一次性隔离贴膜（开关/马桶）」）下水印不被文字压住。

---

### 11.2 · 清单物品补充与分类 —— 逐条核查结果

我把老板点的每样物品都 grep 了一遍 `core/data.ts`，结论是：**只有 1 样真的存在。**

| 老板提的物品 | ITEMS 里有吗 | 现状说明 |
|---|---|---|
| 充电宝 | ✅ **有** | `data.ts:13` `powerbank`，电子类，`prep:'推荐'`，`when: () => true` **无条件出现** |
| 钥匙 | ❌ **没有** | 只出现在 `:115` 好物联想关键词表、`:225` 知识库正文，**正式清单无条目** |
| 水杯 / 保温杯 | ❌ **没有** | `:124` 只是联想关键词；清单里只有 `:21` `cup` **折叠漱口杯**（洗漱类，用途不同） |
| 耳机 | ❌ **没有** | `:156` 联想关键词、`:255` 指南总结里有，**清单无条目** |
| 玩偶 | ❌ **完全没有** | 全库零命中 |
| 枕头 | ❌ **没有** | `:147` 只是联想关键词 |
| 护颈 / U 型枕 | ❌ **没有** | `:137` 只是联想关键词（`颈枕/u 型枕/u型枕`） |
| 学习资料 / 本子 / 笔 | ❌ **完全没有** | `:156` 的「笔记本」是指**笔记本电脑**（在电子类联想词里），不是纸质笔记本；`:137` 有「行程本」但非清单条目 |

**一个很有意思的发现**：钥匙、水杯、耳机、枕头、颈枕这些词，**几乎都躺在"好物分类联想"的关键词表里**（`data.ts:115/124/137/147/156`），却不在正式清单里。
说明当初做联想功能时把这些物品都想到了，但**清单本身漏加了**——联想词表和正式清单是脱节的。这算得上清单覆盖度的一个系统性缺口，不只是老板碰巧想到。

#### 建议新增的条目（含归属分类）

| 新增物品 | 建议 cat | 触发条件 `when` | users | prep | unit |
|---|---|---|---|---|---|
| 钥匙 / 房卡套 | `证件` | `() => true` 无条件 | adult | 必带 | 把 |
| 随身水杯 / 保温杯 | `补给` | `() => true` | adult | 家里带 | 个 |
| 耳机 | `电子` | `() => true` | adult | 可选 | 副 |
| 儿童安抚玩偶 | `儿童` | `c.children > 0` | child | 家里带 | 个 |
| 惯用枕头 / 枕巾 | `睡眠` | `c.prefs.sleep`（睡眠敏感偏好） | adult | 可选 | 个 |
| U 型颈枕 | `出行` | `c.purpose === '出差'` 或长住 | adult | 可选 | 个 |
| 学习资料 | **新建 `学习`** | 培训/学习场景 | adult | 家里带 | 份 |
| 笔记本 / 笔 | **新建 `学习`** | 同上 | adult | 家里带 | 套 |

**关于是否需要新建分类**：现有 15 个类是 `证件/洗漱/衣物/出行/卫生/睡眠/驱蚊/电子/安全/适老/儿童/健康/长住/补给/自定义`，老板提的 8 样里：

- **6 样能塞进现有类**（钥匙→证件、水杯→补给、耳机→电子、玩偶→儿童、枕头→睡眠、颈枕→出行）✅ **不用新建**
- **只有「学习资料/本子/笔」无家可归** → 建议**新建第 16 个分类 `学习`**

⚠️ 分类一旦新增，下面这些地方都要同步（容易漏，单列出来）：
1. `CAT_ORDER` 数组要加，位置建议放在 `补给` 之后、`自定义` 之前
2. `GEAR_CATS` 依赖 `CAT_ORDER.filter()` **自动跟随**，不用改——但**已有的 44 条好物联想分布可能需要补学习类关键词**
3. `item-row` 按 `cat` 分组渲染，无需改；但**空分类不要渲染**（注意 `学习` 类在无此场景时列表为空，要确认 WXML 有 `wx:if` 兜底）
4. 知识库的 11 个模块与分类是两套东西，不受影响 ✅

#### ⚠️ 一个内容冲突，必须处理

`data.ts:424`（知识库婴幼儿安全条目）明确写着：**「不要用枕头被褥围挡替代（窒息风险）」**。

如果我们要往清单里加「枕头」，两者会在同一份数据里打架。处理方式二选一：
- **限定为成人/大童**：`when: c => c.prefs.sleep && !(c.children > 0 && c.childAge === '0-3')`，并在备注里写「成人用，勿用于婴儿床」
- **或不加枕头这条**，只加「枕巾」（小件、无窒息风险）

**推荐第一种 + 加备注。** 这条冲突如果不处理，会变成一个自己打自己脸的内容缺陷。

#### 红线判定

加任何物品都要改 `core/data.ts` → **撞红线**；加「培训学习」场景还要改 `core/types.ts` 的 `Purpose` 联合类型 → **同样撞红线**。
处理方式完全同 §10.6：**推荐方案③（自研扩展层 `core/extra.ts`）**，不要为了几条物品破坏零差异地基。

---

### 11.3 ·「我的」页面 —— 要不要加、放哪儿、怎么设计

#### 先回答「要不要加」：要。但要满足一个前提

目前的三个 tab 是 **首页（行程）/ 好物 / 知识库**，全是内容页。一旦上线并且：
- §10 的**云同步**开了 → 必须有地方放登录/同步状态
- 要放**隐私政策、用户协议**（小程序审核必查项，现在完全没地方放）
- 「备份与恢复」现在藏在**首页最底部一个折叠块里**（`home.wxml:59-74`），发现率极低

所以**「我的」不是锦上添花，是上线前必须补的基础设施**。但如果**既不云同步、也不考虑提审合规**，那它确实可以先不急。

#### 三个位置方案

| 方案 | 做法 | 优点 | 问题 |
|---|---|---|---|
| **A · 四个 tab 并排** | 首页 / 好物 / 知识库 / **我的** | 符合所有小程序的用户心智（"我的"永远在最右）；发现率最高；层级最浅 | 胶囊导航每个 tab 从 280rpx 压到 **205rpx**，视觉略挤 |
| B · 不上 tabBar，放首页头像入口 | 首页右上角加一个头像，点击进入二级页 | 保持 3 tab 的简洁 | 发现率低；且小程序规范建议常用功能层级 ≤2 层，把「备份」藏进二级是符合的，但**隐私协议类会被认为是刻意隐藏** |
| **C · 首页就是「我的」** | 把行程列表挪走，首页改成个人中心 | —— | ❌ 直接否决，行程列表是核心价值，不能挪 |

#### 推荐：方案 A（四 tab 并排），理由

1. 「我的」放最右是**全行业惯例**，用户闭着眼都能找到
2. **自绘 tabBar 没有 5 个上限**（那是原生 tabBar 的限制），加一个是安全的
3. 3→4 **不改变任何布局框架**，风险远低于其他改造

**可行性核算**（避免挤成一团）：

```
.navbar 内容宽 = min(100%, max-width 840rpx)  = 840rpx
               （padding 10rpx 在 content-box 下是外扩的，不占这 840rpx）
每个 tab 宽度 = 840 / 4 = 210rpx
tab 内容      = icon 34rpx + 文字 23rpx × 最长 3 字「知识库」≈ 69rpx  → 约 103rpx
               → 在 210rpx 里绰绰有余 ✅
```

结论：**放得下，不用改胶囊形态。** 真机上如果觉得挤，可以把 `.navbar` 的 `max-width` 从 840rpx 放宽——但那样就慢慢失去"悬浮胶囊"的味道了，**不到万不得已不要动**。

> ✅ **已核实 4 个 tab 时每个仍宽 210rpx vs 现在的 280rpx，不会挤成一团。**

#### 「我的」页的信息架构（建议）

```
我的
├─ 卡片 1 · 数据概况
│    行程 N 次 · 累计 N 晚 · 备齐率 XX%
│    （不显示任何个人信息，本工具本来就不收集）
├─ 卡片 2 · 数据同步          ← 只有P2-2云同步上线后才显示
│    同步状态：已同步 / 未同步 / 离线
│    [ 立即同步 ]
├─ 卡片 3 · 备份与恢复        ← 从首页搬过来（home.wxml:59-74 删掉）
│    导出备份 / 导入备份
│    说明：数据只保存在本机…删除小程序或清理缓存会一并清掉
├─ 卡片 4 · 偏好设置（都是本地开关，不影响清单引擎）
│    · 默认入住场景（映射 §10.3 的 relation）
│    · 准备清单是否默认展开分组（映射 P1-3）
│    · 完成后是否自动置底（可选，先不做）
├─ 列表项 · 关于
│    隐私政策 · 用户协议 · 免责声明（复用知识库现有 DISCLAIMER）
│    版本 v1.0.0 · AppID 后 4 位
└─ 红色文字按钮 · 清空全部数据（二次确认，用 P0-6 的自绘弹窗）
```

**原则**：这页**绝不放任何账号登录/手机号/头像/昵称**——本工具零账号是它的产品优势，别自己毁掉。

#### 落地步骤（等要做了按这个顺序）

1. `app.json` → `pages` 加 `"pages/mine/mine"`，`tabBar.list` 加第 4 项 `{ pagePath: "pages/mine/mine", text: "我的" }`
2. `custom-tab-bar/index.ts` → `TABS` 数组加 `{ url: '/pages/mine/mine', text: '我的', icon: 'user' }`
3. ⚠️ **已核实：`icon.wxss` 里没有 `user` 图标**（只有多人的 `users`，且已被第②步人数 chip 占用）。二选一：
   - **推荐**：在 `tools/gen-icons.py` 的字典里加一条 `circle-user`，重新生成 `icon.wxss`
   - **省事替代**：直接复用现有的 `sliders`（齿轮/设置感，语义接近"我的/设置"）
   - 🚫 **不要手写 base64，必须走生成脚本**（保证 35→36 图标的口径一致，且 M5 的校验脚本才能验过）
4. 新建 `pages/mine/{mine.ts,wxml,wxss,json}`
5. `core/tabbar.ts` 的 `syncTabBar` 要认第 4 个索引（`selected: 3`）
6. 把 `home.wxml:59-74` 的备份区搬到 mine，**首页相应删掉**
7. 所有页面的 `.page` 底部留白已是 `200rpx`，够用 ✅ **不用改**
8. ⚠️ `switchTab` 不支持 URL 参数——如果「我的」需要接收参数，走既有的 `core/nav.ts` 单例

**红线判定**：✅ 全新建**页面层**，红线干净，随时可以开工。

---

### 11.4 · ⚠️ 改之前必须知道：有 4 条测试断言会"保护"这些 bug

这是我回头审核时才发现的，**之前两批文档都没提到**。

`tests/acceptance.test.ts` 里有一部分断言是**直接读源码字符串**的静态断言——它们是当初为了"守住移植正确性"写的，但现在相当于把 bug 也守住了。**改对应功能时，这些断言必须同步更新**，否则会看到测试变红、误以为自己改错了。

| 行号 | 断言内容 | 与哪条改动冲突 |
|---|---|---|
| **`:139`** | `expect(src('pages/wizard/wizard.ts')).toContain('Math.max(this.data.draft.adults, n)')` | 🔴 **直接和 P0-8（人数 bug）冲突**！这条断言把 bug 写死成了"必须存在"。改完 `Math.max` 后这条会失败，**这是预期内的，把断言改成 `toContain('adults: n')` 即可** |
| `:305` | `expect(src('pages/stay/stay.ts')).toContain('showModal')` | 🔴 **与 P0-6（自定义弹窗）冲突**，换成自绘 modal 后这条会失败。改为断言 `components/modal` 被引用 |
| `:141-142` | `/min="\{\{3\}\}"/` 与 `/max="\{\{10\}\}"/` | 人数步进器范围，改 P0-8/P1-5 时别动这两个数字 |
| `:244` | `expect(src('pages/stay/stay.ts')).toContain("['全体', ...(s.guests || []).map(g => g.label)]")` | 使用人下拉逻辑，改 P1-4 名称布局时别误删这行 |
| `:404` | `expect(src('pages/gear/gear.ts')).toContain('先填物品名称，比如「充电宝」')` | 改 §11.2 充电宝相关文案时会失败（**注意这条也提到了充电宝**） |
| `:477` | `expect(src('pages/home/home.ts')).toContain('剪贴板里不是有效的备份 JSON')` | §11.3 把备份搬到「我的」页时，这条要对新文件路径断言 |

**建议**：执行任何一条改动前，先 `grep -n` 一下 `tests/acceptance.test.ts` 里有没有对应的静态断言，避免白跑一轮。

好消息：**tabBar 目前没有任何数量断言**，加第 4 个 tab 不会破坏测试，这也是方案 A 相对安全的另一个理由。

---

## 12. 文档自审记录（2026-10-02）

老板要求自查，以下是我自己审出来的**问题与补漏**，如实列出：

| # | 自审发现 | 处理 |
|---|---|---|
| 1 | **第二批漏了测试断言这一层**。`acceptance.test.ts:139` 断言 `Math.max` 必须存在，等于把人数 bug 保护起来了。只看代码会以为改完就完事，实际会测试变红 | ★ 已补写 §11.4，把 6 条高危断言全部列出 |
| 2 | 第一批只诊断了 `.btn` 溢出，**没覆盖同为 content-box 的 `.qchip`**——同一个 bug 家族，当时完全没意识到 | 已在第二批 §10.5 补上，并据此追加了「顺手排查同类」建议 |
| 3 | §11.2 加「枕头」会与知识库「不要用枕头围挡（窒息风险）」打架 | 已在 §11.2 末尾给出限定条件方案 |
| 4 | 「Qchip 白色」根因定为令牌误用后，**没有举一反三排查用它作描边的其他组件** | 已在 §10.5(c) 追加：落在 `.glass` 内的 `.chip` 同样受影响 |
| 5 | 三批需求合计 **13 个改动项**，但没说清哪些能立刻做、哪些要等决策 | 已在 §6 末尾标明：P0-7/P0-8/P1-5/P1-6/§11.3 **红线干净可立即开工**；P2-3/P2-4/P2-5 **须等老板选红线方案** |
| 6 | 「我的」页如果上线，隐私合规页面（政策/协议）现在项目里**一处都没有** | 已在 §11.3 信息架构里列为必放项 |

**自审认为仍然存在的不足**（诚实交代）：
- §11.2 的 8 条新增物品，`prep`（必带/推荐/可选）取值我是按常识给的，**没有和 `04-内容资产清单.md` 的措辞口径逐一核对**，实际落地前建议核一遍
- 「学习」作为第 16 个分类，`GEAR_CATS`（好物分类）会自动继承它，但**联想关键词表里没有学习类词汇**，真要加还得补一轮词典
- 所有 CSS 数值（如 `.row-check` 的 120rpx 水印字号）**都是估算，未在真机目视确认**，需安卓/iOS 各验一次
- 「我的」页的四个卡片，其中「数据概况」涉及统计口径，我没有核对 `engine.ts` 是否已有对应函数

---

*文档结束（含三批反馈）。执行时若发现描述与实际文件不符，以实际文件为准，并把差异记回本文档。*

---

## 13. 执行记录（2026-10-02）

> §1–§12 是**改动前**的排查与计划，保持原样不动。下面记录**实际执行结果**、
> 与文档描述不符之处，以及**仍然没做**的事。
> 老板已按推荐方案敲定全部决策：D-1 选③（自研扩展层）、D-2 云同步先不做、
> D-3 加「我的」页、D-4 折叠状态记住、D-5 敏感物品交用户自定义、D-6 接受 `.btn` 全局改动。

### 13.1 与文档描述不符的地方（以实际文件为准）

| # | 文档描述 | 实际情况 | 处理 |
|---|---|---|---|
| 1 | `app.wxss:94` 的 `.btn` 带 `width:100%` | 属实（改动前在 `app.wxss:106`） | 已按 P0-1 方案甲删除 `width:100%`，并补盒模型兜底 |
| 2 | 知识库页面样式完整 | **`knowledge.wxss` 缺 `.grow` 定义**——`item-row` / `home` / `stay` 三处都有，唯独知识库没有。模板里的 `class="ktitle grow"` 实际不生效，短标题时「建议复核」徽标与 chevron 会紧贴标题而非靠右 | C1 顺手补上，并复用于新增的模块目录行 |
| 3 | §11.3「`icon.wxss` 里没有 `user` 图标」 | 属实（只有多人的 `users`） | 在 `tools/gen-icons.py` 加 `circle-user`（不手写 base64），重跑脚本 → **37 图标 / 75 变体 / 25.0 KB**。⚠️ 顺带修了生成器的**计数 bug**：`'n'` 是默认档、生成时被跳过，但打印语句没跳，一直多报 1 条（旧输出「76 变体」，实际 75） |
| 4 | §11.3「备份区从 `home.wxml:59-74` 搬走」 | 属实，行号一致 | 已搬；同时移除 `home.json` 的 `modal` 引用（首页不再有二次确认场景）与 `home.wxss` 的 `.backup*` 死样式 |
| 5 | 测试基线 87 passed | 属实 | 已增至 **105 passed**（38 源用例 + 67 验收用例），见 §13.4 |
| 6 | §11.2 提到「加「学习」类要让 `GEAR_CATS` 自动跟随」 | **不成立**：`GEAR_CATS` 派生自 `CAT_ORDER`，而 `CAT_ORDER` 属红线不能改，所以它不会自动跟随 | 扩展层另建 `CAT_ORDER_EXT` / `GEAR_CATS_EXT`，好物页改用后者 |

### 13.2 已完成（批次 0 / A / B / C / D / E1）

**批次 0 · 基线**：`npm test` 87 passed、typecheck 通过、红线三文件零差异。

**批次 A · P0 可用性**
| 项 | 内容 |
|---|---|
| A1 P0-1 | `app.wxss` 补盒模型兜底（标签名选择器会穿透组件样式隔离，组件内部同样生效）+ `.btn` 删 `width:100%` |
| A2 P0-7 | 快捷日期改真 2×2（`width: calc(50% - 8rpx)` + `border-box`），描边 `--glass-border` → `--line`，`.chip` / `.qchip` 一并换 |
| A3 P0-2 | 触摸目标统一 ≥88rpx（`.del` 72×72、`.icon-btn` 88、`.glink` 负 margin 外扩…） |
| A4 P0-8 | `wizard.ts` 人数区间决策：`n >= 3 && cur >= 3 ? cur : n`，替换 `Math.max` bug（原实现只能升不能降） |
| A5 P0-4 | 向导底栏 `.wiz-foot` 固定到视口底部（z-index 900 < tabBar 1000） |
| A6 P0-5 | 「删除这次入住」独立危险区，三 stage 共用 |
| A7 P0-6 | 新建 `components/modal/` 自绘确认弹窗，替换 3 处 `wx.showModal`（stay / home / gear） |
| A8 P0-3 | 首页主按钮重设计（112rpx 高 + chevron + 刊头瘦身） |

**批次 B · P1 交互**
| 项 | 内容 |
|---|---|
| B1 P1-5 | 向导第③步按人数分支：1 人只问宠物，≥2 人才问儿童/老人；人数降回 1 时清掉 `children` / `elderly` 残留 |
| B2 P1-2 | 三段页签整块吸顶（`.seg-sticky`，sticky top:0，z-index 800，不透明背景） |
| B3 P1-3 | 分组标题吸顶 + 折叠（`.grp-head` sticky top:116rpx / z-index 700），折叠状态存 UI 层 `htb_ui_collapsed_v1`，不进 Stay 数据 |
| B4 P1-1 | 回到顶部按钮（`.gotop` z-index 950），行程页与知识库页各一份 |
| B5 P1-4 | 物品名称一行显示（`.name` nowrap + ellipsis，字号 30→29rpx；`.row` gap 18→14、`.meta` gap 12→8、好物入口文案 `＋ 好物`→`挑好物`） |
| B6 P1-6 | 勾选交互改造：淡绿底 + 右上角虚化水印勾，**去掉删除线与文字变灰**；`item-row` 与 `stay.wxss .crow` 两处同改 |

**批次 C · P2 内容组织**
- C1 P2-1：知识库模块级折叠。`modules[mi].open` 默认 false，模块行 = 序号·模块名·条数·chevron，手风琴式单选展开；从行程页跳进来自动展开锚点模块并滚动定位；免责声明与等级图例**保持常驻**；折叠用 `wx:if` 直接切，无高度动画。

**批次 D · 扩展层（D-1 选③）**
- D0 新建 `core/extra.ts`：红线三文件零改动。
- D1 `Relation` = 独自 / 情侣 / 家人 / 朋友 / 同事；向导第④步加「和谁一起住？」chips。
- D2/D3 `EXTRA_ITEMS` 10 条（便携烧水壶、棋牌桌游、钥匙/房卡套、随身水杯、耳机、儿童安抚玩偶、惯用枕头、U 型颈枕、学习/培训资料、笔记本/笔），id 一律 `x_` 前缀；新建 `娱乐` / `学习` 两个分类。
- D4 备份带 `ext` 段（`exportDataExt` / `importDataExt`），源 Web 版忽略该字段，跨端互导不受影响。
- D5 新增 11 条扩展层测试。

**批次 E1 ·「我的」页**
- 四 tab 并排（首页 / 好物 / 知识库 / **我的**），`pages/mine/` 新建，备份与恢复搬来，加数据概况 / 偏好设置（默认住宿场景）/ 关于（免责声明 + 隐私说明）/ 清空全部数据（自绘二次确认）。

### 13.3 关键实现约定（后续维护必读）

1. **扩展层绝不进 Stay 结构**：Stay 属红线。住宿关系 / 培训学习存在独立 key `htb_ext_v1`，删掉这个 key 就等于卸载扩展层。
2. **排序必须用 `CAT_ORDER_EXT` + `sortItemsExt`**：`CAT_ORDER.indexOf('学习')` 是 -1，直接拿源数组排序会把「娱乐 / 学习」顶到清单最前面。行程页 / 首页 / 好物页都已切过去。
3. **水印勾三约束**：常驻节点 + CSS 切 `opacity`（不能 `wx:if`）、`pointer-events: none`（否则吃掉步进器与删除按钮的热区）、字号≈行高（不溢出到相邻行）。
4. **绿底用「负外边距 −12rpx + 内补 12rpx」**：背景外扩、内容 x 坐标不变，勾选/取消时不左右抖动。
5. **`pointer-events` 可用**：`app.json` 未启用 Skyline（无 `renderer` 字段），走 WebView 渲染器。
6. **清空数据逐个 key 清**，不用 `clearStorageSync`（会越权清掉同设备其它小程序的数据）。
7. **富文本预解析抽到 `core/rich.ts`**：知识库（44 条正文）与「我的」页（免责声明）共用，避免两处口径漂移。

### 13.4 自检结果（全部通过 · 2026-10-02 收尾复跑）

```
npm test                                 105 passed（38 源 + 67 验收）
npm run typecheck / typecheck:test       通过
npm run diff:types/data/engine           三文件零差异（红线未破）
16 个 WXML 模板                           bad=0
21 个 JSON 可解析                          0 失败
                                         （miniprogram/ 18 + 工程根 3；
                                          tsconfig*.json 是 JSONC、package-lock.json 是锁文件，均跳过）
图标类名                                  37 个图标 / 75 条变体，模板静态引用零缺失
裸 < / && / 禁用词 / 网络 / 登录 / 埋点    零命中
包体积                                    ≈283 KB / 78 文件（上限 2 MB，余量约 86%）
```

### 13.5 仍然没做 / 需要老板拍板的事

1. **云同步（P2-2）**：按 D-2 决策**未做**，保留剪贴板导出。若将来要做，§11.3 / DEV-PLAN E2 的方案仍然有效。
2. **正式《隐私政策》《用户协议》**：「我的」页目前放的是**基于事实的「隐私说明」**（不联网、不收集、数据只在本机）与复用知识库的**免责声明**。这两份正式法律文本需要另行拟定，不能由我编造 —— 提审前请补上。
3. **真机验证**：所有 CSS 数值（尤其 B6 的 120rpx 水印勾、模块目录行高）**都没有在真机目视确认过**，需 iOS + Android 各验一遍，重点看：
   - 水印勾在长名称 / 多行 meta 的行里有没有跑位或溢出到相邻行
   - `qty=0 且已勾选` 叠加时，「不带」与「已完成」两种状态是否仍分得清
   - 四 tab 悬浮胶囊是否挤（`.navbar` max-width 840rpx → 每个 tab 210rpx）
   - 知识库模块折叠后首屏高度是否 ≤3 屏
4. **好物联想词表**：扩展分类 `娱乐` / `学习` 的关键词只在**源联想猜不出时**兜底（`guessGearCatExt` 先走源 `guessGearCat`）。词典较薄，后续可补。
5. ~~**`PROGRESS.md` / `ACCEPTANCE.md` / `RELEASE-CHECK.md`** 里的「87 passed」「3 个 tab」等表述尚未同步更新，提审前需一并订正。~~ → ✅ **已完成（2026-10-02 收尾）**，见 §13.6。


### 13.6 文档口径订正（2026-10-02 收尾）

代码侧全绿之后，把三份交付文档里过时的数字同步到当前真实状态。

| 文件 | 改了什么 |
|---|---|
| `ACCEPTANCE.md` | 87 → **105 passed**；验收用例 49 → **67**；H2 的「3 个 tab」→ **4 个**；H8 图标 35 → **37**；H9 备份区位置「首页」→ **「我的」页**；新增 H12–H16 五条本轮新增 UI 的人工项（四 tab 拥挤度 / 水印勾 / 单行截断 / 知识库手风琴 /「我的」页） |
| `RELEASE-CHECK.md` | G1 与提审表第 1 项 87 → **105**（38 + 67）；安全区「三个 tab 页」→ **四个**；截图 5 张 → **6 张**（加「我的」）；§6 工程现状整块按实测重写（283 KB / 78 文件 / 6 页面 / 10 组件 / 37 图标 / 4 个存储键）；偏差汇总加第 11–15 条（扩展层、云同步不做、敏感物品不预置、「我的」页、折叠状态存 UI 层） |
| `PROGRESS.md` | 顶部加读法说明（M0–M7 各节数字是**完成时快照**）；文末新增 **§M8 · 变更需求落地**，作为当前状态的权威口径（6 决策 / 5 批次 / 验收自查 / 8 条实现约定 / 6 项未完成） |
| `CHANGE-REQUESTS.md` | §0 第 2 条后加 **2b** 说明（判据是「源 38 用例逐字未改且全绿」，不是「数字等于 87」）；§13.1 第 3 条补记图标生成器计数 bug；§13.4 按复跑结果重写；本条 §13.6 |

**为什么没有直接改掉 `PROGRESS.md` 里的旧数字**：那份文档是按里程碑记录的历史档案，M0–M7 的「87 passed / 3 个 tab / 35 图标」在各自完成当天都是真的。改掉会让历史失真、也看不出演进轨迹。改成「顶部声明 + 文末权威口径」既保住了历史，又不误导读者。

**为什么没有改 `CHANGE-REQUESTS.md` §0 表格里的「87 passed」**：那是老板写这份需求时的原始口径，属原始记录。§0 已加 2b 指向，§13.1 第 5 条也已标注实际值。

---

## 14. 第二轮反馈落地（2026-10-02 收尾）

老板在真机/模拟器上试过之后提的 5 条，逐条落地。

### 14.1 逐条对照

| # | 老板原话 | 根因 | 处理 |
|---|---|---|---|
| 1 | 「培训学习」标签前面缺少一个图标 | **不是忘了写，是图标 class 不存在**：向导第 ⑤ 步写的是 `<icon name="book-open" tone="p" />`，而 `tools/gen-icons.py` 的 `VARIANTS` 里 `book-open` 只有 `'d'` 档 → `.ic-book-open-p` 不存在 → `background-image` 落空 → **静默渲染成空白**，不报错不警告 | `VARIANTS` 改成 `'book-open': 'dp'`，重跑生成器 |
| 2 | 这些方面的文字和图标偏小，放大一些 | 图标 `size="30"`、`.slabel` `31rpx` | 图标 30 → **34**；`.slabel` 31 → **34rpx**；`.fxline`（「＋将加入」）25 → **27rpx** |
| 3 | 「这些选择如何影响清单」标题要言简意赅 + 做成可折叠、默认折叠 | — | 改名 **「你的选择如何影响清单」**（第二人称，与同页「你在意哪些方面？」「还有一些东西，只有你自己知道」一致）；内容区包进 `wx:if="{{fxOpen}}"`，`fxOpen: false` 默认收起，标题栏加 chevron（收起时转 −90°） |
| 4 | 保存后跳到了入住界面，应该跳准备界面 | `wizard.save()` 只传了 `id`，`stay.onShow` 用 `suggestedStage()` 按日期推断 —— 今天入住的行程必然推断成 `checkin` | 向导保存时带 `&stage=prep`；`stay.onLoad` 读 `options.stage` 并**优先于**日期推断，仅作用于首次进入 |
| 5 | 数量设为 0 了，准备界面还有「钱包」 | 源实现 `qty === 0` 是「留在列表里灰显 + 打「不带」标签 + 禁用勾选」。老板要的是「不该出现」。**顺带发现一个真 bug**：qty=0 的项勾选框是禁用的，却仍算进「已备齐」的分母 → **进度永远到不了 100%** | 见 §14.2 |
| 6 | 三段（准备/入住/退房）要支持左右滑动切换 | — | 见 §14.3 |

### 14.2 qty = 0 的处理（老板选的方案：消失 + 底部可恢复）

「直接删掉」是不可逆的，所以按「**不占位、但能找回来**」做：

- `core/extra.ts` 新增纯函数 `splitByQty(items)` → `{ active, zero }`，行程页与向导预览共用同一口径（避免「向导里看得到、行程页里没有」）。
- `qty === 0` 的项**不进分组、不计入「已备齐」的分子分母**。
- **数据层一个字没动**：项仍然留在 `stay.prep` / `stay.custom` 里，只是不渲染。正因如此，恢复才能只是「把 `qty` 写回 1」而不是重新插入。
- 清单底部新增默认收起的 **「已设为不带（N 项）」** 区域，展开后逐项「恢复」（回到 1 件，再按需加减）。
- 样式 `.zero-*` 放 `app.wxss`（两个页面共用），不复制两份。
- `item-row` 组件里 `qty === 0` 那套源实现分支（灰显 + 「不带」标签）现在走不到了，**保留未删**，并在组件头注释里说明原因。

> 这是**有意偏离源 Web 项目**的一处产品口径，已记入 `RELEASE-CHECK.md` §5 偏差表第 16 条。

### 14.3 三段左右滑动

**没有用 `<swiper>`**：三段都是长列表、高度差很大，而 `swiper` 必须有确定高度，嵌在可滚动页面里还要给每段套 `scroll-view`，会把现有的「页签吸顶 + 整页滚动」布局全打翻。

改用页面级触摸判定：

- 判定逻辑抽成纯函数 `core/gesture.ts` 的 `swipeDir(dx, dy)` —— 不碰 wx API，因此**可以在 node 里单测**（页面文件在 vitest 里 import 不了）。
- 判定要同时满足：横向位移 ≥ `SWIPE_MIN_DX`（60px）**且** ≥ 纵向位移 × 1.5。第二条是关键 —— 纵向滚动时手指必然带横向抖动，只按横向位移判会疯狂误切。
- 向左划 = 后一段，向右划 = 前一段，两端自然钳制。
- 点击页签与滑动**共用同一个 `gotoStage()`**，避免两条路径各自漂移。
- **浮层开着时不接管滑动**：`modal` 与 `clothing-add` 只 `catchtouchmove`，`touchstart` / `touchend` 仍会冒泡到页面根节点，所以页面侧要自己判 `overlayOpen()`。删除确认弹窗正开着的时候页面被划走，显然不行。
- 头部阶段提示：只有**真的按日期推断**时才用规格原文「按日期已为你定位到「X」阶段」（`02 §6` 定死了这句）；用户自己切过之后换成中性提示，顺带把新手势讲出来 ——「X 阶段 · 左右滑动或点上方页签切换」。

### 14.4 新增守卫：图标引用校验脚本

第 1 条那类 bug（**图标静默空白**）不报错、不警告，只能靠肉眼发现。为了不再靠人眼，新增 `tools/check-icons.py`：

```
npm run check:icons      # 退出码 0 = 全部有定义；1 = 有缺失并逐条列出
```

它把「模板里每个静态 `name` + `tone`」与 `icon.wxss` 里实际生成的 class 全量比对（动态绑定的 `{{...}}` 跳过并计数）。修 `book-open` 前它精确报出 1 处缺失，修完报 0 —— 已实测有效。

对应地在 `tests/acceptance.test.ts` 里加了 **J1**，把同一个校验搬进测试套件，`npm test` 就能拦住。

### 14.5 自检结果（全部通过）

```
npm test                                 115 passed（38 源 + 77 验收）
npm run typecheck / typecheck:test       通过
npm run diff:types/data/engine           三文件零差异（红线未破）
npm run check:icons                      76 条 class，模板静态引用 55 处零缺失
16 个 WXML 模板                           bad=0，标签闭合全对
21 个 JSON 可解析                          0 失败
网络 / 登录 / 埋点 / 云开发 API            零命中
包体积                                    299 KB / 79 文件（上限 2 MB，余量 85%）
```

新增用例 **J1–J10**（图标档位、book-open 补档、字号放大、卡片改名折叠、跳准备阶段、qty=0 隐藏、恢复入口、滑动判定、滑动接线、阶段提示文案）。

### 14.6 仍需真机确认

1. 第 ⑤ 步放大后 5 行 + 5 条提示行在 iPhone SE 窄屏是否仍不挤。
2. 「已设为不带」区域的展开/收起与「恢复」按钮手感。
3. **左右滑动**：纵向滚动时不误切（判定阈值 60px / 1.5 倍是估值）；`scroll-view` 与 `picker` 上的滑动表现。
4. 「培训 / 学习」前的 `book-open` 图标实际显示效果。

---

## 15. 第三轮反馈落地（2026-10-02）

> 完整规划与逐条对照见工程根的 **`FIX-PLAN.md`**（含「已实现打勾 / 待办」清单与验收对照表）。
> 本节只记结论与踩坑。

### 15.1 老板提的 7 条 → 落地位置

| # | 反馈 | 根因 | 改了什么 |
|---|---|---|---|
| R3-1 | 不选日期也能点「开始」 | `next()` 对第 ① 步**没有任何校验**，空日期一路带进 `newStay()`，而 `suggestedStage()` 对空日期返回 `prep` → 这条行程永远卡在准备阶段 | `nextReady: !!d.date` + 按钮 `.btn-off` 灰显 + `next()` 兜底拦下并 toast |
| R3-2 | 快捷日期排版「非常恶心」 | **不是审美问题，是布局 bug**：`.qchip { width: calc(50% - 8rpx) }` + `.quickrow { gap: 16rpx }` 正好 = 100%，卡在临界点，子像素取整后溢出 → 每行只放得下一个，**退化成一列** | `calc(50% - 12rpx)`，留 8rpx 余量 |
| R3-3 | 「几人入住」界面重做 | 三个按钮横挤一行 + 图标共用「三人」档 | 改纵向列表 `.picklist`/`.pickrow`；新增 `user`（1 人）/ `users-3`（3 人及以上）两个图标；「3 人及以上」的真实人数步进器放进 `.pickexpand` 独立展开区 |
| R3-4 | 选 1 人还问「和谁一起住」 | 第 ④ 步的关系区块**没有任何人数条件**，`relations` 永远渲染 | `showRelation: d.adults >= 2` 整块隐藏；`applyAdults()` 在 `n <= 1` 时把关系**强制回「独自」**（不清会残留上次的「朋友」，清单里莫名多出棋牌桌游） |
| R3-5 | 折叠分组不一致 | `htb_ui_collapsed_v1` 是**按分类名全局共享**的（不区分行程）：在 A 行程折叠了「衣物」，B 行程的「衣物」也折叠 —— 于是看起来「有的展开有的折叠、还找不出规律」 | key 升到 `htb_ui_collapsed_v2`，结构 `{ [stayId]: { [分类]: 折叠 } }` → 新行程无记录 → **全部默认展开**；v1 一并列入「我的」页清空清单 |
| R3-6 | 左右滑动「根本没实现」 | 代码在，但判定等 `touchend` —— 它在部分机型 / 手势被系统接管时**不触发**（改发 `touchcancel`），等它就等于赌运气 | 判定挪进 `touchmove` 当场做；补 `bindtouchcancel` 复位；加 `_fired` 锁（`touchmove` 高频，不加锁会一次连跳两段）；阈值 60/1.5 → **48/1.2** |
| R3-7 | 「回到顶部」出现太晚 | 两页都写死 `e.scrollTop > 600`（约一屏多） | 抽 `SCROLL_TOP_TRIGGER = 120` + `shouldShowGoTop()` 到 `core/gesture.ts`，两页共用 |

### 15.2 本轮最值钱的一条：flex 2×2 的临界陷阱

`.qchip` 的 `calc(50% - 8rpx)` 配 `gap: 16rpx`，两个子项合计 `100% - 16rpx`，加 gap 后**正好 100%**。
数学上「刚好放得下」，但浏览器/渲染器对百分比宽度做子像素取整时略微超过 100%，于是换行 —— 每行一个。

**结论**：flex 多列布局别把宽度算到「正好 100%」，**永远留余量**（这里留 8rpx）。
这条同时解释了为什么 `CHANGE-REQUESTS` 的 A2 声称「已改真 2×2」却从未生效过 —— 它确实改了代码，只是改的值刚好踩在临界点上。

### 15.3 自检结果（全部通过）

```
npm test                                 123 passed（38 源 + 85 验收）  ← 115 → 123
npm run typecheck / typecheck:test       通过
npm run diff:types/data/engine           三文件零差异（红线未破）
npm run check:icons                      80 条 class / 57 处静态引用，零缺失
```

新增用例 **K1–K8**（日期必选 / 2×2 布局 / 人数列表与图标 / 1 人不问同行 / 折叠按行程隔离 / 滑动阈值与接线 / 回到顶部阈值 / 红线未破）。

### 15.4 仍需真机确认

见 `ACCEPTANCE.md` §7 的 **H23–H29**。其中 **H25（人数界面）** 与 **H28（滑动实测）** 优先验 ——
前者老板给了四条具体要求，后者是上一轮「写了没生效」的那条，**务必重新扫码**加载新代码。

---

## 16. 第四轮反馈落地（2026-10-02）

> 完整规划与调研见工程根的 **`R4-PLAN.md`**（含滑动动效的方案选型、风险与降级路径）。
> 本节只记结论与踩坑。

### 16.1 老板提的 5 条 → 落地位置

| # | 反馈 | 根因 | 改了什么 |
|---|---|---|---|
| R4-1 | 「谁和你同行」选项太少 | 第 ③ 步是照源项目搬的，那一维只服务「带不带孩子/老人/宠物」，没考虑「和谁一起」这层语义 | 第 ③ 步扩成三块：**同行名额** + **人员构成**（成人同行/儿童/老人/宠物）+ **同行关系**（情侣/家人/朋友/同事/**其他**） |
| R4-2 | 同行人数能超过入住人数 | `adults` / `children` / `elderly` 三者**互不知道对方存在** —— 源项目里这一维本来只是「标记要不要带老人用品」，不是人数分配 | 引入**同行名额**：自己占 1 位，`成人同行 + 儿童 + 老人 ≤ adults − 1`；名额用尽时三个「＋」全禁用 |
| R4-3 | 同行关系与住宿关系打架 | 第 ④ 步的 `relation` 与第 ③ 步完全独立，谁都能改 | 第 ③ 步定了具体关系 → 第 ④ 步**锁定同值并禁用**；选了「其他」才开放（老板原话的逻辑） |
| R4-4 | 数量减到 0 要提示 | 那一行**悄悄消失**，用户以为被删了 | 新建自绘 `components/toast`，文案「已记录到下方「已设为不带」，随时可恢复」，**900ms**（硬要求 ≤1 秒）；两处接入 |
| R4-5 | 滑动要有跟手动效 | 页面 touch 事件要走「视图层 → 逻辑层 → setData → 视图层」**两次跨线程通信**，一秒 60 次手势就是 120 次通信 | 改用 **WXS 响应事件**（官方方案），判定与位移全在视图层做，通信 0 次；三段做成可平移轨道，两侧渲染相邻段（「翻书」的关键） |

外加老板拍板的遗留项：**R4-6 工具类统一**（`.grow` / `.hv` 收进 `app.wxss`）。

### 16.2 本轮最值钱的一条：为什么前两轮的滑动一直「不流畅」

**不是判定逻辑写错了，是架构选错了。**

小程序分视图层（Webview）和逻辑层（App Service）。页面自己的 `bindtouchmove` 事件必须
从视图层抛到逻辑层、处理完再 `setData` 回视图层 —— 一次手势两次跨线程通信 + 一次渲染。
手指每秒动 60 次就是 120 次通信，表现出来就是「一顿一顿」；通信排队时事件被丢弃，
就是「有时候没反应」。

微信官方对这件事有专门方案：**WXS 响应事件**（基础库 2.4.4+）。把处理函数放在视图层里跑，
直接 `setStyle`，通信次数降到 0 —— `movable-view` 能做得那么顺就是靠它。

**教训**：连续三轮都在「判定逻辑」上打转（touchend → touchmove → 调阈值），
真正的问题却在**事件跑在哪一层**。下次遇到「性能/流畅度」类反馈，
先问一句「这条链路跨了几次线程」，而不是继续调参数。

### 16.3 两个必须知道的技术冲突

**冲突一：横向裁剪会把 `position: sticky` 干掉。**
轨道要裁横向（否则平移出去的内容撑出横向滚动条），直觉用 `overflow-x: hidden`。
但 CSS 规范规定：`overflow-x: hidden` 配 `overflow-y: visible` 时，后者会被**计算成 `auto`** ——
容器变成滚动容器，里面 `.grp-head` 的分组标题吸顶（P1-3）立刻静默失效。
解法：**`overflow-x: clip`** —— 唯一允许与 `visible` 配对的裁剪值，不创建滚动容器。
配 `@supports` 降级到 `hidden`（功能不坏，只是少了吸顶）。

**冲突二：三段高度差很大，视口高度听谁的。**
做法是**只有当前段在流内**（决定视口高度），相邻段用 `position: absolute` 挂到两侧。
这样视口高度永远等于当前段，不会因为多渲染了两段而多出一大片空白。

### 16.4 自检结果（全部通过）

```
npm test                                 136 passed（38 源 + 98 验收）  ← 123 → 136
npm run typecheck / typecheck:test       通过
npm run diff:types/data/engine           三文件零差异（红线未破）
npm run check:icons                      81 条 class / 61 处静态引用，零缺失
swipe.wxs                                语法检查通过
17 个 WXML 模板                           bad=0
包体积                                    342.4 KB / 85 文件（余量 83%）
```

新增用例 **L1–L13**；同时更新 **J6 / J9 / K6**（它们断言的是 R4-5 之前的旧实现）。

### 16.5 仍需真机确认

见 `ACCEPTANCE.md` §7 的 **H30–H36**。**H30 是本轮成败点，优先验**：
手势绑在页面的内置 `<view>` 上，而手指大多落在 `item-row` 这类自定义组件内部 ——
官方说「WXS 不支持自定义组件事件」，指的是**不能绑在自定义组件上**；
绑在内置 view 上收冒泡事件按说可行，但必须真机确认。
不行就走降级：改成「松手后补间动画」（动效还在，只是不跟手）。

**验之前务必重新扫码**，DevTools 的「编译」只作用于模拟器。

---

## 17. 真机异常修复：WXS 编译失败（2026-10-02）

老板真机扫码后，行程页直接编译失败，弹窗 + 控制台各一条：

```
./pages/stay/swipe.wxs:115:22:Unexpected token `(
编译 .wxml 文件错误，错误信息如上，可在控制台查看更多详细信息
```

### 17.1 根因

第 115 行是：

```js
var idx = Number(ins.getDataset().idx) + s.dir;
```

`Number(...)` 是再普通不过的写法，但 **WXS 不是 JavaScript**。
查官方「WXS 语法参考 / 基础类库」，WXS 的全局能力只有这些：

| 全局对象 | 内容 |
|---|---|
| `console` | `console.log` |
| `Math` | 属性 + 方法（照 ES5） |
| `JSON` | `stringify` / `parse` |
| `Number` | **只有 4 个属性**：`MAX_VALUE` / `MIN_VALUE` / `NEGATIVE_INFINITY` / `POSITIVE_INFINITY` |
| `Date` | **只有 3 个属性**：`parse` / `UTC` / `now` |
| `Global` | 属性 `NaN` / `Infinity` / `undefined`；方法 `parseInt` / `parseFloat` / `isNaN` / `isFinite` / `decodeURI(Component)` / `encodeURI(Component)` |

也就是说 `Number` 是个**只有属性的命名空间对象，没有方法、也不能当构造函数调用**；
`String` 连类库里都没有。所以 `Number(x)` / `String(x)` 在 WXS 里是**非法语法**。

文件里还有一处 `String(ds.lock)`（第 85 行）和一个对象字面量的尾随逗号，一并清掉了。

### 17.2 为什么开发者工具没报

**开发者工具与真机用的不是同一版 WXS 编译器**，模拟器那版宽松，真机那版严格。
所以这类问题**只有真机能暴露** —— 本地能做的只有「按文档把语法限制静态扫出来」。

### 17.3 改法

| 位置 | 改前 | 改后 |
|---|---|---|
| 第 85 行 | `String(ds.lock) === '1'` | `ds.lock === '1' \|\| ds.lock === 1`（数字、字符串各判一次） |
| 第 115/116 行 | `Number(...)` | `toNum()` 辅助函数，内部走 **`parseInt(v, 10)` + `isNaN`**（都是 `Global` 的方法，文档明确可调用） |
| 对象字面量 | 尾随逗号 | 删掉 |
| 轨道选择器 | `#stageRail` 单一路径 | `#stageRail` → 失败退 `.stage-rail`（避免选择器没匹配上导致「滑不动」这种静默失败） |

顺带把 `ins.getDataset()` 从两次调用收敛成一次，并在文件头把「WXS 不是 JS」的约束写死。

### 17.4 新增两道本地守护

| 脚本 | 查什么 |
|---|---|
| `npm run check:wxs`（`tools/check-wxs.py`） | ① 调用不可调用的内置构造函数（`Number(` / `String(` / `Array(` …）② 调用未在本文件定义的裸函数 ③ ES6+ 语法（`let`/`const`/箭头函数/模板字符串/展开/可选链/`??`/`class`）④ `new` 表达式 ⑤ 字面量尾随逗号 |
| `npm run check:wxml`（`tools/check-wxml.py`） | 标签配对 + `{{ }}` 配对（真机上同样报「编译 .wxml 文件错误」，但原因可能在它引用的 wxs 里） |

两个脚本都做了**反向验证**：拿一份故意写坏的文件跑，确认能逐条报出来（11 处 / 3 处），
再跑干净文件确认通过。`check:wxs` 的第 ② 条最狠 —— 它能同时抓住「函数名拼错」
和「用了 WXS 没有的全局函数」，而这两种在模拟器里都是静默失败。

### 17.5 自检结果

```
npm test                                 137 passed（38 源 + 99 验收）  ← 136 → 137
npm run typecheck / typecheck:test       通过
npm run diff:types/data/engine           三文件零差异（红线未破）
npm run check:wxs                        1 个 wxs / 219 行，零问题
npm run check:wxml                       17 个模板，标签与插值全配对
npm run check:icons                      81 条 class / 61 处静态引用，零缺失
```

新增用例 **L14**（WXS 语法合规）；更新 **L11**（`String(ds.lock)` 那行断言）。

### 17.6 待真机

见 `ACCEPTANCE.md` §7 的 **H37**（回归验证：真机不再报编译错误）。
**通过后再继续验 H30**（滑动是否生效）—— H30 才是第四轮反馈的成败点。



---

## 18. 第五轮反馈落地（2026-10-02）

需求说明书：`CHANGE-REQUESTS02.md`（R5-1…R5-9）。全部 6 条待拍板问题老板已拍板，按其 §10 建议顺序执行。

### 18.1 落地明细

| # | 需求 | 结果 |
|---|---|---|
| R5-1 | 三视图滑动 | **未改手势代码**。官方文档证实触摸事件可穿越组件边界（§2.3 的核心疑虑不成立），R4 实现在文档层面成立；病根大概率是编译错误已修但未重新扫码。真机验证清单见 `ACCEPTANCE.md` H38 备注，方案 A/B/C 全部保留为诊断后预案 |
| R5-2 | 整行可点 | `item-row` 根节点 `bindtap` + 5 处 `catchtap` 挡冒泡（勾选框/步进器/使用人/好物/删除）；组件内补 `.hv`；向导第 ⑦ 步预览接 `onPreviewToggle`。入住/退房段零改动（本就整行可点，共用 `checkBody` 模板） |
| R5-3/R5-5 | 性别 + 经期 | 扩展层 `Gender` / `genderOf` / `GENDER_EXCLUDE`（按 itemId 摘剃须刀/卸妆棉）；向导新增第 ① 步性别（7 步顺移）；第 ⑥ 步仅女性可见经期开关；性别切回男性清 `period`；`loadExt` 逐字段校验 |
| R5-4 | 删关系块 | 第 ⑤ 步「和谁一起住」整块删除，`setRelation` / `relationLocked` / `relationLockHint` / `showRelation` 退役；`autoRelation` 自动写回保留；关系提示挪到第 ④ 步 |
| R5-9 | 住宿情况页 | `PurposeExt` 7 值 + `toSourcePurpose` 降级（源 `Purpose` 零污染，H57 过）；`draft.purpose` 与 `purposeExt` 双写双读；`.chips` → `.picklist` 一列 7 行；`fxline` 动态由 `fxNames` 差集算出 |
| R5-6 | 化妆品 | `CAT_ORDER_EXT` 锚点插入（化妆品紧跟衣物）；`COSMETIC_TYPES` 22 项入扩展层；`clothing-add` 泛化（保留原名）；两页面 `data-cat` 路由 + 双面板治理；女性空「化妆品」组承载入口 |
| R5-7 | 下拉错位 | 浮层包进 `<root-portal>`，绕开 `.glass` 的 `backdrop-filter` 包含块（libVersion 2.32.3 ≥ 2.26.1） |
| R5-8 | 浮窗 | `TOAST_MS` 900 → 1500（历史留档在 `core/toast.ts`）；宽度 `calc(100vw - 96rpx)`；L12 与 H36 同步 |
| — | 新物品 8 项 | x_sanitary_pad / x_painkiller / x_lens / x_glasses / x_disposable_underwear / x_sunscreen / x_gift / x_medical_record（全部 `x_` 前缀，源 56 项零改动） |
| — | 图标 | bed-double / house 补 p 档、sliders 补 p 档；新增 mars / venus；icon.wxss 81 → 88 条 |

### 18.2 自检结果

```
npm test                                 149 passed（38 源 + 111 验收）  ← 137 → 149
npm run typecheck / typecheck:test       通过
npm run diff:types / diff:data / diff:engine   三文件零差异（H57 红线未破）
npm run check:icons                      88 条 class / 67 处静态引用，零缺失
npm run check:wxs / check:wxml           零问题
```

### 18.3 与规格的偏差

5 处，逐条理由见 `PROGRESS.md` §M13（R5-1 不改码 / fxRelation 挪位 / 学习物品 when 扩展 /
空化妆品组显式插入 / fxline 动态计算）。

### 18.4 待真机

`ACCEPTANCE.md` §7 第五轮新增项 **H38–H57**；成败点是 **H38**（滑动是否生效），
验证清单已写在 H38 备注 —— 先确认重新扫码，再看控制台，最后才考虑方案 A/B。


---

## 19. 第六轮反馈落地（2026-10-02）

需求来源：老板口头反馈 7 项（无需求文档）。测试 149 → 155，红线三连零差异。

| # | 反馈 | 结果 |
|---|---|---|
| 1 | 性别页删说明文字 + 男/女加大 | 完成（.pickrow-lg：132rpx 行高 / 34rpx 字号） |
| 2 | 「看病」图标 | 换成医疗十字 medical-cross（圆角方框 + 加号） |
| 3 | 删偏好页「培训 / 学习」 | 完成；学习物品唯一由「学习培训」标签触发，老数据 study 字段兼容保留 |
| 4 | 「替其他人管行李」开关 | 第 ① 步新增，默认开；关 = 清单按自己 1 人生成（buildPrepExt 前置降级，源引擎零改动） |
| 5 | 好物页 | 「恢复默认好物」删除（modal 下线，resetGear 引擎能力保留）；「添加好物」下移到列表下方 |
| 6 | 下拉面板滚不动 / 选完没法编辑 | 列表区改 scroll-view（catchtouchmove 取消 overflow 默认滚动是根因）+ 列表末尾「自定义」项（点击聚焦）+ 输入行常驻底部 |
| 7 | 化妆品位置 + 预置 | 组位置修复（push 后统一按 CAT_ORDER_EXT 排序，落在衣物与出行之间）；预置香水/口红/粉底（仅女性） |

验收清单新增 H58–H65（ACCEPTANCE.md §7）；进度详见 PROGRESS.md §M14。

### 19.1 · R6.5 追加（同日）：管行李开关的流程连锁

- 关=跳过「人数 / 同行人员」两步（7 步变 5 步）；进度按位置计数（stepPos），底部保存判定同步；
- 关=同行数据清零、关系归「独自」；开=恢复 7 步（同行信息需重新填写）；
- 第 ① 步说明扩为「后续步骤 + 清单」两层各两行；buildEffects 的人数行在关掉时不再输出。


---

## 20. 第七轮反馈落地（2026-10-02）

| # | 反馈 | 结果 |
|---|---|---|
| 1 | 知识库免责声明与「我的」重复 → 删知识库这份 | 完成（结构/数据/样式三处清除，`.b` 加粗保留给条目正文；「我的」同源保留） |
| 2 | 色块生硬拼接（色块拼凑.jpg） | 根因 = page 级渐变只画第一屏；改为六页面各挂固定定位 `.bg-glow` 层，渐变铺满视口不随滚动 |

测试 156 → 158；红线三连零差异。验收项 H66–H68（ACCEPTANCE.md §7）。
