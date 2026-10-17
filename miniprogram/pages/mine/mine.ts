// 我的 —— 新建页面（源项目没有这一页；CHANGE-REQUESTS §11.3 / DEV-PLAN E1）。
//
// 定位：备份与恢复 / 关于 / 清空全部数据。
// 「备份与恢复」是从首页底部那个折叠块搬过来的 —— 那里发现率极低，
// 而隐私与协议类内容又必须有一个稳定入口（提审必查项）。
//
// M18 去重：数据概况卡已删（入住次数 / 晚数 / 平均备齐与首页统计条一模一样，
//           只显示一次 —— 留在首页）；偏好设置卡已删（老板拍板没用，改默认值
//           没有直接反馈，向导里本来就能按行程选）。
//
// 🔴 三条原则：
//   1. 绝不放账号登录 / 手机号 / 头像 / 昵称。本工具零账号、零网络、零埋点，
//      这是它的产品优势，不能自己毁掉。
//   2. 这一页不发任何网络请求，展示的全是本机数据。
//   3. 「清空全部数据」不可逆，必须走自绘二次确认弹窗（P0-6），不用 wx.showModal。

import { DISCLAIMER } from '../../core/data';
import { Storage, listStays } from '../../core/engine';
import {
  exportDataExt, importDataExt,
} from '../../core/extra';
import { lineParas, toParas } from '../../core/rich';
import type { Para } from '../../core/rich';
import { syncTabBar } from '../../core/tabbar';

/** 版本号：与 package.json 的 version 保持一致，改版本只改这两处 */
const APP_VERSION = '1.0.0';

/**
 * 「清空全部数据」要清的 key。
 * 刻意逐个列出、不用 wx 的 clearStorageSync 一把清空：那会把同一台设备上
 * 其它小程序/小游戏的数据一并清掉，属于越权操作。
 */
const OWN_KEYS = [
  'htb_stays_v1',      // 行程
  'htb_stays_v1_corrupt', // 读修复隔离的损坏存储原文（core/platform.ts 存档，一并清掉）
  'htb_gear_v5',       // 好物（当前版本）
  'htb_gear_v4',       // 好物旧版（迁移残留）
  'htb_gear_v3',       // 好物旧版（迁移残留）
  'htb_ui_collapsed_v2', // 分组折叠状态（UI 层，v2 起按行程隔离）
  'htb_ui_collapsed_v1', // 旧版折叠状态（v1 全局共享，已废弃，清掉残留）
  'htb_ui_paneh_v1',    // 各段内容高度缓存（M17 首进提速，按行程隔离）
  'htb_ext_v1',        // 扩展层：住宿关系 / 培训学习
];

Page({
  data: {
    // —— 卡片 1 · 备份与恢复 ——
    backupMsg: '',
    importText: '',

    // —— 卡片 2 · 关于 ——
    version: APP_VERSION,
    discTitle: DISCLAIMER.title,
    discLines: [] as Para[],
    discTriggers: [] as Para[],
    discOpen: false,
    privacyOpen: false,

    /** P0-6 自绘确认弹窗 */
    modal: { show: false, title: '', content: '', confirmText: '确定', danger: false },
  },

  /** 当前弹窗对应哪个操作：'' | 'import' | 'clear'。放 data 外，避免无谓的视图重渲 */
  modalAction: '' as '' | 'import' | 'clear',

  onLoad() {
    this.setData({
      discTitle: DISCLAIMER.title,
      // 免责声明 4 条是「一行一条」，用 lineParas（与知识库顶部那份完全同源）
      discLines: lineParas(DISCLAIMER.lines),
      discTriggers: toParas(DISCLAIMER.triggers),
    });
  },

  onShow() {
    // 第 4 个 tab（下标 3）：自定义 tabBar 不会自己知道当前在哪，必须由页面告知
    syncTabBar(this, 3);
  },

  // —— 卡片 2 · 关于（折叠用 wx:if 直接切，不做高度动画）——
  toggleDisc() {
    this.setData({ discOpen: !this.data.discOpen });
  },

  togglePrivacy() {
    this.setData({ privacyOpen: !this.data.privacyOpen });
  },

  // —— 卡片 2 · 备份与恢复（自首页搬来，逻辑不变）——
  doExport() {
    // 剪贴板 API 必须由用户点击触发（06 §2 R3），不能放到 onShow 里。
    // exportDataExt = 源备份结构 + ext 段（住宿关系 / 培训学习），少了 ext 会静默丢数据。
    wx.setClipboardData({
      data: exportDataExt(),
      success: () => {
        this.setData({ backupMsg: '已复制到剪贴板，可粘贴到微信收藏或备忘录保存' });
      },
      fail: () => {
        this.setData({ backupMsg: '复制失败，请重试' });
      },
    });
  },

  /**
   * 导入：覆盖是不可逆的（会整体替换本机行程与好物），故先二次确认。
   * 与「删除行程」「清空数据」保持一致的确认策略（02 §6「删除确认」）。
   */
  doImport() {
    wx.getClipboardData({
      success: res => {
        const text = String(res.data || '');
        if (!text.trim()) {
          this.setData({ backupMsg: '剪贴板是空的，先在别处复制好备份 JSON 再点导入' });
          return;
        }
        const cur = listStays().length;
        this.modalAction = 'import';
        this.setData({
          importText: text,
          modal: {
            show: true,
            title: '导入备份',
            content: cur
              ? `导入会覆盖本机现有的 ${cur} 个行程与全部好物，确定继续？`
              : '导入会覆盖本机现有的全部数据，确定继续？',
            confirmText: '覆盖导入',
            danger: true,
          },
        });
      },
      fail: () => {
        this.setData({ backupMsg: '读取剪贴板失败，请重试' });
      },
    });
  },

  runImport() {
    const text = this.data.importText;
    try {
      // importDataExt = 源 importData（校验 app 字段、非法即抛）+ 扩展段回写
      const r = importDataExt(text);
      this.setData({ backupMsg: `已导入 ${r.stays} 个行程、${r.gear} 组好物` });
    } catch (err) {
      // 非法 JSON 要给友好提示，不能把 SyntaxError 原文丢给用户
      const msg = err instanceof SyntaxError
        ? '剪贴板里不是有效的备份 JSON'
        : (err instanceof Error ? err.message : '导入失败');
      this.setData({ backupMsg: msg });
    }
  },

  // —— 危险区 · 清空全部数据 ——
  askClear() {
    this.modalAction = 'clear';
    this.setData({
      modal: {
        show: true,
        title: '清空全部数据',
        content: '会删掉本机所有行程、好物与个性化设置，且无法恢复。建议先导出备份。',
        confirmText: '全部清空',
        danger: true,
      },
    });
  },

  clearAll() {
    // 走 engine 的 Storage（小程序下已被 core/platform.ts 换成 wx 同步 API），
    // 而不是直接调 wx.removeStorageSync —— 这样 node 测试里也能跑同一套逻辑。
    OWN_KEYS.forEach(k => Storage.removeItem(k));
    this.setData({ backupMsg: '已清空本机全部数据', importText: '' });
  },

  onModalConfirm() {
    const action = this.modalAction;
    this.modalAction = '';
    this.setData({ 'modal.show': false });
    if (action === 'clear') this.clearAll();
    else if (action === 'import') this.runImport();
  },

  onModalCancel() {
    this.modalAction = '';
    this.setData({ 'modal.show': false });
  },
});
