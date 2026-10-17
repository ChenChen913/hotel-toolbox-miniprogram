import { defineConfig } from 'vitest/config';

// 测试跑在纯 node 环境：core/ 必须保持零 wx 依赖，否则用例会挂。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // 只有两个测试文件，串行跑耗时可忽略；并行时 vitest 会并发写临时目录，
    // 在部分 Windows 环境（沙箱 / 杀软）下偶发 EPERM，关掉并行保证结果稳定。
    fileParallelism: false,
  },
});
