// 自定义确认弹窗（P0-6）——替代 wx.showModal，视觉与项目色调（米白 + 松绿 + 古铜金）一致。
//
// 为什么自绘：wx.showModal 是微信系统弹窗，与本项目色调割裂（R12）。
//
// 用法（父页面）：
//   <modal show="{{modal.show}}" title="..." content="..."
//          cancel-text="取消" confirm-text="删除" danger="{{true}}"
//          bind:confirm="onModalConfirm" bind:cancel="onModalCancel" />
//
// 注意：
//   1. 遮罩用 catchtouchmove="noop" 阻止背景滚动——noop 必须是**真实存在的空方法**（R3），
//      不能写 catchtouchmove="false"（部分真机不生效）。
//   2. z-index 1100 必须 > tabBar 的 1000，否则被悬浮胶囊导航压住（R11）。
//   3. 动画用 CSS @keyframes（节点随 wx:if 重建，挂载即播放），不用 wx.createAnimation。
Component({
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
    content: { type: String, value: '' },
    cancelText: { type: String, value: '取消' },
    confirmText: { type: String, value: '确定' },
    /** 危险操作：确认按钮走 --red 实底 */
    danger: { type: Boolean, value: false },
  },
  methods: {
    /** 供 catchtouchmove 绑定：阻止背景滚动 */
    noop() {},
    onCancel() {
      this.triggerEvent('cancel');
    },
    onConfirm() {
      this.triggerEvent('confirm');
    },
  },
});
