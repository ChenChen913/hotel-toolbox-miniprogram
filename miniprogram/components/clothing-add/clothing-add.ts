// ClothingAdd —— 分类类型下拉（源实现 src/components/ClothingAdd.vue）
//
// ⚠️ R5-6 起本组件已**泛化**：不再只服务「衣物」，化妆品面板共用同一套逻辑。
//    名字保留 clothing-add（改名要动 8 处，收益不大），看到名字请想到「分类类型下拉」。
//    可选类型 / 落点分类 / 输入提示都由调用方通过属性传入：
//      · types       面板里的预设类型（衣物的默认表留在本文件，化妆品的在 core/extra.ts）
//      · cat         新增项落到哪个分类（调用方在 add 事件里自己取，组件只回传名称）
//      · placeholder 输入框提示（衣物「防晒衣」，化妆品「面膜」）
//      · trigger     触发条占位文案（M18：衣物「选择衣物类型…」/ 化妆品「选择化妆品类型…」，
//                    之前硬编码成衣物的文案，化妆品面板也跟着显示「衣物类型」—— 老板真机抓到）
//
// M18 选完即复位：之前选中「外套」后触发条一直显示「外套」，看起来像还要再选一次；
//      实际选中的衣物已按固定格式列在下方，触发条应回到占位文案等待下一次选择。
//      因此 chosen 属性整个退役（没有调用方传它，选完也不再保留）。
// 源实现用 Teleport to="body" + position: fixed 让面板浮在卡片之上、不挤压下方物品行。
// 小程序没有 Teleport，但页面根节点本身就是最外层，故改写为：
//   1. createSelectorQuery 测量触发条的位置（异步，需在回调里再 setData）；
//   2. 面板 position: fixed，按测量结果定位；下方空间不够时改为向上弹；
//      （R5-7：面板必须放在 <root-portal> 里，见 wxml 内注释 —— .glass 的
//        backdrop-filter 会把 fixed 的包含块换成卡片本身，直接量视口定位必错位）
//   3. 遮罩层 catchtouchmove 阻止穿透滚动，点遮罩关闭；
//   4. 页面滚动时由页面调用 close()（fixed 面板不跟手，滚动即关闭比错位更可控）。
const TYPES = ['贴身衣物', '短袖', '长袖', '外套', '裤子', '裙子', '睡衣', '泳衣', '运动装备', '鞋'];

/** 面板估算最大高度（px），用于判断该向下弹还是向上弹 */
const PANEL_H = 320;

Component({
  properties: {
    /** 面板里的预设类型列表（R5-6：由调用方传入；不传时回落到衣物默认表） */
    types: { type: Array, value: TYPES },
    /** 新增项要落到哪个分类（R5-6）。组件本身不用它，只是约定调用方在标签上写 data-cat 供事件路由 */
    cat: { type: String, value: '' },
    /** 输入框的 placeholder（R5-6） */
    placeholder: { type: String, value: '输入衣物名称，如：防晒衣' },
    /** 触发条占位文案（M18）：衣物 / 化妆品各自传入，不再共用「衣物类型」 */
    trigger: { type: String, value: '选择类型…' },
  },

  data: {
    open: false,
    customName: '',
    /** R6：点「自定义」后聚焦输入行（输入行常驻面板底部，始终可见） */
    focusInput: false,
    /** 定位结果（px） */
    panelTop: -1,
    panelLeft: 0,
    panelWidth: 0,
    /** 向上弹时的定位：bottom 距视口底部 */
    panelBottom: -1,
  },

  methods: {
    onToggle() {
      if (this.data.open) {
        this.setData({ open: false, focusInput: false });
        return;
      }
      this.place();
    },

    /**
     * R6：点列表末尾的「自定义」—— 不关闭面板，聚焦底部输入行。
     * 老板的用法：类型列表里没有想要的东西 → 滑到「自定义」→ 点它 → 输入名称 → 添加。
     */
    onPickCustom() {
      this.setData({ focusInput: true });
    },

    /** 测量触发条位置后打开面板（05 §6.2） */
    place() {
      const q = this.createSelectorQuery();
      q.select('.ctrigger').boundingClientRect();
      q.exec((res: unknown) => {
        const arr = res as Array<{ top: number; bottom: number; left: number; width: number } | null>;
        const r = arr && arr[0];
        if (!r) {
          // 测量失败就退回内联展开，至少功能可用
          this.setData({ open: true, panelTop: -1, panelBottom: -1, focusInput: false });
          return;
        }
        let winH = 0;
        try {
          winH = wx.getSystemInfoSync().windowHeight;
        } catch {
          winH = 0;
        }
        const roomBelow = winH ? winH - r.bottom : PANEL_H + 1;
        if (roomBelow >= PANEL_H || !winH) {
          this.setData({
            open: true,
            panelTop: r.bottom + 8,
            panelLeft: r.left,
            panelWidth: r.width,
            panelBottom: -1,
            focusInput: false,
          });
        } else {
          this.setData({
            open: true,
            panelTop: -1,
            panelLeft: r.left,
            panelWidth: r.width,
            panelBottom: winH - r.top + 8,
            focusInput: false,
          });
        }
      });
    },

    /** 供页面 onPageScroll 调用：滚动即关闭，避免面板与触发条错位 */
    close() {
      if (!this.data.open) return;
      this.setData({ open: false, focusInput: false });
    },

    noop() {
      /* 遮罩内层：拦截冒泡，点面板本身不关闭 */
    },

    onPick(e: WechatMiniprogram.TouchEvent) {
      const t = String(e.currentTarget.dataset.t || '');
      if (!t) return;
      this.triggerEvent('add', t);
      // M18：不保留已选类型 —— 选中的物品已列在下方，触发条回到占位文案
      this.setData({ open: false, focusInput: false });
    },

    onInput(e: WechatMiniprogram.CustomEvent) {
      this.setData({ customName: e.detail.value });
    },

    onAddCustom() {
      const n = String(this.data.customName || '').trim();
      if (!n) return;
      this.triggerEvent('add', n);
      this.setData({ customName: '', open: false, focusInput: false });
    },
  },
});
