/**
 * uni API 的 mock / 还原。
 *
 * ⚠️⚠️ 先读这段，否则一定会踩坑：
 *
 * 1. 方法名是 **mockUniMethod / callUniMethod / restoreUniMethod**（U，不是 W）。
 *    `mockWxMethod` / `callWxMethod` 在 uni-automator 里**根本不存在** ——
 *    整个包的源码里搜不到这两个字符串。docs/e2e/03 与 07 里写的是错的。
 *
 * 2. **只能用「结果式」mock**：`mockUniMethod(method, result)`。
 *    「函数式」（第二个参数传函数，用来捕获参数）在本环境**用不了**：
 *    安装会成功，但一旦真的调用该 API 就抛 `(intermediate value) is not a function`。
 *    运行时那边的实现是 `new Function("return " + functionDeclaration)().apply(...)`，
 *    这条路上不去。**所以「捕获 toast 文案」做不到** —— 只能塞一个固定返回值进去。
 *
 * 3. 结果式 mock 的行为按 API 是不是同步的而不同（运行时 `isSyncApi` 判定）：
 *    - 同步 API（`*Sync` 结尾，如 getStorageSync）：mock 后直接返回那个 result
 *    - 异步 API（showToast / showModal 等）：按 `result.errMsg` 里有没有 `:fail`
 *      决定调 success 还是 fail，并在 4ms 后调 complete
 *
 * 4. 黑名单只有 `/^on|^off/`（事件监听类不能 mock），业务用的 showToast/showModal 都能 mock。
 *
 * ⚠️⚠️ 5. **`mockUniMethod('showModal', {confirm:true})` 只对「回调写法」管用，对 `await` 写法不管用。**
 *    （2026-10-10 实测；这条把第 3 条里"showModal 塞 {confirm:true} 就行"半句话订正了。）
 *
 *    判据很简单，**看应用那边怎么写的**：
 *
 *      ✅ 回调写法 —— mock 管用
 *         `uni.showModal({ ..., success: (res) => { if (res.confirm) ... } })`
 *         例：`src/pages/watchlist/index.vue#L548-L560`（移除自选）。
 *         此时 mock 会去调 `params.success(result)`，正好喂给应用的回调。
 *         P3-03 就是靠这个跑的，实测有效。
 *
 *      ❌ `await` 写法 —— mock **不管用**，必须改用本文件的 `stubNativeModal`
 *         `const result = await uni.showModal({ ... }); if (!result.confirm) return;`
 *         例：`src/pages/settings/index.vue#L202-L208`（退出登录）。
 *         这条 `await` 依赖 uni-app 的 **promisify 包装**，而 mock 的实现是
 *         `uni[method] = mockFn`（`@dcloudio/uni-mp-weixin/lib/automator.js`），
 *         把包装整个换成了裸函数 —— 没人去 resolve，`await` 拿到 undefined，
 *         `!result.confirm` 直接抛 TypeError，**看起来就是"点了没反应"**。
 *
 *    实测证据（`e2e/z-probe-modal.e2e.js`，用完即删）：
 *     · mock 装得上（不抛错）；装完从 evaluate 看 `wx.showModal` **一个字节没变**
 *       —— 因为 mock 改的是 uni-app 自己的 `uni`，而 evaluate 里 `uni === wx`（实测为 true）；
 *     · 从 evaluate 里带显式 `success` 调 `uni.showModal`，2 秒内回调一次都没进
 *       （evaluate 看到的是没被改过的 `wx.showModal`，它弹的是真弹窗）；
 *     · 装 mock 后点设置页 `#settings-logout`，4 个 auth key **一直没被清**
 *       （不清 = 没走过 `if (!result.confirm) return`）；
 *     · 改成 `stubNativeModal`（换 `wx.showModal`）之后，点完约 500ms 键就清空、页面跳到登录页。
 *
 *    → **建议**：要「让确认框自动点确定」，一律用 `stubNativeModal` / `withNativeModal`。
 *      它对两种写法都有效（内部调 `params.success(result)`），还能顺带把弹窗文案录下来。
 *      `mockUniMethod` 留给**不被 `await` 的通用 API**（如 showToast）。
 *      ⚠️ 换 `wx.*` 只对**通用 API** 有效；路由类（`wx.reLaunch` 等）在 uni-app 启动时
 *      就被缓存了，改不动（见 memory/e2e-automator-capability）。
 *
 * 实测证据见 ai-etf/docs/e2e/08-实测记录-2026-09-30.md 与 memory/e2e-automator-capability。
 */

/** 装一个结果式 mock。`result` 必须是可 JSON 序列化的值（会过 WebSocket）。 */
async function mockUni(program, method, result) {
  await program.mockUniMethod(method, result);
}

/** 还原。等价于运行时里 `mockUniMethod({method})` 的「无 result 无 functionDeclaration」分支。 */
async function restoreUni(program, method) {
  await program.restoreUniMethod(method);
}

/**
 * 在 mock 生效的窗口内跑 fn，无论成功失败都还原。
 *
 * 一定要用这个而不是裸调 mock：用例失败时若没还原，
 * mock 会残留到同文件后面的用例，制造出极难查的串扰。
 *
 * @param {Array<{method: string, result: any}>} mocks
 * @param {() => Promise<any>} fn
 */
async function withMockedUni(program, mocks, fn) {
  const installed = [];
  try {
    for (const { method, result } of mocks) {
      await mockUni(program, method, result);
      installed.push(method);
    }
    return await fn();
  } finally {
    for (const method of installed) {
      try {
        await restoreUni(program, method);
      } catch (e) {
        console.warn(`[uniMock] 还原 uni.${method} 失败：${(e && e.message) || e}`);
      }
    }
  }
}

/**
 * 常用：让下一次 showModal 直接「点确定」。
 *
 * ⚠️ **只对「回调写法」的调用点有效**（应用写 `success: (res) => ...`，如
 * `watchlist/index.vue#L548`）。应用若写的是 `await uni.showModal(...)`
 * （如 `settings/index.vue#L202`），这个 mock **不管用** —— 见上方第 5 条，
 * 那种情况请改用 `stubNativeModal` / `withNativeModal`。
 */
function confirmNextModal(program, { confirm = true } = {}) {
  return mockUni(program, 'showModal', {
    confirm,
    cancel: !confirm,
    errMsg: confirm ? 'showModal:ok' : 'showModal:fail cancel',
  });
}

// ───────────────────────── 直接改写 wx API（换掉 uni.app 那层）─────────────────────────

/**
 * 让应用里 `await uni.showModal(...)` 直接拿到 `{confirm}`。
 *
 * 做法是从 `program.evaluate` 里把 **`wx.showModal`** 换掉。
 * 为什么不用 `mockUniMethod` 见文件顶部第 5 条 —— 简单说：mock 改的是 uni-app 的 `uni`，
 * 而应用这条 `await` 依赖 uni-app 的 promisify 包装，包装一换就没人 resolve。
 *
 * evaluate 里的 `uni` 实测**就是 `wx`**（`uni === wx` 为 true），而应用调 `uni.showModal`
 * 最终会落到 `wx.showModal`（调用时属性查找）—— 所以换 `wx.showModal` 这条路通。
 * 2026-10-10 实测：换完之后点「退出登录」，约 500ms 内 4 个 auth key 被清空、页面跳到登录页。
 *
 * ⚠️ 只对**通用 API** 有效。路由类（`wx.reLaunch` / `wx.navigateTo` 等）在 uni-app
 *    启动时就被缓存了，改 `wx.*` 影响不到应用（见 memory/e2e-automator-capability）。
 *
 * ⚠️ 会把这次调用的参数记在 `wx.__e2eModalCalls` 里，供 `readNativeModalCalls` 读 ——
 *    这是本环境**唯一**能拿到 showModal 文案的办法（函数式 mock 用不了，
 *    真实的原生弹窗又不在页面上）。用完记得 `restoreNativeModal`。
 */
async function stubNativeModal(program, { confirm = true, content } = {}) {
  return program.evaluate((opts) => {
    if (wx.__e2eOriginShowModal) return 'already';
    wx.__e2eModalCalls = [];
    wx.__e2eOriginShowModal = wx.showModal;
    wx.showModal = function (params) {
      const p = params || {};
      // 只留可序列化字段：params 里还有 success/fail/complete 这些函数，过不去 WebSocket。
      // `editable` / `placeholderText` 是 P2-04 的断言对象（重命名弹窗）—— 「弹的是不是
      // 一个带输入框、预填了原名的窗口」只能这样验，因为原生输入框 automator 敲不了字。
      wx.__e2eModalCalls.push({
        title: p.title,
        content: p.content,
        confirmText: p.confirmText,
        cancelText: p.cancelText,
        editable: p.editable,
        placeholderText: p.placeholderText,
      });
      const res = { confirm: opts.confirm, cancel: !opts.confirm, errMsg: 'showModal:ok' };
      // 重命名读的是 `res.content`（SessionDrawer.vue#L215-L220），不给这一项的话
      // 应用会走「内容为空 → 什么也不做」，表现为「点了重命名没反应」。
      if (opts.content !== undefined) res.content = opts.content;
      if (p.success) p.success(res);
      if (p.complete) p.complete(res);
    };
    return 'patched';
  }, { confirm, content });
}

/** 还原 `wx.showModal`。 */
async function restoreNativeModal(program) {
  return program.evaluate(() => {
    if (!wx.__e2eOriginShowModal) return 'nothing-to-restore';
    wx.showModal = wx.__e2eOriginShowModal;
    delete wx.__e2eOriginShowModal;
    return 'restored';
  });
}

/** 读回 stubNativeModal 期间 showModal 被调用的参数（弹窗文案就在这里）。 */
async function readNativeModalCalls(program) {
  return program.evaluate(() => wx.__e2eModalCalls || []);
}

/**
 * `stubNativeModal` + 无论成败都还原。
 * 一定要用这个而不是裸调：失败时若没还原，补丁会残留到同文件后面的用例。
 */
async function withNativeModal(program, { confirm = true, content } = {}, fn) {
  await stubNativeModal(program, { confirm, content });
  try {
    return await fn();
  } finally {
    try {
      await restoreNativeModal(program);
    } catch (e) {
      console.warn(`[uniMock] 还原 wx.showModal 失败：${(e && e.message) || e}`);
    }
  }
}

// ───────────────────────── 通用「记录参数、行为不变」的 wx API 桩 ─────────────────────────

/**
 * 把 `wx[method]` 包一层**只记录、不改行为**的壳（转发给原函数）。
 *
 * 用途：**捕获 toast 文案**这类「不改变行为、只想看一眼参数」的场合。
 * 为什么不用 `mockUniMethod`：函数式 mock 在本环境调不通（见文件顶部第 2 条），
 * 结果式 mock 又只能塞固定返回值、看不到应用传了什么。
 *
 * 与 `stubNativeModal` 的区别：那个是**替换**（要让确认框自动点确定），
 * 这个是**旁观**（照常弹真 toast，只是顺手记一笔）。
 *
 * ⚠️ 记录时会把函数字段（success/complete…）丢掉 —— 过不了 WebSocket。
 * ⚠️ 与 `stubNativeModal` 一样，只对**通用 API** 有效，路由类（`wx.reLaunch` 等）
 *    在 uni-app 启动时已被缓存，包不到。**本函数在 P2 里是首次使用，属于新能力**：
 *    它能不能拦住 `wx.showToast`，以 P2-04 的实跑结果为准（跑通前别在别处引用）。
 *
 * @returns {'patched' | 'already'}
 */
async function stubNativeCall(program, method) {
  return program.evaluate((m) => {
    wx.__e2eNativeCalls = wx.__e2eNativeCalls || {};
    wx.__e2eNativeOrig = wx.__e2eNativeOrig || {};
    if (wx.__e2eNativeOrig[m]) return 'already';
    const orig = wx[m];
    wx.__e2eNativeOrig[m] = orig;
    wx.__e2eNativeCalls[m] = [];
    wx[m] = function (params) {
      const rec = {};
      try {
        const p = params || {};
        Object.keys(p).forEach((k) => {
          if (typeof p[k] !== 'function') rec[k] = p[k];
        });
      } catch (e) {
        /* 参数序列化失败不该影响被测行为，吞掉 */
      }
      wx.__e2eNativeCalls[m].push(rec);
      return orig.apply(this, arguments);
    };
    return 'patched';
  }, method);
}

async function restoreNativeCall(program, method) {
  return program.evaluate((m) => {
    const orig = wx.__e2eNativeOrig && wx.__e2eNativeOrig[m];
    if (!orig) return 'nothing-to-restore';
    wx[m] = orig;
    delete wx.__e2eNativeOrig[m];
    if (wx.__e2eNativeCalls) delete wx.__e2eNativeCalls[m];
    return 'restored';
  }, method);
}

/** 读回 `stubNativeCall` 期间该 API 被调用的所有参数。 */
async function readNativeCalls(program, method) {
  return program.evaluate((m) => (wx.__e2eNativeCalls && wx.__e2eNativeCalls[m]) || [], method);
}

/** `stubNativeCall` + 清空历史 + 无论成败都还原。**写用例请一律用这个**。 */
async function withNativeCall(program, method, fn) {
  await stubNativeCall(program, method);
  try {
    return await fn();
  } finally {
    try {
      await restoreNativeCall(program, method);
    } catch (e) {
      console.warn(`[uniMock] 还原 wx.${method} 失败：${(e && e.message) || e}`);
    }
  }
}

module.exports = {
  mockUni,
  restoreUni,
  withMockedUni,
  confirmNextModal,
  stubNativeModal,
  restoreNativeModal,
  readNativeModalCalls,
  withNativeModal,
  stubNativeCall,
  restoreNativeCall,
  readNativeCalls,
  withNativeCall,
};
