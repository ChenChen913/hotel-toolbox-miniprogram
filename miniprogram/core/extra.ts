// extra.ts —— 扩展层。在**不改红线**的前提下，往源数据之上追加内容。
//
// 为什么单独一层：
//   `core/types.ts` / `core/data.ts` / `core/engine.ts` 必须与源 Web 项目（D:/hotel/src/）
//   **零差异**，由 `npm run diff:types / diff:data / diff:engine` + 87 个测试守护。
//   为了几条物品、两个住宿场景去改红线不划算（源项目将来更新会直接冲突），
//   故把「源数据之外的追加内容」全部收在这一层：
//     · 新增分类（娱乐 / 学习）—— 不动 CAT_ORDER，改用在它之上合并出来的 CAT_ORDER_EXT
//     · 新增物品 —— id 一律 `x_` 前缀，与源 id 绝不冲突
//     · 住宿关系（独自 / 情侣 / 家人 / 朋友 / 同事）—— 源 Conditions 里没有这个维度
//     · 培训 / 学习场景 —— 源 Prefs 只有 4 个开关，不加第 5 个
//   整层可以随时整块删掉：删掉后 buildPrep 仍是源函数，行为退化成源项目的样子。
//
// 本文件**不碰 wx.* API**（用 engine 导出的 Storage），这样 vitest 里能直接跑。

import { CAT_ORDER, defaultQty, guessGearCat } from './data';
import { Storage, buildPrep, exportData, importData } from './engine';
import { sanitizeBackup } from './repair';
import type { Conditions, ItemDef, Prep, PrepItem, Purpose, Users } from './types';

// ─────────────────────────── 住宿关系 ───────────────────────────

/** 住宿关系。源项目只有 Purpose（普通短住/出差/旅游/探亲），表达不了「情侣 / 朋友」 */
export type Relation = '独自' | '情侣' | '家人' | '朋友' | '同事' | '其他';
export const RELATIONS: Relation[] = ['独自', '情侣', '家人', '朋友', '同事', '其他'];

/**
 * 第 ③ 步「同行的是什么关系」的可选项 —— 不含「独自」。
 *
 * 为什么不含：能走到这一步说明至少有一位同行者，「独自」在这里是自相矛盾的。
 * 「独自」只在第 ④ 步作为「没有同行关系」的兜底值出现。
 */
export const COMPANION_RELATIONS: Relation[] = ['情侣', '家人', '朋友', '同事', '其他'];

/** 默认关系：与源清单里已有的「儿童 / 老人」问法口径一致（家庭出行为主） */
export const DEFAULT_RELATION: Relation = '家人';

export function isRelation(v: unknown): v is Relation {
  return typeof v === 'string' && (RELATIONS as string[]).includes(v);
}

// ─────────────────── 性别维度（R5-3 / R5-5）───────────────────
//
// 老板的设计原则（务必遵守，验收项 H49/H51 都盯着它）：
//   1. 性别只影响「默认生成的清单」，不影响「用户手动添加」——
//      男性可以自己加卫生巾（给对象带的），女性可以自己加剃须刀，同理。
//   2. 性别未知（老数据 / 导入的数据）时一个物品都不摘 —— 行为与加这维之前完全一致。

/** 性别。老数据没有 → undefined → 不做任何性别过滤 */
export type Gender = 'male' | 'female';

export function isGender(v: unknown): v is Gender {
  return v === 'male' || v === 'female';
}

/** 取性别；非法 / 缺失一律当「未知」——未知是向后兼容的关键状态，不能被吞成某一性别 */
export function genderOf(c: ConditionsExt): Gender | undefined {
  return isGender(c.gender) ? c.gender : undefined;
}

/**
 * 源清单里「只在某一性别下才默认出现」的项。
 * 源的 when 恒为 true（core/data.ts:21-22，红线改不了），所以由扩展层在合并前摘掉。
 * ⚠️ 用 itemId 匹配，不要用名称（名称将来可能改）。
 */
const GENDER_EXCLUDE: Record<Gender, string[]> = {
  male: ['makeup_remover'],   // 卸妆棉
  female: ['razor'],          // 剃须刀
};

/**
 * 扩展条件：在源 Conditions 之上追加扩展层自己的维度。
 * 字段都可选 —— 老数据、外部调用不传也能跑（不传时相关规则一律不触发）。
 */
export interface ConditionsExt extends Conditions {
  /** 住宿关系 */
  relation?: Relation;
  /** 培训 / 学习场景（源 Prefs 里没有这一项，故放扩展层） */
  study?: boolean;
  /**
   * 成人同行人数（**不含自己**）。
   * 源 Conditions 里只有 adults（成人总数），没有「其中几个是同行」这一维，故放扩展层。
   */
  adultsWith?: number;
  /**
   * 老人数量。
   * 源的 `elderly` 是**布尔**（只表示「有没有老人」，供清单规则用），表达不了「几位老人」，
   * 而人数约束需要真实数量 —— 所以另开这一维，`elderly` 由它派生（见 syncElderlyFlag）。
   */
  elderlyCount?: number;
  /**
   * R5-9：用户真正点的住宿情况（7 值）。
   * 老数据 / 外部调用没有这一维 → buildPrepExt 里用源 purpose 回推（见 buildPrepExt 注释）。
   */
  purposeExt?: PurposeExt;
  /** R5-3：性别。老数据没有 → undefined → 不做任何性别过滤 */
  gender?: Gender;
  /** R5-5：是否处于经期。仅女性可见、可开；性别切回男性时必须一起清掉 */
  period?: boolean;
  /**
   * R6：是否替其他人管行李。关掉 = 多人入住只按「自己 1 人」生成清单。
   * 老数据缺失按 true（保持加这维之前的行为）。
   */
  careOthers?: boolean;
}

// ─────────────────── 同行名额（R4-1 / R4-2 / R4-3）───────────────────
//
// 源项目这一维是「三个互不相干的标记」：
//   adults（几个成人）/ children（几个儿童）/ elderly（有没有老人，**布尔**）
// 于是必然出现「2 人入住却选了 1 位老人 + 2 个儿童」这种账对不上的情况 —— 老板提的就是这个。
//
// 这里把它们拉到同一张账上：**自己占 1 位，其余的都是同行者**，
// 成人同行 + 儿童 + 老人 之和不得超过 adults − 1。宠物不占名额（不是人）。
//
// 以下全是纯函数，不碰 wx.*，因此可以在 vitest 里直接跑。

/** 各维度的独立上限（防止用户一直点「＋」点出一个荒谬的值） */
export const MAX_COMPANIONS = 9;   // 成人同行
export const MAX_CHILDREN = 4;     // 与源 stepper 的 max 保持一致
export const MAX_ELDERLY = 4;

/** 取非负整数，非法输入一律当 0 —— 存储里的老数据可能是 undefined / null / 字符串 */
const int0 = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;

/**
 * 老人数量。`elderlyCount` 是扩展层的真实数量，`elderly` 是源层的布尔标记。
 * 老数据 / 外部调用只给了布尔时，按 1 位算。
 */
export function elderlyCountOf(c: ConditionsExt): number {
  if (typeof c.elderlyCount === 'number' && Number.isFinite(c.elderlyCount)) return int0(c.elderlyCount);
  return c.elderly ? 1 : 0;
}

/** 同行名额的账 */
export interface CompanionBudget {
  /** 总名额 = adults − 1（自己占 1 位）；adults ≤ 1 时没有名额 */
  total: number;
  /** 已占用 = 成人同行 + 儿童 + 老人 */
  used: number;
  /** 还剩几个名额 */
  left: number;
}

export function companionBudget(c: ConditionsExt): CompanionBudget {
  const adults = int0(c.adults);
  const total = adults > 1 ? adults - 1 : 0;
  const used = int0(c.adultsWith) + int0(c.children) + elderlyCountOf(c);
  return { total, used, left: Math.max(0, total - used) };
}

/**
 * 某个同行维度还能不能再加 1。
 * 两个条件都满足才行：① 名额还有剩；② 没到该维度的独立上限。
 */
export function canAddCompanion(c: ConditionsExt, kind: 'adult' | 'child' | 'elderly'): boolean {
  const b = companionBudget(c);
  if (b.left <= 0) return false;
  if (kind === 'adult') return int0(c.adultsWith) < MAX_COMPANIONS;
  if (kind === 'child') return int0(c.children) < MAX_CHILDREN;
  return elderlyCountOf(c) < MAX_ELDERLY;
}

/**
 * 按同行人员自动判定住宿关系。
 *
 * 老板的原话：前面选了「老人同行」，后面就不该还能选「情侣」—— 自相矛盾。
 * 规则：
 *   · 有成人同行（adultsWith ≥ 1）→ 返回 null，表示「关系由用户自己选」
 *   · 只有老人 / 儿童同行        → 「家人」（陪长辈、带孩子，都属家人）
 *   · 什么都没有                → 「独自」
 */
export function autoRelation(c: ConditionsExt): Relation | null {
  if (int0(c.adultsWith) > 0) return null;
  if (elderlyCountOf(c) > 0) return '家人';
  if (int0(c.children) > 0) return '家人';
  return '独自';
}

/**
 * 把同行人数裁到名额之内 —— 老板回上一步把入住人数改小时会用到。
 *
 * 裁剪顺序：**成人同行 → 儿童 → 老人**。
 * 为什么是这个顺序：老人与儿童是「需要特别照顾」的一方，成人同行是用户自由指定的一方；
 * 名额不够时先放弃自由度最高的那一维，语义上最不容易让人意外。
 *
 * @returns 裁剪后的三个数值 + 一共砍掉几个（供 UI 提示用）
 */
export function clampCompanions(c: ConditionsExt): {
  adultsWith: number; children: number; elderlyCount: number; trimmed: number;
} {
  let adultsWith = int0(c.adultsWith);
  let children = int0(c.children);
  let elderlyCount = elderlyCountOf(c);
  const budget = companionBudget({ ...c, adultsWith, children, elderlyCount });
  let over = budget.used - budget.total;
  let trimmed = 0;
  const take = (n: number) => {
    const cut = Math.min(n, Math.max(0, over));
    over -= cut;
    trimmed += cut;
    return n - cut;
  };
  adultsWith = take(adultsWith);
  children = take(children);
  elderlyCount = take(elderlyCount);
  return { adultsWith, children, elderlyCount, trimmed };
}

/**
 * 由老人数量派生源的 `elderly` 布尔标记。
 * 清单规则只认「有没有老人」（源语义），人数约束认的是数量 —— 两者在这里对齐。
 */
export function syncElderlyFlag(elderlyCount: number): boolean {
  return int0(elderlyCount) > 0;
}

// ─────────────────── 住宿目的扩展（R5-9）───────────────────
//
// 源 Purpose 是红线（core/types.ts:3），「学习培训 / 看病 / 其他」不能加进源枚举 ——
// 一加 diff:types 立刻红，且源 data.ts / engine.ts 里所有 `purpose === '旅游'` 规则
// 都是对着 4 个字面量写的，加了新值它们也不认。
// 做法：扩展层定义 PurposeExt + 降级映射。**两个字段同时写、同时读**：
//   · draft.purpose / Stay.conditions.purpose → 只存 toSourcePurpose() 的结果（源 4 值之一）
//   · purposeExt                              → 用户真正点的那个（7 值），扩展层 when / 界面回显用
// 只写 purposeExt → 保存后重进向导选中态丢；只写 purpose → 「学习培训」被吞成「普通短住」。

export type PurposeExt = Purpose | '学习培训' | '看病' | '其他';

/** 第 ⑤ 步「住宿情况」的 7 个标签（顺序即展示顺序，「其他」必须在 —— 用户可能注重保密） */
export const PURPOSES_EXT: PurposeExt[] = [
  '普通短住', '出差', '旅游', '探亲', '学习培训', '看病', '其他',
];

/** 各标签的图标（tone 由模板统一传 p；档位见 tools/gen-icons.py 的 VARIANTS） */
export const PURPOSE_ICONS: Record<PurposeExt, string> = {
  普通短住: 'bed-double',
  出差: 'briefcase',
  旅游: 'compass',
  探亲: 'house',
  学习培训: 'book-open',
  看病: 'medical-cross',
  其他: 'sliders',
};

export function isPurposeExt(v: unknown): v is PurposeExt {
  return typeof v === 'string' && (PURPOSES_EXT as string[]).includes(v);
}

/**
 * 界面展示值 → 源 Purpose（给源清单规则用）。
 * 「学习培训 / 看病 / 其他」在源枚举里没有对应值 → 一律落到「普通短住」：
 * 语义上也成立 —— 这三种都是「按常规住宿准备，再由扩展层补几样场景物品」。
 */
export function toSourcePurpose(p: PurposeExt): Purpose {
  switch (p) {
    case '出差': return '出差';
    case '旅游': return '旅游';
    case '探亲': return '探亲';
    default: return '普通短住';
  }
}

// ─────────────────────────── 分类 ───────────────────────────

/** 扩展分类：源 CAT_ORDER 里没有的分类（R5-6 起加入「化妆品」） */
export const EXTRA_CATS = ['娱乐', '学习', '化妆品'];

/**
 * 源分类顺序 + 扩展分类（R5-6 起按**锚点**插入，不再一股脑塞在「自定义」之前）：
 *   · 「化妆品」紧跟「衣物」—— 都是穿戴/洗护类，语义相邻，老板要求放衣物后面
 *   · 「娱乐 / 学习」仍插在「补给」之后（原位置不变）
 * ⚠️ 必须用它替代 CAT_ORDER 来做排序：源数组里没有这些分类名，indexOf 会得到 -1，
 * 直接拿源数组排序会把扩展分类顶到列表最前面。
 */
export const CAT_ORDER_EXT: string[] = (() => {
  const out = [...CAT_ORDER];
  const after = (anchor: string, cats: string[]) => {
    const at = out.indexOf(anchor);
    out.splice(at < 0 ? out.length : at + 1, 0, ...cats);
  };
  after('衣物', ['化妆品']);
  after('补给', ['娱乐', '学习']);
  return out;
})();

/**
 * R5-6：化妆品下拉的预设类型。
 * 老板原话「具体添加什么化妆品咱就不管了」—— 这张表只是快捷入口，
 * 用户可以自由输入任意名称；**不预置任何化妆品物品**（空分类也要有添加入口）。
 * 与 clothing-add.ts 里衣物 TYPES 一样，是数据不是逻辑，所以放扩展层不写死在页面里。
 */
export const COSMETIC_TYPES = [
  '洗面奶', '水乳', '精华', '面霜', '防晒', '隔离', '粉底', '遮瑕', '散粉',
  '眼影', '眼线', '睫毛膏', '眉笔', '腮红', '口红', '润唇膏',
  '卸妆水', '卸妆棉', '化妆刷', '美妆蛋', '化妆包', '面膜',
];

/** 好物分类（与 core/data.ts 的 GEAR_CATS 同规则，只是基于合并后的分类表） */
export const GEAR_CATS_EXT: string[] = [...CAT_ORDER_EXT.filter(c => c !== '自定义'), '其他'];

/**
 * 扩展分类的联想关键词。源 GEAR_KEYWORDS 里只有 15 个类，没有 娱乐 / 学习。
 * 刻意做成「源猜不出时才轮到它」——见 guessGearCatExt。
 */
export const EXTRA_GEAR_KEYWORDS: Record<string, string[]> = {
  娱乐: ['扑克', '牌', '桌游', '麻将', '骰子', '卡牌', '游戏机', '手柄', 'switch'],
  学习: ['学习', '培训', '教材', '课本', '考试', '文具', '本子', '资料'],
  化妆品: ['化妆', '美妆', '面膜', '口红', '唇膏', '粉底', '遮瑕', '散粉', '眼影',
    '眼线', '睫毛膏', '眉笔', '腮红', '精华', '水乳', '面霜', '隔离', '美妆蛋', '化妆刷'],
};

/**
 * 先走源联想（保真），源猜不出时才用扩展关键词兜底。
 * 顺序很重要：反过来会把「笔记本电脑」误判成「学习」。
 */
export function guessGearCatExt(name: string): string | null {
  const base = guessGearCat(name);
  if (base) return base;
  const n = String(name || '').trim().toLowerCase();
  if (!n) return null;
  for (const cat of EXTRA_CATS) {
    for (const k of EXTRA_GEAR_KEYWORDS[cat] ?? []) {
      if (n.includes(k)) return cat;
    }
  }
  return null;
}

// ─────────────────────────── 扩展物品 ───────────────────────────

/** 扩展物品定义：结构与源 ItemDef 一致，只是 when / qty / prep 能看到扩展维度 */
export interface ExtraItemDef {
  id: string;
  name: string;
  cat: string;
  users: Users;
  /**
   * R5-5 起可以是函数：卫生巾要在「经期开关打开」时从可选升级为必带。
   * 源 ItemDef.prep 是静态字符串（红线不动），这是扩展层内部的接口放宽；
   * 传字符串的旧定义行为完全不变。
   */
  prep: Prep | ((c: ConditionsExt) => Prep);
  unit: string;
  qty?: (c: ConditionsExt) => number;
  when: (c: ConditionsExt) => boolean;
  gear?: { name: string; note: string }[];
}

/**
 * 扩展物品清单。
 *
 * 内容来源：CHANGE-REQUESTS §10.4（第二批）+ §11.2（第三批）逐条核查后「确实缺失」的物品。
 *
 * 🔴 刻意**不收录**安全套 / 情趣用品：
 *    D-5 决策 —— 这类提审敏感内容交给用户自己在「还有只有你自己知道的东西」里添加，
 *    代码不预置（否则有被判定「内容不符合所选类目」而驳回的风险）。
 */
export const EXTRA_ITEMS: ExtraItemDef[] = [
  // —— 第二批：老板点名、源清单确实没有的 ——
  { id: 'x_kettle', name: '便携烧水壶/折叠电热水壶', cat: '卫生', users: 'shared', prep: '可选', unit: '个',
    when: c => c.nights >= 2 || c.purposeExt === '探亲' || c.purposeExt === '旅游' },

  // 娱乐类（新建分类）：只有「朋友 / 同事」同行才提示，独自/情侣/家人不打扰
  { id: 'x_boardgame', name: '棋牌/便携桌游', cat: '娱乐', users: 'shared', prep: '可选', unit: '套',
    when: c => c.relation === '朋友' || c.relation === '同事' },

  // —— 第三批：源清单漏掉、却已躺在「好物联想词表」里的高频物品 ——
  { id: 'x_keys', name: '钥匙/房卡套', cat: '证件', users: 'adult', prep: '必带', unit: '把',
    when: () => true },
  { id: 'x_bottle', name: '随身水杯/保温杯', cat: '补给', users: 'adult', prep: '家里带', unit: '个',
    when: () => true },
  { id: 'x_earphone', name: '耳机', cat: '电子', users: 'adult', prep: '可选', unit: '副',
    when: () => true },
  { id: 'x_doll', name: '儿童安抚玩偶', cat: '儿童', users: 'child', prep: '家里带', unit: '个',
    qty: c => c.children, when: c => c.children > 0 },

  // ⚠️ 内容冲突处理：core/data.ts:424 的知识条目明确「不要用枕头被褥围挡替代（窒息风险）」。
  //    若不加限定，同一份数据会自相矛盾。故：① 只在「睡眠敏感」偏好下出现；
  //    ② 排除带 0-3 岁婴幼儿的行程；③ 名称与好物备注里都写明「成人用，勿用于婴儿床」。
  { id: 'x_pillow', name: '惯用枕头/枕巾（成人用，勿用于婴儿床）', cat: '睡眠', users: 'adult', prep: '可选', unit: '个',
    when: c => c.prefs.sleep && !(c.children > 0 && c.childAge === '0-3'),
    gear: [{ name: '荞麦枕 / 记忆棉颈枕（自用款）', note: '成人用；婴幼儿床内不得放置枕头、被褥围挡（窒息风险）' }] },

  { id: 'x_neckpillow', name: 'U 型颈枕', cat: '出行', users: 'adult', prep: '可选', unit: '个',
    when: c => c.purposeExt === '出差' || c.nights >= 4 },

  // 学习类（新建分类）：第 ⑥ 步「培训 / 学习」开关，或第 ⑤ 步住宿情况选「学习培训」，二者任一
  { id: 'x_study_doc', name: '学习/培训资料', cat: '学习', users: 'adult', prep: '家里带', unit: '份',
    when: c => !!c.study || c.purposeExt === '学习培训' },
  { id: 'x_study_kit', name: '笔记本/笔', cat: '学习', users: 'adult', prep: '家里带', unit: '套',
    when: c => !!c.study || c.purposeExt === '学习培训' },

  // —— 第五批（R5-3 / R5-9）：住宿场景与性别维度带来的新物品 ——
  // ⚠️ 场景类物品的 when 一律用 purposeExt，不用 purpose：
  //    源 Purpose 里没有「学习培训 / 看病 / 其他」，用它判永远为假。
  { id: 'x_lens', name: '隐形眼镜（含护理液、镜盒）', cat: '洗漱', users: 'adult', prep: '可选', unit: '套',
    when: () => true },
  { id: 'x_glasses', name: '眼镜/备用眼镜', cat: '出行', users: 'adult', prep: '可选', unit: '副',
    when: () => true },
  { id: 'x_disposable_underwear', name: '一次性内裤', cat: '衣物', users: 'adult', prep: '可选', unit: '条',
    when: c => c.nights >= 2 || c.purposeExt === '旅游' },
  { id: 'x_sunscreen', name: '防晒霜', cat: '洗漱', users: 'adult', prep: '可选', unit: '支',
    when: c => c.purposeExt === '旅游' },
  { id: 'x_gift', name: '探亲礼物/伴手礼', cat: '出行', users: 'shared', prep: '可选', unit: '份',
    when: c => c.purposeExt === '探亲' },
  // 医疗红线（知识条目 k39）：只给中性条目名，不写药名、剂量、用法 —— 后续任何人都不许「写具体些」
  { id: 'x_medical_record', name: '病历本/就诊卡', cat: '证件', users: 'adult', prep: '家里带', unit: '本',
    when: c => c.purposeExt === '看病' },

  // —— R5-5：女性维度 ——
  // 卫生巾：老板原话「如果是女性，清单里就**应该有**卫生巾的选项」→ 女性恒显示；
  // 经期开关打开 → 升级为必带、数量按晚数算。男性/性别未知不出现（可手动添加）。
  { id: 'x_sanitary_pad', name: '卫生巾/护垫', cat: '卫生', users: 'adult', unit: '包',
    prep: c => (c.period ? '必带' : '可选'),
    qty: c => (c.period ? c.nights + 1 : 1),
    when: c => genderOf(c) === 'female' },

  // 止痛药：老板原话「当女性**有经期**的时候，**可以加上**止痛药」→ 只在经期出现
  //（注意与卫生巾的措辞差异：一个是「有经期的可能就备着」，一个是「疼了才要」，when 不一样）。
  // 经期关掉 → 整条消失（不是降级为可选）；男性不出现（可在通用输入自行添加）。
  { id: 'x_painkiller', name: '止痛药', cat: '健康', users: 'adult', unit: '盒',
    prep: '必带',
    qty: () => 1,
    when: c => genderOf(c) === 'female' && !!c.period },

  // —— 第六轮：化妆品分组预置几件最常见物品（老板：象征性放一些，如香水、口红）。
  //    仅女性默认出现（「化妆品入口只给女性」的既定拍板不变）；男性仍可手动添加。
  //    下拉面板里的完整预设类型表见 COSMETIC_TYPES —— 预置物品只是清单里的常见项，两者不冲突。
  { id: 'x_perfume', name: '香水', cat: '化妆品', users: 'adult', prep: '可选', unit: '瓶',
    when: c => genderOf(c) === 'female' },
  { id: 'x_lipstick', name: '口红', cat: '化妆品', users: 'adult', prep: '可选', unit: '支',
    when: c => genderOf(c) === 'female' },
  { id: 'x_foundation', name: '粉底', cat: '化妆品', users: 'adult', prep: '可选', unit: '盒',
    when: c => genderOf(c) === 'female' },
];

/**
 * 源 buildPrep 里 ItemDef → PrepItem 的映射规则（逐字复刻）。
 * core 里这段写在 buildPrep 函数内部、没有导出，所以这里照抄一份；
 * 一旦源侧改了映射口径，扩展层这边也要同步（diff:engine 会先报出来）。
 */
function toPrepItem(it: ExtraItemDef, c: ConditionsExt): PrepItem {
  // ExtraItemDef 与源 ItemDef 结构一致，只是 when / qty 的入参多看到扩展维度。
  // 这里只借用 defaultQty 的「按使用人数」兜底规则（此时 it.qty 必为 undefined，when 不会被调用），
  // 故该断言是安全的 —— 换来的是「默认数量规则」只有一个来源。
  const qty = it.qty ? it.qty(c) : defaultQty(it as unknown as ItemDef, c);
  // R5-5：prep 允许按条件求值（卫生巾：经期 → 必带，非经期 → 可选）
  const prep: Prep = typeof it.prep === 'function' ? it.prep(c) : it.prep;
  return {
    itemId: it.id,
    name: it.name,
    cat: it.cat,
    unit: it.unit,
    prep,
    source: (prep === '必带' ? '必备' : '推荐') as PrepItem['source'],
    users: it.users === 'child' ? '儿童' : it.users === 'shared' ? '共用' : '每人',
    qty,
    done: false,
  };
}

/** 与 core/engine.sortItems 同规则，只是分类顺序换成合并后的表 */
export function sortItemsExt(items: PrepItem[]): PrepItem[] {
  return [...items].sort((a, b) =>
    CAT_ORDER_EXT.indexOf(a.cat) - CAT_ORDER_EXT.indexOf(b.cat) || a.name.localeCompare(b.name, 'zh'),
  );
}

/**
 * 把清单拆成「要带的」与「已设为不带（qty = 0）」两组。
 *
 * 为什么 qty = 0 的项必须从清单里摘掉：
 *   1. 产品口径 —— 数量调到 0 就是「不带」，不该还占着准备清单的位置。
 *   2. 一个实打实的 bug —— 这一项的勾选框是禁用的（源实现同款 :disabled），
 *      留在「已备齐」的分母里会让进度永远到不了 100%。
 *
 * 注意：**不动数据**。项仍然留在 stay.prep / stay.custom 里，只是不渲染，
 * 这样底部「已设为不带」区域才能把它恢复回来（否则「设为 0」就成了不可逆操作）。
 * 行程页与向导第 ⑥ 步预览共用这一个口径，避免两边表现不一致。
 */
export function splitByQty<T extends { qty: number }>(items: T[]): { active: T[]; zero: T[] } {
  const active: T[] = [];
  const zero: T[] = [];
  items.forEach(i => (i.qty === 0 ? zero : active).push(i));
  return { active, zero };
}

/**
 * 准备进度统计（B5：全应用统一口径）。
 *
 * 为什么单独抽出来：行程页用 splitByQty 把 qty = 0 的项摘出了渲染，
 * 但首页「已备齐 x/y」与「我的」页的打包进度仍把这些项算进分母 ——
 * 同一份清单两套说法（分母不同、进度永远对不上）。这里与 splitByQty 对齐：
 * **qty = 0（已设为不带）的项不进分母也不进分子**，三个页面共用。
 */
export function prepStats(items: { qty: number; done: boolean }[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  items.forEach(i => {
    if (i.qty === 0) return;
    total++;
    if (i.done) done++;
  });
  return { done, total };
}

/**
 * 按性别摘掉源清单里不该默认出现的项。
 * 性别未知 → 原样返回（向后兼容底线：老行程的清单一个都不许变，H49 盯着这条）。
 * 只摘「默认清单」，用户仍能在第 ⑦ 步的通用输入里手动加回来。
 */
function genderFilter(items: PrepItem[], c: ConditionsExt): PrepItem[] {
  const g = genderOf(c);
  if (!g) return items;
  const drop = new Set(GENDER_EXCLUDE[g]);
  return items.filter(i => !(i.itemId && drop.has(i.itemId)));
}

/**
 * 在源 buildPrep 的结果之上增量合并扩展物品，并排序。
 * 源 buildPrep 本身不动，仍可单独调用（源测试 38 条继续跑它）。
 *
 * R5-9：进来先把 purposeExt 归一化 —— 老数据 / 外部调用没带 purposeExt 时用源 purpose 回推。
 * 不做这一步，「旅游」的老行程重算清单时 x_sunscreen / x_gift 这类按 purposeExt
 * 判定的物品会突然消失（向后兼容底线：老行程的清单一个都不许变）。
 * R5-3：合并前按性别摘项（genderFilter），摘的顺序在合并前 —— 扩展物品不受性别过滤影响。
 *
 * R6：「替其他人管行李」关掉时按「只管自己」生成清单 —— 源引擎是红线改不了，
 * 所以在调用前把人数维度降级：成人按 1、儿童 / 老人清零（宠物是自己的，保留）。
 * 开关默认开，老数据缺失也按开 —— 行为与加这维之前完全一致。
 */
export function buildPrepExt(c: ConditionsExt): PrepItem[] {
  const cc: ConditionsExt = isPurposeExt(c.purposeExt) ? c : { ...c, purposeExt: c.purpose };
  const effective: ConditionsExt = cc.careOthers === false
    ? { ...cc, adults: 1, children: 0, elderly: false, elderlyCount: 0 }
    : cc;
  const base = genderFilter(buildPrep(effective), cc);
  const extra = EXTRA_ITEMS.filter(it => it.when(effective)).map(it => toPrepItem(it, effective));
  return sortItemsExt([...base, ...extra]);
}

// ─────────────────── 扩展层本地状态（独立 storage key）───────────────────
//
// 绝不写进 Stay 数据：Stay 的结构属于红线（core/types.ts），加字段会破坏与源项目的一致性。
// 用独立 key 存，删掉整个 key 就等于卸载扩展层。

const EXT_KEY = 'htb_ext_v1';

/** 单个行程的扩展信息 */
export interface StayExt {
  relation: Relation;
  /** 培训 / 学习场景 */
  study?: boolean;
  /** 成人同行人数（不含自己）。老数据没有这一维，缺失时按 0 算 */
  adultsWith?: number;
  /** 老人数量。老数据没有这一维时，由 Stay.conditions.elderly 布尔回推 */
  elderlyCount?: number;
  /** R5-9：用户真正点的住宿情况（7 值）。老数据缺失时用 Stay.conditions.purpose 回推 */
  purposeExt?: PurposeExt;
  /** R5-3：性别。老数据缺失 → undefined → 清单不做性别过滤（与加这维之前一致） */
  gender?: Gender;
  /** R5-5：是否处于经期。仅女性行程会有；性别未知时读了也要能正常降级 */
  period?: boolean;
  /** R6：是否替其他人管行李。老数据缺失按 true（保持加这维之前的行为） */
  careOthers?: boolean;
}

export interface ExtState {
  /** 偏好：新建行程时的默认住宿关系（「我的」页可改） */
  prefs: { relation: Relation };
  /** 每个行程的扩展信息（stayId → StayExt） */
  stays: Record<string, StayExt>;
}

function emptyExt(): ExtState {
  return { prefs: { relation: DEFAULT_RELATION }, stays: {} };
}

/**
 * 逐字段校验一条行程扩展记录（R5 起 gender / period / purposeExt 加入，
 * 不能再整包信任存储里的对象 —— 一个非法的 gender 值不该把整份扩展数据带坏）。
 * 规则：relation 非法 → 整条丢弃（与旧行为一致：getStayExt 对坏 relation 返回 null）；
 * 其余可选字段非法 → 静默剔除该字段；合法 → 原样保留。**绝不添加原记录没有的字段**，
 * 否则「存 A 读出 A+B」会破坏相等性断言与调用方的降级判断。
 */
function sanitizeStayExt(v: unknown): StayExt | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (!isRelation(r.relation)) return null;
  const out: StayExt = { relation: r.relation };
  if (typeof r.study === 'boolean') out.study = r.study;
  if (typeof r.adultsWith === 'number' && Number.isFinite(r.adultsWith)) out.adultsWith = r.adultsWith;
  if (typeof r.elderlyCount === 'number' && Number.isFinite(r.elderlyCount)) out.elderlyCount = r.elderlyCount;
  if (isPurposeExt(r.purposeExt)) out.purposeExt = r.purposeExt;
  if (isGender(r.gender)) out.gender = r.gender;
  if (typeof r.period === 'boolean') out.period = r.period;
  if (typeof r.careOthers === 'boolean') out.careOthers = r.careOthers;
  return out;
}

export function loadExt(): ExtState {
  const raw = Storage.getItem(EXT_KEY);
  if (!raw) return emptyExt();
  try {
    const p = JSON.parse(raw) as Partial<ExtState> | null;
    const rel = p && p.prefs ? (p.prefs as { relation?: unknown }).relation : undefined;
    const staysRaw = p && p.stays && typeof p.stays === 'object' ? (p.stays as Record<string, unknown>) : {};
    const stays: Record<string, StayExt> = {};
    for (const [k, v] of Object.entries(staysRaw)) {
      const s = sanitizeStayExt(v);
      if (s) stays[k] = s;
    }
    return {
      prefs: { relation: isRelation(rel) ? rel : DEFAULT_RELATION },
      stays,
    };
  } catch {
    // 存储损坏时静默回落到默认值，绝不让一个坏 key 把整个页面拖挂
    return emptyExt();
  }
}

export function saveExt(s: ExtState): void {
  Storage.setItem(EXT_KEY, JSON.stringify(s));
}

export function getDefaultRelation(): Relation {
  return loadExt().prefs.relation;
}

export function setDefaultRelation(r: Relation): void {
  const s = loadExt();
  s.prefs.relation = r;
  saveExt(s);
}

/** 取某个行程的扩展信息；没有则返回 null（老数据、导入的数据都可能没有） */
export function getStayExt(id: string): StayExt | null {
  if (!id) return null;
  const v = loadExt().stays[id];
  if (!v || !isRelation(v.relation)) return null;
  return v;
}

export function setStayExt(id: string, ext: StayExt): void {
  if (!id) return;
  const s = loadExt();
  s.stays[id] = ext;
  saveExt(s);
}

/** 删除行程时同步清掉扩展信息，避免残留无限增长 */
export function removeStayExt(id: string): void {
  if (!id) return;
  const s = loadExt();
  if (!(id in s.stays)) return;
  delete s.stays[id];
  saveExt(s);
}

/**
 * 备份导入：把备份 JSON 里的 ext 段写回本地。
 * 非法结构一律忽略（不抛错）—— 备份的主体是行程与好物，扩展段丢了不影响主流程。
 */
export function importExt(raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const p = raw as Partial<ExtState>;
  const cur = loadExt();
  if (p.prefs && isRelation((p.prefs as { relation?: unknown }).relation)) {
    cur.prefs.relation = (p.prefs as { relation: Relation }).relation;
  }
  if (p.stays && typeof p.stays === 'object') {
    const incoming = p.stays as Record<string, unknown>;
    for (const [k, v] of Object.entries(incoming)) {
      const s = sanitizeStayExt(v);
      if (s) cur.stays[k] = s;
    }
  }
  saveExt(cur);
}

// ─────────────────── 备份：在源导出/导入之上带上扩展段 ───────────────────
//
// 🔴 扩展数据必须跟着备份走，否则用户导出 → 换机导入后，所有行程的住宿关系全丢，
//    而清单里那些「朋友同行才有的棋牌」又还在，数据会前后矛盾。
//
// 做法是往源的备份 JSON 里多挂一个 `ext` 字段。对源 Web 版是**透明**的：
// 它只读 app / stays / gear，多出来的字段直接忽略，跨端互导不受影响。

/** 导出：源 exportData 的结果 + 扩展段 */
export function exportDataExt(): string {
  const payload = { ...(JSON.parse(exportData()) as Record<string, unknown>), ext: loadExt() };
  return JSON.stringify(payload, null, 2);
}

/**
 * 导入：先净化（A2），再走源 importData（它会跑自己的校验 —— 两层防线），
 * 成功后回写扩展段。老备份没有 ext 段 → importExt 内部直接忽略。
 *
 * 为什么必须先净化：源 importData 只校验 id / prep / conditions，
 * checkin / checkout 矩阵、custom、nights、gear 条目全信 ——
 * 一份缺字段 / 字段类型不对的备份一旦进来，行程页渲染 s[st][gi][ii]
 * 越界、好物页对非对象取 .name，直接白屏。sanitizeBackup 把每条数据
 * 修到与本地新建的行程 / 好物完全同构后才交给源引擎。
 * JSON 语法错误（SyntaxError）与「不是本工具箱的备份文件」（Error）
 * 在 sanitizeBackup 里原样上抛，「我的」页 runImport 已按此给友好提示。
 */
export function importDataExt(text: string): { stays: number; gear: number } {
  const payload = sanitizeBackup(text);
  const r = importData(JSON.stringify(payload));
  try {
    importExt(payload.ext);
  } catch {
    // 主体已导入成功；扩展段解析失败只是少几条关系记录，不该让整个导入失败
  }
  return r;
}
