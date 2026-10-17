// 好物 —— 源实现 src/components/GearView.vue
// 物品名 + 品牌的个人收藏列表，按分类分组；添加时按物品名联想分类（300+ 关键词）。
//
// 与源实现的差异（平台导致）：
//   1. Teleport + fixed 弹窗 → 小程序本身就是全屏容器，遮罩用 fixed 即可（无层叠上下文问题）。
//   2. confirm() → 自绘 modal 组件（P0-6，替代 wx.showModal）。
//      R6：「恢复默认好物」按钮被老板要求删除，页面上已没有需要二次确认的操作，
//      modal 随之下线；core/engine 的 resetGear() 保留（测试仍覆盖，能力不删）。
//   3. autofocus → 小程序 input 用 focus 属性（弹窗打开时置 true）。
//   4. 键盘 Esc 关闭 → 小程序无键盘事件，点遮罩空白处关闭。
//   5. 猜不出分类时保持当前选择，绝不瞎猜（与源实现一致）。
//   6. R6：布局调整 —— 「添加好物」按钮从页面顶部挪到物品列表下面（老板要求）。

import { GEAR_CATS_EXT, guessGearCatExt } from '../../core/extra';
import { addGear, listGear, removeGear } from '../../core/engine';
import { syncTabBar } from '../../core/tabbar';

interface RowVM {
  name: string;
  brand: string;
  index: number;
}
interface GroupVM {
  cat: string;
  rows: RowVM[];
}
interface ChipVM {
  c: string;
  on: boolean;
  /** 联想命中：金色虚线，与用户手点的实线区分 */
  gu: boolean;
}

Page({
  data: {
    groups: [] as GroupVM[],
    total: 0,
    // 分类标签的三种状态在 JS 里算好再给模板：WXML 属性值里写不了 && 表达式
    catChips: [] as ChipVM[],

    open: false,
    newName: '',
    newBrand: '',
    addCat: GEAR_CATS_EXT[0],
    /** 联想命中的分类（虚线金色），与用户手点的实线区分 */
    guessed: false,
    /** 联想命中时的一次轻微缩放脉冲：两个动画名交替，保证每次命中都能重播 */
    pulseCls: '',
    err: '',
    focusName: false,
  },

  /** 用户是否手动点过分类标签：点过就以手动为准，联想不再覆盖 */
  catTouched: false,
  /** 脉冲动画交替计数：0/1 轮换，用于切换 animation-name 让动画重播 */
  pulseSeq: 0,

  onShow() {
    syncTabBar(this, 1);
    this.reload();
    this.syncChips();
  },

  syncChips() {
    this.setData({
      catChips: GEAR_CATS_EXT.map(c => ({
        c,
        on: this.data.addCat === c,
        gu: this.data.guessed && this.data.addCat === c,
      })),
    });
  },

  reload() {
    const entries = listGear();
    const byCat = new Map<string, RowVM[]>();
    entries.forEach((e, i) => {
      const list = byCat.get(e.cat) || [];
      list.push({ name: e.name, brand: e.brand || '', index: i });
      byCat.set(e.cat, list);
    });
    const groups: GroupVM[] = GEAR_CATS_EXT.filter(c => byCat.has(c)).map(cat => ({
      cat,
      rows: byCat.get(cat) || [],
    }));
    this.setData({ groups, total: entries.length });
  },

  openAdd() {
    this.catTouched = false;
    this.setData({
      open: true,
      newName: '',
      newBrand: '',
      addCat: GEAR_CATS_EXT[0],
      guessed: false,
      pulseCls: '',
      err: '',
      focusName: true,
    });
    this.syncChips();
  },

  closeAdd() {
    this.setData({ open: false, err: '', focusName: false });
  },

  /** 弹窗内部的点击占位：阻止冒泡到遮罩，避免点输入框就把弹窗关了 */
  noop() {},

  onName(e: WechatMiniprogram.CustomEvent) {
    const name = String(e.detail.value || '');
    // 用户手动点过标签后，后续改名不再覆盖他的选择（与源实现 onNameInput 一致）
    if (this.catTouched) {
      this.setData({ newName: name, err: '', pulseCls: '' });
      this.syncChips();
      return;
    }
    const g = guessGearCatExt(name);
    // 命中就换一次动画名（a/b 交替），否则同名动画不会重播
    const seq = g ? this.pulseSeq + 1 : this.pulseSeq;
    if (g) this.pulseSeq = seq;
    this.setData({
      newName: name,
      err: '',
      addCat: g || this.data.addCat,
      guessed: !!g,
      pulseCls: g ? (seq % 2 === 1 ? 'pulse-a' : 'pulse-b') : '',
    });
    this.syncChips();
  },

  onBrand(e: WechatMiniprogram.CustomEvent) {
    this.setData({ newBrand: String(e.detail.value || '') });
  },

  pickCat(e: WechatMiniprogram.TouchEvent) {
    const c = String(e.currentTarget.dataset.c || '');
    if (!c) return;
    this.catTouched = true;
    this.setData({ addCat: c, guessed: false, pulseCls: '' });
    this.syncChips();
  },

  save() {
    const name = String(this.data.newName || '').trim();
    if (!name) {
      this.setData({ err: '先填物品名称，比如「充电宝」' });
      return;
    }
    const brand = String(this.data.newBrand || '').trim();
    addGear({ name, brand: brand || undefined, cat: this.data.addCat });
    this.setData({ open: false, focusName: false });
    this.reload();
  },

  del(e: WechatMiniprogram.TouchEvent) {
    const i = Number(e.currentTarget.dataset.i);
    if (Number.isNaN(i)) return;
    removeGear(i);
    this.reload();
  },
});
