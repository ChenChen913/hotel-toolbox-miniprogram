// store.ts — 从 Web 版 store.ts 抽出的**纯逻辑**部分，函数体逐字保留。
//
// 源文件的 Vue 响应式状态（view / stage / currentStay / knowModule / knowReturnTo）
// 与导航函数（goHome / goWizard / openStay / persist …）都依赖 vue 的 ref 与 window，
// 小程序里没有这两个东西，也不允许引入 vue，因此这些职责改由页面层的 data + setData 承担
// （M3/M4 落地）。下面 3 个函数不含任何平台 API，原样搬过来即可在 node 测试里跑。
//
// ⚠️ 日期一律手动 split('-') 解析，禁止 new Date('YYYY-MM-DD')，否则 UTC 偏移会差一天。

import type { Stage, Stay } from './types';

/** 按日期推断当前阶段（聊02 定稿：系统自动把用户带到当前阶段） */
export function suggestedStage(s: Pick<Stay, 'date' | 'nights'>): Stage {
  if (!s.date) return 'prep';
  const [y, m, d] = s.date.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + s.nights - 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (today < start) return 'prep';
  if (today <= end) return 'checkin';
  return 'checkout';
}

/** 首页卡片上的阶段徽标文案（不在期内则不显示） */
export function stayPhaseLabel(s: Stay): string | null {
  if (!s.date) return null;
  const [y, m, d] = s.date.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + s.nights - 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (today < start) return `还有 ${Math.ceil((+start - +today) / 86400000)} 天入住`;
  if (today <= end) return '入住中';
  return null;
}

/** '2026-10-03' → '10月3日 · 周六'（手动解析避免 UTC 时区偏移） */
export function fmtDate(date: string): string {
  if (!date) return '未填日期';
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${m}月${d}日 · 周${'日一二三四五六'[dt.getDay()]}`;
}
