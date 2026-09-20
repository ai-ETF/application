/**
 * ============================================
 * 认证状态管理 Store
 * ============================================
 * 管理当前用户与一小时登录会话。
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { AuthSession, AuthUser } from '@/types/auth';
import {
  clearAuthSession,
  getAuthSession,
  isAuthSessionValid,
  saveAuthSession,
} from '@/utils/auth';

export const useAuthStore = defineStore('auth', () => {
  // ==================== State ====================

  /** 当前用户信息 */
  const user = ref<AuthUser | null>(null);

  /** 当前会话 */
  const session = ref<AuthSession | null>(null);

  /** 初始化加载状态（用于应用启动时恢复会话） */
  const initialized = ref<boolean>(false);

  // ==================== Getters ====================

  /** 是否已登录 */
  const isAuthenticated = computed(() => Boolean(user.value && isAuthSessionValid(session.value)));

  // ==================== Actions ====================

  /**
   * 从 Supabase 登录成功后设置用户状态
   * @param supabaseUser - Supabase 返回的用户对象
   */
  function setSession(token: string, authUser: AuthUser, expiresIn?: number | null) {
    console.log('[AuthStore] 设置用户会话:', authUser.id);
    session.value = saveAuthSession(token, authUser, expiresIn);
    user.value = authUser;
    initialized.value = true;
  }

  /** 从小程序本地存储恢复仍在有效期内的会话。 */
  function restoreSession(): boolean {
    const stored = getAuthSession();
    if (!isAuthSessionValid(stored)) {
      clearAuth();
      initialized.value = true;
      return false;
    }
    session.value = stored;
    user.value = stored.user;
    initialized.value = true;
    console.log('[AuthStore] 已恢复用户会话:', stored.user.id);
    return true;
  }

  /**
   * 清除用户状态（登出时调用）
   */
  function clearAuth() {
    console.log('[AuthStore] clearAuth 被调用');
    user.value = null;
    session.value = null;
    clearAuthSession();
  }

  return {
    user,
    session,
    initialized,
    isAuthenticated,
    setSession,
    restoreSession,
    clearAuth,
  };
});
