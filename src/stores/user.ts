/**
 * ============================================
 * 用户状态管理 Store
 * ============================================
 * 管理用户基本信息、登录状态等全局状态
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { UserInfo } from '@/types/models.d';
import { getAuthSession, getUserScopedStorageKey, isAuthSessionValid } from '@/utils/auth';

/**
 * 用户状态 Store
 * @description 管理用户信息和认证状态
 */
export const useUserStore = defineStore('user', () => {
  // ==================== State ====================

  /** 用户信息 */
  const userInfo = ref<UserInfo>({
    userId: '',
    nickname: '未登录',
    avatar: '',
    hasRiskAssessment: false,
  });

  /** 认证令牌 */
  const token = ref<string>('');

  /** 是否已登录 */
  const isLoggedIn = computed(() => !!token.value);

  // ==================== Actions ====================

  /**
   * 设置用户信息
   * @param info - 用户信息对象
   * @description 同时持久化到本地存储，保证刷新/重启后 hasRiskAssessment 等字段不丢失
   */
  function setUserInfo(info: Partial<UserInfo>) {
    userInfo.value = { ...userInfo.value, ...info };
    // 按登录用户隔离本地展示状态，避免 A 用户状态泄漏给 B 用户。
    const key = getUserScopedStorageKey('user_info', userInfo.value.userId);
    uni.setStorageSync(key, JSON.stringify(userInfo.value));
  }

  /**
   * 设置认证令牌
   * @param newToken - 认证令牌
   */
  function setToken(newToken: string) {
    token.value = newToken;
  }

  /**
   * 清除用户状态（登出时调用）
   */
  function clearAuth() {
    token.value = '';
    userInfo.value = {
      userId: '',
      nickname: '未登录',
      avatar: '',
      hasRiskAssessment: false,
    };
  }

  /**
   * 初始化用户状态
   * @description 从本地存储恢复登录状态
   */
  function initAuth() {
    const session = getAuthSession();
    if (!isAuthSessionValid(session)) {
      clearAuth();
      return;
    }

    token.value = session.token;
    const savedUserInfo = uni.getStorageSync(getUserScopedStorageKey('user_info', session.user.id));
    if (savedUserInfo) {
      try {
        userInfo.value = JSON.parse(savedUserInfo);
        return;
      } catch (e) {
        console.warn('[UserStore] 解析本地用户信息失败:', e);
      }
    }

    userInfo.value = {
      userId: session.user.id,
      nickname: session.user.displayName,
      avatar: '',
      hasRiskAssessment: false,
    };
  }

  return {
    userInfo,
    token,
    isLoggedIn,
    setUserInfo,
    setToken,
    clearAuth,
    initAuth,
  };
});
