/**
 * L2 测试：`useAuth.login` 的三条分支 + 两条本地短路。
 *
 * 为什么专门盯这个函数：它在历史上出过一次真实回归 —— 后端返回的中文提示
 * （例如「密码长度至少 8 位」）不在 `errorMap` 里，被兜底文案盖成
 * 「用户名或密码错误」，于是**永远看不到真实的失败原因**。
 * 下面第 ③ 条就是那道防线的回归测试，`useAuth.ts:31-37` 的注释在讲同一件事，别删。
 * （这条登记在 ai-etf/docs/e2e/02-核心路径与分层策略.md §2 的清单里。）
 *
 * ── 为什么不用 mock api 层 ──
 * `login` 是**直接调 `uni.request`** 的（[useAuth.ts:109](../../composables/useAuth.ts#L109)），
 * 不走 `utils/request.ts`，所以换掉全局 `uni` 就够。
 *
 * ⚠️ **但它用的是 `await uni.request(...)` 写法**，而共享的假 `uni`
 * （[fake-uni.ts](../../utils/__tests__/helpers/fake-uni.ts)）是按**回调写法**定制的 ——
 * 它返回的是 `{ abort() {} }`，不是响应。直接拿来用的话 `await` 到的东西
 * 没有 `statusCode`，于是**每条分支都会滑进 catch**，测试会"全绿"却什么都没验到。
 * （这正是 E2E 那边记过的坑：`mockUniMethod` 对回调写法有效、对 `await` 写法无效。）
 * 所以这里在共享假 uni 之上，把 `request` 换成 Promise 版本，见 `beforeEach`。
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { API_BASE } from '@/config';
import type { AuthUser } from '@/types/auth';
import { AUTH_STORAGE_KEYS, getAuthSession, isAuthSessionValid } from '@/utils/auth';
import { createFakeUni, makeJwt, type FakeUni } from '@/utils/__tests__/helpers/fake-uni';
import { activateFreshPinia } from '@/stores/__tests__/helpers/pinia';
import { useAuthStore } from '@/stores/auth';
import { useAuth } from '@/composables/useAuth';

const ACCOUNT = 'lpqst';
const PASSWORD = 'password123';
/** 用户名会被映射成内部邮箱再发给后端（映射规则见 utils/auth.ts:79-82，域名见 :29） */
const BACKEND_EMAIL = 'lpqst@ai-etf.xyz';
const USER_ID = '6f1c2b3a-0000-4000-8000-000000000001';
/** payload 里 exp 在一小时后的合法 JWT（被测代码只解 payload、不验签） */
const TOKEN = makeJwt({ sub: USER_ID, exp: Math.floor(Date.now() / 1000) + 3600 });

/** `login` 的返回值是联合类型：成功带 `user`、失败只带 `error`。断言前显式收窄。 */
type LoginResult = { error: string | null; user?: AuthUser };

let fakeUni: FakeUni;
let resolves: Array<(res: { statusCode: number; data: any }) => void>;
let rejects: Array<(err: any) => void>;
let warnSpy: MockInstance;

beforeEach(() => {
  activateFreshPinia();
  fakeUni = createFakeUni();
  fakeUni.install();

  // ⭐ 把 request 换成 Promise 版本（原因见文件头）：记录入参照旧，
  //    但把 resolve/reject 交出来，由测试决定什么时候、用什么状态码回话。
  resolves = [];
  rejects = [];
  (globalThis as any).uni.request = (options: any) => {
    fakeUni.requests.push(options);
    return new Promise((resolve, reject) => {
      resolves.push(resolve as any);
      rejects.push(reject);
    });
  };

  // 被测代码在几条分支里会 console.warn / console.error —— 那是它有意留的痕迹，
  // 这里静音掉保持输出干净；需要断言"确实告警过"的地方用 warnSpy。
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** 让第 index 个请求按给定状态码 + 响应体回话 */
function respond(index: number, statusCode: number, data: any) {
  resolves[index]({ statusCode, data });
}

/** 让第 index 个请求走 fail 分支 */
function respondFail(index: number, err: any) {
  rejects[index](err);
}

describe('useAuth.login', () => {
  it('① 200 + access_token + user_id → 保存会话，并返回用户', async () => {
    const auth = useAuth();
    const pending = auth.login(ACCOUNT, PASSWORD);
    respond(0, 200, { access_token: TOKEN, user_id: USER_ID, expires_in: 3600 });
    const result = (await pending) as LoginResult;

    // 返回体
    expect(result.error).toBeNull();
    // 非邮箱账号不带 email 字段（buildUser 的分支，见 useAuth.ts:76-85）
    expect(result.user).toEqual({ id: USER_ID, username: ACCOUNT, displayName: ACCOUNT });

    // 会话确实落到了本地存储
    expect(fakeUni.storage.get(AUTH_STORAGE_KEYS.token)).toBe(TOKEN);
    expect(isAuthSessionValid(getAuthSession())).toBe(true);
    expect(useAuthStore().session).toMatchObject({ user: { id: USER_ID } });

    // 发给后端的请求形状（用户名已映射成内部邮箱）
    const request = fakeUni.requests[0];
    expect(request.url).toBe(`${API_BASE}/api/secure-chat/login`);
    expect(request.method).toBe('POST');
    expect(request.data).toEqual({ email: BACKEND_EMAIL, password: PASSWORD });
    expect(request.header['Content-Type']).toBe('application/json');

    expect(auth.errorMessage.value).toBe('');
    expect(auth.loading.value).toBe(false);
  });

  it('② 401 + Invalid login credentials → 文案「用户名或密码错误」，且不落任何会话', async () => {
    const auth = useAuth();
    const pending = auth.login(ACCOUNT, PASSWORD);
    respond(0, 401, { detail: 'Invalid login credentials' });
    const result = await pending;

    expect(result.error).toBe('用户名或密码错误');
    expect(auth.errorMessage.value).toBe('用户名或密码错误');

    // 409 之外的分支都不得写存储 —— 失败半途写进去，用户会"看着像登录了"
    expect(fakeUni.storage.has(AUTH_STORAGE_KEYS.token)).toBe(false);
    expect(fakeUni.storage.has(AUTH_STORAGE_KEYS.expireTime)).toBe(false);
    expect(getAuthSession()).toBeNull();
    expect(auth.loading.value).toBe(false);
  });

  it('③ ⭐ 未识别的错误 → 透出后端原文（历史 bug 的回归防线）', async () => {
    const auth = useAuth();
    const pending = auth.login(ACCOUNT, PASSWORD);
    respond(0, 400, { detail: '密码长度至少 8 位' });
    const result = await pending;

    expect(result.error).toBe('密码长度至少 8 位');
    // 反例：被兜底文案盖掉就是这个 bug 复发了
    expect(result.error).not.toBe('用户名或密码错误');
    // 「透出原文」这条路上代码会主动告警，这才是它真的走了这一支的证据
    expect(warnSpy).toHaveBeenCalled();
  });

  it('④ 后端连原文都没给（空消息）→ 才用兜底文案按状态码区分', async () => {
    const auth = useAuth();
    const pending = auth.login(ACCOUNT, PASSWORD);
    respond(0, 401, {});
    const result = await pending;

    expect(result.error).toBe('用户名或密码错误');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('⑤ 本地校验就不过 → 一个请求都不发', async () => {
    const shortName = useAuth();
    expect((await shortName.login('ab', PASSWORD)).error).toBe('用户名需为 3-32 位字母、数字、下划线或短横线');

    const emptyPassword = useAuth();
    expect((await emptyPassword.login(ACCOUNT, '')).error).toBe('请输入密码');

    // 这条是关键：本地能判死的输入不该浪费一次网络往返
    expect(fakeUni.requests.length).toBe(0);
  });

  it('⑥ 请求本身失败（超时）→ 中文网络提示，不是后端文案', async () => {
    const auth = useAuth();
    const pending = auth.login(ACCOUNT, PASSWORD);
    respondFail(0, { errMsg: 'request:fail timeout' });
    const result = await pending;

    expect(result.error).toBe('连接服务器超时，请稍后重试');
    expect(getAuthSession()).toBeNull();
  });
});
