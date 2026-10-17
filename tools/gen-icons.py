# -*- coding: utf-8 -*-
"""
图标生成器 —— 把内联 SVG 转成 base64 写进 WXSS。

为什么不用 iconfont：本工程硬约束「零网络、零 CDN、零第三方依赖」，
不能下载 iconfont.ttf，也不能引外部字体文件。故改用手写 SVG → base64
内联进 WXSS（小程序不支持 <svg> 标签，但 background-image 支持 data URI）。

颜色不能靠 color 继承（background-image 里的 SVG 不继承外部 CSS 变量），
因此按需为每个图标生成若干「颜色变体」，用 class 后缀区分：
  （无后缀）= ink-2 #717a73 默认
  -i = ink        -k = ink-3  -p = pine   -d = pine-deep
  -g = gold       -a = amber  -c = cream（深色按钮上用）

用法：python tools/gen-icons.py
输出：miniprogram/icon.wxss（由 app.wxss 顶部 @import 引入）
"""
import base64
import os

COLORS = {
    '': '#717a73',  # ink-2
    'n': '#717a73',  # ink-2 的别名（VARIANTS 里写 n 表示默认档，不额外生成 class）
    'i': '#232925',  # ink
    'k': '#a6ada5',  # ink-3
    'p': '#1c5a4a',  # pine
    'd': '#123f33',  # pine-deep
    'g': '#a9853d',  # gold
    'a': '#b45309',  # amber
    'c': '#f4f1e8',  # cream
}

# 每个图标需要生成的颜色变体（字符串里每个字符是一个档位，空字符表示默认档）
VARIANTS = {
    # R5-9：house 也要 pine 档（住宿情况「探亲」标签用）。原 d 档保留（tabBar 在用）。
    'house': 'dp', 'luggage': 'd',
    # book-open：第 ⑤ 步「培训 / 学习」那一行与 moon / droplets / bug / plug 并排，
    # 那四个都是 p（pine），所以这里也必须有 p —— 之前只给了 d，导致 class 不存在、
    # 图标渲染成空白（「培训学习」前面少一个图标）。d 保留，别处可能用到。
    'book-open': 'dp',
    # 「我的」页 tabBar 图标（E1）：未选中走默认档 ink-2，选中走 d = pine-deep，
    # 与其它三个 tab 图标保持同一套档位
    'circle-user': 'd',
    # R6：plus 增加 p 档 —— 下拉面板「自定义」项前面用它（tone 与 picklist 一致）
    'plus': 'cdkp',
    'copy': '',
    'download': 'c',
    'upload': 'd',
    'trash': 'kn',
    'x': '',
    'rotate-ccw': '',
    'siren': 'p',
    # R5-9：住宿情况 7 标签统一 tone="p"。bed-double / house 原来只有 d（tabBar 在用），
    # sliders 原来只有默认档（fx-head 在用）—— 缺档的 class 不存在，图标静默渲染成空白。
    # 原档位全部保留，别处可能用到。
    'bed-double': 'dp',
    'door-open': 'd',
    'shield-alert': 'g',
    'shield': 'k',
    'alert-triangle': 'a',
    'compass': 'p',
    'calendar-days': 'p',
    'users': 'p',
    # 人数选项专用：1 人用 user、2 人用 users、3 人及以上用 users-3。
    # 三者必须成套，否则「图标要和人数对应」这条就断在某一档上。
    'user': 'p', 'users-3': 'p',
    'moon': 'p', 'droplets': 'p', 'bug': 'p', 'plug': 'p',
    'sliders': 'p',
    'briefcase': 'p', 'camera': 'p', 'pill': 'p', 'baby': 'p',
    'paw-print': 'p', 'shirt': 'p',
    # R5-3：性别步的 ♂ / ♀（两行各一档 pine，与相邻 picklist 一致）
    'mars': 'p', 'venus': 'p',
    # R6：住宿情况「看病」标签。原 pill（胶囊）旋转后看着像曲别针，老板点名不合适；
    # 换成圆角方框 + 十字（急救箱 / 医疗符号，一眼是「看病 / 医院」）。
    'medical-cross': 'p',
    'arrow-left': 'i',
    'chevron-right': 'kcd',
    'chevron-down': 'k',
    'chevron-up': 'd',
    # stepper 的禁用态用 k、可用态用 d（pine-deep）
    'minus': 'kd', 'check': 'cp',
}

# lucide 风格：24×24 视口、描边 1.9、圆头圆角
ICONS = {
    # —— 导航（tabBar）——
    'house': '<path d="M4 11.2 12 4l8 7.2V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M9.5 21v-6.2h5V21"/>',
    'luggage': '<rect x="5" y="8" width="14" height="12" rx="2.5"/>'
               '<path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8"/>'
               '<path d="M8.5 20v1.5M15.5 20v1.5"/><path d="M9.5 12h5"/>',
    'book-open': '<path d="M12 6.5C10 4.4 6.6 4 3.6 4v14c3 0 6.4.4 8.4 2.5"/>'
                 '<path d="M12 6.5c2-2.1 5.4-2.5 8.4-2.5v14c-3 0-6.4.4-8.4 2.5"/>',
    'circle-user': '<circle cx="12" cy="12" r="9"/>'
                   '<circle cx="12" cy="10" r="3"/>'
                   '<path d="M6.2 19.3a6.6 6.6 0 0 1 11.6 0"/>',
    # —— 通用 ——
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'minus': '<path d="M5 12h14"/>',
    'check': '<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>',
    'x': '<path d="M6 6l12 12M18 6 6 18"/>',
    'chevron-right': '<path d="M9 5l7 7-7 7"/>',
    'chevron-down': '<path d="M5 9l7 7 7-7"/>',
    'chevron-up': '<path d="M5 15l7-7 7 7"/>',
    'arrow-left': '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>',
    # —— 首页 ——
    'copy': '<rect x="9" y="9" width="11" height="11" rx="2.5"/>'
            '<path d="M5.5 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v.5"/>',
    'download': '<path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M4.5 20h15"/>',
    'upload': '<path d="M12 20V9"/><path d="M7 13l5-5 5 5"/><path d="M4.5 20h15"/>',
    'trash': '<path d="M4 7h16"/>'
             '<path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7"/>'
             '<path d="M6.5 7l.8 12.2a1.5 1.5 0 0 0 1.5 1.3h6.4a1.5 1.5 0 0 0 1.5-1.3L17.5 7"/>',
    'rotate-ccw': '<path d="M3.5 2.8v6h6"/><path d="M3.5 14.6a9 9 0 1 0 2.1-9.3L3.5 8.4"/>',
    # —— 行程与检查 ——
    'siren': '<path d="M6 17.5V12a6 6 0 0 1 12 0v5.5"/><path d="M3.5 17.5h17"/>'
             '<path d="M12 3.6V6"/><path d="M12 20.8v-1.4"/>',
    'bed-double': '<path d="M3 19v-6.5h18V19"/><path d="M3 12.5V8"/><path d="M21 12.5V8"/>'
                  '<path d="M3 19v2M21 19v2"/><circle cx="8.5" cy="10.2" r="1.6"/>',
    'door-open': '<path d="M5 21V3.5h11V21"/><path d="M3 21h18"/><path d="M13.5 12h.01"/>',
    # —— 知识库 ——
    'shield-alert': '<path d="M12 3.5 20 6.5V12c0 4.6-3.3 7.6-8 8.5-4.7-.9-8-3.9-8-8.5V6.5z"/>'
                    '<path d="M12 9v3.8"/><path d="M12 16.2h.01"/>',
    'alert-triangle': '<path d="M12 4.2 21 19.5H3z"/><path d="M12 9.5v4"/><path d="M12 16.6h.01"/>',
    'shield': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    # —— 向导 ——
    'compass': '<circle cx="12" cy="12" r="9"/><path d="M15.6 8.4 13.2 13.2 8.4 15.6 10.8 10.8z"/>',
    'calendar-days': '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/>'
                     '<path d="M3.5 10h17"/><path d="M8 3v4M16 3v4"/>',
    'users': '<circle cx="9.5" cy="7.5" r="3.5"/>'
             '<path d="M3 20v-1.5A4.5 4.5 0 0 1 7.5 14h4a4.5 4.5 0 0 1 4.5 4.5V20"/>'
             '<path d="M16.5 4.7a3.5 3.5 0 0 1 0 6.6"/>'
             '<path d="M18.2 14.3A4.5 4.5 0 0 1 21 18.5V20"/>',
    # 单人：一个头 + 一个身，居中
    'user': '<circle cx="12" cy="7.6" r="3.8"/>'
            '<path d="M4.8 20v-1.5A5.6 5.6 0 0 1 10.4 12.9h3.2a5.6 5.6 0 0 1 5.6 5.6V20"/>',
    # 三人：中间一个完整的人，左右各一个只露头 + 短肩线的「半身」，避免小尺寸下糊成一团
    'users-3': '<circle cx="12" cy="7.2" r="3.1"/>'
               '<path d="M6.9 20v-1.3a4.6 4.6 0 0 1 4.6-4.6h1a4.6 4.6 0 0 1 4.6 4.6V20"/>'
               '<circle cx="4.5" cy="9.7" r="2.3"/>'
               '<path d="M1.4 18.4v-.6a3.1 3.1 0 0 1 2.2-3"/>'
               '<circle cx="19.5" cy="9.7" r="2.3"/>'
               '<path d="M22.6 18.4v-.6a3.1 3.1 0 0 0-2.2-3"/>',
    'moon': '<path d="M20.8 13.4A8.8 8.8 0 0 1 10.6 3.2 8.8 8.8 0 1 0 20.8 13.4z"/>',
    'droplets': '<path d="M12 3.4c3.4 3.9 5.6 6.6 5.6 9.9a5.6 5.6 0 0 1-11.2 0c0-3.3 2.2-6 5.6-9.9z"/>',
    'bug': '<rect x="8" y="7.5" width="8" height="11" rx="4"/>'
           '<path d="M8 12H4M16 12h4"/>'
           '<path d="M8 9.4 4.6 6.6M16 9.4l3.4-2.8"/>'
           '<path d="M8 16.2l-3.4 2.4M16 16.2l3.4 2.4"/>',
    'plug': '<path d="M9 2.8v5.4M15 2.8v5.4"/>'
            '<path d="M6 8.2h12v3.3a6 6 0 0 1-12 0z"/><path d="M12 17.5v3.7"/>',
    'sliders': '<path d="M4 8h8M16.5 8H20M4 16h4.5M13 16H20"/>'
               '<circle cx="14" cy="8" r="2.2"/><circle cx="10.5" cy="16" r="2.2"/>',
    # —— 提示条图标（源项目 src/hint-icons.ts）——
    'briefcase': '<rect x="3" y="7" width="18" height="13" rx="2.5"/>'
                 '<path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/>'
                 '<path d="M3 12.5h18"/>',
    'camera': '<rect x="3" y="7" width="18" height="13" rx="2.5"/>'
              '<circle cx="12" cy="13.5" r="3.4"/><path d="M8.6 7l1.4-2.6h4L15.4 7"/>',
    'pill': '<rect x="2.7" y="8.6" width="18.6" height="6.8" rx="3.4" transform="rotate(-45 12 12)"/>'
            '<path d="M8.6 15.4 15.4 8.6"/>',
    'baby': '<circle cx="12" cy="7.5" r="4.5"/><path d="M10 7h.01M14 7h.01"/>'
            '<path d="M10.2 9.6a3 3 0 0 0 3.6 0"/><path d="M5 21v-3.5a7 7 0 0 1 14 0V21"/>',
    'paw-print': '<circle cx="7" cy="8.5" r="2"/><circle cx="12" cy="6.5" r="2"/>'
                 '<circle cx="17" cy="8.5" r="2"/><circle cx="9" cy="13" r="2"/>'
                 '<path d="M12 12.5c2.6 0 4.7 1.6 4.7 3.6s-2.1 3.4-4.7 3.4-4.7-1.4-4.7-3.4S9.4 12.5 12 12.5z"/>',
    'shirt': '<path d="M8.6 3 4 5.6l1.9 3.4L8 8.6V21h8V8.6l2.1.4L20 5.6 15.4 3l-2 2.4z"/>',
    # —— R5-3 性别（♂ / ♀，几何符号，与 lucide 描边风格同规格）——
    'mars': '<circle cx="10" cy="14" r="4.8"/><path d="M13.5 10.5 20 4"/><path d="M15.5 4H20v4.5"/>',
    'venus': '<circle cx="12" cy="8.5" r="4.8"/><path d="M12 13.3V21"/><path d="M9.2 17.5h5.6"/>',
    # —— R6 医疗十字（看病 / 医院）：圆角方框内一个加号 ——
    'medical-cross': '<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3.2"/>'
                     '<path d="M12 8.4v7.2M8.4 12h7.2"/>',
}


def svg_b64(name: str, suffix: str) -> str:
    color = COLORS[suffix]
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" '
        f'stroke="{color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'
        f'{ICONS[name]}</svg>'
    )
    return base64.b64encode(svg.encode('utf-8')).decode('ascii')


def main() -> None:
    out = [
        '/* 由 tools/gen-icons.py 自动生成，请勿手改。',
        '   重跑命令：python tools/gen-icons.py',
        '   方案说明：小程序不支持 <svg> 标签，且本项目零网络/零 CDN/零第三方依赖，',
        '   故把手写 SVG 转 base64 内联为 background-image。',
        '   class 后缀 = 颜色档位：（无）=ink-2  -i=ink  -k=ink-3  -p=pine  -d=pine-deep',
        '   -g=gold  -a=amber  -c=cream */',
        '',
        '.ic {',
        '  display: inline-block;',
        '  flex-shrink: 0;',
        '  background-repeat: no-repeat;',
        '  background-position: center;',
        '  background-size: contain;',
        '}',
        '',
    ]
    total = 0
    rules = 0
    for name in sorted(ICONS):
        # 默认档「''」必生成；VARIANTS 里的 n 就是默认档，跳过
        suffixes = [''] + [c for c in VARIANTS.get(name, '') if c != 'n']
        for s in suffixes:
            b64 = svg_b64(name, s)
            total += len(b64)
            rules += 1
            out.append(f'.ic-{name}{"-" + s if s else ""} {{')
            out.append(f'  background-image: url("data:image/svg+xml;base64,{b64}");')
            out.append('}')
    out.append('')

    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(here, 'miniprogram', 'icon.wxss')
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(out))
    print(f'图标 {len(ICONS)} 个，变体 {rules} 条')
    print(f'base64 总体积 ≈ {total / 1024:.1f} KB → {path}')


if __name__ == '__main__':
    main()
