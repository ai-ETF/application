/**
 * ============================================
 * 组合/交易 mock 数据：/api/portfolio/*
 * ============================================
 */

import type { MockRoute } from './index';

const MOCK_USER_ID = 'mock-user-001';

const account = {
  cash: 100000.5,
  frozen_cash: 0,
  position_value: 32610,
  total_assets: 132610.5,
  total_pnl: 30,
  total_return_rate: 0.02,
  position_count: 2,
};

const positions = [
  {
    id: 'pos-1', user_id: MOCK_USER_ID, fund_code: '512890', fund_name: '华泰柏瑞红利低波ETF',
    quantity: 10000, cost_price: 1.102, cost_value: 11020, market_price: 1.152,
    market_value: 11520, pnl: 500, pnl_pct: 4.54,
    confirm_date: '2026-10-25', available_date: '2026-10-26',
    created_at: '2026-10-25 09:30:00', updated_at: '2026-10-30 14:59:00',
  },
  {
    id: 'pos-2', user_id: MOCK_USER_ID, fund_code: '510300', fund_name: '华泰柏瑞沪深300ETF',
    quantity: 5000, cost_price: 4.312, cost_value: 21560, market_price: 4.218,
    market_value: 21090, pnl: -470, pnl_pct: -2.18,
    confirm_date: '2026-10-26', available_date: '2026-10-27',
    created_at: '2026-10-26 10:00:00', updated_at: '2026-10-30 14:59:00',
  },
];

const tradeFlows = [
  {
    id: 'tf-1', user_id: MOCK_USER_ID, fund_code: '512890', fund_name: '华泰柏瑞红利低波ETF',
    direction: 'buy', amount: 11020, price: 1.102, quantity: 10000, fee: 5.51, trade_time: '2026-10-25 09:31:00',
  },
  {
    id: 'tf-2', user_id: MOCK_USER_ID, fund_code: '510300', fund_name: '华泰柏瑞沪深300ETF',
    direction: 'buy', amount: 21560, price: 4.312, quantity: 5000, fee: 10.78, trade_time: '2026-10-26 10:01:00',
  },
];

export const portfolioRoutes: MockRoute[] = [
  { method: 'GET', pattern: /^\/api\/portfolio\/account$/, handler: () => account },
  {
    method: 'GET',
    pattern: /^\/api\/portfolio\/positions$/,
    handler: () => ({
      total: positions.length,
      items: positions,
      total_pnl: positions.reduce((s, p) => s + (p.pnl || 0), 0),
      total_position_value: positions.reduce((s, p) => s + (p.market_value || 0), 0),
    }),
  },
  {
    method: 'POST',
    pattern: /^\/api\/portfolio\/apply-purchase$/,
    handler: ({ body }) => {
      const { fund_code, amount } = body || {};
      const name = fund_code === '512890' ? '华泰柏瑞红利低波ETF' : `${fund_code}ETF`;
      return {
        success: true,
        message: '申购申请已提交（mock）',
        data: {
          fund_code,
          fund_name: name,
          amount: Number(amount) || 0,
          fee: 0,
          price: 1.0,
          quantity: Number(amount) || 0,
          status: 'pending',
          confirm_date: '2026-10-31',
          available_date: '2026-11-03',
          trade_time: '2026-10-30 15:00:00',
        },
      };
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/portfolio\/apply-redeem$/,
    handler: ({ body }) => {
      const { fund_code, quantity } = body || {};
      const name = fund_code === '512890' ? '华泰柏瑞红利低波ETF' : `${fund_code}ETF`;
      return {
        success: true,
        message: '赎回申请已提交（mock）',
        data: {
          fund_code,
          fund_name: name,
          amount: Number(quantity) || 0,
          fee: 0,
          price: 1.0,
          quantity: Number(quantity) || 0,
          status: 'pending',
          confirm_date: '2026-10-31',
          available_date: '2026-11-03',
          trade_time: '2026-10-30 15:00:00',
        },
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/portfolio\/trade-flow$/,
    handler: ({ query }) => {
      const page = Number(query.page) || 1;
      const pageSize = Number(query.page_size) || 20;
      const start = (page - 1) * pageSize;
      const items = tradeFlows.slice(start, start + pageSize);
      return {
        total: tradeFlows.length,
        page,
        page_size: pageSize,
        total_pages: Math.max(1, Math.ceil(tradeFlows.length / pageSize)),
        items,
      };
    },
  },
];
