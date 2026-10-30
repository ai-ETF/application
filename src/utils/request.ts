/**
 * ============================================
 * 统一 HTTP 请求模块
 * ============================================
 * 封装 uni.request，自动注入 token、处理 401 过期等全局逻辑，
 * 并在 mock 模式（USE_MOCK）下拦截请求返回本地假数据。
 */

import { API_BASE, USE_MOCK } from '@/config';
import { mockRequest } from '@/mock';
import { expireAuthAndRedirect, getAuthSession, isAuthSessionValid } from '@/utils/auth';

/**
 * secure-chat 的登录/注册/登出：其 401 属于正常业务结果（如密码错误），
 * 而非「会话过期」，不应触发自动跳转登录页。
 */
function isSecureChatAuthEndpoint(url: string): boolean {
  return /(?:^|\/)api\/secure-chat\/(login|register|logout)/.test(url);
}

/**
 * 无需前置登录态即可访问的接口：行情 + 登录/注册/登出。
 * 登录/注册本身就要在未登录时调用；登出是尽力而为，不应在会话已失效时触发跳转。
 */
function isPublicRequest(url: string): boolean {
  return /(?:^|\/)api\/market\//.test(url) || isSecureChatAuthEndpoint(url);
}

/**
 * 清除登录态并跳转到登录页
 */
function handleUnauthorized() {
  console.log('[Request] 收到 401，清除登录态并跳转登录页');
  expireAuthAndRedirect();
}

function getHttpErrorMessage(data: unknown, statusCode: number): string {
  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data === 'object') {
    const body = data as { detail?: unknown; message?: unknown; error?: unknown };
    for (const value of [body.detail, body.message, body.error]) {
      if (typeof value === 'string' && value.trim()) return value;
    }
  }
  return `请求失败（HTTP ${statusCode}）`;
}

/**
 * 统一请求
 * @description 比 uni.request 多了自动注入 token、401 拦截，以及 mock 模式拦截
 */
export function request<T = any>(options: UniApp.RequestOptions): Promise<UniApp.RequestSuccessCallbackResult & { data: T }> {
  const session = getAuthSession();
  const requestUrl = String(options.url || '');

  // mock 模式：命中本地假数据直接返回，不发起真实网络请求，也不经过鉴权
  const mock = mockRequest<T>(requestUrl, options.method || 'GET', options.data);
  if (mock) return mock;

  // 行情与登录/注册/登出为公开接口，未登录也允许访问；其余个人接口仍必须携带 JWT。
  if (!isPublicRequest(requestUrl) && !isAuthSessionValid(session)) {
    expireAuthAndRedirect();
    return Promise.reject(new Error('登录状态已过期，请重新登录'));
  }
  const token = isAuthSessionValid(session) ? session.token : '';

  // 合并请求头
  const header: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.header as Record<string, string> || {}),
  };
  if (token) {
    header['Authorization'] = `Bearer ${token}`;
  }

  return new Promise((resolve, reject) => {
    uni.request({
      ...options,
      url: options.url.startsWith('http') ? options.url : `${API_BASE}${options.url}`,
      header,
      success(res) {
        // 401 → token 过期；但登录/注册/登出的 401 是业务结果，直接透出错误
        if (res.statusCode === 401) {
          if (isSecureChatAuthEndpoint(requestUrl)) {
            const error = new Error(getHttpErrorMessage(res.data, 401)) as Error & { statusCode?: number };
            error.statusCode = 401;
            reject(error);
            return;
          }
          handleUnauthorized();
          reject(new Error('未授权，请重新登录'));
          return;
        }

        // FastAPI 的业务校验错误通常是 HTTP 400 + { detail }。统一拒绝，
        // 避免页面把没有 success 字段的错误响应误显示为交易成功。
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const error = new Error(getHttpErrorMessage(res.data, res.statusCode)) as Error & {
            statusCode?: number;
            response?: typeof res;
          };
          error.statusCode = res.statusCode;
          error.response = res;
          reject(error);
          return;
        }

        resolve(res as any);
      },
      fail(err) {
        console.error('[Request] 请求失败:', err);
        reject(err);
      },
    });
  });
}

/**
 * GET 请求简写
 */
export function get<T = any>(url: string, options?: Partial<UniApp.RequestOptions>) {
  return request<T>({ url, method: 'GET', ...options } as UniApp.RequestOptions);
}

/**
 * POST 请求简写
 */
export function post<T = any>(url: string, data?: any, options?: Partial<UniApp.RequestOptions>) {
  return request<T>({ url, method: 'POST', data, ...options } as UniApp.RequestOptions);
}

/**
 * DELETE 请求简写
 * @description 用于需要带请求体的删除接口（如 watchlist/remove）
 */
export function del<T = any>(url: string, data?: any, options?: Partial<UniApp.RequestOptions>) {
  return request<T>({ url, method: 'DELETE', data, ...options } as UniApp.RequestOptions);
}
