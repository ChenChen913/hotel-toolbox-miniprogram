// engine.ts — 规则求值 + 行程存储 + 备份。纯逻辑，不依赖 Vue/DOM；node 测试用内存 Storage。
import type { Conditions, GearEntry, Guest, PrepItem, Stay } from './types';
import { CAT_ORDER, CHECKLISTS, GEAR_CATS, GEAR_SEED, ITEMS, defaultQty } from './data';

// localStorage 在 node/Vitest 里不存在 → 内存兜底
interface MiniStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}
function memoryStorage(): MiniStorage {
  const m = new Map<string, string>();
  return {
    getItem: k => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: k => void m.delete(k),
  };
}
export const Storage: MiniStorage =
  typeof localStorage === 'undefined' ? memoryStorage() : localStorage;

export { GEAR_CATS } from './data';
export const STORE_KEY = 'htb_stays_v1';
const GEAR_KEY = 'htb_gear_v5';
const GEAR_V4_KEY = 'htb_gear_v4';
const GEAR_V3_KEY = 'htb_gear_v3';

// 条件 → 物品清单（含数量与准备方式）
export function buildPrep(c: Conditions): PrepItem[] {
  return ITEMS
    .filter(it => it.when(c))
    .map(it => ({
      itemId: it.id,
      name: it.name,
      cat: it.cat,
      unit: it.unit,
      prep: it.prep,
      source: (it.prep === '必带' ? '必备' : '推荐') as PrepItem['source'],
      users: it.users === 'child' ? '儿童' : it.users === 'shared' ? '共用' : '每人',
      qty: defaultQty(it, c),
      done: false,
    }));
}

export function sortItems(items: PrepItem[]): PrepItem[] {
  return [...items].sort((a, b) =>
    CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat) || a.name.localeCompare(b.name, 'zh'));
}

// —— 行程存取 ——
export function listStays(): Stay[] {
  return (JSON.parse(Storage.getItem(STORE_KEY) || '[]') as Stay[]).map(ensureGuests);
}
export function saveStay(stay: Stay): Stay {
  const all = listStays();
  const i = all.findIndex(s => s.id === stay.id);
  if (i >= 0) all[i] = stay; else all.push(stay);
  Storage.setItem(STORE_KEY, JSON.stringify(all));
  return stay;
}
export function getStay(id: string): Stay | null {
  return listStays().find(s => s.id === id) || null;
}
export function deleteStay(id: string): void {
  Storage.setItem(STORE_KEY, JSON.stringify(listStays().filter(s => s.id !== id)));
}
/** 按 conditions 生成默认入住人（成人 N + 儿童 N + 老人） */
export function buildGuests(c: Conditions): Guest[] {
  const out: Guest[] = [];
  for (let i = 1; i <= c.adults; i++) out.push({ id: `guest_a${i}`, kind: 'adult', label: `入住人${i}` });
  for (let i = 1; i <= c.children; i++) out.push({ id: `guest_c${i}`, kind: 'child', label: c.children === 1 ? '儿童' : `儿童${i}`, childAge: c.childAge });
  if (c.elderly) out.push({ id: 'guest_e1', kind: 'elderly', label: '老人' });
  return out;
}

/** 旧数据迁移：无 guests 的行程按 conditions 补齐（assign 旧文案与新 label 兼容） */
export function ensureGuests(s: Stay): Stay {
  if (!Array.isArray(s.guests)) s.guests = buildGuests(s.conditions);
  return s;
}

export function newStay(conditions: Conditions, prepItems: PrepItem[]): Stay {
  // JSON 深拷贝：入参可能是 Vue 响应式代理，structuredClone 无法克隆 Proxy
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    id: 'stay_' + Date.now().toString(36),
    createdAt: new Date().toISOString(),
    date: conditions.date || '',
    nights: conditions.nights,
    guests: buildGuests(conditions),
    conditions: clone(conditions),
    prep: clone(prepItems),
    custom: [],
    checkin: CHECKLISTS.checkin.groups.map(g => g.items.map(() => false)),
    checkout: CHECKLISTS.checkout.groups.map(g => g.items.map(() => false)),
  };
}

// —— 好物收藏：一条 = 物品名称 + 品牌（⚪ 个人偏好，非商业推荐）——
// 存储 v5：[{ name, brand?, cat }]。旧 v4（类别 → 品牌）与 v3（物品 id → 品牌）读入时自动迁移。
function gearList(): GearEntry[] {
  const cur = Storage.getItem(GEAR_KEY);
  if (cur !== null) {
    try {
      const parsed = JSON.parse(cur) as unknown;
      if (Array.isArray(parsed)) return parsed as GearEntry[];
    } catch { /* 存储损坏时回落到种子 */ }
  }
  const v4 = Storage.getItem(GEAR_V4_KEY);
  if (v4 !== null) {
    const migrated = migrateCategoryKeyGear(JSON.parse(v4) as Record<string, string[]>);
    Storage.setItem(GEAR_KEY, JSON.stringify(migrated));
    return migrated;
  }
  const v3 = Storage.getItem(GEAR_V3_KEY);
  if (v3 !== null) {
    const migrated = migrateCategoryKeyGear(
      migrateItemKeyGear(JSON.parse(v3) as Record<string, string[]>),
    );
    Storage.setItem(GEAR_KEY, JSON.stringify(migrated));
    return migrated;
  }
  return GEAR_SEED.map(g => ({ ...g }));
}

/** v3（键=物品 id）→ 类别键：物品归入其分类，未知物品归「其他」 */
export function migrateItemKeyGear(old: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [itemId, brands] of Object.entries(old)) {
    const cat = ITEMS.find(i => i.id === itemId)?.cat ?? '其他';
    out[cat] = [...new Set([...(out[cat] ?? []), ...brands])];
  }
  return out;
}

/** v4（类别 → 品牌）→ v5 条目：品牌保留，物品名称回退为类别名 */
export function migrateCategoryKeyGear(old: Record<string, string[]>): GearEntry[] {
  const out: GearEntry[] = [];
  for (const [cat, brands] of Object.entries(old)) {
    for (const brand of brands) out.push({ name: cat, brand, cat });
  }
  return out;
}

export function listGear(cat?: string): GearEntry[] {
  const all = gearList();
  return cat ? all.filter(g => g.cat === cat) : all;
}

export function addGear(entry: GearEntry): GearEntry[] {
  const list = gearList();
  const dup = list.some(g => g.cat === entry.cat && g.name === entry.name && (g.brand ?? '') === (entry.brand ?? ''));
  if (!dup) list.push(entry);
  Storage.setItem(GEAR_KEY, JSON.stringify(list));
  return list;
}

export function removeGear(index: number): GearEntry[] {
  const list = gearList();
  if (index >= 0 && index < list.length) list.splice(index, 1);
  Storage.setItem(GEAR_KEY, JSON.stringify(list));
  return list;
}

/** 恢复默认好物（清空用户改动，回到种子） */
export function resetGear(): GearEntry[] {
  const seed = GEAR_SEED.map(g => ({ ...g }));
  Storage.setItem(GEAR_KEY, JSON.stringify(seed));
  return seed;
}

// —— 数据备份：导出 / 导入（缓解 localStorage 清空即丢失的风险）——
export interface Backup {
  app: 'hotel-toolbox';
  exportedAt: string;
  stays: Stay[];
  gear: GearEntry[];
}
export function exportData(): string {
  return JSON.stringify({ app: 'hotel-toolbox', exportedAt: new Date().toISOString(), stays: listStays(), gear: gearList() }, null, 2);
}
export function importData(text: string): { stays: number; gear: number } {
  const data = JSON.parse(text) as Partial<Backup>;
  if (data.app !== 'hotel-toolbox' || !Array.isArray(data.stays)) throw new Error('不是本工具箱的备份文件');
  const stays = data.stays.filter(s => s && typeof s.id === 'string' && Array.isArray(s.prep) && s.conditions);
  Storage.setItem(STORE_KEY, JSON.stringify(stays));
  const gear = Array.isArray(data.gear)
    ? data.gear
    : (data.gear && typeof data.gear === 'object' ? migrateCategoryKeyGear(data.gear as Record<string, string[]>) : []);
  Storage.setItem(GEAR_KEY, JSON.stringify(gear));
  return { stays: stays.length, gear: gear.length };
}
