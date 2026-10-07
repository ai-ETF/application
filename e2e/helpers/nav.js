/**
 * 页面跳转 —— 走 `uni.reLaunch`，并容忍不回包。
 *
 * ⚠️ 2026-10-06 换实现。原因不是风格偏好，是**旧写法在本机根本不跳页**：
 *
 *   `program.reLaunch(route)` 内部是 `App.callUniMethod('reLaunch', {url})`。
 *   实测（e2e/z-probe-nav.e2e.js 探针，用完全部删除）：
 *     · `App.callUniMethod reLaunch /pages/index/index`   → SEND 之后再无任何 RECV，
 *       页面**停在原地**（连发两次、等 5s 都一样）
 *     · `App.callUniMethod reLaunch /pages/watchlist/index` → 同上，停在原地
 *     · `App.callFunction  uni.reLaunch({url})`            → RECV `{"errMsg":"reLaunch:ok"}`，
 *       页面**确实跳过去了**
 *   也就是说，同一台机器、同一次会话里，只有 `callUniMethod` 那条通道的 reLaunch 是坏的。
 *
 *   ⚠️ 这条通道**不是每次都坏**：p4-auth.e2e.js 里同一句 `program.reLaunch` 有回包
 *   `{"result":{"errMsg":"reLaunch:ok"}}`、页面也确实跳了（见 2026-10-06 的 p4 单跑日志）。
 *   所以它是**间歇性**的 —— 而间歇性的偶发失败正是最难查的那种，换掉比留着划算。
 *
 *   ⇒ 现在统一用 `program.evaluate`（底层是 `App.callFunction`，2026-10-03 实测稳定）
 *     在页面上下文里直接调 `uni.reLaunch`。
 *
 * 仍然保留「容忍不回包」：当目标页 mount 后**立刻再跳一次**时
 * （P4 的典型场景：未登录/已过期时进首页，首页 onMounted → fetchSessions() →
 * request() → expireAuthAndRedirect() → 又 reLaunch 到登录页），
 * 这一次调用的回包可能丢。所以：
 *   **只保证「发出去」，成败交给随后的 `waitForPage` 用「当前在哪一页」来判定** ——
 *   那个观测走的是 `App.getCurrentPage`，实测稳定。
 *
 * ⚠️ 别把这条推广成「automator 的调用都会丢回包」：2026-10-03 实测
 *   `Page.getElement` / `Page.getElements` / `App.callFunction` 在页面稳定后都会正常回包。
 */

const { withTimeout, sleep } = require('./waitFor');

/**
 * reLaunch 到指定路由，容忍响应丢失。
 * @param {string} route 带前导斜杠的路由，如 `/pages/login/index`
 * @returns {{replied: boolean}} replied=false 表示没等到回包（已知现象，不代表失败）
 */
async function reLaunch(program, route, { timeout = 8000 } = {}) {
  try {
    await withTimeout(
      program.evaluate((url) => uni.reLaunch({ url }), route),
      timeout,
      `reLaunch ${route}`
    );
    return { replied: true };
  } catch (e) {
    console.warn(
      `[nav] reLaunch ${route} 未回包（${(e && e.message) || e}）。\n` +
        '      已知现象：目标页 mount 后立刻又跳了一次，打断了这次回包；\n' +
        '      也可能是这次调用真的没执行。导航成败由随后的页面观测判定。'
    );
    return { replied: false };
  }
}

/**
 * 「跳到某一页并确认真的到了」—— 带重试。
 *
 * ⚠️ 2026-10-07 第三版。第二版漏掉了**「什么时候发」**，这里记下来：
 *
 *   第二版是「发 reLaunch → 轮询当前页最多 settleMs → 没到就再发」，
 *   逻辑上已经保证同一时刻只有一个导航在飞，但还是会**整条套件卡在
 *   `pages/etf-detail/index`**（实测 366 次轮询都停在那儿）。
 *
 *   2026-10-07 用探针（e2e/z-probe-nav.e2e.js，用完即删）定位到真正的条件：
 *   问题不在发几次，而在**发的时机** ——
 *
 *     · 复刻「搜索 → 点进详情页」之后**立刻**发 reLaunch：
 *       不发包回 `reLaunch:ok`，页面也不动；之后的第 2、第 3 次重发
 *       （+8s、+16s）**一样不动**；等到 +27s 再发，一下就过去了。
 *       ⇒ 一次过早的 reLaunch 不只是自己失败，还会**把这条通道堵住 ~20s**。
 *     · 同一个流程，进详情页后**先静置 3s** 再发：
 *       第 1 次就成功，页面 1.2s 内切走。探针里 3 个 arm（不轮询 / 300ms 紧轮询 /
 *       2000ms 慢轮询）**全部通过** —— 所以跟轮不轮询无关。
 *     · 从别的页进详情页（navigateTo 直连、页面不需要等接口）时，
 *       立刻发也能走 —— 说明要等的不是「详情页」本身，而是**这个页面还在初始化**。
 *
 *   详情页 `onLoad` 里 `load()` 会先 await `getEtfDetail` 再 await `getEtfKline`
 *   （src/pages/etf-detail/index.vue#L150-L192），落地那一刻它必然还在飞。
 *   「页面初始化期间发起的 reLaunch 会被丢掉，且堵住通道一段时间」是本机的实测规律。
 *
 *   ⇒ 第三版：**发之前先静置 `settleBefore`（默认 3000ms）**，让当前页把 onLoad 走完。
 *     失败一次就说明通道被堵，下次把静置时间拉到 `backoffMs`（默认 8000ms）再发。
 *
 * ⚠️ 这仍然是在**绕开**一个小程序/automator 层面的行为，不是在修它。静置时间是个
 *    经验值，不是原理值。如果哪天按页面类型要调这个数，说明前提变了，要重新测。
 *
 * ⚠️ `force` 是给「我已经在这一页了，但我需要它**重新挂载**」用的。
 *    默认 `force: false` 时，已经在目标页就直接返回、**不发 reLaunch**。
 *    这对「导航过去」是对的，但对「刷新这一页」是错的 ——
 *    自选页的数据是在 `onShow` 里拉的（watchlist/index.vue#L397-L405），
 *    不发 reLaunch 就不会 onShow，页面就一直是旧数据，
 *    断言读到的也是旧列表。P3-04 就踩过这个：前置在服务端加了两条自选，
 *    但页面没重新挂载，`#wl-follow-item` 还是 0 条。
 *
 * @param {string} route        带前导斜杠的路由
 * @param {string} expectedPath `currentPage().path` 形式（不带前导斜杠）
 * @param {boolean} force       true = 即使已经在目标页也重新 reLaunch 一次
 * @returns {Promise<object>} 落到目标页后的 page 对象
 */
async function gotoPage(
  program,
  route,
  expectedPath,
  { attempts = 3, settleBefore = 3000, settleMs = 6000, backoffMs = 8000, force = false } = {}
) {
  let lastPath = null;
  let quietMs = settleBefore;

  for (let i = 1; i <= attempts; i += 1) {
    // 先静置：当前页 onLoad 还没走完时发出去的 reLaunch 会被丢掉，还会堵住通道。
    await sleep(quietMs);
    let beforeId = null;
    try {
      const page = await program.currentPage();
      lastPath = page && page.path;
      beforeId = page && page.id;
      // 已经在目标页：默认收工（导航目的已达成）。force 时继续往下走，重新挂载。
      if (lastPath === expectedPath && !force) return page;
    } catch (e) {
      lastPath = `<err ${(e && e.message) || e}>`;
    }

    // force 且已经在目标页 —— 这时「path 已经是目标页」这个条件**在重新挂载前后都成立**，
    // 不能拿它判成败，否则会立刻返回那个马上就要被销毁的旧 page（拿到手就是 page destroyed）。
    // 改判「页面 id 变了」：Page 对象上有 id（@dcloudio/uni-automator 里 Page 的 `this.id = e.id`），
    // 重新挂载必然换一个 id。
    const mustChangeId = force && lastPath === expectedPath;

    // 一次只发这一个。**不要**在它外面套短超时 —— 见上面「第一版的自伤 bug」。
    const fire = program.evaluate((url) => uni.reLaunch({ url }), route).catch(() => null);

    const deadline = Date.now() + settleMs;
    while (Date.now() < deadline) {
      await sleep(300);
      try {
        const page = await program.currentPage();
        lastPath = page && page.path;
        if (lastPath === expectedPath && (!mustChangeId || page.id !== beforeId)) return page;
      } catch (e) {
        lastPath = `<err ${(e && e.message) || e}>`;
      }
    }

    console.warn(
      `[nav] gotoPage ${route} 第 ${i}/${attempts} 次没落到 ${expectedPath}（当前 ${lastPath}），` +
        `下次发送前多静置 ${backoffMs}ms`
    );
    quietMs = backoffMs;
    void fire;
  }
  throw new Error(`gotoPage ${route}：重试 ${attempts} 次仍未落到 ${expectedPath}（最后一次在 ${lastPath}）`);
}

module.exports = { reLaunch, gotoPage };
