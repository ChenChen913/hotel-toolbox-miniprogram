/**
 * 滚动判定 —— 纯函数 / 常量，不碰 wx API，因此可以在 node 里直接单测。
 *
 * 历史：这里曾有一整节手写「左右滑动判定」（页面层 touch 判定与 WXS 方案先后
 * 共用一个口径），四轮真机反馈都不生效 —— 最终按 CHANGE-REQUESTS02 §2.5 拍板
 * 改用原生 <swiper>（手势判定由微信客户端实现），那一节随之整体删除。
 *
 * 为什么放在 core 而不是写在页面里：页面文件在 vitest 里 import 不了
 * （`Page({})` 在 node 环境不存在），判定逻辑留在页面里就等于不可测。
 */

/* ============================ 回到顶部按钮 ============================ */

/**
 * 滚动超过多少像素才显示「回到顶部」按钮。
 *
 * 原值是 600 —— 要往下划一屏多才出现，用户反馈「出现得太晚」。
 * 降到 120（约 1/3 屏）：稍微往下滑一点就出现，滑回顶部立刻消失。
 */
export const SCROLL_TOP_TRIGGER = 120;

/** 滚动位置是否该显示「回到顶部」按钮 */
export function shouldShowGoTop(scrollTop: number): boolean {
  return Number.isFinite(scrollTop) && scrollTop > SCROLL_TOP_TRIGGER;
}
