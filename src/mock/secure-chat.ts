/**
 * ============================================
 * 认证类 mock 数据：/api/secure-chat/login|register|logout
 * ============================================
 * 仅模拟登录/注册/登出；AI 流式聊天不在 mock 范围内（开发环境提示不支持）。
 */

import type { MockRoute } from './index';

const MOCK_USER_ID = 'mock-user-001';
const MOCK_EXPIRES_IN = 3600;

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64URL 编码（仅处理 ASCII，JWT payload 为 ASCII JSON） */
function base64UrlEncode(input: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) bytes.push(input.charCodeAt(i) & 0xff);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += BASE64_CHARS[b0 >> 2];
    out += BASE64_CHARS[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? BASE64_CHARS[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? BASE64_CHARS[b2 & 0x3f] : '=';
  }
  return out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 生成满足本地会话校验（含 exp）的假 JWT，仅用于 mock 模式 */
function createMockJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify({
    sub: MOCK_USER_ID,
    email: 'mock@ai-etf.local',
    iat: now,
    exp: now + MOCK_EXPIRES_IN,
  }));
  return `${header}.${payload}.mock-signature`;
}

export const secureChatRoutes: MockRoute[] = [
  {
    method: 'POST',
    pattern: /^\/api\/secure-chat\/login$/,
    handler: () => ({
      access_token: createMockJwt(),
      token_type: 'bearer',
      user_id: MOCK_USER_ID,
      expires_in: MOCK_EXPIRES_IN,
    }),
  },
  {
    method: 'POST',
    pattern: /^\/api\/secure-chat\/register$/,
    handler: () => ({
      success: true,
      needs_email_confirmation: false,
      access_token: createMockJwt(),
      token_type: 'bearer',
      user_id: MOCK_USER_ID,
      expires_in: MOCK_EXPIRES_IN,
      message: '注册成功（mock）',
    }),
  },
  {
    method: 'POST',
    pattern: /^\/api\/secure-chat\/logout$/,
    handler: () => ({ success: true }),
  },
];
