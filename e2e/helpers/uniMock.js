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
 *    → P4-03 那种「让 showModal 点确定」的需求，正是用这个：塞 `{confirm: true}`。
 *
 * 4. 黑名单只有 `/^on|^off/`（事件监听类不能 mock），业务用的 showToast/showModal 都能 mock。
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

/** 常用：让下一次 showModal 直接「点确定」。 */
function confirmNextModal(program, { confirm = true } = {}) {
  return mockUni(program, 'showModal', {
    confirm,
    cancel: !confirm,
    errMsg: confirm ? 'showModal:ok' : 'showModal:fail cancel',
  });
}

module.exports = { mockUni, restoreUni, withMockedUni, confirmNextModal };
