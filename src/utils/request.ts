/**
 * ============================================
 * 统一 HTTP 请求模块
 * ============================================
 * 封装 uni.request，自动注入 token、处理 401 过期等全局逻辑
 */

import { API_BASE } from '@/config';
import { expireAuthAndRedirect, getAuthSession, isAuthSessionValid } from '@/utils/auth';

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
 * @description 比 uni.request 多了自动注入 token、401 拦截
 */
export function request<T = any>(options: UniApp.RequestOptions): Promise<UniApp.RequestSuccessCallbackResult & { data: T }> {
  const session = getAuthSession();
  // 行情接口是公开数据，未登录也允许浏览/搜索；自选、组合交易等个人接口仍必须携带 JWT。
  const requestUrl = String(options.url || '');
  const isPublicMarketRequest = /(?:^|\/)api\/market\//.test(requestUrl);
  if (!isPublicMarketRequest && !isAuthSessionValid(session)) {
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
        // 401 → token 过期
        if (res.statusCode === 401) {
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
