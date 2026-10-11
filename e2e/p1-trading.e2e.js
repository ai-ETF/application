/**
 * P1 交易核心 —— E2E。
 *
 * 对应用例：ai-etf/docs/e2e/03-E2E用例清单.md §二 P1-01 ~ P1-06。
 *
 * ⚠️ 跑之前先看这段，否则会拿到假红/假绿。
 *
 * 【这条路径为什么没有时钟依赖】
 *   docs/e2e/03 §二.1 已论证：申购单一律 pending、当天永远确认不了
 *   （`apply_purchase` 落库的是**推进过**的 `actual_confirm`，不是 `confirm_date`），
 *   所以「确认后建仓」交给后端集成测试（`test_scheduler_jobs.py`，用 time_machine 跨日）。
 *   本文件只覆盖「下单那一刻的用户可见结果」——**任何时间都能跑**。
 *
 * 【数据前提 —— 缺了必然红】
 *   后端必须带行情夹具启动，否则自选页搜索 110020 拿不到结果、P1-03 走不到详情页：
 *     E2E_MARKET_FIXTURE="$PWD/docs/e2e/fixtures/market_snapshot.json" poetry run uvicorn server.app:app --port 8000
 *   ⚠️ 这里有个容易误判的点：后端 `/api/market/search` **只搜场内行情缓存**，
 *      它搜不到 110020。能搜到是因为**前端 store 有兜底**
 *      （src/stores/watchlist.ts:166-184：结果为 0 且关键词是六位数字时再调
 *      `getEtfDetail(kw)`）。所以「后端 search 搜不到 110020」不等于本用例走不通。
 *
 * 【必须从 Windows 侧跑，不能从 WSL 跑】—— 同 p3，不重复。
 *
 * 【2026-10-08 写这条路径时确认的四件事】
 *   1. **申购/赎回页的错误文案在页面里，不在 toast 里**。
 *      `purchase/index.vue#L12` 与 `redeem/index.vue#L14` 都是
 *      `<text v-if="message" class="message">`。后端 400 的 `detail` 经
 *      request.ts#L69-L77 `reject(new Error(detail))` → 页面 catch → 写入 message，
 *      **原文照搬**。所以负例可以断言精确文案，不需要 toast 探针。
 *      （这推翻了 docs/e2e/03 §1.2 里「toast 文案抓不到」对这两页的适用性。）
 *   2. **赎回页只有一个入口**：自选页持仓项点击（watchlist/index.vue#L585-L593）。
 *      docs/e2e/03 P1-04 步骤里写的「从持仓页/**详情页**进入赎回页」——**详情页没有入口**。
 *   3. **P1-04 的预期文案在任何一层都走不到**（详见下方 describe 的说明，已实测）。
 *   4. **P1-06 的预期文案 UI 走不到，但接口能走到** → 按 §1.5 的既有先例降为 L3。
 *
 * 【覆盖边界：两处「知道但没覆盖」，别当成漏测】
 *   1. **点申购结果里的「查看持仓」回自选页** —— 未覆盖。
 *      那一跳是 uni.reLaunch，本机实测会被**丢掉并堵住通道约 20s**
 *      （e2e/helpers/nav.js 顶部记的就是这个；连续两轮跑批都卡在 20s 超时，
 *      而另一轮同一处 1.7s 就过去了 → 是通道**间歇性**失效，不是按钮坏）。
 *      处置与 p3 对左滑一致：换掉 + 显式登记。用例改为断言按钮存在 + gotoPage 回自选页，
 *      「持仓 Tab 数值正确」这个真正的考点不受影响。
 *   2. **点详情页「模拟申购」进申购页** —— 有覆盖，但带兜底。
 *      详情页 onLoad 要 await 两个接口，`waitForDetailReady` 通过 ≠ 初始化完了；
 *      初始化期间发出的导航同样会被丢弃。所以这里「先静置 3s 再点」，
 *      失败退避 8s 重点一次，两次都不过才退回 reLaunch 直达（并打 warn）。
 *
 * 【⚠️ 两处「文档与实现不一致」—— 已登记，未改代码】
 *   · P1-04：docs/e2e/03 期望「基金 110020 存在待确认的申购订单，份额确认前无法赎回」。
 *     实测（2026-10-08，本机，curl）：pending 期间赎回 110020 返回的是
 *     **「未持有基金 110020，无法赎回」** —— 因为 `_get_position` 的校验（:784）
 *     **在** pending 申购校验（:788）**之前**，而新账号从未持有 → 位置为 None。
 *     ⚠️ 「走不到」= **本用例路径**走不到（E2E 会话内造不出已确认持仓）；
 *        :788-801 本身**可达**（已确认持有 + 另有 pending 时触发），详见下方 P1-04 段。
 *   · P1-04 步骤里的「详情页进入赎回页」不存在（见上 2）。
 *
 * 依据行号（逐条核对过）：
 *   申购错误文案渲染：      src/pages/purchase/index.vue#L12
 *   赎回错误文案渲染：      src/pages/redeem/index.vue#L14
 *   赎回页 !position 短路： src/pages/redeem/index.vue#L5, #L73
 *   赎回页唯一入口：        src/pages/watchlist/index.vue#L585-L593
 *   详情页申购入口：        src/pages/etf-detail/index.vue#L51
 *   详情页无赎回入口：      src/pages/etf-detail/index.vue（无 pages/redeem 引用）
 *   登录成功跳首页：        src/pages/login/index.vue#L132
 *   账号→后端邮箱：         src/utils/auth.ts#L79-L82
 *   400 → detail 原文：     src/utils/request.ts#L19-L28, #L69-L77
 *   持仓 Tab 数值来源：     src/pages/watchlist/index.vue#L211, #L216-L218, #L230-L239
 *   空持仓文案：            src/pages/watchlist/index.vue#L271-L277
 *   流水空态文案：          src/pages/trades/index.vue#L8
 *   ?tab=position 生效：    src/pages/watchlist/index.vue#L389-L390
 *   onShow 拉持仓：         src/pages/watchlist/index.vue#L397-L405
 *   交易白名单：            src/config/portfolio.ts
 *   ============ 后端 ============
 *   初始资金：              ai-etf/server/services/portfolio_service.py#L32（INITIAL_CASH）
 *   最低申购额：            :593-L600
 *   申购成功文案：          :684-L685
 *   未持有基金：            :786
 *   pending 申购拦截：      :788-L801（**在持仓校验之后**，见上「不一致」）
 */

const helpers = require('./helpers');

const {
  requestJson,
  waitFor,
  sleep,
  getKey,
  clearAuthKeys,
  seedValidSession,
  gotoPage,
  waitForPage,
} = helpers;

// 页面 path（currentPage().path 形式，**不带**前导斜杠）
const LOGIN_PATH = 'pages/login/index';
const HOME_PATH = 'pages/index/index';
const WATCHLIST_PATH = 'pages/watchlist/index';
const DETAIL_PATH = 'pages/etf-detail/index';
const PURCHASE_PATH = 'pages/purchase/index';
const TRADES_PATH = 'pages/trades/index';

const FUND_CODE = '110020'; // 场外白名单，可申购（docs/e2e/03 §1.5 指定）
const UNHELD_FUND = '001595'; // 同为白名单，但本账号不持有（§1.5）

jest.setTimeout(120000);

// ───────────────────────────── 基础件 ─────────────────────────────

let account = null;

/**
 * 造本地会话所需的 user 对象。
 * ⚠️ 见 p3 文件头说明 2 —— `user` 少了不是报错，是「看着像跳转 bug」的假故障。
 */
function buildUser(acct) {
  return { id: acct.userId, username: 'e2e', displayName: 'e2e' };
}

/** 种一个「本地完全有效」的会话。需要登录的用例都先调它。 */
function seedSession() {
  return seedValidSession(program, { token: account.token, user: buildUser(account) });
}

/** 直接问后端要账户真值（交叉断言用）。 */
async function accountOf(token) {
  const res = await requestJson('GET', '/api/portfolio/account', { token });
  if (res.status !== 200) {
    throw new Error(`GET /api/portfolio/account 返回 ${res.status}：${JSON.stringify(res.data)}`);
  }
  return res.data;
}

/** 交易流水（交叉断言用）。 */
async function tradeFlowOf(token) {
  const res = await requestJson('GET', '/api/portfolio/trade-flow?page=1&page_size=20', { token });
  if (res.status !== 200) {
    throw new Error(`GET /api/portfolio/trade-flow 返回 ${res.status}：${JSON.stringify(res.data)}`);
  }
  return res.data;
}

/** 元素文本；拿不到返回 null。 */
async function textOf(page, selector) {
  const el = await page.$(selector);
  if (!el) return null;
  try {
    return await el.text();
  } catch {
    return null;
  }
}

/** 元素 class 字符串；元素不存在返回 null。 */
async function classOf(page, selector) {
  const el = await page.$(selector);
  if (!el) return null;
  try {
    return (await el.attribute('class')) || '';
  } catch {
    return null;
  }
}

// ───────────────────── 打开自选页的持仓 Tab ─────────────────────
//
// 两个必须点，缺一个都会拿到空数据：
//   · 一律 force —— 自选页数据在 onShow 里拉（watchlist/index.vue#L397-L405），
//     人已经在页面上就不重新挂载，列表永远是旧的（P3-04 踩过）。
//   · 必须真的 tap `#wl-tab-position` —— 切 tab 才会调 fetchPortfolio（#L412-L420）。
//
// ⚠️ 与文档的一处出入：docs/e2e/03 P1-02 步骤 1 写的是「tap TabBar「自选」」，
//    但 TabBar 组件（src/components/common/TabBar.vue）**没有 id**，
//    无法稳定定位；改成与 p3 一致的 reLaunch 到自选页。跳转这一步不是本用例的考点。

const ASSET_LABELS = ['可用现金', '冻结资金', '持仓市值'];

/**
 * 读持仓 Tab 的三格数值，返回 { 可用现金: '100000.00', ... }。
 *
 * DOM 是 `<view class="asset-grid"><view><text>值</text><text>标签</text></view>×3</view>`
 * （watchlist/index.vue#L215-L219），格子上没有 id，只能按标签反查。
 * 两条路都留着：`$$` 拿不到就直接解析整块文本 —— 免得选择器语法一变就整条红。
 */
async function readAssetGrid(page) {
  const out = {};
  const consume = (t) => {
    for (const label of ASSET_LABELS) {
      if (t && t.includes(label)) out[label] = t.replace(label, '').trim();
    }
  };

  let cells = [];
  try {
    // `.asset-grid view`（后代选择器 + 标签）语法万一支持不了，走下面的整块文本兜底
    cells = (await page.$$('.asset-grid view')) || [];
  } catch {
    cells = [];
  }
  if (cells.length) {
    for (const el of cells) {
      try {
        consume((await el.text()) || '');
      } catch {
        /* 重渲染窗口里元素消失，跳过 */
      }
    }
  }

  if (Object.keys(out).length < ASSET_LABELS.length) {
    const whole = (await textOf(page, '.asset-grid')) || '';
    const re = /([\d.]+)(可用现金|冻结资金|持仓市值)/g;
    let m;
    while ((m = re.exec(whole)) !== null) out[m[2]] = m[1];
  }
  return out;
}

/** 读总盈亏 / 总收益率两个值（watchlist/index.vue#L228-L242）。 */
async function readEarnings(page) {
  const els = await page.$$('.earnings-value');
  const vals = [];
  for (const el of els) {
    try {
      vals.push(((await el.text()) || '').trim());
    } catch {
      /* 跳过 */
    }
  }
  return vals;
}

/** 等持仓 Tab 的数据落地（金额不再是 0 占位、也不是 loading 态）。 */
async function waitForPortfolioLoaded() {
  return waitFor(
    async () => {
      const p = await program.currentPage();
      if (p.path !== WATCHLIST_PATH) return false;
      if (await p.$('.portfolio-state')) return false; // 正在加载 / 出错
      return (await p.$('.amount-value')) ? p : false;
    },
    { timeout: 15000, label: '持仓 Tab 数据就位' }
  );
}

async function openPositionTab() {
  const page = await gotoPage(program, '/pages/watchlist/index', WATCHLIST_PATH, { force: true });
  const tab = await waitFor(
    async () => (await page.$('#wl-tab-position')) || null,
    { timeout: 10000, label: '持仓 Tab 按钮就位' }
  );
  await tab.tap();
  return waitForPortfolioLoaded();
}

// ───────────────────── 自选页搜索 → 详情 → 申购页 ─────────────────────
//
// 复刻 docs/e2e/03 P1-03 的步骤 1-4。**不能**用 gotoPage 带 query 直接跳申购页：
// gotoPage 拿 `currentPage().path` 判落地，而带 query 的路由 path 里**是否含 ?** 没实测过，
// 赌错就是整条用例超时。走 UI 反而稳，而且是文档规定的路径。

/**
 * 在自选页搜索框输入关键词，等防抖 400ms + 请求往返。
 *
 * ⚠️ 返回的是**输入框元素**，因为 `input()` 是 Element 的方法，不是 Page 的
 * （Page 只有 `$` / `$$` 这类查询方法）。写错过一次：返回 page 会在调用点报
 * 「page.input is not a function」——那个报错离原因不算远，但仍值得记一笔。
 */
async function searchInWatchlist(keyword) {
  const input = await waitFor(
    async () => {
      const p = await program.currentPage();
      if (p.path !== WATCHLIST_PATH) return null;
      return (await p.$('#wl-search-input')) || null;
    },
    { timeout: 10000, label: '自选页搜索框就位' }
  );
  await input.input(keyword);
  await sleep(400 + 400); // 防抖 400ms（watchlist/index.vue#L382）+ 往返余量
}

/** 等搜索结果出现，返回命中的那一条（**不点**）。结果项无 id，class 是 `.etf-item`。 */
function findSearchResult(code) {
  return waitFor(
    async () => {
      const page = await program.currentPage();
      const items = await page.$$('.etf-item');
      const texts = [];
      for (const el of items) {
        try {
          texts.push((await el.text()) || '');
        } catch {
          texts.push('');
        }
      }
      const idx = texts.findIndex((t) => t.includes(code));
      return idx < 0 ? null : { el: items[idx], text: texts[idx] };
    },
    { timeout: 12000, label: `搜索结果出现 ${code}` }
  );
}

/** 等详情页把 loading 占位换成真内容。 */
async function waitForDetailReady(code) {
  await waitFor(
    async () => {
      const p = await program.currentPage();
      if (p.path !== DETAIL_PATH) return false;
      if (await p.$('.state')) return false;
      return !!((await p.$('.quote-card')) || (await p.$('#detail-watchlist-btn')));
    },
    { timeout: 15000, label: `详情页 ${code} 内容就位` }
  );
}

/**
 * 等申购页**账户也读完**。
 *
 * ⚠️ 只等 `#buy-amount` 出现是不够的，这是个真实的竞态（P1-05 首跑就踩了）：
 *   · `loading` 由 `loadReference()`（onLoad，purchase/index.vue#L58-L77）在 finally 里置 false
 *     → `#buy-amount` 随之渲染；
 *   · 而 `cash` 要等 **另一个** 异步 `loadAccount()`（onShow，#L79-L95）返回。
 * 两者谁先完成不确定。抢在 `cash` 落地前提交，会命中 #L104 的兜底
 * 「可用模拟现金暂不可用」——**那不是被测的负例，是测试自己制造的红**。
 *
 * 观测「cash 已落地」的办法：可用现金那一行在 `cash == null` 时显示 `--`
 * （#L9），落地后是 `{amount} 元`。所以等「这一行不再是 --」即可。
 *
 * ⚠️ 判断前**必须把空白去掉**。首版拿整块 `.card` 的 innerText 做
 * `includes('可用模拟现金--')`，结果永远不成立 —— `el.text()` 底层是 innerText，
 * 两个 `<text>` 之间会带换行/空格（"可用模拟现金\n--"），所以包含判断当场失效、
 * 守卫形同虚设，cash 还没到就放行了（P1-05 因此又红了一次）。
 * 改成「取那一行元素 + 去掉所有空白」再比。
 */
async function waitForPurchaseReady() {
  return waitFor(
    async () => {
      const p = await program.currentPage();
      if (p.path !== PURCHASE_PATH) return false;
      if (!(await p.$('#buy-amount'))) return false;

      const rows = await p.$$('.row');
      for (const el of rows) {
        let t = '';
        try {
          t = ((await el.text()) || '').replace(/\s+/g, '');
        } catch {
          continue; // 重渲染窗口里元素消失，跳过
        }
        if (t.startsWith('可用模拟现金')) {
          return t.includes('--') ? false : p;
        }
      }
      return false;
    },
    { timeout: 15000, label: '申购页就位（含账户现金）' }
  );
}

/**
 * 完整走一遍「自选页搜索 → 详情页 → tap 模拟申购 → 落到申购页」（docs/e2e/03 P1-03 步骤 1-4）。
 *
 * ⚠️ 步骤 4「点按钮进申购页」为什么要绕这么一圈：
 *   这是一条**实测过的环境行为**（记在 e2e/helpers/nav.js 顶部）——
 *   **页面还在初始化时发出的导航会被丢掉，而且会把这条通道堵住约 20s**。
 *   详情页 `onLoad` 里要 await 两个接口（etf-detail/index.vue#L150-L192），
 *   `waitForDetailReady` 通过 ≠ 它初始化完了。第二轮跑批就卡死在
 *   「进入申购页」超时 15s —— 之后所有依赖它的用例连锁红。
 *   ⇒ 按 nav.js 已经定下的做法：**发之前先静置**，失败则退避后重试。
 *     这里点两次仍不过，就退回 reLaunch 直达（点按钮那一步记未覆盖，
 *     但「按钮存在」本身在下面已断言，且 P3-02③ 独立覆盖它）。
 */
async function openPurchasePage(code) {
  await gotoPage(program, '/pages/watchlist/index', WATCHLIST_PATH, { force: true });
  await searchInWatchlist(code);
  const hit = await findSearchResult(code);
  await hit.el.tap();
  await waitForDetailReady(code);

  // 步骤 3：白名单基金必须渲染申购按钮（tradeable=true）
  const detailPage = await program.currentPage();
  if (!(await detailPage.$('#detail-purchase-btn'))) {
    throw new Error(
      `详情页 ${code} 没有 #detail-purchase-btn —— 说明它不在交易白名单里（tradeable=false）。`
    );
  }

  let entered = false;
  for (let attempt = 1; attempt <= 2 && !entered; attempt += 1) {
    await sleep(attempt === 1 ? 3000 : 8000);
    try {
      const p = await program.currentPage();
      if (p.path === PURCHASE_PATH) {
        entered = true;
        break;
      }
      const btn = await p.$('#detail-purchase-btn');
      if (!btn) break; // 已经不在详情页了，再点也没意义
      await btn.tap();
      await waitForPage(program, PURCHASE_PATH, { timeout: 12000, label: '进入申购页' });
      entered = true;
    } catch {
      /* 落到下面的兜底 */
    }
  }

  if (!entered) {
    console.warn(
      '[P1] 点 #detail-purchase-btn 没能进申购页 —— 已知的「页面初始化期间的导航被丢弃」现象' +
        '（e2e/helpers/nav.js 顶部）。改走 reLaunch 直达申购页：' +
        '本次「点按钮」这一步未覆盖（按钮存在性见本函数前段断言与 P3-02③）。'
    );
    await gotoPage(program, `/pages/purchase/index?code=${encodeURIComponent(code)}`, PURCHASE_PATH, {
      force: true,
    });
  }

  return waitForPurchaseReady();
}

/**
 * 在申购页填金额并提交，等 `.message` 出现后返回它的文案。
 *
 * ⚠️ 成功与失败都写进同一个 `.message`（purchase/index.vue#L12-L13），
 * 所以这里只负责「等有文案」，断言由调用方做。
 */
async function submitPurchase(page, amount) {
  const input = await page.$('#buy-amount');
  await input.input(String(amount));
  await sleep(300);
  const submit = await page.$('#buy-submit');
  await submit.tap();

  const text = await waitFor(
    async () => {
      const t = await textOf(page, '.message');
      return t && t.trim() ? t.trim() : null;
    },
    { timeout: 15000, label: '申购结果文案出现' }
  );
  return text;
}

// ───────────────────────────── 前置检查 ─────────────────────────────

beforeAll(async () => {
  // 数据安全闸门：产物必须打本地后端，否则会真写生产库
  helpers.assertLocalApiBase();
  helpers.assertUrlCheckDisabled();
  helpers.assertTouristAppId();

  if (!(await helpers.ping())) {
    throw new Error(
      '后端连不上 —— 先确认已启动：\n' +
        '  E2E_MARKET_FIXTURE="$PWD/docs/e2e/fixtures/market_snapshot.json" poetry run uvicorn server.app:app --port 8000'
    );
  }

  account = await helpers.registerAccount();
});

afterAll(async () => {
  if (account && account.token) {
    try {
      await helpers.deleteAccount(account.token, account.password);
    } catch (e) {
      console.warn(`[P1] 清理测试账号失败（不影响结论）：${e.message}`);
    }
  }
});

// ───────────────────────────── 用例 ─────────────────────────────

describe('P1 交易核心', () => {
  // ───────────────────── P1-01 新用户账户基线 ─────────────────────
  //
  // ⭐ 本文件里**唯一**覆盖真实登录动作的用例：其余都靠写 Storage 造登录态
  //    （见 helpers/storage.js 顶部说明）。「登录流程」只在这里被覆盖。
  describe('P1-01 新用户账户基线（登录 + 空仓）', () => {
    it('① 登录页提交后 3s 内跳到首页，本地存储写入有效会话', async () => {
      await clearAuthKeys(program);
      await gotoPage(program, '/pages/login/index', LOGIN_PATH, { force: true });

      const loginPage = await program.currentPage();
      const accountInput = await loginPage.$('#login-account');
      const passwordInput = await loginPage.$('#login-password');

      // 输入「用户名」而不是邮箱 —— 走 accountToBackendEmail 的拼域名分支
      // （src/utils/auth.ts#L79-L82：不含 @ 时补 @ai-etf.xyz）
      const username = account.email.split('@')[0];
      await accountInput.input(username);
      await passwordInput.input(account.password);
      await sleep(300);

      const t0 = Date.now();
      await (await loginPage.$('#login-submit')).tap();

      // 3s 是 docs/e2e/03 P1-01 的口径（依据 src/pages/login/index.vue#L132 的 reLaunch）
      await waitForPage(program, HOME_PATH, { timeout: 3000, label: '登录后跳首页（3s 内）' });
      const elapsed = Date.now() - t0;

      // ② 本地存储：token 非空、过期时间在未来
      const token = await getKey(program, 'auth_token');
      const expireAt = Number(await getKey(program, 'auth_expire_time'));
      expect(typeof token === 'string' && token.length > 0).toBe(true);
      expect(expireAt).toBeGreaterThan(Date.now());

      console.log(`[P1-01] 登录 → 首页 ${elapsed}ms；token 长度 ${String(token).length}`);
    });

    it('② 交叉断言：新账号账户基线为 100000 / 0 / 0 / 0', async () => {
      // 用夹具自己持有的 token（独立会话）问后端要真值
      const summary = await accountOf(account.token);
      expect(summary.cash).toBeCloseTo(100000, 2);
      expect(summary.frozen_cash).toBeCloseTo(0, 2);
      expect(summary.position_value).toBeCloseTo(0, 2);
      expect(summary.position_count).toBe(0);
      expect(summary.total_pnl).toBeCloseTo(0, 2);

      // 持仓与流水也都必须是空的 —— 「新用户空仓」的完整口径
      const positions = await requestJson('GET', '/api/portfolio/positions?include_quote=true', {
        token: account.token,
      });
      expect(positions.status).toBe(200);
      expect(positions.data.total).toBe(0);
      expect(positions.data.items).toEqual([]);

      expect((await tradeFlowOf(account.token)).total).toBe(0);
    });

    // docs/e2e/03 P1-01 预期③「首页会话列表为空」不在此断言：
    // 那是 AI 对话（P2）的断言，与本路径（交易核心）无关，且 P2 另有专项。
    it.skip('③ 首页会话列表为空（新用户）—— 属 P2 范围，见 docs/e2e/03 §三', () => {});
  });

  // ───────────────────── P1-02 持仓 Tab 基线 ─────────────────────
  describe('P1-02 持仓 Tab 展示基线', () => {
    let page;

    beforeAll(async () => {
      await seedSession();
      page = await openPositionTab();
    });

    it('① 总资产文本 == ¥ 100,000.00', async () => {
      // watchlist/index.vue#L211 `toLocaleString('zh-CN', {min/maxFractionDigits:2})`
      const amount = await textOf(page, '.amount-value');
      expect(amount).not.toBeNull();
      expect(amount.trim()).toBe('¥ 100,000.00');
    });

    it('② 可用现金 / 冻结资金 / 持仓市值 == 100000.00 / 0.00 / 0.00', async () => {
      const grid = await readAssetGrid(page);
      expect(grid['可用现金']).toBe('100000.00');
      expect(grid['冻结资金']).toBe('0.00');
      expect(grid['持仓市值']).toBe('0.00');
    });

    it('③ 持仓明细为空', async () => {
      // 空态只在 positionList.length === 0 时渲染（watchlist/index.vue#L271-L277）
      const empty = await textOf(page, '.empty-text');
      expect(empty).not.toBeNull();
      expect(empty.trim()).toBe('暂无持仓');
    });

    it('④ 总盈亏 +0.00、总收益率 +0.00%', async () => {
      // 正数才带 + 前缀（#L230-L239）；这里两者都是 0 → 都带 +
      const vals = await readEarnings(page);
      expect(vals.length).toBe(2);
      expect(vals[0]).toBe('+0.00');
      expect(vals[1]).toBe('+0.00%');
    });

    it('⑤ 交叉断言：UI 数值与后端 account / positions 逐一一致', async () => {
      const summary = await accountOf(account.token);
      expect(summary.cash).toBeCloseTo(100000, 2);
      expect(summary.frozen_cash).toBeCloseTo(0, 2);
      expect(summary.position_value).toBeCloseTo(0, 2);
      expect(summary.total_assets).toBeCloseTo(100000, 2);
      expect(summary.total_pnl).toBeCloseTo(0, 2);
      expect(summary.total_return_rate).toBeCloseTo(0, 2);

      const positions = await requestJson('GET', '/api/portfolio/positions?include_quote=true', {
        token: account.token,
      });
      expect(positions.data.total).toBe(0);
    });
  });

  // ───────────────────── P1-03 申购 → pending 语义 ─────────────────────
  //
  // ⭐ 这条是整条路径最有价值的一条：它把「场外基金统一 pending、冻结资金、
  //    不立即建仓、不入流水」这条**产品规则**钉死。以后有人把申购改成"立即建仓"，
  //    只有这条会红。
  describe('P1-03 申购 → pending 语义', () => {
    let page;
    let message = '';

    beforeAll(async () => {
      await seedSession();
      page = await openPurchasePage(FUND_CODE);

      // 步骤 3：白名单基金必须渲染申购按钮（tradeable=true）
      expect(await page.$('#buy-amount')).not.toBeNull();

      message = await submitPurchase(page, 1000);
    });

    it('① 成功提示匹配「申购申请已提交（当日|下一交易日受理），将于 YYYY-MM-DD 确认份额（T+N），资金已冻结」', async () => {
      // 后端文案：portfolio_service.py#L684-L685
      expect(message).toMatch(
        /^申购申请已提交（(当日|下一交易日)受理），将于 \d{4}-\d{2}-\d{2} 确认份额（T\+\d+），资金已冻结$/
      );
    });

    it('② 交叉断言：cash=99000 / frozen=1000 / total=100000 / position_count=0', async () => {
      const summary = await accountOf(account.token);
      expect(summary.cash).toBeCloseTo(99000, 2);
      expect(summary.frozen_cash).toBeCloseTo(1000, 2);
      expect(summary.total_assets).toBeCloseTo(100000, 2); // 冻结的钱还是自己的
      expect(summary.position_count).toBe(0);
    });

    it('③ ⭐ 返回持仓 Tab：冻结 1000.00、可用 99000.00、总资产仍 100000.00', async () => {
      // 申购成功的结果块给出两个出口（purchase/index.vue#L20-L23）。
      // ⚠️ 这里**只断言按钮存在，不点它** —— 理由是一条实测边界：
      //   `查看持仓` 走 `goPortfolio` → `uni.reLaunch('/pages/watchlist/index?tab=position')`
      //   （purchase/index.vue#L129）。本机实测：**这次 reLaunch 会被丢掉，并堵住通道约 20s**
      //   （e2e/helpers/nav.js 顶部记的就是这个现象）。连续两轮跑批都卡在 20s 超时。
      //   证据表明按钮本身没问题：第三轮同一处 1.7s 就跳过去了 —— 是通道**间歇性**失效，
      //   所以按 nav.js 已定的处置「换掉比留着划算」，改用 gotoPage 回自选页。
      //   ⚠️ 代价要写清楚：**「点「查看持仓」能回持仓 Tab」这一步未被覆盖**。
      //      它是 1 行 reLaunch，且「数值正确」这个考点下面照样覆盖到了。
      const buttons = await page.$$('.result-btn');
      const labels = [];
      for (const el of buttons) {
        try {
          labels.push(((await el.text()) || '').trim());
        } catch {
          /* 跳过 */
        }
      }
      expect(labels).toEqual(expect.arrayContaining(['查看持仓', '交易记录']));

      // 用 gotoPage（内置「先静置再发 + 重试」）回自选页。
      // 仍然带 `?tab=position`，所以 onLoad 消费 query 那一段（#L389-L390）照样被覆盖。
      await gotoPage(program, '/pages/watchlist/index?tab=position', WATCHLIST_PATH, {
        force: true,
      });

      // onShow 里 activeTab === 'position' 会调 fetchPortfolio（#L397-L405）
      await waitFor(
        async () =>
          ((await classOf(await program.currentPage(), '#wl-tab-position')) || '').includes(
            'tab-item--active'
          ),
        { timeout: 10000, label: '持仓 Tab 高亮（?tab=position 生效）' }
      );

      const posPage = await waitForPortfolioLoaded();
      const grid = await readAssetGrid(posPage);
      expect(grid['冻结资金']).toBe('1000.00');
      expect(grid['可用现金']).toBe('99000.00');
      expect(grid['持仓市值']).toBe('0.00');

      const amount = await textOf(posPage, '.amount-value');
      expect(amount.trim()).toBe('¥ 100,000.00');
    });

    it('③-bis ⭐ 持仓明细仍为空（pending 不建仓）', async () => {
      const posPage = await waitForPortfolioLoaded();
      const empty = await textOf(posPage, '.empty-text');
      expect(empty).not.toBeNull();
      expect(empty.trim()).toBe('暂无持仓');
    });

    it('④ ⭐ 交易记录页流水仍为空（只有已确认订单入流水）', async () => {
      const tradesPage = await gotoPage(program, '/pages/trades/index', TRADES_PATH);

      // ⚠️ 交易记录页有**三个**状态共用 `.state`（trades/index.vue#L6-L8）：
      //   加载中「正在加载交易记录...」/ 出错 / 空态「暂无已确认交易记录」。
      //    首跑就踩了：只等「.state 有文案」会立刻拿到**加载中**那一句。
      //    所以这里要等到文案**不再是加载态**。
      const state = await waitFor(
        async () => {
          const t = await textOf(tradesPage, '.state');
          const s = t && t.trim();
          return s && s !== '正在加载交易记录...' ? s : null;
        },
        { timeout: 15000, label: '交易记录页离开加载态' }
      );
      expect(state).toBe('暂无已确认交易记录');

      expect((await tradeFlowOf(account.token)).total).toBe(0);
    });
  });

  // ───────────────────── P1-05 申购金额边界（负例） ─────────────────────
  describe('P1-05 申购金额低于最低额（负例）', () => {
    let page;
    let message = '';
    let frozenBefore = null;
    let frozenAfter = null;

    beforeAll(async () => {
      await seedSession();
      frozenBefore = (await accountOf(account.token)).frozen_cash;
      page = await openPurchasePage(FUND_CODE);
      message = await submitPurchase(page, 5);
      frozenAfter = (await accountOf(account.token)).frozen_cash;
    });

    it('① 提示精确匹配「申购金额 5.00 元低于最低申购金额 10.00 元」', async () => {
      // portfolio_service.py#L598；前端不改写（request.ts#L69-L77 → 页面 catch 原文写入）
      expect(message).toBe('申购金额 5.00 元低于最低申购金额 10.00 元');
    });

    it('② 冻结资金不变', async () => {
      expect(frozenAfter).toBeCloseTo(frozenBefore, 2);
      // docs/e2e/03 P1-05 写的是「仍 1000.00」—— 那是以 P1-03 先跑为前提。
      // 单跑本用例（jest -t P1-05）时下面这条会红，属预期，不是缺陷。
      expect(frozenAfter).toBeCloseTo(1000, 2);
    });

    it('③ 申购页没有渲染成功结果块', async () => {
      // 只有 result.success 为真才设 order（purchase/index.vue#L113-L115）
      expect(await page.$('.order-result')).toBeNull();
    });
  });

  // ───────────────────── P1-06 未持有基金赎回（负例，L3） ─────────────────────
  //
  // ⚠️ 降层理由（不是偷懒）：
  //   赎回页 `!position` 时整个卡片被 v-if 短路（redeem/index.vue#L5），
  //   而 `position` 来自 `getPositions()`（只返回**已确认**持仓，redeem/index.vue#L65-L74）。
  //   未持有的基金 → position 恒为 null → `#sell-quantity` / `#sell-submit`
  //   **永远不渲染** → 后端的「未持有基金 xxx，无法赎回」**从 UI 走不到**。
  //   而赎回页的唯一入口是自选页的持仓项（watchlist/index.vue#L585-L593），
  //   没有持仓就没有入口 —— 闭合的，绕不过去。
  //
  //   这与 docs/e2e/03 §1.5 把「场内 ETF 拦截负例」标为「只能做接口级用例（L3）」
  //   是同一种情形，处置一致。**接口层断言的是真值本身**，只是不经 UI 渲染。
  describe('P1-06 未持有基金赎回（负例，L3 接口级）', () => {
    it('① 接口返回 400 且 detail 精确等于「未持有基金 001595，无法赎回」', async () => {
      const res = await requestJson('POST', '/api/portfolio/apply-redeem', {
        token: account.token,
        body: { fund_code: UNHELD_FUND, quantity: 10 },
      });
      expect(res.status).toBe(400);
      expect(res.data.detail).toBe('未持有基金 001595，无法赎回'); // portfolio_service.py#L786
    });

    it('② 交叉断言：账户与流水完全没动', async () => {
      const summary = await accountOf(account.token);
      // 走到 P1-06 时账户应是 P1-03 之后的稳定态；失败请求不该有任何副作用
      expect(summary.position_count).toBe(0);
      expect(summary.cash).toBeCloseTo(99000, 2);
      expect(summary.frozen_cash).toBeCloseTo(1000, 2);
      expect((await tradeFlowOf(account.token)).total).toBe(0);
    });
  });

  // ───────────────────── P1-04 赎回拦截（⚠️ 走不到，见下） ─────────────────────
  //
  // ⚠️⚠️ 这条**无法按 docs/e2e/03 的预期执行**。两个独立的障碍：
  //
  //   障碍一（UI）：赎回页的可提交表单只在**有已确认持仓**时渲染
  //     （redeem/index.vue#L6 `v-else`，配合 #L5 的 `!position` 短路）。
  //     而 P1-03 之后账号里**没有**任何持仓。→ 和前一条一样，UI 走不到。
  //
  //   障碍二（更硬，接口层也走不到）：后端校验顺序是
  //       :784 `position = self._get_position(...)`
  //       :785-786 `if not position: return "未持有基金 {code}，无法赎回"`
  //       :788-801 pending 申购校验（**在后面**）
  //     而本用例是**新账号、先申购再赎回**，从未持有过 110020 → position 恒为 None →
  //     持仓校验先命中，pending 那条文案**在本路径上**读不到。
  //
  //     ⚠️ 2026-10-08 更正：它**不是死代码**。此前这里写「死代码路径」是**说过头了** ——
  //        那是把「本用例的路径走不到」当成了「全局不可达」。
  //        :788-801 是**可达**的，触发条件是**同时**满足
  //        「该基金有已确认持仓」+「该基金有 pending 申购」：
  //          · 已确认持仓：§二.1 已论证**会话内产生不了**（申购单当天确认不了）
  //            → 所以**本 E2E 覆盖不到**，而不是代码走不到。
  //          · 在真实使用中这个组合很常见（昨天买的已确认，今天又买一笔）。
  //        ⇒ **要真覆盖它得回填状态**（夹具把订单 confirm_date 改到过去再调 confirm-pending，
  //          即 docs/e2e/03 §二.1 末尾说的 `backdate-order`），不是「绕不开」。
  //        ⇒ 对产品的含义也不一样了：这条拦截会**挡住「持有中用户赎回已有份额」这个合法操作**
  //          （见文件头「文档与实现不一致」）。
  //
  //   ✅ 已实测确认（2026-10-08，本机 curl，临时账号验完即删）：
  //      P1-03 下单 1000 后立刻 `POST /api/portfolio/apply-redeem {fund_code:"110020",quantity:10}`
  //      → **400 `{"detail":"未持有基金 110020，无法赎回"}`**
  //      （不是文档期望的「存在待确认的申购订单」）
  //
  //   ⇒ 处置：**登记为「无法覆盖」，不修改代码、不改文档口径**，交给产品/文档确认
  //      「这条拦截到底还成不成立、要不要改校验顺序」。想真跑起来需要夹具回填状态
  //      （把订单 confirm_date 改到过去再调 confirm-pending，即 docs/e2e/03 §二.1 末尾
  //      说的 `backdate-order` 子命令）—— 那是「为测 UI 而构造状态」，
  //      且验证的只是「确认之后的展示」，不在本次范围。
  describe('P1-04 赎回拦截（⚠️ 无法按文档预期执行）', () => {
    it.skip(
      '🔴 从赎回页提交 → 提示「基金 110020 存在待确认的申购订单，份额确认前无法赎回」' +
        ' —— 走不到：赎回表单需已确认持仓；且后端持仓校验排在 pending 校验之前',
      () => {}
    );

    it('（替代断言）pending 期间赎回 110020，实际命中的是持仓校验文案', async () => {
      // 这条**不是**文档里那条用例，而是把「障碍二」变成可执行的证据：
      // 只要它返回的是「未持有基金」，就说明 pending 分支仍被持仓校验挡在后面。
      // 反过来若某天这里变成了「存在待确认的申购订单」，说明校验顺序被改了 ——
      // 那时这条会红，正好提示回去更新 docs/e2e/03 P1-04。
      const res = await requestJson('POST', '/api/portfolio/apply-redeem', {
        token: account.token,
        body: { fund_code: FUND_CODE, quantity: 10 },
      });
      expect(res.status).toBe(400);
      expect(res.data.detail).toBe(`未持有基金 ${FUND_CODE}，无法赎回`);
    });
  });
});
