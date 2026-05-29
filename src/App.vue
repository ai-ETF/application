<!--
  ============================================
  应用根组件
  ============================================

  这是 Vue 应用的根组件，负责：
  1. 应用生命周期管理（启动、显示、隐藏）
  2. 导入全局样式

  为什么没有 <template>？
  - uni-app 的 App.vue 不需要渲染内容
  - 页面内容由 pages.json 中配置的页面组件渲染
  - App.vue 只负责全局逻辑和样式

  关于路由（重要）：
  - uni-app 没有 <router-view> 或 <view-router>
  - 路由系统由框架内置，不需要手动配置
  - 路由配置在 pages.json 中：
    {
      "pages": [
        { "path": "pages/index/index" },  // 首页
        { "path": "pages/watchlist/index" }, // 自选页
        { "path": "pages/settings/index" }   // 设置页
      ]
    }
  - 框架会自动根据 pages.json：
    1. 注册路由
    2. 创建页面容器
    3. 处理页面切换

  页面切换方式：
  - uni.navigateTo({ url: '/pages/settings/index' })  // 保留当前页
  - uni.redirectTo({ url: '/pages/index/index' })     // 关闭当前页
  - uni.switchTab({ url: '/pages/index/index' })      // Tab 切换

  与传统 Vue Router 的区别：
  ┌─────────────────┬─────────────────────┬─────────────────────┐
  │                 │ Vue Router          │ uni-app             │
  ├─────────────────┼─────────────────────┼─────────────────────┤
  │ 路由配置        │ router/index.ts     │ pages.json          │
  │ 路由视图        │ <router-view>       │ 框架内置            │
  │ 页面切换        │ router.push()       │ uni.navigateTo()    │
  │ 导航栏          │ 自定义组件          │ 原生导航栏          │
  └─────────────────┴─────────────────────┴─────────────────────┘
-->

<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";
import './styles/index.scss';

/**
 * 应用生命周期：启动
 * @description 应用首次启动时触发（全局只触发一次）
 * 用途：初始化全局数据、检查登录状态、请求必要配置
 */
onLaunch(() => {
  console.log("[App] 应用启动");
});

/**
 * 应用生命周期：显示
 * @description 应用从后台进入前台时触发
 * 用途：刷新数据、恢复状态
 */
onShow(() => {
  console.log("[App] 应用显示");
});

/**
 * 应用生命周期：隐藏
 * @description 应用从前台进入后台时触发
 * 用途：保存临时数据、暂停任务
 */
onHide(() => {
  console.log("[App] 应用隐藏");
});
</script>

<style>
/*
 * 全局样式统一在 styles/index.scss 中管理
 * App.vue 无需额外定义样式
 */
</style>
