/**
 * ============================================
 * 应用配置
 * ============================================
 * 集中管理所有全局配置常量。
 * 环境相关配置通过 Vite 的 import.meta.env 构建期注入，
 * 分别来自 .env.development / .env.production。
 */

const env = import.meta.env;

/** 后端 API 基础地址（构建期注入，兜底为线上地址） */
export const API_BASE = (env.VITE_API_BASE || 'https://ai-etf.xyz') as string;

/** 是否启用 mock 模式（默认关闭，仅开发环境开启） */
export const USE_MOCK = env.VITE_USE_MOCK === 'true';

/** 是否为开发环境（Vite 注入） */
export const IS_DEV = env.DEV === true;
