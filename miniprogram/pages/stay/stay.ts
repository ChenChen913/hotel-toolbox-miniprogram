// 行程页 —— 源实现 src/components/StayView.vue + CheckStage.vue + CheckGroupBlock.vue
// 头部 / 三段页签 / 准备清单 / 入住检查 / 退房检查 / 自定义添加 / 删除行程。
//
// 与源实现的差异（平台导致）：
//   1. Vue 响应式 → data + setData：所有改动一律「读 stay → 改 → saveStay → 整页重渲」。
//   2. 清单由 prep + custom 合并排序后分组，无法用对象引用定位，改用稳定键 ikey（'p3'/'c1'）。
//   3. confirm() → 自绘 modal 组件（P0-6，替代 wx.showModal）。
//   4. 「紧急 / 知识详解」跳知识库是 tabBar 页，switchTab 不能带参，锚点走 core/nav.ts。
//   5. 源实现 addCustom() 后没有 persist，小程序版统一走 mutate() 落盘（源项目疑漏，未改源）。

import { CHECKLISTS, CUSTOM_HINTS } from '../../core/data';
import { deleteStay, getStay, saveStay } from '../../core/engine';
import {
  CAT_ORDER_EXT, COSMETIC_TYPES, getStayExt, removeStayExt, sortItemsExt, splitByQty,
} from '../../core/extra';
import { shouldShowGoTop } from '../../core/gesture';
import { setNav } from '../../core/nav';
import { fmtDate, suggestedStage } from '../../core/store';
import { TOAST_MS, TOAST_ZERO_TEXT, shouldToastZero } from '../../core/toast';
import type { PrepItem, Stage, Stay } from '../../core/types';

/** 带稳定键的清单项：'p3' = prep[3]，'c1' = custom[1] */
interface ItemVM extends PrepItem {
  _k: string;
}
interface PrepGroupVM {
  cat: string;
  items: ItemVM[];
  /** 分组内已备齐 / 总数（折叠时也能看到进度，P1-3） */
  done: number;
  total: number;
  /** P1-3 折叠态：存在 UI 层 storage，不进 Stay 数据（避免破坏与源项目的数据一致性） */
  collapsed: boolean;
}
interface CheckItemVM {
  text: string;
  done: boolean;
}
interface CheckGroupVM {
  name: string;
  tone: string;
  note: string;
  link: string;
  items: CheckItemVM[];
}
interface HintVM {
  icon: string;
  text: string;
}

const RISK_TONE: Record<string, string> = { high: 'red', mid: 'orange', low: 'slate' };
const STAGE_LABEL: Record<Stage, string> = { prep: '准备', checkin: '入住', checkout: '退房' };

/**
 * 头部阶段提示。只有「真的按日期推断出来的」才能说「按日期定位」（02 §6 定死的口径），
 * 用户自己切过（页签 / 滑动）一律用中性文案。
 * render 与 gotoStage 两处共用 —— 文案写两份迟早漂移。
 */
function stageHintOf(stage: Stage, auto: boolean): string {
  return auto
    ? `按日期已为你定位到「${STAGE_LABEL[stage]}」阶段`
    : `${STAGE_LABEL[stage]}阶段 · 左右滑动或点上方页签切换`;
}

/** 三段阶段的合法值。用于校验 URL 参数，避免把任意字符串塞进 stage。 */
const STAGES: Stage[] = ['prep', 'checkin', 'checkout'];
function isStage(v: unknown): v is Stage {
  return typeof v === 'string' && (STAGES as string[]).indexOf(v) >= 0;
}

interface KeyValEvent {
  detail: { idx: number; ikey: string; value: unknown };
}

/** 稳定键 → 实际对象引用 */
function locate(s: Stay, k: string): PrepItem | null {
  if (!k) return null;
  const i = Number(k.slice(1));
  if (Number.isNaN(i)) return null;
  const arr = k[0] === 'p' ? s.prep : s.custom;
  return arr[i] || null;
}

/* —— P1-3 分组折叠状态 ——
   存在独立的 UI 层 storage key（htb_ui_*），**不塞进 Stay 数据**：
   否则会破坏与源 Web 项目的数据一致性（红线要求 core/{types,data,engine} 零差异）。

   v2 起**按行程隔离**：结构是 { [stayId]: { [分类]: 是否折叠 } }。
   为什么必须隔离：v1 是按分类名全局共享的，于是在 A 行程里折叠了「衣物」，
   B 行程打开时「衣物」也是折叠的 —— 用户看到的就是「有的展开有的折叠、还找不出规律」。
   隔离之后，**新行程没有任何记录 → 全部分组默认展开**。 */
const COLLAPSE_KEY = 'htb_ui_collapsed_v2';

type CollapseStore = Record<string, Record<string, boolean>>;

function loadCollapsed(stayId: string): Record<string, boolean> {
  const all = wx.getStorageSync(COLLAPSE_KEY);
  if (!all || typeof all !== 'object') return {};
  const m = (all as CollapseStore)[stayId];
  return m && typeof m === 'object' ? m : {};
}

function saveCollapsed(stayId: string, m: Record<string, boolean>) {
  const all = wx.getStorageSync(COLLAPSE_KEY);
  const store: CollapseStore = all && typeof all === 'object' ? (all as CollapseStore) : {};
  store[stayId] = m;
  wx.setStorageSync(COLLAPSE_KEY, store);
}

/* —— M17 首进提速：各段内容高度缓存（UI 层 storage，按行程 + 段位隔离）——
   背景：swiper 必须有确定高度，首帧兜底 600 → 量到实高会有一段「内容展开」的过渡，
   从首页点进来时观感就是「加载了一小会儿」。缓存上次量得的高度做首帧初值，
   进入瞬间页高就是对的，量高只是校准（数据没变时无差异、零跳变）。
   量到实高后回写；删除行程 / 清空数据时清除（与 collapsed 同一套防残留策略）。
   读不到 / 值非法一律回退 600 —— 缓存只是性能优化，坏了不能带崩页面。 */
const PANE_H_KEY = 'htb_ui_paneh_v1';

type PaneHStore = Record<string, number[]>;

function loadPaneH(stayId: string, idx: number): number {
  try {
    const all = wx.getStorageSync(PANE_H_KEY) as unknown;
    if (!all || typeof all !== 'object') return 600;
    const arr = (all as PaneHStore)[stayId];
    const h = arr && arr[idx];
    return typeof h === 'number' && h > 0 ? h : 600;
  } catch {
    return 600;
  }
}

function savePaneH(stayId: string, idx: number, h: number) {
  try {
    const all = wx.getStorageSync(PANE_H_KEY) as unknown;
    const store: PaneHStore = all && typeof all === 'object' ? (all as PaneHStore) : {};
    const arr = store[stayId] || [0, 0, 0];
    arr[idx] = h;
    store[stayId] = arr;
    wx.setStorageSync(PANE_H_KEY, store);
  } catch {
    /* 缓存写失败只是下次首帧回到兜底值，不值得打扰用户 */
  }
}

function removePaneH(stayId: string) {
  try {
    const all = wx.getStorageSync(PANE_H_KEY) as unknown;
    if (!all || typeof all !== 'object') return;
    const store = all as PaneHStore;
    delete store[stayId];
    wx.setStorageSync(PANE_H_KEY, store);
  } catch {
    /* 同上：清不掉只是多占几字节 */
  }
}

Page({
  /** R4-4 浮窗定时器句柄。放 data 外：它不参与渲染 */
  _toastTimer: null as ReturnType<typeof setTimeout> | null,

  /** M17 首进提速：URL 参数暂存。onLoad 不再 setData，onShow 首进时并入大提交 */
  _bootId: '',
  _bootStage: '',

  data: {
    id: '',
    loaded: false,
    missing: false,

    dateLabel: '',
    nights: 0,
    purpose: '',
    /** 扩展层住宿关系（如「 · 情侣」），没有则为空串 */
    relationLabel: '',
    stageHint: '',
    stage: 'prep' as Stage,
    /** 当前段在三段里的下标（M16 起喂给 <swiper current>；STAGES 与下标一一对应） */
    stageIdx: 0,
    /**
     * swiper 的像素高度。swiper 必须有确定高度，而三段内容高度差很大，
     * 所以按「当前段实际内容高」动态量取（见 measureSwiper）。
     * 600 只是「无缓存时」的首帧兜底 —— M17 首进时 render 会直接带上次
     * 量得的高度（loadPaneH），量高回调里再校准 + 回写。
     */
    swiperH: 600,
    /**
     * 首次进入要落在哪一段，由来源页通过 URL 参数指定（如向导保存后 ?stage=prep）。
     * 空串表示不指定，交给 suggestedStage() 按日期推断。
     *
     * 为什么需要它：suggestedStage 是「按日期推断」，当天入住会推断成 checkin。
     * 但「刚保存完这次入住」这个场景下用户要做的显然是**准备物品**，不是入住检查，
     * 所以向导那边显式指定 prep。仅影响首次进入，用户手动切过的页签不会被覆盖。
     */
    initStage: '',
    /**
     * 当前所处阶段是不是「系统按日期自动定位」的结果。
     * true  → 头部提示用规格原文「按日期已为你定位到「X」阶段」（02 §6 定死了这句）
     * false → 用户自己切过来的，说「按日期定位」就是假话，换成中性提示
     *         （顺带把「左右滑动」这个新手势讲出来）
     */
    stageAuto: true,

    /**
     * 准备段的渲染数据（喂给 <template name="prepBody">）。
     * R4-5 起三段要同时渲染（当前段 + 两侧预览），所以数据也按段分开放。
     */
    prep: {
      groups: [] as PrepGroupVM[],
      done: 0,
      total: 0,
      /** qty === 0（不带）的项：不进清单，收在底部「已设为不带」区域里可恢复 */
      zeroItems: [] as ItemVM[],
    },
    /** 检查段的渲染数据，按 stage 取（喂给 <template name="checkBody">） */
    checkMap: {
      checkin: { groups: [] as CheckGroupVM[], done: 0, total: 0 },
      checkout: { groups: [] as CheckGroupVM[], done: 0, total: 0 },
    },
    /**
     * 三段共用的小状态。
     * 为什么打包成一个对象：<template> 只能看到**显式传进去**的 data，看不到页面 data，
     * 所以每次 <template is> 都要把它们带上，打成一包省得写一长串。
     */
    common: {
      /** 使用人可选项：['全体', ...guests.label]，长度 > 1 才传给孩子组件（源实现 assignOptions） */
      assignOpts: [] as string[],
      /** M17 首进提速：常量表直接作初始值（此前每次 onLoad 都要 setData 提交一遍，纯浪费一次渲染往返） */
      hints: CUSTOM_HINTS as HintVM[],
      zeroOpen: false,
      customName: '',
      customQty: 1,
    },

    /** R5-6：化妆品下拉的预设类型（数据在 core/extra.ts） */
    cosmeticTypes: COSMETIC_TYPES,

    /** P1-1 回到顶部按钮显隐（阈值见 core/gesture.ts 的 SCROLL_TOP_TRIGGER） */
    showGoTop: false,

    /** P0-6 自定义确认弹窗状态 */
    modal: { show: false, title: '', content: '', confirmText: '确定', danger: false },

    /** R4-4：数量归零浮窗（时长走 core/toast.ts 的 TOAST_MS，与向导第 ⑥ 步一致） */
    toastShow: false,
    toastText: '',
  },

  onLoad(options: Record<string, string>) {
    // ⚡ M17 首进提速：这里不再 setData —— id / initStage 并入 onShow 首进的
    //    同一次大提交（onLoad 到 onShow 之间页面还没渲染，data 不会被任何人读到，
    //    提前提交只是白付一次「序列化 + 视图层往返」）。
    // 非法值一律忽略，回退到按日期推断
    this._bootId = String(options.id || '');
    this._bootStage = isStage(options.stage) ? options.stage : '';
  },

  /** 页面滚动（每帧触发的高频回调，只做布尔翻转判断，禁止构造大对象）：
      ① 关闭衣物 / 化妆品浮层（fixed 面板不跟手，滚动即关闭比错位更可控）
      ② 决定「回到顶部」按钮的显隐（P1-1） */
  onPageScroll(e: WechatMiniprogram.Page.IPageScrollOption) {
    this.closeAddPanels();

    // 原为写死的 scrollTop > 600（要划一屏多才出现，用户反馈「太晚」），
    // 现统一走 core/gesture.ts 的阈值，改一处两个页面同时生效
    const show = shouldShowGoTop(e.scrollTop);
    if (show !== this.data.showGoTop) this.setData({ showGoTop: show });
  },

  goTop() {
    wx.pageScrollTo({ scrollTop: 0, duration: 300 });
  },

  onShow() {
    // ⚡ M17 首进提速：id / initStage / loaded / stageAuto 连同整页 VM 并入
    //    render 的**同一次**提交 —— 此前 onLoad、onShow、render 各提交一次，
    //    三次渲染管线往返串行，从首页点进来会先看到空骨架再等内容「啪」地出现。
    const first = !this.data.loaded;
    const id = first ? this._bootId : this.data.id;
    const s = getStay(id);
    if (!s) {
      // 首进时 id 还没落 data，missing 态一并把它带上（goBack 等方法语义才完整）
      this.setData({ id, missing: true });
      return;
    }
    // 首次进入：优先用来源页指定的阶段（向导保存后带 ?stage=prep），没指定才按日期推断；
    // 之后用户手动切过的页签不被覆盖。
    const forced = first && isStage(this._bootStage) ? this._bootStage : null;
    const stage: Stage = first ? (forced || suggestedStage(s)) : this.data.stage;
    this.render(s, stage, first ? {
      id,
      initStage: this._bootStage,
      loaded: true,
      // 只有「真的按日期推断出来的」才算自动定位；来源页指定过就不算
      stageAuto: !forced,
      // 首帧直接用上次量得的高度：进入瞬间就是正确页高，不再「兜底 600 → 展开」
      swiperH: loadPaneH(id, STAGES.indexOf(stage)),
    } : undefined);
  },

  /** 把 stay 渲染成视图数据（全量重渲，清单规模 <60 行，开销可忽略）。
      M17 首进提速：extra 里的字段（id / loaded / 高度缓存初值等）并入同一次提交，
      stageHint 读 extra.stageAuto —— 它与 stageAuto 同批提交，此时 this.data 还是旧值。 */
  render(s: Stay, stage: Stage, extra?: Partial<{ id: string; initStage: string; loaded: boolean; stageAuto: boolean; swiperH: number }>) {
    // 排序/分组用 CAT_ORDER_EXT（扩展层分类顺序）：源 CAT_ORDER 里没有「娱乐 / 学习」，
    // 直接拿它 indexOf 会得到 -1，把这两组顶到清单最前面。
    const all = sortItemsExt([
      ...s.prep.map((it, i) => ({ ...it, _k: 'p' + i })),
      ...s.custom.map((it, i) => ({ ...it, _k: 'c' + i })),
    ]) as ItemVM[];

    // qty === 0 = 「不带」：不再占着准备清单的位置，也不进「已备齐」的分子分母
    // （这一项勾选框是禁用的，留在分母里会让进度永远到不了 100%）。
    // 数据层不动 —— 项仍留在 s.prep / s.custom 里，只是不渲染，
    // 底部「已设为不带」区域可随时恢复，避免「设为 0 就再也找不回来」。
    const { active: items, zero: zeroItems } = splitByQty(all);

    // 住宿关系存在扩展层（独立 storage key，不进 Stay）：老数据 / 导入的数据可能没有，故做兜底
    const ext = getStayExt(s.id);
    const relationLabel = ext ? ' · ' + ext.relation : '';

    // R5-6 / R6 修复：女性追加「化妆品」分组（有预置物品时组自然出现；全被设为
    // 不带 / 删掉后这个兜底保证添加入口仍在），**加进 cats 后统一按 CAT_ORDER_EXT
    // 排序** —— 之前是 push 在末尾，导致化妆品组跑到清单最后而不是衣物后面（老板点名）。
    // M18 查重：女性行程预置香水/口红/粉底后 items 已含「化妆品」，无条件 push
    // 会出现两个一模一样的「化妆品」组（老板真机抓到）—— push 前先查重。
    // 男性 / 性别未知（老数据）不出现这个入口 —— 老行程的清单一个都不许变（H49）。
    const cats = [...new Set(items.map(i => i.cat))];
    if (ext && ext.gender === 'female' && !cats.includes('化妆品')) cats.push('化妆品');
    cats.sort((a, b) => CAT_ORDER_EXT.indexOf(a) - CAT_ORDER_EXT.indexOf(b));
    // 折叠状态按行程隔离：新行程查不到记录 → 全部分组默认展开
    const collapsedMap = loadCollapsed(s.id);
    const groups: PrepGroupVM[] = cats.map(cat => {
      const gi = items.filter(i => i.cat === cat);
      return {
        cat,
        items: gi,
        done: gi.filter(i => i.done).length,
        total: gi.length,
        collapsed: !!collapsedMap[cat],
      };
    });

    /**
     * 某一检查段的渲染数据。
     * 三段要同时渲染（当前段 + 两侧预览），所以这里按段算好，模板直接取。
     */
    const checkOf = (st: Stage): { groups: CheckGroupVM[]; done: number; total: number } => {
      if (st === 'prep') return { groups: [], done: 0, total: 0 };
      const cl = CHECKLISTS[st];
      return {
        groups: cl.groups.map((g, gi) => ({
          name: g.name,
          tone: RISK_TONE[g.risk] || 'slate',
          note: g.note || '',
          link: g.link || '',
          items: g.items.map((t, ii) => ({ text: t, done: !!s[st][gi][ii] })),
        })),
        total: cl.groups.reduce((n, g) => n + g.items.length, 0),
        done: s[st].reduce((n, g) => n + g.filter(Boolean).length, 0),
      };
    };

    // 源实现：opts = ['全体', ...guests.map(g => g.label)]，长度 > 1 才出现下拉
    const opts = ['全体', ...(s.guests || []).map(g => g.label)];

    const i = STAGES.indexOf(stage);

    // setData 第二参回调：渲染落地后再量当前段高度，撑起 swiper。
    // extra 放前面：首进字段与 VM 一次提交（M17）；与后续字段无同名冲突。
    this.setData({
      ...extra,
      missing: false,
      stage,
      stageIdx: i,
      dateLabel: fmtDate(s.date),
      nights: s.nights,
      purpose: s.conditions.purpose,
      relationLabel,
      stageHint: stageHintOf(stage, extra?.stageAuto ?? this.data.stageAuto),
      prep: {
        groups,
        done: items.filter(i => i.done).length,
        total: items.length,
        zeroItems,
      },
      checkMap: { checkin: checkOf('checkin'), checkout: checkOf('checkout') },
      'common.assignOpts': opts.length > 1 ? opts : [],
    }, () => this.measureSwiper());
  },

  /** 所有写操作的统一入口：读 → 改 → 存 → 重渲 */
  mutate(fn: (s: Stay) => void) {
    const s = getStay(this.data.id);
    if (!s) return;
    fn(s);
    saveStay(s);
    this.render(s, this.data.stage);
  },

  // —— 头部 ——
  goBack() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/home/home' });
  },

  goEmergency() {
    setNav({ knowModule: '紧急联络', knowFrom: 'stay', stayId: this.data.id });
    wx.switchTab({ url: '/pages/knowledge/knowledge' });
  },

  // —— 三段页签 ——
  /**
   * 切换三段阶段。页签点击与左右滑动共用这一个入口，避免两条路径各写一份逻辑。
   * 用户自己切过之后把 stageAuto 置 false —— 否则头部会一直声称「按日期定位」，
   * 而实际上人是自己划过来的。
   *
   * ⚡ 轻量路径（流畅度优化的核心）：切段**不产生任何数据变化**，清单 VM
   * （prep / checkMap / common）原样可用 —— 因此不走 render 的全量重算与
   * 大对象 setData，只提交阶段相关的小字段。此前「先 setData stageAuto、
   * 再全量 render、回调再量高」共三次渲染管线往返，低端机上松手瞬间明显掉帧；
   * 现在缩到一次小提交 + 一次量高。三段常驻渲染还让 isCur 的派生
   * （stage 变化 → 模板表达式重算）能吃到增量 diff，代价极小。
   * render 的全量路径只留给真正的数据变化（mutate / onShow）。
   */
  gotoStage(stage: Stage) {
    if (!isStage(stage) || stage === this.data.stage) return;
    if (!getStay(this.data.id)) return;   // 只做存在性兜底（missing 态），不取数据
    this.setData({
      stage,
      stageIdx: STAGES.indexOf(stage),
      stageAuto: false,
      stageHint: stageHintOf(stage, false),
    }, () => this.measureSwiper());
  },

  onStage(e: WechatMiniprogram.TouchEvent) {
    this.gotoStage(String(e.currentTarget.dataset.s || '') as Stage);
  },

  // —— 左右滑动切换阶段（M16 滑动终案：原生 <swiper> 承载）——
  /**
   * 为什么换成原生 swiper：前几轮的页面层 touch 判定与 WXS 视图层方案，
   * 都依赖把 touch 事件链路接到页面节点上 —— 真机 iOS 对这条链路的支持不稳定，
   * 连续四轮反馈「没反应」，而 WXS 跑在视图层、出错无日志，失败完全无声。
   * 原生 swiper 的手势由微信客户端自己实现，跟手与触发有平台级保证
   * （CHANGE-REQUESTS02 §2.5 的拍板结论：不要再用 swiper 之外的方式追求跟手）。
   *
   * 防回环：程序 setData current 也会触发 bindchange（此时 source 为空串），
   * 只认 source === 'touch'（用户手势），否则会和 render() 互相触发。
   * 切段仍然走 gotoStage —— 与点页签同一个入口，两条路径不会各自漂移。
   */
  onSwiperChange(e: WechatMiniprogram.CustomEvent<{ current: number; source: string }>) {
    if (e.detail.source !== 'touch') return;
    this.gotoStage(STAGES[e.detail.current] ?? this.data.stage);
  },

  /**
   * 量当前段的实际内容高度，撑起 swiper（swiper 必须有确定高度）。
   * 在 render() 的 setData 回调里调 —— 回调触发时渲染已落地，量到的是真实高度；
   * 折叠/展开分组不走 render（只 setData 数据路径），toggleGroup 里单独再调。
   *
   * 乱序防御：快速连划两段时会先后发出两次查询，回调返回顺序不保证 ——
   * 回调到达时如果用户已经又切了段，旧段的高度必须丢弃，
   * 否则会把 swiper 撑成「上上段」的高度，再被下一次量高跳回来（肉眼可见的高度抖动）。
   */
  measureSwiper() {
    const idx = this.data.stageIdx;
    wx.createSelectorQuery()
      .select(`#pane${idx}`)
      .boundingClientRect(rect => {
        if (idx !== this.data.stageIdx) return;
        if (rect && rect.height > 0) {
          this.setData({ swiperH: rect.height });
          // M17 首进提速：回写高度缓存 —— 下次进这个行程，首帧直接就是正确页高
          savePaneH(this.data.id, idx, rect.height);
        }
      })
      .exec();
  },

  /** 衣物与化妆品两个下拉面板统一关闭（onPageScroll 滚动即关）。
      M16 改用 swiper 后不再需要手势锁：modal / 面板的全屏遮罩 catchtouchmove
      天然挡住滑动手势，WXS 时代那套数据通道锁随之整体删除。 */
  closeAddPanels() {
    (['#clothingAdd', '#cosmeticAdd'] as const).forEach(sel => {
      const c = this.selectComponent(sel) as { close?: () => void } | null;
      if (c && typeof c.close === 'function') c.close();
    });
  },

  /** P1-3：折叠/展开某个分组。
      用数据路径 setData（R6），不整份回传 groups；状态持久化到 UI 层 storage。
      折叠不走 render()，高度变化必须单独重量，否则 swiper 高度停留在旧值。 */
  toggleGroup(e: WechatMiniprogram.TouchEvent) {
    const gi = Number(e.currentTarget.dataset.gi);
    const g = this.data.prep.groups[gi];
    if (!g) return;
    const next = !g.collapsed;
    this.setData({ [`prep.groups[${gi}].collapsed`]: next }, () => this.measureSwiper());
    const m = loadCollapsed(this.data.id);
    m[g.cat] = next;
    saveCollapsed(this.data.id, m);
  },

  // —— 准备清单 ——
  onItemToggle(e: KeyValEvent) {
    const k = String(e.detail.ikey || '');
    const v = Boolean(e.detail.value);
    this.mutate(s => {
      const it = locate(s, k);
      if (it) it.done = v;
    });
  },

  onItemQty(e: KeyValEvent) {
    const k = String(e.detail.ikey || '');
    const v = Number(e.detail.value);
    if (Number.isNaN(v)) return;
    // R4-4：先读旧值 —— mutate 之后就分不清「本来就是 0」和「刚刚变成 0」了
    const before = getStay(this.data.id);
    const prev = before ? Number(locate(before, k)?.qty) : NaN;
    this.mutate(s => {
      const it = locate(s, k);
      if (it) it.qty = v;
    });
    // 数量减到 0 = 不带。这一行会立刻从清单里消失，得告诉用户它去哪了
    if (shouldToastZero(prev, v)) this.showToast(TOAST_ZERO_TEXT);
  },

  /** 展开 / 收起底部的「已设为不带」区域 */
  toggleZero() {
    this.setData({ 'common.zeroOpen': !this.data.common.zeroOpen });
  },

  /**
   * R4-4：弹一个小浮窗。
   * 连续触发时先清掉上一个定时器 —— 否则前一次的定时会把后一次的浮窗提前关掉。
   */
  showToast(text: string) {
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this.setData({ toastText: text, toastShow: true });
    this._toastTimer = setTimeout(() => {
      this.setData({ toastShow: false });
      this._toastTimer = null;
    }, TOAST_MS);
  },

  /** 页面卸载时清掉定时器，避免在已销毁的页面上 setData */
  onUnload() {
    if (this._toastTimer) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }
  },

  /**
   * 把「不带」的项恢复为 1 件。
   * 恢复到 1 而不是原来的数量：原始数量没有单独存（存了就破坏与源项目的数据一致性），
   * 1 是最小可用值，恢复后再按需加减。
   */
  restoreZero(e: WechatMiniprogram.TouchEvent) {
    const k = String(e.currentTarget.dataset.k || '');
    if (!k) return;
    this.mutate(s => {
      const it = locate(s, k);
      if (it) it.qty = 1;
    });
  },

  /** 使用人绑定：写入 item.assign（源实现 ItemRow.onAssign） */
  onItemAssign(e: KeyValEvent) {
    const k = String(e.detail.ikey || '');
    const v = String(e.detail.value ?? '');
    if (!v) return;
    this.mutate(s => {
      const it = locate(s, k);
      if (it) it.assign = v;
    });
  },

  /**
   * R5-6：衣物 / 化妆品下拉的统一添加入口。落点分类由标签上的 data-cat 决定
   * （一页两个面板，selectComponent('#clothingAdd') 会取错，事件路由靠 dataset）。
   * 新增到 custom（源实现同款字段）；同名不重复（custom 全局去重，衣物另查 prep 同分类同名）。
   */
  addTyped(e: WechatMiniprogram.CustomEvent) {
    const name = String(e.detail || '').trim();
    const cat = String(e.currentTarget.dataset.cat || '衣物');
    if (!name) return;
    this.mutate(s => {
      const dup =
        s.prep.some(i => i.cat === cat && i.name === name) ||
        s.custom.some(i => i.name === name);
      if (dup) return;
      s.custom.push({
        name,
        cat,
        unit: cat === '化妆品' ? '个' : '件',
        // M18：不再臆测用户「从家里带」—— 用户自己加的，就标「自定义」（与
        // 「还有一些东西」入口的物品同一口径），行内只显示事实标签。
        prep: '自定义',
        source: '自定义',
        users: '每人',
        qty: 1,
        done: false,
      });
    });
  },

  onCustomName(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'common.customName': String(e.detail.value || '') });
  },

  onCustomQty(e: WechatMiniprogram.CustomEvent) {
    const n = Number(e.detail.value);
    this.setData({ 'common.customQty': Number.isNaN(n) || n < 1 ? 1 : n });
  },

  addCustom() {
    const name = String(this.data.common.customName || '').trim();
    if (!name) return;
    const qty = Number(this.data.common.customQty) || 1;
    this.mutate(s => {
      s.custom.push({
        name,
        cat: '自定义',
        unit: '件',
        prep: '自定义',
        source: '自定义',
        users: '共用',
        qty,
        done: false,
      });
    });
    this.setData({ 'common.customName': '', 'common.customQty': 1 });
  },

  // —— 入住 / 退房检查 ——
  onCheck(e: WechatMiniprogram.TouchEvent) {
    const gi = Number(e.currentTarget.dataset.gi);
    const ii = Number(e.currentTarget.dataset.ii);
    if (Number.isNaN(gi) || Number.isNaN(ii)) return;
    const stage = this.data.stage;
    if (stage === 'prep') return;
    this.mutate(s => {
      s[stage][gi][ii] = !s[stage][gi][ii];
    });
  },

  goKnow(e: WechatMiniprogram.TouchEvent) {
    const m = String(e.currentTarget.dataset.m || '');
    if (!m) return;
    setNav({ knowModule: m, knowFrom: 'stay', stayId: this.data.id });
    wx.switchTab({ url: '/pages/knowledge/knowledge' });
  },

  // —— 删除（P0-6：自绘弹窗，替代 wx.showModal）——
  delStay() {
    this.setData({
      modal: {
        show: true,
        title: '删除这次入住',
        content: '删除这次入住的所有记录？',
        confirmText: '删除',
        danger: true,
      },
    });
  },

  onModalConfirm() {
    this.setData({ 'modal.show': false });
    deleteStay(this.data.id);
    // 同步清掉扩展层里这个行程的关系记录，否则 storage 会随删除次数无限增长
    removeStayExt(this.data.id);
    // 高度缓存同理：行程没了，缓存也不能残留（M17）
    removePaneH(this.data.id);
    wx.switchTab({ url: '/pages/home/home' });
  },

  onModalCancel() {
    this.setData({ 'modal.show': false });
  },
});
