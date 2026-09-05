/**
 * ============================================
 * 行情查询工具函数
 * ============================================
 * 识别用户输入的行情/费率/榜单查询意图，
 * 调用后端 API 获取数据，返回格式化的文字结果。
 *
 * 对接后端接口：
 * - /api/market/spot/name/{name}  → 按名称查行情
 * - /api/market/spot/{code}       → 按代码查行情
 * - /api/market/detail/name/{name}→ 按名称查详情（含费率）
 * - /api/market/detail/{code}     → 按代码查详情（含费率）
 * - /api/market/ranking           → 涨幅榜
 */

import { request } from '@/utils/request';
import { API_BASE } from '@/config';

// ==================== 关键词规则 ====================

const QUOTE_KEYWORDS = [
  '涨多少', '跌多少', '涨跌', '行情', '报价', '价格',
  '多少点', '走势', '涨幅', '跌幅', '上涨', '下跌',
  '实时', '最新价', '现价', '盘中', '收盘价', '开盘价',
  '多少钱', '什么价', '价位', '现在涨', '现在跌',
  '涨了吗', '跌了吗', '涨', '跌',
];

const FEE_KEYWORDS = [
  '管理费', '托管费', '费率', '费用', '申购费', '赎回费',
  '管理费率', '托管费率', '费是多少', '费多少',
];

const RANKING_KEYWORDS = ['涨幅榜', '跌幅榜', '排行榜', '排名', '涨幅排名', '跌幅排名'];

const FUND_CODE_REGEX = /\b([56][0-9]{5}|0[0-9]{5}|1[0-9]{5})\b/;

// ==================== API 调用 ====================

/**
 * 按名称查行情
 */
async function getSpotByName(name: string) {
  const res = await request<any>({
    url: `${API_BASE}/api/market/spot/name/${encodeURIComponent(name)}`,
    method: 'GET',
  });
  return res.data;
}

/**
 * 按代码查行情
 */
async function getSpotByCode(code: string) {
  const res = await request<any>({
    url: `${API_BASE}/api/market/spot/${code}`,
    method: 'GET',
  });
  return res.data;
}

/**
 * 查基金详情（含费率）
 */
async function getFundDetail(code: string) {
  const res = await request<any>({
    url: `${API_BASE}/api/market/detail/${code}`,
    method: 'GET',
  });
  return res.data;
}

/**
 * 查涨幅榜
 */
async function getRanking(limit = 15) {
  const res = await request<any>({
    url: `${API_BASE}/api/market/ranking?limit=${limit}`,
    method: 'GET',
  });
  return res.data;
}

// ==================== 意图识别 ====================

export interface MarketIntent {
  type: 'quote' | 'fee' | 'ranking';
  keyword: string;
}

/**
 * 识别用户输入是否为行情/费率/榜单查询
 */
export function detectMarketIntent(input: string): MarketIntent | null {
  const text = input.trim();
  if (!text) return null;

  // 榜单类
  if (RANKING_KEYWORDS.some(kw => text.includes(kw))) {
    return { type: 'ranking', keyword: 'ETF' };
  }

  // 包含基金代码
  const codeMatch = text.match(FUND_CODE_REGEX);
  if (codeMatch) {
    if (QUOTE_KEYWORDS.some(kw => text.includes(kw)) || text.replace(/\s/g, '').length <= 7) {
      return { type: 'quote', keyword: codeMatch[1] };
    }
    if (FEE_KEYWORDS.some(kw => text.includes(kw))) {
      return { type: 'fee', keyword: codeMatch[1] };
    }
  }

  // 提取名称
  const name = extractEtfName(text);
  if (name) {
    if (QUOTE_KEYWORDS.some(kw => text.includes(kw))) {
      return { type: 'quote', keyword: name };
    }
    if (FEE_KEYWORDS.some(kw => text.includes(kw))) {
      return { type: 'fee', keyword: name };
    }
  }

  return null;
}

function extractEtfName(text: string): string | null {
  const allKeywords = [...QUOTE_KEYWORDS, ...FEE_KEYWORDS];
  for (const kw of allKeywords) {
    const idx = text.indexOf(kw);
    if (idx > 0) {
      const before = text.substring(0, idx)
        .replace(/[的了是在有和与及]/g, '').trim();
      if (before.length >= 2) return before;
    }
  }
  // 如果文本包含"ETF"但没有匹配到关键词，取"ETF"前面的部分
  const etfIdx = text.indexOf('ETF');
  if (etfIdx > 0) {
    const before = text.substring(0, etfIdx + 3).trim();
    if (before.length >= 3) return before;
  }
  return null;
}

// ==================== 格式化输出 ====================

/**
 * 格式化行情数据为可读文字
 */
function formatQuoteResponse(data: any): string {
  const d = data.data;
  if (!d) return '未找到该ETF的行情数据。';

  const sign = d.change >= 0 ? '+' : '';
  const dir = d.change_pct >= 0 ? '📈' : '📉';
  const time = d.update_time ? d.update_time.replace('+08:00', '').trim() : '--';

  let text = `【${d.name}（${d.code}）】${dir}\n\n`;
  text += `最新价：${d.price.toFixed(3)}\n`;
  text += `涨跌幅：${sign}${d.change_pct.toFixed(2)}%\n`;
  text += `涨跌额：${sign}${d.change.toFixed(3)}\n\n`;

  text += `━━━ 行情数据 ━━━\n`;
  text += `今开：${d.open?.toFixed(3) ?? '--'}    最高：${d.high?.toFixed(3) ?? '--'}\n`;
  text += `最低：${d.low?.toFixed(3) ?? '--'}    昨收：${d.prev_close?.toFixed(3) ?? '--'}\n`;
  text += `成交额：${formatAmount(d.amount)}      成交量：${formatVolume(d.volume)}\n`;
  text += `换手率：${d.turnover_rate?.toFixed(2) ?? '--'}%      振幅：${d.amplitude?.toFixed(2) ?? '--'}%\n\n`;

  if (d.main_inflow != null) {
    const inflowSign = d.main_inflow >= 0 ? '+' : '';
    text += `主力净流入：${inflowSign}${formatAmount(d.main_inflow)}`;
    if (d.main_inflow_pct != null) {
      text += `（${inflowSign}${d.main_inflow_pct.toFixed(2)}%）`;
    }
    text += '\n';
  }

  text += `\n⏱ 更新时间：${time}`;
  return text;
}

/**
 * 格式化费率数据
 */
function formatFeeResponse(spotData: any, detailData: any): string {
  const d = spotData.data;
  if (!d) return '未找到该基金的信息。';

  let text = `【${d.name}（${d.code}）】费率信息\n\n`;

  if (detailData) {
    if (detailData.management_fee) text += `管理费：${detailData.management_fee}\n`;
    if (detailData.custody_fee) text += `托管费：${detailData.custody_fee}\n`;
    if (detailData.subscription_fee) text += `申购费：${detailData.subscription_fee}\n`;
    if (detailData.redemption_fee) text += `赎回费：${detailData.redemption_fee}\n`;
    if (detailData.manager_company) text += `\n基金公司：${detailData.manager_company}\n`;
    if (detailData.fund_manager) text += `基金经理：${detailData.fund_manager}\n`;
    if (detailData.net_asset_scale) text += `基金规模：${detailData.net_asset_scale}\n`;
    if (detailData.tracking_target) text += `跟踪标的：${detailData.tracking_target}\n`;
  }

  return text;
}

/**
 * 格式化涨幅榜
 */
function formatRankingResponse(data: any): string {
  const items = data.items || [];
  if (items.length === 0) return '暂无涨幅榜数据。';

  let text = `📊 ETF涨幅榜 TOP${items.length}\n\n`;

  items.forEach((item: any, index: number) => {
    const sign = item.change_pct >= 0 ? '+' : '';
    text += `${index + 1}. ${item.name}（${item.code}）\n`;
    text += `   最新价 ${item.price.toFixed(3)}  |  ${sign}${item.change_pct.toFixed(2)}%\n`;
  });

  return text;
}

// ==================== 辅助函数 ====================

function formatAmount(value?: number): string {
  if (value == null) return '--';
  const abs = Math.abs(value);
  if (abs >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${(value / 1e4).toFixed(0)}万`;
  return value.toFixed(0);
}

function formatVolume(value?: number): string {
  if (value == null) return '--';
  if (value >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
  return `${(value / 1e4).toFixed(0)}万`;
}

// ==================== 主查询函数 ====================

/**
 * 统一查询函数：识别意图 → 调后端 → 返回格式化文字
 *
 * @param question - 用户输入的问题
 * @returns 格式化后的回复文字
 *
 * @example
 * const answer = await askQuestion('华泰柏瑞红利低波ETF现在涨多少')
 * const answer = await askQuestion('ETF涨幅榜')
 * const answer = await askQuestion('华泰柏瑞红利低波ETF的管理费是多少')
 */
export async function askQuestion(question: string): Promise<string> {
  const intent = detectMarketIntent(question);
  if (!intent) return '';

  console.log('[MarketQuery] 意图识别:', intent.type, intent.keyword);

  try {
    if (intent.type === 'quote') {
      const isCode = /^\d{6}$/.test(intent.keyword);
      const data = isCode
        ? await getSpotByCode(intent.keyword)
        : await getSpotByName(intent.keyword);
      return formatQuoteResponse(data);
    }

    if (intent.type === 'fee') {
      // 先查行情获取代码，再查详情
      const isCode = /^\d{6}$/.test(intent.keyword);
      let spotData, code;
      if (isCode) {
        code = intent.keyword;
        spotData = await getSpotByCode(code);
      } else {
        spotData = await getSpotByName(intent.keyword);
        code = spotData?.data?.code;
      }
      if (!code) return '未找到该基金的信息。';
      const detailData = await getFundDetail(code);
      return formatFeeResponse(spotData, detailData);
    }

    if (intent.type === 'ranking') {
      const data = await getRanking(15);
      return formatRankingResponse(data);
    }
  } catch (e: any) {
    console.error('[MarketQuery] 查询失败:', e);
    // 尝试从错误中提取信息
    if (e?.errMsg?.includes('401') || e?.statusCode === 401) {
      return '登录已过期，请重新登录后重试。';
    }
    return '查询失败，请稍后重试。';
  }

  return '';
}