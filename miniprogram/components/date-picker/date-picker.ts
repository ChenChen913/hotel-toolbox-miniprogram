// DatePicker —— 自绘日历（源实现 src/components/DatePicker.vue）
// 月份切换头 + 7 列星期标头 + 日期网格；今天带金点、选中墨绿底、过去日期弱化。
//
// ⚠️ 两条来自源实现的硬约束（踩过坑，不要改回去）：
//   1. 禁止给日期格加 aspect-ratio —— 配合 min-height 会把高度反向算成最小宽度，窄屏 7 列撑不下会溢出；
//   2. 星期标头与日期格必须用同一套列宽计算，否则列宽不一致就会错位。
// 小程序无 grid 兼容顾虑，这里用 flex + 固定百分比宽度，保证标头与格子同轨。
interface Cell {
  key: string;
  str: string;
  d: number | null;
  sel: boolean;
  today: boolean;
  past: boolean;
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const pad = (n: number) => String(n).padStart(2, '0');
const toStr = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** 手动 split('-') 解析，禁止 new Date('YYYY-MM-DD')（会被当 UTC，时区偏移导致差一天） */
function parse(s: string): { y: number; m: number } {
  if (!s) {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  }
  const p = s.split('-').map(Number);
  return { y: p[0], m: p[1] - 1 };
}

Component({
  properties: {
    value: { type: String, value: '' },
  },

  data: {
    y: 0,
    m: 0,
    cells: [] as Cell[],
    week: WEEK,
  },

  lifetimes: {
    attached() {
      const cur = parse(this.data.value);
      this.setData({ y: cur.y, m: cur.m });
      this.build();
    },
  },

  observers: {
    value() {
      // 仅当已初始化（y>0）时重算选中态；同时把视图月份跟随到选中日期
      if (!this.data.y) return;
      if (this.data.value) {
        const cur = parse(this.data.value);
        if (cur.y !== this.data.y || cur.m !== this.data.m) {
          this.setData({ y: cur.y, m: cur.m });
        }
      }
      this.build();
    },
  },

  methods: {
    build() {
      const y = this.data.y;
      const m = this.data.m;
      const n = new Date();
      const todayStr = toStr(n.getFullYear(), n.getMonth(), n.getDate());
      const lead = new Date(y, m, 1).getDay();
      const total = new Date(y, m + 1, 0).getDate();

      const cells: Cell[] = [];
      for (let i = 0; i < lead; i++) {
        cells.push({ key: `p${i}`, str: '', d: null, sel: false, today: false, past: false });
      }
      for (let d = 1; d <= total; d++) {
        const str = toStr(y, m, d);
        cells.push({
          key: str,
          str,
          d,
          sel: str === this.data.value,
          today: str === todayStr,
          past: str < todayStr,
        });
      }
      while (cells.length % 7) {
        const k = cells.length;
        cells.push({ key: `e${k}`, str: '', d: null, sel: false, today: false, past: false });
      }
      this.setData({ cells });
    },

    onShift(e: WechatMiniprogram.TouchEvent) {
      const n = Number(e.currentTarget.dataset.d);
      const d = new Date(this.data.y, this.data.m + n, 1);
      this.setData({ y: d.getFullYear(), m: d.getMonth() });
      this.build();
    },

    onPick(e: WechatMiniprogram.TouchEvent) {
      const str = String(e.currentTarget.dataset.str || '');
      if (!str) return;
      this.triggerEvent('change', str);
    },
  },
});
