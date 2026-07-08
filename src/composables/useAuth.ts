/**
 * ============================================
 * 认证 API 组合式函数
 * ============================================
 * 封装自建后端 API 的认证调用
 * 后端地址通过 config/index.ts 管理
 */

import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { API_BASE } from '@/config';

const errorMap: Record<string, string> = {
  'Invalid login credentials': '邮箱或密码错误',
  'Email not confirmed': '请先验证邮箱',
  'Invalid email': '邮箱格式不正确',
  'User already registered': '该邮箱已注册',
  'Password should be at least 6 characters': '密码至少需要 6 个字符',
};

function translateError(message: string): string {
  return errorMap[message] || message;
}

export function useAuth() {
  const authStore = useAuthStore();
  const loading = ref(false);
  const errorMessage = ref('');

  async function login(email: string, password: string) {
    console.log('[useAuth] ===== 开始登录流程 =====');

    loading.value = true;
    errorMessage.value = '';

    try {
      const res = await uni.request({
        url: `${API_BASE}/api/secure-chat/login`,
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
        data: { email, password },
      });

      let data: any;
      if (typeof res.data === 'string') {
        try { data = JSON.parse(res.data); } catch { data = { error: res.data }; }
      } else {
        data = res.data;
      }

      if (res.statusCode === 200 && data?.access_token) {
        console.log('[useAuth] ✅ 登录成功');
        authStore.setUserFromSupabase({
          id: data.user_id || email,
          email,
          user_metadata: { nickname: email.split('@')[0] },
        } as any);
        if (data.access_token) {
          uni.setStorageSync('auth_token', data.access_token);
        }
        errorMessage.value = '';
        return { error: null };
      } else {
        const msg = data?.error || data?.message || `登录失败 (HTTP ${res.statusCode})`;
        errorMessage.value = translateError(msg);
        return { error: errorMessage.value };
      }
    } catch (e: any) {
      const errMsg = e?.errMsg || e?.message || '网络连接失败，请检查网络';
      if (e?.errMsg?.includes('fail') || e?.message?.includes('NetworkError')) {
        errorMessage.value = '网络连接失败，请检查后端服务是否启动';
      } else {
        errorMessage.value = errMsg;
      }
      return { error: errorMessage.value };
    } finally {
      loading.value = false;
    }
  }

  async function register(email: string, password: string, nickname?: string) {
    console.log('[useAuth] ===== 开始注册流程 =====');

    loading.value = true;
    errorMessage.value = '';

    try {
      const res = await uni.request({
        url: `${API_BASE}/api/secure-chat/register`,
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
        data: { email, password, nickname },
      });

      let data: any;
      if (typeof res.data === 'string') {
        try { data = JSON.parse(res.data); } catch { data = { error: res.data }; }
      } else {
        data = res.data;
      }

      if (res.statusCode === 200 && data?.success === true) {
        console.log('[useAuth] ✅ 注册成功');
        authStore.setUserFromSupabase({
          id: data.user?.id || email,
          email,
          user_metadata: { nickname: data.user?.nickname || nickname || email.split('@')[0] },
        } as any);
        if (data.token) {
          uni.setStorageSync('auth_token', data.token);
        }
        errorMessage.value = '';
        return { error: null };
      } else {
        const msg = data?.error || data?.message || `注册失败 (HTTP ${res.statusCode})`;
        errorMessage.value = translateError(msg);
        return { error: errorMessage.value };
      }
    } catch (e: any) {
      errorMessage.value = e?.errMsg || '网络连接失败，请检查网络';
      return { error: errorMessage.value };
    } finally {
      loading.value = false;
    }
  }

  async function logout() {
    console.log('[useAuth] 退出登录');
    loading.value = true;

    try {
      await uni.request({
        url: `${API_BASE}/api/secure-chat/logout`,
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      console.warn('[useAuth] 登出请求异常:', e);
    }

    authStore.clearAuth();
    loading.value = false;
    return { error: null };
  }

  return {
    loading,
    errorMessage,
    login,
    register,
    logout,
  };
}