/**
 * 伪造一个全局 `uni`，给 src/utils 下的测试用。
 *
 * 为什么要这么做：src/utils 里的代码全部通过 `uni.xxx` 调平台能力，
 * 真跑起来必须有微信小程序运行时。但这些调用面很窄（本地缓存、请求、
 * 提示、跳转），伪造出来就能在普通 Node 里跑，不用开微信开发者工具、
 * 不用连网。
 *
 * 这个假对象只做三件事：
 *   1. 把每次调用**记下来**（发了什么请求、弹了什么提示、跳去了哪），
 *      供断言直接看；
 *   2. 把请求**挂住不返回**，由测试自己决定什么时候、用什么状态码回话
 *      —— 需要异步回调分支的用例都靠这个；
 *   3. 存起来的东西**能读回来**，模拟本地缓存。
 */

/** 记录一次被送达的响应，等价于真实 uni 的回调入参。 */
export interface FakeResponse {
  statusCode: number;
  data?: any;
  header?: Record<string, string>;
}

export interface FakeUni {
  /** 假的那份本地缓存，键值是什么就存什么（真实 uni 也是如此） */
  storage: Map<string, any>;
  /** 按调用顺序记下的每一次 uni.request 入参 */
  requests: any[];
  /** 每次 uni.showToast 的文案 */
  toasts: string[];
  /** 每次 uni.reLaunch 的 url */
  relaunches: string[];
  /** 装到 globalThis 上，并在每个用完之后装回去 */
  install(): void;
  /** 让第 index 个请求成功返回（index 从 0 开始，按 requests 顺序） */
  respond(index: number, res: FakeResponse): void;
  /** 让第 index 个请求走 fail 分支 */
  respondFail(index: number, err?: any): void;
}

export function createFakeUni(): FakeUni {
  const storage = new Map<string, any>();
  const requests: any[] = [];
  const toasts: string[] = [];
  const relaunches: string[] = [];

  const uni = {
    // ===== 本地缓存 =====
    // 真实 uni 在键不存在时返回空字符串，这里保持一致，
    // 否则「读不到就以为是 undefined」这类真机行为会被测歪。
    getStorageSync(key: string) {
      return storage.has(key) ? storage.get(key) : '';
    },
    setStorageSync(key: string, value: any) {
      storage.set(key, value);
    },
    removeStorageSync(key: string) {
      storage.delete(key);
    },

    // ===== 交互 =====
    showToast(options: { title?: string }) {
      toasts.push(String(options?.title ?? ''));
    },
    reLaunch(options: { url: string; complete?: () => void }) {
      relaunches.push(options.url);
      options.complete?.();
    },

    // ===== 请求 =====
    // 故意不自动回话：什么时候成功、什么时候 401，交给测试自己决定。
    request(options: any) {
      requests.push(options);
      return { abort() {} };
    },
  };

  return {
    storage,
    requests,
    toasts,
    relaunches,
    install() {
      (globalThis as any).uni = uni;
    },
    respond(index, res) {
      const options = requests[index];
      if (!options) throw new Error(`第 ${index} 个请求还没发出，没法回话`);
      options.success?.({ statusCode: res.statusCode, data: res.data, header: res.header ?? {} });
    },
    respondFail(index, err: any = { errMsg: 'request:fail' }) {
      const options = requests[index];
      if (!options) throw new Error(`第 ${index} 个请求还没发出，没法回话`);
      options.fail?.(err);
    },
  };
}

/**
 * 造一个格式合法的 JWT（只用得上中间的 payload）。
 *
 * 只做 base64url 编码、不签名 —— 被测代码本来就是「只解 payload、不验签」
 * （签名是后端的事），所以这样造出来的 token 足够触发真实分支。
 */
export function makeJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => {
    const json = JSON.stringify(value);
    // btoa 只吃 Latin-1，这里的 payload 全是 ASCII 键值，够用
    return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.fake-signature`;
}
