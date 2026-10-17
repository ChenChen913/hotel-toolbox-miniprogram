// Toggle —— iOS 风格开关（源实现 src/components/Toggle.vue）
// 50×30，滑块 24px，选中时墨绿底、滑块右移 20px → 换算为 100×60rpx / 48rpx / 40rpx。
// 自身不保存状态，点击后 triggerEvent('change', !value)。
Component({
  properties: {
    value: { type: Boolean, value: false },
  },

  methods: {
    onTap() {
      this.triggerEvent('change', !this.data.value);
    },
  },
});
