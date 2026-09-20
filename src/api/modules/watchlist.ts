/**
 * ============================================
 * 自选股 API
 * ============================================
 * 对接后端 /api/watchlist/* 接口
 * 注意：user_id 由后端从 JWT 中自动读取，前端无需传
 */

import { get, post, del } from '@/utils/request';
import type { ListResponse, WatchlistItemRaw, WatchlistOpResult, WatchlistClearResult } from '@/api/types';

/**
 * 查询自选股列表
 * @param includeQuote - 是否携带实时行情（true 时返回 price/change_pct/change）
 */
export function getWatchlist(includeQuote = true) {
  console.log('[API] 查询自选列表, include_quote=', includeQuote);
  return get<ListResponse<WatchlistItemRaw>>('/api/watchlist/list', {
    data: { include_quote: includeQuote },
  }).then(res => res.data);
}

/**
 * 添加自选股
 * @description 后端接受 fund_code，fund_name 为可选字段；传入名称可减少后端再次解析。
 * @param fundCode - 基金代码
 * @param fundName - 基金名称（可选）
 */
export function addWatchlist(fundCode: string, fundName?: string) {
  console.log('[API] 添加自选:', fundCode);
  return post<WatchlistOpResult>('/api/watchlist/add', {
    fund_code: fundCode,
    ...(fundName ? { fund_name: fundName } : {}),
  }).then(res => res.data);
}

/**
 * 移除自选股
 * @param fundCode - 基金代码
 */
export function removeWatchlist(fundCode: string) {
  console.log('[API] 移除自选:', fundCode);
  return del<WatchlistOpResult>('/api/watchlist/remove', { fund_code: fundCode }).then(res => res.data);
}

/**
 * 清空自选股
 */
export function clearWatchlist() {
  console.log('[API] 清空自选');
  return del<WatchlistClearResult>('/api/watchlist/clear').then(res => res.data);
}
