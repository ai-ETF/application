/**
 * ============================================
 * 自选股 mock 数据：/api/watchlist/*（内存态，支持增删改）
 * ============================================
 */

import type { MockRoute } from './index';

const MOCK_USER_ID = 'mock-user-001';

// 内存中的自选列表；add/remove/clear 会就地变更，便于联调
let seq = 100;
const watchlist = [
  {
    id: 'wl-1', user_id: MOCK_USER_ID, fund_code: '512890', fund_name: '华泰柏瑞红利低波ETF',
    sort_order: 0, created_at: '2026-10-28 10:00:00', price: 1.152, change_pct: 0.87, change: 0.01,
  },
  {
    id: 'wl-2', user_id: MOCK_USER_ID, fund_code: '510300', fund_name: '华泰柏瑞沪深300ETF',
    sort_order: 1, created_at: '2026-10-28 10:05:00', price: 4.218, change_pct: -0.34, change: -0.014,
  },
];

export const watchlistRoutes: MockRoute[] = [
  {
    method: 'GET',
    pattern: /^\/api\/watchlist\/list$/,
    handler: () => ({
      total: watchlist.length,
      items: watchlist.map((it, i) => ({ ...it, sort_order: i })),
    }),
  },
  {
    method: 'POST',
    pattern: /^\/api\/watchlist\/add$/,
    handler: ({ body }) => {
      const { fund_code, fund_name } = body || {};
      if (!fund_code) return { success: false, message: '缺少基金代码', item: null };
      if (watchlist.some((it) => it.fund_code === fund_code)) {
        return { success: false, message: '该基金已在自选中', item: null };
      }
      const item = {
        id: `wl-${seq++}`,
        user_id: MOCK_USER_ID,
        fund_code,
        fund_name: fund_name || `${fund_code}ETF`,
        sort_order: watchlist.length,
        created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        price: 1.0,
        change_pct: 0,
        change: 0,
      };
      watchlist.push(item);
      return { success: true, message: '已添加自选', item };
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/watchlist\/remove$/,
    handler: ({ body }) => {
      const { fund_code } = body || {};
      const idx = watchlist.findIndex((it) => it.fund_code === fund_code);
      if (idx < 0) return { success: false, message: '该基金不在自选中', item: null };
      const [item] = watchlist.splice(idx, 1);
      return { success: true, message: '已移除自选', item };
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/watchlist\/clear$/,
    handler: () => {
      const removed = watchlist.length;
      watchlist.length = 0;
      return { success: true, removed_count: removed };
    },
  },
];
