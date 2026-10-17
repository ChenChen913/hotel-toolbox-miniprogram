// 规则引擎自检（移植自 V1 test.js，断言不变）。运行：npm test
import { beforeEach, describe, expect, it } from 'vitest';
import { CAT_ORDER, CHECKLISTS, GEAR_CATS, GEAR_KEYWORDS, GEAR_TIE_BREAK, ITEMS, KNOWLEDGE, guessGearCat } from '../miniprogram/core/data';
import { addGear, buildPrep, ensureGuests, exportData, getStay, importData, listGear, listStays, migrateCategoryKeyGear, migrateItemKeyGear, newStay, removeGear, resetGear, saveStay, Storage, STORE_KEY } from '../miniprogram/core/engine';
import { suggestedStage } from '../miniprogram/core/store';
import type { Conditions, PrepItem } from '../miniprogram/core/types';

const base: Conditions = {
  date: '', nights: 3, adults: 2, children: 0, childAge: '0-3', elderly: false, pet: false,
  purpose: '旅游', prefs: { sleep: false, hygiene: false, mosquito: false, gadgets: false },
};
const get = (list: PrepItem[], part: string) => list.find(i => i.name.includes(part));

// 每个用例从干净存储开始，避免用例间互相污染（好物有 3 个版本键）
beforeEach(() => {
  ['htb_stays_v1', 'htb_gear_v3', 'htb_gear_v4', 'htb_gear_v5'].forEach(k => Storage.removeItem(k));
});

describe('规则引擎 buildPrep', () => {
  it('基础清单：证件必带、数量按人数、消耗品按晚冗余', () => {
    const p = buildPrep(base);
    expect(p.some(i => i.name.includes('身份证'))).toBe(true);
    expect(get(p, '拖鞋')!.qty).toBe(2);          // 每人一份 × 2 人
    expect(get(p, '马桶垫')!.qty).toBe(8);        // 2 × (3+1)
    expect(get(p, '充电器')!.qty).toBe(2);
    expect(get(p, '眼罩')).toBeUndefined();       // 未选睡眠敏感
    expect(get(p, '阻门器')).toBeDefined();       // 安全类默认推荐
    expect(p.every(i => i.qty >= 1)).toBe(true);
  });

  it('偏好开关触发对应物品', () => {
    const sleep = buildPrep({ ...base, prefs: { ...base.prefs, sleep: true } });
    expect(get(sleep, '眼罩')!.qty).toBe(2);
    expect(get(sleep, '耳塞')).toBeDefined();
    expect(get(buildPrep({ ...base, prefs: { ...base.prefs, mosquito: true } }), '驱蚊')).toBeDefined();
    expect(get(buildPrep({ ...base, prefs: { ...base.prefs, hygiene: true } }), '床单')).toBeDefined();
    expect(get(buildPrep({ ...base, prefs: { ...base.prefs, gadgets: true } }), '魔方')).toBeDefined();
  });

  it('儿童年龄段门控', () => {
    const baby = buildPrep({ ...base, children: 1, childAge: '0-3' });
    expect(get(baby, '纸尿裤')!.qty).toBe(4);     // 1 × (3+1)
    expect(get(baby, '婴儿湿巾')!.qty).toBe(1);
    expect(get(baby, '儿童牙刷')).toBeDefined();
    const kid = buildPrep({ ...base, children: 1, childAge: '7-12' });
    expect(get(kid, '纸尿裤')).toBeUndefined();
    expect(get(kid, '床围挡')).toBeUndefined();
    expect(get(kid, '儿童牙刷')).toBeDefined();
  });

  it('衣物按人数与天数生成', () => {
    const p = buildPrep(base);
    expect(get(p, '内衣裤')!.qty).toBe(8);   // 2 × (3+1)
    expect(get(p, '换洗上衣')!.qty).toBe(8); // 2 × min(3+1, 4)
    expect(get(p, '睡衣')!.qty).toBe(2);
    expect(get(p, '密封袋')).toBeDefined();
    const kids = buildPrep({ ...base, children: 1 });
    expect(get(kids, '儿童换洗衣物')!.qty).toBe(4);
  });

  it('老人与长住', () => {
    const old = buildPrep({ ...base, elderly: true });
    expect(get(old, '防滑拖鞋')).toBeDefined();
    expect(get(old, '常用药品')).toBeDefined();
    expect(get(buildPrep(base), '防滑拖鞋')).toBeUndefined();
    expect(get(buildPrep({ ...base, nights: 5 }), '洗衣片')).toBeDefined();
    expect(get(buildPrep({ ...base, nights: 3 }), '洗衣片')).toBeUndefined();
  });
});

describe('数据完整性', () => {
  it('ITEMS 56 条、id 无重复、分类可排序', () => {
    expect(ITEMS.length).toBe(56);
    const ids = ITEMS.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ITEMS.every(i => CAT_ORDER.includes(i.cat))).toBe(true);
  });
  it('检查清单项数与组级标注（规则表 §4）', () => {
    expect(CHECKLISTS.checkin.groups.reduce((n, g) => n + g.items.length, 0)).toBe(15);
    expect(CHECKLISTS.checkout.groups.reduce((n, g) => n + g.items.length, 0)).toBe(14);
    // 「60 秒」必须标注为工具箱自行添加的时间约束（核查纪律）
    const fire = CHECKLISTS.checkin.groups[0];
    expect(fire.note).toContain('不是官方术语');
    // 官方三项观察之三：应急物资必须出现
    expect(CHECKLISTS.checkin.groups[0].items.some(i => i.includes('呼吸面罩'))).toBe(true);
  });
  it('知识条目 44 条且都带来源/等级', () => {
    expect(KNOWLEDGE.length).toBe(44);
    expect(KNOWLEDGE.every(k => k.source && k.updated && k.evidence && k.risk)).toBe(true);
    expect(KNOWLEDGE[0].module).toBe('使用说明');
    expect(KNOWLEDGE[1].module).toBe('紧急联络');
  });
  it('正文不含方案 §7 禁用的绝对化用语（引用否定语境白名单除外）', () => {
    const banned = ['绝对不要', '坚决不用', '千万别', '无脑', '必用', '万能', '百分百', '根治', '神物', '硬核'];
    const allow = ['「一定有反光亮点」是错的', '「禁令」多属酒店住宿须知'];
    const violations: string[] = [];
    for (const k of KNOWLEDGE) {
      for (const line of k.body.split('\n')) {
        for (const w of banned) {
          if (line.includes(w) && !allow.some(a => line.includes(a))) violations.push(`${k.id}: ${line.slice(0, 40)}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
  it('臭虫判据不使用被核查否定的「黑色小点=粪便」表述', () => {
    const k6 = KNOWLEDGE.find(k => k.id === 'k6')!;
    expect(k6.body).not.toContain('黑色小点（粪便）');
    expect(k6.body).toContain('锈色血迹');
  });
  it('紧急话术条目都带可复制文本', () => {
    const urgent = KNOWLEDGE.filter(k => k.module === '紧急联络');
    expect(urgent.length).toBe(4);
    expect(urgent.every(k => (k.copy ?? '').length > 10)).toBe(true);
  });
});

describe('行程存取', () => {
  it('保存后可读回，打勾状态与分组一致', () => {
    const stay = newStay(base, buildPrep(base));
    saveStay(stay);
    expect(getStay(stay.id)!.prep.length).toBe(buildPrep(base).length);
    expect(getStay(stay.id)!.checkin.length).toBe(CHECKLISTS.checkin.groups.length);
    expect(listStays().length).toBeGreaterThan(0);
  });
  it('newStay 深拷贝入参（防响应式对象别名）', () => {
    const prep = buildPrep(base);
    const stay = newStay(base, prep);
    prep[0].done = true;
    expect(stay.prep[0].done).toBe(false);
  });
});

describe('好物收藏存储（物品名称 + 品牌，v5）', () => {
  const GEAR_KEY = 'htb_gear_v5';

  it('种子自带物品名称：只写品牌看不出这是什么', () => {
    Storage.setItem(GEAR_KEY, JSON.stringify([]));
    resetGear();
    const seed = listGear();
    expect(seed.length).toBeGreaterThan(0);
    expect(seed.every(g => g.name && g.cat)).toBe(true);
    expect(seed.find(g => g.brand === '安耳悠')!.name).toBe('耳塞');
  });
  it('addGear 追加并可读回；同一物品可记多个品牌；完全重复不重复添加', () => {
    Storage.setItem(GEAR_KEY, JSON.stringify([]));
    addGear({ name: '充电宝', brand: '小米', cat: '电子' });
    addGear({ name: '充电宝', brand: '罗马仕', cat: '电子' });
    addGear({ name: '充电宝', brand: '小米', cat: '电子' });
    const power = listGear('电子');
    expect(power.length).toBe(2);
    expect(power.map(g => g.brand)).toEqual(['小米', '罗马仕']);
    expect(power.every(g => g.name === '充电宝')).toBe(true);
  });
  it('品牌可空：只记物品不记品牌', () => {
    Storage.setItem(GEAR_KEY, JSON.stringify([]));
    addGear({ name: '拖鞋', cat: '洗漱' });
    expect(listGear('洗漱')[0]).toMatchObject({ name: '拖鞋', cat: '洗漱' });
    expect(listGear('洗漱')[0].brand).toBeUndefined();
  });
  it('removeGear 按下标删除（GearView 的实际用法）', () => {
    Storage.setItem(GEAR_KEY, JSON.stringify([]));
    addGear({ name: '耳塞', brand: 'A', cat: '睡眠' });
    addGear({ name: '耳塞', brand: 'B', cat: '睡眠' });
    removeGear(0);
    expect(listGear('睡眠').map(g => g.brand)).toEqual(['B']);
  });
  it('同一物品的每个品牌都各自成条、都带名称（不合并、不丢品牌）', () => {
    Storage.setItem(GEAR_KEY, JSON.stringify([]));
    addGear({ name: '充电宝', brand: '小米', cat: '电子' });
    addGear({ name: '充电宝', brand: '罗马仕', cat: '电子' });
    const rows = listGear('电子');
    expect(rows.map(g => `${g.name} · ${g.brand}`)).toEqual(['充电宝 · 小米', '充电宝 · 罗马仕']);
    expect(rows.every(g => g.name === '充电宝')).toBe(true);
  });
  it('listGear() 不带参数返回全部，带参数按分类过滤', () => {
    Storage.setItem(GEAR_KEY, JSON.stringify([]));
    addGear({ name: '耳塞', brand: 'A', cat: '睡眠' });
    addGear({ name: '充电宝', brand: 'B', cat: '电子' });
    expect(listGear().length).toBe(2);
    expect(listGear('睡眠').length).toBe(1);
    expect(listGear('安全')).toEqual([]);
  });
  it('v4 按类别存品牌 → 自动迁移为条目，品牌保留、名称回落为类别名', () => {
    Storage.removeItem(GEAR_KEY);
    Storage.setItem('htb_gear_v4', JSON.stringify({ 睡眠: ['安耳悠'], 电子: ['摩米士'] }));
    const migrated = listGear();
    expect(migrated).toEqual([
      { name: '睡眠', brand: '安耳悠', cat: '睡眠' },
      { name: '电子', brand: '摩米士', cat: '电子' },
    ]);
    // 迁移结果已落盘：v4 键不再参与后续读取
    expect(JSON.parse(Storage.getItem(GEAR_KEY)!)).toEqual(migrated);
  });
  it('v3 按物品 id 的旧数据经 v4 中转迁移（物品归入其分类）', () => {
    Storage.removeItem(GEAR_KEY);
    Storage.removeItem('htb_gear_v4');
    Storage.setItem('htb_gear_v3', JSON.stringify({ towel: ['全棉时代'], unknown_gadget: ['某品牌'] }));
    const migrated = listGear();
    expect(migrated.find(g => g.brand === '全棉时代')!.cat).toBe('洗漱');
    expect(migrated.find(g => g.brand === '某品牌')!.cat).toBe('其他');
  });
  it('migrateCategoryKeyGear：一个类别下多个品牌展开为多条', () => {
    expect(migrateCategoryKeyGear({ 电子: ['A', 'B'] })).toEqual([
      { name: '电子', brand: 'A', cat: '电子' },
      { name: '电子', brand: 'B', cat: '电子' },
    ]);
    expect(migrateCategoryKeyGear({})).toEqual([]);
  });
  it('存储损坏（非数组）时不抛错，回落种子', () => {
    Storage.setItem(GEAR_KEY, '{"电子":["小米"]}');
    expect(listGear().length).toBeGreaterThan(0);
    expect(listGear()[0].name).toBeTruthy();
  });
});


describe('按日期自动定位阶段', () => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const dstr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  it('未开始→准备；进行中→入住；已结束→退房；无日期→准备', () => {
    const mk = (date: string, nights: number): Conditions => ({ ...base, date, nights });
    expect(suggestedStage(mk('2999-01-01', 3))).toBe('prep');
    const today = new Date();
    expect(suggestedStage(mk(dstr(today), 3))).toBe('checkin');
    expect(suggestedStage(mk(dstr(today), 1))).toBe('checkin');
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    expect(suggestedStage(mk(dstr(yesterday), 1))).toBe('checkout');
    expect(suggestedStage({ ...mk('', 3), date: '' })).toBe('prep');
  });
});


describe('Guest 轻量模型', () => {
  it('newStay 按条件生成入住人（成人/儿童/老人）', () => {
    const s = newStay({ ...base, adults: 2, children: 1, childAge: '0-3', elderly: true }, []);
    expect(s.guests.length).toBe(4);
    expect(s.guests[0]).toMatchObject({ kind: 'adult', label: '入住人1' });
    expect(s.guests[2]).toMatchObject({ kind: 'child', label: '儿童', childAge: '0-3' });
    expect(s.guests[3].kind).toBe('elderly');
  });
  it('多个儿童时标签带序号', () => {
    const s = newStay({ ...base, children: 2 }, []);
    expect(s.guests.filter(g => g.kind === 'child').map(g => g.label)).toEqual(['儿童1', '儿童2']);
  });
  it('旧数据（无 guests）保存后读入时自动迁移', () => {
    const legacy = JSON.parse(JSON.stringify(newStay(base, buildPrep(base))));
    delete legacy.guests;
    legacy.id = 'legacy_stay_1';
    Storage.setItem(STORE_KEY, JSON.stringify([legacy]));
    expect(getStay('legacy_stay_1')!.guests.length).toBe(base.adults);
  });
});

describe('真实人数（3人及以上不再压缩为 3）', () => {
  it('4 个成人 → 每人份物品按 4 份', () => {
    const p = buildPrep({ ...base, adults: 4 });
    expect(p.find(i => i.name === '身份证')!.qty).toBe(4);
    expect(p.find(i => i.name === '拖鞋')!.qty).toBe(4);
  });
});

describe('好物分类联想（按物品名称猜分类）', () => {
  it('每个分类都有足够多的关键词，且不重复', () => {
    const cats = CAT_ORDER.filter(c => c !== '自定义');
    for (const c of cats) {
      expect(GEAR_KEYWORDS[c], `缺分类 ${c}`).toBeDefined();
      expect(GEAR_KEYWORDS[c].length, `${c} 关键词太少`).toBeGreaterThanOrEqual(10);
      expect(new Set(GEAR_KEYWORDS[c]).size, `${c} 有重复关键词`).toBe(GEAR_KEYWORDS[c].length);
    }
    // 覆盖度：关键词总数（覆盖面够宽才能猜得准）
    const all = cats.flatMap(c => GEAR_KEYWORDS[c]);
    expect(all.length).toBeGreaterThanOrEqual(300);
  });
  it('取舍顺序表与关键词表一一对应（不漏分类、不写了不存在的分类）', () => {
    const cats = CAT_ORDER.filter(c => c !== '自定义');
    expect([...GEAR_TIE_BREAK].sort()).toEqual([...cats].sort());
  });
  it('常见物品都能猜对分类', () => {
    const table: [string, string][] = [
      ['充电宝', '电子'], ['数据线', '电子'], ['氮化镓充电器', '电子'], ['蓝牙耳机', '电子'],
      ['相机电池', '电子'], ['iPad', '电子'], ['移动电源', '电子'], ['多功能插座', '电子'],
      ['牙刷', '洗漱'], ['压缩毛巾', '洗漱'], ['折叠拖鞋', '洗漱'], ['分装瓶', '洗漱'],
      ['速干浴巾', '洗漱'], ['剃须刀', '洗漱'], ['卸妆棉', '洗漱'], ['便携餐具', '洗漱'],
      ['内衣裤', '衣物'], ['袜子', '衣物'], ['换洗上衣', '衣物'], ['羽绒外套', '衣物'],
      ['泳衣', '衣物'], ['腰带', '衣物'], ['脏衣袋', '衣物'], ['折叠衣架', '衣物'],
      ['行李箱', '出行'], ['双肩背包', '出行'], ['折叠伞', '出行'], ['颈枕', '出行'],
      ['湿巾', '卫生'], ['一次性马桶垫', '卫生'], ['酒精喷雾', '卫生'], ['一次性床单', '卫生'],
      ['隔离贴膜', '卫生'], ['粘毛器', '卫生'],
      ['耳塞', '睡眠'], ['眼罩', '睡眠'], ['蒸汽眼罩', '睡眠'], ['遮光窗帘', '睡眠'],
      ['驱蚊液', '驱蚊'], ['花露水', '驱蚊'], ['电蚊香', '驱蚊'], ['清凉油', '驱蚊'],
      ['阻门器', '安全'], ['小型手电筒', '安全'], ['门锁报警器', '安全'], ['口哨', '安全'],
      ['老人拐杖', '适老'], ['防滑拖鞋', '适老'], ['电子血压计', '适老'], ['感应小夜灯', '适老'],
      ['儿童牙刷', '儿童'], ['婴儿湿巾', '儿童'], ['纸尿裤', '儿童'], ['奶粉', '儿童'],
      ['常用药品', '健康'], ['创可贴', '健康'], ['晕车药', '健康'], ['医用口罩', '健康'],
      ['洗衣片', '长住'], ['便携洗衣液', '长住'], ['熨斗', '长住'],
      ['大桶矿泉水', '补给'], ['瓶装水', '补给'], ['泡面', '补给'], ['零食', '补给'],
    ];
    for (const [name, cat] of table) {
      expect(guessGearCat(name), `「${name}」应猜为 ${cat}`).toBe(cat);
    }
  });
  it('更具体的分类优先：「儿童拖鞋」是儿童，不是洗漱', () => {
    expect(guessGearCat('儿童拖鞋')).toBe('儿童');
    expect(guessGearCat('防滑拖鞋')).toBe('适老');
    expect(guessGearCat('拖鞋')).toBe('洗漱');
  });
  it('两代人都用的物品按儿童优先（适老可手动改）', () => {
    expect(guessGearCat('纸尿裤')).toBe('儿童');
    expect(guessGearCat('成人纸尿裤')).toBe('适老');
    expect(guessGearCat('护理垫')).toBe('适老');
  });
  it('猜不出来返回 null（由用户自己选，不能瞎猜）', () => {
    for (const n of ['', '   ', '神秘小物', 'aaa', '这个东西']) {
      expect(guessGearCat(n)).toBeNull();
    }
  });
  it('大小写与空白不影响匹配', () => {
    expect(guessGearCat('  ipad  ')).toBe('电子');
    expect(guessGearCat('T恤')).toBe('衣物');
    expect(guessGearCat('t恤')).toBe('衣物');
  });
  it('联想结果一定是合法分类（不会返回「自定义」）', () => {
    for (const c of Object.keys(GEAR_KEYWORDS)) {
      expect(GEAR_CATS).toContain(c);
      expect(c).not.toBe('自定义');
    }
  });
});

describe('数据备份', () => {
  it('导出再导入，行程与好物一致', () => {
    saveStay(newStay(base, buildPrep(base)));
    const json = exportData();
    const parsed = JSON.parse(json);
    expect(parsed.app).toBe('hotel-toolbox');
    const r = importData(json);
    expect(r.stays).toBe(listStays().length);
    expect(r.gear).toBe(listGear().length);
    expect(() => importData('{"app":"other"}')).toThrow();
  });
  it('导入旧版备份（gear 是「类别 → 品牌」对象）也能读入', () => {
    const legacy = JSON.stringify({
      app: 'hotel-toolbox',
      exportedAt: '2026-01-01T00:00:00.000Z',
      stays: [],
      gear: { 睡眠: ['安耳悠'] },
    });
    expect(importData(legacy).gear).toBe(1);
    expect(listGear()[0]).toMatchObject({ name: '睡眠', brand: '安耳悠', cat: '睡眠' });
  });
});
