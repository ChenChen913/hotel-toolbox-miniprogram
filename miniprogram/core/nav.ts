// nav.ts —— 跨页面导航参数传递
//
// 为什么需要它：`wx.switchTab` 不允许带 query 参数，而「知识库」是 tabBar 页，
// 从行程页带锚点（如「紧急联络」模块）跳过去时，URL 传参这条路是死的。
// 常见做法是把状态塞进 `getApp().globalData`，但那样要到处断言类型；
// 这里用一个纯 TS 模块级单例，类型安全、不依赖 wx、也不影响 node 测试。
//
// 语义：`setNav` 写入 → 目标页 `onShow` 里 `takeNav` 取走（取走即清空，避免下次误触发）。

export interface NavPatch {
  /** 要定位并展开的知识模块名，空串表示不定位 */
  knowModule: string;
  /** 来源页：'stay' 时知识库显示「← 返回行程」 */
  knowFrom: string;
  /** 返回行程页所需的 stay id */
  stayId: string;
}

const EMPTY: NavPatch = { knowModule: '', knowFrom: '', stayId: '' };

let patch: NavPatch = { ...EMPTY };

export function setNav(p: Partial<NavPatch>): void {
  patch = { ...patch, ...p };
}

/** 取走并清空（一次性消费） */
export function takeNav(): NavPatch {
  const p = patch;
  patch = { ...EMPTY };
  return p;
}
