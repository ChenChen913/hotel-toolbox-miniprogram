# -*- coding: utf-8 -*-
"""
WXS 语法校验器 —— 拦截「开发者工具能编译、真机编译失败」的写法。

为什么需要它：
    WXS 不是 JavaScript，是微信自己的一套脚本语言，语法是 ES5 的**子集**。
    更麻烦的是：**开发者工具与真机用的不是同一版 WXS 编译器**，
    有些写法在模拟器里能过，真机上直接弹「编译 .wxml 文件错误」。

    本项目就踩过（2026-10-02）：
        ./pages/stay/swipe.wxs:115:22:Unexpected token `(`
    原因是写了 `Number(ins.getDataset().idx)`。查官方「WXS 语法参考 / 基础类库」：
        Number  只列了 4 个**属性**（MAX_VALUE / MIN_VALUE / NEGATIVE_INFINITY /
                POSITIVE_INFINITY），**没有方法，也不能当构造函数调用**；
        String  干脆不在基础类库里。
    也就是说 `Number(x)` / `String(x)` 这类转换在 WXS 里非法。
    要转数字只能用 Global 下的 `parseInt(s, 10)` / `parseFloat(s)`，转字符串用 `'' + v`。

    WXS 基础类库的全部内容（官方文档）：
        console                —— console.log
        Math                   —— 属性 + 方法（照 ES5）
        JSON                   —— stringify / parse
        Number                 —— **只有 4 个属性**
        Date                   —— **只有 3 个属性**（parse / UTC / now）
        Global                 —— 属性 NaN / Infinity / undefined
                                  方法 parseInt / parseFloat / isNaN / isFinite /
                                       decodeURI / decodeURIComponent /
                                       encodeURI / encodeURIComponent

本脚本查这些（都是真机会挂、模拟器不报的）：
    A. 调用 WXS 里不可调用的内置构造函数，如 Number(x) / String(x) / Array(x)
    B. 调用**未在本文件内定义**的裸函数（拼错名字、或用了 WXS 没有的全局函数）
    C. ES6+ 语法：let / const / 箭头函数 / 模板字符串 / 展开 / 可选链 / 空值合并 / class
    D. `new` 表达式
    E. 对象 / 数组字面量的**尾随逗号**

用法：
    python tools/check-wxs.py
退出码：0 = 通过；1 = 有问题（逐条列出 文件:行:列 + 说明 + 修法）
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MP = os.path.join(ROOT, 'miniprogram')

# WXS 基础类库里**可调用**的全局函数（Global 的方法）
CALLABLE_GLOBALS = {
    'parseInt', 'parseFloat', 'isNaN', 'isFinite',
    'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent',
}

# 这些标识符在 WXS 里是「只有属性、不可调用」或「根本不存在」的
# —— 出现 `Name(` 一律报错
BAD_CONSTRUCTORS = {
    'Number': 'Number 在 WXS 里只有 4 个属性，不能当函数调用；转数字请用 parseInt(s, 10)',
    'String': 'String 不在 WXS 基础类库里；转字符串请用 \'\' + v',
    'Boolean': 'Boolean 不在 WXS 基础类库里；用 !!v 代替',
    'Object': 'Object 不在 WXS 基础类库里',
    'Array': 'Array 不在 WXS 基础类库里',
    'Symbol': 'Symbol 不在 WXS 基础类库里',
    'Promise': 'Promise 不在 WXS 基础类库里（WXS 无异步能力）',
    'RegExp': 'RegExp 不在 WXS 基础类库里',
    'Error': 'Error 不在 WXS 基础类库里',
    'Map': 'Map 不在 WXS 基础类库里',
    'Set': 'Set 不在 WXS 基础类库里',
    'Date': 'Date 在 WXS 里只有 parse / UTC / now 三个属性，不能 new / 调用',
}

# 不是函数调用，别误判成「未定义的裸函数」
KEYWORDS = {
    'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof',
    'do', 'else', 'new', 'delete', 'void', 'in', 'instanceof', 'var', 'case',
    'throw', 'try', 'finally', 'break', 'continue', 'default',
}


def scrub(src: str) -> str:
    """把注释删掉、字符串内容用空格替换（保留引号与换行），便于逐行做静态检查。

    这样行号与原文严格对齐，正则也不会被注释里的中文或字符串里的 `=>` 之类误伤。
    """
    chars = list(src)
    n = len(src)
    i = 0
    state = None  # None | "'" | '"' | '`' | '//' | '/*'
    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ''
        if state is None:
            if c in ('"', "'", '`'):
                state = c
            elif c == '/' and nxt == '/':
                state = '//'
                chars[i] = ' '
                i += 1
                chars[i] = ' '
                continue
            elif c == '/' and nxt == '*':
                state = '/*'
                chars[i] = ' '
                i += 1
                chars[i] = ' '
                continue
        elif state in ('"', "'", '`'):
            if c == '\\':
                chars[i] = ' '
                if i + 1 < n and src[i + 1] != '\n':
                    chars[i + 1] = ' '
                    i += 2
                    continue
            elif c == state:
                state = None
            elif c != '\n':
                chars[i] = ' '
        elif state == '//':
            if c == '\n':
                state = None
            else:
                chars[i] = ' '
        elif state == '/*':
            if c == '*' and nxt == '/':
                state = None
                chars[i] = ' '
                i += 1
                chars[i] = ' '
                continue
            if c != '\n':
                chars[i] = ' '
        i += 1
    return ''.join(chars)


def at(src: str, pos: int):
    """把字符下标换算成 (行, 列)，都从 1 开始。"""
    line = src.count('\n', 0, pos) + 1
    col = pos - (src.rfind('\n', 0, pos) + 1) + 1
    return line, col


def check_file(path: str):
    raw = open(path, encoding='utf-8').read()
    code = scrub(raw)
    rel = os.path.relpath(path, ROOT).replace('\\', '/')
    problems = []

    def add(pos, msg):
        line, col = at(code, pos)
        problems.append((line, col, msg))

    # ── A. 不可调用的内置构造函数 ───────────────────────────────
    for m in re.finditer(r'(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(', code):
        name = m.group(1)
        if name in BAD_CONSTRUCTORS:
            add(m.start(1), BAD_CONSTRUCTORS[name])

    # ── B. 未定义的裸函数调用 ──────────────────────────────────
    defined = set(re.findall(r'function\s+([A-Za-z_$][\w$]*)\s*\(', code))
    defined |= set(re.findall(r'var\s+([A-Za-z_$][\w$]*)\s*=\s*function', code))
    for m in re.finditer(r'(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(', code):
        name = m.group(1)
        if name in KEYWORDS or name in BAD_CONSTRUCTORS:
            continue
        if name in defined or name in CALLABLE_GLOBALS:
            continue
        add(m.start(1), f'调用了未定义的函数 `{name}`（WXS 没有这个全局函数；'
                        f'拼写错误？或该用 parseInt / parseFloat？）')

    # ── C. ES6+ 语法 ─────────────────────────────────────────
    es6 = [
        (r'\b(let|const)\s+[A-Za-z_$]', 'WXS 不支持 let / const，请用 var'),
        (r'=>', 'WXS 不支持箭头函数，请用 function'),
        (r'`', 'WXS 不支持模板字符串，请用字符串拼接'),
        (r'\.\.\.', 'WXS 不支持展开 / 剩余运算符'),
        (r'\?\.', 'WXS 不支持可选链 ?.'),
        (r'\?\?', 'WXS 不支持空值合并 ??'),
        (r'\bclass\s+[A-Za-z_$]', 'WXS 不支持 class'),
        (r'\basync\b', 'WXS 不支持 async'),
        (r'\bawait\b', 'WXS 不支持 await'),
        (r'\bfunction\s*\*', 'WXS 不支持 generator'),
    ]
    for pat, msg in es6:
        for m in re.finditer(pat, code):
            add(m.start(), msg)

    # ── D. new 表达式 ─────────────────────────────────────────
    for m in re.finditer(r'\bnew\s+([A-Za-z_$][\w$]*)', code):
        add(m.start(), f'WXS 不支持 new {m.group(1)}()，请改用基础类库提供的属性/方法')

    # ── E. 对象 / 数组字面量的尾随逗号 ──────────────────────────
    lines = code.split('\n')
    for i, line in enumerate(lines):
        if not line.rstrip().endswith(','):
            continue
        for j in range(i + 1, len(lines)):
            nxt = lines[j].strip()
            if not nxt:
                continue
            if nxt.startswith('}') or nxt.startswith(']'):
                problems.append((i + 1, len(line.rstrip()),
                                 '字面量尾随逗号：WXS 不支持，删掉这一行末尾的 `,`'))
            break

    problems.sort()
    return rel, problems


def main() -> int:
    targets = []
    for dirpath, _dirs, files in os.walk(MP):
        for fn in sorted(files):
            if fn.endswith('.wxs'):
                targets.append(os.path.join(dirpath, fn))

    if not targets:
        print('没有找到 .wxs 文件')
        return 0

    total = 0
    checked_lines = 0
    for path in targets:
        rel, problems = check_file(path)
        checked_lines += open(path, encoding='utf-8').read().count('\n') + 1
        if problems:
            total += len(problems)
            print(f'❌ {rel}')
            for line, col, msg in problems:
                print(f'   {line}:{col}  {msg}')
        else:
            print(f'✅ {rel}')

    print()
    print(f'扫描 .wxs 文件：{len(targets)} 个 / {checked_lines} 行')

    if total == 0:
        print('✅ 未发现 WXS 不支持的写法')
        return 0

    print(f'❌ 共 {total} 处问题（这些在开发者工具里可能不报，真机上会编译失败）')
    print()
    print('参考：WXS 基础类库只有 console / Math / JSON / Number(仅属性) / Date(仅属性) / Global，')
    print('      可调用的全局函数只有 Global 的 parseInt / parseFloat / isNaN / isFinite /')
    print('      decodeURI / decodeURIComponent / encodeURI / encodeURIComponent。')
    return 1


if __name__ == '__main__':
    sys.exit(main())
