/**
 * ============================================
 * 单元 / 集成测试配置（Vitest）
 * ============================================
 * 只负责 src/ 下那些不依赖小程序运行时的纯逻辑（解码器、SSE 解析、
 * 登录态判定、请求拦截），跑在 Node 里、不需要微信开发者工具、不需要网络。
 *
 * 跑法：npm run test:unit
 *
 * ⚠️ 后缀是 `.mts` 不是 `.ts`：本项目 package.json 没有 `"type": "module"`，
 * 用 `.ts` 时 vitest 会走 Vite 的 CJS 入口，每次启动都先甩一行
 * 「The CJS build of Vite's Node API is deprecated」，在 PowerShell 里会被
 * 渲染成一段红色报错，看着像跑挂了。改成 `.mts` 让配置文件按 ESM 加载，
 * 那行就没了，行为完全一致。
 *
 * ⚠️ 与 jest.e2e.config.js 的分工必须保持清晰（见下面的 include）：
 *   - 这里只认 src 目录下 __tests__ 里的 .spec.ts
 *   - e2e 那边只认 e2e 目录下的 .e2e.js
 * 两边的匹配范围互不重叠，所以 `npm run test:unit` 永远不会误跑起真机用例，
 * 反过来也一样。
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.spec.ts'],
    // 测试里会自己伪造一个全局 uni，不需要任何小程序/浏览器环境
    globals: false,
  },
});
