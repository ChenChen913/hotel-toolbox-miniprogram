// 知识库 —— 源实现 src/components/KnowledgeView.vue
// 免责声明（不可删）→ 等级图例 → 11 个模块 · 44 条，逐条可展开，紧急话术一键复制。
//
// 与源实现的差异（平台导致）：
//   1. 富文本：源实现用 v-html（先 esc 再替换 ** 为 <strong>）。小程序没有 v-html 也不允许
//      动态节点，故把正文预解析成「段落 → 片段（普通/加粗）」结构，用 text 组件渲染。
//      零 HTML、零注入风险，且加粗范围与源实现完全一致。
//   2. navigator.clipboard → wx.setClipboardData（会由系统弹「内容已复制」提示）。
//   3. <details> → 自绘展开态（data 里的 open 布尔）。
//   4. scrollIntoView → createSelectorQuery + pageScrollTo。
//   5. 「返回行程」：知识库是 tabBar 页，进入靠 switchTab（清栈），故返回用 reLaunch。

// R7：免责声明移至「我的」页（知识库这份与它重复），DISCLAIMER 不再被本页引用
import { EVIDENCE_META, KNOWLEDGE, RISK_META } from '../../core/data';
import { takeNav } from '../../core/nav';
import { shouldShowGoTop } from '../../core/gesture';
import { toParas } from '../../core/rich';
import type { Para } from '../../core/rich';
import { syncTabBar } from '../../core/tabbar';
import type { KnowledgeEntry } from '../../core/types';

interface EntryVM {
  id: string;
  title: string;
  tone: string;
  evi: string;
  source: string;
  updated: string;
  hasCopy: boolean;
  review: boolean;
  open: boolean;
  paras: Para[];
}
interface ModuleVM {
  name: string;
  count: number;
  /** P2-1：模块级折叠。默认 false —— 进来先看到 11 行目录，而不是 44 条正文 */
  open: boolean;
  items: EntryVM[];
}
interface LegendVM {
  label: string;
  tone: string;
}

// 富文本预解析（parseInline / toParas）已抽到 core/rich.ts，与「我的」页共用。
// 知识库这边不再自己维护一份，避免两处口径漂移。

/** 法规时效条目到期后提示复核（源实现 needsReview，函数体一致） */
function needsReview(k: KnowledgeEntry): boolean {
  if (!k.reviewBy) return false;
  const [y, m] = k.reviewBy.split('-').map(Number);
  return new Date() >= new Date(y, m - 1, 1);
}

function buildModules(): ModuleVM[] {
  const names: string[] = [];
  KNOWLEDGE.forEach(k => {
    if (!names.includes(k.module)) names.push(k.module);
  });
  return names.map(name => ({
    name,
    count: KNOWLEDGE.filter(k => k.module === name).length,
    // P2-1：默认全收起。要「进来就能看到目录」而不是「一屏 44 条」
    open: false,
    items: KNOWLEDGE.filter(k => k.module === name).map(k => ({
      id: k.id,
      title: k.title,
      tone: RISK_META[k.risk].tone,
      evi: EVIDENCE_META[k.evidence].label,
      source: k.source,
      updated: k.updated,
      hasCopy: !!k.copy,
      review: needsReview(k),
      open: false,
      paras: toParas(k.body),
    })),
  }));
}

Page({
  data: {
    eviList: [] as LegendVM[],
    riskList: [] as LegendVM[],
    total: 0,
    modCount: 0,
    modules: [] as ModuleVM[],
    showBack: false,
    stayId: '',
    copiedId: '',

    /** P1-1 回到顶部按钮显隐 */
    showGoTop: false,
  },

  onLoad() {
    const eviList: LegendVM[] = Object.keys(EVIDENCE_META).map(k => ({
      label: EVIDENCE_META[k].label,
      tone: EVIDENCE_META[k].tone,
    }));
    const riskList: LegendVM[] = Object.keys(RISK_META).map(k => ({
      label: RISK_META[k].label,
      tone: RISK_META[k].tone,
    }));
    const modules = buildModules();
    this.setData({
      eviList,
      riskList,
      total: KNOWLEDGE.length,
      modCount: modules.length,
      modules,
    });
  },

  onShow() {
    syncTabBar(this, 2);
    const nav = takeNav();
    const showBack = nav.knowFrom === 'stay' && !!nav.stayId;
    if (!nav.knowModule) {
      this.setData({ showBack, stayId: nav.stayId });
      return;
    }
    const mi = this.data.modules.findIndex(m => m.name === nav.knowModule);
    if (mi < 0) {
      this.setData({ showBack, stayId: nav.stayId });
      return;
    }
    // 锚点模块：用户是从行程页点「知识详解」跳进来的，直奔正文 ——
    // 展开目标模块 + 其全部条目，并收起其它模块（与手风琴行为一致），
    // 渲染完成后滚动定位。
    // 注意补丁的写入顺序：先批量收起，再单独把目标模块置 true，
    // 这样目标模块原本就是展开态时也不会被误收。
    const patch: Record<string, unknown> = { showBack, stayId: nav.stayId };
    this.data.modules.forEach((m, i) => {
      if (m.open) patch[`modules[${i}].open`] = false;
    });
    patch[`modules[${mi}].open`] = true;
    this.data.modules[mi].items.forEach((_, ii) => {
      patch[`modules[${mi}].items[${ii}].open`] = true;
    });
    this.setData(patch, () => this.scrollToModule(mi));
  },

  scrollToModule(mi: number) {
    const q = wx.createSelectorQuery();
    q.select('#mod-' + mi).boundingClientRect();
    q.selectViewport().scrollOffset();
    q.exec((res: unknown[]) => {
      const rect = res[0] as { top: number } | null;
      const vp = res[1] as { scrollTop: number } | null;
      if (!rect || !vp) return;
      wx.pageScrollTo({ scrollTop: vp.scrollTop + rect.top - 12, duration: 200 });
    });
  },

  /**
   * P2-1：模块级折叠（手风琴 —— 同一时刻最多展开一个模块）。
   * 点已展开的模块 = 收起，回到「只看目录」。
   *
   * 为什么不用 setData({ modules }) 整份回传：modules 里挂着 44 条富文本的预解析结果
   * （段落 → 片段），整份回传要序列化几十 KB，点一下卡一下。
   * 这里只打「路径补丁」，且只补真正发生变化的 open 字段。
   */
  toggleModule(e: WechatMiniprogram.TouchEvent) {
    const mi = Number(e.currentTarget.dataset.mi);
    const mods = this.data.modules;
    if (!mods[mi]) return;
    const willOpen = !mods[mi].open;
    const patch: Record<string, boolean> = {};
    mods.forEach((m, i) => {
      const v = i === mi ? willOpen : false;
      if (m.open !== v) patch[`modules[${i}].open`] = v;
    });
    if (Object.keys(patch).length) this.setData(patch);
  },

  toggleEntry(e: WechatMiniprogram.TouchEvent) {
    const mi = Number(e.currentTarget.dataset.mi);
    const ii = Number(e.currentTarget.dataset.ii);
    const mod = this.data.modules[mi];
    if (!mod || !mod.items[ii]) return;
    this.setData({ [`modules[${mi}].items[${ii}].open`]: !mod.items[ii].open });
  },

  copyEntry(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id || '');
    const k = KNOWLEDGE.find(x => x.id === id);
    if (!k || !k.copy) return;
    wx.setClipboardData({
      data: k.copy,
      success: () => {
        this.setData({ copiedId: id });
        setTimeout(() => {
          if (this.data.copiedId === id) this.setData({ copiedId: '' });
        }, 1500);
      },
    });
  },

  backToStay() {
    if (this.data.stayId) wx.reLaunch({ url: '/pages/stay/stay?id=' + this.data.stayId });
    else wx.switchTab({ url: '/pages/home/home' });
  },

  /** P1-1：滚动一点就显示「回到顶部」（每帧触发，只做布尔翻转判断，禁止构造大对象） */
  onPageScroll(e: WechatMiniprogram.Page.IPageScrollOption) {
    const show = shouldShowGoTop(e.scrollTop);
    if (show !== this.data.showGoTop) this.setData({ showGoTop: show });
  },

  goTop() {
    wx.pageScrollTo({ scrollTop: 0, duration: 300 });
  },
});
