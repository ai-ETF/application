/**
 * ============================================
 * Vue 应用入口文件 (所有平台共用)
 * ============================================
 *
 * 这是 uni-app 的真正入口，所有平台都会执行此文件：
 * - H5 平台：由 index.html 加载
 * - 小程序平台：由原生框架加载
 * - App 平台：由原生应用加载
 *
 * 执行流程：
 * 1. 创建 Vue 实例 (createSSRApp)
 * 2. 挂载根组件 (App.vue)
 * 3. 框架自动根据 pages.json 配置路由
 * 4. 渲染页面组件到对应的页面容器
 *
 * 关于路由：
 * - uni-app 没有 <router-view>，路由由框架内置管理
 * - 路由配置在 pages.json 中定义
 * - 页面切换通过 uni.navigateTo 等 API 实现
 *
 * 为什么用 createSSRApp 而非 createApp？
 * - SSR = Server-Side Rendering（服务端渲染）
 * - uni-app 支持跨平台，需要兼容 SSR 模式
 * - 小程序/App 可能需要预渲染优化性能
 */

import { createSSRApp } from "vue";
import App from "./App.vue";

/**
 * 创建应用实例
 * @returns {app} Vue 应用实例
 *
 * 注意：uni-app 要求导出 createApp 函数
 * 框架会在不同平台调用此函数来初始化应用
 */
export function createApp() {
  // 创建支持 SSR 的 Vue 应用实例
  const app = createSSRApp(App);

  // 返回应用实例（框架会自动处理挂载逻辑）
  return {
    app,
  };
}
