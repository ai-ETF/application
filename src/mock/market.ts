/**
 * ============================================
 * 行情类 mock 数据：/api/market/*
 * ============================================
 * 覆盖：实时行情(spot)、搜索(search)、详情(detail)、K线(kline)、涨幅榜(ranking)
 */

import type { MockRoute } from './index';

interface MockEtfInfo {
  name: string;
  price: number;
  changePct: number;
}

// 固定样例 ETF：代码 → 名称 / 最新价 / 涨跌幅
const MOCK_ETFS: Record<string, MockEtfInfo> = {
  '512890': { name: '华泰柏瑞红利低波ETF', price: 1.152, changePct: 0.87 },
  '510300': { name: '华泰柏瑞沪深300ETF', price: 4.218, changePct: -0.34 },
  '159915': { name: '易方达创业板ETF', price: 2.106, changePct: 1.42 },
  '588000': { name: '华夏科创50ETF', price: 1.083, changePct: -1.15 },
  '513100': { name: '国泰纳斯达克100ETF', price: 1.876, changePct: 0.53 },
};

/** 构造一条实时行情数据 */
function makeSpot(code: string): any {
  const etf = MOCK_ETFS[code] || { name: `${code}ETF`, price: 1.0, changePct: 0 };
  const price = etf.price;
  const changePct = etf.changePct;
  const change = +(price * changePct / 100).toFixed(4);
  const prevClose = +(price - change).toFixed(4);
  const open = +(prevClose * (1 + changePct / 200)).toFixed(4);
  const high = +(Math.max(prevClose, price) * 1.008).toFixed(4);
  const low = +(Math.min(prevClose, price) * 0.992).toFixed(4);
  return {
    code,
    name: etf.name,
    data_date: '2026-10-30',
    update_time: '2026-10-30 14:59:00+08:00',
    price,
    change,
    change_pct: changePct,
    prev_close: prevClose,
    open,
    high,
    low,
    amplitude: +((high - low) / prevClose * 100).toFixed(2),
    volume: 5000000 + Math.round(price * 1000000),
    amount: (5000000 + Math.round(price * 1000000)) * price,
    turnover_rate: +(Math.random() * 3 + 1).toFixed(2),
    volume_ratio: +(Math.random() * 2 + 0.5).toFixed(2),
    main_inflow: Math.round((changePct >= 0 ? 1 : -1) * Math.abs(changePct) * 3000000),
    main_inflow_pct: Math.abs(changePct),
    total_mv: Math.round(price * 1e9),
    float_mv: Math.round(price * 0.8e9),
    source: 'mock',
  };
}

/** 构造详情数据（含费率、实时行情、净值历史） */
function makeDetail(code: string): any {
  const etf = MOCK_ETFS[code] || { name: `${code}ETF`, price: 1.0, changePct: 0 };
  const navHistory = Array.from({ length: 20 }, (_, i) => {
    const nav = +(1 + Math.sin(i / 3) * 0.05).toFixed(4);
    return {
      fund_code: code,
      date: `2026-10-${String(29 - i).padStart(2, '0')}`,
      nav,
      accumulated_nav: +(nav * 1.2).toFixed(4),
      daily_growth: +((Math.random() - 0.45) * 2).toFixed(4),
    };
  });
  return {
    code,
    full_name: etf.name,
    short_name: etf.name,
    fund_type: 'ETF',
    issue_date: '2020-01-15',
    establish_date: '2020-03-20',
    net_asset_scale: '58.6亿',
    share_scale: '50.2亿份',
    manager_company: '华泰柏瑞基金管理有限公司',
    custodian: '中国建设银行',
    fund_manager: '张三',
    dividend_history: '近一年每份分红0.03元',
    management_fee: '0.50%/年',
    custody_fee: '0.10%/年',
    subscription_fee: '无（二级市场买入）',
    purchase_fee: '无',
    redemption_fee: '无（二级市场卖出）',
    benchmark: '中证红利低波动指数',
    tracking_target: '中证红利低波动指数',
    realtime: makeSpot(code),
    nav_history: navHistory,
    source: 'mock',
  };
}

/** 构造 K 线数据 */
function makeKline(code: string, limit = 60): any {
  const base = MOCK_ETFS[code]?.price || 1.0;
  const count = Math.min(limit, 60);
  const items = Array.from({ length: count }, (_, i) => {
    const close = +(base * (1 + Math.sin(i / 5) * 0.03 + (Math.random() - 0.5) * 0.01)).toFixed(4);
    const open = +(close * (1 + (Math.random() - 0.5) * 0.01)).toFixed(4);
    const high = +Math.max(open, close, close * 1.01).toFixed(4);
    const low = +Math.min(open, close, close * 0.99).toFixed(4);
    const change = +(close - base).toFixed(4);
    return {
      date: `2026-10-${String(30 - i).padStart(2, '0')}`,
      open,
      close,
      high,
      low,
      volume: Math.round(1e6 + Math.random() * 5e6),
      amount: Math.round((1e6 + Math.random() * 5e6) * close),
      amplitude: +(((high - low) / base) * 100).toFixed(2),
      change_pct: +((change / base) * 100).toFixed(2),
      change,
      turnover_rate: +(Math.random() * 3 + 1).toFixed(2),
    };
  });
  return {
    code,
    name: MOCK_ETFS[code]?.name || `${code}ETF`,
    period: 'daily',
    total: items.length,
    items,
  };
}

export const marketRoutes: MockRoute[] = [
  // 按代码查行情
  {
    method: 'GET',
    pattern: /^\/api\/market\/spot\/([^/]+)$/,
    handler: ({ match }) => ({ data: makeSpot(decodeURIComponent(match[1])), error: null }),
  },
  // 按名称查行情（模糊匹配第一条样例）
  {
    method: 'GET',
    pattern: /^\/api\/market\/spot\/name\/(.+)$/,
    handler: ({ match }) => {
      const name = decodeURIComponent(match[1]);
      const code = Object.keys(MOCK_ETFS).find((c) => MOCK_ETFS[c].name.includes(name)) || '512890';
      return { data: makeSpot(code), error: null };
    },
  },
  // 搜索
  {
    method: 'GET',
    pattern: /^\/api\/market\/search$/,
    handler: ({ query }) => {
      const keyword = query.keyword || '';
      const items = Object.entries(MOCK_ETFS)
        .filter(([code, etf]) => etf.name.includes(keyword) || code.includes(keyword))
        .map(([code, etf]) => ({
          code,
          name: etf.name,
          price: etf.price,
          change_pct: etf.changePct,
          change: +(etf.price * etf.changePct / 100).toFixed(4),
          fund_type: 'ETF',
          net_asset_scale: 5.86e9,
          management_fee: 0.005,
          tracking_target: '指数',
          tradeable: true,
          data_source: 'market_quote',
        }));
      return { total: items.length, items };
    },
  },
  // 详情
  {
    method: 'GET',
    pattern: /^\/api\/market\/detail\/([^/]+)$/,
    handler: ({ match }) => makeDetail(decodeURIComponent(match[1])),
  },
  // K 线
  {
    method: 'GET',
    pattern: /^\/api\/market\/kline\/([^/]+)$/,
    handler: ({ match, query }) => makeKline(decodeURIComponent(match[1]), Number(query.limit) || 60),
  },
  // 涨幅榜
  {
    method: 'GET',
    pattern: /^\/api\/market\/ranking$/,
    handler: () => ({
      items: Object.entries(MOCK_ETFS).map(([code, etf]) => ({
        code,
        name: etf.name,
        price: etf.price,
        change_pct: etf.changePct,
        change: +(etf.price * etf.changePct / 100).toFixed(4),
      })),
    }),
  },
];
