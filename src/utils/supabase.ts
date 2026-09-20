/**
 * Supabase 客户端初始化
 * ============================================
 * TODO: 待后续接入 Supabase 时配置真实 URL 和 Key
 * 当前项目使用自建后端 API（见 config/index.ts），不使用 Supabase 认证
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

// 默认占位值，实际接入时替换
const supabaseUrl = 'https://your-project.supabase.co';
const supabaseAnonKey = 'placeholder-key';

/** @deprecated 暂未启用，请使用 config/index.ts 中的 API_BASE */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);