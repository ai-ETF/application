/**
 * ============================================
 * Mock 数据路由（仅 USE_MOCK=true 时生效）
 * ============================================
 * 按「请求方法 + 路径」匹配请求，返回本地假数据，
 * 使前端开发完全脱离后端，业务代码对 mock 无感知。
 *
 * 对接方式：src/utils/request.ts 在发真实请求前调用 mockRequest()，
 * 命中路由则直接返回假数据，未命中则走真实网络请求。
 */

import { USE_MOCK } from '@/config';
import { marketRoutes } from './market';
import { watchlistRoutes } from './watchlist';
import { portfolioRoutes } from './portfolio';
import { riskRoutes } from './risk';
import { secureChatRoutes } from './secure-chat';

/** 单个 mock 路由处理器的上下文 */
export interface MockContext {
  /** 路径正则的完整匹配结果，match[1] 起为捕获组 */
  match: RegExpMatchArray;
  /** 解析后的查询参数（含 GET 请求的 data 参数） */
  query: Record<string, string>;
  /** 请求体（POST/DELETE 的 data） */
  body: any;
}

/** mock 路由定义 */
export interface MockRoute {
  method: 'GET' | 'POST' | 'DELETE';
  pattern: RegExp;
  handler: (ctx: MockContext) => unknown;
}

const routes: MockRoute[] = [
  ...marketRoutes,
  ...watchlistRoutes,
  ...portfolioRoutes,
  ...riskRoutes,
  ...secureChatRoutes,
];

/** 模拟网络延迟，避免「瞬时返回」掩盖 loading / 骨架屏等异步态缺陷 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 把完整 URL 或相对路径规整为 path + query，忽略 baseURL */
function normalizeUrl(url: string): { path: string; query: Record<string, string> } {
  const raw = url.startsWith('http') ? url.replace(/^https?:\/\/[^/]+/, '') : url;
  const [pathname = '', queryString = ''] = raw.split('?');
  const query: Record<string, string> = {};
  if (queryString) {
    queryString.split('&').forEach((pair) => {
      const [k, v = ''] = pair.split('=');
      if (k) query[decodeURIComponent(k)] = decodeURIComponent(v);
    });
  }
  return { path: pathname, query };
}

/** 匹配 mock 路由，返回响应数据（即 uni.request 成功回调中的 res.data），未命中返回 null */
export function matchMock(url: string, method = 'GET', body?: unknown): unknown | null {
  if (!USE_MOCK) return null;
  const { path, query } = normalizeUrl(url);
  const upperMethod = method.toUpperCase();

  // GET 请求的参数通过 options.data 传递（如搜索 keyword、分页 page），需并入 query
  if (upperMethod === 'GET' && body && typeof body === 'object' && !Array.isArray(body)) {
    Object.entries(body as Record<string, unknown>).forEach(([k, v]) => {
      if (v !== undefined && v !== null) query[k] = String(v);
    });
  }

  for (const route of routes) {
    if (route.method !== upperMethod) continue;
    const match = path.match(route.pattern);
    if (match) return route.handler({ match, query, body });
  }
  return null;
}

/**
 * mock 请求入口：供 request.ts 调用，命中时带延迟返回模拟的成功回调结果
 */
export function mockRequest<T = any>(
  url: string,
  method = 'GET',
  body?: unknown,
): Promise<UniApp.RequestSuccessCallbackResult & { data: T }> | null {
  const data = matchMock(url, method, body);
  if (data === null) return null;
  return sleep(180 + Math.random() * 120).then(() => ({
    data: data as T,
    statusCode: 200,
    header: {},
    cookies: [],
    errMsg: 'request:ok',
  }) as UniApp.RequestSuccessCallbackResult & { data: T });
}
