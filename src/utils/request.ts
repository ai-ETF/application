/**
 * ============================================
 * 统一 HTTP 请求模块
 * ============================================
 * 封装 uni.request，自动注入 token、处理 401 过期等全局逻辑
 */

import { API_BASE } from '@/config';

/** 401 重定向锁，防止连续触发多个跳转 */
let isRedirecting = false;

/**
 * 清除登录态并跳转到登录页
 */
function handleUnauthorized() {
  if (isRedirecting) return;
  isRedirecting = true;

  console.log('[Request] 收到 401，清除登录态并跳转登录页');
  uni.removeStorageSync('auth_token');
  uni.removeStorageSync('auth_user');

  uni.redirectTo({ url: '/pages/login/index' });

  // 延迟释放锁，确保跳转完成
  setTimeout(() => { isRedirecting = false; }, 2000);
}

/**
 * 统一请求
 * @description 比 uni.request 多了自动注入 token、401 拦截
 */
export function request<T = any>(options: UniApp.RequestOptions): Promise<UniApp.RequestSuccessCallbackResult & { data: T }> {
  const token = uni.getStorageSync('auth_token') || '';

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