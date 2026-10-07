/**
 * 直连后端的 HTTP 客户端 —— 供 E2E 做**交叉断言**和**造服务端状态**。
 *
 * 两个用途：
 *   1. 交叉断言：用例断言 UI/本地状态的同时，直接问后端要真值
 *      （例：登出后拿旧 token 打受保护接口，必须 401）。
 *   2. 造服务端状态：P4-02 需要「本地认为有效、服务端认为无效」的状态，
 *      最干净的做法是让后端把这个 token 撤销掉（P4-02 步骤 2）。
 *
 * 为什么不用 `fetch`：jest 的 testEnvironment 被 uni-automator 换成了它自己的
 * environment.js，fetch 不保证存在。Node 核心模块 http 一定在。
 *
 * 为什么用 JS 重写而不是 exec python fixture：
 * `docs/e2e/scripts/e2e_fixture.py` 是**契约的出处**，本文件与它逐条对齐；
 * 从 jest 里执行它需要 Windows 侧 PATH 上有 poetry + Python，引入不必要的失败面。
 * 两边的接口路径、payload、返回字段必须保持一致 —— 改一边请同步另一边。
 */

const http = require('http');
const { URL } = require('url');

const API_PREFIX = '/api/secure-chat';

function apiBase() {
  return (process.env.E2E_API || 'http://localhost:8000').replace(/\/+$/, '');
}

/**
 * 发一次 JSON 请求。**不抛 HTTP 错误** —— 而是把 status 交回调用方，
 * 因为「拿到 401」本身就是要断言的结果，不是异常。
 */
function requestJson(method, path, { body, token, timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiBase() + path);
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const headers = {};
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = payload.length;
    }
    if (token) headers.Authorization = `Bearer ${token}`;

    const req = http.request(
      { hostname: url.hostname, port: url.port || 80, path: url.pathname + url.search, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let data = text;
          try {
            data = JSON.parse(text);
          } catch {
            /* 非 JSON 就原样返回字符串，交给调用方判断 */
          }
          resolve({ status: res.statusCode, data });
        });
      }
    );
    req.on('error', (e) =>
      reject(
        new Error(
          `连不上后端 ${apiBase()}${path}：${e.message}\n` +
            '→ 确认后端已启动（poetry run uvicorn server.app:app --port 8000），或用 E2E_API 指向正确地址。'
        )
      )
    );
    req.setTimeout(timeout, () => req.destroy(new Error(`请求超时（${timeout}ms）：${method} ${path}`)));
    if (payload) req.write(payload);
    req.end();
  });
}

// ───────────────────────── 与 e2e_fixture.py 对齐的操作 ─────────────────────────

/** 探活：/docs 或任意接口能通即可。用于跑前检查后端是否起来了。 */
async function ping() {
  try {
    const res = await requestJson('GET', '/openapi.json');
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * 注册一次性账号（对应 `e2e_fixture.py register`）。
 *
 * 为什么每条用例都要新账号：交易/持仓类断言依赖精确数值（初始 100000.00、持仓 0），
 * 复用固定账号第二次跑必红。P4 本身不依赖数值，但统一用法可以减少心智负担。
 */
async function registerAccount({ attempts = 3 } = {}) {
  let lastError = null;
  for (let i = 1; i <= attempts; i += 1) {
    const ts = Date.now();
    const email = `e2e${ts}@ai-etf.xyz`;
    const password = `E2e_${ts}_aZ`; // 满足前端「≥8 位」；不含 shell 元字符
    const res = await requestJson('POST', `${API_PREFIX}/register`, { body: { email, password } });

    if (res.status === 409 && i < attempts) {
      lastError = new Error(`注册 ${email} 撞上已存在（409）`);
      continue;
    }
    if (res.status !== 200) {
      throw new Error(`注册失败 HTTP ${res.status}：${JSON.stringify(res.data)}`);
    }
    const data = res.data || {};
    if (data.needs_email_confirmation) {
      throw new Error(
        `注册 ${email} 成功但 Supabase 要求邮箱确认，拿不到 token。\n` +
          '→ E2E 依赖「注册即可用」，需在 Supabase 关掉 Confirm email（docs/e2e/05-执行计划.md §八）。'
      );
    }
    let token = data.access_token;
    if (!token) {
      token = (await loginWithPassword(email, password)).token;
    }
    return { email, password, token, userId: data.user_id };
  }
  throw lastError || new Error('注册连续失败');
}

/** 用已有账号换 token（对应 `e2e_fixture.py token`）。 */
async function loginWithPassword(email, password) {
  const res = await requestJson('POST', `${API_PREFIX}/login`, { body: { email, password } });
  if (res.status !== 200) {
    throw new Error(`登录 ${email} 失败 HTTP ${res.status}：${JSON.stringify(res.data)}`);
  }
  const data = res.data || {};
  if (!data.access_token) throw new Error(`登录 ${email} 成功但响应里没有 access_token`);
  return { email, token: data.access_token, userId: data.user_id, expiresIn: data.expires_in };
}

/**
 * 撤销一个 token（对应 P4-02 的「服务端撤销」）。
 *
 * ⚠️ 已知限制（要写进用例说明）：后端登出黑名单是**内存态**，
 * 后端进程一重启，被撤销的 token 就「复活」，P4-02 会变成假绿/假红。
 * 所以跑 P4-02 期间不要重启后端。
 */
async function revokeToken(token) {
  const res = await requestJson('POST', `${API_PREFIX}/logout`, { token });
  if (res.status !== 200) {
    throw new Error(`撤销 token 失败 HTTP ${res.status}：${JSON.stringify(res.data)}`);
  }
  return res.data;
}

/** 注销账号（对应 `e2e_fixture.py cleanup`）。401/404 视为「已不存在」，不抛错。 */
async function deleteAccount(token, password) {
  const res = await requestJson('POST', `${API_PREFIX}/delete-account`, { token, body: { password } });
  if (res.status === 401 || res.status === 404) {
    return { success: false, alreadyGone: true, detail: res.data };
  }
  if (res.status !== 200) {
    throw new Error(`注销账号失败 HTTP ${res.status}：${JSON.stringify(res.data)}`);
  }
  return { success: true, data: res.data };
}

// ───────────────────────── 交叉断言用的只读接口 ─────────────────────────

/**
 * 读会话列表。返回 { status, total, chats }。
 * P4-05 断言③要拿 `total` 与 UI 列表条数比对；P4-02 用它确认「token 确实失效了」。
 */
async function getChats(token) {
  const res = await requestJson('GET', `${API_PREFIX}/chats?limit=50`, { token });
  const data = res.data && typeof res.data === 'object' ? res.data : {};
  const chats = data.chats || [];
  return { status: res.status, total: data.total != null ? data.total : chats.length, chats };
}

module.exports = {
  API_PREFIX,
  apiBase,
  requestJson,
  ping,
  registerAccount,
  loginWithPassword,
  revokeToken,
  deleteAccount,
  getChats,
};
