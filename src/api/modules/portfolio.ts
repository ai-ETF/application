/** 当前 JWT 用户的账户概况。 */
import { get, post } from '@/utils/request';

export interface AccountSummary {
  cash: number;
  frozen_cash: number;
  position_value: number;
  total_assets: number;
  total_pnl: number;
  total_return_rate: number;
  position_count: number;
}

export interface PositionSummary {
  id: string;
  user_id: string;
  fund_code: string;
  fund_name: string;
  quantity: number;
  cost_price: number;
  cost_value?: number | null;
  market_price?: number | null;
  market_value?: number | null;
  pnl?: number | null;
  pnl_pct?: number | null;
  confirm_date?: string | null;
  available_date?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PositionListResponse {
  total: number;
  items: PositionSummary[];
  total_pnl: number;
  total_position_value: number;
}

export interface OrderResult {
  fund_code: string;
  fund_name: string;
  amount: number;
  fee: number;
  net_amount?: number | null;
  price: number;
  quantity?: number | null;
  hold_days?: number | null;
  trade_pnl?: number | null;
  position_qty?: number | null;
  cost_price?: number | null;
  confirm_date?: string | null;
  available_date?: string | null;
  settle_date?: string | null;
  cash_remaining?: number | null;
  frozen_cash?: number | null;
  status: string;
  trade_time?: string | null;
}

export interface OrderResponse {
  success: boolean;
  message: string;
  data?: OrderResult | null;
}

export interface TradeFlowItem {
  id: string;
  user_id: string;
  fund_code: string;
  fund_name: string;
  direction: string;
  amount: number;
  price: number;
  quantity: number;
  fee: number;
  trade_time: string;
}

export interface TradeFlowResponse {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  items: TradeFlowItem[];
}

export function getAccountSummary() {
  console.log('[API] 查询当前用户账户概况');
  return get<AccountSummary>('/api/portfolio/account').then((res) => res.data);
}

export function getPositions() {
  return get<PositionListResponse>('/api/portfolio/positions', {
    data: { include_quote: true },
  }).then(res => res.data);
}

export function applyPurchase(fundCode: string, amount: number) {
  return post<OrderResponse>('/api/portfolio/apply-purchase', {
    fund_code: fundCode,
    amount,
  }).then(res => res.data);
}

export function applyRedeem(fundCode: string, quantity: number) {
  return post<OrderResponse>('/api/portfolio/apply-redeem', {
    fund_code: fundCode,
    quantity,
  }).then(res => res.data);
}

export function getTradeFlow(page = 1, pageSize = 20) {
  return get<TradeFlowResponse>('/api/portfolio/trade-flow', {
    data: { page, page_size: pageSize },
  }).then(res => res.data);
}
