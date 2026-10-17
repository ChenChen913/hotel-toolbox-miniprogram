// GearPanel —— 只展示「这一件物品」的好物收藏（源实现 src/components/GearPanel.vue）
// 耳塞行里出现充电宝的品牌没有意义，故按 name + cat 双重过滤。
//
// ⚠️ 与源实现的不同（修了一处下标错位）：
//   源实现 rows = listGear(cat).map((entry, index) => ({ entry, index }))，
//   index 是「按 cat 过滤后」的下标，但 removeGear(index) 是在「完整列表」上 splice。
//   当 cat 不是第一个分类时下标会错位，删到别的条目上。
//   这里改成在完整列表上定位下标（name + cat 双条件），删除一定命中自己那一条。
//   （源项目未改动，仅在此记录。）

import { addGear, listGear, removeGear } from '../../core/engine';
import type { GearEntry } from '../../core/types';

interface RowVM {
  index: number; // 完整列表中的真实下标
  name: string;
  brand: string;
}

Component({
  properties: {
    /** 物品名（如「耳塞」） */
    name: { type: String, value: '' },
    /** 物品分类（如「洗漱」），与 name 一起定位 */
    cat: { type: String, value: '' },
  },

  data: {
    rows: [] as RowVM[],
    adding: false,
    newBrand: '',
    focusBrand: false,
  },

  observers: {
    'name, cat': function () {
      this.refresh(false);
    },
  },

  methods: {
    /** 吃掉冒泡：面板内部点击不应触发父级的勾选/展开 */
    noop() {},

    /** 重新定位当前物品的好物行 */
    refresh(emit = true) {
      const name = this.data.name;
      const cat = this.data.cat;
      const rows: RowVM[] = listGear()
        .map((entry: GearEntry, index: number) => ({ entry, index }))
        .filter(r => r.entry.name === name && r.entry.cat === cat)
        .map(r => ({ index: r.index, name: r.entry.name, brand: r.entry.brand || '' }));
      this.setData({ rows });
      if (emit) this.triggerEvent('change');
    },

    toggleAdd() {
      this.setData({ adding: !this.data.adding, focusBrand: !this.data.adding });
    },

    cancelAdd() {
      this.setData({ adding: false, newBrand: '', focusBrand: false });
    },

    onBrand(e: WechatMiniprogram.CustomEvent) {
      this.setData({ newBrand: String(e.detail.value || '') });
    },

    add() {
      const brand = String(this.data.newBrand || '').trim();
      addGear({ name: this.data.name, brand: brand || undefined, cat: this.data.cat });
      this.setData({ adding: false, newBrand: '', focusBrand: false });
      this.refresh();
    },

    remove(e: WechatMiniprogram.TouchEvent) {
      const i = Number(e.currentTarget.dataset.i);
      if (Number.isNaN(i) || i < 0) return;
      removeGear(i);
      this.refresh();
    },
  },
});
