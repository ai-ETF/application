/**
 * ============================================
 * 后端 API 响应类型定义
 * ============================================
 * 仅描述后端返回的原始结构（多为 snake_case）。
 * 前端展示模型（EtfInfo / WatchlistItem 等）定义在 @/types/models.d，
 * 二者通过 store 内的适配函数转换。
 */

// ==================== 通用外壳 ====================

/**
 * 带错误外壳的响应
 * @description 行情类接口（spot）使用：{ data, error }
 */
interface ApiResult<T> {
  data: T;
  error: string | null;
}

/**
 * 列表响应外壳
 * @description 搜索、自选列表等使用：{ total, items }
 */
interface ListResponse<T> {
  total: number;
  items: T[];
}

// ==================== 行情 ====================

/**
 * 实时行情（/api/market/spot/:code 返回的 data）
 */
interface SpotQuoteRaw {
  /** 基金代码，如 "512890" */
  code: string;
  /** 基金名称 */
  name: string;
  /** 数据日期，如 "2026-07-24 00:00:00" */
  data_date?: string;
  /** 更新时间，如 "2026-07-24 10:54:48+08:00" */
  update_time?: string;
  /** 最新价 */
  price: number;
  /** 涨跌额 */
  change: number;
  /** 涨跌幅（百分比） */
  change_pct: number;
  /** 昨收 */
  prev_close?: number;
  /** 今开 */
  open?: number;
  /** 最高 */
  high?: number;
  /** 最低 */
  low?: number;
  /** 振幅（百分比） */
  amplitude?: number;
  /** 成交量 */
  volume?: number;
  /** 成交额 */
  amount?: number;
  /** 换手率（百分比） */
  turnover_rate?: number;
  /** 量比 */
  volume_ratio?: number;
  /** 主力净流入额 */
  main_inflow?: number;
  /** 主力净流入占比（百分比） */
  main_inflow_pct?: number;
  /** 总市值 */
  total_mv?: number;
  /** 流通市值 */
  float_mv?: number;
  /** 数据来源 */
  source?: string;
}

// ==================== 搜索 ====================

/**
 * 搜索结果项（/api/market/search 返回的 items 元素）
 */
interface SearchResultRaw {
  /** 基金代码 */
  code: string;
  /** 基金名称 */
  name: string;
  /** 最新价 */
  price?: number;
  /** 涨跌幅（百分比） */
  change_pct?: number;
  /** 涨跌额 */
  change?: number;
  /** 基金类型 */
  fund_type?: string | null;
  /** 净资产规模 */
  net_asset_scale?: number | null;
  /** 管理费 */
  management_fee?: number | null;
  /** 跟踪标的 */
  tracking_target?: string | null;
}

// ==================== 自选股 ====================

/**
 * 自选项（/api/watchlist/list 返回的 items 元素）
 * @description include_quote=true 时 price/change_pct/change 才有值，否则为 null
 */
interface WatchlistItemRaw {
  /** 自选记录 ID */
  id: string;
  /** 用户 ID */
  user_id: string;
  /** 基金代码 */
  fund_code: string;
  /** 基金名称 */
  fund_name: string;
  /** 排序序号 */
  sort_order: number;
  /** 创建时间 */
  created_at: string;
  /** 最新价（include_quote=true 时有值） */
  price?: number | null;
  /** 涨跌幅（include_quote=true 时有值） */
  change_pct?: number | null;
  /** 涨跌额（include_quote=true 时有值） */
  change?: number | null;
}

/**
 * 自选操作（添加/移除）响应
 */
interface WatchlistOpResult {
  /** 是否成功 */
  success: boolean;
  /** 提示信息 */
  message: string;
  /** 受影响的记录（移除时通常为 null） */
  item: WatchlistItemRaw | null;
}

/**
 * 清空自选响应
 */
interface WatchlistClearResult {
  success: boolean;
  /** 被移除的数量 */
  removed_count?: number;
}

// 导出所有类型
export {
  type ApiResult,
  type ListResponse,
  type SpotQuoteRaw,
  type SearchResultRaw,
  type WatchlistItemRaw,
  type WatchlistOpResult,
  type WatchlistClearResult,
};
