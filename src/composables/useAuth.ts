/** 认证业务逻辑：对接 FastAPI + Supabase Auth，并维护一小时本地会话。 */
import { ref } from 'vue';
import { API_BASE } from '@/config';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import { useUserStore } from '@/stores/user';
import { useWatchlistStore } from '@/stores/watchlist';
import type { AuthTokenResponse, AuthUser, RegisterResponse } from '@/types/auth';
import { accountDisplayName, accountToBackendEmail, validateUsername } from '@/utils/auth';

const errorMap: Record<string, string> = {
  'Invalid login credentials': '用户名或密码错误',
  'Email not confirmed': '账号尚未激活，请联系管理员',
  'Invalid email': '用户名格式不正确',
  'User already registered': '用户名已存在',
  'Password should be at least 6 characters': '密码至少需要 8 位',
  'Password should be at least 8 characters': '密码至少需要 8 位',
};

function translateError(message: string, statusCode?: number): string {
  if (statusCode === 409) return '用户名已存在';
  if (statusCode === 401 || statusCode === 400) return errorMap[message] || '用户名或密码错误';
  return errorMap[message] || message || '请求失败，请稍后重试';
}

function translateNetworkError(error: any): string {
  const errMsg = String(error?.errMsg || error?.message || '');
  const normalized = errMsg.toLowerCase();
  console.error('[useAuth] 网络请求失败:', errMsg || error);
  if (normalized.includes('domain list') || normalized.includes('url not in')) {
    return '请求域名未加入微信小程序合法域名';
  }
  if (normalized.includes('certificate') || normalized.includes('ssl') || normalized.includes('tls')) {
    return 'HTTPS 安全连接失败，请联系管理员检查服务器证书';
  }
  if (normalized.includes('timeout') || normalized.includes('timed out')) {
    return '连接服务器超时，请稍后重试';
  }
  return '网络连接失败，请检查网络或联系管理员';
}

function parseResponseData(raw: unknown): any {
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return { message: raw }; }
}

function responseMessage(data: any): string {
  if (typeof data?.detail === 'string') return data.detail;
  if (Array.isArray(data?.detail)) return data.detail[0]?.msg || '提交信息格式不正确';
  return data?.error || data?.message || '';
}

/** 清空所有只属于当前用户的内存状态，服务端数据不会被删除。 */
function resetUserMemory() {
  useChatStore().resetForAuthChange();
  useWatchlistStore().resetForAuthChange();
  useUserStore().clearAuth();
}

function buildUser(account: string, userId: string): AuthUser {
  const isLegacyEmail = account.includes('@');
  const displayName = accountDisplayName(account);
  return {
    id: userId,
    username: displayName,
    displayName,
    ...(isLegacyEmail ? { email: account.trim().toLowerCase() } : {}),
  };
}

export function useAuth() {
  const authStore = useAuthStore();
  const loading = ref(false);
  const errorMessage = ref('');

  function validationError(message: string) {
    errorMessage.value = message;
    return { error: message };
  }

  async function login(account: string, password: string) {
    if (!account.includes('@')) {
      const usernameError = validateUsername(account);
      if (usernameError) return validationError(usernameError);
    }
    if (!password) return validationError('请输入密码');

    console.log('[useAuth] 开始登录:', accountDisplayName(account));
    loading.value = true;
    errorMessage.value = '';
    try {
      const email = accountToBackendEmail(account);
      const res = await uni.request({
        url: `${API_BASE}/api/secure-chat/login`,
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
        data: { email, password },
        timeout: 15000,
      });
      const data = parseResponseData(res.data) as Partial<AuthTokenResponse> & Record<string, any>;
      if (res.statusCode === 200 && data.access_token && data.user_id) {
        const user = buildUser(account, data.user_id);
        resetUserMemory();
        authStore.setSession(data.access_token, user, data.expires_in);
        useUserStore().initAuth();
        console.log('[useAuth] 登录成功，用户 ID:', data.user_id);
        return { error: null, user };
      }
      errorMessage.value = translateError(responseMessage(data), res.statusCode);
      return { error: errorMessage.value };
    } catch (error: any) {
      errorMessage.value = translateNetworkError(error);
      return { error: errorMessage.value };
    } finally {
      loading.value = false;
    }
  }

  async function register(username: string, password: string) {
    const usernameError = validateUsername(username);
    if (usernameError) return validationError(usernameError);
    if (!password) return validationError('请输入密码');
    if (password.length < 8) return validationError('密码至少需要 8 位');

    console.log('[useAuth] 开始注册:', username.trim());
    loading.value = true;
    errorMessage.value = '';
    try {
      const email = accountToBackendEmail(username);
      const res = await uni.request({
        url: `${API_BASE}/api/secure-chat/register`,
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
        data: { email, password },
        timeout: 15000,
      });
      const data = parseResponseData(res.data) as RegisterResponse & Record<string, any>;
      if (res.statusCode === 200 && data.success) {
        if (data.access_token && data.user_id) {
          const user = buildUser(username, data.user_id);
          resetUserMemory();
          authStore.setSession(data.access_token, user, data.expires_in);
          useUserStore().initAuth();
          console.log('[useAuth] 注册并自动登录成功，用户 ID:', data.user_id);
          return { error: null, autoLoggedIn: true, user };
        }
        return { error: null, autoLoggedIn: false, message: data.message };
      }
      errorMessage.value = translateError(responseMessage(data), res.statusCode);
      return { error: errorMessage.value };
    } catch (error: any) {
      errorMessage.value = translateNetworkError(error);
      return { error: errorMessage.value };
    } finally {
      loading.value = false;
    }
  }

  async function logout() {
    console.log('[useAuth] 退出登录');
    loading.value = true;
    const token = authStore.session?.token || '';
    try {
      if (token) {
        await uni.request({
          url: `${API_BASE}/api/secure-chat/logout`,
          method: 'POST',
          header: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          timeout: 10000,
        });
      }
    } catch (error) {
      // 后端不可达时仍清理本地；JWT 最迟会在一小时到期。
      console.warn('[useAuth] 后端登出异常，继续清理本地会话:', error);
    } finally {
      authStore.clearAuth();
      resetUserMemory();
      loading.value = false;
    }
    return { error: null };
  }

  return { loading, errorMessage, login, register, logout };
}
