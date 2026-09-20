import type { AuthSession, AuthUser } from '@/types/auth';

export const AUTH_SESSION_TTL_MS = 60 * 60 * 1000;

export const AUTH_STORAGE_KEYS = {
  token: 'auth_token',
  user: 'auth_user',
  loginTime: 'auth_login_time',
  expireTime: 'auth_expire_time',
} as const;

const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;

/**
 * 内部账号域名。
 *
 * 背景：后端（FastAPI + Supabase Auth）只认 email，前端把用户名拼成
 * `<用户名>@<该域名>` 再提交。因此这个域名必须是 Supabase 能接受的真实域名。
 *
 * 之前用的 `users.ai-etf.xyz` 在 DNS 里是 NXDOMAIN（该子域根本不存在），
 * 被 Supabase 的邮箱校验器拒绝，注册直接 400：
 *   email_address_invalid: Email address "lpqst@users.ai-etf.xyz" is invalid
 *
 * TODO(待验证): 这里临时改用已有 A 记录、但没有 MX 记录的 ai-etf.xyz，
 * 用于判定 Supabase 是否强制要求域名具备 MX 记录：
 *   - 若注册成功 → 只要求域名可解析，给 users.ai-etf.xyz 补一条 A 记录即可换回隔离域名
 *   - 若仍报 email_address_invalid → 必须为该域名配置 MX 记录
 */
const INTERNAL_ACCOUNT_DOMAIN = 'ai-etf.xyz';

interface JwtPayload {
  exp?: number;
  iat?: number;
  sub?: string;
}

/** Base64URL 解码，使用 ECMAScript 能力以兼容 H5、App 与小程序。 */
function decodeBase64Url(input: string): string {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) base64 += '=';

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];
  for (let i = 0; i < base64.length; i += 4) {
    const c0 = chars.indexOf(base64[i]);
    const c1 = chars.indexOf(base64[i + 1]);
    const c2 = base64[i + 2] === '=' ? 0 : chars.indexOf(base64[i + 2]);
    const c3 = base64[i + 3] === '=' ? 0 : chars.indexOf(base64[i + 3]);
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) throw new Error('invalid base64url');
    const value = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    bytes.push((value >> 16) & 0xff);
    if (base64[i + 2] !== '=') bytes.push((value >> 8) & 0xff);
    if (base64[i + 3] !== '=') bytes.push(value & 0xff);
  }

  return decodeURIComponent(bytes.map((byte) => `%${byte.toString(16).padStart(2, '0')}`).join(''));
}

export function parseJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(decodeBase64Url(parts[1])) as JwtPayload;
  } catch (error) {
    console.warn('[Auth] Token 解析失败:', error);
    return null;
  }
}

/** 校验用户名；邮箱只作为旧账号登录兼容项，不开放邮箱注册。 */
export function validateUsername(username: string): string | null {
  const value = username.trim();
  if (!value) return '请输入用户名';
  if (!USERNAME_PATTERN.test(value)) return '用户名需为 3-32 位字母、数字、下划线或短横线';
  return null;
}

/** 将用户名映射成后端 Supabase Auth 可识别且稳定唯一的内部邮箱。 */
export function accountToBackendEmail(account: string): string {
  const normalized = account.trim().toLowerCase();
  return normalized.includes('@') ? normalized : `${normalized}@${INTERNAL_ACCOUNT_DOMAIN}`;
}

export function accountDisplayName(account: string): string {
  const normalized = account.trim();
  return normalized.includes('@') ? normalized.split('@')[0] : normalized;
}

/**
 * 保存登录会话。
 * 前端有效期固定不超过一小时，同时不允许超过 JWT 自身的后端过期时间。
 */
export function saveAuthSession(token: string, user: AuthUser, expiresIn?: number | null): AuthSession {
  const loginTime = Date.now();
  const payload = parseJwtPayload(token);
  const jwtExpireTime = payload?.exp ? payload.exp * 1000 : Number.POSITIVE_INFINITY;
  const serverTtl = expiresIn && expiresIn > 0 ? expiresIn * 1000 : AUTH_SESSION_TTL_MS;
  const expireTime = Math.min(loginTime + AUTH_SESSION_TTL_MS, loginTime + serverTtl, jwtExpireTime);
  const session = { token, user, loginTime, expireTime };

  uni.setStorageSync(AUTH_STORAGE_KEYS.token, token);
  uni.setStorageSync(AUTH_STORAGE_KEYS.user, JSON.stringify(user));
  uni.setStorageSync(AUTH_STORAGE_KEYS.loginTime, loginTime);
  uni.setStorageSync(AUTH_STORAGE_KEYS.expireTime, expireTime);
  console.log('[Auth] 登录态已保存，到期时间:', new Date(expireTime).toISOString());
  return session;
}

/** 兼容读取旧登录态，并以 JWT iat/exp 补齐一小时本地期限。 */
export function getAuthSession(): AuthSession | null {
  const token = String(uni.getStorageSync(AUTH_STORAGE_KEYS.token) || '');
  const rawUser = uni.getStorageSync(AUTH_STORAGE_KEYS.user);
  if (!token || !rawUser) return null;

  try {
    const parsedUser = (typeof rawUser === 'string' ? JSON.parse(rawUser) : rawUser) as AuthUser & {
      user_metadata?: { nickname?: string };
    };
    if (!parsedUser?.id) return null;

    // 旧版本只保存 id/email/user_metadata，在不要求重新登录的前提下迁移展示字段。
    const fallbackName = parsedUser.user_metadata?.nickname
      || parsedUser.email?.split('@')[0]
      || parsedUser.id.slice(0, 8);
    const user: AuthUser = {
      id: parsedUser.id,
      username: parsedUser.username || fallbackName,
      displayName: parsedUser.displayName || fallbackName,
      ...(parsedUser.email ? { email: parsedUser.email } : {}),
    };

    const payload = parseJwtPayload(token);
    if (!payload?.exp) return null;

    let loginTime = Number(uni.getStorageSync(AUTH_STORAGE_KEYS.loginTime));
    let expireTime = Number(uni.getStorageSync(AUTH_STORAGE_KEYS.expireTime));
    if (!loginTime || !expireTime) {
      // 旧版本没有本地时间字段，依据签发时间迁移，仍严格限制为一小时。
      loginTime = payload.iat ? payload.iat * 1000 : payload.exp * 1000 - AUTH_SESSION_TTL_MS;
      expireTime = Math.min(loginTime + AUTH_SESSION_TTL_MS, payload.exp * 1000);
      uni.setStorageSync(AUTH_STORAGE_KEYS.loginTime, loginTime);
      uni.setStorageSync(AUTH_STORAGE_KEYS.expireTime, expireTime);
    }

    return { token, user, loginTime, expireTime };
  } catch (error) {
    console.warn('[Auth] 本地用户信息解析失败:', error);
    return null;
  }
}

export function isAuthSessionValid(session = getAuthSession()): session is AuthSession {
  if (!session) return false;
  const now = Date.now();
  const payload = parseJwtPayload(session.token);
  return Boolean(
    payload?.exp
    && payload.exp * 1000 > now
    && session.expireTime > now
    && session.expireTime <= session.loginTime + AUTH_SESSION_TTL_MS
  );
}

/** 清理所有认证键与旧版本认证键，不删除任何服务端个人数据。 */
export function clearAuthSession() {
  Object.values(AUTH_STORAGE_KEYS).forEach((key) => uni.removeStorageSync(key));
  uni.removeStorageSync('token');
  uni.removeStorageSync('userInfo');
  console.log('[Auth] 本地登录态已清除');
}

export function getCurrentUserId(): string {
  const session = getAuthSession();
  return isAuthSessionValid(session) ? session.user.id : '';
}

export function getUserScopedStorageKey(key: string, userId = getCurrentUserId()): string {
  return userId ? `${key}:${userId}` : `${key}:anonymous`;
}

let redirecting = false;

/** 统一处理本地过期与后端 401。 */
export function expireAuthAndRedirect(message = '登录状态已过期，请重新登录') {
  clearAuthSession();
  if (redirecting) return;
  redirecting = true;
  uni.showToast({ title: message, icon: 'none', duration: 1800 });
  setTimeout(() => {
    uni.reLaunch({
      url: '/pages/login/index',
      complete: () => {
        setTimeout(() => { redirecting = false; }, 300);
      },
    });
  }, 250);
}
