# -*- coding: utf-8 -*-
"""
图标引用校验器 —— 确保模板里每一个 <icon> 都能真的显示出来。

为什么需要它：
    图标是「手写 SVG → base64 → icon.wxss」生成的，颜色不能靠 color 继承，
    只能靠 class 后缀区分档位（-p = pine、-d = pine-deep ...）。
    于是「模板写了 tone="p"，但生成器没为这个图标生成 p 档」时，
    class 不存在 → background-image 落空 → **图标静默渲染成空白**，
    不报错、不警告，只有肉眼能看出来。

    本项目就踩过：向导第 ⑤ 步「培训 / 学习」用的 <icon name="book-open" tone="p" />，
    而 VARIANTS 里 book-open 只有 'd'，那一行的图标一直是空白。

用法：
    python tools/check-icons.py
退出码：0 = 全部有定义；1 = 有缺失（会把缺失项逐条列出来）
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MP = os.path.join(ROOT, 'miniprogram')

# 颜色档位后缀，与 gen-icons.py 的 PALETTE / 说明保持一致
TONES = ['', 'i', 'k', 'p', 'd', 'g', 'a', 'c']

# 模板里 <icon> 的 name / tone 可以是字面量，也可以是 {{...}} 动态绑定；
# 动态的无法静态校验，跳过（例如 tone="{{stage === 'checkin' ? 'd' : ''}}"）。
LITERAL = re.compile(r'^\s*[a-z0-9-]*\s*$')


def defined_classes() -> set:
    css = open(os.path.join(MP, 'icon.wxss'), encoding='utf-8').read()
    return set(re.findall(r'\.ic-[a-z0-9-]+(?=\s*\{)', css))


def attr(tag: str, key: str):
    m = re.search(key + r'="([^"]*)"', tag)
    return m.group(1) if m else None


def main() -> int:
    defined = defined_classes()
    missing = []
    dynamic = 0
    checked = 0

    for dirpath, _dirs, files in os.walk(MP):
        for fn in sorted(files):
            if not fn.endswith('.wxml'):
                continue
            path = os.path.join(dirpath, fn)
            rel = os.path.relpath(path, ROOT).replace('\\', '/')
            src = open(path, encoding='utf-8').read()
            for tag in re.findall(r'<icon\b[^>]*>', src):
                name = attr(tag, 'name')
                if name is None:
                    continue
                tone = attr(tag, 'tone')
                tone = '' if tone is None else tone
                # 动态绑定：{{...}} 里可能算出任意档位，静态查不了，跳过但计数
                if '{{' in name or '{{' in tone:
                    dynamic += 1
                    continue
                checked += 1
                cls = '.ic-' + name + (('-' + tone) if tone else '')
                if cls not in defined:
                    missing.append((rel, name, tone or '(默认)', cls))

    print(f'icon.wxss 已定义 class：{len(defined)} 条')
    print(f'模板静态引用：{checked} 处（另有 {dynamic} 处动态绑定，跳过）')

    if not missing:
        print('✅ 全部有定义')
        return 0

    print(f'❌ {len(missing)} 处引用了不存在的 class（这些图标会渲染成空白）：')
    for rel, name, tone, cls in missing:
        print(f'   {rel}  name="{name}" tone="{tone}"  →  缺 {cls}')
    print()
    print('修法：在 tools/gen-icons.py 的 VARIANTS 里给该图标补上对应档位字符，'
          '然后重跑 python tools/gen-icons.py')
    return 1


if __name__ == '__main__':
    sys.exit(main())
