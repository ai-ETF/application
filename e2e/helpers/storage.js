/**
 * 小程序本地存储的读写，以及登录态的「造状态 / 验状态」。
 *
 * 全部走 `program.callUniMethod('getStorageSync' | 'setStorageSync' | 'removeStorageSync')`
 * —— 这是最稳的一条运行时通道，实测可用。
 *
 * 关于「直接写 Storage 造登录态」这个做法：
 *   ⚠️ 早期注释说「本环境没有元素查询，UI 登录写不出来，所以只能写 Storage」——
 *   前半句已在 2026-10-03 被证伪（`el.input()` + `el.tap()` 都可用，见
 *   `p4-auth.e2e.js` 文件头）。但**写 Storage 这个做法本身仍然是对的**，只是理由变了：
 *     - 它快、稳、不依赖后端有可用的测试账号；
 *     - 被测的 `request()` 读的就是 Storage（application/src/utils/request.ts#L35），
 *       造出来的状态与真实登录后的状态在关键字段上完全一致；
 *     - 代价是**绕过了 `useAuth.login()` 本身**，所以「登录流程」这一段没被覆盖。
 *   所以：**需要「已经登录」这个前提时用写 Storage；要测「登录这个动作」时
 *   必须走真实 UI（input + tap）**，两者不可互相替代。报告里要写明各用例取的是哪一种。
 */

// 与 application/src/utils/auth.ts#L5-L10 保持一致
const AUTH_STORAGE_KEYS = {
  token: 'auth_token',
  user: 'auth_user',
  loginTime: 'auth_login_time',
  expireTime: 'auth_expire_time',
};

// clearAuthSession 会额外清理的历史键，见 auth.ts#L165-L170
const LEGACY_KEYS = ['token', 'userInfo'];

// 与 auth.ts#L3 的 AUTH_SESSION_TTL_MS 保持一致
const AUTH_SESSION_TTL_MS = 60 * 60 * 1000;

async function getKey(program, key) {
  return await program.callUniMethod('getStorageSync', key);
}

async function setKey(program, key, value) {
  await program.callUniMethod('setStorageSync', key, value);
}

async function removeKey(program, key) {
  await program.callUniMethod('removeStorageSync', key);
}

/**
 * 在小程序内批量写 / 删存储（`wx.setStorageSync` / `wx.removeStorageSync`）。
 *
 * ⚠️ 为什么写和删都要「两遍」（先走 callUniMethod，再走这里）——
 * 2026-10-11 实测发现：**两条通道看到的存储视图会不同步**，两个方向都出现过：
 *   · 读：`callUniMethod('getStorageSync','auth_token')` 回空串，
 *         同一时刻小程序内却读得出完整的 926 字符 JWT（`readAuthKeysInApp` 的注释里有记录）；
 *   · 删：`callUniMethod('removeStorageSync', …)` 清完之后，**应用自己仍认为登录态有效**
 *         —— P4-04（「未登录直接进首页应被踢到登录页」）因此偶发超时：
 *         清是清了（测试侧读也是空），但应用没被踢。
 * 所以凡是「造登录态 / 清登录态」，两条通道都做一遍，读才用 `readAuthKeysInApp`。
 * 成因未查明，标「需确认」，别据此改业务代码。
 */
async function setKeysInApp(program, pairs) {
  await program.evaluate((entries) => {
    for (const [key, value] of entries) wx.setStorageSync(key, value);
  }, pairs);
}

/** 在小程序内批量删键（配 `setKeysInApp` 用，见其注释）。 */
async function removeKeysInApp(program, keys) {
  await program.evaluate((list) => {
    for (const key of list) wx.removeStorageSync(key);
  }, keys);
}

/** 清掉 4 个认证键 + 2 个历史键，等价于 clearAuthSession() 的效果。 */
async function clearAuthKeys(program) {
  const keys = [...Object.values(AUTH_STORAGE_KEYS), ...LEGACY_KEYS];
  for (const key of keys) {
    await removeKey(program, key);
  }
  // 再在小程序内清一遍 —— 只清一遍时 P4-04 会偶发「清不掉、没被踢」（见 setKeysInApp 注释）
  await removeKeysInApp(program, keys);
}

/**
 * 读出 4 个认证键的原始值。
 * getStorageSync 对不存在的键返回空串，所以「已清空」= 全部为空串。
 */
async function readAuthRaw(program) {
  const raw = {};
  for (const [name, key] of Object.entries(AUTH_STORAGE_KEYS)) {
    raw[name] = await getKey(program, key);
  }
  for (const key of LEGACY_KEYS) {
    raw[key] = await getKey(program, key);
  }
  return raw;
}

/**
 * 在**小程序内部**读 4 个认证键的原始值（返回 `{token, user, loginTime, expireTime}`，
 * 不存在的键是空串）。
 *
 * ⚠️ 为什么不能一律用 `getKey`（= `callUniMethod('getStorageSync')`）——2026-10-11 实测：
 * 这条通道**会单独把 `auth_token` 读成空串**，而同一时刻小程序内
 * `wx.getStorageSync('auth_token')` 明明读得出完整的 926 字符真 JWT。
 * 在 P4-03（取消支）那条的时序里 **3/3 轮都能复现**，换个更短的时序就复现不了
 * （成因未查明，记在 `application/e2e/README.md` §6.8）。
 *
 * 所以规矩是：
 *   - **正向**断言「某个键还在」→ 用本函数（= 应用自己读的那条通道，可信）；
 *   - 反向断言「键都清空了」→ 用 `findLeftoverAuthKeys` 无妨 ——
 *     空串只会让它多报「已清空」，不会伪造出「还在」。
 */
async function readAuthKeysInApp(program) {
  return await program.evaluate((keys) => {
    const out = {};
    for (const [name, key] of Object.entries(keys)) {
      const v = wx.getStorageSync(key);
      out[name] = v === undefined || v === null ? '' : String(v);
    }
    return out;
  }, AUTH_STORAGE_KEYS);
}

/**
 * 在小程序内读任意一个键（`wx.getStorageSync`）。
 *
 * 为什么不直接用 `getKey`：两条通道看到的存储视图会不同步（见上方 `setKeysInApp` 说明），
 * 断言「应用自己写进去的缓存」时要用应用所在的通道读，否则可能读到空串而误判。
 */
async function readKeyInApp(program, key) {
  return await program.evaluate((k) => {
    const v = wx.getStorageSync(k);
    return v === undefined || v === null ? '' : String(v);
  }, key);
}

/** 断言用：返回「还有哪些键没清干净」。空数组 = 全部已清空。 */
async function findLeftoverAuthKeys(program) {
  const raw = await readAuthRaw(program);
  return Object.entries(raw)
    .filter(([, value]) => value !== '' && value !== null && value !== undefined)
    .map(([name]) => name);
}

/** 解析 JWT 的 payload（只做 base64url 解码，不验签）。 */
function parseJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * 把一个「有效」会话写进 Storage，模拟刚登录成功的样子。
 *
 * 复刻 saveAuthSession 的算法（auth.ts#L93-L98）：
 *   expireTime = min(now + 1h, now + 服务端 TTL, JWT 自身的 exp)
 * 这一步很关键：`isAuthSessionValid` 会校验
 * `expireTime <= loginTime + 1h`（auth.ts#L152-L162），
 * 随手把 expireTime 写大就会踩到这条防篡改校验，用例会以「莫名其妙失败」收场。
 */
async function seedValidSession(program, { token, user }) {
  const loginTime = Date.now();
  const jwtPayload = parseJwtPayload(token);
  const jwtExpireTime = jwtPayload && jwtPayload.exp ? jwtPayload.exp * 1000 : Number.POSITIVE_INFINITY;
  const expireTime = Math.min(loginTime + AUTH_SESSION_TTL_MS, jwtExpireTime);

  const pairs = [
    [AUTH_STORAGE_KEYS.token, token],
    [AUTH_STORAGE_KEYS.user, JSON.stringify(user)],
    [AUTH_STORAGE_KEYS.loginTime, String(loginTime)],
    [AUTH_STORAGE_KEYS.expireTime, String(expireTime)],
  ];
  for (const [key, value] of pairs) await setKey(program, key, value);
  // 两条通道都写一遍（见 setKeysInApp 注释：通道会不同步，写一遍时应用可能看不见）
  await setKeysInApp(program, pairs);

  return { loginTime, expireTime };
}

/**
 * 造「本地已过期、但 JWT 本身还没过期」的状态 —— P4-01 的前置。
 *
 * 只把小 expireTime 改到过去，loginTime 保持在同一时刻，
 * 这样 `expireTime <= loginTime + 1h` 仍然成立，唯一不成立的是 `expireTime > now`。
 * 于是 isAuthSessionValid 返回 false，走 request.ts#L39-L42 的本地过期分支。
 */
async function seedLocallyExpiredSession(program, { token, user }) {
  const now = Date.now();
  const loginTime = now - 1000;
  const expireTime = now - 1000; // 已经过去

  const pairs = [
    [AUTH_STORAGE_KEYS.token, token],
    [AUTH_STORAGE_KEYS.user, JSON.stringify(user)],
    [AUTH_STORAGE_KEYS.loginTime, String(loginTime)],
    [AUTH_STORAGE_KEYS.expireTime, String(expireTime)],
  ];
  for (const [key, value] of pairs) await setKey(program, key, value);
  await setKeysInApp(program, pairs); // 同上：两条通道都写

  return { loginTime, expireTime };
}

module.exports = {
  AUTH_STORAGE_KEYS,
  LEGACY_KEYS,
  AUTH_SESSION_TTL_MS,
  getKey,
  setKey,
  removeKey,
  setKeysInApp,
  removeKeysInApp,
  clearAuthKeys,
  readAuthRaw,
  readAuthKeysInApp,
  readKeyInApp,
  findLeftoverAuthKeys,
  parseJwtPayload,
  seedValidSession,
  seedLocallyExpiredSession,
};
