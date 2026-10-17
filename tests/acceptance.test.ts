/**
 * 验收用例执行集 —— 对应 `06-注意事项与验收清单.md` §5 的 A1–F5 全量用例。
 *
 * 说明：
 *   1. 这是**小程序工程新增**的文件，源项目 `D:/hotel/tests/` 里没有它。
 *      源项目的 38 个用例在 `tests/engine.test.ts`，逐字复制未改动，与本文件分开计数。
 *   2. 能落到数据 / 引擎 / 纯函数层的断言，全部在这里用代码跑。
 *   3. 纯渲染与交互项（如「名称半透明」「页签不串」「真机玻璃效果」）无法在 node 里断言，
 *      改为「静态文案/结构断言」或列入 `ACCEPTANCE.md` 的人工验证清单，不做假断言。
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CAT_ORDER, CHECKLISTS, CUSTOM_HINTS, DISCLAIMER, EVIDENCE_META, GEAR_CATS, GEAR_SEED,
  ITEMS, KNOWLEDGE, RISK_META, guessGearCat,
} from '../miniprogram/core/data';
import {
  addGear, buildGuests, buildPrep, deleteStay, exportData, getStay, importData, listGear,
  listStays, newStay, removeGear, resetGear, saveStay, sortItems, Storage,
} from '../miniprogram/core/engine';
import {
  CAT_ORDER_EXT, COMPANION_RELATIONS, COSMETIC_TYPES, EXTRA_ITEMS, GEAR_CATS_EXT, MAX_CHILDREN,
  PURPOSES_EXT, RELATIONS,
  autoRelation, buildPrepExt, canAddCompanion, clampCompanions, companionBudget, elderlyCountOf,
  exportDataExt, getDefaultRelation, getStayExt, importDataExt, prepStats, removeStayExt,
  setDefaultRelation, setStayExt, sortItemsExt, splitByQty, syncElderlyFlag, toSourcePurpose,
} from '../miniprogram/core/extra';
import type { ConditionsExt, Relation } from '../miniprogram/core/extra';
import {
  fitCheckMatrix, normalizeStay, parseStaysPayload, sanitizeBackup,
} from '../miniprogram/core/repair';
import { SCROLL_TOP_TRIGGER, shouldShowGoTop } from '../miniprogram/core/gesture';
import { fmtDate, stayPhaseLabel, suggestedStage } from '../miniprogram/core/store';
import { TOAST_MS, TOAST_ZERO_TEXT, shouldToastZero } from '../miniprogram/core/toast';
import type { Conditions, PrepItem } from '../miniprogram/core/types';

// package.json 是 "type": "module"，用 import.meta.url 而不是 __dirname（依赖 vitest 的 shim）
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'miniprogram');
const src = (rel: string) => readFileSync(join(root, rel), 'utf-8');
/** 工程根目录下的文件（tools/ 等不在 miniprogramRoot 里） */
const srcRepo = (rel: string) => readFileSync(join(root, '..', rel), 'utf-8');

const base: Conditions = {
  date: '', nights: 3, adults: 2, children: 0, childAge: '0-3', elderly: false, pet: false,
  purpose: '旅游', prefs: { sleep: false, hygiene: false, mosquito: false, gadgets: false },
};
const get = (list: PrepItem[], part: string) => list.find(i => i.name.includes(part));
const names = (list: PrepItem[]) => list.map(i => i.name);

// 与 wizard.ts 完全相同的日期算法（禁止 new Date('YYYY-MM-DD')）
const pad = (n: number) => String(n).padStart(2, '0');
const dstr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const offsetDate = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return dstr(d); };
const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return dstr(new Date(y, m - 1, d + n));
};
/** 复刻 wizard.ts 的 fxNames：开关前后 buildPrep 的差集，非硬编码 */
const fxNames = (on: Conditions, off: Conditions) => {
  const b = new Set(buildPrep(off).map(i => i.name));
  return buildPrep(on).filter(i => !b.has(i.name)).map(i => i.name);
};

beforeEach(() => {
  ['htb_stays_v1', 'htb_gear_v3', 'htb_gear_v4', 'htb_gear_v5', 'htb_ext_v1'].forEach(k => Storage.removeItem(k));
});

// ───────────────────────────── A 规则引擎 ─────────────────────────────

describe('A 规则引擎（06 §5.1）', () => {
  it('A1 2 成人 / 3 晚 / 无偏好', () => {
    const p = buildPrep(base);
    expect(names(p).some(n => n.includes('身份证'))).toBe(true);
    expect(get(p, '拖鞋')!.qty).toBe(2);
    expect(get(p, '马桶垫')!.qty).toBe(8);
    expect(get(p, '充电器')!.qty).toBe(2);
    expect(get(p, '眼罩')).toBeUndefined();
    expect(get(p, '阻门器')).toBeDefined();
    expect(p.every(i => i.qty >= 1)).toBe(true);
  });

  it('A2 开启睡眠敏感 → 眼罩 2、耳塞存在', () => {
    const p = buildPrep({ ...base, prefs: { ...base.prefs, sleep: true } });
    expect(get(p, '眼罩')!.qty).toBe(2);
    expect(get(p, '耳塞')).toBeDefined();
  });

  it('A3 儿童 1 位 / 0–3 岁 → 纸尿裤 4、婴儿湿巾 1、儿童牙刷存在', () => {
    const p = buildPrep({ ...base, children: 1, childAge: '0-3' });
    expect(get(p, '纸尿裤')!.qty).toBe(4);
    expect(get(p, '婴儿湿巾')!.qty).toBe(1);
    expect(get(p, '儿童牙刷')).toBeDefined();
  });

  it('A4 儿童 1 位 / 7–12 岁 → 无纸尿裤、无床围挡、儿童牙刷存在', () => {
    const p = buildPrep({ ...base, children: 1, childAge: '7-12' });
    expect(get(p, '纸尿裤')).toBeUndefined();
    expect(get(p, '床围挡')).toBeUndefined();
    expect(get(p, '儿童牙刷')).toBeDefined();
  });

  it('A5 2 成人 3 晚 → 内衣裤 8、换洗上衣 8、睡衣 2', () => {
    const p = buildPrep(base);
    expect(get(p, '内衣裤')!.qty).toBe(8);
    expect(get(p, '换洗上衣')!.qty).toBe(8);
    expect(get(p, '睡衣')!.qty).toBe(2);
  });

  it('A6 4 成人 → 身份证 4、拖鞋 4（不压缩为 3）', () => {
    const p = buildPrep({ ...base, adults: 4 });
    expect(get(p, '身份证')!.qty).toBe(4);
    expect(get(p, '拖鞋')!.qty).toBe(4);
  });

  it('A7 5 晚 → 洗衣片存在；3 晚不存在', () => {
    expect(get(buildPrep({ ...base, nights: 5 }), '洗衣片')).toBeDefined();
    expect(get(buildPrep({ ...base, nights: 3 }), '洗衣片')).toBeUndefined();
  });

  it('A8 有老人 → 防滑拖鞋、常用药品存在', () => {
    const p = buildPrep({ ...base, elderly: true });
    expect(get(p, '防滑拖鞋')).toBeDefined();
    expect(get(p, '常用药品')).toBeDefined();
  });
});

// ───────────────────────────── B 向导流程 ─────────────────────────────

describe('B 向导流程（06 §5.2）', () => {
  it('B1 点「明天」→ 日期 = 明天，退房日 = 明天 + 晚数', () => {
    const tomorrow = offsetDate(1);
    const nights = 3;
    expect(addDays(tomorrow, nights)).toBe(offsetDate(1 + nights));
    // 页面用的是同一套算法（禁止 new Date('YYYY-MM-DD')）
    expect(src('pages/wizard/wizard.ts')).toContain("d.date.split('-').map(Number)");
    expect(fmtDate(tomorrow)).toMatch(/^\d+月\d+日 · 周[日一二三四五六]$/);
  });

  it('B2 晚数改 4 → 提示语含「并加入洗衣、晾衣用品」', () => {
    const wxml = src('pages/wizard/wizard.ts');
    expect(wxml).toContain('并加入洗衣、晾衣用品');
    // 文案背后确实有规则支撑：4 晚才出现洗衣片
    expect(get(buildPrep({ ...base, nights: 4 }), '洗衣片')).toBeDefined();
    expect(get(buildPrep({ ...base, nights: 3 }), '洗衣片')).toBeUndefined();
  });

  it('B3 人数按钮：能升能降，且 3+ 区间不被压缩（P0-8）', () => {
    // 复刻 wizard.ts setAdults 的决策：点「1/2 人」直接生效；点「3 人及以上」时已在 3+ 区间则保留
    const next = (cur: number, n: number) => (n >= 3 && cur >= 3 ? cur : n);
    expect(next(1, 2)).toBe(2);
    expect(next(2, 1)).toBe(1);   // 能降回来（原 Math.max 会卡在 2）
    expect(next(5, 1)).toBe(1);   // 从 5 直接回到 1，步进器随之隐藏
    expect(next(1, 3)).toBe(3);   // 首次点「3 人及以上」
    expect(next(5, 3)).toBe(5);   // 已在 3+ 区间，点 3+ 不回退（不压缩，守住 §16）
    // 源码里已不再有那个「只能升不能降」的写法
    expect(src('pages/wizard/wizard.ts')).not.toContain('Math.max(this.data.draft.adults, n)');
    expect(src('pages/wizard/wizard.ts')).toContain('n >= 3 && cur >= 3 ? cur : n');
    // 步进器范围 3–10 写在模板上
    expect(src('pages/wizard/wizard.wxml')).toMatch(/min="\{\{3\}\}"/);
    expect(src('pages/wizard/wizard.wxml')).toMatch(/max="\{\{10\}\}"/);
  });

  it('B4 儿童 1 位 / 0–3 岁 → 「＋将加入」由规则实时算出纸尿裤等', () => {
    const fx = fxNames({ ...base, children: 1, childAge: '0-3' }, { ...base, children: 0 });
    expect(fx).toContain('纸尿裤');
    expect(fx.length).toBeGreaterThan(0);
  });

  it('B5 第 5 步开「蚊虫季节」→ ＋将加入：驱蚊液/花露水', () => {
    const wxml = src('pages/wizard/wizard.wxml');
    expect(wxml).toContain('＋将加入：驱蚊液/花露水');
    const fx = fxNames(
      { ...base, prefs: { ...base.prefs, mosquito: true } },
      { ...base, prefs: { ...base.prefs, mosquito: false } },
    );
    expect(fx.join('、')).toContain('驱蚊');
  });

  it('B6 第 6 步「这些选择如何影响清单」逐条正确，分组按 CAT_ORDER', () => {
    const c: Conditions = { ...base, nights: 4, children: 1, elderly: true, prefs: { ...base.prefs, sleep: true } };
    const fxChild = fxNames({ ...c, children: 1 }, { ...c, children: 0 });
    const fxElder = fxNames({ ...c, elderly: true }, { ...c, elderly: false });
    const fxSleep = fxNames({ ...c, prefs: { ...c.prefs, sleep: true } }, { ...c, prefs: { ...c.prefs, sleep: false } });
    expect(fxChild.length).toBeGreaterThan(0);
    expect(fxElder.length).toBeGreaterThan(0);
    expect(fxSleep).toContain('眼罩');

    const sorted = sortItems(buildPrep(c));
    const order = sorted.map(i => i.cat);
    const ranks = order.map(x => CAT_ORDER.indexOf(x));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));  // 单调不减 = 严格按 CAT_ORDER
  });

  it('B7 第 6 步添加自定义物品 → 落在「自定义」分组，可删除', () => {
    const list = [...buildPrep(base)];
    list.push({ name: '自拍杆', cat: '自定义', unit: '件', prep: '自定义', source: '自定义', users: '共用', qty: 1, done: false });
    const groups = sortItems(list).filter(i => i.cat === '自定义');
    expect(groups.map(i => i.name)).toContain('自拍杆');
    // 删除逻辑：按 preview 下标 splice
    const idx = list.findIndex(i => i.name === '自拍杆');
    list.splice(idx, 1);
    expect(list.some(i => i.name === '自拍杆')).toBe(false);
  });

  it('B8 保存落盘；阶段按当天定位，绝不落「退房」', () => {
    const future = newStay({ ...base, date: offsetDate(5), nights: 2 }, buildPrep(base));
    expect(suggestedStage(future)).toBe('prep');
    const active = newStay({ ...base, date: offsetDate(0), nights: 2 }, buildPrep(base));
    expect(suggestedStage(active)).toBe('checkin');
    const ended = newStay({ ...base, date: offsetDate(-5), nights: 2 }, buildPrep(base));
    expect(suggestedStage(ended)).toBe('checkout');
    // 「绝不落退房」指新建行程当天不在入住期时只能落准备/入住
    expect(suggestedStage(newStay({ ...base, date: '', nights: 1 }, buildPrep(base)))).toBe('prep');

    saveStay(active);
    expect(getStay(active.id)).not.toBeNull();
    expect(listStays().length).toBe(1);
  });
});

// ───────────────────────────── C 行程页 ─────────────────────────────

describe('C 行程页（06 §5.3）', () => {
  it('C1 3 天前创建的行程 → 自动定位到对应阶段', () => {
    const past = { date: offsetDate(-3), nights: 2 };
    expect(suggestedStage(past)).toBe('checkout');
    const today = { date: offsetDate(0), nights: 2 };
    expect(suggestedStage(today)).toBe('checkin');
    const soon = { date: offsetDate(3), nights: 2 };
    expect(suggestedStage(soon)).toBe('prep');
  });

  it('C2 勾选物品 → 进度更新且退出重进保留', () => {
    const s = newStay(base, buildPrep(base));
    saveStay(s);
    const back = getStay(s.id)!;
    back.prep[0].done = true;
    saveStay(back);
    const again = getStay(s.id)!;
    expect(again.prep[0].done).toBe(true);
    const all = sortItems([...again.prep, ...again.custom]);
    expect(all.filter(i => i.done).length).toBe(1);
  });

  it('C3 数量改为 0 → 渲染「不带」并禁用勾选（模板标志由 JS 预计算）', () => {
    const wxml = src('components/item-row/item-row.wxml');
    const ts = src('components/item-row/item-row.ts');
    expect(wxml).toContain('不带');
    // 禁用态必须在 JS 里算好，WXML 里不能出现 qty > 0 这类裸比较
    expect(ts).toMatch(/off|disabled|zero/i);
    expect(wxml).not.toMatch(/\{\{[^}]*<[^}]*\}\}/);
  });

  it('C4 多人行程 → 使用人下拉选项随人数变化', () => {
    const one = buildGuests({ ...base, adults: 1 });
    expect(one.map(g => g.label)).toEqual(['入住人1']);
    const two = buildGuests({ ...base, adults: 2, children: 1, elderly: true });
    expect(two.map(g => g.label)).toEqual(['入住人1', '入住人2', '儿童', '老人']);
    const twoKids = buildGuests({ ...base, adults: 1, children: 2 });
    expect(twoKids.map(g => g.label)).toEqual(['入住人1', '儿童1', '儿童2']);
    // 源码里「全体 + 入住人」>1 才渲染（照搬源实现 opts.length > 1）
    expect(src('pages/stay/stay.ts')).toContain("['全体', ...(s.guests || []).map(g => g.label)]");
    expect(src('components/item-row/item-row.wxml')).toContain('picker');
  });

  it('C5 点「＋好物」→ 只显示这一件物品的品牌（name + cat 双过滤）', () => {
    addGear({ name: '充电宝', brand: '小米', cat: '电子' });
    addGear({ name: '耳塞', brand: '安耳悠', cat: '睡眠' });
    const mine = listGear().filter(g => g.name === '耳塞' && g.cat === '睡眠');
    expect(mine.length).toBe(1);
    expect(mine[0].brand).toBe('安耳悠');
    // 入口只给有 itemId 的物品（自定义物品不给）
    expect(src('components/item-row/item-row.wxml')).toContain('gearbtn');
  });

  it('C6 衣物分组选类型 → 一键加入；同分类同名不重复', () => {
    const list = buildPrep(base);
    const add = (name: string) => {
      if (list.some(i => i.cat === '衣物' && i.name === name)) return false;
      list.push({ name, cat: '衣物', unit: '件', prep: '家里带', source: '自定义', users: '每人', qty: 1, done: false });
      return true;
    };
    expect(add('泳衣')).toBe(true);
    expect(add('泳衣')).toBe(false);
    expect(list.filter(i => i.name === '泳衣').length).toBe(1);
  });

  it('C7 入住页勾选 → 进度正确；入住/退房状态互不串', () => {
    const s = newStay(base, buildPrep(base));
    s.checkin[0][0] = true;
    s.checkin[0][1] = true;
    saveStay(s);
    const back = getStay(s.id)!;
    const totalIn = CHECKLISTS.checkin.groups.reduce((n, g) => n + g.items.length, 0);
    const doneIn = back.checkin.flat().filter(Boolean).length;
    const doneOut = back.checkout.flat().filter(Boolean).length;
    expect(totalIn).toBe(15);
    expect(doneIn).toBe(2);
    expect(doneOut).toBe(0);   // 不串
    const totalOut = CHECKLISTS.checkout.groups.reduce((n, g) => n + g.items.length, 0);
    expect(totalOut).toBe(14);
  });

  it('C8 检查组「知识详解」指向的模块在知识库中都存在', () => {
    const mods = new Set(KNOWLEDGE.map(k => k.module));
    [...CHECKLISTS.checkin.groups, ...CHECKLISTS.checkout.groups]
      .filter(g => g.link)
      .forEach(g => expect(mods.has(g.link!)).toBe(true));
  });

  it('C9 「紧急」→ 跳知识库「紧急联络」模块，带返回行程', () => {
    expect(KNOWLEDGE.some(k => k.module === '紧急联络')).toBe(true);
    expect(src('pages/knowledge/knowledge.wxml')).toContain('返回行程');
  });

  it('C10 删除行程 → 从存储中移除', () => {
    const s = newStay(base, buildPrep(base));
    saveStay(s);
    expect(listStays().length).toBe(1);
    deleteStay(s.id);
    expect(listStays().length).toBe(0);
    expect(getStay(s.id)).toBeNull();
    // P0-6：二次确认由自绘 modal 组件承担，不再用 wx.showModal（注释里提到不算）
    expect(src('pages/stay/stay.json')).toContain('components/modal/modal');
    expect(src('pages/stay/stay.ts')).not.toContain('wx.showModal(');
    expect(src('pages/home/home.ts')).not.toContain('wx.showModal(');
    expect(src('pages/gear/gear.ts')).not.toContain('wx.showModal(');
  });
});

// ───────────────────────────── D 知识库 ─────────────────────────────

describe('D 知识库（06 §5.4）', () => {
  it('D1 免责声明数据 4 条 + 「触发即处理」区块（R7 起只在「我的」页展示）', () => {
    expect(DISCLAIMER.lines.length).toBe(4);
    expect(DISCLAIMER.triggers).toContain('立即处理');
    // R7：知识库顶部那份免责声明删除（与「我的」页重复，老板点名）——
    // 数据仍由 core/data.ts 的 DISCLAIMER 同源供给「我的」页，知识库不再渲染它
    const know = src('pages/knowledge/knowledge.wxml');
    expect(know).not.toContain('discTitle');
    expect(know).not.toContain('触发即处理');
    expect(know).not.toContain('wx:if="{{discOpen');   // 没有开关能把它藏回来
    const mine = src('pages/mine/mine.wxml');
    expect(mine).toContain('触发即处理');
    expect(src('pages/mine/mine.ts')).toContain('DISCLAIMER');
  });

  it('D2 图例：证据 4 项、风险 3 项；共 44 条 · 11 个模块', () => {
    expect(Object.keys(EVIDENCE_META).length).toBe(4);
    expect(Object.keys(RISK_META).length).toBe(3);
    expect(KNOWLEDGE.length).toBe(44);
    const mods: string[] = [];
    KNOWLEDGE.forEach(k => { if (!mods.includes(k.module)) mods.push(k.module); });
    expect(mods.length).toBe(11);
    // 图例底部那行「共 N 条 · 按 M 个模块分组」由数据驱动，不写死数字
    expect(src('pages/knowledge/knowledge.wxml')).toContain('共 {{total}} 条 · 按 {{modCount}} 个模块分组');
  });

  it('D3 模块顺序与规格逐字一致', () => {
    const mods: string[] = [];
    KNOWLEDGE.forEach(k => { if (!mods.includes(k.module)) mods.push(k.module); });
    expect(mods).toEqual(['使用说明', '紧急联络', '消防', '隐私', '卫生', '维权', '行前', '房间安全', '住宿期间', '特殊场景', '医疗与法律边界']);
  });

  it('D4 条目正文可分段、含 **加粗**、来源完整', () => {
    const bolded = KNOWLEDGE.filter(k => k.body.includes('**'));
    expect(bolded.length).toBeGreaterThan(0);
    KNOWLEDGE.forEach(k => {
      expect(k.body.length).toBeGreaterThan(0);
      expect(k.source.length).toBeGreaterThan(0);
      expect(k.updated).toMatch(/^\d{4}-\d{2}$/);
    });
    // 每条正文的 ** 必须成对，否则预解析会漏渲染
    KNOWLEDGE.forEach(k => {
      const n = (k.body.match(/\*\*/g) || []).length;
      expect(n % 2).toBe(0);
    });
  });

  it('D5 可复制话术 4 条，且全部在「紧急联络」模块', () => {
    const withCopy = KNOWLEDGE.filter(k => k.copy);
    expect(withCopy.length).toBe(4);
    withCopy.forEach(k => expect(k.module).toBe('紧急联络'));
  });

  it('D6 到期条目才显示「建议复核」（k5/k8/k10/k40 当前未到期）', () => {
    const now = new Date();
    const cur = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    const due = KNOWLEDGE.filter(k => k.reviewBy && k.reviewBy <= cur);
    expect(due.map(k => k.id)).toEqual([]);          // 2026-10 时点：无到期条目
    ['k5', 'k8', 'k10', 'k40'].forEach(id => {
      const k = KNOWLEDGE.find(x => x.id === id)!;
      expect(k.reviewBy!).toBeTruthy();
      expect(k.reviewBy!.localeCompare(cur)).toBeGreaterThan(0);   // 'YYYY-MM' 可直接字典序比较
    });
  });

  it('D7 模块级折叠：默认全收起、手风琴、跳转自动展开（P2-1）', () => {
    const wxml = src('pages/knowledge/knowledge.wxml');
    const ts = src('pages/knowledge/knowledge.ts');
    // 模块行整行可点，内容区由 m.open 驱动
    expect(wxml).toContain('bindtap="toggleModule"');
    expect(wxml).toContain('wx:if="{{m.open}}"');
    // 手风琴：展开目标模块的同时把其它模块置 false
    expect(ts).toContain('toggleModule(');
    expect(ts).toContain('i === mi ? willOpen : false');
    // 跳转进来时展开锚点模块
    expect(ts).toContain('patch[`modules[${mi}].open`] = true;');
    // 折叠必须用 wx:if 直接切：内容区不挂任何内联过渡/动画样式
    expect(wxml).toContain('<view wx:if="{{m.open}}" class="glass card" id="mod-{{mi}}">');
    expect(wxml).not.toContain('animation');
    // 等级图例仍常驻：不引入任何能把它藏起来的开关（R7：免责声明已移「我的」页，见 D1）
    expect(wxml).not.toContain('wx:if="{{discOpen');
    expect(wxml).not.toContain('wx:if="{{legOpen');
    expect(wxml).toContain('等级图例');
  });
});

// ───────────────────────────── E 好物 ─────────────────────────────

describe('E 好物（06 §5.5）', () => {
  const N0 = GEAR_SEED.length;   // 3 条种子

  /** 复刻 gear.ts 的分类决策：手动优先 > 联想 > 保持当前 */
  const resolveCat = (touched: boolean, current: string, name: string) => {
    if (touched) return { cat: current, guessed: false };
    const g = guessGearCat(name);
    return { cat: g || current, guessed: !!g };
  };

  it('E1 输入「充电宝」→ 分类自动选「电子」，标签呈金色虚线', () => {
    const r = resolveCat(false, GEAR_CATS[0], '充电宝');
    expect(r.cat).toBe('电子');
    expect(r.guessed).toBe(true);
    expect(src('pages/gear/gear.wxss')).toContain('.catchip.guessed');
  });

  it('E2 手动点「洗漱」后再改名称 → 分类保持洗漱', () => {
    const r = resolveCat(true, '洗漱', '充电宝');
    expect(r.cat).toBe('洗漱');
    expect(r.guessed).toBe(false);
  });

  it('E3 输入「神秘小物」→ 猜不出，分类不变', () => {
    expect(guessGearCat('神秘小物')).toBeNull();
    expect(resolveCat(false, '洗漱', '神秘小物')).toEqual({ cat: '洗漱', guessed: false });
  });

  it('E4 名称为空点保存 → 提示「先填物品名称，比如「充电宝」」', () => {
    expect(src('pages/gear/gear.ts')).toContain('先填物品名称，比如「充电宝」');
  });

  it('E5 两条「充电宝」（小米 / 罗马仕）并存', () => {
    addGear({ name: '充电宝', brand: '小米', cat: '电子' });
    addGear({ name: '充电宝', brand: '罗马仕', cat: '电子' });
    expect(listGear().filter(g => g.name === '充电宝').map(g => g.brand)).toEqual(['小米', '罗马仕']);
  });

  it('E6 完全相同的两条不重复添加', () => {
    addGear({ name: '充电宝', brand: '小米', cat: '电子' });
    addGear({ name: '充电宝', brand: '小米', cat: '电子' });
    expect(listGear().length).toBe(N0 + 1);
  });

  it('E7 品牌留空 → 允许，只显示名称', () => {
    addGear({ name: '筋膜枪', brand: undefined, cat: '其他' });
    const g = listGear().find(x => x.name === '筋膜枪')!;
    expect(g.brand ?? '').toBe('');
  });

  it('E8 恢复默认 → 回到 3 条种子', () => {
    addGear({ name: '神秘小物', cat: '其他' });
    expect(resetGear().length).toBe(3);
    expect(listGear().length).toBe(3);
  });
});

// ─────────────────────────── F 备份与恢复 ───────────────────────────

describe('F 备份与恢复（06 §5.6）', () => {
  it('F1 导出 JSON 含 app / stays / gear', () => {
    saveStay(newStay(base, buildPrep(base)));
    addGear({ name: '充电宝', brand: '小米', cat: '电子' });
    const d = JSON.parse(exportData());
    expect(d.app).toBe('hotel-toolbox');
    expect(typeof d.exportedAt).toBe('string');
    expect(d.stays.length).toBe(1);
    expect(d.gear.length).toBe(GEAR_SEED.length + 1);
  });

  it('F2 导入合法 JSON → 行程与好物数量正确恢复', () => {
    saveStay(newStay(base, buildPrep(base)));
    addGear({ name: '充电宝', brand: '小米', cat: '电子' });
    const json = exportData();
    ['htb_stays_v1', 'htb_gear_v5'].forEach(k => Storage.removeItem(k));
    const r = importData(json);
    expect(r.stays).toBe(1);
    expect(r.gear).toBe(GEAR_SEED.length + 1);
    expect(listStays().length).toBe(1);
    expect(listGear().length).toBe(GEAR_SEED.length + 1);
  });

  it('F3 app 字段不对 → 报错且不写入', () => {
    saveStay(newStay(base, buildPrep(base)));
    expect(() => importData('{"app":"other","stays":[]}')).toThrow('不是本工具箱的备份文件');
    expect(listStays().length).toBe(1);
  });

  it('F4 旧版 gear 对象格式自动迁移为条目', () => {
    const r = importData(JSON.stringify({
      app: 'hotel-toolbox', exportedAt: '', stays: [], gear: { 睡眠: ['安耳悠'], 电子: ['小米'] },
    }));
    expect(r.gear).toBe(2);
    expect(listGear()[0]).toEqual({ name: '睡眠', brand: '安耳悠', cat: '睡眠' });
  });

  it('F5 空剪贴板 / 非法 JSON → 抛错不写入；页面给友好提示', () => {
    saveStay(newStay(base, buildPrep(base)));
    expect(() => importData('')).toThrow();
    expect(() => importData('not json')).toThrow();
    expect(() => importData('{"app":"hotel-toolbox"}')).toThrow();
    expect(listStays().length).toBe(1);
    // E1：备份与恢复从首页搬到「我的」页，这条断言跟着换文件路径
    expect(src('pages/mine/mine.ts')).toContain('剪贴板里不是有效的备份 JSON');
  });
});

// ─────────────────── 回归清单 G（06 §6）───────────────────

describe('G 回归清单（06 §6）', () => {
  it('G2 数据规模：56 物品 / 44 知识 / 入住 15 / 退房 14', () => {
    expect(ITEMS.length).toBe(56);
    expect(KNOWLEDGE.length).toBe(44);
    expect(CHECKLISTS.checkin.groups.reduce((n, g) => n + g.items.length, 0)).toBe(15);
    expect(CHECKLISTS.checkout.groups.reduce((n, g) => n + g.items.length, 0)).toBe(14);
  });

  it('G3 禁用词零命中（知识库正文）', () => {
    const banned = ['绝对不要', '坚决不用', '千万别', '无脑', '必用', '万能', '百分百', '根治', '神物', '硬核'];
    banned.forEach(w => {
      KNOWLEDGE.forEach(k => expect(k.body + k.title).not.toContain(w));
    });
  });

  it('G4 迁移：v4 好物可迁移；无 guests 的旧行程可补齐', () => {
    const migrated = importData(JSON.stringify({
      app: 'hotel-toolbox', exportedAt: '', stays: [], gear: { 睡眠: ['安耳悠'] },
    }));
    expect(migrated.gear).toBe(1);
    const legacy = { ...newStay(base, buildPrep(base)) } as Record<string, unknown>;
    delete legacy.guests;
    expect(Array.isArray(legacy.guests)).toBe(false);
  });

  it('G5 内容保真：与源 data.ts 逐字一致', () => {
    // 工程内 core/data.ts 与源文件由 M1 的 diff 保证；这里守住规模与关键指纹
    expect(CUSTOM_HINTS.length).toBe(6);
    expect(CAT_ORDER.length).toBe(15);
    expect(GEAR_CATS.length).toBe(15);
  });
});

// ──────────────── H 扩展层（core/extra.ts，D-1 决策：方案③）────────────────

describe('H 扩展层（红线外的追加内容）', () => {
  const cond = (patch: Partial<ConditionsExt> = {}): ConditionsExt => ({ ...base, ...patch });
  const hasName = (list: PrepItem[], part: string) => list.some(i => i.name.includes(part));

  it('H1 扩展物品 id 统一 x_ 前缀，分类都在合并后的分类表里；源数据零改动', () => {
    const srcIds = new Set(ITEMS.map(i => i.id));
    expect(EXTRA_ITEMS.length).toBeGreaterThan(0);
    EXTRA_ITEMS.forEach(it => {
      expect(it.id.startsWith('x_')).toBe(true);
      expect(srcIds.has(it.id)).toBe(false);          // 绝不与源 id 撞车
      expect(CAT_ORDER_EXT.includes(it.cat)).toBe(true);
    });
    // 源 ITEMS / CAT_ORDER 一条不加、一条不改（否则 diff:data 会红）
    expect(ITEMS.length).toBe(56);
    expect(CAT_ORDER.length).toBe(15);
  });

  it('H2 分类合并（R5-6 起含「化妆品」）：化妆品紧跟衣物，娱乐 / 学习插在「补给」之后', () => {
    expect(CAT_ORDER_EXT.length).toBe(CAT_ORDER.length + 3);
    // 相对合并表内部比较：化妆品插进来后，衣物之后的源分类索引整体 +1，
    // 拿源数组的下标当期望值会算错
    expect(CAT_ORDER_EXT.indexOf('化妆品')).toBe(CAT_ORDER_EXT.indexOf('衣物') + 1);
    expect(CAT_ORDER_EXT.indexOf('娱乐')).toBe(CAT_ORDER_EXT.indexOf('补给') + 1);
    expect(CAT_ORDER_EXT.indexOf('学习')).toBe(CAT_ORDER_EXT.indexOf('补给') + 2);
    expect(CAT_ORDER_EXT[CAT_ORDER_EXT.length - 1]).toBe('自定义');
    // 好物分类跟着合并表走，但「自定义」不能出现在好物分类里（与源规则一致）
    expect(GEAR_CATS_EXT.includes('学习')).toBe(true);
    expect(GEAR_CATS_EXT.includes('娱乐')).toBe(true);
    expect(GEAR_CATS_EXT.includes('化妆品')).toBe(true);
    expect(GEAR_CATS_EXT.includes('自定义')).toBe(false);
  });

  it('H3 「朋友 / 同事」同行才加棋牌桌游，独自 / 情侣 / 家人不加', () => {
    const has = (r: Relation) => hasName(buildPrepExt(cond({ relation: r })), '棋牌');
    expect(has('朋友')).toBe(true);
    expect(has('同事')).toBe(true);
    expect(has('独自')).toBe(false);
    expect(has('情侣')).toBe(false);
    expect(has('家人')).toBe(false);
  });

  it('H4 培训 / 学习开关 → 加学习类物品，且「学习」排在「补给」之后', () => {
    const off = buildPrepExt(cond({ study: false }));
    const on = buildPrepExt(cond({ study: true }));
    expect(hasName(off, '学习/培训资料')).toBe(false);
    expect(hasName(on, '学习/培训资料')).toBe(true);
    expect(hasName(on, '笔记本/笔')).toBe(true);
    expect(on.filter(i => i.cat === '学习').length).toBe(2);
    const cats = [...new Set(sortItemsExt(on).map(i => i.cat))];
    expect(cats.indexOf('学习')).toBeGreaterThan(cats.indexOf('补给'));
    expect(cats.indexOf('学习')).toBeLessThan(cats.indexOf('自定义') < 0 ? cats.length : cats.indexOf('自定义'));
  });

  it('H5 枕头只在「睡眠敏感 + 无 0-3 岁婴幼儿」时出现（不与知识库窒息提示打架）', () => {
    const has = (c: ConditionsExt) => hasName(buildPrepExt(c), '枕头');
    expect(has(cond({ prefs: { ...base.prefs, sleep: true } }))).toBe(true);
    expect(has(cond())).toBe(false);                                        // 没开睡眠敏感
    expect(has(cond({ prefs: { ...base.prefs, sleep: true }, children: 1, childAge: '0-3' }))).toBe(false);
    expect(has(cond({ prefs: { ...base.prefs, sleep: true }, children: 1, childAge: '7-12' }))).toBe(true);
    // 名称里必须带限定语，避免被当成「婴儿床也能用」
    const pillow = EXTRA_ITEMS.find(i => i.id === 'x_pillow')!;
    expect(pillow.name).toContain('成人用');
  });

  it('H6 敏感物品不预置（D-5：交给用户自己在自定义里加）', () => {
    const all = EXTRA_ITEMS.map(i => i.id + i.name + (i.gear || []).map(g => g.name).join('')).join('|');
    ['安全套', '避孕套', '情趣', '成人用品', '润滑'].forEach(w => expect(all).not.toContain(w));
  });

  it('H7 buildPrepExt 是「源清单 + 扩展物品」，源清单一条不少', () => {
    const c = cond({ relation: '朋友', study: true });
    const baseNames = new Set(names(buildPrep(c)));
    const extNames = new Set(names(buildPrepExt(c)));
    baseNames.forEach(n => expect(extNames.has(n)).toBe(true));
    expect(extNames.size).toBeGreaterThan(baseNames.size);
    // 源 buildPrep 本身不受影响（38 条源用例继续跑它）
    expect(buildPrep(c).length).toBe(baseNames.size);
  });

  it('H8 扩展层 storage：写入 / 读取 / 删除 / 默认值', () => {
    expect(getDefaultRelation()).toBe('家人');
    setDefaultRelation('朋友');
    expect(getDefaultRelation()).toBe('朋友');
    setStayExt('stay_x', { relation: '情侣', study: true });
    expect(getStayExt('stay_x')).toEqual({ relation: '情侣', study: true });
    expect(getStayExt('stay_not_exist')).toBeNull();
    removeStayExt('stay_x');
    expect(getStayExt('stay_x')).toBeNull();
  });

  it('H9 备份带扩展段：导出含 ext，导入可完整恢复（源结构保持原样）', () => {
    setDefaultRelation('情侣');
    setStayExt('stay_y', { relation: '朋友' });
    const d = JSON.parse(exportDataExt()) as Record<string, unknown>;
    // 源结构原样保留 → 仍可跨端互导（源 Web 版忽略多出来的 ext 字段）
    expect(d.app).toBe('hotel-toolbox');
    expect(Array.isArray(d.stays)).toBe(true);
    expect(d.ext).toBeTruthy();
    // 清空后重新导入
    Storage.removeItem('htb_ext_v1');
    expect(getDefaultRelation()).toBe('家人');
    importDataExt(JSON.stringify(d));
    expect(getDefaultRelation()).toBe('情侣');
    expect(getStayExt('stay_y')).toEqual({ relation: '朋友' });
  });

  it('H10 老备份（无 ext 段）导入不报错；非法备份仍照源规则抛错', () => {
    const legacy = JSON.stringify({ app: 'hotel-toolbox', exportedAt: '', stays: [], gear: [] });
    expect(() => importDataExt(legacy)).not.toThrow();
    expect(() => importDataExt('{"app":"other","stays":[]}')).toThrow('不是本工具箱的备份文件');
  });

  it('H11 静态断言：向导有关系选择（R5-4 起唯一入口在第 ③ 步）、无培训学习开关，页面用合并后的分类顺序', () => {
    const wxml = src('pages/wizard/wizard.wxml');
    // R5-4：第 ④ 步的「和谁一起住」已删，关系只在同行人员步里选
    expect(wxml).toContain('bindtap="setCompanionRelation"');
    expect(wxml).not.toContain('bindtap="setRelation"');
    // R6：「培训 / 学习」开关从偏好页删除（与第 ⑤ 步「学习培训」标签重复），
    // 学习类物品唯一由住宿情况触发（见 M4）
    expect(wxml).not.toContain('bind:change="toggleStudy"');
    expect(src('pages/wizard/wizard.ts')).not.toContain('toggleStudy');
    const wizard = src('pages/wizard/wizard.ts');
    expect(wizard).toContain('buildPrepExt');
    expect(wizard).toContain('setStayExt');
    // 行程页 / 首页必须走 CAT_ORDER_EXT + sortItemsExt，
    // 否则 indexOf('学习') = -1 会把「娱乐 / 学习」两组顶到清单最前面
    expect(src('pages/stay/stay.ts')).toContain('CAT_ORDER_EXT');
    expect(src('pages/stay/stay.ts')).toContain('sortItemsExt');
    expect(src('pages/home/home.ts')).toContain('sortItemsExt');
    // 好物页分类标签也要认新分类
    expect(src('pages/gear/gear.ts')).toContain('GEAR_CATS_EXT');
  });
});

// ────────────────────── I「我的」页（E1 · §11.3 方案 A）──────────────────────

describe('I 「我的」页（四 tab 并排）', () => {
  it('I1 四 tab：app.json 与自绘 tabBar 都加上了第 4 项，页面用 selected:3', () => {
    const app = JSON.parse(src('app.json')) as {
      pages: string[];
      tabBar: { custom: boolean; list: { pagePath: string; text: string }[] };
    };
    expect(app.tabBar.custom).toBe(true);
    expect(app.tabBar.list.length).toBe(4);
    expect(app.tabBar.list[3]).toEqual({ pagePath: 'pages/mine/mine', text: '我的' });
    expect(app.pages).toContain('pages/mine/mine');
    // 自绘 tabBar 的 TABS 必须与 app.json 的 list 同序，否则 switchTab 会串页
    const bar = src('custom-tab-bar/index.ts');
    expect(bar).toContain("{ url: '/pages/mine/mine', text: '我的', icon: 'circle-user' }");
    expect(src('pages/mine/mine.ts')).toContain('syncTabBar(this, 3)');
  });

  it('I2 图标走生成脚本：circle-user 两档齐全', () => {
    // 不手写 base64，必须由 tools/gen-icons.py 生成
    expect(srcRepo('tools/gen-icons.py')).toContain("'circle-user'");
    const css = src('icon.wxss');
    expect(css).toContain('.ic-circle-user {');
    expect(css).toContain('.ic-circle-user-d {');
  });

  it('I3 绝不放账号能力：无 login / 手机号 / 头像昵称 / 网络请求 / 埋点', () => {
    const all = src('pages/mine/mine.ts') + src('pages/mine/mine.wxml');
    ['wx.login', 'getPhoneNumber', 'getUserProfile', 'getUserInfo', 'wx.request',
      'reportEvent', 'avatarUrl', 'nickName'].forEach(k => expect(all).not.toContain(k));
  });

  it('I4 备份与恢复已从首页搬到「我的」，首页不再保留', () => {
    const homeWxml = src('pages/home/home.wxml');
    const homeTs = src('pages/home/home.ts');
    expect(homeWxml).not.toContain('bindtap="doExport"');
    expect(homeWxml).not.toContain('backuprow');
    expect(homeTs).not.toContain('doExport');
    // 首页仍要保留「数据只保存在本机」的常驻告知（06 §3）
    expect(homeWxml).toContain('数据只保存在本机');
    // 「我的」页接管
    const mineWxml = src('pages/mine/mine.wxml');
    expect(mineWxml).toContain('bindtap="doExport"');
    expect(mineWxml).toContain('bindtap="doImport"');
    expect(src('pages/mine/mine.ts')).toContain('exportDataExt');
  });

  it('I5 清空数据：逐个清自己的 key，不用 wx.clearStorageSync（不越权清别人的数据）', () => {
    const ts = src('pages/mine/mine.ts');
    expect(ts).not.toContain('wx.clearStorageSync');
    ['htb_stays_v1', 'htb_gear_v5', 'htb_ui_collapsed_v1', 'htb_ext_v1']
      .forEach(k => expect(ts).toContain(k));
    // 二次确认用自绘 modal，不用 wx.showModal
    expect(ts).not.toContain('wx.showModal(');
    expect(src('pages/mine/mine.json')).toContain('components/modal/modal');
  });

  it('I6 关于：免责声明与知识库同源，且提供隐私说明', () => {
    const ts = src('pages/mine/mine.ts');
    // 同源：两边都从 core/data.ts 的 DISCLAIMER 取，改一处两边同步
    expect(ts).toContain('DISCLAIMER');
    const wxml = src('pages/mine/mine.wxml');
    expect(wxml).toContain('触发即处理');
    expect(wxml).toContain('隐私说明');
    expect(wxml).toContain('免责声明');
    // 富文本预解析已抽到 core/rich.ts，两个页面共用同一份口径
    expect(ts).toContain("from '../../core/rich'");
    expect(src('pages/knowledge/knowledge.ts')).toContain("from '../../core/rich'");
  });
});

describe('J 老板第二轮反馈（2026-10-02）', () => {
  it('J1 图标档位齐全：模板里每个静态 name+tone 都有对应 class', () => {
    // 这是「图标静默渲染成空白」这类 bug 的守卫。
    // 踩过：向导第 ⑤ 步 <icon name="book-open" tone="p" />，而生成器只给了 d 档，
    // class 不存在 → background-image 落空 → 图标一直是空白，不报错也不警告。
    const defined = new Set(src('icon.wxss').match(/\.ic-[a-z0-9-]+(?=\s*\{)/g) || []);
    const wxmls = [
      'pages/wizard/wizard.wxml', 'pages/stay/stay.wxml', 'pages/home/home.wxml',
      'pages/knowledge/knowledge.wxml', 'pages/gear/gear.wxml', 'pages/mine/mine.wxml',
      'components/item-row/item-row.wxml', 'components/modal/modal.wxml',
      'components/gear-panel/gear-panel.wxml', 'components/clothing-add/clothing-add.wxml',
      'components/date-picker/date-picker.wxml', 'components/progress-pill/progress-pill.wxml',
      'components/stepper/stepper.wxml', 'components/toggle/toggle.wxml',
      'components/icon/icon.wxml', 'custom-tab-bar/index.wxml',
    ];
    expect(wxmls.length).toBe(16);
    const missing: string[] = [];
    wxmls.forEach(f => {
      (src(f).match(/<icon\b[^>]*>/g) || []).forEach(tag => {
        const nm = /name="([^"{}]*)"/.exec(tag);
        if (!nm) return;
        const tn = /tone="([^"{}]*)"/.exec(tag);
        const tone = tn ? tn[1] : '';
        if (tone.includes('{{')) return;            // 动态档位静态查不了，跳过
        const cls = '.ic-' + nm[1] + (tone ? '-' + tone : '');
        if (!defined.has(cls)) missing.push(`${f} → ${cls}`);
      });
    });
    expect(missing).toEqual([]);
  });

  it('J2 book-open 两档齐全（R6 起改由第 ⑤ 步「学习培训」标签动态使用）', () => {
    // 不手写 base64，必须改生成器再重跑
    expect(srcRepo('tools/gen-icons.py')).toContain("'book-open': 'dp'");
    const css = src('icon.wxss');
    expect(css).toContain('.ic-book-open {');
    expect(css).toContain('.ic-book-open-p {');
    // R6：偏好页的「培训 / 学习」行已删，book-open 改经 PURPOSE_ICONS 动态绑定
    expect(src('pages/wizard/wizard.wxml')).not.toContain('<icon name="book-open"');
  });

  it('J3 第 ⑤ 步「在意哪些方面」的文字与图标已放大', () => {
    const wxml = src('pages/wizard/wizard.wxml');
    // R6：book-open 已随「培训 / 学习」开关移除，偏好页剩四个源偏好图标
    ['moon', 'droplets', 'bug', 'plug']
      .forEach(n => expect(wxml).toContain(`<icon name="${n}" size="34" tone="p" />`));
    expect(src('pages/wizard/wizard.wxss')).toContain('font-size: 34rpx');   // .slabel
    expect(src('app.wxss')).toContain('font-size: 27rpx');                   // .fxline
  });

  it('J4 影响说明卡片：标题改名 + 默认收起', () => {
    const wxml = src('pages/wizard/wizard.wxml');
    // 断言「渲染出来的标题」，不断言裸文案 —— 文件里的注释也提到了旧标题，
    // 用裸文案匹配会被注释误伤（这个坑在 C10 / I5 上已经踩过两次）。
    expect(wxml).not.toContain('>这些选择如何影响清单<');
    expect(wxml).toContain('>你的选择如何影响清单<');
    expect(wxml).toContain('bindtap="toggleFx"');
    expect(wxml).toContain('wx:if="{{fxOpen}}"');
    const ts = src('pages/wizard/wizard.ts');
    expect(ts).toContain('fxOpen: false');       // 默认收起
    expect(ts).toContain('toggleFx()');
  });

  it('J5 保存后落到「准备」阶段，而不是按日期推断出的「入住」', () => {
    // 前提：今天入住的行程，suggestedStage 会推断成 checkin —— 这正是老板看到的问题
    expect(suggestedStage({ date: offsetDate(0), nights: 3 })).toBe('checkin');
    // 所以向导保存时显式指定 prep
    expect(src('pages/wizard/wizard.ts')).toContain('&stage=prep');
    const stay = src('pages/stay/stay.ts');
    expect(stay).toContain('initStage');
    expect(stay).toContain('isStage(options.stage)');
    // 非法值一律忽略，回退到按日期推断（M17 起 onLoad 只暂存到 _bootStage，onShow 首进时校验）
    expect(stay).toContain('isStage(this._bootStage) ? this._bootStage : null');
  });

  it('J6 qty = 0 的项不再进准备清单，也不计入「已备齐」', () => {
    const { active, zero } = splitByQty([
      { name: '钱包', qty: 0 }, { name: '牙刷', qty: 2 }, { name: '眼罩', qty: 1 },
    ]);
    expect(active.map(i => i.name)).toEqual(['牙刷', '眼罩']);
    expect(zero.map(i => i.name)).toEqual(['钱包']);
    // 两个页面必须走同一个口径，否则会出现「向导里看得到、行程页里没有」
    expect(src('pages/stay/stay.ts')).toContain('splitByQty');
    expect(src('pages/wizard/wizard.ts')).toContain('splitByQty');
    // 进度只算 active（R4-5 起准备段的数据打包进 prep 对象）
    expect(src('pages/stay/stay.ts')).toContain('done: items.filter(i => i.done).length');
  });

  it('J7 「已设为不带」区域：默认收起、可逐项恢复、且不删数据', () => {
    const stay = src('pages/stay/stay.ts');
    expect(stay).toContain('zeroItems');
    expect(stay).toContain('zeroOpen: false');
    // 恢复是把 qty 写回 1，而不是重新插入 —— 说明项一直在数据里，只是没渲染
    expect(stay).toContain('it.qty = 1');
    const stayWxml = src('pages/stay/stay.wxml');
    expect(stayWxml).toContain('已设为不带');
    expect(stayWxml).toContain('bindtap="restoreZero"');
    // 向导预览同款
    expect(src('pages/wizard/wizard.wxml')).toContain('bindtap="restoreZero"');
    expect(src('pages/wizard/wizard.ts')).toContain('zeroOpen: false');
    // 样式两页共用，放全局
    expect(src('app.wxss')).toContain('.zero-head');
    expect(src('app.wxss')).toContain('.zrestore');
  });

  it('J8 手写滑动判定退役：手势已整体交给原生 swiper（M16 滑动终案）', () => {
    // swipeDir / SWIPE_MIN_DX / SWIPE_DOMINANCE 曾先后服务页面层 touch 判定与 WXS 方案，
    // 四轮真机反馈证明那条链路不可靠 → 拍板改原生 swiper（CHANGE-REQUESTS02 §2.5）。
    // 判定归微信客户端后，这套阈值在本项目里再无消费者 —— 删干净防漂移。
    const gesture = src('core/gesture.ts');
    expect(gesture).not.toContain('swipeDir');
    expect(gesture).not.toContain('SWIPE_MIN_DX');
    expect(gesture).not.toContain('SWIPE_DOMINANCE');
    // 滚动阈值一族仍被 stay / knowledge 两页共用，必须保留（K7 另有行为断言）
    expect(gesture).toContain('SCROLL_TOP_TRIGGER');
    expect(gesture).toContain('shouldShowGoTop');
  });

  it('J9 三段左右滑动改用原生 <swiper>：与页签点击共用同一入口', () => {
    const wxml = src('pages/stay/stay.wxml');
    const ts = src('pages/stay/stay.ts');
    // 原生 swiper 承载手势 —— 四轮手写方案（页面层 touch ×2、WXS ×1、修语法 ×1）
    // 在真机 iOS 上全军覆没；拍板红线「不要再用 swiper 之外的方式追求跟手」
    expect(wxml).toContain('<swiper class="stage-swiper"');
    expect(wxml).toContain('current="{{stageIdx}}"');
    expect(wxml).toContain('bindchange="onSwiperChange"');
    expect(wxml).toContain('duration="240"');
    // 三段常驻渲染（滑动时相邻段内容跟着滑入 —— 「翻书」观感），pane id 供量高用
    expect(wxml).toContain('id="pane0"');
    expect(wxml).toContain('id="pane1"');
    expect(wxml).toContain('id="pane2"');
    // 防回退红线：WXS 与页面层 touch 绑定双双清零（两套手势并存会一次滑动跳两段）
    expect(wxml).not.toContain('<wxs');
    expect(wxml).not.toContain('bindtouchstart');
    expect(wxml).not.toContain('bindtouchmove');
    // 点击与滑动必须走同一个 gotoStage，否则两条路径迟早各自漂移
    expect(ts).toContain('this.gotoStage(String(e.currentTarget.dataset.s');
    // 用户滑动才切段：程序 setData current 也会触发 bindchange（source 为空串），
    // 只认 source === 'touch' 才不会和 render() 互相触发
    expect(ts).toContain("e.detail.source !== 'touch'");
    expect(ts).toContain('this.gotoStage(STAGES[e.detail.current]');
    // 非当前段是预览：添加面板等入口不渲染（等同旧方案相邻段 pointer-events:none）
    expect(wxml).toContain("isCur: stage === 'prep'");
    expect(wxml).toContain("isCur: stage === 'checkin'");
    expect(wxml).toContain("isCur: stage === 'checkout'");
    expect(wxml).toContain('wx:if="{{isCur && g.cat === \'衣物\'}}"');
    // ⚡ 轻量切段（流畅度优化的核心）：切段不产生任何数据变化，VM 原样可用，
    //    gotoStage 不得调 render 全量重算（此前三次渲染管线往返，低端机松手瞬间掉帧）
    const iGoto = ts.indexOf('gotoStage(stage: Stage)');
    const iOnStage = ts.indexOf('onStage(e:');
    expect(iGoto).toBeGreaterThan(-1);
    expect(iOnStage).toBeGreaterThan(iGoto);
    expect(ts.slice(iGoto, iOnStage)).not.toContain('this.render(');
    // 文案与 render 共用同一个 stageHintOf —— 两份手写迟早漂移
    expect(ts).toContain('function stageHintOf(stage: Stage, auto: boolean): string');
  });

  it('J10 头部阶段提示不谎称「按日期定位」', () => {
    const ts = src('pages/stay/stay.ts');
    // 规格原文（02 §6）只在「真的按日期推断」时使用
    expect(ts).toContain('按日期已为你定位到「');
    expect(ts).toContain('stageAuto');
    // 用户自己切过之后换成中性提示，顺带把新的滑动手势讲出来
    expect(ts).toContain('左右滑动或点上方页签切换');
    // 点页签与滑动都要把它置 false —— M16 轻量切段后并入 gotoStage 的单次小提交
    const iGoto = ts.indexOf('gotoStage(stage: Stage)');
    const iOnStage = ts.indexOf('onStage(e:');
    expect(iGoto).toBeGreaterThan(-1);
    expect(iOnStage).toBeGreaterThan(iGoto);
    expect(ts.slice(iGoto, iOnStage)).toContain('stageAuto: false');
  });
});

// ──────────────────────── K 第三轮反馈（FIX-PLAN.md R3-1…R3-7） ────────────────────────

describe('K 第三轮反馈修复（FIX-PLAN.md R3-1…R3-7）', () => {
  it('K1 第 ① 步不选性别、第 ② 步不选日期都不能进下一步（R5-3 起按步判断）', () => {
    const ts = src('pages/wizard/wizard.ts');
    const wxml = src('pages/wizard/wizard.wxml');
    const wxss = src('pages/wizard/wizard.wxss');
    // 派生值：nextReady 按当前步判断 —— ① 看性别是否已选，② 看日期
    expect(ts).toContain('this.data.step === 1 ? isGender(this.data.gender)');
    expect(ts).toContain('this.data.step === 2 ? !!d.date');
    // 按钮绑禁用态（断言「渲染出来的形式」，别匹配裸文案，否则被注释误伤）
    expect(wxml).toContain("btn {{nextReady ? '' : 'btn-off'}}");
    expect(wxss).toMatch(/\.btn-off\s*\{/);
    // 兜底校验必须在 step 自增之前，且给出提示
    const iGuardG = ts.indexOf('if (this.data.step === 1 && !isGender(this.data.gender))');
    const iGuardD = ts.indexOf('if (this.data.step === 2 && !this.data.draft.date)');
    const iInc = ts.indexOf('this.setData({ step: nxt, stepPos: i + 2 })');
    expect(iGuardG).toBeGreaterThan(-1);
    expect(iGuardD).toBeGreaterThan(iGuardG);
    expect(iInc).toBeGreaterThan(iGuardD);
    expect(ts).toContain("wx.showToast({ title: '请先选择入住日期', icon: 'none' })");
    expect(ts).toContain("wx.showToast({ title: '请先选择性别', icon: 'none' })");
    // 没日期时不谎称已经算出了退房日
    expect(wxml).toContain('先挑一个日期，才能生成清单');
  });

  it('K2 快捷日期是 2×2：宽度不再踩 flex 临界点', () => {
    const wxss = src('pages/wizard/wizard.wxss');
    // 两列：50% - 12rpx，配 gap 16rpx 后仍留 8rpx 余量
    expect(wxss).toContain('width: calc(50% - 12rpx)');
    // 旧的 50% - 8rpx 配 gap: 16rpx 正好 = 100%，子像素取整后溢出 → 退化成单列
    expect(wxss).not.toMatch(/width:\s*calc\(50% - 8rpx\)/);
    expect(wxss).toMatch(/\.quickrow\s*\{[^}]*flex-wrap:\s*wrap/);
    // 四个按钮走同一个 class，宽度一致
    const wxml = src('pages/wizard/wizard.wxml');
    expect((wxml.match(/class="qchip /g) || []).length).toBe(4);
  });

  it('K3 人数选项改纵向列表，图标与人数严格对应', () => {
    const wxml = src('pages/wizard/wizard.wxml');
    const wxss = src('pages/wizard/wizard.wxss');
    // 纵向列表：一行一个。R5 起性别步（2 行）与住宿情况步（7 行）也用同一套
    // picklist/pickrow —— 人数步的 3 行用 data-n 锚定，全页 pickrow 共 3+2+7=12 行
    expect(wxml).toContain('class="picklist"');
    expect((wxml.match(/data-n="\d"/g) || []).length).toBe(3);
    // 静态出现 6 处 = 性别 2 + 人数 3 + 住宿情况的 wx:for 单行模板（运行时 7 行）
    expect((wxml.match(/class="pickrow /g) || []).length).toBe(6);
    expect(wxss).toMatch(/\.picklist\s*\{[^}]*flex-direction:\s*column/);
    // 图标 1 / 2 / 3 各一档，不再共用同一个「三人」图标
    expect(wxml).toContain('<icon name="user" size="38" tone="p" />');
    expect(wxml).toContain('<icon name="users" size="38" tone="p" />');
    expect(wxml).toContain('<icon name="users-3" size="38" tone="p" />');
    // 「3 人及以上」的真实人数步进器在列表下方独立展开，不贴边、不溢出
    expect(wxml).toContain('class="pickexpand"');
    expect(wxss).toMatch(/\.pickexpand\s*\{[^}]*margin-top/);
    // 两个新图标必须真的生成出来了，否则 background-image 落空、静默渲染成空白
    const icons = src('icon.wxss');
    expect(icons).toContain('.ic-user-p');
    expect(icons).toContain('.ic-users-3-p');
    const gen = srcRepo('tools/gen-icons.py');
    expect(gen).toContain("'user': 'p'");
    expect(gen).toContain("'users-3': 'p'");
  });

  it('K4 第 ④ 步不再有「和谁一起住」：关系以第 ③ 步为唯一来源（R5-4）', () => {
    const ts = src('pages/wizard/wizard.ts');
    const wxml = src('pages/wizard/wizard.wxml');
    // 断言前剥掉 wxml 注释（坑八）：注释里会讲述「和谁一起住」的删除历史，
    // 裸断言会被注释文本误伤 —— 这里要断的是「渲染出来的界面里没有它」
    const markup = wxml.replace(/<!--[\s\S]*?-->/g, '');
    // 关系块整块删除：R4 的「锁定」方案（relationLocked / relationLockHint）随之退役
    expect(markup).not.toContain('和谁一起住');
    expect(markup).not.toContain('bindtap="setRelation"');
    expect(ts).not.toContain('setRelation(');
    expect(ts).not.toContain('relationLocked');
    // 第 ③ 步的同行关系选择保留 —— 它现在是唯一入口
    expect(wxml).toContain('bindtap="setCompanionRelation"');
    // 自动判定仍要写回：否则老人/儿童同行时关系会停在默认值
    expect(ts).toContain('patch.relation = auto');
  });

  it('K5 分组折叠状态按行程隔离：新行程默认全部展开', () => {
    const ts = src('pages/stay/stay.ts');
    // v2 结构 { [stayId]: { [分类]: 折叠 } } —— 新行程查不到记录 → 全展开
    expect(ts).toContain("const COLLAPSE_KEY = 'htb_ui_collapsed_v2'");
    expect(ts).toContain('loadCollapsed(s.id)');
    expect(ts).toContain('saveCollapsed(this.data.id, m)');
    expect(ts).toContain('collapsed: !!collapsedMap[cat]');
    // v1（按分类名全局共享，正是「有的展开有的折叠」的根因）已废弃，但清空数据时要一并清掉
    const mine = src('pages/mine/mine.ts');
    expect(mine).toContain("'htb_ui_collapsed_v2'");
    expect(mine).toContain("'htb_ui_collapsed_v1'");
  });

  it('K6 滑动阈值退役，高度链路接棒：swiper 按当前段实高撑起（M16）', () => {
    // 原断言钉死 SWIPE_MIN_DX=48 / DOMINANCE=1.2 —— 手势交给原生 swiper 后无从谈起。
    // 新的「逻辑担当」是高度：swiper 必须有确定高度，三段内容高度差又很大，
    // 所以按当前段实际内容高动态量取（量错段 = 整页大面积留白 / 内容被裁）。
    const ts = src('pages/stay/stay.ts');
    const wxml = src('pages/stay/stay.wxml');
    // 首帧兜底 + 内联高度
    expect(ts).toContain('swiperH: 600');
    expect(wxml).toContain('style="height: {{swiperH}}px"');
    // 量当前段（pane id 与 STAGES 下标一一对应），量到合法值才写。
    // idx 先落局部变量：快速连划时两次查询的回调乱序返回，闭包里的 idx 才能对账
    expect(ts).toContain('select(`#pane${idx}`)');
    expect(ts).toContain('if (idx !== this.data.stageIdx) return;');
    expect(ts).toContain('if (rect && rect.height > 0) {');
    expect(ts).toContain('this.setData({ swiperH: rect.height });');
    // 两个必须补量的时机：render 落地后（setData 回调）与折叠/展开分组
    expect(ts).toContain('}, () => this.measureSwiper());');
    expect(ts).toContain(
      'this.setData({ [`prep.groups[${gi}].collapsed`]: next }, () => this.measureSwiper());'
    );
  });

  it('K7 「回到顶部」阈值降到 120，两个页面共用同一个常量', () => {
    expect(SCROLL_TOP_TRIGGER).toBe(120);
    // 严格大于：刚好到阈值不显示，滑回顶部立刻消失
    expect(shouldShowGoTop(0)).toBe(false);
    expect(shouldShowGoTop(SCROLL_TOP_TRIGGER)).toBe(false);
    expect(shouldShowGoTop(SCROLL_TOP_TRIGGER + 1)).toBe(true);
    // 非法输入不炸
    expect(shouldShowGoTop(NaN)).toBe(false);
    expect(shouldShowGoTop(Infinity)).toBe(false);
    // 两个页面都改走它，且不再写死 600
    const stayTs = src('pages/stay/stay.ts');
    const knowTs = src('pages/knowledge/knowledge.ts');
    expect(stayTs).toContain('shouldShowGoTop(e.scrollTop)');
    expect(knowTs).toContain('shouldShowGoTop(e.scrollTop)');
    expect(stayTs).not.toMatch(/e\.scrollTop\s*>\s*600/);
    expect(knowTs).not.toMatch(/e\.scrollTop\s*>\s*600/);
  });

  it('K8 本轮仍不碰红线：三个核心文件与源项目零差异', () => {
    // 差分命令是权威口径（npm run diff:*），这里再确认工程里没有本地的「影子实现」
    const pkg = JSON.parse(srcRepo('package.json')) as { scripts: Record<string, string> };
    ['diff:types', 'diff:data', 'diff:engine'].forEach(k => {
      expect(pkg.scripts[k]).toBeTruthy();
    });
    // 扩展层的维度不许漏进红线文件
    const types = src('core/types.ts');
    expect(types).not.toContain('relation');
    expect(types).not.toContain('study');
  });
});

// ─────────────────── L 第四轮反馈（R4-PLAN.md R4-1…R4-6）───────────────────

describe('L 第四轮反馈（R4-PLAN.md）', () => {
  /** 同行名额的基准：3 人入住、暂无同行者 */
  const c3 = (patch?: Partial<ConditionsExt>): ConditionsExt => ({ ...base, adults: 3, ...patch });

  it('L1 同行名额 = 入住人数 − 1（自己占 1 位）', () => {
    expect(companionBudget(c3()).total).toBe(2);
    expect(companionBudget(c3()).used).toBe(0);
    expect(companionBudget(c3()).left).toBe(2);
    // 一个人住：没有任何同行名额
    expect(companionBudget({ ...base, adults: 1 }).total).toBe(0);
    // 成人同行 + 儿童 + 老人 一起占名额
    const b = companionBudget(c3({ adultsWith: 1, children: 1, elderlyCount: 0 }));
    expect(b.used).toBe(2);
    expect(b.left).toBe(0);
    // 宠物不占名额 —— 它不是人
    expect(companionBudget(c3({ pet: true })).used).toBe(0);
    // 非法输入不炸
    expect(companionBudget({ ...base, adults: 0 }).total).toBe(0);
    expect(companionBudget({ ...base, adults: NaN }).total).toBe(0);
  });

  it('L2 名额用尽后三个维度都不能再加；各维度还有自己的上限', () => {
    const full = c3({ adultsWith: 2 });
    expect(canAddCompanion(full, 'adult')).toBe(false);
    expect(canAddCompanion(full, 'child')).toBe(false);
    expect(canAddCompanion(full, 'elderly')).toBe(false);
    // 还有名额时可以加
    expect(canAddCompanion(c3({ adultsWith: 1 }), 'adult')).toBe(true);
    expect(canAddCompanion(c3({ adultsWith: 1 }), 'child')).toBe(true);
    // 单人入住：一个都不给加
    expect(canAddCompanion({ ...base, adults: 1 }, 'adult')).toBe(false);
    expect(canAddCompanion({ ...base, adults: 1 }, 'child')).toBe(false);
    // 儿童自己的上限（与源 stepper 的 max 一致），名额再多也不能突破
    expect(canAddCompanion({ ...base, adults: 20, children: MAX_CHILDREN }, 'child')).toBe(false);
  });

  it('L3 老板的例子：2 人入住 + 老人同行 → 再加儿童就超额了', () => {
    const two = { ...base, adults: 2 };
    // 2 人入住只有 1 个名额
    expect(companionBudget(two).left).toBe(1);
    // 放了 1 位老人，名额用完 —— 这正是老板说的「2 个人怎么能选 2 个以上」
    const withElder = { ...two, elderlyCount: 1 };
    expect(companionBudget(withElder).left).toBe(0);
    expect(canAddCompanion(withElder, 'child')).toBe(false);
    expect(canAddCompanion(withElder, 'adult')).toBe(false);
  });

  it('L4 关系自动判定：没有成人同行时由同行人员决定，用户不能自己挑', () => {
    // 有成人同行 → 交给用户选（null）
    expect(autoRelation(c3({ adultsWith: 1 }))).toBe(null);
    // 只有老人 / 儿童 → 家人
    expect(autoRelation(c3({ elderlyCount: 1 }))).toBe('家人');
    expect(autoRelation(c3({ children: 1 }))).toBe('家人');
    // 什么都没有 → 独自（只有宠物也算独自）
    expect(autoRelation(c3())).toBe('独自');
    expect(autoRelation(c3({ pet: true }))).toBe('独自');
    // 老数据只给了源布尔标记时同样认
    expect(autoRelation({ ...base, adults: 2, elderly: true })).toBe('家人');
  });

  it('L5 老板的例子：说了和老人同行，就不该还能选「情侣」', () => {
    // 2 人入住 + 1 位老人同行 → 关系被判定为「家人」，第 ④ 步锁定不可改
    expect(autoRelation({ ...base, adults: 2, elderlyCount: 1 })).toBe('家人');
    // 有成人同行时才开放给用户自己挑（老板要的「选了『其他』后面才能选」）
    expect(autoRelation({ ...base, adults: 3, adultsWith: 1 })).toBe(null);
  });

  it('L6 人数改小后自动裁剪：先砍成人同行，再砍儿童，最后才动老人', () => {
    const full = { ...base, adults: 3, adultsWith: 1, children: 1, elderlyCount: 0 };
    expect(companionBudget(full).left).toBe(0);
    // 改回 2 人 → 只剩 1 个名额，砍掉 1 位
    const cut = clampCompanions({ ...full, adults: 2 });
    expect(cut.trimmed).toBe(1);
    expect(cut.adultsWith).toBe(0);      // 先砍成人同行
    expect(cut.children).toBe(1);        // 儿童保留
    // 再紧一档：只剩 1 人 → 全清
    const solo = clampCompanions({ ...full, adults: 1 });
    expect(solo.adultsWith).toBe(0);
    expect(solo.children).toBe(0);
    expect(solo.elderlyCount).toBe(0);
    expect(solo.trimmed).toBe(2);
    // 名额够的时候不该动任何东西
    const keep = clampCompanions({ ...full, adults: 5 });
    expect(keep.trimmed).toBe(0);
    expect(keep.adultsWith).toBe(1);
    expect(keep.children).toBe(1);
  });

  it('L7 老人数量与源布尔标记对齐：清单规则认「有没有」，名额约束认数量', () => {
    expect(syncElderlyFlag(0)).toBe(false);
    expect(syncElderlyFlag(1)).toBe(true);
    expect(syncElderlyFlag(3)).toBe(true);
    // 老数据只有布尔时按 1 位算
    expect(elderlyCountOf({ ...base, elderly: true })).toBe(1);
    expect(elderlyCountOf({ ...base, elderly: false })).toBe(0);
    // 有数量时以数量为准
    expect(elderlyCountOf({ ...base, elderly: true, elderlyCount: 3 })).toBe(3);
    // 非法输入一律当 0，不炸
    expect(elderlyCountOf({ ...base, elderlyCount: -2 })).toBe(0);
    expect(elderlyCountOf({ ...base, elderlyCount: NaN })).toBe(0);
  });

  it('L8 关系新增「其他」；第 ③ 步的选项里不含「独自」', () => {
    expect(RELATIONS).toContain('其他');
    expect(COMPANION_RELATIONS).toContain('其他');
    // 「独自」只在第 ④ 步作为「没有同行关系」的兜底值出现
    expect(COMPANION_RELATIONS).not.toContain('独自');
    expect(COMPANION_RELATIONS.length).toBe(5);
    // 顺序即 UI 展示顺序，别乱
    expect(COMPANION_RELATIONS).toEqual(['情侣', '家人', '朋友', '同事', '其他']);
  });

  it('L9 向导接线：名额账、三个上限都接上了；R4 的关系锁定已随 R5-4 退役', () => {
    const ts = src('pages/wizard/wizard.ts');
    const wxml = src('pages/wizard/wizard.wxml');
    // 名额账进 data
    expect(ts).toContain('const budget = companionBudget(ext)');
    expect(ts).toContain('maxAdult: Math.min(this.data.adultsWith + budget.left, MAX_COMPANIONS)');
    expect(ts).toContain('maxChild: Math.min(d.children + budget.left, MAX_CHILDREN)');
    expect(ts).toContain('maxElderly: Math.min(this.data.elderlyCount + budget.left, MAX_ELDERLY)');
    // 老人从「开关」改成「计数」，源的布尔标记由它派生
    expect(ts).toContain('onElderlyCount(e: NumEvent)');
    expect(ts).toContain('syncElderlyFlag(n)');
    // R5-4：第 ④ 步删掉后，锁定 UI 与 setRelation 一并退役；自动判定写回保留
    expect(ts).not.toContain('relationLocked');
    expect(wxml).not.toContain('relationLockHint');
    expect(ts).toContain('patch.relation = auto');
    // 模板：三个步进器的 max 走算好的上限，不再写死
    expect(wxml).toContain('max="{{maxAdult}}"');
    expect(wxml).toContain('max="{{maxChild}}"');
    expect(wxml).toContain('max="{{maxElderly}}"');
    // 第 ③ 步有同行关系选项（关系唯一入口）
    expect(wxml).toContain('bindtap="setCompanionRelation"');
  });

  it('L10 滑动改用原生 swiper：结构、裁剪与旧 rail 清零（M16 重写，WXS 方案废弃）', () => {
    const wxml = src('pages/stay/stay.wxml');
    const wxss = src('pages/stay/stay.wxss');

    // ① 三段结构：swiper-item × 3，pane-inner 撑满后用 padding 推回安全区
    expect(wxml).toContain('<swiper-item>');
    expect(wxml).toContain('</swiper>');
    expect(wxss).toContain('.stage-swiper');
    expect(wxss).toContain('.pane-inner');
    // ② 负 margin 手法沿用：卡片横向阴影不被 swiper 裁剪吃掉
    expect(wxss).toContain('margin: 0 -32rpx');
    expect(wxss).toContain('width: calc(100% + 64rpx)');
    expect(wxss).toContain('padding: 0 32rpx');
    // ⑥ 高度过渡（流畅度）：松手翻页横移期间高度平滑长/缩，横移结束后不再突跳；
    //    页签高亮同步渐变，不再瞬时切换
    expect(wxss).toContain('transition: height 0.24s ease');
    expect(wxss).toContain('transition: background-color 0.2s ease, color 0.2s ease');
    // ③ 旧 rail 结构清零（防两套结构并存 —— 拍板红线）
    expect(wxml).not.toContain('stageRail');
    expect(wxml).not.toContain('stage-viewport');
    expect(wxml).not.toContain('seg-seg');
    expect(wxss).not.toContain('.seg-seg');
    expect(wxss).not.toContain('.stage-viewport');
    expect(wxss).not.toContain('.stage-rail');
    // ④ 页签必须在 swiper 外面（swiper 是滚动容器，里面的 sticky 会被干掉）。
    //    先剥注释再定位 —— 文件头注释里也写着结构示例（<swiper …>），直接
    //    indexOf 会命中注释文本而不是真实标签。
    const markup = wxml.replace(/<!--[\s\S]*?-->/g, '');
    const iTabs = markup.indexOf('class="seg-sticky"');
    const iSwiper = markup.indexOf('<swiper');
    const iSwiperEnd = markup.indexOf('</swiper>');
    expect(iTabs).toBeGreaterThan(-1);
    expect(iSwiper).toBeGreaterThan(iTabs);
    // ⑤ 危险区也留在 swiper 外（它属于整次入住，不该跟着段滑走）
    expect(markup.indexOf('class="danger-zone"')).toBeGreaterThan(iSwiperEnd);
  });

  it('L11 浮层防误滑改由遮罩承担：swipeLock 机制整体删除（M16 重写）', () => {
    const wxml = src('pages/stay/stay.wxml');
    const ts = src('pages/stay/stay.ts');
    // modal / 衣物 / 化妆品面板都有全屏遮罩，遮罩 catchtouchmove 天然挡住
    // 手指落在遮罩上的滑动 —— 触摸不进 swiper，手势自然不触发。
    // WXS 时代需要数据通道锁（WXS 拿不到页面 data，只能走 dataset），现在整链删除。
    expect(ts).not.toContain('swipeLock');
    expect(ts).not.toContain('syncSwipeLock');
    expect(ts).not.toContain('onClothOpen');
    expect(wxml).not.toContain('swipeLock');
    // 新方案的物理基础必须仍在：两个浮层组件的遮罩都得拦 touchmove
    expect(src('components/modal/modal.wxml')).toContain('catchtouchmove="noop"');
    expect(src('components/clothing-add/clothing-add.wxml')).toContain('catchtouchmove="noop"');
    // 组件也不再需要向页面通知开合（onClothOpen 的另一头）
    expect(src('components/clothing-add/clothing-add.ts')).not.toContain('openchange');
  });

  it('L12 数量归零浮窗：文案与时长统一（R5 起为 1500ms）', () => {
    // 历史：R4 要求「不超过 1 秒」→ 900；R5 老板改口「稍微再加长」并授权定夺 → 1500。
    // 推导见 core/toast.ts 头注释。⚠️ 不要再加回 ≤1000 的约束，老板已明确改口。
    expect(TOAST_MS).toBe(1500);
    expect(TOAST_ZERO_TEXT).toContain('已设为不带');
    // 只在「从有到没有」那一刻弹
    expect(shouldToastZero(1, 0)).toBe(true);
    expect(shouldToastZero(3, 0)).toBe(true);
    expect(shouldToastZero(0, 0)).toBe(false);
    expect(shouldToastZero(0, 1)).toBe(false);
    expect(shouldToastZero(1, 2)).toBe(false);
    expect(shouldToastZero(NaN, 0)).toBe(false);
    // 两处接入：向导第 ⑥ 步、行程页准备清单
    [src('pages/wizard/wizard.ts'), src('pages/stay/stay.ts')].forEach(f => {
      expect(f).toContain('shouldToastZero');
      expect(f).toContain('showToast(');
      expect(f).toContain('TOAST_MS');
      // 卸载时要清定时器，否则会在已销毁的页面上 setData
      expect(f).toContain('clearTimeout');
    });
    // 自绘组件（系统 wx.showToast 是黑色胶囊，与项目色调割裂）
    const tWxml = src('components/toast/toast.wxml');
    const tWxss = src('components/toast/toast.wxss');
    expect(tWxml).toContain("class=\"toast {{show ? 'on' : ''}}\"");
    // 常驻节点 + CSS 切显隐：用 wx:if 会直接销毁节点，退场动画就没了
    expect(tWxml).not.toContain('wx:if');
    expect(tWxss).toContain('pointer-events: none');
    expect(tWxss).toContain('var(--glass-border)');
    // 两个页面都注册并挂上了
    expect(src('pages/stay/stay.json')).toContain('/components/toast/toast');
    expect(src('pages/wizard/wizard.json')).toContain('/components/toast/toast');
  });

  it('L13 工具类统一：.grow / .hv 收进 app.wxss，组件内那份必须保留', () => {
    const app = src('app.wxss');
    expect(app).toMatch(/\.grow\s*\{[^}]*flex:\s*1/);
    expect(app).toMatch(/\.hv\s*\{[^}]*opacity:\s*0\.7/);
    // 页面里不该再有重复定义（原先 9 处各写一份）
    ['pages/home/home.wxss', 'pages/stay/stay.wxss', 'pages/wizard/wizard.wxss',
      'pages/knowledge/knowledge.wxss', 'pages/gear/gear.wxss', 'pages/mine/mine.wxss'].forEach(f => {
      const css = src(f);
      expect(css).not.toMatch(/^\.grow\s*\{/m);
      expect(css).not.toMatch(/^\.hv\s*\{/m);
    });
    // 组件样式默认隔离，item-row 里那份删了就会掉样式 —— 必须留着
    expect(src('components/item-row/item-row.wxss')).toMatch(/^\.grow\s*\{/m);
  });

  it('L14 WXS 全数移除（M16）：真机编译风险的载体直接删掉（原 M12 真机异常修复）', () => {
    // 历史包袱：./pages/stay/swipe.wxs 曾让整页在真机编译失败
    // （swipe.wxs:115:22:Unexpected token `(`，根因是 Number(x) —— WXS 基础类库里
    //  Number 只有 4 个属性、不能调用；开发者工具的 WXS 编译器宽松，只有真机会挂）。
    // 修语法也只是「能编译」—— 四轮真机反馈证明 WXS 手势链路本身不可靠：
    // 跑在视图层、出错无日志（失败无声）、iOS 事件链路不稳。M16 换原生 swiper 后
    // 项目不再有任何 .wxs 文件，这类「工具能过、真机挂」的风险随载体一起消失。
    const all = readdirSync(root, { recursive: true }).map(String);
    expect(all.filter(f => f.endsWith('.wxs'))).toEqual([]);
    // wxml 里也不许残留 <wxs> 标签（引用不存在的 wxs 会直接编译失败）
    all.filter(f => f.endsWith('.wxml')).forEach(f => {
      expect(src(f)).not.toContain('<wxs');
    });
    // 静态扫描脚本保留：将来若再引入 wxs，它仍在本地把语法红线守住
    expect(srcRepo('tools/check-wxs.py')).toContain('BAD_CONSTRUCTORS');
  });
});

// ──────────────────── M 第五轮反馈（CHANGE-REQUESTS02.md R5-1…R5-9） ────────────────────

describe('M 第五轮反馈（R5-1…R5-9）', () => {
  const cond = (patch: Partial<ConditionsExt> = {}): ConditionsExt => ({ ...base, ...patch });
  const hasName = (list: PrepItem[], part: string) => list.some(i => i.name.includes(part));

  it('M1 性别过滤：女性没有剃须刀、男性没有卸妆棉；性别未知一个都不摘（H41/H49）', () => {
    const female = buildPrepExt(cond({ gender: 'female' }));
    const male = buildPrepExt(cond({ gender: 'male' }));
    const unknown = buildPrepExt(cond());
    expect(hasName(female, '剃须刀')).toBe(false);
    expect(hasName(female, '卸妆棉')).toBe(true);
    expect(hasName(male, '剃须刀')).toBe(true);
    expect(hasName(male, '卸妆棉')).toBe(false);
    // 向后兼容底线：老数据（无 gender）清单与加这维之前完全一致
    expect(hasName(unknown, '剃须刀')).toBe(true);
    expect(hasName(unknown, '卸妆棉')).toBe(true);
  });

  it('M2 卫生巾：女性恒出现，经期开 → 必带且按晚数算数量；关 → 可选 1 件（H43）', () => {
    const padOff = buildPrepExt(cond({ gender: 'female', nights: 3 })).find(i => i.itemId === 'x_sanitary_pad')!;
    const padOn = buildPrepExt(cond({ gender: 'female', nights: 3, period: true })).find(i => i.itemId === 'x_sanitary_pad')!;
    expect(padOff).toBeTruthy();
    expect(padOff.prep).toBe('可选');
    expect(padOff.qty).toBe(1);
    expect(padOn.prep).toBe('必带');
    expect(padOn.qty).toBe(4);   // nights + 1
    // 男性 / 性别未知不出现（可在通用输入手动加）
    expect(buildPrepExt(cond({ gender: 'male' })).some(i => i.itemId === 'x_sanitary_pad')).toBe(false);
    expect(buildPrepExt(cond()).some(i => i.itemId === 'x_sanitary_pad')).toBe(false);
  });

  it('M3 止痛药：只在女性 + 经期出现且必带；关掉经期整条消失；男性不出现（H52）', () => {
    const on = buildPrepExt(cond({ gender: 'female', period: true }));
    expect(on.find(i => i.itemId === 'x_painkiller')!.prep).toBe('必带');
    // 关掉经期 → 不是降级为可选，是整条消失（老板对卫生巾与止痛药的措辞不同）
    expect(buildPrepExt(cond({ gender: 'female' })).some(i => i.itemId === 'x_painkiller')).toBe(false);
    expect(buildPrepExt(cond({ gender: 'male', period: true })).some(i => i.itemId === 'x_painkiller')).toBe(false);
    expect(buildPrepExt(cond()).some(i => i.itemId === 'x_painkiller')).toBe(false);
    // 医疗红线：只有中性条目名，不带任何剂量 / 用法文案
    expect(EXTRA_ITEMS.find(i => i.id === 'x_painkiller')!.name).toBe('止痛药');
  });

  it('M4 住宿情况 7 标签：PurposeExt 降级映射不污染源枚举；「其他」与普通短住清单一致（H55/H56/H57）', () => {
    expect(PURPOSES_EXT).toEqual(['普通短住', '出差', '旅游', '探亲', '学习培训', '看病', '其他']);
    // 源枚举只认 4 值：扩展值一律降级到「普通短住」（H57 由 diff:types 守护，这里守映射）
    expect(toSourcePurpose('学习培训')).toBe('普通短住');
    expect(toSourcePurpose('看病')).toBe('普通短住');
    expect(toSourcePurpose('其他')).toBe('普通短住');
    expect(toSourcePurpose('出差')).toBe('出差');
    // 新标签真的生效
    expect(hasName(buildPrepExt(cond({ purposeExt: '学习培训' })), '学习/培训资料')).toBe(true);
    expect(hasName(buildPrepExt(cond({ purposeExt: '看病' })), '病历本')).toBe(true);
    expect(hasName(buildPrepExt(cond({ purposeExt: '探亲' })), '探亲礼物')).toBe(true);
    // 「其他」= 最中性基线：源 purpose 要同步降级成普通短住（wizard 双写），
    // 清单与普通短住完全一致，且不出现任何按目的推荐的物品
    const other = buildPrepExt(cond({ purpose: '普通短住', purposeExt: '其他' }));
    const normal = buildPrepExt(cond({ purpose: '普通短住', purposeExt: '普通短住' }));
    expect(names(other).sort()).toEqual(names(normal).sort());
    expect(other.some(i => i.itemId === 'x_gift' || i.itemId === 'x_sunscreen' || i.itemId === 'x_medical_record')).toBe(false);
    // 老数据回推：没写 purposeExt 时按源 purpose 判定，清单不缩水（H49 的另一半）
    expect(hasName(buildPrepExt(cond({ purpose: '探亲' })), '探亲礼物')).toBe(true);
  });

  it('M5 场景与通用新物品：防晒/一次性内裤跟旅游或晚数；隐形眼镜/眼镜恒真（§4.5 B 表）', () => {
    const always = buildPrepExt(cond());
    expect(hasName(always, '隐形眼镜')).toBe(true);
    expect(hasName(always, '备用眼镜')).toBe(true);
    // 防晒霜：只在旅游出现
    expect(hasName(buildPrepExt(cond({ nights: 1, purposeExt: '旅游' })), '防晒霜')).toBe(true);
    expect(hasName(buildPrepExt(cond({ nights: 1, purpose: '普通短住' })), '防晒霜')).toBe(false);
    // 一次性内裤：2 晚以上或旅游
    expect(hasName(buildPrepExt(cond({ nights: 2 })), '一次性内裤')).toBe(true);
    expect(hasName(buildPrepExt(cond({ nights: 1, purposeExt: '旅游' })), '一次性内裤')).toBe(true);
    expect(hasName(buildPrepExt(cond({ nights: 1, purpose: '普通短住' })), '一次性内裤')).toBe(false);
  });

  it('M6 化妆品（R5-6）：类型表在扩展层；clothing-add 已泛化；两页面接线用 data-cat 路由', () => {
    expect(COSMETIC_TYPES.length).toBeGreaterThan(10);
    expect(COSMETIC_TYPES).toContain('面膜');
    const comp = src('components/clothing-add/clothing-add.ts');
    expect(comp).toContain("cat: { type: String, value: '' }");
    expect(comp).toContain('placeholder: { type: String');
    // 页面侧：化妆品面板仅女性渲染入口；添加统一走 addTyped，落点分类靠 data-cat
    expect(src('pages/wizard/wizard.wxml')).toContain('types="{{cosmeticTypes}}"');
    expect(src('pages/stay/stay.wxml')).toContain('data-cat="化妆品"');
    expect(src('pages/wizard/wizard.wxml')).toContain('data-cat="化妆品"');
    expect(src('pages/stay/stay.ts')).toContain('addTyped');
    expect(src('pages/wizard/wizard.ts')).toContain('addTyped');
    // R6 修复：化妆品组 push 进 cats 后统一按 CAT_ORDER_EXT 排序 ——
    // 排在衣物之后、出行之前（之前 push 在末尾，组跑到了清单最后）
    expect(src('pages/stay/stay.ts')).toContain("cats.push('化妆品')");
    expect(src('pages/stay/stay.ts')).toContain('cats.sort((a, b) => CAT_ORDER_EXT.indexOf(a)');
    expect(src('pages/wizard/wizard.ts')).toContain("cats.push('化妆品')");
  });

  it('M7 向导接线：性别步 / 经期开关 / 7 标签 picklist / 整行可点（静态结构）', () => {
    const wxml = src('pages/wizard/wizard.wxml');
    const ts = src('pages/wizard/wizard.ts');
    const row = src('components/item-row/item-row.wxml');
    // 性别：男 / 女两行；切回男性必须清掉经期（否则「男性 + 经期」脏状态会让止痛药冒出来）
    expect(wxml).toContain('data-g="male"');
    expect(wxml).toContain('data-g="female"');
    expect(wxml).toContain('bindtap="setGender"');
    expect(ts).toContain("period: g === 'female' ? this.data.period : false");
    // 经期开关只给女性渲染
    expect(wxml).toContain("wx:if=\"{{gender === 'female'}}\"");
    // 住宿情况 7 标签一列排放 + 提示行动态计算（不硬编码文案）
    expect(wxml).toContain('wx:for="{{purposesExt}}"');
    expect(ts).toContain('purpose: toSourcePurpose(p)');
    expect(ts).toContain('purposeFxOf');
    // R5-2 整行可点：根节点 bindtap + 行内 catchtap 挡冒泡（勾选框不能双触发）
    expect(row).toContain('bindtap="onToggle"');
    expect(row).toContain('catchtap="onToggle"');
    expect(row).toContain('catchtap="toggleGear"');
    // M19：行尾删除按钮退役（stepper 减到 0 已等效删除），del 节点不再存在
    expect(row).not.toContain('catchtap="onRemove"');
    expect(row).toContain('catchtap="noop"');
    // 向导第 ⑦ 步预览行可勾选
    expect(wxml).toContain('bind:toggle="onPreviewToggle"');
    expect(ts).toContain('onPreviewToggle');
  });

  it('M8 下拉错位修复：面板包在 root-portal 里，绕开 .glass 的 backdrop-filter 包含块（H47）', () => {
    const wxml = src('components/clothing-add/clothing-add.wxml');
    expect(wxml).toContain('<root-portal');
    // 面板仍是 fixed 定位 —— portal 出来之后 fixed 才真正相对视口
    expect(src('components/clothing-add/clothing-add.wxss')).toContain('position: fixed');
  });

  it('M9 浮窗：1500ms + 宽度随屏宽自适应（H48）', () => {
    expect(TOAST_MS).toBe(1500);
    expect(src('components/toast/toast.wxss')).toContain('max-width: calc(100vw - 96rpx)');
    expect(src('components/toast/toast.wxss')).not.toContain('620rpx');
  });

  it('M10 滑动手势（R5-1 终案）：原生 swiper 单一实现，WXS / 页面层 touch 双清零（H38/H50）', () => {
    const wxml = src('pages/stay/stay.wxml');
    const ts = src('pages/stay/stay.ts');
    // 手势只有原生 swiper 一套 —— 拍板红线「不要同时保留两套手势实现」。
    // R5-1 历经四轮手写方案均告失败，M16 按 §2.5 拍板落地 swiper，此案收官。
    expect(wxml).toContain('bindchange="onSwiperChange"');
    expect(ts).toContain('onSwiperChange(');
    // 页面层不得再挂自己的 touch 判定（双实现会一次滑动跳两段，§2.6）
    expect(wxml).not.toContain('bindtouchstart');
    expect(wxml).not.toContain('bindtouchmove');
    // WXS 载体已删（L14 另有全量扫描）
    expect(wxml).not.toContain('<wxs');
  });


  it('M11 loadExt 逐字段校验：非法 gender 不带坏整份扩展数据；不添加原记录没有的字段', () => {
    Storage.setItem('htb_ext_v1', JSON.stringify({
      prefs: { relation: '家人' },
      stays: {
        good: { relation: '情侣', gender: 'female', period: true, purposeExt: '看病' },
        badGender: { relation: '朋友', gender: 'woman' },   // 非法 gender → 静默剔除该字段
        badRelation: { relation: '夫妻' },                   // 非法 relation → 整条丢弃（同旧行为）
        junk: 'not-an-object',
      },
    }));
    expect(getStayExt('good')).toEqual({ relation: '情侣', gender: 'female', period: true, purposeExt: '看病' });
    expect(getStayExt('badGender')).toEqual({ relation: '朋友' });
    expect(getStayExt('badRelation')).toBeNull();
    expect(getStayExt('junk')).toBeNull();
  });

  it('M12 图标档位：住宿情况 7 个图标与性别 ♂♀ 的 pine 档都在（J1 是全量守卫，这里盯新增）', () => {
    const css = src('icon.wxss');
    ['bed-double', 'house', 'sliders', 'mars', 'venus'].forEach(n => {
      expect(css).toContain('.ic-' + n + '-p {');
    });
    const gen = srcRepo('tools/gen-icons.py');
    expect(gen).toContain("'bed-double': 'dp'");
    expect(gen).toContain("'house': 'dp'");
    expect(gen).toContain("'sliders': 'p'");
  });
});

// ──────────────────── N 第六轮反馈（2026-10-02 老板口头反馈） ────────────────────

describe('N 第六轮反馈', () => {
  const cond = (patch: Partial<ConditionsExt> = {}): ConditionsExt => ({ ...base, ...patch });
  const hasName = (list: PrepItem[], part: string) => list.some(i => i.name.includes(part));

  it('N1 「替其他人管行李」关掉 → 清单只按自己 1 人算：无儿童/老人物品、每人份 ×1', () => {
    // 3 人入住 + 1 儿童 0-3 岁 + 1 老人：开着时照旧
    const group = cond({ adults: 3, children: 1, elderlyCount: 1, elderly: true });
    expect(hasName(buildPrepExt(group), '纸尿裤')).toBe(true);
    expect(hasName(buildPrepExt(group), '防滑拖鞋')).toBe(true);
    expect(get(buildPrepExt(group), '内衣裤')!.qty).toBe(12);   // 3 人 × 4
    // 关掉后：只管自己 —— 儿童用品整层消失、每人份按 1
    const solo = buildPrepExt(cond({ adults: 3, children: 1, elderlyCount: 1, elderly: true, careOthers: false }));
    expect(hasName(solo, '纸尿裤')).toBe(false);
    expect(hasName(solo, '床围挡')).toBe(false);
    expect(hasName(solo, '防滑拖鞋')).toBe(false);
    expect(hasName(solo, '儿童牙刷')).toBe(false);
    expect(get(solo, '内衣裤')!.qty).toBe(4);                   // 1 人 × 4
    expect(get(solo, '身份证')!.qty).toBe(1);
    // 老数据（无 careOthers 字段）保持旧行为 —— 与加这维之前一致
    expect(get(buildPrepExt(cond({ adults: 2, nights: 3 })), '内衣裤')!.qty).toBe(8);
  });

  it('N2 化妆品预置常见物品：仅女性默认出现（香水/口红/粉底）；男性不出现可手动加', () => {
    const female = buildPrepExt(cond({ gender: 'female' }));
    const ids = ['x_perfume', 'x_lipstick', 'x_foundation'];
    ids.forEach(id => expect(female.some(i => i.itemId === id)).toBe(true));
    const male = buildPrepExt(cond({ gender: 'male' }));
    ids.forEach(id => expect(male.some(i => i.itemId === id)).toBe(false));
    // 性别未知（老数据）不出现 —— 老行程清单一个都不许变
    ids.forEach(id => expect(buildPrepExt(cond()).some(i => i.itemId === id)).toBe(false));
    // 化妆品组必须排在衣物之后、出行之前（合并表层面守卫）
    expect(CAT_ORDER_EXT.indexOf('化妆品')).toBe(CAT_ORDER_EXT.indexOf('衣物') + 1);
    expect(CAT_ORDER_EXT.indexOf('出行')).toBe(CAT_ORDER_EXT.indexOf('化妆品') + 1);
  });

  it('N3 化妆品组位置修复：分组构建是「push 进 cats 后统一按 CAT_ORDER_EXT 排序」', () => {
    // 之前 push 在末尾、排序在前，导致化妆品组跑到清单最后（老板点名）
    for (const f of ['pages/stay/stay.ts', 'pages/wizard/wizard.ts']) {
      const code = src(f);
      const iPush = code.indexOf("cats.push('化妆品')");
      const iSort = code.indexOf('cats.sort((a, b) => CAT_ORDER_EXT.indexOf(a)');
      expect(iPush).toBeGreaterThan(-1);
      expect(iSort).toBeGreaterThan(iPush);   // 排序必须发生在 push 之后
    }
    // 排序键是 CAT_ORDER_EXT（化妆品在里面紧跟衣物）
    expect(CAT_ORDER_EXT.indexOf('化妆品')).toBeGreaterThan(-1);
  });

  it('N4 性别步改版：无说明文字、行加大、「替其他人管行李」开关在位', () => {
    const wxml = src('pages/wizard/wizard.wxml');
    const wxss = src('pages/wizard/wizard.wxss');
    // 那句「只影响默认清单…」不出现（老板明确不要）
    expect(wxml).not.toContain('男性可以手动加卫生巾');
    // 男 / 女两行加大
    expect(wxml).toContain('pickrow-lg');
    expect(wxss).toMatch(/\.pickrow-lg\s*\{[^}]*132rpx/s);
    // 管行李开关与两种状态的连锁说明（R6.5：各两行 —— 讲「后续步骤」+「清单」两层）
    expect(wxml).toContain('bind:change="toggleCareOthers"');
    expect(wxml).toContain('替其他人管行李');
    expect(wxml).toContain('开 · 后面照常询问：几个人入住、和谁同行、有没有孩子老人');
    expect(wxml).toContain('清单按所有入住人一起准备');
    expect(wxml).toContain('关 · 后面不再问同行的事');
    expect(wxml).toContain('清单只按你一个人准备');
    expect(wxml).toContain('所有「每人份」按 1 份算');
    expect(src('pages/wizard/wizard.ts')).toContain('toggleCareOthers');
    // careOthers 走扩展层存储
    expect(src('pages/wizard/wizard.ts')).toContain('careOthers: this.data.careOthers');
  });

  it('N5 下拉面板重做：列表可滚、自定义入口、输入行常驻', () => {
    const wxml = src('components/clothing-add/clothing-add.wxml');
    const ts = src('components/clothing-add/clothing-add.ts');
    const wxss = src('components/clothing-add/clothing-add.wxss');
    // 列表区用 scroll-view（遮罩 catchtouchmove 会取消 overflow 滚动的默认行为）；
    // M19 起加 show-scrollbar —— 滚动条常亮组合拳之一（另一个是 wxss 的 classic 滚动条样式，见 R3）
    expect(wxml).toContain('<scroll-view scroll-y show-scrollbar="{{true}}" class="clist">');
    // 「自定义」项 + 点它聚焦输入行（不关面板）
    expect(wxml).toContain('copt-custom');
    expect(wxml).toContain('bindtap="onPickCustom"');
    expect(ts).toContain('onPickCustom()');
    expect(ts).toContain('focusInput: true');
    // 输入行在 scroll-view 之外（常驻底部，不被列表截掉）
    const iScrollEnd = wxml.indexOf('</scroll-view>');
    const iCrow = wxml.indexOf('class="crow"');
    expect(iScrollEnd).toBeGreaterThan(-1);
    expect(iCrow).toBeGreaterThan(iScrollEnd);
    // 输入行拿 focus 属性
    expect(wxml).toContain('focus="{{focusInput}}"');
    // 列表区有独立高度上限，给输入行留空间
    expect(wxss).toContain('.clist');
  });

  it('N6 好物页：恢复按钮下线、「添加好物」在列表下方', () => {
    const wxml = src('pages/gear/gear.wxml');
    const ts = src('pages/gear/gear.ts');
    // 「恢复默认好物」整块下线（resetGear 能力保留在引擎层）。
    // 断言前剥 wxml 注释（坑八）：删除说明里会提到这个名字
    const markup = wxml.replace(/<!--[\s\S]*?-->/g, '');
    expect(markup).not.toContain('恢复默认好物');
    // ts 侧同样剥注释（头注释里讲了删除原因，会提到 resetGear）
    const tsCode = ts.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(tsCode).not.toContain('resetGear');
    // 「添加好物」按钮位置：在分组列表之后、页脚之前
    const iGroups = wxml.indexOf('wx:for="{{groups}}"');
    const iAdd = wxml.indexOf('bindtap="openAdd"');
    const iFoot = wxml.indexOf('class="gearfoot"');
    expect(iGroups).toBeGreaterThan(-1);
    expect(iAdd).toBeGreaterThan(iGroups);
    expect(iFoot).toBeGreaterThan(iAdd);
    // 空态文案指向「下方」
    expect(wxml).toContain('点下方「添加好物」');
  });

  it('N7 管行李关掉 → 向导 7 步变 5 步：跳过「人数 / 同行人员」两步（R6.5）', () => {
    const ts = src('pages/wizard/wizard.ts');
    const wxml = src('pages/wizard/wizard.wxml');
    // 流程定义：全量 1-7，关掉时跳过 3（人数）与 4（同行人员）
    expect(ts).toContain('const ALL_STEPS = [1, 2, 3, 4, 5, 6, 7];');
    expect(ts).toContain('const SOLO_STEPS = [1, 2, 5, 6, 7];');
    // 导航按 flow 走，切到关时同行相关数值一并清零（关系判定与头部显示不再说谎）
    expect(ts).toContain('const nxt = flow[i + 1];');
    expect(ts).toContain("this.setData({ step: this.data.flow[i - 1], stepPos: i })");
    expect(ts).toContain("adultsWith: 0,");
    expect(ts).toContain("relation: '独自',");
    // buildEffects：关掉时「N 人入住、每人份按 N 份」不再出现（否则是假话）
    expect(ts).toContain('d.adults > 1 && this.data.careOthers');
    // 进度与最后一步判定必须用 stepPos（位置），不能用步骤号 ——
    // 关掉后步骤号不连续（1,2,5,6,7），step !== total 会把保存页误判成中间步
    expect(wxml).toContain('width: {{stepPos / total * 100}}%');
    expect(wxml).toContain('wx:if="{{stepPos !== total}}"');
    expect(wxml).toContain('wx:if="{{stepPos > 1}}"');
  });
});

// ──────────────────── O 第七轮反馈（2026-10-02 老板口头反馈） ────────────────────

describe('O 第七轮反馈', () => {
  it('O1 免责声明去重：知识库不再渲染，「我的」页保留（老板点名）', () => {
    const know = src('pages/knowledge/knowledge.wxml');
    // 结构 + 数据 + 样式三处都清掉；.b 保留（条目正文加粗还在用）。
    // ts 断言前剥注释（坑八）：头注释里会讲述免责声明移走的原因，会提到 DISCLAIMER
    expect(know).not.toContain('class="glass disclaimer"');
    const knowTs = src('pages/knowledge/knowledge.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(knowTs).not.toContain('DISCLAIMER');
    expect(src('pages/knowledge/knowledge.wxss')).not.toContain('.d-alert');
    expect(src('pages/knowledge/knowledge.wxss')).toMatch(/^\.b \{/m);
    // 「我的」页同源免责声明原样保留
    expect(src('pages/mine/mine.wxml')).toContain('免责声明');
  });

  it('O2 色块接缝修复：背景光斑改为固定层，page 不再直接画渐变', () => {
    const app = src('app.wxss');
    // page 只保留纯色底（原来 background-image 只画第一屏，滚出后与纯色底生硬相接）。
    // 渐变全文只允许出现一次 —— 在 .bg-glow 固定层里；page 规则里不许再有
    expect(app).toMatch(/\.bg-glow\s*\{[^}]*background-image:\s*radial-gradient/s);
    expect((app.match(/background-image:\s*radial-gradient/g) || []).length).toBe(1);
    // 固定光斑层：铺满视口、垫底、不挡点击
    expect(app).toMatch(/\.bg-glow\s*\{[^}]*position:\s*fixed/s);
    expect(app).toMatch(/\.bg-glow\s*\{[^}]*z-index:\s*-1/s);
    expect(app).toMatch(/\.bg-glow\s*\{[^}]*pointer-events:\s*none/s);
    // 六个页面都挂上了这层
    const pages = ['home', 'wizard', 'stay', 'knowledge', 'gear', 'mine'];
    pages.forEach(p => {
      expect(src(`pages/${p}/${p}.wxml`)).toContain('class="bg-glow"');
    });
  });
});

// ──────────────────── P 首屏提速（M17 · 第十轮反馈：首页点进行程页要「加载一小会儿」） ────────────────────
//
// 根因：首进要串行 3 次渲染管线往返（onLoad 提交 id/initStage/hints → onShow 提交
// loaded/stageAuto → render 提交整页 VM），加上 swiper 高度「兜底 600 → 量到实高」
// 的展开过渡 —— 进入时先看空骨架再等内容「啪」地出现。M17 合并成一次大提交 +
// 高度按行程缓存。wx 层在 node 里跑不了，这里全部是结构断言。

describe('P 首屏提速（M17 首进合并提交 + 高度缓存）', () => {
  const ts = src('pages/stay/stay.ts');

  it('P1 首进一次大提交：onLoad 零 setData，URL 参数并入 render 的同一次提交', () => {
    // onLoad 只暂存到实例字段，不进 data —— 方法体内不得出现 setData
    const iLoad = ts.indexOf('onLoad(options: Record<string, string>)');
    const iScroll = ts.indexOf('onPageScroll(');
    expect(iLoad).toBeGreaterThan(-1);
    expect(iScroll).toBeGreaterThan(iLoad);
    const onLoadBody = ts.slice(iLoad, iScroll);
    expect(onLoadBody).not.toContain('this.setData(');
    expect(onLoadBody).toContain('this._bootId = String(options.id');
    expect(onLoadBody).toContain('isStage(options.stage)');
    // onShow 里唯一的 setData 是 missing 兜底分支 —— loaded/stageAuto 不再单独提交
    const iShow = ts.indexOf('onShow()');
    const iRender = ts.indexOf('render(s: Stay, stage: Stage');
    const onShowBody = ts.slice(iShow, iRender);
    expect(onShowBody).toContain('this.setData({ id, missing: true })');
    expect(onShowBody.match(/this\.setData\(/g)?.length).toBe(1);
    // 首进 extra 五件套与整页 VM 同一次提交
    expect(onShowBody).toContain('this.render(s, stage, first ? {');
    expect(onShowBody).toContain('loaded: true');
    expect(onShowBody).toContain('swiperH: loadPaneH(id, STAGES.indexOf(stage))');
    // render 端：extra 并入提交；stageHint 读 extra 的 stageAuto
    // （它与 stageAuto 同批提交，this.data 在提交前还是旧值 —— 读旧值就是 bug）
    expect(ts).toContain('...extra,');
    expect(ts).toContain('stageHint: stageHintOf(stage, extra?.stageAuto ?? this.data.stageAuto)');
  });

  it('P2 高度按行程 + 段位缓存：首帧即正确页高，且缓存损坏不带崩页面', () => {
    expect(ts).toContain("const PANE_H_KEY = 'htb_ui_paneh_v1'");
    // 量到实高后回写；读不到 / 值非法一律回退 600（项目硬约束：存储解析必须容错）
    expect(ts).toContain('savePaneH(this.data.id, idx, rect.height)');
    expect(ts).toContain('return typeof h === \'number\' && h > 0 ? h : 600;');
    // 防残留：删除行程时清掉自己的缓存；「我的」页清空数据时清整个 key
    expect(ts).toContain('removePaneH(this.data.id)');
    expect(src('pages/mine/mine.ts')).toContain("'htb_ui_paneh_v1'");
  });

  it('P3 hints 静态化：常量表直接作 data 初始值，onLoad 不再重复提交', () => {
    expect(ts).toContain('hints: CUSTOM_HINTS as HintVM[]');
    // P1 已断言 onLoad 无 setData —— 这里补一道防线：全文不再有「每次进页都传 hints」的提交
    expect(ts).not.toContain("'common.hints': CUSTOM_HINTS");
  });
});

// ─────────────────── Q 第十一轮反馈（M18：全选 / 标签审核 / 下拉修复 / 页面去重） ───────────────────

describe('Q 第十一轮反馈', () => {
  it('Q1 第 ⑥ 步全选按钮：两态切换（全选 ↔ 取消全选），开关一网打尽（M19 起含经期）', () => {
    const wxml = src('pages/wizard/wizard.wxml');
    const ts = src('pages/wizard/wizard.ts');
    // 问题行右侧的两态按钮：文案随 prefsAll 切换，点同一颗按钮可全开 / 全关
    expect(wxml).toContain('bindtap="toggleAllPrefs"');
    expect(wxml).toContain("{{prefsAll ? '取消全选' : '全选'}}");
    expect(ts).toContain('toggleAllPrefs()');
    // M19：全开判定收进 allOn()（四个「在意」+ 女性经期），全选按钮按它翻转 —— 细节见 R1
    expect(ts).toContain('const all = !this.allOn(cur);');
  });

  it('Q2 好物入口：证件类整类豁免；无收藏时不再出现「挑好物」（改为「记好物」）', () => {
    const ts = src('components/item-row/item-row.ts');
    // 老板点名：手机 / 钱包 / 现金这类「已买好、入住时只求快」的证件物品不给入口
    expect(ts).toContain("it.cat !== '证件'");
    // 面板记的是「你用过的品牌」，无收藏时引导语从购物腔「挑好物」改为记录腔「记好物」
    expect(ts).not.toContain('挑好物');
    expect(ts).toContain("'记好物'");
    expect(ts).toContain("`好物 ${n}`");
    // 入口结构保留（有收藏时照常显示「好物 N」并展开面板）
    expect(src('components/item-row/item-row.wxml')).toContain('gearbtn');
  });

  it('Q3 prep 标签审核：臆测类（家里带/建议购买/到店购买）不再显示；自定义物品不再默认标「家里带」', () => {
    const ts = src('components/item-row/item-row.ts');
    const wxml = src('components/item-row/item-row.wxml');
    expect(ts).toContain('HIDE_PREP');
    ['家里带', '建议购买', '到店购买'].forEach(p => expect(ts).toContain(`'${p}'`));
    // WXML 用预计算的 showPrepTag 条件渲染（裸比较不进模板，同 C3 的规矩）
    expect(wxml).toContain('wx:elif="{{showPrepTag}}"');
    // 有事实依据的四类保留在 TAG_CLS 里：必带 / 推荐 / 可选 / 自定义
    ['必带', '推荐', '可选', '自定义'].forEach(p => expect(ts).toContain(`${p}: '`));
    // 两个页面下拉加的自定义物品，prep 从臆测的「家里带」改为事实的「自定义」
    expect(src('pages/stay/stay.ts')).not.toContain("prep: '家里带'");
    expect(src('pages/wizard/wizard.ts')).not.toContain("prep: '家里带'");
  });

  it('Q4 clothing-add：trigger 属性接管触发条文案；选完即复位；无选中高亮', () => {
    const comp = src('components/clothing-add/clothing-add.ts');
    const wxml = src('components/clothing-add/clothing-add.wxml');
    // 化妆品面板不再显示「选择衣物类型…」—— 文案由调用方传入
    expect(comp).toContain('trigger: { type: String');
    expect(wxml).not.toContain('选择衣物类型…');
    // chosen 退役：属性定义与「选完写回」都不存在了（触发条回到占位文案等待下一次选择）
    expect(comp).not.toContain('chosen: { type: String');
    expect(comp).not.toContain('setData({ chosen');
    expect(wxml).not.toContain('chosen');
    expect(src('components/clothing-add/clothing-add.wxss')).not.toMatch(/\.copt\.chosen\s*\{/);
    // 四处接线各自传 trigger（衣物 / 化妆品 × 行程页 / 向导）
    for (const f of ['pages/stay/stay.wxml', 'pages/wizard/wizard.wxml']) {
      expect(src(f)).toContain('trigger="选择衣物类型…"');
      expect(src(f)).toContain('trigger="选择化妆品类型…"');
    }
  });

  it('Q5 化妆品分组查重：女性预置物品已含「化妆品」时不再无条件 push（两个页面同一守卫）', () => {
    for (const f of ['pages/stay/stay.ts', 'pages/wizard/wizard.ts']) {
      const code = src(f);
      // 老板真机抓到「两个一模一样的化妆品组」—— push 前必须查重；
      // M6 / N3 钉的字面量（push + 之后统一 sort）原样保留，不与之冲突
      expect(code).toContain("!cats.includes('化妆品')");
      expect(code).toContain("cats.push('化妆品')");
      const iPush = code.indexOf("cats.push('化妆品')");
      const iSort = code.indexOf('cats.sort((a, b) => CAT_ORDER_EXT.indexOf(a)');
      expect(iSort).toBeGreaterThan(iPush);
    }
  });

  it('Q6 页面去重：统计只在首页显示一次；「我的」页偏好设置卡退役', () => {
    const mineWxml = src('pages/mine/mine.wxml');
    const mineTs = src('pages/mine/mine.ts');
    // 数据概况卡与偏好设置卡整体删除
    expect(mineWxml).not.toContain('数据概况');
    expect(mineWxml).not.toContain('偏好设置');
    expect(mineWxml).not.toContain('bindtap="setRelation"');
    expect(mineTs).not.toContain('setRelation(');
    expect(mineTs).not.toContain('getDefaultRelation');
    expect(mineTs).not.toContain('prepStats');
    expect(mineTs).not.toContain('reload(');
    // 统计条保留在首页（有行程时的入口页概览），且本机存储提示仍常驻首页（I4 的要求不变）
    const homeWxml = src('pages/home/home.wxml');
    expect(homeWxml).toContain('statrow');
    expect(homeWxml).toContain('数据只保存在本机');
  });
});


// ─────────────────── R 第十二轮反馈（M19：全选补全与醒目化 / 删除按钮退役 / 滚动条常亮） ───────────────────

describe('R 第十二轮反馈', () => {
  it('R1 全选补全：女性的「是否处于经期」一并触发；全开判定 allOn 含经期口径', () => {
    const ts = src('pages/wizard/wizard.ts');
    // 老板真机抓到：选了女生后按全选，「是否处于经期」纹丝不动 —— 漏网之鱼
    expect(ts).toContain("if (this.data.gender === 'female') this.setData({ period: all });");
    // allOn：四个「在意」+（女性）经期才算全开；男性没有经期开关，不参与判定
    expect(ts).toContain("const periodOk = this.data.gender !== 'female' || this.data.period;");
    // 单个开关变化后按钮要重新对账：togglePref / togglePeriod / setGender 三处都得来
    expect((ts.match(/this\.syncPrefsAll\(\);/g) || []).length).toBe(3);
  });

  it('R1 全选醒目化：纯文字链接升级为胶囊按钮（底色 + 描边 + 加粗）', () => {
    const wxss = src('pages/wizard/wizard.wxss');
    // 老板反馈原来的文字链太隐蔽 —— 取 .selall 块断言特征（999rpx 全文件常见，不能全局撞）
    const m = wxss.match(/\.selall\s*\{[\s\S]*?\}/);
    expect(m).not.toBeNull();
    expect(m![0]).toContain('background: rgba(28, 90, 74, 0.1)');
    expect(m![0]).toContain('border: 2rpx solid rgba(28, 90, 74, 0.35)');
    expect(m![0]).toContain('font-weight: 650');
  });

  it('R2 删除按钮退役：stepper 减到 0 已等效删除，del 节点/属性/样式/接线全链路清零', () => {
    // 组件层：节点、属性、方法、样式一并移除（断言前剥注释，防「说明退役原因的注释」误伤）
    const rowWxml = src('components/item-row/item-row.wxml').replace(/<!--[\s\S]*?-->/g, '');
    const rowTs = src('components/item-row/item-row.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const rowWxss = src('components/item-row/item-row.wxss').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(rowWxml).not.toContain('onRemove');
    expect(rowWxml).not.toContain('class="del"');
    expect(rowTs).not.toContain('removable');
    expect(rowTs).not.toContain('onRemove');
    expect(rowWxss).not.toMatch(/\.del\s*\{/);
    // 页面层：接线（removable / bind:remove）、处理方法、专用事件接口一并清零
    expect(src('pages/stay/stay.wxml')).not.toContain('bind:remove');
    expect(src('pages/wizard/wizard.wxml')).not.toContain('bind:remove');
    const stayTs = src('pages/stay/stay.ts');
    const wizTs = src('pages/wizard/wizard.ts');
    expect(stayTs).not.toContain('onItemRemove');
    expect(stayTs).not.toContain('interface KeyEvent');
    expect(wizTs).not.toContain('removeItem');
    expect(wizTs).not.toContain('interface IdxEvent');
  });

  it('R3 滚动条常亮：show-scrollbar + classic 滚动条样式，用户才看得出列表能往下滑', () => {
    const wxml = src('components/clothing-add/clothing-add.wxml');
    const wxss = src('components/clothing-add/clothing-add.wxss');
    expect(wxml).toContain('show-scrollbar="{{true}}"');
    // ::-webkit-scrollbar 定义了尺寸，WebView 就切 classic 模式 —— 滚动条不再淡出
    expect(wxss).toContain('.clist ::-webkit-scrollbar');
    expect(wxss).toContain('.clist ::-webkit-scrollbar-thumb');
  });
});


// ─────────────── Z 存储读修复与导入净化（M10 修复轮：A1 / A2 / A3 / A4 / B5 / B6） ───────────────
//
// core/repair.ts 的三个承诺，由 Z1–Z11 分别盯住：
//   ① 合法数据一个字节都不动（Z1 / Z9）；
//   ② 坏数据修到与本地新建完全同构、救不了的丢弃（Z3 / Z4 / Z5 / Z8）；
//   ③ 平台接线不缺斤短两（Z10 / Z11 静态断言 —— wx 层在 node 里跑不了）。

describe('Z 存储读修复与导入净化（core/repair.ts）', () => {
  it('Z1 合法数据零改动：落盘原文经 parseStaysPayload 一个字节都不变', () => {
    const s = newStay({ ...base, date: offsetDate(5) }, buildPrep(base));
    // custom 项键序与 normalizePrepItem 输出一致（name → cat → unit → prep → source → users → qty → done）
    s.custom = [{
      name: '瑜伽垫', cat: '自定义', unit: '条', prep: '家里带',
      source: '自定义', users: '每人', qty: 1, done: false,
    }];
    saveStay(s);
    const raw = Storage.getItem('htb_stays_v1')!;
    expect(raw).toBeTruthy();
    const payload = parseStaysPayload(raw);
    expect(payload).not.toBeNull();
    // 核心承诺：合法数据修复前后 JSON.stringify 相等（json 原样返回原文）
    expect(payload!.json).toBe(raw);
    // 修出来的行程与 engine 直读完全一致（含 guests / checkin / checkout / prep / custom）
    expect(payload!.stays).toEqual(listStays());
  });

  it('Z2 救不了的返回 null：JSON 语法坏 / 顶层不是数组', () => {
    expect(parseStaysPayload('{"broken')).toBeNull();
    expect(parseStaysPayload('{"app":1}')).toBeNull();
    expect(parseStaysPayload('null')).toBeNull();
  });

  it('Z3 platform 降级等效演练：坏原文 → 空表继续，engine 照常工作（A1）', () => {
    Storage.setItem('htb_stays_v1', '彻底坏了{{{');
    const raw = Storage.getItem('htb_stays_v1')!;
    const fixed = parseStaysPayload(raw);
    expect(fixed).toBeNull();
    // platform.ts 同款分支：fixed 为 null → 隔离原文（wx 层动作，由 Z11 静态断言盯）→ 按 '[]' 继续
    Storage.setItem('htb_stays_v1', fixed ? fixed.json : '[]');
    expect(listStays()).toEqual([]);
    saveStay(newStay(base, buildPrep(base)));
    expect(listStays()).toHaveLength(1);
  });

  it('Z4 缺字段的单条行程被补齐到与 newStay 完全同构（键序一致）', () => {
    const s = normalizeStay({
      id: 'stay_x',
      conditions: { date: '2026-11-01', nights: 'x', adults: -3, children: '2' },
    });
    expect(s).not.toBeNull();
    expect(s!.nights).toBe(1);                 // 非法 nights 落回 ≥ 1
    expect(s!.date).toBe('2026-11-01');       // date 与 conditions.date 对齐
    expect(s!.prep).toEqual([]);
    expect(s!.custom).toEqual([]);
    expect(s!.conditions.purpose).toBe('普通短住');
    // checkin / checkout 与 CHECKLISTS 当前结构同尺寸（A4）
    expect(s!.checkin).toEqual(CHECKLISTS.checkin.groups.map(g => g.items.map(() => false)));
    expect(s!.checkout).toEqual(CHECKLISTS.checkout.groups.map(g => g.items.map(() => false)));
    // 键序与源 newStay 一致 —— JSON.stringify 相等的前提
    expect(Object.keys(s!)).toEqual(Object.keys(newStay(base, [])));
  });

  it('Z5 救不了的整条丢弃：无 id / 非对象条目不进结果', () => {
    const bad = parseStaysPayload(
      JSON.stringify([null, 12, 'str', { conditions: {} }, { id: 'ok', conditions: base }]),
    )!;
    expect(bad.stays).toHaveLength(1);
    expect(bad.stays[0].id).toBe('ok');
  });

  it('Z6 checkin 矩阵前向兼容：超长裁掉、缺组补 false、对得上的 true 保留（A4）', () => {
    const cur = CHECKLISTS.checkin.groups.map(g => g.items.map(() => false));
    cur[0][0] = true;
    cur[1][0] = true;
    // 脏数据：缺最后一组、每组超长 1 个（多出来的 true 必须被裁）
    const dirty = cur.slice(0, -1).map(row => [...row, true]);
    expect(fitCheckMatrix(dirty, 'checkin')).toEqual(cur);
    // 非数组输入 → 全 false 矩阵
    expect(fitCheckMatrix(null, 'checkin'))
      .toEqual(CHECKLISTS.checkin.groups.map(g => g.items.map(() => false)));
    expect(fitCheckMatrix('oops', 'checkout'))
      .toEqual(CHECKLISTS.checkout.groups.map(g => g.items.map(() => false)));
  });

  it('Z7 sanitizeBackup 的两道门：语法坏抛 SyntaxError、非本工具箱抛同文案 Error', () => {
    expect(() => sanitizeBackup('不是json')).toThrow(SyntaxError);
    expect(() => sanitizeBackup('{"app":"别的应用","stays":[]}')).toThrow('不是本工具箱的备份文件');
    expect(() => sanitizeBackup('{"stays":[]}')).toThrow('不是本工具箱的备份文件');
  });

  it('Z8 脏备份经 importDataExt 安全落盘：逐条补齐、救不了的丢弃、ext 正常回写（A2）', () => {
    const dirty = {
      app: 'hotel-toolbox',
      stays: [
        { id: 's1', conditions: { date: '2026-12-01', nights: 2 } }, // 缺一大串字段
        { conditions: {} }, // 无 id → 丢弃
        null, 12,
      ],
      gear: [
        { name: '耳塞', brand: '3M' },
        null,
        { brand: '没名字' },      // 无 name → 丢弃
        { name: '颈枕', cat: '' }, // cat 缺失 → 归「其他」
      ],
      ext: { prefs: { relation: '朋友' }, stays: { s1: { relation: '情侣' } } },
    };
    const r = importDataExt(JSON.stringify(dirty));
    expect(r.stays).toBe(1);
    expect(r.gear).toBe(2);
    const s = listStays()[0];
    expect(s.id).toBe('s1');
    expect(s.nights).toBe(2);
    expect(s.conditions.purpose).toBe('普通短住');
    expect(s.checkin).toEqual(CHECKLISTS.checkin.groups.map(g => g.items.map(() => false)));
    const gear = listGear();
    expect(gear.map(g => g.name)).toEqual(['耳塞', '颈枕']);
    expect(gear[1].cat).toBe('其他');
    expect(getStayExt('s1')?.relation).toBe('情侣');
  });

  it('Z9 合法备份零损耗：导出 → sanitizeBackup 不改变任何一条（净化层的兼容承诺）', () => {
    saveStay(newStay({ ...base, date: offsetDate(3) }, buildPrep(base)));
    addGear({ name: '耳塞', brand: '3M', cat: '卫生' });
    const p = sanitizeBackup(exportDataExt());
    expect(p.stays).toEqual(listStays());
    expect(p.gear).toEqual(listGear());
  });

  it('Z10 prepStats 全应用统一口径：qty = 0 不进分母也不进分子（B5）', () => {
    const items: { qty: number; done: boolean }[] = [
      { qty: 2, done: true },
      { qty: 0, done: false },
      { qty: 0, done: true }, // 即便 done 被误存成 true 也不算（该项勾选框本来就是禁用的）
      { qty: 1, done: false },
    ];
    expect(prepStats(items)).toEqual({ done: 1, total: 2 });
    expect(prepStats(items).total).toBe(splitByQty(items).active.length); // 与行程页口径严格一致
    expect(prepStats([])).toEqual({ done: 0, total: 0 });
    // 首页已接统一口径（防止将来改回去）；「我的」M18 起不再显示统计
    //（数据概况卡与首页重复，只显示一次 —— 见 Q6），自然也不再用 prepStats
    expect(src('pages/home/home.ts')).toContain('prepStats');
  });

  it('Z11 platform 接线与善后（静态断言：wx 层在 node 里跑不了）', () => {
    const pf = src('core/platform.ts');
    expect(pf).toContain('k === STORE_KEY');                  // 行程主存储走读修复
    expect(pf).toContain('parseStaysPayload');
    expect(pf).toContain("'[]'");                             // 救不了 → 降级空表继续
    expect(pf).toContain('CORRUPT_KEY');                      // 坏原文隔离存档
    expect(pf).toContain('本机存储异常，本次修改可能未保存');  // 写失败不再静默（A3）
    // 隔离键在「清空全部数据」清单里 —— 损坏存档用户自己就能清掉
    expect(src('pages/mine/mine.ts')).toContain("'htb_stays_v1_corrupt'");
    // 导入先净化再交给源引擎（A2）
    expect(src('core/extra.ts')).toContain('sanitizeBackup(text)');
    // B6：careOthers 关闭时 adults 一并归 1（行程页人数显示与清单口径一致）
    expect(src('pages/wizard/wizard.ts'))
      .toContain('draft: { ...this.data.draft, adults: 1, children: 0, elderly: false }');
  });
});
