<template>
  <view />
</template>

<script setup lang="ts">
import { onHide, onLaunch, onShow } from '@dcloudio/uni-app';
import { useAuthStore } from '@/stores/auth';
import { clearAuthSession, isAuthSessionValid } from '@/utils/auth';
import './styles/index.scss';

const WHITE_LIST = ['/pages/login/index', '/pages/register/index'];
let initialized = false;

function normalizePath(url: string): string {
  return url.split('?')[0];
}

function currentPath(): string {
  const pages = getCurrentPages();
  const currentPage = pages.length ? pages[pages.length - 1] : null;
  return currentPage?.route ? `/${currentPage.route}` : '';
}

function redirectToLogin() {
  const path = currentPath();
  if (WHITE_LIST.includes(path)) return;
  console.log('[App] 登录态无效，跳转登录页');
  uni.reLaunch({ url: '/pages/login/index' });
}

/** 统一包装导航 API，防止未登录用户直接进入业务页。 */
function setupAuthGuard() {
  const originals = {
    navigateTo: uni.navigateTo.bind(uni),
    redirectTo: uni.redirectTo.bind(uni),
    reLaunch: uni.reLaunch.bind(uni),
    switchTab: uni.switchTab.bind(uni),
  };

  const guard = (fn: Function) => (options: { url: string; [key: string]: any }) => {
    const isWhite = WHITE_LIST.includes(normalizePath(options.url));
    if (!isWhite && !isAuthSessionValid()) {
      clearAuthSession();
      console.log('[AuthGuard] 拦截未授权页面:', options.url);
      originals.reLaunch({ url: '/pages/login/index' });
      return;
    }
    fn(options);
  };

  uni.navigateTo = guard(originals.navigateTo) as typeof uni.navigateTo;
  uni.redirectTo = guard(originals.redirectTo) as typeof uni.redirectTo;
  uni.reLaunch = guard(originals.reLaunch) as typeof uni.reLaunch;
  uni.switchTab = guard(originals.switchTab) as typeof uni.switchTab;
}

onLaunch(() => {
  console.log('[App] 应用启动');
  setupAuthGuard();
  const restored = useAuthStore().restoreSession();
  console.log('[App] 登录态恢复:', restored ? '有效' : '无效');
  if (!restored) redirectToLogin();
  initialized = true;
});

onShow(() => {
  if (!initialized) return;
  const valid = isAuthSessionValid();
  const path = currentPath();
  if (!valid) {
    clearAuthSession();
    redirectToLogin();
    return;
  }

  // 有效登录态重新打开小程序时，不停留在登录或注册页。
  if (WHITE_LIST.includes(path)) {
    uni.reLaunch({ url: '/pages/index/index' });
  }
});

onHide(() => {
  console.log('[App] 应用隐藏');
});
</script>

<style>
/* 全局样式由 styles/index.scss 管理。 */
</style>
