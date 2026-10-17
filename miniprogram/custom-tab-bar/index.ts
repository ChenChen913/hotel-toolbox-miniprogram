/**
 * 自定义 tabBar —— 还原源项目的「悬浮胶囊玻璃导航」
 *
 * 源实现：src/App.vue 的 <nav class="navbar glass">，fixed 居中、圆角胶囊、
 * 选中项白底渐变 + 内高光。原生 tabBar 做不出这个形态，故用 custom tabBar。
 *
 * 契约：
 * 1. 目录必须是 miniprogramRoot 下的 custom-tab-bar/index（微信硬性要求）；
 * 2. app.json 的 tabBar 需写 "custom": true，且 list 仍要声明（用于编译期校验）；
 * 3. 每个 tab 页必须在 onShow 里把 selected 告诉组件（core/tabbar.ts 的 syncTabBar）。
 */
interface TabItem {
  url: string;
  text: string;
  icon: string;
}

const TABS: TabItem[] = [
  { url: '/pages/home/home', text: '首页', icon: 'house' },
  { url: '/pages/gear/gear', text: '好物', icon: 'luggage' },
  { url: '/pages/knowledge/knowledge', text: '知识库', icon: 'book-open' },
  // E1：「我的」放最右（全行业惯例）。自绘 tabBar 没有原生 tabBar 的 5 个上限，
  // 四 tab 时每个仍宽 840/4 = 210rpx，放得下（核算见 CHANGE-REQUESTS §11.3）。
  { url: '/pages/mine/mine', text: '我的', icon: 'circle-user' },
];

Component({
  data: {
    selected: 0,
    tabs: TABS,
  },

  methods: {
    onTab(e: WechatMiniprogram.TouchEvent) {
      const i = Number(e.currentTarget.dataset.i);
      if (Number.isNaN(i) || i === this.data.selected) return;
      wx.switchTab({ url: TABS[i].url });
    },
  },
});
