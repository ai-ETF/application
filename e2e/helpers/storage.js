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

/** 清掉 4 个认证键 + 2 个历史键，等价于 clearAuthSession() 的效果。 */
async function clearAuthKeys(program) {
  for (const key of [...Object.values(AUTH_STORAGE_KEYS), ...LEGACY_KEYS]) {
    await removeKey(program, key);
  }
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

  await setKey(program, AUTH_STORAGE_KEYS.token, token);
  await setKey(program, AUTH_STORAGE_KEYS.user, JSON.stringify(user));
  await setKey(program, AUTH_STORAGE_KEYS.loginTime, String(loginTime));
  await setKey(program, AUTH_STORAGE_KEYS.expireTime, String(expireTime));

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

  await setKey(program, AUTH_STORAGE_KEYS.token, token);
  await setKey(program, AUTH_STORAGE_KEYS.user, JSON.stringify(user));
  await setKey(program, AUTH_STORAGE_KEYS.loginTime, String(loginTime));
  await setKey(program, AUTH_STORAGE_KEYS.expireTime, String(expireTime));

  return { loginTime, expireTime };
}

module.exports = {
  AUTH_STORAGE_KEYS,
  LEGACY_KEYS,
  AUTH_SESSION_TTL_MS,
  getKey,
  setKey,
  removeKey,
  clearAuthKeys,
  readAuthRaw,
  findLeftoverAuthKeys,
  parseJwtPayload,
  seedValidSession,
  seedLocallyExpiredSession,
};
