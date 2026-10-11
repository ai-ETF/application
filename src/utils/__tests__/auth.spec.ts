/**
 * L1 单元测试：账号格式与本地登录态
 *
 * 重点在两处最容易出错、又最不容易被真机用例发现的地方：
 *   1. 用户名 vs 邮箱的边界（邮箱只用于老账号登录，不开放邮箱注册）；
 *   2. 「本地一小时有效期」的三条判定 —— 少任何一条，都会让一个早就
 *      过期的登录态被当成有效，页面看起来"还登着"，一请求就 401。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_SESSION_TTL_MS,
  AUTH_STORAGE_KEYS,
  accountDisplayName,
  accountToBackendEmail,
  clearAuthSession,
  getAuthSession,
  isAuthSessionValid,
  saveAuthSession,
  validateUsername,
} from '@/utils/auth';
import type { AuthSession, AuthUser } from '@/types/auth';
import { createFakeUni, makeJwt, type FakeUni } from './helpers/fake-uni';

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-10-11T12:00:00.000Z');

const USER: AuthUser = { id: 'user-1', username: 'lpqst', displayName: 'lpqst' };

let fake: FakeUni;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  fake = createFakeUni();
  fake.install();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** 造一个「本地三条判定都该过」的登录态。 */
function validSession(overrides: Partial<AuthSession> = {}): AuthSession {
  const loginTime = NOW.getTime();
  return {
    token: makeJwt({ sub: 'user-1', iat: loginTime / 1000, exp: (loginTime + HOUR) / 1000 }),
    user: USER,
    loginTime,
    expireTime: loginTime + HOUR,
    ...overrides,
  };
}

// ==================== 用户名 / 邮箱 ====================

describe('validateUsername', () => {
  it('空输入提示「请输入用户名」', () => {
    expect(validateUsername('')).toBe('请输入用户名');
    expect(validateUsername('   ')).toBe('请输入用户名');
  });

  it('太短（2 位）被拒', () => {
    expect(validateUsername('ab')).toContain('3-32');
  });

  it('刚好 3 位通过', () => {
    expect(validateUsername('abc')).toBeNull();
  });

  it('刚好 32 位通过，33 位被拒', () => {
    expect(validateUsername('a'.repeat(32))).toBeNull();
    expect(validateUsername('a'.repeat(33))).toContain('3-32');
  });

  it('字母、数字、下划线、短横线都放行', () => {
    expect(validateUsername('user_name-1')).toBeNull();
    expect(validateUsername('A1_b-')).toBeNull();
  });

  it('邮箱地址不算合法用户名 —— 注册页只收用户名', () => {
    // 这正是「输入 lpqst1@outlook.com 被拒」的原因：注册走的是用户名，
    // 邮箱只作为老账号的登录兼容项（见 auth.ts 顶部账号模型注释）
    expect(validateUsername('lpqst1@outlook.com')).toContain('字母、数字、下划线或短横线');
    expect(validateUsername('a@b.c')).toContain('字母、数字、下划线或短横线');
  });

  it('中文、空格等不在白名单里的一律被拒', () => {
    expect(validateUsername('用户名')).not.toBeNull();
    expect(validateUsername('user name')).not.toBeNull();
  });

  it('两端空格先被 trim 掉', () => {
    expect(validateUsername('  abc  ')).toBeNull();
  });
});

describe('accountToBackendEmail', () => {
  it('用户名拼上内部域名 —— 后端 Supabase 只认 email', () => {
    expect(accountToBackendEmail('lpqst')).toBe('lpqst@ai-etf.xyz');
  });

  it('大小写和空格被归一化，同一个账号永远拼出同一个邮箱', () => {
    expect(accountToBackendEmail('  LPQST ')).toBe('lpqst@ai-etf.xyz');
  });

  it('本身是邮箱的老账号原样透传，不加域名', () => {
    expect(accountToBackendEmail('old@example.com')).toBe('old@example.com');
  });
});

describe('accountDisplayName', () => {
  it('用户名原样显示', () => {
    expect(accountDisplayName('Lpqst')).toBe('Lpqst');
  });

  it('邮箱老账号只显示 @ 前面那段，不暴露完整邮箱', () => {
    expect(accountDisplayName('old@example.com')).toBe('old');
  });
});

// ==================== isAuthSessionValid 的三条判定 ====================

describe('isAuthSessionValid', () => {
  it('JWT 没过期、本地没过期、本地期限没超过一小时 → 有效', () => {
    expect(isAuthSessionValid(validSession())).toBe(true);
  });

  it('传 null / 不传时 → 无效', () => {
    expect(isAuthSessionValid(null)).toBe(false);
    expect(isAuthSessionValid()).toBe(false);
  });

  it('本地 expireTime 已经过去 → 无效（哪怕 JWT 还没过期）', () => {
    const session = validSession();
    // 把时钟拨到本地有效期之后，但 JWT 的 exp 还早
    vi.setSystemTime(new Date(session.expireTime + 1));
    expect(isAuthSessionValid(session)).toBe(false);
  });

  it('JWT 自己已经过期 → 无效（哪怕本地 expireTime 还没到）', () => {
    const loginTime = NOW.getTime();
    const session = validSession({
      token: makeJwt({ sub: 'user-1', iat: loginTime / 1000, exp: (loginTime - 1000) / 1000 }),
      expireTime: loginTime + HOUR,
    });
    expect(isAuthSessionValid(session)).toBe(false);
  });

  it('本地期限被改到超过一小时 → 无效（这是「本地有效不超过一小时」的兜底）', () => {
    const session = validSession({ expireTime: NOW.getTime() + HOUR + 1 });
    // 时间上还没到，但这条判定专门拦「被人为拉长的登录态」
    expect(isAuthSessionValid(session)).toBe(false);
  });

  it('token 根本不是 JWT（解不出 exp）→ 无效', () => {
    expect(isAuthSessionValid(validSession({ token: 'not-a-jwt' }))).toBe(false);
  });
});

// ==================== 保存 / 读取 / 清除 ====================

describe('saveAuthSession', () => {
  it('没给服务端有效期时，本地期限就是登录时刻 + 一小时', () => {
    const token = makeJwt({ sub: 'user-1', iat: NOW.getTime() / 1000, exp: (NOW.getTime() + 10 * HOUR) / 1000 });
    const session = saveAuthSession(token, USER);

    expect(session.loginTime).toBe(NOW.getTime());
    expect(session.expireTime).toBe(NOW.getTime() + AUTH_SESSION_TTL_MS);
  });

  it('服务端给的有效期更短时，取更短的那个', () => {
    const token = makeJwt({ sub: 'user-1', exp: (NOW.getTime() + 10 * HOUR) / 1000 });
    const session = saveAuthSession(token, USER, 120);

    expect(session.expireTime).toBe(NOW.getTime() + 120 * 1000);
  });

  it('服务端给的有效期更长时，仍然被一小时封顶', () => {
    const token = makeJwt({ sub: 'user-1', exp: (NOW.getTime() + 10 * HOUR) / 1000 });
    const session = saveAuthSession(token, USER, 2 * 60 * 60);

    expect(session.expireTime).toBe(NOW.getTime() + AUTH_SESSION_TTL_MS);
  });

  it('JWT 自己只剩 10 分钟时，以 JWT 为准，不按一小时算', () => {
    const token = makeJwt({ sub: 'user-1', exp: (NOW.getTime() + 10 * 60 * 1000) / 1000 });
    const session = saveAuthSession(token, USER);

    expect(session.expireTime).toBe(NOW.getTime() + 10 * 60 * 1000);
  });

  it('写进了本地缓存，读回来是同一份', () => {
    const token = makeJwt({ sub: 'user-1', exp: (NOW.getTime() + 10 * HOUR) / 1000 });
    const saved = saveAuthSession(token, USER);

    expect(getAuthSession()).toEqual(saved);
  });
});

describe('getAuthSession', () => {
  it('什么都没存过 → null', () => {
    expect(getAuthSession()).toBeNull();
  });

  it('有 token 没有用户信息 → null', () => {
    const token = makeJwt({ exp: (NOW.getTime() + HOUR) / 1000 });
    fake.storage.set(AUTH_STORAGE_KEYS.token, token);
    expect(getAuthSession()).toBeNull();
  });

  it('老版本只存了 token + 用户（没有本地时间字段）时，按 JWT 补出一小时期限', () => {
    const iat = NOW.getTime() / 1000;
    const token = makeJwt({ sub: 'user-1', iat, exp: iat + 10 * 60 * 60 });
    fake.storage.set(AUTH_STORAGE_KEYS.token, token);
    fake.storage.set(AUTH_STORAGE_KEYS.user, JSON.stringify({ id: 'user-1', email: 'old@ai-etf.xyz' }));

    const session = getAuthSession();

    expect(session?.loginTime).toBe(iat * 1000);
    expect(session?.expireTime).toBe(iat * 1000 + AUTH_SESSION_TTL_MS);
    // 迁移后要写回缓存，否则每次进页面都要重算
    expect(fake.storage.get(AUTH_STORAGE_KEYS.expireTime)).toBe(iat * 1000 + AUTH_SESSION_TTL_MS);
  });

  it('老账号只存了 email 时，展示名取 @ 前面那段', () => {
    const token = makeJwt({ iat: NOW.getTime() / 1000, exp: (NOW.getTime() + HOUR) / 1000 });
    fake.storage.set(AUTH_STORAGE_KEYS.token, token);
    fake.storage.set(AUTH_STORAGE_KEYS.user, JSON.stringify({ id: 'user-1', email: 'old@ai-etf.xyz' }));

    expect(getAuthSession()?.user.username).toBe('old');
  });

  it('用户信息是坏 JSON 时不抛异常，返回 null', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fake.storage.set(AUTH_STORAGE_KEYS.token, makeJwt({ exp: (NOW.getTime() + HOUR) / 1000 }));
    fake.storage.set(AUTH_STORAGE_KEYS.user, '{坏掉的');

    expect(getAuthSession()).toBeNull();
    warn.mockRestore();
  });
});

describe('clearAuthSession', () => {
  it('把自己的键和旧版本的键都清掉', () => {
    const token = makeJwt({ exp: (NOW.getTime() + 10 * HOUR) / 1000 });
    saveAuthSession(token, USER);
    fake.storage.set('token', 'legacy-token');
    fake.storage.set('userInfo', 'legacy-user');

    clearAuthSession();

    expect(getAuthSession()).toBeNull();
    expect(fake.storage.has('token')).toBe(false);
    expect(fake.storage.has('userInfo')).toBe(false);
  });
});
