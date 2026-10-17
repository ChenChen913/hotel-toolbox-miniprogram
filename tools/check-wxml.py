# -*- coding: utf-8 -*-
"""
WXML 结构校验器 —— 在扫码上真机之前，先把「编译 .wxml 文件错误」挡在本地。

为什么需要它：
    真机的报错信息长这样：
        ./pages/stay/swipe.wxs:115:22:Unexpected token `(`
        编译 .wxml 文件错误，错误信息如上，可在控制台查看更多详细信息
    也就是说：**wxml 编译失败的原因可能根本不在 wxml 里**（上面这条真凶是它引用的 wxs）。
    反过来说，wxml 自己的标签没配对，也是同一个报错。两种都得能查。

    开发者工具的「编译」只作用于模拟器，**模拟器能过不代表真机能过**。
    所以把结构检查做成脚本，每次改完 wxml 先跑一遍，比扫码试错便宜得多。

本脚本查：
    A. 标签是否成对闭合（<block> / <wxs> / <template> 是成对写的，别当自闭合）
    B. 插值 {{ }} 是否配对

用法：
    python tools/check-wxml.py
退出码：0 = 通过；1 = 有问题（逐条列出 文件:行 + 说明）
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MP = os.path.join(ROOT, 'miniprogram')

# 这些标签在 WXML 里通常不写闭合标签。
# 注意：<block> <wxs> <template> <view> <text> 都是**成对**写的，不能放进来，
# 否则会把正常的 </block> 误判成「不匹配」。
VOID_TAGS = {
    'input', 'image', 'icon', 'slot', 'import', 'include',
    'progress', 'checkbox', 'radio', 'switch', 'slider', 'navigator',
}

TAG = re.compile(r'<(/?)([a-zA-Z][\w-]*)((?:"[^"]*"|\'[^\']*\'|[^>"\'])*?)(/?)>')
COMMENT = re.compile(r'<!--[\s\S]*?-->')


def check_file(path: str):
    raw = open(path, encoding='utf-8').read()
    rel = os.path.relpath(path, ROOT).replace('\\', '/')
    problems = []

    # ── A. 标签配对 ───────────────────────────────────────────
    src = COMMENT.sub(lambda m: ' ' * (m.end() - m.start()), raw)  # 注释挖空，保住行号
    stack = []
    for m in TAG.finditer(src):
        closing, tag, _attrs, selfclose = m.group(1), m.group(2), m.group(3), m.group(4)
        line = src.count('\n', 0, m.start()) + 1
        if closing:
            if not stack:
                problems.append((line, f'</{tag}> 没有对应的开标签'))
            elif stack[-1][0] != tag:
                problems.append(
                    (line, f'</{tag}> 与栈顶 <{stack[-1][0]}>（第 {stack[-1][1]} 行）不匹配'))
                stack.pop()
            else:
                stack.pop()
        elif selfclose or tag in VOID_TAGS:
            continue
        else:
            stack.append((tag, line))
    for tag, line in stack:
        problems.append((line, f'<{tag}> 没有闭合'))

    # ── B. 插值配对 ───────────────────────────────────────────
    opened = src.count('{{')
    closed = src.count('}}')
    if opened != closed:
        problems.append((0, f'插值不配对：{{{{ 出现 {opened} 次，}}}} 出现 {closed} 次'))

    problems.sort(key=lambda x: (x[0], x[1]))
    return rel, problems


def main() -> int:
    targets = []
    for dirpath, _dirs, files in os.walk(MP):
        for fn in sorted(files):
            if fn.endswith('.wxml'):
                targets.append(os.path.join(dirpath, fn))

    if not targets:
        print('没有找到 .wxml 文件')
        return 0

    total = 0
    for path in sorted(targets):
        rel, problems = check_file(path)
        if problems:
            total += len(problems)
            print(f'❌ {rel}')
            for line, msg in problems:
                loc = f'{line}:' if line else ''
                print(f'   {loc}  {msg}')

    print()
    print(f'扫描 .wxml 模板：{len(targets)} 个')

    if total == 0:
        print('✅ 标签与插值全部配对正确')
        return 0

    print(f'❌ 共 {total} 处结构问题（真机上会报「编译 .wxml 文件错误」）')
    print()
    print('提示：wxml 编译失败的原因也可能不在 wxml 里 —— 如果它引用了有语法错的 wxs，')
    print('      报错同样指向 wxml。wxs 请另跑 python tools/check-wxs.py')
    return 1


if __name__ == '__main__':
    sys.exit(main())
