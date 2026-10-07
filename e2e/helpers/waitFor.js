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
 */
function waitForPage(program, expectedPath, { timeout = 5000, label } = {}) {
  return waitFor(
    async () => {
      const page = await program.currentPage()
      return page.path === expectedPath ? page : false
    },
    { timeout, label: label || `页面跳转到 ${expectedPath}` }
  )
}

/** 等当前页面变成「不是」指定路由（例如等它离开首页）。 */
function waitForLeavePage(program, unwantedPath, { timeout = 5000 } = {}) {
  return waitFor(
    async () => {
      const page = await program.currentPage()
      return page.path !== unwantedPath ? page : false
    },
    { timeout, label: `离开 ${unwantedPath}` }
  )
}

module.exports = { sleep, withTimeout, waitFor, waitForPage, waitForLeavePage }
