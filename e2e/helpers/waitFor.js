/**
 * 轮询 / 超时工具。
 *
 * 关于 `page.waitFor(selector, ms)`：**它现在也能用了**。
 * 早期注释说「元素查询永久挂起，所以不能用它」—— 那个前提已在 2026-10-03 被证伪
 * （见 `p4-auth.e2e.js` 文件头）。当时看到的「挂起」，其实是拿到了一个站在页面
 * 跳转窗口期上的 page，开发者工具回 `page destroyed`。
 *
 * 这里仍然自己实现 waitFor，理由是**语义**而不是能力：本文件轮询的是
 * 「页面 path / 任意断言条件」，比只等一个选择器更贴合这批用例。
 * 新用例若要等元素出现，直接用 `page.waitFor(selector)` 也行。
 */

const DEFAULT_INTERVAL_MS = 200

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 给一个可能长时间不回包的 Promise 加超时。
 *
 * ⚠️ 早期注释写的是「元素查询、evaluate 都会挂起，所以这是必需品」——
 * 前半句已在 2026-10-03 被证伪（两者都可用，见 `p4-auth.e2e.js` 文件头）。
 * 但**这层保护仍然值得留着**，理由变成：
 *   ① 走到「页面正在跳转」的窗口期时，`Page.*` 会真的卡住不回包；
 *   ② 真正的故障（开发者工具没连上、端口被占）表现为**整体无回包**，
 *      有超时才能得到一句有意义的报错，而不是干等 jest 的 60s。
 *
 * 注意：超时只是让 await 返回，底层那个请求可能仍然挂着 —— 这是可以接受的，
 * 因为用例失败后 next 会重建整条链路。
 */
function withTimeout(promise, ms, label = '操作') {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`「${label}」挂起超过 ${ms}ms（无回包）`)), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

/**
 * 轮询直到 fn() 返回真值。失败时把最后一次的结果带进错误信息，便于定位。
 *
 * @param {() => any} fn  返回真值即算满足；可用 async
 * @param {{timeout?: number, interval?: number, label?: string}} opts
 */
async function waitFor(fn, { timeout = 5000, interval = DEFAULT_INTERVAL_MS, label = '条件' } = {}) {
  const deadline = Date.now() + timeout
  let last = '(从未求值)'
  for (;;) {
    try {
      const value = await withTimeout(Promise.resolve(fn()), Math.max(interval * 5, 2000), label)
      if (value) return value
      last = `假值：${JSON.stringify(value)}`
    } catch (e) {
      last = `抛错：${(e && e.message) || e}`
    }
    if (Date.now() >= deadline) {
      throw new Error(`等待「${label}」超时（${timeout}ms）。最后一次：${last}`)
    }
    await sleep(interval)
  }
}

/**
 * 等当前页面变成指定路由。
 *
 * 这是本环境**最主要的观测手段**：能点元素的时候可以断言 UI，
 * 不能点的时候，「跳没跳到登录页」就是最可靠的行为证据。
 * 依据：`expireAuthAndRedirect` 用 `uni.reLaunch('/pages/login/index')` 收尾
 * （application/src/utils/auth.ts#L184-L197）。
 *
 * ⚠️ **为什么不把 `false` 换成 `page.path`**：`waitFor` 是按**真值**判定的
 * （`waitFor.js:55` 的 `if (value) return value`）。非空字符串是真值，一旦这里
 * `return page.path`，等不到目标页也会立刻当成「等到了」返回 —— **所有这类用例
 * 会一起变成假绿**。所以判定必须继续返回 `page` / `false`，想留线索只能**另开一条路**：
 * 用 `lastPath` 把每次读到的真实路由记在闭包里，等 `waitFor` 抛错之后再贴进报错文案。
 * 下面的 `.catch` 只在**已经失败之后**执行，只改消息、不碰判定 ⇒ 不可能改变绿/红。
 */
function waitForPage(program, expectedPath, { timeout = 5000, label } = {}) {
  let lastPath = '(一次都没读到 page)'
  return waitFor(
    async () => {
      const page = await program.currentPage()
      lastPath = page ? page.path : '(currentPage 返回空)'
      return page.path === expectedPath ? page : false
    },
    { timeout, label: label || `页面跳转到 ${expectedPath}` }
  ).catch((e) => {
    e.message = `${e.message}。当时实际停在：${lastPath}`
    throw e
  })
}

/** 等当前页面变成「不是」指定路由（例如等它离开首页）。 */
function waitForLeavePage(program, unwantedPath, { timeout = 5000 } = {}) {
  let lastPath = '(一次都没读到 page)'
  return waitFor(
    async () => {
      const page = await program.currentPage()
      lastPath = page ? page.path : '(currentPage 返回空)'
      return page.path !== unwantedPath ? page : false
    },
    { timeout, label: `离开 ${unwantedPath}` }
  ).catch((e) => {
    e.message = `${e.message}。当时实际停在：${lastPath}`
    throw e
  })
}

/**
 * 等「应用自己的导航彻底停下来」：当前页连续 `stableMs` 毫秒没再变过才算数。
 *
 * 用途：**在把应用推到某个页面之前，先确保它上一次导航已经结束**。写 P4 那几条
 * 「引导应用自己去跳转」的用例时，紧接着上一条的尾巴发导航，会撞上应用内部还没收拾完的状态。
 *
 * 为什么用「页面稳定」而不是拍一个固定的毫秒数：不用把应用内部的常量抄进测试里。
 * 「页面持续 XX ms 没变」是个与实现无关的、保守的「它真的停下来了」信号。
 *
 * ⚠️ **`stableMs` 要用 2500，不要用 600**（2026-10-09 实测，`-t 'P4'` 共 12 次运行）：
 *
 * 挡的是 `src/utils/auth.ts` 里的 `redirecting` 旗标。它只在 `uni.reLaunch` 的 `complete`
 * 回调、（再等 300ms）之后才复位；**没复位时，应用的下一发踢人会被 `if (redirecting) return`
 * 静默吞掉** —— 存储清干净、不弹 toast、也不跳转，而且没有任何兜底重试。
 * 现象：「应用自己跳登录页」的那条用例（P4-02）跑完，紧接着的 P4-04 就停在首页。
 *
 *   - 600ms：P4-02 4/4 全红 → 变绿，**但 P4-04 仍红 4/8**；
 *   - 2500ms：P4-02、P4-04 共 8 次运行 **0 红**。
 *
 * ⚠️ 旗标名义上是 `complete` + 300ms ≈ 550ms 复位，**本环境实测要 1 秒以上**（多半是
 * automator 高频轮询 `currentPage()` 把应用逻辑线程挤住，把计时器拖慢了 —— **这一句是
 * 推断，没有实测**）。所以别按代码里的 550ms 去调这个参数。
 *
 * ⚠️ **治不了的是"导航被环境丢掉"**：等完之后仍偶发（4 轮 `-t 'P4'` 里约 1 轮）某条用例
 * 停在上一次的路由上 —— 可能是应用的导航被丢，也可能是测试自己发的导航被丢。
 * 那属于 README §5.3 登记的另一个现象，**加多少毫秒都没用**，别再往上调。
 *
 * @returns {Promise<string>} 稳定下来时停在的路由（超时也返回最后读到的那个，不抛错）
 */
async function waitForStablePage(program, { stableMs = 2500, timeout = 5000, interval = 150 } = {}) {
  const deadline = Date.now() + timeout
  let lastPath = ''
  let stableSince = Date.now()

  for (;;) {
    let path = lastPath
    try {
      const page = await withTimeout(program.currentPage(), Math.max(interval * 5, 2000), 'currentPage')
      path = page ? page.path : ''
    } catch (e) {
      // 读到一半页面又跳了 —— 这本身就说明「还没稳定」，保持上一次的值继续等
      path = lastPath
    }

    if (path !== lastPath) {
      lastPath = path
      stableSince = Date.now()
    } else if (Date.now() - stableSince >= stableMs) {
      return lastPath
    }

    if (Date.now() >= deadline) {
      console.warn(`[waitForStablePage] ${timeout}ms 内没等到稳定，最后一次读到：${lastPath}`)
      return lastPath
    }
    await sleep(interval)
  }
}

module.exports = { sleep, withTimeout, waitFor, waitForPage, waitForLeavePage, waitForStablePage }
