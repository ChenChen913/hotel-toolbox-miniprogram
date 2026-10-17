// 首页 —— 源实现 src/components/HomeView.vue
// 刊头 / 空状态 / 统计条 / 行程列表。
//
// 与源实现的差异（仅平台导致的）：
//   1. 「本机浏览器」→「本机」：小程序里没有浏览器（已与用户确认，见 PROGRESS.md 决策 3）。
//   2. 备份与恢复搬到「我的」页（E1）：原先藏在首页最底部的折叠块里，发现率太低，
//      而隐私/协议类内容必须有一个稳定入口，故统一收拢到「我的」。
//
// 扩展层（core/extra.ts）的接入点：行程卡的关系标签、复制上次、清单排序。

import { newStay, saveStay, listStays } from '../../core/engine';
import { buildPrepExt, getStayExt, prepStats, setStayExt, sortItemsExt } from '../../core/extra';
import type { Stay } from '../../core/types';
import { fmtDate, stayPhaseLabel } from '../../core/store';
import { syncTabBar } from '../../core/tabbar';

interface StayVM {
  id: string;
  no: string;
  dateLabel: string;
  nights: number;
  meta: string;
  done: number;
  total: number;
  pct: number;
  phase: string;
}

function toVM(s: Stay, idx: number): StayVM {
  // 走扩展层的排序：源 sortItems 用 CAT_ORDER，遇到「娱乐 / 学习」会得到 -1 排到最前
  const items = sortItemsExt([...s.prep, ...s.custom]);
  // 进度口径与行程页 splitByQty 一致（prepStats）：qty = 0 的项不算「已备齐」分母
  const { done, total } = prepStats(items);
  const metaParts: string[] = [s.conditions.purpose];
  // 住宿关系存在扩展层；默认值「家人」不显示（省得每张卡都挂一个没信息量的词）
  const ext = getStayExt(s.id);
  if (ext && ext.relation !== '家人') metaParts.push(ext.relation);
  if (s.conditions.children) metaParts.push(`${s.conditions.children} 个儿童`);
  if (s.conditions.elderly) metaParts.push('有老人');
  return {
    id: s.id,
    no: String(idx + 1).padStart(2, '0'),
    dateLabel: fmtDate(s.date),
    nights: s.nights,
    meta: metaParts.join(' · '),
    done,
    total,
    pct: total ? Math.round((done * 100) / total) : 0,
    phase: stayPhaseLabel(s) || '',
  };
}

Page({
  data: {
    stays: [] as StayVM[],
    hasStays: false,
    totalNights: 0,
    avgPacked: 0,
  },

  onShow() {
    syncTabBar(this, 0);
    this.reload();
  },

  reload() {
    const stays = [...listStays()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    // 统计条的平均备齐率与单卡进度同一口径（prepStats，qty = 0 不进分母）
    const { done, total } = prepStats(stays.flatMap(s => [...s.prep, ...s.custom]));
    this.setData({
      stays: stays.map(toVM),
      hasStays: stays.length > 0,
      totalNights: stays.reduce((n, s) => n + s.nights, 0),
      avgPacked: total ? Math.round((done * 100) / total) : 0,
    });
  },

  goWizard() {
    wx.navigateTo({ url: '/pages/wizard/wizard' });
  },

  openStay(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id || '');
    if (!id) return;
    wx.navigateTo({ url: `/pages/stay/stay?id=${id}` });
  },

  /** 复制上次：用第一条行程的 conditions 重新生成清单，custom 深拷贝后全部重置为未勾选 */
  copyLast() {
    const last = [...listStays()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!last) return;
    // 带上扩展层维度（住宿关系 / 培训学习）：否则「复制上次」会悄悄丢掉棋牌、学习资料这些物品，
    // 而用户的预期是「照上次再来一次」。
    const ext = getStayExt(last.id);
    const s = newStay(last.conditions, buildPrepExt({ ...last.conditions, ...(ext || {}) }));
    s.custom = JSON.parse(JSON.stringify(last.custom)) as typeof s.custom;
    s.custom.forEach(i => {
      i.done = false;
    });
    saveStay(s);
    if (ext) setStayExt(s.id, ext);
    wx.navigateTo({ url: `/pages/stay/stay?id=${s.id}` });
  },
});
