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

/**
 * 将微信客户端底层网络错误转换成可定位的提示。
 * 保留原始 errMsg 到日志中，但不记录邮箱、密码或 Token。
 */
function translateNetworkError(error: any): string {
  const errMsg = String(error?.errMsg || error?.message || '');
  const normalized = errMsg.toLowerCase();
  console.error('[useAuth] 网络请求失败:', errMsg || error);

  if (normalized.includes('domain list') || normalized.includes('url not in')) {
    return '请求域名未加入微信小程序合法域名';
  }
  if (
    normalized.includes('certificate')
    || normalized.includes('cert_')
    || normalized.includes('ssl')
    || normalized.includes('tls')
  ) {
    return 'HTTPS 安全连接失败，请联系管理员检查服务器证书';
  }
  if (normalized.includes('timeout') || normalized.includes('timed out')) {
    return '连接服务器超时，请稍后重试';
  }
  return '网络连接失败，请检查网络或联系管理员';
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
      errorMessage.value = translateNetworkError(e);
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
        // 后端当前返回 access_token，同时兼容旧版 token 字段。
        const accessToken = data.access_token || data.token;
        if (accessToken) {
          uni.setStorageSync('auth_token', accessToken);
        }
        errorMessage.value = '';
        return { error: null };
      } else {
        const msg = data?.error || data?.message || `注册失败 (HTTP ${res.statusCode})`;
        errorMessage.value = translateError(msg);
        return { error: errorMessage.value };
      }
    } catch (e: any) {
      errorMessage.value = translateNetworkError(e);
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
