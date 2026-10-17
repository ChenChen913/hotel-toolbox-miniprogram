// repair.ts —— 存储读修复与备份净化（A1 / A2 / A4 的落点）。
//
// 为什么需要这一层：
//   core/engine.ts 是红线文件（必须与源 Web 项目 D:/hotel/src/engine.ts 零差异，
//   npm run diff:engine 盯着），但它有三处与生俱来的脆弱点，本机存储一旦损坏、
//   或剪贴板导入的备份一旦畸形，全应用打开即崩：
//     · A1  listStays() 对 htb_stays_v1 裸 JSON.parse、无 try/catch —— 它是首页、
//           行程页、「我的」页的公共读入口，一坏全崩且无恢复路径；
//     · A2  importData() 只校验 id/prep/conditions —— checkin/checkout 矩阵、
//           custom、nights、gear 条目全信，一份缺字段的备份能让行程页/好物页崩掉；
//     · A4  行程的 checkin/checkout 是与 CHECKLISTS 强耦合的位置索引布尔矩阵 ——
//           将来清单一旦加组/加项，所有旧行程渲染 s[st][gi][ii] 就越界。
//   engine 动不了，就把「修好再还给 engine」这一步挪出来：
//     · platform.ts 读 STORE_KEY 时先过 parseStaysPayload（A1 + A4 一起解决）；
//     · extra.ts 的 importDataExt 先过 sanitizeBackup 再交给源 importData（A2）。
//   本文件全部纯函数、零 wx 调用，vitest 可直接测；红线三文件一字不动。
//
// 修复哲学（与 extra.ts 的 sanitizeStayExt 一致）：
//   逐字段校验；非法字段补默认值；救不了的整条丢弃 —— 一个坏值不许把整份存储带坏。
//   各对象的重建键序与源 newStay / buildPrep / buildGuests / GearEntry 完全一致，
//   因此「合法数据修复前后 JSON.stringify 相等」—— 读修复据此做到
//   「没坏的数据一个字节都不动」，测试也以此断言（见 acceptance.test.ts Z 组）。

import { CHECKLISTS } from './data';
import type { ChildAge, Conditions, GearEntry, Guest, PrepItem, Purpose, Stay } from './types';

// ─────────────────────────── 校验口径（小工具） ───────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CHILD_AGES: ChildAge[] = ['0-3', '4-6', '7-12', '13+'];
const PURPOSES: Purpose[] = ['普通短住', '出差', '旅游', '探亲'];
const SOURCES: PrepItem['source'][] = ['必备', '推荐', '自定义'];
const GUEST_KINDS: Guest['kind'][] = ['adult', 'child', 'elderly'];

/** 只有字面 true 才算 true —— 字符串 "true"、1 之类一律不认 */
const bool = (v: unknown): boolean => v === true;
/** ≥ dflt 的有限数取整，否则回落 dflt（nights / adults 至少为 1） */
const intAtLeast = (v: unknown, dflt: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= dflt ? Math.floor(v) : dflt;
/** 非负整数；非法一律当 0 —— 与 extra.ts 的 int0 同口径 */
const int0 = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
/** 枚举字段：值必须在白名单里，否则回落默认（不瞎猜） */
const oneOf = <T extends string>(v: unknown, list: readonly T[], dflt: T): T =>
  typeof v === 'string' && (list as readonly string[]).indexOf(v) >= 0 ? (v as T) : dflt;

// ─────────────────────────── 单条修复 ───────────────────────────

/**
 * 把存储里的检查矩阵对齐到 CHECKLISTS 的当前结构（A4 前向兼容）。
 * 对得上位置的旧 true 全保留；清单将来加组/加项自动补 false，删组/删项自动裁掉。
 */
export function fitCheckMatrix(m: unknown, st: 'checkin' | 'checkout'): boolean[][] {
  const src = Array.isArray(m) ? (m as unknown[][]) : [];
  return CHECKLISTS[st].groups.map((g, gi) =>
    g.items.map((_, ii) => {
      const row = Array.isArray(src[gi]) ? src[gi] : [];
      return row[ii] === true;
    }),
  );
}

/** 逐字段修复 conditions（键序 = wizard.defaultDraft / 源 Conditions）。conditions 不是对象的行程由 normalizeStay 直接丢弃。 */
function normalizeConditions(c: Record<string, unknown>): Conditions {
  const prefs = c.prefs && typeof c.prefs === 'object' ? (c.prefs as Record<string, unknown>) : {};
  return {
    date: typeof c.date === 'string' && DATE_RE.test(c.date) ? c.date : '',
    nights: intAtLeast(c.nights, 1),
    adults: intAtLeast(c.adults, 1),
    children: int0(c.children),
    childAge: oneOf(c.childAge, CHILD_AGES, '0-3'),
    elderly: bool(c.elderly),
    pet: bool(c.pet),
    purpose: oneOf(c.purpose, PURPOSES, '普通短住'),
    prefs: {
      sleep: bool(prefs.sleep),
      hygiene: bool(prefs.hygiene),
      mosquito: bool(prefs.mosquito),
      gadgets: bool(prefs.gadgets),
    },
  };
}

/**
 * 清单项修复：没有 name 的救不了，丢弃；其余字段非法补默认。
 * 键序与源 buildPrep / addCustom 生成的对象一致，合法项修复前后 JSON 相等。
 */
function normalizePrepItem(v: unknown): PrepItem | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (typeof r.name !== 'string' || !r.name) return null;
  return {
    itemId: typeof r.itemId === 'string' && r.itemId ? r.itemId : undefined,
    name: r.name,
    cat: typeof r.cat === 'string' && r.cat ? r.cat : '自定义',
    unit: typeof r.unit === 'string' && r.unit ? r.unit : '件',
    prep: typeof r.prep === 'string' && r.prep ? r.prep : '自定义',
    source: oneOf(r.source, SOURCES, '自定义'),
    users: typeof r.users === 'string' && r.users ? r.users : '每人',
    qty: typeof r.qty === 'number' && Number.isFinite(r.qty) && r.qty >= 0 ? r.qty : 1,
    done: bool(r.done),
    assign: typeof r.assign === 'string' && r.assign ? r.assign : undefined,
  };
}

/**
 * 入住人修复：整组全部合法才保留，否则整组丢弃 —— engine 的 ensureGuests
 * 在 listStays 里会按 conditions 重建，丢掉等于「回到默认」，比半截数据干净。
 */
function normalizeGuests(v: unknown): Guest[] {
  if (!Array.isArray(v) || v.length === 0) return [];
  const ok = v.every(g => {
    if (!g || typeof g !== 'object') return false;
    const r = g as Record<string, unknown>;
    return typeof r.id === 'string' && r.id !== ''
      && (GUEST_KINDS as string[]).indexOf(r.kind as string) >= 0
      && typeof r.label === 'string';
  });
  if (!ok) return [];
  return v.map(g => {
    const r = g as Record<string, unknown>;
    const out: Guest = { id: r.id as string, kind: r.kind as Guest['kind'], label: r.label as string };
    if (typeof r.childAge === 'string' && (CHILD_AGES as string[]).indexOf(r.childAge) >= 0) {
      out.childAge = r.childAge as ChildAge;
    }
    return out;
  });
}

/**
 * 单条行程修复。返回 null = 救不了（缺 id / conditions 不是对象），调用方丢弃。
 * 输出键序与源 newStay 一致：id → createdAt → date → nights → guests →
 * conditions → prep → custom → checkin → checkout。
 */
export function normalizeStay(v: unknown): Stay | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>;
  if (typeof s.id !== 'string' || !s.id) return null;
  if (!s.conditions || typeof s.conditions !== 'object') return null;
  const conditions = normalizeConditions(s.conditions as Record<string, unknown>);
  const prep = (Array.isArray(s.prep) ? s.prep : []).map(normalizePrepItem)
    .filter((x): x is PrepItem => x !== null);
  const custom = (Array.isArray(s.custom) ? s.custom : []).map(normalizePrepItem)
    .filter((x): x is PrepItem => x !== null);
  return {
    id: s.id,
    createdAt: typeof s.createdAt === 'string' ? s.createdAt : new Date().toISOString(),
    // date 与 conditions.date 对齐（newStay 本来就是同源），避免两处说法打架
    date: conditions.date,
    nights: conditions.nights,
    guests: normalizeGuests(s.guests),
    conditions,
    prep,
    custom,
    checkin: fitCheckMatrix(s.checkin, 'checkin'),
    checkout: fitCheckMatrix(s.checkout, 'checkout'),
  };
}

// ─────────────────────────── 行程存储的读修复 ───────────────────────────

export interface StaysPayload {
  stays: Stay[];
  /** 修复后的 JSON 文本；与原文完全相同时原样返回原文（platform 据此避免无谓重写） */
  json: string;
}

/**
 * 解析并修复 htb_stays_v1 的存储文本。
 * 返回 null = 救不了（JSON 语法错误 / 顶层不是数组）——
 * 调用方（platform）应把原文隔离后按空列表继续，应用照常启动（A1）。
 */
export function parseStaysPayload(raw: string): StaysPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const stays = parsed.map(normalizeStay).filter((s): s is Stay => s !== null);
  const json = JSON.stringify(stays);
  return { stays, json: json === raw ? raw : json };
}

// ─────────────────────────── 备份导入净化（A2）───────────────────

/** 净化后的备份载荷：交给源 importData 前先把脏数据洗干净 */
export interface SanitizedBackup {
  app: 'hotel-toolbox';
  stays: Stay[];
  /** 数组 = 已净化的 v5 条目；对象 = 旧版「类别 → 品牌」格式，留给源 importData 迁移 */
  gear: GearEntry[] | Record<string, string[]>;
  /** 扩展段原样透传 —— importExt 自己会逐字段校验，这里不重复 */
  ext: unknown;
}

/** 好物条目：没有 name 的丢弃；cat 缺失归「其他」（键序 = 源 GearEntry） */
function normalizeGearEntry(v: unknown): GearEntry | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (typeof r.name !== 'string' || !r.name) return null;
  return {
    name: r.name,
    brand: typeof r.brand === 'string' && r.brand ? r.brand : undefined,
    cat: typeof r.cat === 'string' && r.cat ? r.cat : '其他',
  };
}

/**
 * 备份 JSON 净化：在源 importData 之前运行（importDataExt 是唯一调用方）。
 *   · JSON 语法错误 → SyntaxError 原样上抛（「我的」页 runImport 已按此给友好提示）；
 *   · app 不是本工具 / stays 不是数组 → 抛与源同文案的 Error（不是本工具箱的备份文件）；
 *   · 每条 stay 走 normalizeStay：checkin/checkout 矩阵对齐、nights/date/custom 补默认；
 *   · gear 数组逐条净化（null、无 name 的脏条目直接丢）；旧分类对象格式留给源迁移。
 * 源 importData 仍会跑它自己的校验 —— 两层防线，谁先拦住都一样。
 */
export function sanitizeBackup(text: string): SanitizedBackup {
  // 语法错误由 JSON.parse 原样抛出（SyntaxError），上层按既有文案提示
  const data = JSON.parse(text) as Record<string, unknown>;
  if (!data || typeof data !== 'object'
    || data.app !== 'hotel-toolbox' || !Array.isArray(data.stays)) {
    throw new Error('不是本工具箱的备份文件');
  }
  const stays = (data.stays as unknown[]).map(normalizeStay)
    .filter((s): s is Stay => s !== null);
  const g = data.gear;
  const gear: SanitizedBackup['gear'] = Array.isArray(g)
    ? g.map(normalizeGearEntry).filter((x): x is GearEntry => x !== null)
    : (g && typeof g === 'object' ? g as Record<string, string[]> : []);
  return { app: 'hotel-toolbox', stays, gear, ext: data.ext };
}
