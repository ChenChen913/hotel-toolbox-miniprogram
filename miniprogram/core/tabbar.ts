/**
 * 自定义 tabBar 的选中态同步。
 *
 * 自定义 tabBar 组件不会自己知道当前在哪个 tab，必须由 tab 页在 onShow 时告知。
 * 用法（页面 onShow 内）：syncTabBar(this, 0);
 *
 * @param index 与 custom-tab-bar/index.ts 里 TABS 的下标一致
 */
export function syncTabBar(page: unknown, index: number): void {
  const p = page as {
    getTabBar?: () => { setData?: (d: Record<string, number>) => void } | null;
  };
  const bar = typeof p.getTabBar === 'function' ? p.getTabBar() : null;
  if (bar && typeof bar.setData === 'function') bar.setData({ selected: index });
}
