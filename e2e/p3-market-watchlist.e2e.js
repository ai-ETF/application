/**
 * P3 行情 + 自选 —— E2E。
 *
 * 对应用例：ai-etf/docs/e2e/03-E2E用例清单.md §四 P3-01 ~ P3-05。
 *
 * ⚠️ 跑之前先看这段，否则会拿到假红/假绿。
 *
 * 【数据前提 —— 缺了必然红】
 *   后端必须带行情夹具启动，否则搜索返回 0 条：
 *     E2E_MARKET_FIXTURE="$PWD/docs/e2e/fixtures/market_snapshot.json" poetry run uvicorn server.app:app --port 8000
 *   夹具给了场内 510300/510500/159915（510300 带 6 根日 K）与场外 110020（带 nav_history）。
 *   本机（2026-10-06）直连东财行情 API 不通，**只有夹具这一条路**。
 *
 * 【必须从 Windows 侧跑，不能从 WSL 跑】
 *   uni.automator 用 `fs.existsSync` 校验开发者工具路径，配置写的是 `D:/...`，
 *   而 WSL 下只有 `/mnt/d/...` → "Wechat web devTools not found"。
 *     powershell.exe -NoProfile -Command "Set-Location 'D:\C1\Have a try\etf\code\application'; npm run test:e2e"
 *
 * 【2026-10-06/07 写这版时踩到并已处理的五件事 —— 都是「现象离原因很远」的那种】
 *   1. `program.reLaunch(route)` **不跳页**。它内部走 `App.callUniMethod`，
 *      实测发出后不回包、页面停在原地（连发 2 次、等 5s 都不动）。改成
 *      `program.evaluate(() => uni.reLaunch(...))`（走 `App.callFunction`）后可用。
 *      改在 `helpers/nav.js`；并且因为**新通道也会偶发不回包/不跳页**，
 *      本文件统一用 `gotoPage()`（发→看当前页→不对就重试）。
 *   5.（2026-10-07 补）**`reLaunch` 发出的时机比发几次更重要**。
 *      照上一条把重试写对之后，整条套件仍然**卡死在 `pages/etf-detail/index`**
 *      （实测 366 次轮询都停在那儿，P3-01 之后的用例全部挂在 beforeAll）。
 *      探针定位到：刚从自选页点进详情页就立刻发 reLaunch ——
 *      包虽然回 `reLaunch:ok`，**页面不动**；之后 +8s、+16s 的重发**一样不动**；
 *      等到 +27s 再发一下就过去了。也就是说**一次过早的 reLaunch 会把这条通道
 *      堵住 ~20s**。反过来，进详情页后**先静置 3s** 再发，第 1 次就成功。
 *      详情页 `onLoad` 里 `load()` 要 await 两个接口
 *      （src/pages/etf-detail/index.vue#L150-L192），落地那一刻它必然还在飞。
 *      ⇒ `gotoPage()` 现在**发之前先静置 3s**，失败一次则退避到 8s 再发。
 *      ⚠️ 这是经验阈值（本文档记的是实测值），不是原理值。
 *   2. `seedValidSession(program, { token, user })` 的 **`user` 不能省**。
 *      少传 → `auth_user` 存成 undefined → `restoreSession()` 认为没登录 →
 *      之后任何受保护请求都走 request.ts#L39-L42 的本地过期分支把人踢到登录页。
 *      现象像「跳转 bug」，实为种子数据缺字段。见下方 `buildUser`。
 *   3. 自选接口的字段是 **`fund_code` / `fund_name`**，不是 `etf_code`。
 *      后端 store 内部才映射成 `etfCode`（src/stores/watchlist.ts:40-41）。
 *   4. `/api/market/detail/{code}` 里的实时行情字段叫 **`realtime`**（不是 `quote`）。
 *      场内 ETF 有值，场外基金是 `null` + 给 `nav_history`。
 *   6.（2026-10-07 补）**「打开自选页」必须让它重新挂载**。
 *      给 `gotoPage` 加了「已经在目标页就不发 reLaunch」的短路之后，
 *      P3-04 立刻红：前置在服务端加了两条自选，页面却还是 0 条。
 *      原因是自选页的数据在 `onShow` 里拉
 *      （src/pages/watchlist/index.vue#L397-L405），人已经在页面上 → 不重新挂载
 *      → onShow 不跑 → 列表永远是旧的。所以 `openWatchlist()` 一律 `force: true`。
 *      而 force 又带出一个坑：重新挂载前后「path 已经等于目标页」**都成立**，
 *      按 path 判成败会立刻返回那个马上要被销毁的旧 page 对象
 *      （拿到手一用就是 `page destroyed`）→ 改成按**页面 id 变了**判
 *      （Page 对象上有 id，见 @dcloudio/uni-automator 的 `this.id = e.id`）。
 *
 * 【能力边界：两件事的实测结论】
 *   1. **toast 文案可以捕获**。docs/e2e/03 写的 `mockWxMethod('showToast')` 不存在，
 *      而 mockUniMethod 的函数式 mock 又调不通 —— 本文件改用
 *      「`program.evaluate` 里替换 `wx.showToast`」的探针，**实测能截到文案**
 *      （见 `installToastSpy`，P3-03③ 靠它拿到「已添加自选」）。
 *   2. **左滑手势可以做 —— 此前「做不到」的结论是错的**（2026-10-13 推翻并已改为真用例，
 *      由 ⑥ 覆盖，含「短滑不打开」的反例）。
 *
 *      错在哪：当年传的是 `el.touchstart({ x, y })`，而官方这三个 RPC 的参数是
 *        `{ touches: [触摸点...], changedTouches: [触摸点...] }` —— **没有 `x`/`y` 字段**。
 *      传 `{x, y}` 时合成事件的 `touches` 是**空数组** → `watchlist/index.vue:467`
 *      第一行 `const touch = event.touches[0]; if (!touch) return;` 直接退出 →
 *      位移恒为 0 → style 恒为 `translateX(0px)`。
 *      现象（「RPC 都发了、也都回包了，但 style 不动」）与当年观察**一字不差**，
 *      只是把「参数传错了」误判成了「这台机器能力不够」。
 *
 *      ⭐ 教训：**「工具做不到」这个结论，在写进文档之前要先确认一遍参数形状**。
 *      错误的能力结论比没有结论更糟 —— 它会让后来的人照着绕路。
 *      细节与探针证据见 `swipeRowLeft()` 的注释。
 *
 * 【⚠️ 一处「文档与实现不一致」—— 已登记，未改代码】
 *   docs/e2e/03 的 P3-05③ 写「未登录切到持仓 tab → **立即跳转**登录页」。
 *   实测**不会跳**：`fetchPortfolio()` 在 `!authStore.isAuthenticated` 时
 *   **先短路返回、根本不发请求**，只把 `positionError` 设成「登录后查看持仓」，
 *   页面渲染一条「去登录」链接（src/pages/watchlist/index.vue#L594-L601 + #L189-L192）。
 *   没有请求 → 走不到 request.ts 的跳转分支，所以文档那条预期是错的。
 *   本文件按**实际行为**断言，并把这条差异留给产品/文档确认：
 *   「未登录看持仓」到底该自动踢去登录，还是像现在这样给个「去登录」入口。
 *
 * 依据行号（逐条核对过）：
 *   场内/场外互斥、提示文案：src/pages/etf-detail/index.vue#L16-L53
 *   K 线只在 quote 存在时加载：src/pages/etf-detail/index.vue#L188
 *   K 线 canvas 的 v-else：   src/pages/etf-detail/index.vue#L69
 *   加/取消自选 toast：        src/pages/etf-detail/index.vue#L245
 *   左滑阈值：                 src/pages/watchlist/index.vue#L497-L503
 *   移除 / 清空 toast：        src/pages/watchlist/index.vue#L556 / #L574
 *   搜索防抖 400ms：           src/pages/watchlist/index.vue#L372-L384
 *   切持仓 tab → fetchPortfolio：src/pages/watchlist/index.vue#L412-L424
 *   未登录看持仓的短路：        src/pages/watchlist/index.vue#L594-L601
 *   自选字段映射 fund_code：    src/stores/watchlist.ts#L40-L41
 *   /api/market/ 放行：        src/utils/request.ts#L38
 */

const helpers = require('./helpers');

const {
  requestJson,
  waitFor,
  sleep,
  clearAuthKeys,
  seedValidSession,
  gotoPage,
  withTimeout,
} = helpers;

// 页面 path（currentPage().path 形式，**不带**前导斜杠）与跳转 route（**带**斜杠），别混
const WATCHLIST_PATH = 'pages/watchlist/index';
const WATCHLIST_ROUTE = '/pages/watchlist/index';
const DETAIL_PATH = 'pages/etf-detail/index';
const LOGIN_PATH = 'pages/login/index';

const ETF_CODE = '510300'; // 场内 ETF：有 realtime + K 线，不可申购
const FUND_CODE = '110020'; // 场外基金：只有 nav_history，可申购

// 夹具真值（docs/e2e/fixtures/market_snapshot.json）。用 toBeCloseTo(_, 3) 比：
// 夹具经 pd.read_json 进来会带 1 ULP 误差（docs/e2e/09 §5.5）。
const FIXTURE = {
  etf: { code: '510300', name: '沪深300ETF', price: 3.876, changePct: 1.23 },
  firstKlineClose: 3.811, // 2026-09-23
};

jest.setTimeout(120000);

// ───────────────────────────── 基础件 ─────────────────────────────

let account = null;

/**
 * 造本地会话所需的 user 对象。
 * ⚠️ 见文件头说明 2 —— `user` 少了不是报错，是「看着像跳转 bug」的假故障。
 * 与 p4-auth.e2e.js#L71-L73 的 buildUser 保持一致。
 */
function buildUser(acct) {
  return { id: acct.userId, username: 'e2e', displayName: 'e2e' };
}

/** 种一个「本地完全有效」的会话。需要登录的用例都先调它。 */
function seedSession() {
  return seedValidSession(program, { token: account.token, user: buildUser(account) });
}

/**
 * 「重新打开自选页」—— 一定让它重新挂载，再确认真的到了。
 *
 * ⚠️ 这里 `force: true` 是必须的，不是保险起见：
 * 自选页的数据在 `onShow` 里拉（watchlist/index.vue#L397-L405）。
 * 如果调的时候人已经在自选页，`gotoPage` 默认就不发 reLaunch 了 ——
 * 页面不重新挂载 → onShow 不跑 → 列表还是旧的。
 * 本文件里每个「打开自选页」都隐含「看到最新列表」，
 * 所以一律 force（P3-04 前置加了两条自选却只看到 0 条，就是这么来的）。
 */
async function openWatchlist({ force = true } = {}) {
  return gotoPage(program, WATCHLIST_ROUTE, WATCHLIST_PATH, { force });
}

/**
 * 动作区宽度（px）。用**与页面同一个公式**算，不硬编码 —— 换模拟器就不一样了。
 * 页面侧：`const swipeActionWidthPx = uni.getSystemInfoSync().windowWidth * SWIPE_ACTION_WIDTH_RPX / 750`
 * （watchlist/index.vue:327-328，SWIPE_ACTION_WIDTH_RPX = 176）
 */
async function swipeActionWidthPx() {
  const info = await program.systemInfo();
  return (info.windowWidth * 176) / 750;
}

/** 读第一条卡片的 style —— 「滑开没有」的唯一判据（模板 :style 绑的就是 translateX） */
async function followItemStyle(page) {
  const rows = await page.$$('.etf-item');
  if (!rows.length) return null;
  return await rows[0].attribute('style');
}

/**
 * 模拟一次真实左滑手势：按住 → 拖两步 → 松手。
 *
 * ⚠️⚠️ **参数形状是这个文件里最贵的一个坑**（2026-10-13 定位，此前一直是错的结论）：
 *   官方 `Element.touchstart/touchmove/touchend` 的参数是
 *     `{ touches: [触摸点...], changedTouches: [触摸点...] }`
 *   —— **没有 `x` / `y` 这两个字段**。
 *
 *   2026-10-06 传的是 `el.touchstart({ x, y })`，于是合成事件的 `touches` 是**空数组**
 *   → `watchlist/index.vue:467` 第一行 `const touch = event.touches[0]; if (!touch) return;`
 *   直接退出 → 位移恒为 0 → style 恒为 `transform:translateX(0px)`。
 *   **当时把这个现象误判成「本机做不到左滑」，其实只是参数传错了。**
 *
 *   探针实测（2026-10-13，正确形状下四种写法：只 pageX/pageY、只 clientX/clientY、
 *   两个都给、松手时 touches 空或非空）**全部滑开**；且 20px 短滑不打开、45px 中滑打开
 *   —— 说明位移**真的由我们给的坐标决定**，不是「碰一下就满格」。
 *   开发者工具会把缺的坐标字段补齐，所以 clientX/pageX 给哪个都行（这里两个都给，最保险）。
 *
 * 阈值（都取自前端源码，不是猜的）：
 *   · 判定「开始拖动」要 |deltaX| ≥ 8px            watchlist/index.vue:488
 *   · 松手时位移 ≤ -动作区宽 × 35% 才锁定打开      watchlist/index.vue:501
 *
 * @param {object} row     `#wl-follow-item` 元素
 * @param {number} deltaPx 向左滑的总距离（正数）；滑够会被夹在 -动作区宽度
 * @returns {Promise<string>} 四个 RPC 的执行日志；**失败也返回、不抛**
 *   —— 这样「滑不开」时能一眼分清是「手势根本没发出」还是「发出了但没生效」
 */
async function swipeRowLeft(row, deltaPx) {
  const size = await row.size();
  const offset = await row.offset();
  const y = Math.round(offset.top + size.height / 2);
  const startX = Math.round(offset.left + size.width - 20); // 从行内靠右起手，别压在边缘上
  const endX = startX - deltaPx;
  const midX = Math.round((startX + endX) / 2);

  const touchAt = (x) => ({ identifier: 1, clientX: x, clientY: y, pageX: x, pageY: y });
  const down = touchAt(startX);
  const mid = touchAt(midX);
  const up = touchAt(endX);

  const log = [];
  const step = async (name, fn) => {
    try {
      await withTimeout(fn(), 6000, name);
      log.push(`${name}:ok`);
    } catch (e) {
      log.push(`${name}:抛错(${e.message})`);
    }
  };

  await step('touchstart', () => row.touchstart({ touches: [down], changedTouches: [down] }));
  await sleep(120);
  await step('touchmove#1', () => row.touchmove({ touches: [mid], changedTouches: [mid] }));
  await sleep(120);
  await step('touchmove#2', () => row.touchmove({ touches: [up], changedTouches: [up] }));
  await sleep(120);
  await step('touchend', () => row.touchend({ touches: [], changedTouches: [up] }));
  return log.join(' ');
}

/** 在自选页搜索框输入关键词，等防抖 400ms + 请求往返。 */
async function searchInWatchlist(keyword) {
  const page = await waitFor(
    async () => {
      const p = await program.currentPage();
      if (p.path !== WATCHLIST_PATH) return null;
      const input = await p.$('#wl-search-input');
      return input || null;
    },
    { timeout: 10000, label: '自选页搜索框就位' }
  );
  await page.input(keyword);
  await sleep(400 + 400); // 防抖 400ms（watchlist/index.vue:382）+ 往返余量
}

/**
 * 等搜索结果出现，返回命中的那一条（**不点**）。
 *
 * 结果项没有 id，class 是 `.etf-item`，内含 `.etf-name` / `.etf-code`。
 * Element 没有「按文本查子元素」的稳定写法，所以取整项文本（`el.text()` 会把
 * 子节点文本拼起来）再 includes(code)。
 * 搜索态下 `#wl-follow-list` 是 `v-if="!hasKeyword"` → 不渲染，
 * 所以此时 `.etf-item` 不会跟自选列表的项混在一起。
 *
 * @returns {{el: object, count: number, text: string}} 命中的元素 + 结果总数 + 该项文本
 */
function findSearchResult(code) {
  return waitFor(
    async () => {
      const page = await program.currentPage();
      const items = await page.$$('.etf-item');
      const texts = [];
      for (const el of items) {
        let t = '';
        try {
          t = (await el.text()) || '';
        } catch {
          continue; // 重渲染窗口里元素消失，跳过
        }
        texts.push(t);
      }
      const idx = texts.findIndex((t) => t.includes(code));
      if (idx < 0) return null;
      return { el: items[idx], count: items.length, text: texts[idx] };
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
      if (await p.$('.state')) return false; // v-if="loading" / v-else-if="error" 的占位
      return !!((await p.$('.quote-card')) || (await p.$('#detail-watchlist-btn')));
    },
    { timeout: 15000, label: `详情页 ${code} 内容就位` }
  );
}

/** 元素 class 字符串；元素不存在返回 null（便于区分「没这个元素」）。 */
async function classOf(page, selector) {
  const el = await page.$(selector);
  if (!el) return null;
  try {
    return (await el.attribute('class')) || '';
  } catch {
    return null;
  }
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

// ───────────────────────────── toast 探针 ─────────────────────────────
//
// docs/e2e/03 的 P3-03①/④、P3-04① 要断言 toast 文案。`mockWxMethod` 不存在、
// mockUniMethod 的函数式 mock 调不通，所以只能在页面上下文里把 wx.showToast 换掉。
// 装到 globalThis 上（mp-weixin 里没有 window，但有 globalThis 和 wx）。
//
// ✅ 2026-10-06 实测**有效**：P3-03 拿到过 "已添加自选"。

const TOAST_KEY = '__e2e_toasts__';

/** 装探针并清空历史。返回 true 表示 wx.showToast 确实被替换掉了。 */
async function installToastSpy() {
  try {
    return await program.evaluate(() => {
      const g = typeof globalThis !== 'undefined' ? globalThis : {};
      g.__e2e_toasts__ = [];
      if (typeof wx === 'undefined' || typeof wx.showToast !== 'function') return false;
      const orig = wx.showToast;
      wx.showToast = function (opts) {
        try {
          g.__e2e_toasts__.push((opts && (opts.title || opts.content)) || '');
        } catch (e) {
          /* 探针本身绝不打断被测流程 */
        }
        return orig.apply(this, arguments);
      };
      return wx.showToast !== orig;
    });
  } catch (e) {
    return false;
  }
}

/** 读探针记到的 toast 文案。 */
async function readToasts() {
  try {
    const v = await program.evaluate(() => {
      const g = typeof globalThis !== 'undefined' ? globalThis : {};
      return (g.__e2e_toasts__ || []).slice();
    });
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** 从 /api/watchlist/list 的返回里取代码数组（字段是 fund_code，见文件头说明 3）。 */
function codesFromListResponse(res) {
  return (res.data.items || []).map((it) => it.fund_code);
}

// ───────────────────────────── 前置检查 ─────────────────────────────

beforeAll(async () => {
  // 环境把关：错了立刻说，别让几十秒的跑批变成假结论
  helpers.assertLocalApiBase();
  helpers.assertUrlCheckDisabled();
  helpers.assertTouristAppId();

  if (!(await helpers.ping())) {
    throw new Error(
      '后端连不上 —— 先确认已带夹具启动：\n' +
        '  E2E_MARKET_FIXTURE="$PWD/docs/e2e/fixtures/market_snapshot.json" poetry run uvicorn server.app:app --port 8000'
    );
  }

  // 夹具自检：没有夹具时搜索返回 0 条，P3-01 会红在「搜索无结果」上 ——
  // 那种红是环境问题不是缺陷，这里提前把它变成一条说得清的报错。
  const search = await requestJson('GET', `/api/market/search?keyword=${ETF_CODE}`);
  const items = (search.data && search.data.items) || [];
  if (!items.some((it) => it.code === ETF_CODE)) {
    throw new Error(
      `行情夹具没生效：GET /api/market/search?keyword=${ETF_CODE} 未返回 ${ETF_CODE}。\n` +
        `实际响应：${JSON.stringify(search.data).slice(0, 300)}\n` +
        '→ 后端启动时漏了 E2E_MARKET_FIXTURE 环境变量。'
    );
  }

  account = await helpers.registerAccount();
});

afterAll(async () => {
  if (account && account.token) {
    try {
      await helpers.deleteAccount(account.token, account.password);
    } catch (e) {
      console.warn(`[P3] 清理测试账号失败（不影响结论）：${e.message}`);
    }
  }
});

// ───────────────────────────── 用例 ─────────────────────────────

describe('P3 行情 + 自选', () => {
  describe('P3-01 搜索 → 详情（场内 ETF）→ K线', () => {
    let page;
    let searchHit; // 跳转前抓到的搜索结果证据

    beforeAll(async () => {
      await seedSession();
      await openWatchlist();
      await searchInWatchlist(ETF_CODE);

      // 先把搜索结果这一步的证据留在手上再跳 —— 跳到详情页后这些元素就不在了
      const hit = await findSearchResult(ETF_CODE);
      searchHit = { count: hit.count, text: hit.text };
      await hit.el.tap();

      await waitForDetailReady(ETF_CODE);
      page = await program.currentPage();
    });

    it('① 搜索结果非空，含代码 510300', async () => {
      expect(searchHit.count).toBeGreaterThan(0);
      expect(searchHit.text).toContain(ETF_CODE);
      expect(searchHit.text).toContain(FIXTURE.etf.name); // 名称也在同一行

      // 交叉验证：DOM 里出现过的，后端也确实返回了
      const res = await requestJson('GET', `/api/market/search?keyword=${ETF_CODE}`);
      expect(res.status).toBe(200);
      expect(res.data.items.map((it) => it.code)).toContain(ETF_CODE);
    });

    it('② 详情页展示行情卡片（realtime 存在）', async () => {
      // 场内分支：`.quote-card` 且**不带** nav-card（etf-detail/index.vue:16 vs :35）
      const cls = await classOf(page, '.quote-card');
      expect(cls).not.toBeNull();
      expect(cls).not.toContain('nav-card');
      // 行情指标网格只在 v-if="quote" 的卡片里（etf-detail/index.vue:56）
      expect(await classOf(page, '.metric-grid')).not.toBeNull();

      // 交叉验证数值：后端字段是 realtime（见文件头说明 4）
      const detail = await requestJson('GET', `/api/market/detail/${ETF_CODE}`);
      expect(detail.status).toBe(200);
      expect(detail.data.realtime).not.toBeNull();
      expect(detail.data.realtime.price).toBeCloseTo(FIXTURE.etf.price, 3);
      expect(detail.data.realtime.change_pct).toBeCloseTo(FIXTURE.etf.changePct, 3);
    });

    it('③ K线区域渲染且 klineItems.length > 0', async () => {
      // canvas 的 v-else 挂在 `klineItems.length === 0` 之后，
      // 所以「能拿到 #etf-kline」⟺ klineItems.length > 0（etf-detail/index.vue:69）
      expect(await classOf(page, '#etf-kline')).not.toBeNull();

      const kline = await requestJson('GET', `/api/market/kline/${ETF_CODE}?period=daily&limit=60`);
      expect(kline.status).toBe(200);
      const items = kline.data.items || [];
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].close).toBeCloseTo(FIXTURE.firstKlineClose, 3);
    });

    it('④ ⭐ 不渲染 #detail-purchase-btn，且展示「仅支持行情与自选」文案', async () => {
      expect(await page.$('#detail-purchase-btn')).toBeNull();

      const hint = await textOf(page, '.trade-hint');
      expect(hint).not.toBeNull();
      expect(hint.trim()).toBe('该标的仅支持行情与自选，场外模拟申购请选支持交易的基金。');
    });
  });

  describe('P3-02 搜索 → 详情（白名单基金）→ 反向断言', () => {
    let page;

    beforeAll(async () => {
      // 显式种会话，不依赖上一条用例留下的 Storage —— 用例之间不该有隐形依赖
      await seedSession();
      await openWatchlist();
      await searchInWatchlist(FUND_CODE);
      const hit = await findSearchResult(FUND_CODE);
      await hit.el.tap();
      await waitForDetailReady(FUND_CODE);
      page = await program.currentPage();
    });

    it('① 不渲染行情卡片与 K线（realtime === null）', async () => {
      // 场外分支走 `.quote-card.nav-card`（etf-detail/index.vue:35）
      const cls = await classOf(page, '.quote-card');
      expect(cls).not.toBeNull();
      expect(cls).toContain('nav-card');

      // 行情指标网格与 K 线都必须不在
      expect(await page.$('.metric-grid')).toBeNull();
      expect(await page.$('#etf-kline')).toBeNull();

      // 交叉验证：后端对 110020 就是不给实时行情
      const detail = await requestJson('GET', `/api/market/detail/${FUND_CODE}`);
      expect(detail.status).toBe(200);
      expect(detail.data.realtime).toBeNull();
    });

    it('② 展示 nav_history 净值历史', async () => {
      // `.nav-value` = 最新单位净值，只在场外分支渲染（etf-detail/index.vue:42-44）
      const nav = await textOf(page, '.nav-value');
      expect(nav).not.toBeNull();
      expect(nav.trim()).not.toBe('');
      expect(nav.trim()).not.toBe('--');

      // 交叉验证：后端确实给了净值历史
      const detail = await requestJson('GET', `/api/market/detail/${FUND_CODE}`);
      expect(Array.isArray(detail.data.nav_history)).toBe(true);
      expect(detail.data.nav_history.length).toBeGreaterThan(0);
    });

    it('③ ⭐ 渲染 #detail-purchase-btn（可申购）', async () => {
      expect(await page.$('#detail-purchase-btn')).not.toBeNull();
      // 可申购就不该有那条「仅支持行情与自选」提示
      expect(await page.$('.trade-hint')).toBeNull();
    });
  });

  describe('P3-03 添加自选 → 列表 → 移除', () => {
    let page;
    let spyInstalled = false;

    beforeAll(async () => {
      await seedSession();
      await openWatchlist();
      await searchInWatchlist(ETF_CODE);
      const hit = await findSearchResult(ETF_CODE);
      await hit.el.tap();
      await waitForDetailReady(ETF_CODE);
      page = await program.currentPage();
    });

    it('① 详情页按钮此时是「添加自选」', async () => {
      const btn = await textOf(page, '#detail-watchlist-btn');
      expect(btn).not.toBeNull();
      expect(btn.trim()).toBe('添加自选');
    });

    it('② tap 后按钮文案变为「取消自选」（依赖 watchlistStore.isFollowed）', async () => {
      spyInstalled = await installToastSpy();

      const btn = await page.$('#detail-watchlist-btn');
      await btn.tap();

      await waitFor(
        async () => {
          const t = await textOf(page, '#detail-watchlist-btn');
          return t && t.trim() === '取消自选';
        },
        { timeout: 10000, label: '按钮变为「取消自选」' }
      );
    });

    it('③ toast 文案为「已添加自选」（不是「已添加」）', async () => {
      // ⚠️ 夹具原文档（docs/e2e/03 P3-03①）写的「已添加」是错的：
      // 「已添加」是自选页搜索结果里直接加自选的文案；详情页这条是「已添加自选」
      // （etf-detail/index.vue:245）。
      if (!spyInstalled) {
        throw new Error('toast 探针没装上 —— 这条算未覆盖，不能算通过。');
      }
      const toasts = await readToasts();
      if (toasts.length === 0) {
        throw new Error(
          'toast 探针装上了但一条都没截到 —— uni-app 可能持有原 wx.showToast 引用。' +
            '这条算未覆盖（需确认），不能算通过。'
        );
      }
      expect(toasts).toContain('已添加自选');
    });

    it('④ 交叉断言：后端 /api/watchlist/list 已含该 code', async () => {
      const res = await requestJson('GET', '/api/watchlist/list', { token: account.token });
      expect(res.status).toBe(200);
      expect(codesFromListResponse(res)).toContain(ETF_CODE);
      // include_quote=true 时还应有实时行情字段（docs/e2e/03 P3-03③）
      const withQuote = await requestJson('GET', '/api/watchlist/list?include_quote=true', {
        token: account.token,
      });
      const row = (withQuote.data.items || []).find((it) => it.fund_code === ETF_CODE);
      expect(row).toBeDefined();
      expect(row.price).toBeCloseTo(FIXTURE.etf.price, 3);
    });

    it('⑤ 返回自选页，列表出现该代码', async () => {
      const listPage = await openWatchlist();
      const found = await waitFor(
        async () => {
          const items = await listPage.$$('#wl-follow-item');
          for (const el of items) {
            const t = (await el.text()) || '';
            if (t.includes(ETF_CODE)) return t;
          }
          return null;
        },
        { timeout: 10000, label: `自选列表出现 ${ETF_CODE}` }
      );
      expect(found).toContain(ETF_CODE);
    });

    it('⑥ 左滑 → 滑开 → 点删除 → 后端列表不再含该 code', async () => {
      const listPage = await program.currentPage();
      const item = await listPage.$('#wl-follow-item');
      expect(item).not.toBeNull();

      const actionWidth = await swipeActionWidthPx();

      // ── ① 反例：短滑**不该**打开 ────────────────────────────────────────
      // 这一步是本条自带的反向验证：证明②那个「滑开」判据真的能区分开与不开，
      // 而不是「随便碰一下就绿」。20px < 动作区宽 35%（≈32px）→ 松手应弹回 0。
      await swipeRowLeft(item, 20);
      await sleep(500);
      expect(await followItemStyle(listPage)).toContain('translateX(0px)');

      // ── ② 正例：滑够距离 → 卡片停在动作区宽度上 ──────────────────────
      // ⚠️ 「左滑有没有真的上手」必须有独立证据 —— 不能只看后面「删除成功了」：
      // 删除区即使被卡片盖着，`Element.tap` 是按 elementId 派发的，照样点得中。
      // 那样删除会成功、但手势其实没生效，等于把没做的步骤记成做了。
      // 滑动到位时模板会给 `.etf-item` 打上 `translateX(-Npx)`（watchlist/index.vue:92），
      // 所以直接读这个 style 当证据。
      const log = await swipeRowLeft(item, 120);
      await sleep(500);
      const style = (await followItemStyle(listPage)) || '';
      // 把 RPC 日志拼进断言值：红了要能一眼分清是「手势没发出」还是「发出了没生效」
      expect(`${style} ｜ rpc: ${log}`).toMatch(/translateX\(-[\d.]+px\)/);

      const moved = parseFloat(/translateX\((-?[\d.]+)px\)/.exec(style)[1]);
      expect(moved).toBeCloseTo(-actionWidth, 1); // 夹在动作区宽度上（watchlist/index.vue:493）

      // ── ③ 点被露出来的删除区 ─────────────────────────────────────────
      // 走到这里卡片是真的滑开了，删除区不再需要「隔着卡片按 elementId 派发」。
      const deleteBtn = await listPage.$('.swipe-delete');
      expect(deleteBtn).not.toBeNull();

      helpers.confirmNextModal(program, { confirm: true }); // 桩 showModal 自动确认
      await deleteBtn.tap();

      await waitFor(
        async () => {
          const res = await requestJson('GET', '/api/watchlist/list', { token: account.token });
          return !codesFromListResponse(res).includes(ETF_CODE);
        },
        { timeout: 10000, label: '后端自选列表已移除' }
      );
    });

    it('⑦ 交换验证：重新进入自选页后它不再出现（证明是服务端删除，不只是本地过滤）', async () => {
      // removeFromFollow 只做本地过滤、不发二次请求（src/stores/watchlist.ts#L279-L290），
      // 所以必须切走再回来，靠 onShow 重新拉一次列表，才能证伪「只是本地隐藏了」。
      const listPage = await openWatchlist();
      await sleep(800);

      const items = await listPage.$$('#wl-follow-item');
      for (const el of items) {
        const t = (await el.text()) || '';
        expect(t).not.toContain(ETF_CODE);
      }
    });
  });

  describe('P3-04 清空自选', () => {
    let page;

    beforeAll(async () => {
      await seedSession();

      // 前置：直接造服务端状态（加 2 个自选），比走两遍 UI 快且稳
      for (const code of [ETF_CODE, '510500']) {
        const res = await requestJson('POST', '/api/watchlist/add', {
          token: account.token,
          body: { fund_code: code },
        });
        if (res.status !== 200) {
          throw new Error(
            `前置造数失败 POST /api/watchlist/add ${code} → HTTP ${res.status}: ${JSON.stringify(res.data)}`
          );
        }
      }

      page = await openWatchlist();
      await waitFor(async () => (await page.$$('#wl-follow-item')).length >= 2, {
        timeout: 10000,
        label: '自选列表出现 2 项',
      });
    });

    it('① tap 清空（桩 showModal 确认）', async () => {
      const clearBtn = await page.$('#wl-clear');
      expect(clearBtn).not.toBeNull();
      helpers.confirmNextModal(program, { confirm: true });
      await clearBtn.tap();
      // 等「服务端真的清空了」再往下，不要固定 sleep：
      // handleClearAll 是 showModal 回调里 `await clearFollow()` 之后才更新本地列表
      // （watchlist/index.vue#L566-L578），固定 sleep 会偶发抢在请求回来之前读 DOM
      // —— 实测有过「② 还看到 2 条、③ 却已经是空」的错位。
      await waitFor(
        async () => {
          const res = await requestJson('GET', '/api/watchlist/list', { token: account.token });
          return res.status === 200 && (res.data.items || []).length === 0;
        },
        { timeout: 10000, label: '后端自选已清空' }
      );
    });

    it('② 列表为空', async () => {
      // 服务端已空（① 已确认），这里等的是**页面把本地列表也清掉**，即 onSuccess 回调跑完。
      await waitFor(async () => (await page.$$('#wl-follow-item')).length === 0, {
        timeout: 10000,
        label: '页面自选列表已清空',
      });
    });

    it('③ 交叉断言 GET /api/watchlist/list → items 为空', async () => {
      const res = await requestJson('GET', '/api/watchlist/list', { token: account.token });
      expect(res.status).toBe(200);
      expect(res.data.items || []).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // P3-04（取消支）清空自选点「取消」→ 不许清
  //
  // 全仓 3 处 `showModal` 的最后一处（另两处：p2-chat 的 P2-05（取消支）删会话、
  // p4-auth 的 P4-03（取消支）登出）。三处各自实现、写法还不一样，所以三处都要各验一次：
  // 这里 watchlist/index.vue#L571-L576 是回调写法（`if (res.confirm) ...`）。
  //
  // ⚠️ 必须**另开一个 describe**，不能塞进上面那组：那组是串起来的，
  //    ① 已经把服务端清空了 —— 在它之后再点「取消」，验的是「空列表没被清空」，
  //    一句永远为真的废话。这条要的恰恰是「有东西、点取消、东西还在」。
  describe('P3-04（取消支）清空自选点「取消」', () => {
    let page;
    const CODES = [ETF_CODE, '510500'];

    beforeAll(async () => {
      await seedSession();

      // 前置：造服务端状态（2 条自选）—— 与上一组同一套做法
      for (const code of CODES) {
        const res = await requestJson('POST', '/api/watchlist/add', {
          token: account.token,
          body: { fund_code: code },
        });
        if (res.status !== 200) {
          throw new Error(
            `前置造数失败 POST /api/watchlist/add ${code} → HTTP ${res.status}: ${JSON.stringify(res.data)}`
          );
        }
      }

      // toast 探针要在这里重装一次：它虽然在本文件 P3-03 里装过一次，
      // 但那条只要没跑（比如单跑 `-t 'P3-04（取消支）'`），探针就是空的，
      // 「没弹错 toast」会变成假绿。返回值顺带当对照组用（true = wx.showToast 确实被换了）。
      const spyOk = await installToastSpy();
      expect(spyOk).toBe(true);

      page = await openWatchlist();
      await waitFor(async () => (await page.$$('#wl-follow-item')).length >= 2, {
        timeout: 10000,
        label: '自选列表出现 2 项',
      });
    });

    // 收尾：恢复成「空自选」，跟上一组结束时一致 —— 不留状态给后面的用例
    // （严格说 P3-05 不看自选内容，但账号级状态能清就清，少一个将来被误读的变量）
    afterAll(async () => {
      try {
        await requestJson('DELETE', '/api/watchlist/clear', { token: account.token });
      } catch (e) {
        console.warn(`[P3-04(取消)] 收尾清空自选失败（不影响结论）：${e.message}`);
      }
    });

    it('① tap 清空（桩 showModal 点取消）→ 页面 2 条、后端 2 条、没弹「已清空」', async () => {
      const clearBtn = await page.$('#wl-clear');
      expect(clearBtn).not.toBeNull();

      // ⚠️ 桩法与其他两条「取消支」**不一样**，这是被实跑逼出来的：
      // handleClearAll 是**回调写法**（watchlist/index.vue#L567 的 `success:`），
      // 实测 `withNativeModal`（换 `wx.showModal`）拦不到它 ——
      // 换完之后 readNativeModalCalls 是空的，2026-10-11 实跑确认。
      // 回调写法要用 `confirmNextModal`（= 结果式 mock 掉 uni 自己的 showModal），
      // 这也是 uniMock.js 里两套桩并存的真正原因。代价：这条路读不到弹窗文案。
      helpers.confirmNextModal(program, { confirm: false });
      await clearBtn.tap();
      // 等它去「犯错」：真清了的话服务端和本地列表都会立刻变
      // （handleClearAll 是回调里 `await clearFollow()` 之后才更新，见 watchlist/index.vue#L571-L576）
      await sleep(2500);

      // ① 交叉断言（关键）：后端还是那 2 条 —— 证明真的没发 DELETE /api/watchlist/clear
      const res = await requestJson('GET', '/api/watchlist/list', { token: account.token });
      expect(res.status).toBe(200);
      expect(codesFromListResponse(res).sort()).toEqual([...CODES].sort());

      // ② 页面也还是 2 条（本地列表没被清）
      expect(await (await program.currentPage()).$$('#wl-follow-item')).toHaveLength(2);

      // ③ 也没弹那句「已清空」—— 它只在 confirm 分支里（watchlist/index.vue#L574）
      expect(await readToasts()).not.toContain('已清空');

      // ④ 对照组（关键，防假绿）：同一个按钮、同一个桩法，只把 confirm 换成 true ——
      //    这次必须真的清空。两次结果不同，才说明「取消」那一下**真的送到了应用手里**
      //    并被 `if (res.confirm)` 挡住；否则可能只是「桩没送到 → 什么也没发生」，
      //    那样这条用例测的就不是取消分支，而是一句永远为真的废话。
      const clearBtnAgain = await page.$('#wl-clear');
      helpers.confirmNextModal(program, { confirm: true });
      await clearBtnAgain.tap();
      await waitFor(
        async () => {
          const r = await requestJson('GET', '/api/watchlist/list', { token: account.token });
          return r.status === 200 && (r.data.items || []).length === 0;
        },
        { timeout: 10000, label: '对照组：点确定后后端确实清空了' }
      );
    });
  });

  describe('P3-05 行情接口放行未登录（跨 P3/P4 关键负例）', () => {
    beforeAll(async () => {
      // 前置：本地登录态清干净
      await clearAuthKeys(program);
      const leftover = await helpers.findLeftoverAuthKeys(program);
      if (leftover.length) {
        throw new Error(`前置失败：本地还有残留 auth key ${JSON.stringify(leftover)}`);
      }
    });

    it('① 进自选页不跳转登录页', async () => {
      await openWatchlist();
      const p = await program.currentPage();
      expect(p.path).toBe(WATCHLIST_PATH);
    });

    it('② 搜索正常返回结果（/api/market/ 被特判放行）', async () => {
      await searchInWatchlist(ETF_CODE);
      await waitFor(async () => (await (await program.currentPage()).$$('.etf-item')).length > 0, {
        timeout: 10000,
        label: '未登录也能搜到结果',
      });
      // 对照组：搜完仍然没被踢去登录
      expect((await program.currentPage()).path).toBe(WATCHLIST_PATH);
    });

    it('③ ⭐ 切到持仓 tab → 不发请求、留在原页并给「去登录」入口（对照组）', async () => {
      // ⚠️ 这里与 docs/e2e/03 的 P3-05③ 不一致，**按实现断言**，差异已在文件头登记。
      // fetchPortfolio() 在未登录时先短路返回（watchlist/index.vue#L594-L601），
      // 根本不发请求 → 走不到 request.ts 的跳转分支 → **不会自动跳登录页**。
      const page = await program.currentPage();
      const tab = await page.$('#wl-tab-position');
      expect(tab).not.toBeNull();
      await tab.tap();
      await sleep(1500);

      // ① 没有跳走
      expect((await program.currentPage()).path).toBe(WATCHLIST_PATH);

      // ② 页面给出的是「登录后查看持仓」+「去登录」，不是行情页那套放行逻辑
      const stateText = await textOf(page, '.portfolio-state');
      expect(stateText).not.toBeNull();
      expect(stateText).toContain('登录后查看持仓');
      const goLogin = await textOf(page, '.portfolio-state .retry');
      expect(goLogin).not.toBeNull();
      expect(goLogin.trim()).toBe('去登录');

      // ③ 对照：行情（走 /api/market/ 放行）依然可用，说明区别确由「是否需要 JWT」造成
      const search = await requestJson('GET', `/api/market/search?keyword=${ETF_CODE}`);
      expect(search.status).toBe(200);
    });
  });
});
