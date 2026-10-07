/**
 * E2E helpers 统一出口。
 *
 * 用 `const { waitForPage, seedValidSession } = require('./helpers')` 引。
 *
 * ⚠️ 这套 helper 最初是照着「本环境只能做页面级 + 存储级」写的 ——
 * **那个前提已在 2026-10-03 被证伪**：`page.$` / `page.$$` / `el.input()` /
 * `el.tap()` / `el.attribute()` / `program.evaluate` 在本机实测全部可用
 * （详情与实测证据见 `p4-auth.e2e.js` 文件头）。
 *
 * 所以这些 helper 现在的定位是「**顺手的观测手段**」，不再是「唯一能做的事」：
 *   - 页面级跳转（`waitForPage`）、Storage 读写（`storage.js`）、uni API 直调 —— 依然稳、依然推荐
 *   - 元素查询与交互 —— **也能用了**，新写用例该点按钮就点按钮，不必再绕成「断言跳转」
 *   - `mockUniMethod` 的「函数式」mock —— 仍然调不通（这条今天没推翻），
 *     要捕获参数只能用「结果式」mock
 *
 * 详见 ai-etf/docs/e2e/08-实测记录-2026-09-30.md。
 */

const waitFor = require('./waitFor');
const nav = require('./nav');
const storage = require('./storage');
const api = require('./api');
const uniMock = require('./uniMock');
const env = require('./env');

module.exports = {
  ...waitFor,
  ...nav,
  ...storage,
  ...api,
  ...uniMock,
  ...env,
};
