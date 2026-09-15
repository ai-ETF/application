/** 当前 JWT 用户的账户概况。 */
import { get } from '@/utils/request';

export interface AccountSummary {
  cash: number;
  frozen_cash: number;
  position_value: number;
  total_assets: number;
  total_pnl: number;
  total_return_rate: number;
  position_count: number;
}

export function getAccountSummary() {
  console.log('[API] 查询当前用户账户概况');
  return get<AccountSummary>('/api/portfolio/account').then((res) => res.data);
}
