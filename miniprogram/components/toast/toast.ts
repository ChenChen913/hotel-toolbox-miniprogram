// 小浮窗（R4-4）—— 数量归零时的轻提示。
//
// 为什么自绘而不是 wx.showToast：
//   1. wx.showToast 是系统样式（黑色半透明胶囊），与本项目的米白 + 松绿色调割裂；
//   2. 它的位置固定在屏幕中下部，会压住我们自己的固定底栏。
//
// 用法（父页面）：
//   <toast show="{{toastShow}}" text="{{toastText}}" />
//   显示时长由父级控制（core/toast.ts 的 TOAST_MS，当前 1500ms，历史见其注释）。
//
// 实现要点：
//   · 常驻节点 + CSS 切 opacity/transform。用 wx:if 会直接销毁节点，退场动画就没了。
//   · pointer-events: none —— 它只是提示，不该挡住下面的步进器。
//   · z-index 1050：在固定底栏(900)、回到顶部(950) 之上，模态(1100) 之下。
Component({
  properties: {
    show: { type: Boolean, value: false },
    text: { type: String, value: '' },
  },
});
