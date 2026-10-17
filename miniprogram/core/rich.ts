// rich.ts —— 富文本预解析（源项目用 v-html 的那部分）。
//
// 源实现：先 esc，再把 `**…**` 替换成 <strong>…</strong>，交给 v-html 渲染。
// 小程序既没有 v-html，也不允许动态节点，所以改成「在数据层先解析好」：
// 正文 → 段落 → 片段（普通 / 加粗），模板里只用 <text> 拼出来。
// 零 HTML、零注入风险，加粗范围与源实现完全一致。
//
// 被两个页面共用：knowledge（44 条知识正文）与 mine（免责声明）。

/** 正文内联片段：b=true 表示加粗；k 仅作 wx:key 用 */
export interface Seg {
  b: boolean;
  t: string;
  k: number;
}
/** 一个段落（正文按 \n 切分） */
export interface Para {
  k: number;
  segs: Seg[];
}

/** 'a **b** c' → [普通 a, 加粗 b, 普通 ' c']（与源实现 esc+replace 的加粗范围一致） */
export function parseInline(s: string): Seg[] {
  const out: Seg[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push({ b: false, t: s.slice(last, m.index), k: out.length });
    out.push({ b: true, t: m[1], k: out.length });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ b: false, t: s.slice(last), k: out.length });
  return out;
}

/** body 里的 \n 分段，空行丢弃（与源实现 paras() 一致） */
export function toParas(body: string): Para[] {
  return body
    .split('\n')
    .filter(Boolean)
    .map((t, i) => ({ k: i, segs: parseInline(t) }));
}

/** 单行文本 → 一个段落（给没有换行的行式内容用，如免责声明 4 条） */
export function lineParas(lines: string[]): Para[] {
  return lines.map((t, i) => ({ k: i, segs: parseInline(t) }));
}
