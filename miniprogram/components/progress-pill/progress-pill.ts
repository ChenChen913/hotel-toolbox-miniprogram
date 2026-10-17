// ProgressPill —— 进度条（源实现 src/components/ProgressPill.vue）
// 行程页三处复用：准备「已备齐」、入住/退房「已完成」。
Component({
  properties: {
    done: { type: Number, value: 0 },
    total: { type: Number, value: 0 },
    label: { type: String, value: '' },
  },

  data: {
    pct: 0,
  },

  observers: {
    'done, total': function (done: number, total: number) {
      this.setData({ pct: total ? Math.round((done * 100) / total) : 0 });
    },
  },
});
