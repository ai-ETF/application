---
name: performance-optimization-plan
description: 当前项目性能优化分析及改进方案
metadata:
  type: project
---

# AI-ETF 性能优化方案

**分析日期**：2026-07-08
**分析范围**：`src/` 下全部 58 个源文件

## 当前已采取的措施

| 措施 | 位置 | 效果 |
|------|------|------|
| Pinia 状态管理 | `stores/` 全部 | 响应式状态集中管理，避免组件间 prop 逐层传递 |
| SCSS 变量自动注入 | `vite.config.ts` | 所有组件无需 `@import` 变量文件，减少构建时重复解析 |
| 组件拆分 | `components/` | 粒度适中，避免大组件整体重渲染 |
| Composition API + `setup` | 所有 `.vue` | 更好的 tree-shaking 和精确的依赖追踪 |
| `marked` 在 `computed` 中运行 | `ChatMessageBubble.vue` | markdown 转 HTML 仅在 content 变化时重新计算 |
| 消息数组通过 Proxy 修改 | `stores/chat.ts` | `messages.value[botIndex] = {...}` 直接触发响应式更新 |
| SSE 流式增量更新 | `pages/index/index.vue` | 逐 token 更新 bot 消息，不等待全部完成再渲染 |
| `vite-plugin-vue-devtools` 仅开发态 | `vite.config.ts` | 不影响生产构建 |

## 当前性能问题

### 1. 消息列表全量重渲染 — ⚠️ 严重
`ChatMessageList.vue` 接收整个 `messages` 数组作为 prop，每次 onToken 回调都会触发整个列表的 diff。消息数增加到几十条时，每次 token 更新都要比较所有消息，造成明显卡顿。

### 2. `fetch` 替代 `uni.request` — ⚠️ 中等
SSE 请求使用 `fetch` API，小程序端不支持。且不经过 `src/utils/request.ts` 的 401 统一拦截。

### 3. 大量空壳文件 — ⚠️ 中等
`src/api/` 下四个文件、`useEtf.ts`、`usePortfolio.ts`、`useRequest.ts`、`utils/storage.ts`、`utils/validate.ts`、`utils/permission.ts` 都是空壳。

### 4. `watchlist` 数据在 store 中硬编码 — ⚠️ 中等
ETF 列表数据直接在组件中硬编码，上线后需要切换为后端数据。

### 5. 图片和静态资源无优化 — ⚠️ 轻微
没有图片懒加载、尺寸裁剪或 webp 转码。

### 6. `highlight.js` 全量加载 190+ 语言 — ⚠️ 轻微
构建体积 ~200KB，按需注册后可降至 ~20KB。

## 改进方案（按优先级）

### P0 — 立即优化

**1. 虚拟滚动 / 消息列表分片渲染**

当消息超过 20-30 条时，只渲染可视区域内的消息气泡 + 上下各 3 条的缓冲区。维护 `visibleMessages` 计算属性，监听 scroll 事件计算可见范围。

**2. 消息数组用 `shallowRef` + 手动触发更新**

`messages` 数组用 `shallowRef` 替代 `ref`，避免 Vue 对数组内每个对象的深层响应式包装。每次 token 更新时，手动替换数组引用来触发更新。

### P1 — 上线前完成

**3. 清理空壳文件**

删除或用实际代码填充以下文件：`api/` 下全部、`useEtf.ts`、`usePortfolio.ts`、`useRequest.ts`、`utils/storage.ts`、`utils/validate.ts`、`utils/permission.ts`、`stores/settings.ts`。

**4. 统一请求层**

把 `index.vue` 中的 SSE `fetch` 也封装到 `utils/request.ts` 中，或使用 `uni.request` 配合 SSE polyfill。实现统一的 401 拦截、token 注入、请求日志。

**5. 代码块高亮按需加载**

`highlight.js` 改为按需注册语言，只注册用到的（javascript、python、bash 等），构建体积从 ~200KB 降到 ~20KB。

### P2 — 长期优化

| 建议 | 说明 |
|------|------|
| API 响应缓存 | 自选列表、持仓数据等用 `uni.setStorageSync` 做本地缓存 |
| 组件懒加载 | 非首页页面使用 `defineAsyncComponent` 延迟加载 |
| 图片懒加载 | 卡片中的图片增加 `lazy-load` 属性 |
| 构建分包 | 小程序端将登录、注册等低频页面放入 `subPackages` |
| 类型定义集中 | 将分散在各处的 TS 接口统一到 `types/` 目录 |

### 最立竿见影的三件事

1. **消除消息列表的频繁全量 diff** — 消息越多效果越明显
2. **highlight.js 按需注册语言** — 减少 ~180KB JS 体积
3. **shallowRef 替代 ref** — 减少数组内对象的响应式代理开销
