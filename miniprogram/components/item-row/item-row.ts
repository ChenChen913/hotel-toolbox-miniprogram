// ItemRow —— 物品行（源实现 src/components/ItemRow.vue）
// 勾选框 + 名称/元信息 + 使用人下拉 + 好物入口 + 步进器。
// M19：行尾删除按钮退役 —— stepper 减到 0 已等效删除（收进「已设为不带」可反悔）。
//
// 与源实现的两处平台差异：
//   1. <select> → 小程序原生 picker（下拉弹层由系统提供，无需自绘）。
//   2. 好物面板由本组件内嵌渲染（源实现同款结构），并通过 gear-count 变化通知父级。
//
// 关于 qty === 0：源实现是「留在列表里灰显 + 打「不带」标签 + 禁用勾选」。
// 小程序版按老板要求改了口径 —— qty=0 的项由父级（行程页 / 向导预览）**直接不渲染**，
// 收进底部的「已设为不带」区域里可恢复。所以下面 item.qty === 0 的分支现在不会走到，
// 保留它只是为了万一有别的调用方按源口径传进来时不会渲染错。

import { listGear } from '../../core/engine';
import type { PrepItem } from '../../core/types';

const TAG_CLS: Record<string, string> = {
  必带: 'need',
  建议购买: 'buy',
  到店购买: 'shop',
  家里带: 'home',
  推荐: 'rec',
  可选: 'opt',
  自定义: 'src',
};

/**
 * M18 标签审核（老板点名）：「家里带 / 建议购买 / 到店购买」是对用户
 * 「从哪拿、要不要买」的臆测 —— 不知道的就不要标。数据层一字不动（红线），
 * 只在渲染层不显示。保留的四类都有事实依据：
 * 必带（优先级）/ 推荐（引擎判定）/ 可选（开关降级）/ 自定义（用户自己加的）。
 */
const HIDE_PREP = new Set(['家里带', '建议购买', '到店购买']);

Component({
  properties: {
    item: { type: Object, value: {} },
    editable: { type: Boolean, value: true },
    /** 在父级列表中的下标：事件回传时带上，省得父级依赖 dataset 取索引 */
    idx: { type: Number, value: -1 },
    /**
     * 稳定键：'p3' = prep[3]，'c1' = custom[1]。
     * 行程页的清单由 prep + custom 合并后按分类排序，下标在排序后不再等于原数组下标，
     * 也无法像源实现那样用对象引用比较（小程序 setData 传的是拷贝），故改用稳定键定位。
     */
    ikey: { type: String, value: '' },
    /** 使用人可选项（如 ['全体','入住人1','儿童']）；为空则不显示下拉 */
    opts: { type: Array, value: [] as string[] },
  },

  data: {
    tagCls: 'opt',
    /** M18：臆测类 prep（家里带/建议购买/到店购买）不在行内显示，见 HIDE_PREP */
    showPrepTag: true,
    /** 使用人下拉的当前下标（picker 只认下标，assign 存的是文案） */
    assignIdx: 0,
    /** 已记录的这一件好物条数 */
    gearCount: 0,
    /** 入口按钮文案：有记录显示「好物 N」，没有显示「记好物」（模板里不做三元拼接） */
    gearLabel: '记好物',
    showGear: false,
    /** 使用人下拉是否显示（opts 非空且可编辑时为 true） */
    showAssign: false,
    /** 只有来自 ITEMS 的物品才有 itemId，自定义物品不显示好物入口 */
    hasGear: false,
  },

  observers: {
    'item.prep': function (prep: string) {
      this.setData({ tagCls: TAG_CLS[prep] || 'opt', showPrepTag: !HIDE_PREP.has(prep) });
    },
    'item.name, item.cat': function () {
      this.syncGear();
    },
    'item.assign, opts, editable': function () {
      this.syncAssign();
    },
  },

  methods: {
    /** R5-2：空方法。catchtap 必须指向真实存在的方法（部分真机不认 catchtap="false"），
        挂在步进器 / picker 上拦住冒泡到整行的 tap —— 点它们不该切换勾选 */
    noop() {
      /* 只吃事件，不做任何事 */
    },

    /** idx 与 ikey 一并回传，父级按自己用哪种定位方式取用 */
    payload(extra?: Record<string, unknown>) {
      return { idx: this.data.idx, ikey: this.data.ikey, ...(extra || {}) };
    },

    /**
     * 重算好物条数。列表全量重渲时每一行都会触发一次 observer，
     * 若不做缓存，勾选一项就会导致 60 行各读一次 Storage，故用 name+cat 做脏检查。
     */
    syncGear(force = false) {
      const it = this.data.item as PrepItem;
      // 源实现：v-if="props.item.itemId" —— 自定义物品不提供好物入口。
      // M18（老板点名）：证件类（手机 / 钱包 / 现金等）整类豁免 —— 这些东西
      // 早就买好了、入住时只求快拿快走，行内不再出现「记好物」入口。
      const hasGear = !!it.itemId && it.cat !== '证件';
      if (!hasGear) {
        this.setData({ hasGear: false, gearCount: 0, showGear: false });
        return;
      }
      const self = this as unknown as { _gearKey: string };
      const key = `${it.cat}|${it.name}`;
      if (!force && self._gearKey === key) return;
      self._gearKey = key;
      const n = listGear(it.cat).filter(g => g.name === it.name).length;
      this.setData({
        hasGear: true,
        gearCount: n,
        // M18：面板里记的是「你用过的品牌」，没有记录时引导语从购物腔
        // 改为记录腔（记录你用哪款），语义与功能对齐。
        gearLabel: n > 0 ? `好物 ${n}` : '记好物',
      });
    },

    syncAssign() {
      const it = this.data.item as PrepItem;
      const opts = (this.data.opts || []) as string[];
      // WXML 属性里不能写裸 && ，故「opts 非空 && editable」在 JS 里算成一个布尔
      const showAssign = opts.length > 0 && this.data.editable;
      if (!showAssign) {
        this.setData({ showAssign: false, assignIdx: 0 });
        return;
      }
      // 源实现：:value="props.item.assign ?? assignOptions[0]"
      const i = opts.indexOf(it.assign ?? opts[0]);
      this.setData({ showAssign: true, assignIdx: i < 0 ? 0 : i });
    },

    onToggle() {
      const item = this.data.item as PrepItem;
      // qty === 0 时勾选框禁用（与源实现 :disabled 一致）
      if (item.qty === 0) return;
      this.triggerEvent('toggle', this.payload({ value: !item.done }));
    },

    onQty(e: WechatMiniprogram.CustomEvent) {
      this.triggerEvent('qty', this.payload({ value: e.detail }));
    },

    onAssign(e: WechatMiniprogram.CustomEvent) {
      const opts = (this.data.opts || []) as string[];
      const i = Number(e.detail.value);
      if (i < 0 || i >= opts.length) return;
      this.setData({ assignIdx: i });
      this.triggerEvent('assign', this.payload({ value: opts[i] }));
    },

    toggleGear() {
      this.setData({ showGear: !this.data.showGear });
    },

    onGearChange() {
      this.syncGear(true);
      this.triggerEvent('gearchange', this.payload());
    },
  },
});
