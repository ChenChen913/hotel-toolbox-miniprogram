// Stepper —— 步进器（源实现 src/components/Stepper.vue）
// 圆形减号 + 数值 + 圆形加号 + 单位；到达 min/max 时对应按钮禁用。
// 自身不保存状态：改值后 triggerEvent('change', v)，由父级决定是否回写（单向数据流）。
Component({
  properties: {
    value: { type: Number, value: 1 },
    min: { type: Number, value: 1 },
    max: { type: Number, value: 99 },
    unit: { type: String, value: '' },
  },

  data: {
    // 到达 min/max 时对应按钮禁用。状态在 JS 里算好再给 WXML，
    // 避免模板里出现 `{{value <= min}}` 这种带 `<` 的表达式（WXML 解析器对 `<` 敏感）。
    minusOff: false,
    plusOff: false,
  },

  observers: {
    'value, min, max': function (value: number, min: number, max: number) {
      this.setData({ minusOff: value <= min, plusOff: value >= max });
    },
  },

  methods: {
    onStep(e: WechatMiniprogram.TouchEvent) {
      const d = Number(e.currentTarget.dataset.d);
      const cur = this.data.value;
      const next = Math.max(this.data.min, Math.min(this.data.max, cur + d));
      if (next === cur) return;
      this.triggerEvent('change', next);
    },
  },
});
