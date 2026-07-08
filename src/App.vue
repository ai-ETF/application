/**
 * ============================================
 * 应用根组件
 * ============================================

 * 负责：
 * 1. 应用生命周期管理（启动、显示、隐藏）
 * 2. 导入全局样式
 * 3. 登录状态初始化
 * 4. 路由守卫 — 未登录时拦截非白名单页面

 * 为什么没有
 * - uni-app 的 App.vue 不需要渲染内容
 * - 页面内容由 pages.json 中配置的页面组件渲染
 * - App.vue 只负责全局逻辑和样式
 */

<template>
  <!-- uni-app 需要 template 标签，即使没有内容 -->
  <view />
</template>

<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";
import './styles/index.scss';

/** 路由白名单 — 未登录可访问的页面 */
const WHITE_LIST = [
  '/pages/login/index',
  '/pages/register/index',
];

/** 应用是否已完成初始化 */
let initialized = false;

/**
 * 检查 token 是否有效
 * @description 解析 JWT 的过期时间，若已过期则视为无效
 * @returns true = 有效, false = 无效或不存在
 */
function isTokenValid(): boolean {
  const token = uni.getStorageSync('auth_token');
  if (!token) return false;

  try {
    // JWT 格式: header.payload.signature，payload 是 base64 编码的 JSON
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) return false;

    // 修复 base64 长度（uni-app 环境下可能需要补全）
    const padded = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(padded));

    // 检查过期时间
    if (payload.exp) {
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        console.log('[App] token 已过期，清除登录态');
        uni.removeStorageSync('auth_token');
        uni.removeStorageSync('auth_user');
        return false;
      }
    }

    return true;
  } catch (e) {
    console.warn('[App] token 解析失败，视为无效:', e);
    uni.removeStorageSync('auth_token');
    uni.removeStorageSync('auth_user');
    return false;
  }
}

/**
 * 跳转到登录页
 */
function redirectToLogin() {
  console.log('[App] 跳转到登录页');
  uni.redirectTo({ url: '/pages/login/index' });
}

// ==================== 路由守卫 ====================

/**
 * 劫持 uni-app 导航 API，拦截未登录访问
 * @description 对 navigateTo / redirectTo / reLaunch / switchTab 包装一层认证检查
 */
function setupAuthGuard() {
  const originals = {
    navigateTo: uni.navigateTo.bind(uni),
    redirectTo: uni.redirectTo.bind(uni),
    reLaunch:   uni.reLaunch.bind(uni),
    switchTab:  uni.switchTab.bind(uni),
  };

  const guard = (fn: typeof originals.navigateTo) => {
    return (options: UniApp.NavigateToOptions | UniApp.RedirectToOptions | UniApp.ReLaunchOptions | UniApp.SwitchTabOptions) => {
      const isValid = isTokenValid();
      const isWhite = WHITE_LIST.includes(options.url as string);

      if (!isValid && !isWhite) {
        console.log('[AuthGuard] 未登录或 token 过期，拦截跳转:', options.url);
        // 重定向到登录页
        originals.redirectTo({ url: '/pages/login/index' });
        return;
      }

      // 已登录或白名单页面：正常放行
      fn(options);
    };
  };

  uni.navigateTo = guard(originals.navigateTo);
  uni.redirectTo = guard(originals.redirectTo);
  uni.reLaunch   = guard(originals.reLaunch);
  uni.switchTab  = guard(originals.switchTab);
}

// ==================== 生命周期 ====================

/**
 * 应用生命周期：启动
 * @description 应用首次启动时触发（全局只触发一次）
 * 顺序：1. 设置路由守卫 → 2. 恢复认证状态
 */
onLaunch(() => {
  console.log("[App] 应用启动");

  // Step 1: 安装路由守卫
  setupAuthGuard();

  // Step 2: 检查 token 有效性，无效则跳转登录页
  const isValid = isTokenValid();
  console.log('[App] token 检查:', isValid ? '有效' : '无效或不存在');

  if (!isValid) {
    redirectToLogin();
  }

  initialized = true;
});

/**
 * 应用生命周期：显示
 * @description 应用从后台进入前台时触发
 */
onShow(() => {
  console.log("[App] 应用显示");

  // 应用已初始化 → 检查 token 是否有效
  if (initialized) {
    const isValid = isTokenValid();
    if (!isValid) {
      const pages = getCurrentPages();
      const currentPage = pages.length > 0 ? pages[pages.length - 1] : null;
      const currentPath = currentPage ? '/' + currentPage.route : '';

      if (currentPath && !WHITE_LIST.includes(currentPath)) {
        console.log('[App] token 无效，跳转到登录页');
        redirectToLogin();
      }
    }
  }
});

/**
 * 应用生命周期：隐藏
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
