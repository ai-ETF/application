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
 *   P4-03 ✅ 覆盖（2026-10-10 补写）—— 走了真实 UI（`#settings-logout` + `el.tap()`），
 *          确认框用「换掉 `wx.showModal`」的办法自动点确定，顺带把弹窗文案也断言了。
 *          唯一没覆盖的是「点取消」那一支（做得到，没做）。
 *   P4-04 ✅ 覆盖（真实用户打开小程序的第一跳）
 *   P4-05 ✅ 覆盖（2026-10-10 补写）—— 真实 UI 登录（`#login-account`/`#login-password`
 *          `el.input()` + `#login-submit` `el.tap()`）。「内存态被清空」用**注入残留再观察它消失**
 *          的办法测（见该用例上方说明）。
 *
 * ⚠️⚠️ 一条踩过的坑，别再走一遍：**`mockUniMethod('showModal', {confirm:true})` 让确认框自动点确定，是没用的。**
 *    它改的是 uni-app 自己的 `uni` 对象，而应用那条 `await uni.showModal(...)` 依赖 uni-app 的
 *    promisify 包装，包装一被换掉就没人 resolve。要用 `helpers.withNativeModal`（直接换 `wx.showModal`）。
 *    完整实测经过见 `helpers/uniMock.js` 顶部第 5 条。
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
const SETTINGS_PATH = 'pages/settings/index';
const SETTINGS_ROUTE = '/pages/settings/index';

// ⚠️ 别把设置页当成「TabBar 上的一个 tab」去 switchTab：
// `src/pages.json` 里**没有任何 tabBar 配置**（grep 全文件 0 命中），
// 底部的 TabBar 是自定义组件 `src/components/common/TabBar.vue`，内部走
// `uni.redirectTo({ url: '/pages/settings/index' })`（TabBar.vue#L131）。
// 测试侧直接 reLaunch 到这个路由即可。

/** P4-05 用的「上一位用户残留」标记，塞进 chat store 的内存态里。 */
const GHOST_MARK = 'P4-05-GHOST';

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

// ───────────────────────── P4-03 / P4-05 的观测手段 ─────────────────────────

/**
 * 读聊天 store 的**内存态**（P4-05 用它证明「上一位用户的残留」在不在）。
 *
 * 走 `getCurrentPages()[last].$vm.$pinia.state.value.chat` —— 注意 `$pinia` 是
 * `app.use(pinia)` 挂在 globalProperties 上的，**每个页面实例都有**，所以登录页也能读。
 * （`page.data()` 读不到这些：uni-app Vue3 页面的业务状态不在 page.data 上，见文件头。）
 */
function readChatMemory() {
  return program.evaluate(() => {
    const pages = getCurrentPages();
    const vm = pages[pages.length - 1].$vm;
    const chat = vm.$pinia.state.value.chat;
    return {
      currentChatId: chat.currentChatId,
      messages: chat.messages.map((m) => m.content),
      sessionIds: chat.sessions.map((s) => s.id),
    };
  });
}

/**
 * 往聊天 store 里塞一条「上一位用户留下的」残留，返回塞完后的值。
 *
 * ⚠️ 为什么塞 `messages` / `currentChatId`，**不塞 `sessions`**：
 *   首页 `onMounted` 的 `fetchSessions()` 会把 `sessions` **整个换掉**
 *   （`chat.ts#L95`：`sessions.value = res.data.chats || []`）——
 *   塞 sessions 的话，「残留没了」不能归因于 `resetUserMemory()`，会被这次 fetch 顶掉。
 *   `messages` / `currentChatId` 在**登录之后**没有任何别的代码路径会动它们：
 *   `fetchMessages` 只在「有会话、且自动打开最近一条」时才跑
 *   （`chat.ts#L88-L102` + `index/index.vue#L84-L94`），而本用例的账号是**一次性新账号、0 会话**。
 *
 * ⚠️ 必须在**已经实例化了 chat store 的页面**上调用（首页 `setup` 里 `useChatStore()`）。
 *   在没实例化过的页面上调，`state.value.chat` 是 undefined。
 */
function seedGhostChatMemory(mark) {
  return program.evaluate((markText) => {
    const pages = getCurrentPages();
    const vm = pages[pages.length - 1].$vm;
    const chat = vm.$pinia.state.value.chat;
    chat.currentChatId = markText;
    chat.messages = [{ id: markText, type: 'user', content: markText, timestamp: Date.now() }];
    return { currentChatId: chat.currentChatId, messages: chat.messages.length };
  }, mark);
}

/**
 * 首页会话列表（SessionDrawer）在 DOM 里渲染出来的条数。
 *
 * 不用先点开抽屉：抽屉面板**一直在 DOM 里**，关闭只是 CSS 位移
 * （`SessionDrawer.vue#L274-L291`：`.drawer { transform: translateX(-100%) }`，
 * 只有遮罩层 `.overlay` 是 `v-if="visible"`）。`.session-item` 全项目只有这一处。
 */
async function countDrawerSessions() {
  const box = await helpers.waitFor(
    async () => {
      const p = await program.currentPage();
      if (p.path !== INDEX_PATH) return false;
      // 返回对象而不是数字：条数可能是 0，而 waitFor 是按真值判定的，
      // 返回 0 会被当成「还没满足」一直等到超时（这个坑见 waitFor.js#L75-L80）。
      return { count: (await p.$$('.session-item')).length };
    },
    { timeout: 8000, label: '首页会话列表可读（读不到会一直等到超时，不会假绿）' }
  );
  return box.count;
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
    //
    // ⚠️ 本条是文件里第一条，紧跟在 beforeAll（建账号，几发 HTTP）之后。应用此刻的启动
    // 跳转（onLaunch → restoreSession → redirectToLogin）可能还没收尾，直接发导航会被
    // 丢掉。2026-10-09 实测：不加这一行，4 次里红 1 次，表征是「停在 pages/login/index」
    // —— 即 §5.3 那类「导航被丢弃」，跟鉴权旗标无关（测试发导航走的是原生 wx.reLaunch，
    // 根本不经过应用那套逻辑）。加完之后 4 次里 0 红。
    await helpers.waitForStablePage(program, { stableMs: 2500 });
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
    //
    // ⚠️ 进首页之前先等应用上一次导航彻底停稳。上一条（P4-01）末尾是应用**自己**跳到
    // 登录页；紧接着就发导航，会撞上 `auth.ts` 里 `redirecting` 那个旗标还没复位。
    // 一旦撞上，应用这一次的踢人会被 `if (redirecting) return` **静默吞掉** ——
    // 存储清干净、不弹 toast、也不跳转（2026-10-09 用探针实测确认，见 README §6.6）。
    // 实测：加这一行之前本条 `-t 'P4'` 四次全红、每次都是它。
    // ⚠️ 等待时长有讲究：旗标名义上 `complete` + 300ms 复位，但本环境实测要**1 秒以上**
    // （600ms 只让本条变绿，P4-04 照样红；2500ms 之后两条都稳）。所以别把 2500 调小。
    await helpers.waitForStablePage(program, { stableMs: 2500 });
    await helpers.reLaunch(program, INDEX_ROUTE);

    const page = await helpers.waitForPage(program, LOGIN_PATH, {
      timeout: 8000, // 比 P4-01 宽：这里要等一次真实的 HTTP 往返
      label: '401 后应被踢到登录页',
    });
    expect(page.path).toBe(LOGIN_PATH);
    expect(await helpers.findLeftoverAuthKeys(program)).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────
  // P4-03 正常登出
  //
  // 覆盖到哪一层（别把结论看大了）：
  //   ① 确认框文案（title/content/confirmText） —— ✅ 覆盖
  //      （2026-10-10 起可测：把 `wx.showModal` 换掉时顺带把参数录下来，
  //        见 `helpers/uniMock.js` 的 `stubNativeModal` / `readNativeModalCalls`）
  //   ② 后端确实收到登出并撤销了 token —— ✅ 覆盖（直连后端交叉验证：登出前 200、登出后 401）
  //   ③ 本地 4 个 auth key + 2 个历史键清空 —— ✅ 覆盖
  //   ④ 跳转 /pages/login/index —— ✅ 覆盖
  //   ⑤ 重新登录同一账号仍成功 —— ➡️ 挪到 P4-05 做（那里要的就是一次真实 UI 登录），此处不重复
  //   ❌ **没覆盖**：确认框里点「取消」那一支（`if (!result.confirm) return`）。
  //      技术上做得到（`withNativeModal(program, {confirm:false})`），但没写 —— 不是做不到，是没做。
  it('P4-03 正常登出：撤销服务端 token + 清本地 4 个 key + 跳登录页', async () => {
    // 步骤 0：先把应用推到登录页，拿一个确定的起点（也顺手排掉上一条留下的导航尾巴）。
    await helpers.waitForStablePage(program, { stableMs: 2500 });
    await helpers.clearAuthKeys(program);
    await helpers.reLaunch(program, LOGIN_ROUTE);
    await helpers.waitForPage(program, LOGIN_PATH, { timeout: 5000, label: 'P4-03 起点：登录页' });

    // 步骤 1：⚠️ 必须换一个新 token 来测，不能用 account.token。
    //   P4-02 已经拿 account.token 做过「服务端撤销」，而后端黑名单是**内存态**、
    //   一整轮跑下来不会解除。继续用旧 token 的话，**不登出也是 401**，
    //   预期② 就变成了一句废话（假绿）。
    const fresh = await helpers.loginWithPassword(account.email, account.password);

    // 交叉前置：这个 token 现在确实好用。没有这一句，后面的 401 什么都说明不了。
    expect((await helpers.getChats(fresh.token)).status).toBe(200);

    // 步骤 2：造「已登录」这个前提。
    //   这里走写 Storage 而不是真实 UI 登录 —— 本条要的是「已经登录」这个**状态**，
    //   不是「登录这个动作」（依据见 `helpers/storage.js` 顶部注释）；
    //   「登录动作」由 P4-05 的真实 UI 登录覆盖。
    await helpers.seedValidSession(program, { token: fresh.token, user: buildUser(account) });

    // 步骤 3：进设置页（路由怎么来的见文件顶部 SETTINGS_ROUTE 的注释）
    await helpers.reLaunch(program, SETTINGS_ROUTE);
    await helpers.waitForPage(program, SETTINGS_PATH, { timeout: 8000, label: '应落到设置页' });

    // 等「退出登录」按钮真的渲染出来再点。
    // 不要拿 waitForPage 返回的那个 page 直接 $()：它是在 path 一匹配上就返回的，
    // 那一刻页面可能还在 mount（同类坑：拿到跳转窗口期的 page，见文件头）。
    const logoutBtn = await helpers.waitFor(
      async () => {
        const p = await program.currentPage();
        if (p.path !== SETTINGS_PATH) return false;
        return (await p.$('#settings-logout')) || false; // settings/index.vue#L129
      },
      { timeout: 8000, label: '设置页「退出登录」按钮就位' }
    );

    // 步骤 4：点它。把确认框变成「自动点确定」。
    //   必须处理：不管的话会弹出真的原生确认框，没有人去点，用例卡死。
    //   ⚠️ 这一步**不能**用 `mockUniMethod('showModal', {confirm:true})`（试过，不管用）——
    //   它改的是 uni-app 自己的 `uni`，而应用的 `await uni.showModal(...)` 依赖
    //   uni-app 的 promisify 包装，包装被换掉后没人 resolve。
    //   详见 `helpers/uniMock.js` 顶部第 5 条（含实测证据）。
    //   能用的做法是直接换掉 `wx.showModal`：`withNativeModal`。
    //   顺带把这次调用的参数录下来 —— 这样预期①（弹窗文案）也测得了。
    let modalCalls = [];
    await helpers.withNativeModal(program, { confirm: true }, async () => {
      // handleLogout（settings/index.vue#L202）：
      //   showModal → 不是 confirm 就 return → await logout() → reLaunch('/pages/login/index')
      await logoutBtn.tap();
      modalCalls = await helpers.readNativeModalCalls(program);
    });

    // 预期①：确认框的文案（settings/index.vue#L203-L207）
    expect(modalCalls.length).toBeGreaterThan(0);
    expect(modalCalls[0].title).toBe('退出登录');
    expect(modalCalls[0].content).toBe('退出后需要重新输入用户名和密码，是否继续？');
    expect(modalCalls[0].confirmText).toBe('退出');

    // 预期④：跳转排在「等后端登出返回」之后（useAuth.ts#L175-L197），所以超时给宽一点
    const landed = await helpers.waitForPage(program, LOGIN_PATH, {
      timeout: 12000,
      label: '登出后应跳到登录页',
    });
    expect(landed.path).toBe(LOGIN_PATH);

    // 预期③：4 个 auth key + 2 个历史键全空（authStore.clearAuth → clearAuthSession，auth.ts#L165-L170）
    expect(await helpers.findLeftoverAuthKeys(program)).toEqual([]);

    // 预期②：后端确实撤销了。⚠️ 用的是**登出前那把** token ——
    //   只有它变成 401，才能证明「是这次登出干的」，而不是本来就不能用。
    expect((await helpers.getChats(fresh.token)).status).toBe(401);
  });

  // ─────────────────────────────────────────────────────────────────
  it('P4-04 未登录直接进首页：被统一踢到登录页', async () => {
    // 前置：清空本地登录态（含历史键）
    await helpers.clearAuthKeys(program);
    expect(await helpers.findLeftoverAuthKeys(program)).toEqual([]);

    // 步骤：直接进首页。首页没有显式的 isAuthenticated 守卫，
    // 全靠 onMounted → fetchSessions() → request() 这条链把它踢走。
    //
    // ⚠️ 同上：上一条（P4-02）末尾也是应用自己跳到登录页，紧接着发 reLaunch 会撞上
    // `redirecting` 旗标没复位的窗口，本条会被静默吞掉。
    //
    // 2026-10-09 实测确认（探针判据：应用**删了 6 个 key、却没弹 toast** ⇒ 旗标是 true、
    // 在 `auth.ts:186` 直接 return）：本条单独跑是绿的，跟在 P4-02 后面跑就红；静置 2 秒后
    // 重试即恢复。⚠️ 600ms 的等待**不够**（本条 8 次里仍红 4 次），要 2500ms 才稳。
    await helpers.waitForStablePage(program, { stableMs: 2500 });
    await helpers.reLaunch(program, INDEX_ROUTE);

    const page = await helpers.waitForPage(program, LOGIN_PATH, {
      timeout: 5000,
      label: '未登录进首页应被踢到登录页',
    });
    expect(page.path).toBe(LOGIN_PATH);
    expect(await helpers.findLeftoverAuthKeys(program)).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────
  // P4-05 过期后重新登录恢复
  //
  // 【这条为什么必须走真实 UI 登录，不能用写 Storage 顶替】
  //   核心断言是「上一位用户的内存态被清空」，而这个清空动作只发生在
  //   `useAuth.login()` 里面：它成功之后调 `resetUserMemory()`
  //   （`useAuth.ts#L119` → `#L70-L74`，清 chat / watchlist / user 三个 store）。
  //   往 Storage 里塞一个有效会话**绕过了 login()**，resetUserMemory 根本不会跑，
  //   那样测出来的「清空了」是假绿。所以这里点真实按钮、走真实登录。
  //
  // 【怎么把「内存态被清空」变成可观测的】
  //   先往聊天 store 的内存里塞一条**上一位用户的残留**（GHOST_MARK），
  //   再完成一次真实登录，然后看这条残留还在不在。
  //   塞 `messages` / `currentChatId` 而不是 `sessions` 的原因见 seedGhostChatMemory 的注释。
  //   ⚠️ 残留真的会让用户看到：`ChatMessageList :messages="chatStore.messages"`
  //      （`index/index.vue#L24-L27`）—— 不清就是**上一个账号的消息串进新账号的界面**。
  //
  // 【⚠️ 这条账号必须是 0 会话的一次性新账号】
  //   账号若已有会话，首页 `onMounted` 会自动打开最近一条并 `fetchMessages()`
  //   （`index/index.vue#L88-L93`），`messages` 会被服务端数据覆盖，
  //   残留消失就不再能归因于 resetUserMemory。`beforeAll` 的 `registerAccount()` 满足这一点。
  it('P4-05 过期后重新登录：上一位用户的内存态被清空 + 会话列表与后端一致', async () => {
    // ── 起点确定化 ────────────────────────────────────────────
    await helpers.waitForStablePage(program, { stableMs: 2500 });
    await helpers.clearAuthKeys(program);
    await helpers.reLaunch(program, LOGIN_ROUTE);
    await helpers.waitForPage(program, LOGIN_PATH, { timeout: 5000, label: 'P4-05 起点：登录页' });

    // ── 步骤 1：换一把新 token（account.token 可能已被 P4-02 撤销）──
    const fresh = await helpers.loginWithPassword(account.email, account.password);
    expect((await helpers.getChats(fresh.token)).status).toBe(200);

    // ── 步骤 2：造一个「已登录」的界面，好让 chat store 被实例化 ──
    //   （chat store 是懒创建的；首页 setup 里 useChatStore()，所以必须先进一次首页）
    await helpers.seedValidSession(program, { token: fresh.token, user: buildUser(account) });
    await helpers.reLaunch(program, INDEX_ROUTE);
    await helpers.waitForPage(program, INDEX_PATH, {
      timeout: 8000,
      label: '先落到首页，让 chat store 就位',
    });

    // ── 步骤 3：塞一条「上一位用户」的残留 ──────────────────
    const seeded = await seedGhostChatMemory(GHOST_MARK);
    // 反假绿自检：塞不进去就直接红，别让后面「残留没了」变成一句空话
    expect(seeded.currentChatId).toBe(GHOST_MARK);
    expect(seeded.messages).toBe(1);

    // ── 步骤 4：把会话「弄丢」—— 清空本地登录态、回到登录页 ──
    //   这就是 P4-01 / P4-02 结束时的样子：人停在登录页，内存里还留着上一位用户的东西。
    await helpers.clearAuthKeys(program);
    await helpers.reLaunch(program, LOGIN_ROUTE);
    await helpers.waitForPage(program, LOGIN_PATH, { timeout: 5000, label: '回到登录页' });

    // 再自检一次：残留要能**跨过这一次跳转**还在（否则「登录后没了」也不能归因）
    const before = await readChatMemory();
    expect(before.currentChatId).toBe(GHOST_MARK);
    expect(before.messages).toContain(GHOST_MARK);

    // ── 步骤 5：真实 UI 登录（预期①）──────────────────────────
    // ⚠️ 这个 waitFor 的返回值必须是 **page**，不能return 表单元素 ——
    //    `waitFor` 按真值判定，返回元素的话它会直接把那个元素交出来，
    //    后面 `page.$('#login-account')` 就变成在元素上找子元素，恒为 null。
    const page = await helpers.waitFor(
      async () => {
        const p = await program.currentPage();
        if (p.path !== LOGIN_PATH) return false;
        const accountInput = await p.$('#login-account');
        if (!accountInput) return false;
        return (await p.$('#login-password')) ? p : false;
      },
      { timeout: 8000, label: '登录表单就位' }
    );

    await (await page.$('#login-account')).input(account.email);
    await (await page.$('#login-password')).input(account.password);

    // 等「登录」按钮解除禁用再点。`canSubmit` 要求账号和密码都非空
    // （login/index.vue#L112-L114），而 class 上会带 `submit-btn--disabled`
    // —— 直接点它不会报错，只会**静静地什么都不做**，然后用例卡在等首页。
    await helpers.waitFor(
      async () => {
        const el = await page.$('#login-submit');
        if (!el) return false;
        const cls = (await el.attribute('class')) || '';
        return !cls.includes('submit-btn--disabled');
      },
      { timeout: 5000, label: '「登录」按钮解除禁用' }
    );

    await (await page.$('#login-submit')).tap();

    // 预期①：登录成功 → 跳首页（login/index.vue#L126-L133，等一次真实 HTTP 往返）
    await helpers.waitForPage(program, INDEX_PATH, {
      timeout: 15000,
      label: '登录成功后应进首页',
    });

    // ── 预期②（⭐）：上一位用户的内存态已清空 ─────────────────
    //   残留还在 = `resetUserMemory()` 没跑 = 上一位用户的消息串进了新账号的界面。
    const after = await readChatMemory();
    expect(after.currentChatId).toBe('');
    expect(after.messages).toEqual([]);

    // ── 预期③：会话列表条数与后端一致 ────────────────────────
    //   读「应用登录后自己存下来的那把 token」，用它向后端要真值 ——
    //   这样交叉断言的双方都是应用写的，不是测试塞的。
    const appToken = await helpers.getKey(program, helpers.AUTH_STORAGE_KEYS.token);
    expect(typeof appToken === 'string' && appToken.length > 0).toBe(true);

    const backend = await helpers.getChats(appToken);
    expect(backend.status).toBe(200);

    // 等一次会话列表请求收尾（首页 onMounted → fetchSessions，chat.ts#L88-L102）
    await helpers.sleep(1500);
    const domCount = await countDrawerSessions();

    // 一次性新账号 → 两端都应该是 0。这条真正挡的是「列表里混着**别人**的会话」：
    // 只要 UI 上多出一条不属于当前账号的，这里就会红。
    expect((await readChatMemory()).sessionIds.length).toBe(backend.total);
    expect(domCount).toBe(backend.total);
    console.log(`[P4-05] 会话列表：后端 total=${backend.total}，界面条数=${domCount}`);
  });
});
