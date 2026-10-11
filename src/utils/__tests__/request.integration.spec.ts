/**
 * L2 集成测试：统一请求模块 + 登录态的联动
 *
 * 这里测的不是某一个函数算得对不对，而是「两个模块配合起来行为对不对」：
 * request.ts 调 auth.ts 判断登录态、往 header 里塞 token、收到 401 再回头
 * 让 auth.ts 清登录态并跳登录页。这类问题最容易漏，因为任何一边单独看都
 * 是对的 —— 比如「未登录时行情接口该不该放行」「401 之后本地缓存有没有
 * 真的被清掉」，只有连起来跑才看得出来。
 *
 * 怎么脱离真机跑：伪造一个全局 uni，请求发出去之后**挂住不返回**，
 * 由用例自己决定什么时候、用什么状态码回话。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_BASE } from '@/config';
import { AUTH_STORAGE_KEYS } from '@/utils/auth';
import type { AuthUser } from '@/types/auth';
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

/**
 * 每个用例都重新加载一次 request 模块。
 *
 * 原因：auth.ts 里有个模块级的 `redirecting` 开关（防止重复跳登录页），
 * 它是状态、不是配置。如果不重置模块，第二个用例会因为第一个用例留下的
 * 开关而「跳转被吞掉」，看起来像是功能坏了 —— 那是测试自己的锅。
 */
async function loadRequest() {
  vi.resetModules();
  return import('@/utils/request');
}

/** 往本地缓存里写一份「刚登录、一小时内有效」的登录态，返回那份 token。 */
function seedSession({ localTtlMs = HOUR } = {}): string {
  const loginTime = NOW.getTime();
  const token = makeJwt({ sub: USER.id, iat: loginTime / 1000, exp: (loginTime + 10 * HOUR) / 1000 });
  fake.storage.set(AUTH_STORAGE_KEYS.token, token);
  fake.storage.set(AUTH_STORAGE_KEYS.user, JSON.stringify(USER));
  fake.storage.set(AUTH_STORAGE_KEYS.loginTime, loginTime);
  fake.storage.set(AUTH_STORAGE_KEYS.expireTime, loginTime + localTtlMs);
  return token;
}

// ==================== 未登录时的两条岔路 ====================

describe('未登录时', () => {
  it('个人接口直接拒绝，连请求都不发出去', async () => {
    const { request } = await loadRequest();

    await expect(request({ url: '/api/watchlist/list', method: 'GET' })).rejects.toThrow(
      '登录状态已过期，请重新登录',
    );

    // 关键：不是「发了请求被后端拒」，而是压根没发。少这一条，
    // 未登录用户会把一批注定 401 的请求打到后端
    expect(fake.requests).toHaveLength(0);
  });

  it('个人接口被拒时会提示并跳回登录页', async () => {
    const { request } = await loadRequest();

    await request({ url: '/api/watchlist/list' }).catch(() => {});

    expect(fake.toasts).toEqual(['登录状态已过期，请重新登录']);
    expect(fake.relaunches).toEqual([]); // 先弹提示，250ms 后才跳
    vi.advanceTimersByTime(250);
    expect(fake.relaunches).toEqual(['/pages/login/index']);
  });

  it('行情接口放行，且不带头部 token', async () => {
    const { request } = await loadRequest();

    const pending = request({ url: '/api/market/fund-list', method: 'GET' });

    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0].url).toBe(`${API_BASE}/api/market/fund-list`);
    expect(fake.requests[0].header.Authorization).toBeUndefined();
    expect(fake.toasts).toEqual([]);

    fake.respond(0, { statusCode: 200, data: { list: [] } });
    await expect(pending).resolves.toMatchObject({ statusCode: 200 });
  });

  it('本地登录态过期后，行情接口照样能看', async () => {
    // 行情是公开数据，登录态到期不该把浏览行情也一起挡掉
    seedSession({ localTtlMs: -1 });
    const { request } = await loadRequest();

    request({ url: '/api/market/fund-list' }).catch(() => {});

    expect(fake.requests).toHaveLength(1);
  });
});

// ==================== 已登录时 ====================

describe('已登录时', () => {
  it('自动带上 Authorization 头', async () => {
    const token = seedSession();
    const { request } = await loadRequest();

    request({ url: '/api/secure-chat/chats', method: 'GET' }).catch(() => {});

    expect(fake.requests[0].header.Authorization).toBe(`Bearer ${token}`);
    expect(fake.requests[0].header['Content-Type']).toBe('application/json');
  });

  it('相对地址拼上 API_BASE，绝对地址原样不动', async () => {
    seedSession();
    const { request } = await loadRequest();

    request({ url: '/api/secure-chat/chats' }).catch(() => {});
    request({ url: 'https://example.com/raw' }).catch(() => {});

    expect(fake.requests[0].url).toBe(`${API_BASE}/api/secure-chat/chats`);
    expect(fake.requests[1].url).toBe('https://example.com/raw');
  });

  it('调用方自己传的头不会被覆盖', async () => {
    seedSession();
    const { request } = await loadRequest();

    request({ url: '/api/secure-chat/chats', header: { 'X-Trace-Id': 'abc' } }).catch(() => {});

    expect(fake.requests[0].header['X-Trace-Id']).toBe('abc');
    expect(fake.requests[0].header.Authorization).toBeDefined();
  });
});

// ==================== 响应处理 ====================

describe('响应处理', () => {
  it('2xx 原样 resolve', async () => {
    seedSession();
    const { request } = await loadRequest();
    const pending = request({ url: '/api/secure-chat/chats' });

    fake.respond(0, { statusCode: 200, data: { chats: [1, 2] } });

    await expect(pending).resolves.toMatchObject({ statusCode: 200, data: { chats: [1, 2] } });
  });

  it('401 时清掉本地登录态、提示、并跳回登录页', async () => {
    seedSession();
    const { request } = await loadRequest();
    const pending = request({ url: '/api/secure-chat/chats' });

    fake.respond(0, { statusCode: 401, data: { detail: '未授权' } });
    await expect(pending).rejects.toThrow('未授权，请重新登录');

    // 本地缓存必须真被清掉，否则页面还以为登着，会一直 401
    expect(fake.storage.has(AUTH_STORAGE_KEYS.token)).toBe(false);
    expect(fake.storage.has(AUTH_STORAGE_KEYS.user)).toBe(false);
    expect(fake.toasts).toEqual(['登录状态已过期，请重新登录']);

    vi.advanceTimersByTime(250);
    expect(fake.relaunches).toEqual(['/pages/login/index']);
  });

  it('短时间内连续过期只跳一次登录页', async () => {
    // auth.ts 里的 redirecting 开关就是干这个的：不走这条，
    // 页面上几个并发请求会叠出好几次跳转
    seedSession();
    const { request } = await loadRequest();

    const first = request({ url: '/api/secure-chat/chats' });
    fake.respond(0, { statusCode: 401, data: {} });
    await first.catch(() => {});

    // 此时登录态已被清，第二个请求走的是「未登录」那条短路
    await request({ url: '/api/watchlist/list' }).catch(() => {});

    vi.advanceTimersByTime(250);
    expect(fake.toasts).toHaveLength(1);
    expect(fake.relaunches).toHaveLength(1);
  });

  it('400 用后端给的 detail 当错误文案，并带上状态码', async () => {
    seedSession();
    const { request } = await loadRequest();
    const pending = request({ url: '/api/secure-chat/chats', method: 'POST' });

    fake.respond(0, { statusCode: 400, data: { detail: '用户名已存在' } });

    const error = (await pending.catch((e) => e)) as Error & { statusCode?: number };
    expect(error.message).toBe('用户名已存在');
    expect(error.statusCode).toBe(400);
  });

  it('后端没给可读文案时，退化成「请求失败（HTTP xxx）」', async () => {
    seedSession();
    const { request } = await loadRequest();
    const pending = request({ url: '/api/secure-chat/chats' });

    fake.respond(0, { statusCode: 500, data: {} });

    await expect(pending).rejects.toThrow('请求失败（HTTP 500）');
  });

  it('字符串响应体直接当作文案', async () => {
    seedSession();
    const { request } = await loadRequest();
    const pending = request({ url: '/api/secure-chat/chats' });

    fake.respond(0, { statusCode: 503, data: '服务暂不可用' });

    await expect(pending).rejects.toThrow('服务暂不可用');
  });

  it('网络层失败原样抛出去，不当成登录过期', async () => {
    seedSession();
    const { request } = await loadRequest();
    const pending = request({ url: '/api/secure-chat/chats' });

    fake.respondFail(0, { errMsg: 'request:fail timeout' });

    await expect(pending).rejects.toMatchObject({ errMsg: 'request:fail timeout' });
    expect(fake.storage.has(AUTH_STORAGE_KEYS.token)).toBe(true);
  });
});

// ==================== 简写方法 ====================

describe('get / post / del 简写', () => {
  it('post 带上 method 和请求体', async () => {
    seedSession();
    const { post } = await loadRequest();

    post('/api/secure-chat/chats', { title: '新会话' }).catch(() => {});

    expect(fake.requests[0].method).toBe('POST');
    expect(fake.requests[0].data).toEqual({ title: '新会话' });
  });

  it('del 用 DELETE 且能带请求体', async () => {
    seedSession();
    const { del } = await loadRequest();

    del('/api/watchlist/remove', { code: '510300' }).catch(() => {});

    expect(fake.requests[0].method).toBe('DELETE');
    expect(fake.requests[0].data).toEqual({ code: '510300' });
  });
});
