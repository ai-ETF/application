/**
 * ============================================
 * 认证状态管理 Store
 * ============================================
 * 管理用户登录状态，持久化到 localStorage
 * 刷新页面不丢失登录态
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { User } from '@supabase/supabase-js';

export const useAuthStore = defineStore('auth', () => {
  // ==================== State ====================

  /** 当前用户信息（从 localStorage 恢复） */
  const user = ref<User | null>(JSON.parse(uni.getStorageSync('auth_user') || 'null'));

  /** 初始化加载状态（用于应用启动时恢复会话） */
  const initialized = ref<boolean>(false);

  // ==================== Getters ====================

  /** 是否已登录 */
  const isAuthenticated = computed(() => !!user.value);

  // ==================== Actions ====================

  /**
   * 从 Supabase 登录成功后设置用户状态
   * @param supabaseUser - Supabase 返回的用户对象
   */
  function setUserFromSupabase(supabaseUser: User | null) {
    console.log('[AuthStore] setUserFromSupabase 被调用', { userId: supabaseUser?.id });

    if (supabaseUser) {
      user.value = supabaseUser;
      // 持久化到 localStorage
      uni.setStorageSync('auth_user', JSON.stringify({
        id: supabaseUser.id,
        email: supabaseUser.email,
        user_metadata: supabaseUser.user_metadata,
      }));
    } else {
      user.value = null;
      uni.removeStorageSync('auth_user');
    }
  }

  /**
   * 清除用户状态（登出时调用）
   */
  function clearAuth() {
    console.log('[AuthStore] clearAuth 被调用');
    user.value = null;
    uni.removeStorageSync('auth_user');
  }

  return {
    user,
    initialized,
    isAuthenticated,
    setUserFromSupabase,
    clearAuth,
  };
});