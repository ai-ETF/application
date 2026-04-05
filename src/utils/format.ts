/**
 * ============================================
 * 格式化工具函数
 * ============================================
 * 统一的格式化方法，用于金额、百分比、日期等数据展示
 */

/**
 * 格式化金额
 * @description 将数字格式化为金额字符串，自动添加千位分隔符
 * @param {number} value - 原始数值
 * @param {number} decimals - 保留小数位数，默认 2 位
 * @param {boolean} withSymbol - 是否显示 ¥ 符号，默认 false
 * @returns {string} 格式化后的金额字符串
 * @example formatMoney(245000) => "245,000.00"
 * @example formatMoney(1250.5, 2, true) => "¥1,250.50"
 */
export function formatMoney(value: number, decimals: number = 2, withSymbol: boolean = false): string {
  if (typeof value !== 'number' || isNaN(value)) {
    return withSymbol ? '¥0.00' : '0.00';
  }
  const formatted = value.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return withSymbol ? `¥${formatted}` : formatted;
}

/**
 * 格式化百分比
 * @description 将小数或百分比值格式化为百分比字符串，自动添加正负号
 * @param {number} value - 原始数值（如 0.1245 或 12.45）
 * @param {boolean} isAlreadyPercent - 值是否已经是百分比形式（如 12.45），默认 true
 * @param {number} decimals - 保留小数位数，默认 2 位
 * @returns {string} 格式化后的百分比字符串，带正负号
 * @example formatPercent(12.45) => "+12.45%"
 * @example formatPercent(-0.15) => "-0.15%"
 * @example formatPercent(0.1245, false) => "+12.45%"
 */
export function formatPercent(value: number, isAlreadyPercent: boolean = true, decimals: number = 2): string {
  if (typeof value !== 'number' || isNaN(value)) {
    return '0.00%';
  }
  const percentValue = isAlreadyPercent ? value : value * 100;
  const fixed = percentValue.toFixed(decimals);
  const sign = percentValue > 0 ? '+' : '';
  return `${sign}${fixed}%`;
}

/**
 * 格式化份额
 * @description 将份额数值格式化为易读的字符串
 * @param {number} shares - 份额数值
 * @param {number} decimals - 保留小数位数，默认 2 位
 * @returns {string} 格式化后的份额字符串，如 "45,678.90 份"
 * @example formatShares(45678.9) => "45,678.90 份"
 */
export function formatShares(shares: number, decimals: number = 2): string {
  if (typeof shares !== 'number' || isNaN(shares)) {
    return '0.00 份';
  }
  return `${formatMoney(shares, decimals)} 份`;
}

/**
 * 判断涨跌类型
 * @description 根据数值判断是涨、跌还是平
 * @param {number} value - 涨跌数值
 * @returns {'profit' | 'loss' | 'flat'} 涨跌状态
 */
export function getChangeType(value: number): 'profit' | 'loss' | 'flat' {
  if (value > 0) return 'profit';
  if (value < 0) return 'loss';
  return 'flat';
}

/**
 * 获取涨跌颜色类名
 * @description 返回对应的 CSS class 名称，用于动态设置颜色
 * @param {number} value - 涨跌数值
 * @returns {string} CSS 类名
 */
export function getChangeColorClass(value: number): string {
  const type = getChangeType(value);
  switch (type) {
    case 'profit': return 'text-profit';
    case 'loss': return 'text-loss';
    default: return 'text-flat';
  }
}

/**
 * 格式化日期
 * @description 将日期字符串或时间戳格式化为指定格式
 * @param {string | number} date - 日期字符串或时间戳
 * @param {string} format - 目标格式，默认 "M 月 D 日"
 * @returns {string} 格式化后的日期字符串
 * @example formatDate('2024-02-27') => "2 月 27 日"
 */
export function formatDate(date: string | number, format: string = 'M 月 D 日'): string {
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) {
    return '';
  }
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();
  const year = dateObj.getFullYear();
  const hours = dateObj.getHours().toString().padStart(2, '0');
  const minutes = dateObj.getMinutes().toString().padStart(2, '0');

  return format
    .replace('YYYY', year.toString())
    .replace('MM', month.toString().padStart(2, '0'))
    .replace('M', month.toString())
    .replace('DD', day.toString().padStart(2, '0'))
    .replace('D', day.toString())
    .replace('HH', hours)
    .replace('mm', minutes);
}

/**
 * 生成唯一 ID
 * @description 生成简单的唯一标识符，用于消息等场景
 * @returns {string} 唯一 ID 字符串
 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}
