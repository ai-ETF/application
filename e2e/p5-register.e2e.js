/**
 * P5 注册 + 风险测评 —— E2E。
 *
 * 【这条路径的特殊之处，先看这一段再往下读】
 *
 * ⚠️ **P5 是整个 E2E 里唯一会往 Supabase 用户表真写数据的路径。**
 *    每跑一轮，这个文件会创建 **2 个真实账号**：
 *      · `riskAccount` —— 走 HTTP 建的（`helpers.registerAccount()`），后面的测评流程用它
 *      · `uiAccount`   —— 走**真实注册页 UI** 建的（P5-01 正例的产物）
 *    两个都在 `afterAll` 里注销；注销失败会打印残留邮箱，不会静默放过。
 *    跑之前请确认 `E2E_API` 指着本地栈（`beforeAll` 里有闸门，非 localhost 直接抛）。
 *
 * 【覆盖到哪一层 —— 别把结论看大了】
 *   P5-01 正例  ✅ 覆盖，且是**真实 UI 闭环**：深链进注册页 → 三个输入框真的 `el.input()`
 *               进 v-model → tap「创建账户」→ 500ms 后自动 reLaunch 首页。
 *               「自动登录成功」不停留在「本地有个 token」：**拿这个 token 直连后端
 *               `GET /chats` 断言 200**（token 真能用），再用同一组用户名/密码从后端登一次
 *               （账号真建出来了）。
 *   P5-01 负例① 409 → `用户名已存在` —— ✅ 覆盖（并交叉断言后端同 email 确实回 409）
 *   P5-01 负例② 密码 7 位 —— ✅ 覆盖。这条的关键不是文案，是**「根本没发请求」**：
 *               用 `helpers.withNativeCall(program, 'request')` 把 `wx.request` 包一层记账，
 *               断言调用次数为 0。只断言文案的话，一个「先发请求、被后端拒了、再显示这句」
 *               的实现也会绿。
 *   P5-02        ✅ 覆盖：设置页菜单进测评页 → 逐题作答 → 提交 → 结果态 → 后端交叉。
 *   P5-03        ✅ 覆盖，且**主动把最容易假绿的口子堵上了**：重进之前先删掉本地
 *               `risk_profile:<userId>` 缓存，仍然直接进结果态 —— 这才能证明结果是
 *               `loadProfileResult()` 从后端取的，而不是读了本地缓存（见该用例上方说明）。
 *
 *   ❌ **没覆盖**（做得到，是**没做**，不是做不到）：
 *      · **测评页左上角返回箭头** —— 被 D-08 挡住的，不是漏了（见下）。
 *        （同属 D-08 的**「登录页『还没有账户？注册』入口」已于 2026-10-11 补上，
 *          见文件最后的 **P5-04** —— D-08 堵的是「从这种页面往外跳」，而那条只验「进得去」。）
 *      · 「两次输入的密码不一致」（register/index.vue#L139-L141）—— 同属前端拦截分支，
 *        和负例② 一个套路。
 *      · 问卷加载失败的分支（risk-assessment/index.vue#L304-L307 的 catch / toast）
 *      · `loadProfileResult()` 里「API 失败 → fallback 本地缓存」那一段
 *        （risk-assessment/index.vue#L335-L350）—— 要造「后端挂了但缓存还在」的状态，
 *        得动 `wx.request` 让它失败，属于异常分支，本阶段没做。
 *      · 「重新测评后再提交一次会覆盖旧画像」（后端 risk_service 是 upsert 语义）
 *
 * 【⚠️ 一个本机特有的坑，不写下来一定会再踩】
 *   设置页那个「风险画像测评」菜单项**没有 id**（settings/index.vue#L96 只有
 *   `class="menu-card"`），而同一页有 **3 个** `.menu-card`（新闻订阅 / 风险画像测评 /
 *   意见反馈，还有别的）。所以**不能按 `.menu-card` 的下标点**，得遍历、看里面的
 *   `.menu-text` 文案是不是「风险画像测评」。
 *   这和 P2 处理底部导航是同一个坑（p2-chat.e2e.js#L221-L248：自选页自己也有
 *   `.tab-item`，按序号点会点到页内切换器）。
 *   → **测试侧不改 `src/` 下别人写的代码**，所以这里按文案找。
 *
 * 【⚠️⚠️ D-08：`navigateTo` 压上去的页面，短时间内跳不走 —— 这个文件首跑就是被它红的】
 *
 *   现象（2026-10-11 三只探针实测，探针已删；证据留在 00-背景与已知问题.md 的 D-08）：
 *     · `reLaunch` 单独打开的页面：往外跳**正常**（注册页 → 首页，2s 内到）
 *     · `navigateTo` 压上去的页面：**应用自己跳、测试侧跳、返回键，三种全被丢掉**
 *       实测同一句 `uni.reLaunch({url:'/pages/index/index'})`：
 *         D1 对照组（reLaunch 进的注册页）→ 走了 ✅
 *         D2       （点链接 navigateTo 进的注册页）→ 8 秒没动 ❌
 *         D3       （同 D2 状态，改发 `uni.navigateBack()`）→ 8 秒没动 ❌
 *       **连测试侧发的跳转都进不去**，所以不是应用那几行代码的问题。
 *
 *   它怎么红的（首跑记录）：P5-01 走「登录页点注册」进去 → 提交后后端返回 200、账号真建出来了，
 *   但应用那次 `reLaunch` 被丢 → 页面停在注册页 → 用例报「没落到首页」。
 *   当时看着像注册坏了，其实注册是好的 —— **红的是导航**。探针 2 两臂都记到了
 *   「注册成功」的 toast，把这一点钉死了。
 *
 *   本文件的对策（只管自己怎么绕，不动 `src/`）：
 *     · 进场一律 `helpers.gotoPage`（走 reLaunch，属于「正常」的那一类状态）
 *     · 需要离开一个 `navigateTo` 进来的页面时，也用 `gotoPage` 收敛（它自带重试），
 *       而不是「点一下然后干等它跳」
 *     · ⚠️ 所以**主流程里**没有「点返回箭头」「点注册链接」这两个真实动作 ——
 *       主流程必须能干净地继续往下跑，而这俩是「往外跳」的动作。
 *       「点注册链接」另立了一条**只验进得去**的用例 **P5-04**（在文件最后，不往外跳）；
 *       「点返回箭头」仍然没有 —— 它本身就是往外跳那一步，绕不开。
 *
 *   真机上是不是也这样：**需确认**（本机只有开发者工具 + automator 这一条观察路径）。
 *   如果真机也这样，那它不只是测试问题：「从登录页注册成功后不跳转」是用户能看见的。
 *
 * 依据行号：
 *   - 注册按钮 → `handleRegister`：              src/pages/register/index.vue#L88-L92, L136-L161
 *   - 密码不一致的前端拦截：                     src/pages/register/index.vue#L139-L142
 *   - 注册成功后 500ms 自动 reLaunch 首页：       src/pages/register/index.vue#L153-L155
 *   - 错误文案渲染位置（`.error-box > .error-text`）：src/pages/register/index.vue#L81-L84
 *   - 按钮 disabled 类（`submit-btn--disabled`）：src/pages/register/index.vue#L90
 *   - 用户名规则 `^[A-Za-z0-9_-]{3,32}$`：        src/utils/auth.ts#L12
 *   - 用户名 → 内部邮箱 `<用户名>@ai-etf.xyz`：   src/utils/auth.ts#L79-L82
 *   - 密码 < 8 位**就地返回、不发请求**：         src/composables/useAuth.ts#L139
 *   - 409 → 「用户名已存在」：                    src/composables/useAuth.ts#L22
 *   - 登录页的「注册」入口：                      src/pages/login/index.vue#L86, L156
 *   - 测评页进页面**先查后端画像**（不读缓存）：  src/pages/risk-assessment/index.vue#L281-L286, L314-L355
 *   - 提交成功切结果态：                          src/pages/risk-assessment/index.vue#L394-L429
 *   - 进度计数 `.progress-count`：                src/pages/risk-assessment/index.vue#L43
 *   - 结果徽章 / 总分 / 维度 / 小结：             src/pages/risk-assessment/index.vue#L117, L119, L127, L150
 *   - 「重新测评」：                              src/pages/risk-assessment/index.vue#L162, L475-L495
 *   - 设置页「已测评 / 去测评」标签：              src/pages/settings/index.vue#L104-L105
 *   - 风险画像本地缓存键 `<key>:<userId>`：        src/utils/auth.ts#L177-L179
 *   - 后端：GET /risk/questionnaire、POST /risk/submit(201)、GET /risk/profile
 *                                                 server/api/risk.py#L28, L69, L102
 */

const helpers = require('./helpers');

// 两种写法并存，别混（沿用 p4 的约定）：
//   PATH  —— `currentPage().path` 的返回形式，**不带**前导斜杠
//   ROUTE —— 传给 uni.reLaunch 的形式，**带**前导斜杠
const REGISTER_PATH = 'pages/register/index';
const REGISTER_ROUTE = '/pages/register/index';
const LOGIN_PATH = 'pages/login/index';
const LOGIN_ROUTE = '/pages/login/index';
const SETTINGS_PATH = 'pages/settings/index';
const SETTINGS_ROUTE = '/pages/settings/index';
const RISK_PATH = 'pages/risk-assessment/index';
const INDEX_PATH = 'pages/index/index';

/** P5-01 正例走 UI 注册时用的密码。11 位，满足前端「≥8 位」。 */
const UI_PASSWORD = 'E2e!Pass123';
/** P5-01 负例②专用：**故意**只有 7 位。 */
const SHORT_PASSWORD = 'E2eP123';

// 首次要编译 + 冷启动开发者工具；单条用例本身预计 10~25s
jest.setTimeout(180000);

/** 造一个 `getAuthSession()` 认的 user（必须有 id，见 src/utils/auth.ts#L119）。 */
function buildUser(account) {
  return { id: account.userId, username: 'e2e', displayName: 'e2e' };
}

/** 把一个用户名变成它对应的后端内部邮箱（复刻 src/utils/auth.ts#L79-L82）。 */
function backendEmail(username) {
  return `${username.trim().toLowerCase()}@ai-etf.xyz`;
}

/** 生成一个「撞不上」的用户名：`e2e` + 毫秒时间戳 + 两位随机，共 18 位，符合 3-32 位规则。 */
function freshUsername() {
  const suffix = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return `e2e${Date.now()}${suffix}`;
}

/** 当前页对象。 */
async function pageNow() {
  return program.currentPage();
}

/** 元素文案（`el.text()` 底层是 innerText，读之前统一 trim）。 */
async function textOf(el) {
  return el ? ((await el.text()) || '').trim() : null;
}

/** 页面上有没有这个元素（用来断言「有 / 没有」而不是等超时）。 */
async function has(page, selector) {
  return Boolean(await page.$(selector));
}

/**
 * 在设置页点「风险画像测评」菜单项 —— **按文字找，不按 `.menu-card` 下标**。
 * 理由见文件顶部「本机特有的坑」。
 */
async function tapRiskMenu(page) {
  const cards = await page.$$('.menu-card');
  const found = [];
  for (const card of cards) {
    const textEl = await card.$('.menu-text');
    if (!textEl) continue;
    const text = await textOf(textEl);
    found.push(text);
    if (text === '风险画像测评') {
      await card.tap();
      return;
    }
  }
  throw new Error(
    `设置页菜单里没有「风险画像测评」。这一页上找到的菜单项是：[${found.join(', ')}]`
  );
}

/** 读设置页那个标签的文案（未测评 = 去测评，已测评 = 已测评）。 */
async function readRiskMenuTag(page) {
  const card = await waitForRiskMenuCard(page);
  const tag = await card.$('.menu-tag');
  return textOf(tag);
}

/** 等「风险画像测评」那张菜单卡出现（设置页是异步初始化的，直接取会拿到 null）。 */
async function waitForRiskMenuCard(page) {
  return helpers.waitFor(
    async () => {
      const cards = await page.$$('.menu-card');
      for (const card of cards) {
        const textEl = await card.$('.menu-text');
        if (textEl && (await textOf(textEl)) === '风险画像测评') return card;
      }
      return false;
    },
    { timeout: 8000, label: '设置页出现「风险画像测评」菜单项' }
  );
}

/** 往注册页三个输入框里填字。 */
async function fillRegisterForm(page, username, password, confirm = password) {
  const nameEl = await page.$('#reg-username');
  const passEl = await page.$('#reg-password');
  const confirmEl = await page.$('#reg-confirm');
  if (!nameEl || !passEl || !confirmEl) {
    throw new Error('注册页三个输入框没找齐（#reg-username / #reg-password / #reg-confirm）');
  }
  await nameEl.input(username);
  await passEl.input(password);
  await confirmEl.input(confirm);
}

/** 进注册页，并断言起点是干净的（没有上一步残留的错文案）。 */
async function enterRegisterPage() {
  await helpers.waitForStablePage(program, { stableMs: 1500 });
  await helpers.clearAuthKeys(program);
  // ⚠️ 为什么**不用**「先到登录页，再点那个『还没有账户？注册』链接」这条真实入口 ——
  // 2026-10-11 实测（e2e/z-probe-register.e2e.js，用完已删）：用 `navigateTo` 压上去的
  // 注册页，**短时间内往外跳的通道是死的**，三种跳法全被丢掉：
  //     D1 对照组：reLaunch 进的注册页 + 测试侧 uni.reLaunch(首页)   → 走了 ✅
  //     D2        ：点链接 navigateTo 进的注册页 + 同一句 reLaunch   → 8 秒没动 ❌
  //     D3        ：同上 + uni.navigateBack()                        → 8 秒没动 ❌
  //   连**测试侧**发的跳转都进不去，说明不是应用那几行代码的问题，是页面状态/运行时层面的。
  //   而且应用自己的 `handleRegister` 里那次 reLaunch 也一样被丢（探针 2 两个臂都记到了
  //   「注册成功」toast，页面 12 秒没动）—— 也就是说**走那条入口会让 P5-01 假红**，
  //   红的是导航，不是注册。
  //   → 已按「只登记、不顺手改」的规矩登记为 D-08（00-背景与已知问题.md），
  //     真机上是不是也这样标了「需确认」。
  //   → 用例侧改用 gotoPage 深链进注册页 —— 这是「reLaunch 单独打开」的那一类状态，
  //     导航正常（D1 就是它的对照组）。**代价：那条入口本身没被覆盖**，
  //     这一点写在文件头的「没覆盖」清单里。
  // ⚠️ `force: true` 不能省。默认的 gotoPage 看到「已经在注册页了」就直接返回**旧的那个
  // page 对象、不重新挂载**（helpers/nav.js#L121）。上一条用例（负例①）结束时正停在注册页
  // 上、error-box 里还挂着「用户名已存在」，于是这条读到的就是上一次的残留 ——
  // 第二轮实跑就是红在这一句上（负例②）。重新挂载会换一个 page.id，
  // gotoPage 靠它判定「真的重开了」（helpers/nav.js#L130）。
  const page = await helpers.gotoPage(program, REGISTER_ROUTE, REGISTER_PATH, { force: true });

  // 起点干净：新挂载的注册页 errorMessage 是空的（register/index.vue#L124）。
  // 不先断言这一条的话，负例里读到的 `.error-text` 有可能是上一次留下的 —— 但更糟的是
  // 它会让「文案对不对」变成假绿，因为那个框本来就在。
  expect(await has(page, '.error-box')).toBe(false);
  return page;
}

/** 等注册页出现错误提示，返回它的文案。 */
async function readRegisterError(page) {
  return helpers.waitFor(
    async () => {
      const box = await page.$('.error-box');
      if (!box) return false;
      const text = await textOf(await box.$('.error-text'));
      return text ? text : false;
    },
    { timeout: 8000, label: '注册页出现错误提示（读不到会等到超时，不会假绿）' }
  );
}

describe('P5 注册 + 风险测评', () => {
  /** 走 HTTP 建的账号，后面 P5-02 / P5-03 的测评流程用它；同时兼任 P5-01 负例① 的「已存在用户名」。 */
  let riskAccount;
  /** P5-01 正例走真实 UI 注册出来的账号，afterAll 要注销。 */
  let uiAccount;

  beforeAll(async () => {
    // ── 数据安全闸门（08-实测记录 §4 step 0 的断言版）────────────────
    // 这条路径会**真写 Supabase 用户表**，所以三道闸门一道都不能少。
    helpers.assertLocalApiBase();
    helpers.assertUrlCheckDisabled();
    helpers.assertTouristAppId();

    if (!(await helpers.ping())) {
      throw new Error(
        '后端没起来，P5 无法跑。\n' +
          '→ 启动：poetry run uvicorn server.app:app --port 8000\n' +
          '→ 或设 E2E_API 指向别的地址。'
      );
    }

    riskAccount = await helpers.registerAccount();
    console.log('[P5] 后端建的账号（测评流程用）：', riskAccount.email);

    // 前置自检：这个账号现在确实「没测评过」。不成立的话 P5-02 的起点断言就是假的。
    const before = await helpers.getRiskProfile(riskAccount.token);
    expect(before.status).toBe(200);
    expect(before.hasProfile).toBe(false);
  });

  afterAll(async () => {
    try {
      await helpers.clearAuthKeys(program);
    } catch (e) {
      console.warn('[P5] 清本地登录态失败：', (e && e.message) || e);
    }

    // ⚠️ 两个账号都要注销。P5 每跑一轮真写两个用户，不清理会在 Supabase 里堆起来。
    // 走 UI 建的那个账号，先换一个新 token 再注销（它当前的 token 在 Storage 里，取不回来）。
    for (const [label, acc] of [
      ['UI 建的', uiAccount],
      ['后端建的', riskAccount],
    ]) {
      if (!acc) continue;
      try {
        const fresh = await helpers.loginWithPassword(acc.email, acc.password);
        const result = await helpers.deleteAccount(fresh.token, acc.password);
        console.log(`[P5] 清理${label}账号 ${acc.email}：`, JSON.stringify(result));
      } catch (e) {
        // 两种可能，都得让人看见：① 账号建出来了但没清掉（Supabase 真有残留），
        // ② 这次注册压根没发出去（比如用例在点提交前就红了）—— 那"残留"就是虚惊。
        console.warn(
          `[P5] ⚠️ 清理${label}账号失败 ${acc.email}：${(e && e.message) || e}\n` +
            '     → 若这轮的注册请求根本没发出去，则账号不存在，可忽略；否则请手工去 Supabase 删掉。'
        );
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // P5-01 注册 → 自动登录
  //
  // 这条是 P5 唯一的「写入」正向闭环，也是全仓唯一走**真实注册页 UI** 的用例。
  it('P5-01 真实 UI 注册 → 自动登录 → 落到首页，且拿到的 token 真能用', async () => {
    const username = freshUsername();
    const page = await enterRegisterPage();

    await fillRegisterForm(page, username, UI_PASSWORD);

    // 自检：`el.input()` 真的写进了 v-model。
    // 判据和 P4 用登录按钮的那招一样 —— 填满之后 disabled 类应当消失
    // （register/index.vue#L90 `:class="{ 'submit-btn--disabled': !canSubmit || isLoading }"`）。
    // 这一条不做的话，「填进去了」可能只是 UI 上看不见的假象，后面的注册会以
    // 「用户名格式不正确」之类的文案红掉，查起来方向全错。
    const submit = await page.$('#reg-submit');
    const cls = await submit.attribute('class');
    expect(cls).not.toContain('submit-btn--disabled');

    // ⚠️ 先把这个账号登记到「待清理」上，**再点提交**。
    // 理由：这条用例后面有 6 个断言，任何一个失败都会跳过末尾那行赋值，
    // 于是 afterAll 什么也不清 —— 首跑就是这样在 Supabase 里留了一个用户。
    // 代价：若这次注册压根没发出去，afterAll 会报一句「清理失败」，
    // 那句话也意味着「账号没建成」，两种可能都写在日志里了。
    uiAccount = { email: backendEmail(username), password: UI_PASSWORD };

    await submit.tap();

    // 预期②：500ms(setTimeout) 后自动 reLaunch 首页（register/index.vue#L155）
    const home = await helpers.waitForPage(program, INDEX_PATH, {
      timeout: 8000,
      label: '注册成功 + 自动登录后应落到首页',
    });
    expect(home.path).toBe(INDEX_PATH);

    // 预期③：本地 auth_token 非空
    const token = String((await helpers.getKey(program, helpers.AUTH_STORAGE_KEYS.token)) || '');
    expect(token.length).toBeGreaterThan(0);

    // ⚠️ 上面那条只说明「本地有个字符串」。真正要证的是**自动登录真的成功了** ——
    // 拿这个 token 直连后端打一个受保护接口。401 的话，说明只是本地写了个坏 token，
    // 而用例会绿（首页那一下 reLaunch 是前端自己跳的，后端根本不参与）。
    const chats = await helpers.getChats(token);
    expect(chats.status).toBe(200);

    // 交叉：账号确实建出来了 —— 用同一组用户名/密码能换到新 token。
    const fresh = await helpers.loginWithPassword(backendEmail(username), UI_PASSWORD);
    expect(fresh.userId).toBeTruthy();

    // 记下来给 afterAll 注销用
    uiAccount = { email: backendEmail(username), password: UI_PASSWORD, token, userId: fresh.userId };
    console.log('[P5] UI 注册出来的账号：', uiAccount.email);
  });

  // ─────────────────────────────────────────────────────────────────
  // P5-01 负例① 重复注册同一用户名 → 409 → 「用户名已存在」
  it('P5-01 负例① 重复用户名注册 → 显示「用户名已存在」，且不跳走', async () => {
    // 用 beforeAll 已经建好的账号的用户名再注册一次。
    // （它走的是同一套「用户名 → <用户名>@ai-etf.xyz」映射，所以后端会认成同一个 email。）
    const existingUsername = riskAccount.email.split('@')[0];

    // 交叉前置：先确认这个名字**确实**已经在后端存在 —— 否则本条测的就不是 409 分支，
    // 而是「新账号注册成功」，结果会以完全无关的方式红掉。
    const probe = await helpers.requestJson('POST', `${helpers.API_PREFIX}/register`, {
      body: { email: backendEmail(existingUsername), password: UI_PASSWORD },
    });
    expect(probe.status).toBe(409);

    const page = await enterRegisterPage();
    await fillRegisterForm(page, existingUsername, UI_PASSWORD);
    await (await page.$('#reg-submit')).tap();

    // 预期：错误文案 = 409 的映射结果（useAuth.ts#L22）
    expect(await readRegisterError(page)).toBe('用户名已存在');

    // 预期：**没有跳走**。注册失败还 reLaunch 首页是最容易漏的一种坏法，
    // 只断言文案的话它照样绿。
    await helpers.sleep(1200); // 成功路径是 500ms 后跳，等足它才说明没跳
    const settled = await pageNow();
    expect(settled.path).toBe(REGISTER_PATH);
  });

  // ─────────────────────────────────────────────────────────────────
  // P5-01 负例② 密码 7 位 → 前端就地拦下
  //
  // 这条用例真正想钉住的**不是文案**，是「这次点击**没有产生任何网络请求**」
  // （依据：useAuth.ts#L139 —— `password.length < 8` 就地 return，压根没走到 uni.request）。
  // 只看文案的话，一个「发出去被后端拒、回来显示同一句话」的实现也会绿，而那是另一回事。
  it('P5-01 负例② 密码 7 位 → 前端就地拦下，一个请求也不发', async () => {
    const page = await enterRegisterPage();
    // 两个密码框填成一样的，避免先撞上「两次输入的密码不一致」（register/index.vue#L139）
    await fillRegisterForm(page, freshUsername(), SHORT_PASSWORD);

    // 把 `wx.request` 包一层「只记录、不改行为」的壳。做法与 P2-07 换掉 wx.request 造 SSE
    // 分块是同一路（`helpers/uniMock.js#L214-L237`），实测在这个环境里包得住。
    await helpers.withNativeCall(program, 'request', async () => {
      await (await page.$('#reg-submit')).tap();

      expect(await readRegisterError(page)).toBe('密码至少需要 8 位');

      // ⚠️ 必须在 withNativeCall 的窗口**里面**读 —— 外面读的话记录已经被还原清掉了。
      const calls = await helpers.readNativeCalls(program, 'request');
      expect(calls).toEqual([]);
    });

    // 同样不该跳走
    const settled = await pageNow();
    expect(settled.path).toBe(REGISTER_PATH);
  });

  // ─────────────────────────────────────────────────────────────────
  // P5-02 风险测评（首次）→ 提交 → 画像
  //
  // ⚠️ 期望值全部**从后端现取**，不在用例里写死（全选 A 实测得到 conservative / 保守型 /
  //    total_score 1.0，但那是这一版题库的结果 —— 写死它只会让「后端改了评分」表现为
  //    一条看不出所以然的红，而不是一条说明自己在比什么的红）。这和 P2 的做法一致。
  it('P5-02 首次测评：设置页进测评页 → 逐题作答 → 提交 → 结果态与后端一致', async () => {
    // 步骤 1：造「已登录」这个前提。用写 Storage 的办法 —— 本用例要测的是**测评流程**，
    // 不是登录这个动作（那个 P5-01 已经走真实 UI 覆盖过了）。
    await helpers.seedValidSession(program, {
      token: riskAccount.token,
      user: buildUser(riskAccount),
    });

    // 步骤 2：交叉断言「当前是未测评状态」（03 §六 P5-02 步骤 2 要的就是这条）
    const before = await helpers.getRiskProfile(riskAccount.token);
    expect(before.status).toBe(200);
    expect(before.hasProfile).toBe(false);

    // 题目数也从后端现取，不在用例里写死
    const questionnaire = await helpers.getRiskQuestionnaire(riskAccount.token);
    expect(questionnaire.status).toBe(200);
    expect(questionnaire.questions.length).toBeGreaterThan(0);
    const total = questionnaire.questions.length;

    // 步骤 3：进设置页，确认标签还是「去测评」（没这一步的话，「后面变成已测评」
    // 有可能是因为它本来就是已测评 —— 但那种情况下步骤 2 就会红，所以这里是双保险）
    await helpers.gotoPage(program, SETTINGS_ROUTE, SETTINGS_PATH);
    const settings = await pageNow();
    expect(await readRiskMenuTag(settings)).toBe('去测评');

    // 步骤 4：点菜单进测评页
    await tapRiskMenu(settings);
    const risk = await helpers.waitForPage(program, RISK_PATH, {
      timeout: 8000,
      label: '点「风险画像测评」后应到测评页',
    });

    // 步骤 5：断言是**问卷态**不是结果态
    // （`loadProfileResult()` 会先问后端，has_profile=false 时才 `loadQuestionnaire()`，
    //   risk-assessment/index.vue#L314-L334）
    await helpers.waitFor(
      async () => await has(risk, '.question-card'),
      { timeout: 8000, label: '测评页进入问卷态（出现 .question-card）' }
    );
    expect(await has(risk, '.result-section')).toBe(false);

    // 步骤 6：逐题作答。每题都选**第一个**选项（A），保证可复现。
    for (let n = 1; n <= total; n += 1) {
      // 预期①：进度计数随题号递增（`.progress-count`，risk-assessment/index.vue#L43）
      const countText = await helpers.waitFor(
        async () => {
          const el = await risk.$('.progress-count');
          if (!el) return false;
          const t = await textOf(el);
          return t === `${n} / ${total}` ? t : false;
        },
        { timeout: 6000, label: `第 ${n} 题的进度计数显示为「${n} / ${total}」` }
      );
      expect(countText).toBe(`${n} / ${total}`);

      // 选项：`#risk-option` 是 v-for 出来的**重复 id**（3 个），`$$` 按 DOM 顺序返回，
      // 取 [0] 就是第一个选项。重复 id 这条在 P3 已经验证过（`#wl-follow-item`）。
      const options = await risk.$$('#risk-option');
      expect(options.length).toBeGreaterThan(0);
      await options[0].tap();

      const next = await risk.$('#risk-next');
      // 最后一题的按钮文案会变（risk-assessment/index.vue#L91）
      expect(await textOf(next)).toBe(n === total ? '提交测评' : '下一题');
      // 选中之后按钮不再是 disabled（`:class="{ 'btn--disabled': !selectedValue }"`，L87）。
      // 这条顺带证明 `tap()` 真的触发了 `selectOption`，不是点了个寂寞。
      expect(await next.attribute('class')).not.toContain('btn--disabled');

      await next.tap();
    }

    // 步骤 7：提交是异步的（`handleSubmit`，L394-L435），等结果态出现。
    // 最后一题之后页面会先显示「正在生成您的投资画像...」遮罩，再切结果态。
    await helpers.waitFor(
      async () => await has(risk, '.result-section'),
      { timeout: 15000, label: '提交后切到结果态（出现 .result-section）' }
    );
    expect(await has(risk, '.question-card')).toBe(false);

    // 步骤 8：结果态四个字段都非空（03 §六 P5-02 预期②）
    const badge = await textOf(await risk.$('.result-level-text'));
    const scoreText = await textOf(await risk.$('.result-score'));
    const summary = await textOf(await risk.$('.summary-text'));
    expect(badge).toBeTruthy();
    expect(scoreText).toBeTruthy();
    expect(summary).toBeTruthy();

    // 步骤 9：交叉断言 —— 拿后端真值跟 UI 比（03 §六 P5-02 预期③）
    const after = await helpers.getRiskProfile(riskAccount.token);
    expect(after.status).toBe(200);
    expect(after.hasProfile).toBe(true);
    expect(after.profile).toBeTruthy();

    // 徽章文案 == 后端的 risk_label（页面渲染的就是这个字段，L117）
    expect(badge).toBe(after.profile.risk_label);

    // 总分：UI 走的是 `toFixed(1)`（L119），所以按数值比，不按字符串比
    expect(Number(scoreText)).toBeCloseTo(Number(after.profile.total_score), 1);

    // 维度条条数 == 后端 dimension_scores 的键数（不写死 5，题库换维度数也不该红）
    const dimensionCount = Object.keys(after.profile.dimension_scores || {}).length;
    expect((await risk.$$('.dimension-item')).length).toBe(dimensionCount);
    expect(dimensionCount).toBeGreaterThan(0);
  });

  // ─────────────────────────────────────────────────────────────────
  // P5-03 已测评用户重入 → 直接看画像
  //
  // ⚠️ 这条用例的关键一步是**先删掉本地缓存**。
  //    `loadProfileResult()` 的写法是「先问后端，后端失败或说没有，才回退到本地缓存」
  //    （risk-assessment/index.vue#L314-L350）。如果本地 `risk_profile:<userId>` 还在，
  //    「重进直接看到结果」这件事**分不清是后端给的还是缓存给的** —— 而若是缓存给的，
  //    后端丢了画像、或者缓存串到了别人身上，这条用例一样绿。
  //    删掉之后还能看到结果，才真正证明「画像来自后端，不依赖本地缓存」（这正是 03 §六
  //    P5-03 那条依据想说的话）。
  it('P5-03 已测评用户重入：清掉本地缓存后仍直接进结果态 + 设置页显示「已测评」', async () => {
    // 前置：上一条已经建成画像
    const profile = await helpers.getRiskProfile(riskAccount.token);
    expect(profile.hasProfile).toBe(true);

    // 步骤 1：清本地画像缓存，并断言它**本来是有东西的**
    // （否则「删了也没影响」可能只是因为压根没有这个键，什么也没证明）
    const cacheKey = `risk_profile:${riskAccount.userId}`; // 复刻 utils/auth.ts#L177-L179
    const cachedBefore = String((await helpers.getKey(program, cacheKey)) || '');
    expect(cachedBefore.length).toBeGreaterThan(0);
    await helpers.removeKey(program, cacheKey);
    expect(String((await helpers.getKey(program, cacheKey)) || '')).toBe('');

    // 步骤 2：退出测评页 → 回设置页
    //
    // ⚠️ 为什么不是「点左上角返回箭头，然后等它跳回去」——同一个原因（D-08）：
    //   测评页是从设置页 `navigateTo` 压上来的，本环境下这种页面短时间内跳不走。
    //   首跑就红在这里（`waitForPage(设置页)` 超时，当时实际停在测评页）。
    //   所以这里用 `gotoPage` 收敛：已经在设置页就直接返回，没在就重发并重试。
    //   **代价：「返回箭头这个动作本身生效」没被覆盖**（真机大概率是好的，标 需确认）。
    await helpers.gotoPage(program, SETTINGS_ROUTE, SETTINGS_PATH);
    const settings = await program.currentPage();
    expect(settings.path).toBe(SETTINGS_PATH);

    // 预期②：设置页标签变成「已测评」（settings/index.vue#L104-L105）
    expect(await readRiskMenuTag(settings)).toBe('已测评');

    // 步骤 3：重新进入测评页
    await tapRiskMenu(settings);
    const risk2 = await helpers.waitForPage(program, RISK_PATH, {
      timeout: 8000,
      label: '再次进入测评页',
    });

    // 预期①：**直接进结果态**，不在问卷态。
    // 这里给了 10s：要先等一次 HTTP 往返（getProfile），本地缓存已经没有兜底了。
    await helpers.waitFor(
      async () => await has(risk2, '.result-section'),
      { timeout: 10000, label: '重进后直接进结果态（本地缓存已清，只能来自后端）' }
    );
    expect(await has(risk2, '.question-card')).toBe(false);
    expect(await textOf(await risk2.$('.result-level-text'))).toBe(profile.profile.risk_label);
  });

  // ─────────────────────────────────────────────────────────────────
  // P5-03 ③ 点「重新测评」→ 回到问卷态
  //
  // ⚠️ 顺序说明：这一步会把 `hasRiskAssessment` 置回 false（risk-assessment/index.vue#L492），
  //    于是设置页的标签会变回「去测评」。所以「已测评」那条断言必须在上一条做，不能放在这里。
  it('P5-03 ③ 点「重新测评」→ 回到问卷态第一题', async () => {
    const risk = await pageNow();
    expect(risk.path).toBe(RISK_PATH);

    const wrap = await risk.$('.retake-btn-wrap');
    if (!wrap) throw new Error('结果态上找不到「重新测评」按钮容器（.retake-btn-wrap）');
    const retake = await wrap.$('.btn--ghost');
    if (!retake) throw new Error('.retake-btn-wrap 里找不到 .btn--ghost');
    expect(await textOf(retake)).toBe('重新测评');
    await retake.tap();

    // `handleRetake()` 只清本地状态、重新拉问卷（L475-L495），要等一次 HTTP 往返
    await helpers.waitFor(
      async () => await has(risk, '.question-card'),
      { timeout: 10000, label: '点「重新测评」后回到问卷态' }
    );
    expect(await has(risk, '.result-section')).toBe(false);

    // 回到第一题、且没有任何选项被预选中
    const count = await textOf(await risk.$('.progress-count'));
    expect(count).toMatch(/^1 \/ \d+$/);
    expect(await (await risk.$('#risk-next')).attribute('class')).toContain('btn--disabled');
  });

  // ─────────────────────────────────────────────────────────────────
  // P5-04 登录页「还没有账户？注册」这条真实入口
  //       （补文件头「❌ 没覆盖」清单的第 1 条里的前半句）
  //
  // ⚠️ **这一条必须留在文件最后。**
  //   它是全文件唯一一个**用「点一下」的方式**进注册页的用例（其余全走 `gotoPage` 深链）。
  //   点完这个页面就进了 D-08 说的那种状态（`navigateTo` 压上去的页面，短时间内跳不走），
  //   排在它后面的用例会被自己的 `gotoPage` 噎住。放在最后，后面只剩 `afterAll`
  //   （只清存储、不导航），就不会连累谁。**以后改这个文件时不要把它往前挪。**
  //
  // 为什么这条能补、而「测评页返回箭头」不能补：D-08 堵的是「从这种页面**往外**跳」，
  // 而这条只验「**进得去**」—— 点完、看一眼注册页自己的内容挂出来了就收工，
  // 不提交、不往外跳，正好绕开这个坑。
  it('P5-04 登录页点「还没有账户？注册」→ 真的进得去注册页', async () => {
    // 对照组：先确认起点**真的是登录页**。
    // 不先断这一条的话，下面「点完停在注册页」可能本来就成立（比如上一轮就停在那），
    // 这条用例就白跑了 —— 这正是「断言写错了」那一类假绿。
    const login = await helpers.gotoPage(program, LOGIN_ROUTE, LOGIN_PATH, { force: true });
    expect((await pageNow()).path).toBe(LOGIN_PATH);

    // 按**文案**找，不按类名下标 —— 理由同设置页那个 `.menu-card` 的坑（见文件头）。
    // 找不到时把这一页上实际的文案打出来，别只留一句 no such element 让人猜。
    const link = await helpers.waitFor(
      async () => {
        const els = await login.$$('.footer-link--highlight');
        const seen = [];
        for (const el of els) {
          const t = await textOf(el);
          seen.push(t);
          if (t === '还没有账户？注册') return el;
        }
        if (els.length) {
          console.log('[P5-04] 这页上的 .footer-link--highlight 文案：', JSON.stringify(seen));
        }
        return false;
      },
      { timeout: 8000, label: '登录页出现「还没有账户？注册」链接（login/index.vue#L86）' }
    );
    await link.tap();

    // 断言①：页面真的换了。
    // 超时给得比别处宽（15s）：`handleGoRegister` 走的是 `uni.navigateTo`（login/index.vue#L156），
    // 在本机这是最慢的一种跳转。
    const register = await helpers.waitForPage(program, REGISTER_PATH, {
      timeout: 15000,
      label: '点「还没有账户？注册」后应进到注册页',
    });
    expect(register.path).toBe(REGISTER_PATH);

    // 断言②：不止「地址变了」—— 注册页**自己的内容**真的挂出来了。
    // 只断 path 的话，一个「跳过去了但白屏」的实现也会绿，那就成了文件头说的
    // 「流程压根没执行到那一步」。判据用注册页独有的两个输入框
    // （register/index.vue 的 #reg-username / #reg-confirm）。
    const usernameInput = await helpers.waitFor(
      async () => (await register.$('#reg-username')) || false,
      { timeout: 8000, label: '注册页的输入框真的渲染出来了' }
    );
    expect(usernameInput).toBeTruthy();
    expect(await has(register, '#reg-confirm')).toBe(true);
  });
});
