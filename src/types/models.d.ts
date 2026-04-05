/**
 * ============================================
 * 数据模型类型定义
 * ============================================
 * 应用中使用的数据结构和接口类型
 */

// ==================== ETF 相关类型 ====================

/**
 * ETF 基础信息
 * @description ETF 基金的基本信息数据结构
 */
interface EtfInfo {
  /** ETF 名称，如 "沪深300ETF" */
  etfName: string;
  /** ETF 代码，如 "510300" */
  etfCode: string;
  /** 所属市场标签，如 "SH"(上海) / "SZ"(深圳) */
  market: string;
  /** 最新价格 */
  latestPrice: number;
  /** 最新涨跌幅（百分比），如 12.45 表示 +12.45% */
  changePercent: number;
  /** 年初至今涨跌幅（百分比） */
  ytdChangePercent: number;
  /** 迷你走势图 URL（可选） */
  miniChartUrl?: string;
}

/**
 * 自选列表项
 * @description 关注列表中每一条 ETF 数据
 */
interface WatchlistItem {
  /** ETF 名称，如 "沪深300ETF" */
  etfName: string;
  /** ETF 代码，如 "510300" */
  etfCode: string;
  /** 所属市场标签，如 "沪"(上海) / "深"(深圳) */
  market: string;
  /** 最新价格 */
  latestPrice: number;
  /** 最新涨跌幅（百分比），如 12.45 表示 +12.45% */
  changePercent: number;
  /** 年初至今涨跌幅（百分比） */
  ytdChange: number;
  /** 迷你走势图 URL（可选） */
  miniChartUrl?: string;
}

/**
 * 自选列表 Tab 类型
 * @description 用于区分关注和持仓两个 Tab
 */
type WatchlistTab = 'follow' | 'position';

// ==================== 持仓相关类型 ====================

/**
 * 持仓基金信息
 * @description 用户持有的基金详细信息
 */
interface HoldingItem {
  /** 基金全称，如 "易方达科创50A (510300)" */
  fundName: string;
  /** 基金代码 */
  fundCode: string;
  /** 持仓金额（元） */
  holdingAmount: number;
  /** 持有份额（份） */
  holdingShares: number;
  /** 昨日收益金额（元） */
  dailyProfit: number;
  /** 昨日收益率（百分比） */
  dailyProfitPercent: number;
  /** 持仓累计收益金额（元） */
  totalProfit: number;
  /** 持仓累计收益率（百分比） */
  totalProfitPercent: number;
  /** 数据更新日期 */
  updateDate: string;
}

/**
 * 持仓项类型别名
 * @description 与 HoldingItem 相同，用于组件 props 类型定义
 */
type PositionItem = HoldingItem;

/**
 * 资产总览信息
 * @description 持仓页顶部的资产汇总数据
 */
interface AssetOverview {
  /** 总资产金额（元） */
  totalAsset: number;
  /** 投资总金额（元） */
  investAmount: number;
  /** 最新收益金额（元） */
  latestProfit: number;
  /** 最新收益率（百分比） */
  latestProfitPercent: number;
  /** 持有收益金额（元） */
  holdingProfit: number;
  /** 持有收益率（百分比） */
  holdingProfitPercent: number;
  /** 累计收益金额（元） */
  cumulativeProfit: number;
  /** 累计收益率（百分比） */
  cumulativeProfitPercent: number;
  /** 数据更新时间 */
  updateTime: string;
}

/**
 * 持仓数据完整响应
 * @description 包含资产总览和持仓列表的完整数据
 */
interface PortfolioData {
  /** 资产总览 */
  overview: AssetOverview;
  /** 持仓列表 */
  holdings: HoldingItem[];
}

// ==================== 聊天相关类型 ====================

/**
 * 聊天消息类型
 */
type MessageType = 'text' | 'image' | 'card' | 'system';

/**
 * 聊天消息发送方类型
 * @description user 表示用户发送，bot 表示 AI 助手发送
 */
type MessageSender = 'user' | 'bot';

/**
 * 聊天消息
 * @description AI 聊天中的单条消息
 */
interface ChatMessage {
  /** 消息唯一 ID */
  id: string;
  /** 消息发送方类型：user（用户） 或 bot（AI助手） */
  type: MessageSender;
  /** 消息内容 */
  content: string;
  /** 发送时间戳 */
  timestamp: number;
  /** 附加数据（如卡片内容等） */
  extra?: Record<string, any>;
}

// ==================== 用户相关类型 ====================

/**
 * 用户信息
 * @description 用户的基本个人信息
 */
interface UserInfo {
  /** 用户唯一标识 */
  userId: string;
  /** 用户昵称 */
  nickname: string;
  /** 头像 URL */
  avatar: string;
  /** 手机号（脱敏显示） */
  phone?: string;
  /** 风险等级，1-5 对应保守到激进 */
  riskLevel?: number;
  /** 是否完成风险测评 */
  hasRiskAssessment: boolean;
}

// ==================== 底部导航栏类型 ====================

/**
 * 导航栏 Tab 项
 * @description 底部导航栏的每个 Tab 配置
 */
interface TabBarItem {
  /** Tab 唯一标识 */
  key: string;
  /** Tab 显示文字 */
  label: string;
  /** Tab 图标名称（lucide 图标集） */
  icon: string;
  /** 跳转路径 */
  path: string;
}

/**
 * 当前激活的 Tab
 * @description 用于导航栏高亮显示
 */
type ActiveTab = 'chat' | 'watchlist' | 'temperature' | 'settings';

// 导出所有类型，使文件成为模块
export {
  type EtfInfo,
  type WatchlistItem,
  type WatchlistTab,
  type HoldingItem,
  type PositionItem,
  type AssetOverview,
  type PortfolioData,
  type MessageType,
  type MessageSender,
  type ChatMessage,
  type UserInfo,
  type TabBarItem,
  type ActiveTab,
};
