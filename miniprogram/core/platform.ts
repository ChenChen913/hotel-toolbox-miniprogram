// platform.ts — 微信存储适配层（M2）
//
// 设计要点：engine.ts 保持一字不改（node 下走内存 Storage，小程序下走 wx 同步 API）。
// 做法是把 engine 导出的 Storage 对象的三个方法在运行时替换掉，
// 而不是在 engine.ts 里写 `typeof wx !== 'undefined'` 的环境判断。
// 这样同时满足：
//   · 03 §4.2    存储适配（wx 同步 API 替换内存实现）
//   · 07 M2      core/ 下除本文件外无任何 wx. 调用
//   · node 测试  不 import 本文件，engine 仍走内存 Storage，38 个用例照跑
//
// M16 读写加固（A1 / A3 / A4）：
//   · 读 STORE_KEY 时先过 repair.parseStaysPayload —— engine 的 listStays 是裸
//     JSON.parse，存储一旦损坏全应用打开即崩；在这里把坏数据修好（或降级为空表）
//     再交给 engine。原文隔离到 CORRUPT_KEY 备查（只保留首份，避免每次启动互相覆盖），
//     「我的」页的清空功能会一并清掉它。
//   · 写失败不再静默：toast 提醒用户本次修改可能未保存，同时 console.error 留痕。

import { Storage, STORE_KEY } from './engine';
import { parseStaysPayload } from './repair';

/** 损坏存储的隔离键：原文存档，方便人工找回；mine.ts 的 OWN_KEYS 里有它 */
export const CORRUPT_KEY = 'htb_stays_v1_corrupt';

export function installWxStorage(): void {
  Storage.getItem = (k: string): string | null => {
    try {
      const v = wx.getStorageSync(k) as string;
      // wx.getStorageSync 查不到时返回空字符串，语义上等价于 null
      if (v === '') return null;
      // 行程主存储走读修复：修得回来的数据原样返回（一个字节不动），
      // 修不回来的（JSON 坏 / 顶层不是数组）隔离原文、按空表继续。
      if (k === STORE_KEY) {
        const fixed = parseStaysPayload(v);
        if (fixed) return fixed.json;
        if (wx.getStorageSync(CORRUPT_KEY) === '') {
          wx.setStorageSync(CORRUPT_KEY, v);
        }
        return '[]';
      }
      return v;
    } catch {
      return null;
    }
  };
  Storage.setItem = (k: string, v: string): void => {
    try {
      wx.setStorageSync(k, v);
    } catch (e) {
      // 存储写满或异常时不能装没事发生：用户勾了一路结果没存上，
      // 下次打开全丢。toast 提示 + 控制台留痕，操作本身不阻塞。
      console.error('[StayKit] 存储写入失败', k, e);
      wx.showToast({ title: '本机存储异常，本次修改可能未保存', icon: 'none' });
    }
  };
  Storage.removeItem = (k: string): void => {
    try {
      wx.removeStorageSync(k);
    } catch {
      /* 同上：读不到只是数据没了，不值得打扰用户 */
    }
  };
}
