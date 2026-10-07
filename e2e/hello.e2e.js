// 第一条冒烟用例：只验证「jest 能驱动开发者工具、并读到页面」这条链路是通的。
//
// 刻意不碰任何业务逻辑（不登录、不调接口、不依赖后端），
// 因为这一步的目的不是测功能，而是回答一个问题：
//   Node 22 + jest 27 + uni-automator + 微信开发者工具 这套组合能不能跑起来。
//
// program 是 uni-automator 通过 testEnvironment 注入的全局对象，
// 不用 import、不用 launch()。

describe('E2E 冒烟', () => {
  it('能连上开发者工具并读到当前页面', async () => {
    const current = await program.currentPage()
    console.log('[e2e] currentPage =', JSON.stringify(current))
    expect(current && current.path).toBeTruthy()
  })
})
