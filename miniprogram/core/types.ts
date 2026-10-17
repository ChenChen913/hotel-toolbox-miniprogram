// 核心类型。存储结构与 V1 完全一致（localStorage key: htb_stays_v1），旧数据可直接读取。
export type ChildAge = '0-3' | '4-6' | '7-12' | '13+';
export type Purpose = '普通短住' | '出差' | '旅游' | '探亲';
export type Stage = 'prep' | 'checkin' | 'checkout';

export interface Prefs {
  sleep: boolean;      // 睡眠敏感
  hygiene: boolean;    // 在意卫生
  mosquito: boolean;   // 蚊虫季节
  gadgets: boolean;    // 电子设备多
}

export interface Conditions {
  date: string;
  nights: number;
  adults: number;
  children: number;
  childAge: ChildAge;
  elderly: boolean;
  pet: boolean;
  purpose: Purpose;
  prefs: Prefs;
}

export type Prep = '必带' | '推荐' | '建议购买' | '家里带' | '可选' | '到店购买';
export type Users = 'adult' | 'child' | 'shared';

export interface ItemDef {
  id: string;
  name: string;
  cat: string;
  users: Users;
  prep: Prep;
  unit: string;
  /** 自定义数量函数（消耗品按晚冗余）；缺省 = 按使用人数 */
  qty?: (c: Conditions) => number;
  when: (c: Conditions) => boolean;
  /** 作者好物收藏（⚪ 个人偏好，非商业推荐） */
  gear?: { name: string; note: string }[];
}

export interface PrepItem {
  itemId?: string;
  name: string;
  cat: string;
  unit: string;
  prep: string;
  source: '必备' | '推荐' | '自定义';
  users: string;
  qty: number;
  done: boolean;
  /** 使用人绑定（聊04：全体 / 入住人1… / 儿童） */
  assign?: string;
}

export interface Guest {
  id: string;
  kind: 'adult' | 'child' | 'elderly';
  label: string;
  childAge?: ChildAge;
}

export type RiskLevel = 'high' | 'mid' | 'low';

export interface CheckGroup {
  name: string;
  risk: RiskLevel;
  /** 组级说明（如「60 秒为时间约束，非官方术语」） */
  note?: string;
  /** 对应知识库模块名，检查组标题旁出「知识详解」链接 */
  link?: string;
  items: string[];
}

export interface Checklist {
  title: string;
  groups: CheckGroup[];
}

export type Evidence = 'law' | 'official' | 'pro' | 'experience';

export interface KnowledgeEntry {
  id: string;
  module: string;
  title: string;
  evidence: Evidence;
  risk: RiskLevel;
  body: string;
  source: string;
  updated: string;
  /** 紧急话术等可一键复制的内容 */
  copy?: string;
  /** 法规时效性强条目的建议复核时间（YYYY-MM），到期在知识库提示 */
  reviewBy?: string;
}

export interface CustomHint {
  icon: string; // lucide 图标名（kebab-case）
  text: string;
}

/** 好物收藏：一条 = 一个具体物品 + 可选品牌（展示为「物品名称 + 品牌」） */
export interface GearEntry {
  name: string;   // 物品名称，如「充电宝」
  brand?: string; // 品牌，可空（只记物品不记品牌）
  cat: string;    // 分类，取自 CAT_ORDER，用于分组展示
}

export interface Stay {
  id: string;
  guests: Guest[];
  createdAt: string;
  date: string;
  nights: number;
  conditions: Conditions;
  prep: PrepItem[];
  custom: PrepItem[];
  checkin: boolean[][];
  checkout: boolean[][];
}
