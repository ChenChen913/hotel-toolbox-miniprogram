/**
 * 图标组件
 *
 * 小程序不支持 <svg> 标签，且本项目零网络 / 零 CDN / 零第三方依赖，
 * 故图标为「手写 SVG → base64 内联进 WXSS」（由 tools/gen-icons.py 生成 icon.wxss）。
 *
 * 颜色档位后缀：（空）= ink-2 | i = ink | k = ink-3 | p = pine
 *               d = pine-deep | g = gold | a = amber | c = cream（深色按钮上用）
 * 颜色不能靠 color 继承，因为 background-image 里的 SVG 拿不到外部 CSS 变量。
 */
Component({
  options: {
    // 图标 class 定义在 app.wxss（含 base64），必须允许全局样式进来
    styleIsolation: 'apply-shared',
  },

  properties: {
    /** 图标名，如 house / plus / trash */
    name: { type: String, value: '' },
    /** 显示尺寸，单位 rpx */
    size: { type: Number, value: 36 },
    /** 颜色档位后缀，'' 表示默认 ink-2 */
    tone: { type: String, value: '' },
  },

  data: {
    cls: '',
    box: '36rpx',
  },

  observers: {
    'name, tone': function (name: string, tone: string) {
      this.setData({ cls: `ic ic-${name}${tone ? '-' + tone : ''}` });
    },
    size: function (size: number) {
      this.setData({ box: `${size}rpx` });
    },
  },
});
