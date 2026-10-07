// E2E 配置。文件名是项目自定的（官方默认叫 jest.config.js），
// 所以启动命令必须带 --config jest.e2e.config.js，三者配套：
//   配置文件 jest.e2e.config.js  ↔  用例 e2e/**/*.e2e.js  ↔  命令里的 --config
//
// 与官方模板的唯一实质差别：executablePath。
// uni-automator 源码把默认查找路径硬编码成 C 盘那个：
//   C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat
// 本机装在 D 盘，不显式指定会报 "Wechat web devTools not found"。
module.exports = {
  globalTeardown: '@dcloudio/uni-automator/dist/teardown.js',
  testEnvironment: '@dcloudio/uni-automator/dist/environment.js',
  testEnvironmentOptions: {
    compile: true,
    platform: 'mp-weixin',
    // ⚠️⚠️ 两个端口必须【不一样】，这是整套 E2E 能不能跑通的唯一关键。
    //
    // 顶层 port = uni-automator 自己的端口。两处用到它：
    //   1) dist 里注入的 wsEndpoint（编译时 --auto-port，小程序里的自动化 SDK 连它）
    //   2) 运行时 new ws.Server({port})   —— uni-automator 自己【监听】这个端口
    //   默认值 9520，见 uni-automator/dist/index.js 的 `t.port || 9520`。
    //
    // 子对象 port = 只传给微信开发者工具的 --auto-port。
    //   取的是【平台子对象】的 port，默认 9420，见
    //   uni-mp-weixin/lib/uni.automator.js 的 `e.port || t.devtools.defaultPort`
    //   （defaultPort: 9420）。开发者工具会自己去【监听】这个端口。
    //
    // 为什么必须错开：开发者工具的 auto 命令（require-cache 里 9d9d19a8… 那个模块）
    //   exports.auto = async o => {
    //     let {port:l} = o;
    //     if (isUndef(l)) throw Error("Port is not provided");
    //     if (await getPort(l) !== l) throw Error(`Port ${l} is in use`);  // ★
    //     await f(i, {autoPort:l, ...})   // ← 只有过了这关才会走 openProject
    //   }
    //   `f()` 里才调 openProject → 日志里的 "openProjectSimulatorDebuggerAndCompile start"。
    //   所以在 uni-automator 已经占住该端口的情况下，开发者工具会【静默拒绝打开项目】：
    //   日志里只有 gettestpublib，没有 openProject；小程序根本没跑起来，
    //   自动化 SDK 自然不会回连，program.currentPage() 就永久挂起（表现为整条用例超时）。
    //   实测：4 次用同一个端口(9420) 全部失败，4 次错开端口全部成功。
    port: 9520,
    // host = 注入到小程序里的 wsEndpoint 主机名。
    // uni-automator 不设时取本机【内网 IP】（index.js 里 `licia/ip(interface)`，只认
    // 10. / 172.16-31. / 192.168. 三段私有地址，否则退回 "localhost"）。
    // 实测本机会注入 ws://10.161.145.211:9520 —— 换个网络/换台机器这个 IP 就变了，
    // 用例会因为「连不上」而挂，属于不可复现的坑，所以这里钉死成 127.0.0.1。
    // 这个值会变成编译参数 --auto-host，走 compiler.compile({host}) → getSpawnArgs。
    host: '127.0.0.1',
    // 等「小程序里的自动化 SDK 回连」的总时长（毫秒）。
    // 不设时用 index.js 里的常量 zt = 240000，失败一次要干等 4 分钟；
    // 设短一点，失败时能立刻拿到 "Failed to connect to runtime" 而不是干等。
    // 注意它同时管【开发者工具建连】和【等小程序回连】两件事，见 dist/index.js：
    //   c.push(this.createRuntimeConnection(e,i)); c.push(this.puppet.createDevtools(p,r,i))
    // 实测冷启动开发者工具 + openProject 约 11s，60s 留足余量。
    timeout: 60000,
    'mp-weixin': {
      launch: true,
      // ⚠️ 必须是 quit，不能图快用 disconnect。
      // 原因：开发者工具把 --auto-port（9420）一直 LISTENING 着，进程不退这个端口就不放。
      // 下一轮 jest 再发 `auto --auto-port 9420`，会撞上它自己的监听 →
      // 开发者工具源码里 `if (await getPort(l) !== l) throw Error('Port ${l} is in use')` →
      // 直接抛错，走不到 openProject，项目不重开，小程序不跑，白等 60s 报
      // "Failed to connect to runtime"。
      // 实测：同一台机器连续两次 jest，teardown:'disconnect' 第二次必挂；
      //       teardown:'quit' 每次把工具关掉、端口释放，可以连续跑。
      // 代价是每轮冷启动约 10~15s（compile 之后的建连耗时，实测 5s 热 / 11s 冷）。
      teardown: 'quit',
      executablePath: 'D:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat',
      port: 9420
    }
  },
  // 首次要跑一次 uni 编译 + 冷启动开发者工具，给足时间
  testTimeout: 60000,
  testMatch: ['<rootDir>/e2e/**/*.e2e.js'],
  watchPathIgnorePatterns: ['/node_modules/', '/dist/', '/.git/']
}
