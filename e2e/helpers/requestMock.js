/**
 * 让**普通请求**（非流式）按规则「失败」或「返回指定结果」—— 给 P5 的异常分支用。
 *
 * 为什么要单独一个文件，而不是复用 `streamMock.js`：
 *   - `streamMock` 只接管 `enableChunked` 的请求，其余原样透传（它刻意如此，
 *     同一条用例里还要让会话列表、鉴权走真后端）；
 *   - 这里要接管的恰好是**普通 JSON 请求**（`/api/risk/profile`、`/api/risk/questionnaire`），
 *     而且需要两种动作：`fail`（网络层失败）和 `respond`（伪造一个 HTTP 响应）。
 *
 * 能力依据：`wx.request` 可以换掉、而且应用真的会走到换上来的函数 —— 这是 2026-10-10
 * 探针 Q1/Q2 的实测结论（见 `streamMock.js` 顶部），不是猜测。`uni.request` 是**调用时**
 * 才去取 `wx.request`（属性查找），所以对普通请求同样成立。
 *
 * ⚠️ 只按 `urlIncludes` 匹配，**没匹配上的请求必须原样透传给真 `wx.request`** ——
 * 否则「后端到底被没被调用」这件事就失去了意义，用例可能假绿。
 *
 * 规则写法：
 *   { urlIncludes: '/api/risk/profile', action: 'fail', errMsg: 'request:fail 模拟断网' }
 *   { urlIncludes: '/api/risk/profile', action: 'respond', statusCode: 200, data: {...} }
 */

/**
 * 装壳。返回 `'patched' | 'already'`。
 * `rules` 必须是纯可序列化对象（要过 `program.evaluate`）。
 */
async function installRequestMock(program, rules) {
  return program.evaluate((ruleList) => {
    if (wx.__e2eOrigRequestMock) return 'already';
    wx.__e2eOrigRequestMock = wx.request;
    wx.__e2eReqMockHits = [];
    wx.request = function (opts) {
      const o = opts || {};
      const url = String(o.url || '');
      for (let i = 0; i < ruleList.length; i += 1) {
        const rule = ruleList[i];
        if (rule.urlIncludes && url.indexOf(rule.urlIncludes) === -1) continue;
        wx.__e2eReqMockHits.push({
          url,
          method: o.method || 'GET',
          action: rule.action,
          statusCode: rule.statusCode || null,
        });
        // 异步回调：真实 `uni.request` 的 success/fail 也一定在后续任务里触发。
        // 同步回调会让「页面还在挂载」和「响应已到」的先后顺序与真机不同，
        // 容易造出真实环境不会出现的状态。
        setTimeout(function () {
          if (rule.action === 'fail') {
            const res = { errMsg: rule.errMsg || 'request:fail 模拟失败' };
            if (typeof o.fail === 'function') o.fail(res);
            if (typeof o.complete === 'function') o.complete(res);
            return;
          }
          const res = {
            statusCode: rule.statusCode || 200,
            data: rule.data === undefined ? {} : rule.data,
            header: {},
            errMsg: 'request:ok',
          };
          if (typeof o.success === 'function') o.success(res);
          if (typeof o.complete === 'function') o.complete(res);
        }, 20);
        // 应用一般不用返回值，但 `uni.request` 契约上会返回 task，给个能 abort 的假货。
        return { abort() {} };
      }
      return wx.__e2eOrigRequestMock.apply(this, arguments);
    };
    return 'patched';
  }, rules);
}

/** 还原 `wx.request`。不还原的话会残留到同文件后面的用例。 */
async function restoreRequestMock(program) {
  return program.evaluate(() => {
    if (!wx.__e2eOrigRequestMock) return 'nothing-to-restore';
    wx.request = wx.__e2eOrigRequestMock;
    delete wx.__e2eOrigRequestMock;
    return 'restored';
  });
}

/** `installRequestMock` + 无论成败都还原。**写用例请一律用这个**，别裸调。 */
async function withRequestMock(program, rules, fn) {
  await installRequestMock(program, rules);
  try {
    return await fn();
  } finally {
    try {
      await restoreRequestMock(program);
    } catch (e) {
      console.warn(`[requestMock] 还原 wx.request 失败：${(e && e.message) || e}`);
    }
  }
}

/** 被规则接管的请求（URL / 方法 / 动作），用来断言「这次请求确实发生了」。 */
async function readRequestMockHits(program) {
  return program.evaluate(() => wx.__e2eReqMockHits || []);
}

module.exports = {
  installRequestMock,
  restoreRequestMock,
  withRequestMock,
  readRequestMockHits,
};
