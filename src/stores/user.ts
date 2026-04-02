/**
 * ============================================
 * 用户状态管理 Store
 * ============================================
 * 管理用户基本信息、登录状态等全局状态
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { UserInfo } from '@/types/models.d';

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
   */
  function setUserInfo(info: Partial<UserInfo>) {
    userInfo.value = { ...userInfo.value, ...info };
  }

  /**
   * 设置认证令牌
   * @param newToken - 认证令牌
   */
  function setToken(newToken: string) {
    token.value = newToken;
    // 持久化到本地存储
    uni.setStorageSync('token', newToken);
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
    uni.removeStorageSync('token');
    uni.removeStorageSync('userInfo');
  }

  /**
   * 初始化用户状态
   * @description 从本地存储恢复登录状态
   */
  function initAuth() {
    const savedToken = uni.getStorageSync('token');
    const savedUserInfo = uni.getStorageSync('userInfo');
    if (savedToken) {
      token.value = savedToken;
    }
    if (savedUserInfo) {
      try {
        userInfo.value = JSON.parse(savedUserInfo);
      } catch (e) {
        console.warn('[UserStore] 解析本地用户信息失败:', e);
      }
    }
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
