/**
 * ============================================
 * 市场行情 API
 * ============================================
 * 对接后端 /api/market/* 接口
 */

import { get } from '@/utils/request';
import type { ApiResult, SpotQuoteRaw, SearchResultRaw, ListResponse } from '@/api/types';

/**
 * 按代码查询实时行情
 * @param code - 基金代码，如 "512890"
 * @returns { data: SpotQuoteRaw, error: string | null }
 */
export function getSpot(code: string) {
  console.log('[API] 请求实时行情:', code);
  return get<ApiResult<SpotQuoteRaw>>(`/api/market/spot/${code}`).then(res => res.data);
}

/**
 * 搜索 ETF（关键词可为名称或代码）
 * @param keyword - 搜索关键词
 * @param topN - 返回条数，默认 10
 */
export function searchEtf(keyword: string, topN = 10) {
  console.log('[API] 搜索 ETF:', keyword, 'top_n=', topN);
  return get<ListResponse<SearchResultRaw>>('/api/market/search', {
    data: { keyword, top_n: topN },
  }).then(res => res.data);
}
