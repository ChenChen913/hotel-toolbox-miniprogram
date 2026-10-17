// 创建向导 —— 源实现 src/components/WizardView.vue
// R5-3 起为 7 步：① 性别 → ② 日期晚数 → ③ 人数 → ④ 同行 → ⑤ 住宿情况 → ⑥ 偏好 → ⑦ 确认清单
//
// 与源实现的差异（仅平台导致的）：
//   1. Vue 的 reactive/computed 改为「draft 存 data + 每次改动后 syncDerived() 手动重算」
//      —— 小程序没有响应式，但语义完全一致：草稿改动不落盘，第 7 步保存时才 newStay + saveStay。
//   2. 预览清单用普通数组（非 computed），与源实现刻意的选择一致：
//      若用计算属性，用户在第 7 步添加的自定义物品会在重算时丢失（源注释明确要求）。
//   3. 提示条目取自 data.ts 的 CUSTOM_HINTS（6 条）。

import { newStay, saveStay } from '../../core/engine';
import { CUSTOM_HINTS } from '../../core/data';
import {
  CAT_ORDER_EXT, COMPANION_RELATIONS, COSMETIC_TYPES, DEFAULT_RELATION, MAX_CHILDREN,
  MAX_COMPANIONS, MAX_ELDERLY, PURPOSES_EXT, PURPOSE_ICONS,
  autoRelation, buildPrepExt, clampCompanions, companionBudget, getDefaultRelation, isGender,
  isPurposeExt, setStayExt, splitByQty, syncElderlyFlag, toSourcePurpose,
} from '../../core/extra';
import type { CompanionBudget, ConditionsExt, Gender, PurposeExt, Relation } from '../../core/extra';
import type { ChildAge, Conditions, PrepItem } from '../../core/types';
import { fmtDate } from '../../core/store';
import { TOAST_MS, TOAST_ZERO_TEXT, shouldToastZero } from '../../core/toast';

/** R5-3：向导全量步骤（新增第 ① 步「性别」） */
const ALL_STEPS = [1, 2, 3, 4, 5, 6, 7];
/**
 * R6.5：「替其他人管行李」关掉时的流程 —— 跳过第 ③ 步（人数）与第 ④ 步（同行人员）。
 * 清单已经按「自己 1 人」生成（见 core/extra.ts buildPrepExt 的降级），
 * 再问「几个人入住、和谁同行」就没有意义了；住宿情况 / 偏好 / 确认清单照常保留
 *（出差、旅游、经期这些只关于自己的维度仍然有效）。
 */
const SOLO_STEPS = [1, 2, 5, 6, 7];

interface AgeOpt {
  v: ChildAge;
  t: string;
}
interface GroupVM {
  cat: string;
  items: (PrepItem & { _i: number })[];
}
interface EffectVM {
  cond: string;
  items: string;
}

interface NumEvent {
  detail: number;
}
interface StrEvent {
  detail: string;
}
interface IdxValEvent {
  detail: { idx: number; value: number };
}

const pad = (n: number) => String(n).padStart(2, '0');
const dstr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 默认草稿（与 02 §2.0 一致） */
function defaultDraft(): Conditions {
  return {
    date: '',
    nights: 1,
    adults: 1,
    children: 0,
    childAge: '0-3',
    elderly: false,
    pet: false,
    purpose: '普通短住',
    prefs: { sleep: false, hygiene: false, mosquito: false, gadgets: false },
  };
}

/**
 * 打开某个条件后新增的物品名（对比开关前后 buildPrepExt 的差集，非硬编码）。
 * 走扩展层的 buildPrepExt —— 否则「朋友同行」「学习培训」带来的物品不会出现在影响说明里。
 */
function fxNames(on: ConditionsExt, off: ConditionsExt): string[] {
  const base = new Set(buildPrepExt(off).map(i => i.name));
  return buildPrepExt(on)
    .filter(i => !base.has(i.name))
    .map(i => i.name);
}

Page({
  data: {
    step: 1,
    /** 进度条 / N 分母：随「替其他人管行李」开关变化（7 步或 5 步，见 SOLO_STEPS） */
    total: ALL_STEPS.length,
    /**
     * R6.5：当前步在全量步骤里的**位置**（1 起算）。
     * 关掉「替其他人管行李」后步骤号不再连续（1,2,5,6,7），
     * 进度条与「N/M」必须用位置而不是步骤号，否则会出现「5/5 还没到最后一步」。
     */
    stepPos: 1,
    /** 本次的可见步骤序列（由 careOthers 决定，见 ALL_STEPS / SOLO_STEPS） */
    flow: ALL_STEPS,
    draft: defaultDraft() as Conditions,
    /** M18/M19：第 ⑥ 步开关是否已全开（四个「在意」+ 女性经期）—— 驱动「全选 / 取消全选」按钮文案 */
    prefsAll: false,

    ages: [
      { v: '0-3', t: '0–3 岁' },
      { v: '4-6', t: '4–6 岁' },
      { v: '7-12', t: '7–12 岁' },
      { v: '13+', t: '13 岁以上' },
    ] as AgeOpt[],

    // —— 扩展层维度（core/extra.ts）——
    // 都不进 draft：draft 是源 Conditions 的形状，存进 Stay 后必须与源项目保持一致。
    /** D1：住宿关系。源 Purpose 表达不了「情侣 / 朋友」，故单开一维 */
    companionRelations: COMPANION_RELATIONS as Relation[],
    relation: getDefaultRelation() as Relation,
    /** 关系带来的清单变化提示（只有「朋友 / 同事」会真的加东西，其余为空）。
     *  R5-4：关系的选择入口收拢到第 ③ 步同行人员，这条提示也跟着搬过去。 */
    fxRelation: '',

    /**
     * R6：替其他人管行李（第 ① 步的开关，不进 draft —— 属扩展层维度）。
     * 老板的观察：这个小工具一般是一个人用，多人入住时记录所有人的物品，
     * 反而让人分不清「该拿什么、不该拿什么」。
     *   · 开（默认）→ 与过去行为一致：儿童 / 老人 / 同行者的物品一起备，每人份按真实人数算
     *   · 关        → 只按「自己 1 人」生成清单，多人入住也只管自己的行李
     * 为什么默认开：带娃出行时儿童用品被漏掉的代价太大 —— 精简应该是主动选择，不是默认。
     * 清单层面的降级实现在 core/extra.ts 的 buildPrepExt（源引擎是红线，不动）。
     */
    careOthers: true,

    /**
     * R5-9：住宿情况的 7 个标签（源 Purpose 是红线不能加值，扩展值放 PurposeExt）。
     * 双写双读：draft.purpose 只存 toSourcePurpose() 的降级结果（源 4 值之一，
     * 源清单规则认它），purposeExt 存用户真正点的那个（界面回显、扩展层 when 认它）。
     */
    purposesExt: PURPOSES_EXT.map(k => ({ k, icon: PURPOSE_ICONS[k] })),
    purposeExt: '普通短住' as PurposeExt,
    /** 当前选中标签的提示行（动态由规则差集算出，不硬编码文案） */
    purposeFx: '',

    /**
     * R5-3：性别与经期。不进 draft —— draft 是源 Conditions 的形状（红线），
     * 与 relation / careOthers / purposeExt 一样走扩展层 storage（save 时写进 setStayExt）。
     * gender 用空串表示「未选」—— 第 ① 步未选时「开始」按钮灰显。
     */
    gender: '' as '' | Gender,
    /** R5-5：是否处于经期。仅女性可见、可开；性别切回男性时必须一起清掉（setGender 里做） */
    period: false,

    /** R5-6：化妆品下拉的预设类型（数据在 core/extra.ts，不写死在页面里） */
    cosmeticTypes: COSMETIC_TYPES,

    // —— R4-2：同行名额（成人同行 + 儿童 + 老人 ≤ adults − 1）——
    /** 成人同行人数（不含自己）。源 Conditions 没有这一维 */
    adultsWith: 0,
    /** 老人数量。源的 elderly 布尔由它派生 —— 见 syncDerived */
    elderlyCount: 0,
    /** 名额账：{ total, used, left } */
    budget: { total: 0, used: 0, left: 0 } as CompanionBudget,
    /**
     * 三个步进器「＋」的上限。
     * 在 JS 里算好（当前值 + 剩余名额，再压到各维度自己的上限），
     * 名额用尽时 max === value，stepper 自己就会把「＋」禁掉 —— 不用改组件。
     */
    maxAdult: 0,
    maxChild: 0,
    maxElderly: 0,
    /** 名额相关的说明文案（名额用尽 / 人数改小后自动裁剪时给出） */
    companionNote: '',

    // 保留 icon 字段：每条提示前有一个图标（源实现 HINT_ICONS）
    hints: CUSTOM_HINTS.map(h => ({ icon: h.icon, text: h.text })),

    customDate: false,
    dateLabel: '先选好日子',
    leaveLabel: '',
    quickOn: [false, false, false] as boolean[],
    /**
     * 「开始 / 下一步」按钮是否可用（按当前步判断，见 syncDerived：
     * 第 ① 步看性别、第 ② 步看日期、其余恒 true）。
     * 为什么必须拦：空日期会一路带进 newStay()，存出一条 date 为空的行程，
     * 而 suggestedStage() 对空日期一律返回 prep，这条行程就永远卡在准备阶段。
     */
    nextReady: false,
    fxChildren: '',
    fxElderly: '',

    /** P1-5：第 ③ 步按人数分支——1 人入住只剩「有没有宠物」这一维 */
    step3Q: '有宠物同行吗？',
    showChildren: false,

    conditionEffects: [] as EffectVM[],
    /** 区块 A「你的选择如何影响清单」的展开态。默认收起——它是解释性内容，
        每次进来都铺开会把真正的清单推到首屏之外。 */
    fxOpen: false,
    preview: [] as PrepItem[],
    groups: [] as GroupVM[],
    /** qty === 0（不带）的项：不进清单，收在底部「已设为不带」区域里可恢复 */
    zeroPreview: [] as (PrepItem & { _i: number })[],
    zeroOpen: false,
    customName: '',
    customQty: 1,

    /** R4-4：数量归零浮窗（时长走 core/toast.ts 的 TOAST_MS，两页一致） */
    toastShow: false,
    toastText: '',
  },

  /** 浮窗定时器句柄。放 data 外：它不参与渲染 */
  _toastTimer: null as ReturnType<typeof setTimeout> | null,

  onLoad() {
    this.syncDerived();
  },

  /** 页面卸载时清掉定时器，避免在已销毁的页面上 setData */
  onUnload() {
    if (this._toastTimer) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }
  },

  // —— 派生值重算（Vue computed 的小程序等价物）——
  syncDerived() {
    const d = this.data.draft;

    // —— 同行名额与关系联动（R4-1 / R4-2 / R4-3）——
    // 把扩展维度合进条件，先算名额账，再算「能不能由用户自己选关系」。
    const ext: ConditionsExt = {
      ...d,
      relation: this.data.relation,
      adultsWith: this.data.adultsWith,
      elderlyCount: this.data.elderlyCount,
      purposeExt: this.data.purposeExt,
      gender: this.data.gender || undefined,
      period: this.data.period,
      careOthers: this.data.careOthers,
    };
    const budget = companionBudget(ext);
    // autoRelation 返回非 null = 「没有成人同行，关系由同行人员决定」。
    // R5-4：第 ④ 步的「和谁一起住」整块删除后，这个自动判定仍要写回 ——
    // 否则老人 / 儿童同行时关系会停在默认值，清单里按关系判定的物品就错了。
    const auto = autoRelation(ext);
    const relation: Relation = auto !== null ? auto : this.data.relation;

    let leaveLabel = '';
    if (d.date) {
      // 退房日 = 入住日 + 晚数（手动解析，禁止 new Date('YYYY-MM-DD')）
      const [y, m, dd] = d.date.split('-').map(Number);
      const t = new Date(y, m - 1, dd + d.nights);
      leaveLabel = fmtDate(`${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`);
    }

    const isOffset = (n: number) => {
      const t = new Date();
      t.setDate(t.getDate() + n);
      return d.date === dstr(t);
    };

    const patch: Record<string, unknown> = {
      dateLabel: d.date ? fmtDate(d.date) : '先选好日子',
      leaveLabel,
      // R5-3：nextReady 按当前步判断（原来只表示「日期选没选」）——
      // 第 ① 步看性别是否已选，第 ② 步看日期，其余步恒可下一步。
      // 注意 next()/prev() 切步后要重跑 syncDerived，否则这个值停在上一步的结果上。
      nextReady:
        this.data.step === 1 ? isGender(this.data.gender)
        : this.data.step === 2 ? !!d.date
        : true,
      quickOn: [!this.data.customDate && isOffset(0), !this.data.customDate && isOffset(1), !this.data.customDate && isOffset(2)],
      fxChildren: fxNames(this.conds({ children: d.children, childAge: d.childAge }), this.conds({ children: 0 })).join('、'),
      // 未开开关时置空：模板里就不用写 `draft.elderly && fxElderly`（WXML 对 & 敏感）
      fxElderly: d.elderly ? fxNames(this.conds({ elderly: true }), this.conds({ elderly: false })).join('、') : '',
      // 关系只在真的带来物品变化时才提示（「独自 / 情侣 / 家人」都不加东西，保持空白）
      fxRelation: (relation === '朋友' || relation === '同事')
        ? fxNames(this.conds({ relation }), this.conds({ relation: '家人' })).join('、')
        : '',
      // P1-5：≥2 人才问同行；1 人只问宠物
      step3Q: d.adults >= 2 ? '同行的是谁？' : '有宠物同行吗？',
      showChildren: d.adults >= 2,
      // —— R4-2：名额账与三个「＋」的上限 ——
      // 上限 = 当前值 + 剩余名额，再压到该维度自己的上限内。
      // 名额用尽时 max === value，stepper 组件自己的 minusOff/plusOff 逻辑就会把「＋」禁掉。
      budget,
      maxAdult: Math.min(this.data.adultsWith + budget.left, MAX_COMPANIONS),
      maxChild: Math.min(d.children + budget.left, MAX_CHILDREN),
      maxElderly: Math.min(this.data.elderlyCount + budget.left, MAX_ELDERLY),
      companionNote: budget.left <= 0 && budget.total > 0
        ? '同行名额已用完，还要更多同行者请回上一步改入住人数'
        : '',
      // R5-9：当前选中住宿情况的提示行。动态由规则差集算出 ——
      // 比如同一行程选「出差」，1 晚没有烧水壶，提示就只写颈枕，不许诺不会出现的东西。
      purposeFx: this.purposeFxOf(this.data.purposeExt),
    };
    // 关系被自动判定时写回 —— 模板里的选中态要跟着变
    if (auto !== null && auto !== this.data.relation) patch.relation = auto;
    this.setData(patch);
  },

  /**
   * 草稿 + 扩展维度 → 扩展条件。
   * 清单求值（预览、影响说明）统一走这里，避免有的地方用 buildPrep、有的地方用 buildPrepExt
   * 导致「影响说明说会加棋牌，预览里却没有」这类前后不一致。
   */
  conds(patch?: Partial<ConditionsExt>): ConditionsExt {
    return {
      ...this.data.draft,
      relation: this.data.relation,
      adultsWith: this.data.adultsWith,
      elderlyCount: this.data.elderlyCount,
      purposeExt: this.data.purposeExt,
      gender: this.data.gender || undefined,
      period: this.data.period,
      careOthers: this.data.careOthers,
      ...(patch || {}),
    };
  },

  /**
   * R5-9：某个住宿情况标签对应的提示行。
   * 动态由 buildPrepExt 的差集算出（fxNames），不硬编码文案 —— 规则改了提示自动跟上，
   * 也不会许诺「这条规则根本给不出」的东西。「其他」给中性说明（保密语义：不做任何推断）。
   */
  purposeFxOf(pe: PurposeExt): string {
    if (pe === '其他') return '按通用清单准备，不会根据住宿目的推荐任何东西';
    if (pe === '普通短住') return '按常规短住清单准备';
    const on = this.conds({ purpose: toSourcePurpose(pe), purposeExt: pe });
    const off = this.conds({ purpose: '普通短住', purposeExt: '普通短住' });
    const names = fxNames(on, off);
    return names.length ? '＋将加入：' + names.join('、') : '';
  },

  setDraft(patch: Partial<Conditions>) {
    this.setData({ draft: { ...this.data.draft, ...patch } });
    this.syncDerived();
  },

  // —— ① 性别 + 管行李范围 ——
  /**
   * 性别切换的两条规矩：
   *   · 切回男性必须把 period 一起清掉 —— 否则留下「男性 + 经期」脏状态，
   *     止痛药会跟着冒出来（老板明确要求男女逻辑要跑得通）。
   *   · 切回女性时 period 保留 —— 用户只是来回看看，不该被吞掉选择。
   */
  setGender(e: WechatMiniprogram.TouchEvent) {
    const g = String(e.currentTarget.dataset.g || '') as '' | Gender;
    if (!isGender(g)) return;
    this.setData({ gender: g, period: g === 'female' ? this.data.period : false });
    this.syncDerived();
    // M19：经期开关只给女性渲染，性别一变「是否已全开」的口径就变，全选按钮要重新对账
    this.syncPrefsAll();
  },

  /**
   * R6 / R6.5：替其他人管行李。切到「关」后有两层连锁（第 ① 步的说明文案与之一一对应）：
   *   · 流程连锁 —— 第 ③④ 步（人数 / 同行人员）整段跳过，向导 7 步变 5 步：
   *     清单按自己 1 人算，问几个人、什么关系已没有意义。
   *   · 数据连锁 —— 同行相关数值一并清零（adultsWith / children / elderlyCount / relation）：
   *     留着只会让行程页头部的「· 家人」这类关系显示说谎。
   *     adults 也要一并归 1（B6）：children / elderly 清了而 adults 留在原值的话，
   *     行程页头部仍显示「3 人入住」，与「只按自己 1 人生成」的清单打架。
   * 重新打开后这几项要重新填 —— 换来的是「数据永远和清单一致」。
   */
  toggleCareOthers() {
    const careOthers = !this.data.careOthers;
    const flow = careOthers ? ALL_STEPS : SOLO_STEPS;
    if (careOthers) {
      this.setData({ careOthers, flow, total: flow.length });
    } else {
      this.setData({
        careOthers,
        flow,
        total: flow.length,
        adultsWith: 0,
        elderlyCount: 0,
        relation: '独自',
        draft: { ...this.data.draft, adults: 1, children: 0, elderly: false },
      });
    }
    this.syncDerived();
  },

  /** R5-5：经期开关。仅女性可见；清单重算发生在进入第 ⑦ 步时（setPreview）。
      M19：经期也是「在意哪些方面」页的开关，它的开合要同步全选按钮的文案 */
  togglePeriod() {
    this.setData({ period: !this.data.period });
    this.syncPrefsAll();
  },

  // —— ① 日期与晚数 ——
  setOffset(e: WechatMiniprogram.TouchEvent) {
    const n = Number(e.currentTarget.dataset.d);
    const d = new Date();
    d.setDate(d.getDate() + n);
    this.setData({ customDate: false });
    this.setDraft({ date: dstr(d) });
  },

  toggleCustomDate() {
    this.setData({ customDate: !this.data.customDate }, () => {
      this.syncDerived();
    });
  },

  onPickDate(e: StrEvent) {
    this.setDraft({ date: e.detail });
  },

  onNights(e: NumEvent) {
    this.setDraft({ nights: Number(e.detail) });
  },

  // —— ② 人数 ——
  // P0-8：原实现 Math.max(当前, 点击值) 让人数「只能升不能降」——从 5 点回「1 人」无效。
  // 现改为按区间判断：
  //   · 点「1 人 / 2 人」→ 直接生效（允许降，修掉那个 bug）
  //   · 点「3 人及以上」→ 若当前已在 3+ 区间则保留真实人数（不压回 3，
  //     守住源项目修复过的缺陷，外部评审 §16；真实人数仍由步进器决定）
  setAdults(e: WechatMiniprogram.TouchEvent) {
    const n = Number(e.currentTarget.dataset.n);
    const cur = this.data.draft.adults;
    this.applyAdults(n >= 3 && cur >= 3 ? cur : n);
  },

  onAdults(e: NumEvent) {
    this.applyAdults(Number(e.detail));
  },

  /**
   * P1-5：人数变化时清掉不适用的字段，避免残留。
   * 否则从 3 人改回 1 人后，清单里会莫名多出儿童用品/老人用品。
   *
   * R4-2 起这里还多一件事：**人数改小后同行者可能超额**（3 人住、1 老人 + 1 儿童，
   * 改回 2 人就只剩 1 个名额了），要裁到名额之内，否则账还是对不上。
   *
   * 1 人入住不存在「和谁一起住」，关系回「独自」；其余情况若关系被同行人员锁定，
   * syncDerived 会自己纠正，这里不用管。
   */
  applyAdults(n: number) {
    const patch: Partial<Conditions> = { adults: n };
    let adultsWith = this.data.adultsWith;
    let elderlyCount = this.data.elderlyCount;

    if (n <= 1) {
      // 一个人住：不存在同行者，三个维度全部清零
      adultsWith = 0;
      elderlyCount = 0;
      patch.children = 0;
      patch.elderly = false;
    } else {
      // 裁剪顺序：成人同行 → 儿童 → 老人（见 core/extra.ts clampCompanions 的注释）
      const c = clampCompanions({
        ...this.data.draft,
        adults: n,
        adultsWith,
        children: this.data.draft.children,
        elderlyCount,
      });
      adultsWith = c.adultsWith;
      elderlyCount = c.elderlyCount;
      if (c.children !== this.data.draft.children) patch.children = c.children;
      patch.elderly = syncElderlyFlag(elderlyCount);
    }

    this.setData({
      adultsWith,
      elderlyCount,
      relation: n <= 1 ? '独自' : (this.data.relation === '独自' ? DEFAULT_RELATION : this.data.relation),
    });
    this.setDraft(patch);
  },

  /** R4-2：成人同行人数。不进 draft —— 源 Conditions 没有这一维 */
  onAdultsWith(e: NumEvent) {
    this.setData({ adultsWith: Number(e.detail) });
    this.syncDerived();
  },

  /**
   * R4-2：老人**数量**。
   * 源层的 `elderly` 是布尔（清单规则只认「有没有老人」），所以走 setDraft 同步派生，
   * 数量本身留在扩展层的 elderlyCount。
   */
  onElderlyCount(e: NumEvent) {
    const n = Number(e.detail);
    this.setData({ elderlyCount: n });
    this.setDraft({ elderly: syncElderlyFlag(n) });
  },

  /** R4-1：第 ③ 步选同行关系（不含「独自」—— 有同行者才问这个） */
  setCompanionRelation(e: WechatMiniprogram.TouchEvent) {
    const r = String(e.currentTarget.dataset.r || '') as Relation;
    if (!(COMPANION_RELATIONS as string[]).includes(r)) return;
    this.setData({ relation: r });
    this.syncDerived();
  },

  // —— ③ 同行人员 ——
  onChildren(e: NumEvent) {
    this.setDraft({ children: Number(e.detail) });
  },

  setChildAge(e: WechatMiniprogram.TouchEvent) {
    this.setDraft({ childAge: String(e.currentTarget.dataset.v) as ChildAge });
  },

  togglePet() {
    this.setDraft({ pet: !this.data.draft.pet });
  },

  // —— ④ 住宿情况（R5-9：7 个标签一列排放）——
  setPurpose(e: WechatMiniprogram.TouchEvent) {
    const p = String(e.currentTarget.dataset.k || '') as PurposeExt;
    if (!isPurposeExt(p)) return;
    // 双写（缺一不可，见 core/extra.ts PurposeExt 一节）：
    //   purposeExt → 用户真正点的（回显 / 扩展层 when 用）
    //   draft.purpose → 降级后的源值（源清单规则用）
    this.setData({ purposeExt: p });
    this.setDraft({ purpose: toSourcePurpose(p) });
  },

  // —— ⑥ 偏好 ——
  togglePref(e: WechatMiniprogram.TouchEvent) {
    const k = String(e.currentTarget.dataset.k) as 'sleep' | 'hygiene' | 'mosquito' | 'gadgets';
    const prefs = { ...this.data.draft.prefs, [k]: !this.data.draft.prefs[k] };
    this.setDraft({ prefs });
    this.syncPrefsAll();
  },

  /**
   * M18 全选（老板建议）/ M19 补全（老板点名两处）：
   *   · 女性的「是否处于经期」也是这一页的开关，全选时一并触发（不再是漏网之鱼）；
   *   · 全开时再点一次 = 全部关掉（同一颗按钮两态切换）。
   */
  toggleAllPrefs() {
    const cur = this.data.draft.prefs;
    const all = !this.allOn(cur);
    this.setDraft({ prefs: { sleep: all, hygiene: all, mosquito: all, gadgets: all } });
    if (this.data.gender === 'female') this.setData({ period: all });
    this.setData({ prefsAll: all });
  },

  /** 这一页的开关是否已全开：四个「在意」偏好 +（女性）经期。
      男性没有经期开关，不参与判定 —— 全选不该替用户编造身体状况。 */
  allOn(prefs: { sleep: boolean; hygiene: boolean; mosquito: boolean; gadgets: boolean }) {
    const periodOk = this.data.gender !== 'female' || this.data.period;
    return !!(prefs.sleep && prefs.hygiene && prefs.mosquito && prefs.gadgets && periodOk);
  },

  /** 任一开关变化后重算按钮文案（togglePref / togglePeriod / setGender 都要来对账） */
  syncPrefsAll() {
    this.setData({ prefsAll: this.allOn(this.data.draft.prefs) });
  },

  // —— 步骤导航（R6.5：按 flow 走 —— careOthers 关掉时 7 步变 5 步）——
  prev() {
    const i = this.data.flow.indexOf(this.data.step);
    if (i <= 0) return;
    this.setData({ step: this.data.flow[i - 1], stepPos: i });
    // nextReady 是按步算的（见 syncDerived），切步后必须重算，否则灰显状态串步
    this.syncDerived();
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },

  next() {
    // R5-3：第 ① 步必须先选性别。按钮已灰显，这里再兜一层 ——
    // 性别未知会让卫生巾 / 剃须刀的适配整层失效，生成一份两边都不像的清单。
    if (this.data.step === 1 && !isGender(this.data.gender)) {
      wx.showToast({ title: '请先选择性别', icon: 'none' });
      return;
    }
    // 第 ② 步必须先选日期（原第 ① 步的校验顺移到这里）。空日期会存出一条
    // 永远卡在「准备」阶段的行程（suggestedStage 对空日期返回 prep）。
    if (this.data.step === 2 && !this.data.draft.date) {
      wx.showToast({ title: '请先选择入住日期', icon: 'none' });
      return;
    }
    const flow = this.data.flow;
    const i = flow.indexOf(this.data.step);
    const nxt = flow[i + 1];
    if (nxt === undefined) return;
    if (nxt === 7) {
      // 进入第 ⑦ 步：生成预览（普通数组，不用 computed，否则自定义项会被重算冲掉）
      this.setPreview(buildPrepExt(this.conds()));
      this.setData({ conditionEffects: this.buildEffects() });
    }
    this.setData({ step: nxt, stepPos: i + 2 });
    this.syncDerived();
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },

  /** 区块 A：展开 / 收起「你的选择如何影响清单」 */
  toggleFx() {
    this.setData({ fxOpen: !this.data.fxOpen });
  },

  /** 区块 A：条件 → 实际影响（差值由 buildPrep 求值，非硬编码） */
  buildEffects(): EffectVM[] {
    const d = this.data.draft;
    const out: EffectVM[] = [];
    // R6.5：「替其他人管行李」关掉时清单按自己 1 人算（buildPrepExt 降级），
    // 「N 人入住、每人份按 N 份」这行就成了假话 —— 不列。
    if (d.adults > 1 && this.data.careOthers) {
      out.push({ cond: `${d.adults} 人入住`, items: `每人份物品按 ${d.adults} 份准备` });
    }
    out.push({
      cond: `${d.nights} 晚`,
      items:
        d.nights >= 4
          ? `消耗品按 ${d.nights + 1} 份/人，并加入洗衣、晾衣用品`
          : `消耗品按 ${d.nights + 1} 份/人`,
    });
    if (d.children > 0) {
      const c = fxNames(this.conds({ children: d.children, childAge: d.childAge }), this.conds({ children: 0 }));
      if (c.length) out.push({ cond: `儿童 ${d.children} 位（${d.childAge} 岁）`, items: c.join('、') });
    }
    if (d.elderly) {
      const o = fxNames(this.conds({ elderly: true }), this.conds({ elderly: false }));
      if (o.length) out.push({ cond: '有老人', items: o.join('、') });
    }
    // 扩展层维度：只有真的带来物品时才列出来，避免「选了但没变化」的空行
    if (this.data.relation === '朋友' || this.data.relation === '同事') {
      const r = fxNames(this.conds({ relation: this.data.relation }), this.conds({ relation: '家人' }));
      if (r.length) out.push({ cond: `同行：${this.data.relation}`, items: r.join('、') });
    }
    // R6：「培训 / 学习」偏好开关已删（与第 ⑤ 步「学习培训」标签重复），
    // 学习类物品唯一由住宿情况触发 —— 其差异行会出现在 purposeFx 与清单里。
    const prefLabel: Record<string, string> = {
      sleep: '睡眠敏感',
      hygiene: '在意卫生',
      mosquito: '蚊虫季节',
      gadgets: '电子设备多',
    };
    (Object.keys(prefLabel) as ('sleep' | 'hygiene' | 'mosquito' | 'gadgets')[]).forEach(k => {
      if (!d.prefs[k]) return;
      const o = fxNames(this.conds({ prefs: { ...d.prefs, [k]: true } }), this.conds({ prefs: { ...d.prefs, [k]: false } }));
      if (o.length) out.push({ cond: prefLabel[k], items: o.join('、') });
    });
    return out;
  },

  // —— ⑥ 预览清单 ——
  setPreview(list: PrepItem[]) {
    this.setData({ preview: list });
    this.rebuildGroups();
  },

  rebuildGroups() {
    const preview = this.data.preview as PrepItem[];
    // 与行程页同一套口径（core/extra.ts 的 splitByQty）：qty === 0（不带）的项
    // 不进分组、不占清单位置，另收在底部「已设为不带」区域里可恢复。
    // 数据不动，仍留在 preview 里等保存。
    const indexed = preview.map((it, idx) => ({ ...it, _i: idx }));
    const { active: items, zero } = splitByQty(indexed);
    // R5-6 / R6 修复：女性追加「化妆品」分组（有预置物品时组自然出现；全被设为
    // 不带 / 删掉后这个兜底保证添加入口仍在），**加进 cats 后统一按 CAT_ORDER_EXT
    // 排序** —— 之前是 push 在末尾，导致化妆品组跑到清单最后而不是衣物后面（老板点名）。
    // M18 查重：女性预置香水/口红/粉底后 items 已含「化妆品」，无条件 push 会出现
    // 两个一模一样的「化妆品」组（与行程页同一个 bug，老板真机抓到）。
    // 男性 / 性别未知不出现这个入口（老板拍板）；男性仍可用通用输入自由添加（H44）。
    const cats = [...new Set(items.map(i => i.cat))];
    if (this.data.gender === 'female' && !cats.includes('化妆品')) cats.push('化妆品');
    cats.sort((a, b) => CAT_ORDER_EXT.indexOf(a) - CAT_ORDER_EXT.indexOf(b));
    const groups: GroupVM[] = cats.map(c => ({
      cat: c,
      items: items.filter(x => x.cat === c),
    }));
    this.setData({ groups, zeroPreview: zero });
  },

  /** 展开 / 收起底部的「已设为不带」区域 */
  toggleZero() {
    this.setData({ zeroOpen: !this.data.zeroOpen });
  },

  /** 把「不带」的项恢复为 1 件（与行程页的 restoreZero 同一语义） */
  restoreZero(e: WechatMiniprogram.TouchEvent) {
    const i = Number(e.currentTarget.dataset.i);
    if (!Number.isInteger(i) || i < 0) return;
    this.setData({ [`preview[${i}].qty`]: 1 });
    this.rebuildGroups();
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

  onItemQty(e: IdxValEvent) {
    const i = Number(e.detail.idx);
    if (!Number.isInteger(i) || i < 0) return;
    const before = Number((this.data.preview[i] as PrepItem | undefined)?.qty);
    const after = Number(e.detail.value);
    this.setData({ [`preview[${i}].qty`]: after });
    this.rebuildGroups();
    // R4-4：数量减到 0 = 不带。这一行会立刻从清单里消失 ——
    // 不告诉用户它去哪了，用户会以为被删掉了。
    if (shouldToastZero(before, after)) this.showToast(TOAST_ZERO_TEXT);
  },

  /**
   * R5-2：预览行整行可点后，勾选事件按 preview 下标回写。
   * 与行程页 onItemToggle 同一语义，只是向导里用 _i 下标定位（无稳定键）。
   * 勾选状态不进「已备齐」进度 —— 向导第 ⑦ 步只是确认清单，打勾在这里没有存储意义，
   * 但为了让「点了有反应」，行内视觉态（.row.done）会立即更新。
   */
  onPreviewToggle(e: { detail: { idx: number; value: boolean } }) {
    const i = Number(e.detail.idx);
    if (!Number.isInteger(i) || i < 0) return;
    this.setData({ [`preview[${i}].done`]: !!e.detail.value });
    this.rebuildGroups();
  },

  /**
   * R5-6：衣物 / 化妆品下拉的统一添加入口。落点分类由标签上的 data-cat 决定
   * （一页两个面板，selectComponent('#clothingAdd') 会取错，事件路由靠 dataset）。
   * 同分类同名不重复添加（02 §6 名称去重）。
   */
  addTyped(e: WechatMiniprogram.CustomEvent) {
    const name = String(e.detail || '').trim();
    const cat = String(e.currentTarget.dataset.cat || '衣物');
    if (!name) return;
    const list = [...this.data.preview] as PrepItem[];
    if (list.some(i => i.cat === cat && i.name === name)) return;
    list.push({
      name,
      cat,
      unit: cat === '化妆品' ? '个' : '件',
      // M18：不再臆测用户「从家里带」—— 用户自己加的，就标「自定义」，
      // 与「还有一些东西」入口（addCustom）同一口径。
      prep: '自定义',
      source: '自定义',
      users: '每人',
      qty: 1,
      done: false,
    });
    this.setPreview(list);
  },

  onCustomName(e: StrEvent) {
    this.setData({ customName: e.detail });
  },

  onCustomQty(e: StrEvent) {
    const n = Number(e.detail);
    this.setData({ customQty: Number.isFinite(n) && n > 0 ? Math.floor(n) : 1 });
  },

  addCustom() {
    const name = String(this.data.customName || '').trim();
    if (!name) return;
    const list = [...this.data.preview] as PrepItem[];
    list.push({
      name,
      cat: '自定义',
      unit: '件',
      prep: '自定义',
      source: '自定义',
      users: '共用',
      qty: this.data.customQty || 1,
      done: false,
    });
    this.setPreview(list);
    this.setData({ customName: '', customQty: 1 });
  },

  /** 衣物 / 化妆品浮层是 fixed 定位的，页面一滚就会与触发条错位，故滚动即关闭。
      R5-6：一页可能有两个面板（衣物 + 化妆品），两个都要关。 */
  onPageScroll() {
    (['#clothingAdd', '#cosmeticAdd'] as const).forEach(sel => {
      const c = this.selectComponent(sel) as { close?: () => void } | null;
      if (c && typeof c.close === 'function') c.close();
    });
  },

  // —— 保存 ——
  save() {
    // 深拷贝：避免把 data 里的引用对象写进存储（源实现同样处理）
    const s = newStay(
      JSON.parse(JSON.stringify(this.data.draft)) as Conditions,
      JSON.parse(JSON.stringify(this.data.preview)) as PrepItem[],
    );
    saveStay(s);
    // 扩展维度不进 Stay 结构（Stay 属红线），单独存扩展层 storage。
    // 少了这一步，「朋友同行 → 棋牌」这类信息在「复制上次」和「我的」页里就丢了。
    setStayExt(s.id, {
      relation: this.data.relation,
      adultsWith: this.data.adultsWith,
      elderlyCount: this.data.elderlyCount,
      // R5-9 / R5-3 / R6：扩展层的住宿情况、性别与管行李维度。Stay.conditions.purpose
      // 已是 toSourcePurpose 降级后的源值，用户真正点的「学习培训 / 看病 / 其他」在这里。
      // study 不再写入（R6 删掉偏好页开关），老数据里的 study 字段由 loadExt 兼容读取。
      purposeExt: this.data.purposeExt,
      gender: this.data.gender || undefined,
      period: this.data.period,
      careOthers: this.data.careOthers,
    });
    // 显式落到「准备」阶段：suggestedStage() 是「按日期推断」，今天入住会推断成 checkin，
    // 但刚保存完这次入住，用户接下来要做的是准备物品，不是做入住检查。
    wx.redirectTo({ url: `/pages/stay/stay?id=${s.id}&stage=prep` });
  },
});
