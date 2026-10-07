/**
 * P4 鉴权失效路径 —— E2E。
 *
 * ⚠️ 先说清楚这一版覆盖了什么、没覆盖什么，别把结论看大了。
 *
 * 【本文件写于「只能用页面级/存储级」的时期，那个前提已经在 2026-10-03 被证伪】
 *   2026-10-03 在本机（Windows + 开发者工具 Stable v1.06.2504040）跑了一轮专门的能力
 *   探针，实测结论 —— **元素查询、输入、点击、evaluate 全部可用**：
 *     ✅ program.evaluate(() => 1 + 1)      → 2
 *     ✅ page.$('view') / page.$$('view')   → 找到元素（class 选择器同样可用）
 *     ✅ el.attribute('class') / el.text()  → 读到属性与文案
 *     ✅ el.input('...')                    → **真的写进 Vue 的 v-model**
 *        （证据：填完两个输入框后，登录按钮的 class 里 `submit-btn--disabled` 消失）
 *     ✅ el.tap()                           → 返回 {pageX, pageY, ...}
 *     ✅ $vm.$pinia.state.value             → 直接读到 auth / chat 两个 store
 *     ⚠️ page.data() 可用，但返回 {} —— uni-app Vue3 页面的业务状态不在 page.data 上；
 *        要读组件状态走 `program.evaluate` 里的 `getCurrentPages()[last].$vm.$`
 *     端到端闭环也验证过：填假账号 → tap「登录」→ `.error-box` 出现「邮箱或密码错误」。
 *
 *   **旧结论里那句「发出去不回包、永久挂起」的来源**（已定位，不是 SDK 不支持）：
 *   `program.currentPage()` 可能把一个**站在页面跳转窗口期**的 page 交给你。
 *   实测在 `pages/index/index → pages/login/index` 的跳转途中拿到 pageId=1，紧接着
 *   开发者工具侧就回 `{"error":{"message":"page destroyed"}}` —— 报错来自**开发者工具**，
 *   不是 uni-automator。等应用落定再取 page 就一切正常。
 *   ⇒ 正确姿势：**先等页面稳定（或轮询 currentPage 直到 path 不再变），再取 page**。
 *      `helpers.waitForPage` 已经是这么写的，所以本文件没受这个坑影响。
 *
 *   注意 `mockUniMethod` 的**函数式** mock（第二个参数传函数、用来捕获参数）仍然是
 *   调不通的（`(intermediate value) is not a function`）—— 这一条今天没有推翻，
 *   见 `helpers/uniMock.js`。
 *
 * 【因此下面对每条用例逐条标注「覆盖到哪一层」】
 *   P4-00 ✅ 覆盖（对照组，本文件新增，防假绿，见该用例上方说明）
 *   P4-01 ✅ 覆盖（触发点用聊天页，见下）
 *   P4-02 ✅ 覆盖，且是本文件里最强的一条 —— 401 由直连后端**交叉验证**
 *   P4-03 ⏭️ **本文件里未覆盖，但已具备解封条件**（元素查询可用了，见上方）。
 *          缺的是把「点退出登录」写成 `el.tap()` + 定位到那个元素的选择器。待补。
 *   P4-04 ✅ 覆盖（真实用户打开小程序的第一跳）
 *   P4-05 ⏭️ **本文件里未覆盖，但已具备解封条件**：真实 UI 登录现在写得出
 *          （`el.input()` + `el.tap()`）。待补。
 *
 * ⚠️ 跳过不是通过。报告里必须把 P4-03 / P4-05 记为「未覆盖」，不能算 PASS。
 *
 * 依据行号：
 *   - 本地过期分支（不发请求就跳转）：src/utils/request.ts#L39-L42
 *   - 401 分支（发了请求才跳转）：      src/utils/request.ts#L61-L65
 *   - 有效期三重条件：                  src/utils/auth.ts#L152-L162
 *   - 清 key + toast + 250ms 后 reLaunch：src/utils/auth.ts#L184-L197
 *   - 聊天页 onMounted 无条件拉会话：    src/pages/index/index.vue#L84-L86
 *   - fetchSessions 直连 request（无守卫）：src/stores/chat.ts#L88-L94
 *   - ⚠️ 为什么不用「tap 自选」当触发点：src/stores/watchlist.ts#L118-L123
 *      fetchFollowList 开头就 `getCurrentUserId()` 读被篡改的 Storage，
 *      返回空串直接 return —— **根本不发请求**，走不到 request()。
 *      docs/e2e/03 的 P4-01 写的是 tap 自选，那条路是死的。
 */

const helpers = require('./helpers');

// 注意两种写法并存，别混：
//   PATH  —— `currentPage().path` 的返回形式，**不带**前导斜杠（实测 "pages/index/index"）
//   ROUTE —— 传给 uni.reLaunch 的形式，**带**前导斜杠（app 自己也是这么写的，auth.ts#L191）
const LOGIN_PATH = 'pages/login/index';
const LOGIN_ROUTE = '/pages/login/index';
const INDEX_PATH = 'pages/index/index';
const INDEX_ROUTE = '/pages/index/index'; // 聊天页，onMounted 里无条件 fetchSessions()

// 首次要编译 + 冷启动开发者工具；每条用例本身最多等 5~8s
jest.setTimeout(120000);

/** 造一个满足 getAuthSession() 解析要求的 user（必须有 id，见 auth.ts#L119）。 */
function buildUser(account) {
  return { id: account.userId, username: 'e2e', displayName: 'e2e' };
}

/** 自检：确认我们造出来的「本地过期」状态，按 auth.ts#L152-L162 的三重条件确实判为无效。 */
function expectLocallyExpired(seed) {
  const now = Date.now();
  expect(seed.expireTime).toBeLessThanOrEqual(now); // 失效主因
  expect(seed.expireTime).toBeLessThanOrEqual(seed.loginTime + helpers.AUTH_SESSION_TTL_MS); // 防篡改那条仍成立
}

describe('P4 鉴权失效路径', () => {
  let account;

  beforeAll(async () => {
    // ── 数据安全闸门（08-实测记录 §4 step 0 的断言版）───────────────
    // 产物里 API_BASE 不是 localhost 就直接抛，宁可误杀也不能真写生产库。
    helpers.assertLocalApiBase();
    helpers.assertUrlCheckDisabled();
    // 下面这条断言的前提是 private config 里写着 touristappid（见 08 §6.2）。
    // 若你改用真 appid，前提是登录账号有开发者权限；没有权限时开发者工具会因
    // 「登录账号不是该小程序的开发者」拒绝打开项目，报出来却是
    // "please make sure http port is open"，很容易误判成端口问题。
    // 那种情况下请去掉这条断言，别去查端口。
    helpers.assertTouristAppId();

    if (!(await helpers.ping())) {
      throw new Error(
        '后端没起来，P4 无法跑。\n' +
          '→ 启动：poetry run uvicorn server.app:app --port 8000\n' +
          '→ 或设 E2E_API 指向别的地址。'
      );
    }

    account = await helpers.registerAccount();
    console.log('[P4] 一次性账号：', account.email);
  });

  afterAll(async () => {
    try {
      await helpers.clearAuthKeys(program);
    } catch (e) {
      console.warn('[P4] 清本地登录态失败：', (e && e.message) || e);
    }
    // 用【新取的 token】注销：P4-02 会把 account.token 撤销掉，
    // 拿旧 token 注销只会得到 401 并被当成「已不存在」，账号会残留。
    // （登出不影响账号本身，这正是 P4-03 预期⑤ 的前提。）
    if (account) {
      try {
        const fresh = await helpers.loginWithPassword(account.email, account.password);
        const result = await helpers.deleteAccount(fresh.token, account.password);
        console.log('[P4] 清理账号：', JSON.stringify(result));
      } catch (e) {
        console.warn(
          `[P4] ⚠️ 清理账号失败，Supabase 里残留 ${account.email}：${(e && e.message) || e}`
        );
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // P4-00 对照组 —— **不是任务单里的用例，是防「假绿」的**
  //
  // 为什么必须有：P4-01/02/04 的断言都是「最后停在登录页」。可如果
  //   (a) reLaunch 根本没生效，而 app 恰好本来就停在登录页，或者
  //   (b) 首页不管有没有会话都会把用户踢走
  // 那三条都会**绿得毫无意义**。
  //
  // 这条把两种假象一起堵死：先确定性地落到登录页（证明起点），
  // 再造一个**有效**会话跳首页，断言**停在首页**。
  //   - 停在首页 → reLaunch 确实会跳页（否则会留在登录页，本条直接红）
  //   - 停在首页 → 有效会话不会被踢（所以 01/02/04 被踢，只能归因于会话失效）
  it('P4-00 对照组：会话有效时进首页不会被踢走（证明 reLaunch 生效 + 踢人确由会话状态引起）', async () => {
    // 起点确定化：先落到登录页。不做这一步的话，「最后停在首页」有可能是
    // app 启动时本来就在首页，本条就白测了。
    await helpers.reLaunch(program, LOGIN_ROUTE);
    await helpers.waitForPage(program, LOGIN_PATH, {
      timeout: 5000,
      label: '对照组起点：应先落到登录页',
    });

    // 造一个本地完全有效的会话
    const seed = await helpers.seedValidSession(program, {
      token: account.token,
      user: buildUser(account),
    });
    expect(seed.expireTime).toBeGreaterThan(Date.now());
    expect((await helpers.getChats(account.token)).status).toBe(200); // token 本身也要是好的

    await helpers.reLaunch(program, INDEX_ROUTE);
    const page = await helpers.waitForPage(program, INDEX_PATH, {
      timeout: 8000,
      label: '会话有效时应停在首页',
    });
    expect(page.path).toBe(INDEX_PATH);

    // 再干等一会儿：踢人走的是「请求回来 → 250ms → reLaunch」，
    // 万一它比我这条断言还慢，等一等才能确认首页是真的稳。
    await helpers.sleep(2500);
    const settled = await program.currentPage();
    expect(settled.path).toBe(INDEX_PATH);
  });

  // ─────────────────────────────────────────────────────────────────
  it('P4-01 本地会话已过期：不发请求，直接跳登录页并清空 4 个 key', async () => {
    // 步骤 1：造「本地已过期、JWT 本身还没过期」的状态（只动 expire_time，不动 token）
    const seed = await helpers.seedLocallyExpiredSession(program, {
      token: account.token,
      user: buildUser(account),
    });
    expectLocallyExpired(seed);

    // 前置自检：token 本身是有效的（否则测不出「本地过期」与「token 失效」的区别）
    const chats = await helpers.getChats(account.token);
    expect(chats.status).toBe(200);

    // 步骤 2：触发受保护请求。用聊天页而不是自选页 —— 理由见文件顶部注释。
    await helpers.reLaunch(program, INDEX_ROUTE);

    // 预期③：跳转发生在 250ms(setTimeout) + reLaunch 之后，5s 绰绰有余
    const page = await helpers.waitForPage(program, LOGIN_PATH, {
      timeout: 5000,
      label: '本地过期后应被踢到登录页',
    });
    expect(page.path).toBe(LOGIN_PATH);

    // 预期④：4 个 auth key 全部清空（clearAuthSession，auth.ts#L165-L170）
    expect(await helpers.findLeftoverAuthKeys(program)).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────
  it('P4-02 本地有效但服务端已撤销：收到 401 后跳登录页并清空 4 个 key', async () => {
    // 步骤 1：造一个「本地完全有效」的会话
    const seed = await helpers.seedValidSession(program, {
      token: account.token,
      user: buildUser(account),
    });
    expect(seed.expireTime).toBeGreaterThan(Date.now());

    // 步骤 2：交叉验证这个 token 现在是好用的（否则后面测到的可能不是 401 分支）
    expect((await helpers.getChats(account.token)).status).toBe(200);

    // 步骤 3：让服务端把它撤销掉（⚠️ 黑名单是内存态，后端重启会「复活」）
    await helpers.revokeToken(account.token);

    // 步骤 4：交叉验证服务端确实已经拒绝它了 —— 这条是本用例的骨架
    expect((await helpers.getChats(account.token)).status).toBe(401);

    // 步骤 5：⚠️ 不要动本地存储，否则会走成 P4-01 的本地过期分支，测不到 401 分支
    await helpers.reLaunch(program, INDEX_ROUTE);

    const page = await helpers.waitForPage(program, LOGIN_PATH, {
      timeout: 8000, // 比 P4-01 宽：这里要等一次真实的 HTTP 往返
      label: '401 后应被踢到登录页',
    });
    expect(page.path).toBe(LOGIN_PATH);
    expect(await helpers.findLeftoverAuthKeys(program)).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────
  // P4-03 正常登出：⏭️ 本文件里未覆盖（阻塞已解除，待补写）
  //
  // 之前卡在两件事上：
  //   ① 点「退出登录」按钮 —— 需要元素查询。**2026-10-03 实测元素查询可用**，
  //      所以这条不再是阻塞；`confirmNextModal(program)` 的「结果式」mock 本来就能用。
  //   ② 缺一个能定位到该按钮的选择器 —— `src/pages/settings/index.vue` 目前没有 id，
  //      要么用 class 选择器（若唯一），要么先补一个 id。
  // ⚠️ `page.callMethod('handleLogout')` 这条路**仍然走不通**：page 够不到 Vue 组件方法。
  //    正确做法是走真实 UI（el.tap()），而不是想办法直接调组件方法。
  // 在此之前 P4-03 记为【未覆盖】，不算 PASS。
  it.skip('P4-03 正常登出：撤销服务端 token + 清本地 + 跳登录页', () => {
    /* 待补：需要先给「退出登录」按钮定一个选择器（补 id 或确认 class 唯一） */
  });

  // ─────────────────────────────────────────────────────────────────
  it('P4-04 未登录直接进首页：被统一踢到登录页', async () => {
    // 前置：清空本地登录态（含历史键）
    await helpers.clearAuthKeys(program);
    expect(await helpers.findLeftoverAuthKeys(program)).toEqual([]);

    // 步骤：直接进首页。首页没有显式的 isAuthenticated 守卫，
    // 全靠 onMounted → fetchSessions() → request() 这条链把它踢走。
    await helpers.reLaunch(program, INDEX_ROUTE);

    const page = await helpers.waitForPage(program, LOGIN_PATH, {
      timeout: 5000,
      label: '未登录进首页应被踢到登录页',
    });
    expect(page.path).toBe(LOGIN_PATH);
    expect(await helpers.findLeftoverAuthKeys(program)).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────
  // P4-05 过期后重新登录恢复：⏭️ 本文件里未覆盖（阻塞已解除，待补写）
  //
  // 核心断言②「上一位用户的内存态已清空」必须由一次**真实 UI 登录**触发
  // （useAuth.login → resetUserMemory，application/src/composables/useAuth.ts#L70-L74、#L119）。
  // 直接往 Storage 里塞一个有效会话**不等价** —— 那样绕过了 login()，
  // resetUserMemory 根本不会被调用，断言会变成假绿。宁可跳过也不能这么测。
  //
  // 之所以现在能写：真实 UI 登录 = 往两个 `.input-field` 里 `el.input()` + `el.tap()`
  // 「登录」（2026-10-03 实测可用，见文件头）。⚠️ 但它依赖**后端有可用的测试账号**，
  // 且登录会真的写库 —— 补写前先确认用一次性账号。
  it.skip('P4-05 过期后重新登录：内存态被清空 + 会话列表恢复', () => {
    /* 待补：真实 UI 登录现在写得出（input + tap），但需要一次性账号 */
  });
});
