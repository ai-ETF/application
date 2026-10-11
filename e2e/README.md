# E2E 测试（微信小程序端）

用 `uni-automator` + `jest` 驱动**真实微信开发者工具**跑小程序，覆盖 P4 鉴权 / P3 行情自选 / P1 交易 / P2 AI 对话四条路径。

> **这套东西的完整规划、用例清单、为什么不测某些东西，都在 `ai-etf/docs/e2e/00–09`。**
> 本文件只讲**怎么跑、挂了怎么办、写新用例要守什么规矩**。
> 两份文档有冲突时以 `ai-etf/docs/e2e/` 为准（那份是真源）。

---

## 1. 一条命令

**必须在 Windows 侧跑**（不能在 WSL 里跑，原因见 §6.1）：

```powershell
# 全部用例
npm run test:e2e

# 只跑一个文件（推荐）
npm run test:e2e -- p1-trading
npm run test:e2e -- p4-auth
npm run test:e2e -- p2-chat
npm run test:e2e -- p5-register

# 只跑某几条用例（按用例名匹配）
npm run test:e2e -- -t 'P4-02'
```

> 💰 **`npm run test:e2e`（不带文件名）现在会连 P2 一起跑**，而 P2 是**真打大模型**的：
> 多花约 94 秒 + **真实的 token 费用**。日常改 P1/P3/P4 时请**按文件名单跑**。

> ⚠️ **P5 会往 Supabase 真写 2 个账号**（走 HTTP 的 + 走真实注册页 UI 的，`afterAll` 里注销）。
> 它要求后端指向**本地栈**（文件里有闸门，非 localhost 直接抛）。跑全量时也会带上它。

> ⚠️ **`-t` 匹配的是「完整用例名」，描述块的标题也算在内 —— 它会跨文件捞人。**
> 实例：`p3-market-watchlist.e2e.js:674` 的 `describe` 标题是
> `'P3-05 行情接口放行未登录（跨 P3/P4 关键负例）'`，**字面含 "P4"**。
> 所以 `-t 'P4'` 实际跑的是 **9 条**（P4 的 6 条 + P3-05 的 3 条），不是"只跑 P4"。
> 想只跑一个套件，**用文件名**（`npm run test:e2e -- p4-auth`），别用 `-t`。

`test:e2e` 实际做两件事：**先打 `node_modules` 补丁**（§2.5），再 `jest -i --config jest.e2e.config.js`。

单跑一遍 P1 约 **130–150 秒**（其中开发者工具冷启动 10–15 秒）；单跑 P2 约 **94 秒**。
2026-10-09 实测「P1+P3+P4」约 **225–250 秒**；加上 P2 再约 **+95 秒**。

### 1.1 另一套：不需要开发者工具的单元 / 集成测试

上面那套是**驱动真机**跑的（慢、要开开发者工具、要起后端）。纯逻辑那部分**不用这么重**：

```powershell
npm run test:unit      # 5 个文件 / 86 条，约 0.8 秒
```

- **不用开微信开发者工具、不用起后端、不用联网**，Windows 或 WSL 都能跑。
- 跑的是 `src/**/__tests__/**/*.spec.ts`：SSE 行解析、分块 UTF-8 解码、账号格式与本地登录态、
  请求模块的 401/放行/token 注入、两个 store 的纯动作与竞态保护。
- **两套互不干扰**：jest 只认 `e2e/**/*.e2e.js`，vitest 只认 `src` 下的 `.spec.ts`，
  匹配范围不重叠 —— `npm run test:unit` 不会误跑真机用例，反之亦然。
- 为什么要分开：同一个功能，"逻辑对不对"和"用户在界面上看得见对不对"是两个问题。
  前者用假 `uni` 几毫秒跑完，后者才需要真机。**判定优先级**见 `ai-etf/docs/e2e/02-核心路径与分层策略.md` §三。

> ⚠️ **跑 `test:unit` 时如果看到一行 `The CJS build of Vite's Node API is deprecated`，那是虚惊。**
> 它来自 vitest 的配置加载方式（本项目 `package.json` 没有 `"type": "module"`）。
> 配置文件名已经改成 `vitest.config.mts` 来消掉这行；万一又出现，它**不影响任何结果**，别去改业务代码。

> ⚠️ **跑出来的红，先别信。**
> P4 套件会**间歇性红**，而且**换着红**（这次 P4-02、下次 P4-04、再下次 P4-00）。
> 红色出现时先重跑一次取第二个样本，别拿单次结果去改断言或改 `src/`。详见 §6.6。

---

## 2. 跑之前必须满足的条件

一条不满足就会挂，而且**有些挂法看起来像用例写错了**。逐条对：

> 📄 **这张表是「出症状了查哪条」；「照着做」的版本在 [环境配置.md](环境配置.md)** ——
> 每一项配在哪、内容是什么、怎么验，都写在那份里。因为**其中有一项（2.9）仓库里根本没有，必须自己建**。

| # | 条件 | 不满足的症状 |
|---|---|---|
| 2.1 | 在 **Windows** 侧执行 | rollup 报错 / 找不到 CLI |
| 2.2 | 后端在 `localhost:8000` 跑着 | `连不上后端 ... ECONNRESET` |
| 2.3 | 后端**带了行情夹具**（见下） | 搜索返回 0 条，P3/P1 走不到详情页 |
| 2.4 | 本地 Supabase 栈在跑 | 登录/注册 401 或直接失败 |
| 2.5 | `node_modules` 补丁已打 | `spawn cli.bat EINVAL` |
| 2.6 | 开发者工具装在 `D:\Program Files (x86)\Tencent\微信web开发者工具\` 且已登录 | `Wechat web devTools not found` |
| 2.7 | 构建产物打的是**本地**后端 | `⛔ 构建产物打的是【非本地】后端，E2E 拒绝运行` |
| 2.8 | 只有跑 P2 才需要：后端能连上**模型服务**（密钥在后端的 `.env` 里） | bot 气泡渲染出兜底文案「抱歉，…」，或前端报流式请求失败 |
| 2.9 | `src/project.private.config.json` **已建**（⚠️ **仓库里没有这个文件，必须自己建**，内容照抄 [环境配置.md](环境配置.md) §1） | 项目**根本打不开**；报错是假的：`please make sure http port is open`（**跟端口无关**，是 appid 权限问题） |

### 2.2 / 2.3 起后端

```bash
# 在 ai-etf 仓库下（WSL 侧）
E2E_MARKET_FIXTURE="$PWD/docs/e2e/fixtures/market_snapshot.json" \
  poetry run uvicorn server.app:app --port 8000
```

⚠️ **`E2E_MARKET_FIXTURE` 不能省**。本机连不上东财行情 API（不是代码 bug），不带夹具时行情/自选相关断言拿到的是空数据。
启动日志里应出现 `哈希表构建完成，共 3 只ETF`（不带夹具是 0 只）。

⚠️ **uvicorn 没带 `--reload`** —— 改了后端代码必须**重启进程**才生效。

### 2.5 node_modules 补丁

```bash
npm run e2e:patch        # 打补丁（幂等）
npm run e2e:patch:check  # 只检查
```

改的是 `node_modules` 里两个文件、共 4 处，理由写在脚本头：[`e2e/patches/apply-node-modules-patches.js`](patches/apply-node-modules-patches.js)。
一句话：**Node ≥ 18.20.2 起 spawn `.bat` 不加 `shell: true` 会抛 EINVAL**（CVE-2024-27980 的加固），
而本机路径 `D:\C1\Have a try\...` 同时含**空格和中文**，补上 `shell: true` 后还得自己加引号 —— 所以这 4 处是一套，不能只打一半。

重装 `node_modules` 后补丁会丢，重跑一次 `npm run e2e:patch` 即可（`test:e2e` 会自动带上）。

### 2.7 数据安全闸门

`config/index.ts` 的 `API_BASE` **兜底值是生产地址**。忘配 `.env.development` 时，测试会真的去写生产库。
所以每条用例开跑前都会调 `assertLocalApiBase()`（[`helpers/env.js`](helpers/env.js)）：产物里的 `API_BASE` 不是 `localhost` / `127.0.0.1` / `[::1]` 就**直接抛错拒绝运行**。
看到那句 `⛔` 说明闸门起作用了 —— 去确认 `.env.development` 里的 `VITE_API_BASE`，然后**重新编译**。

---

## 3. 文件地图

```
e2e/
├── hello.e2e.js                      # 冒烟（1 条）：只验证「能驱动开发者工具并读到页面」，不碰业务
├── p4-auth.e2e.js                    # P4 鉴权失效 —— 6 条（含 P4-00 对照组），**0 条 skip**（2026-10-10 补全）
├── p3-market-watchlist.e2e.js        # P3 行情 + 自选 —— 5 组（P3-01~05）共 21 条，其中 1 条 skip
├── p1-trading.e2e.js                 # P1 交易核心 —— 6 组（P1-01~06）共 20 条，其中 2 条 skip
├── p2-chat.e2e.js                    # P2 AI 对话 —— 7 条，**0 条 skip**（真打 LLM，单轮约 94s，见 §5.10）
├── p5-register.e2e.js                # P5 注册 + 风险测评 —— 6 条，**0 条 skip**（⚠️ 每轮真写 2 个 Supabase 账号、afterAll 注销；单轮约 73s，见 §5.12）
├── helpers/
│   ├── index.js                      # 统一出口，用 require('./helpers') 引
│   ├── waitFor.js                    # sleep / withTimeout / waitFor / waitForPage / waitForLeavePage
│   ├── nav.js                        # reLaunch / gotoPage（带静置与重试，见 §5.3）
│   ├── storage.js                    # 本地存储读写 / 种一个有效会话 / 清 auth key
│   ├── api.js                        # 直连后端的 HTTP 客户端（交叉断言 + 造服务端状态；P2 的会话增删改查也在这里）
│   ├── env.js                        # 跑前环境自检（数据安全闸门在这里）
│   ├── uniMock.js                    # uni API 的「结果式」mock + 换掉任意原生 API（withNativeModal / withNativeCall，见 §5.7）
│   └── streamMock.js                 # 换掉 wx.request 自己造 SSE 流（见 §5.9，P2 用）
├── patches/apply-node-modules-patches.js
├── README.md                         # 本文件：怎么跑、怎么排查、写用例的规矩
└── 环境配置.md                        # 「照着做」的配置说明（含仓库里没有、必须自己建的那个文件）
```

> ⚠️ **「5 条」「6 条」在文档里有两种口径**，别对不上号：规划文档（`03`/`05`）说的「P4 5 条」「P3 5 条」指的是**用例编号的组数**（P4-01~05、P3-01~05）；
> 而 jest 报的是 **`it` 的条数**（P4 加了 P4-00 对照组 → 6；P3 每组下还有 ①~⑦ 子用例 → 21）。
> 所以「跑全量」时 `Tests:` 那一行的总数，不等于规划文档里各组数字的简单相加。
> P2 是个例外：**7 条就是 7 条**（P2-01~07 每个编号一条 `it`）。

配置：[`jest.e2e.config.js`](../jest.e2e.config.js)（仓库根目录）。

---

## 4. helpers 速查

| 想做什么 | 用什么 | 注意 |
|---|---|---|
| 等某个条件成立 | `waitFor(fn, {timeout, label})` | `fn` 返回假值就继续等；超时会带上 `label` 报错，**`label` 一定要写**，否则挂了你不知道在等什么 |
| 等跳到某页 | `waitForPage(program, path)` | `path` 是 `currentPage().path` 形式，**不带**前导斜杠、**不带** query |
| 跳页 | `gotoPage(program, route, expectedPath, {force})` | 见 §5.3。`force:true` = 已经在目标页也要**重新挂载** |
| 种一个有效会话 | `seedValidSession(program, {token, user})` | 需要登录态的用例在 `beforeAll` 里调 |
| 清掉登录态 | `clearAuthKeys(program)` | |
| 直接问后端要真值 | `requestJson(method, path, {token, body})` | **不抛 HTTP 错误**，把 `status` 交回调用方（「拿到 401」本身就是要断言的结果） |
| 注册一次性账号 | `registerAccount()` | 每轮新账号。交易类数值断言（初始 100000、持仓 0）复用账号**第二次必红** |
| 确认 `showModal` | `confirmNextModal(program, {confirm})` | ⚠️ **只对回调写法管用**；`await uni.showModal(...)` 那种要用 `withNativeModal`（见 §5.7） |
| 确认框 + 断言弹窗文案 | `withNativeModal(program, {confirm}, fn)` + `readNativeModalCalls(program)` | 换掉 `wx.showModal`，顺便把入参记下来 |
| 拦任意一个原生 API（不只是弹窗） | `withNativeCall(program, 'showToast', fn)` + `readNativeCalls(program, 'showToast')` | 通用版，`withNativeModal` 是它的特例。用来断言 toast —— 本仓库没有 toast 探针，只能这么抓（见 §5.10 表尾） |
| 造一条 SSE 流 | `withStreamMock(program, {urlIncludes}, fn)` | 见 §5.9。只拦 `enableChunked` 的请求，其余透传 |
| 喂分块 / 汉字切两半 | `waitChunkHandler` → `pushChunkSplitMidChar(program, text, {onHead})` → `finishStream` | `onHead` 是观察「半块」状态的唯一窗口 |
| 拿应用发出去的流式请求 | `readInterceptedSse(program)` | `{url, method, enableChunked, hasAuth, body}` |

---

## 5. 写新用例要守的规矩

这几条都是**踩过坑总结出来的**，不是风格偏好。

### 5.1 断言要能指到代码行

每条断言旁边写清楚依据（`file:line`）。这个项目的后端分支逻辑有多处反直觉（例如 §8 的 P1-04），凭直觉写的断言会给出**看起来对但其实是假的**结论。

### 5.2 元素 API 的两个坑

**`input()` / `tap()` 是 Element 的方法，不是 Page 的。** Page 只有 `$` / `$$`。
把 Page 当 Element 用会报 `page.input is not a function`。写 helper 时尤其容易犯：

```js
async function searchInWatchlist(keyword) {
  const input = await waitFor(async () => {
    const p = await program.currentPage()
    if (p.path !== WATCHLIST_PATH) return null
    return (await p.$('#wl-search-input')) || null   // ← 返回【元素】，不是 page
  })
  await input.input(keyword)                          // ← 才能这么调
}
```

**`el.text()` 拿到的是 `innerText`** —— 相邻 `<text>` 节点之间会被插入换行/空格。
跨节点做子串匹配会**静默失败**（拿到的是带空白的字符串，`includes` 就是 false）。
判断前先归一化：`.replace(/\s+/g, '')`。

### 5.3 导航：为什么 `gotoPage` 要「先静置 3 秒」

**本机实测规律：页面还在初始化时（`onLoad` 里的请求还没飞完）发起的 `uni.reLaunch`，会被丢掉，并且把这条通道堵住约 20 秒。**

- 复刻「搜索 → 点进详情页」后**立刻**发 reLaunch：不动；+8s 重发：不动；+16s 重发：不动；**+27s 才通**。
- 同一个流程，进详情页后**先静置 3s** 再发：第一次就成功。

所以 `gotoPage()` = 先静置 3s → 发 → 轮询 → 失败则把静置时间拉到 8s 重发（最多 3 次）。
**静置时间是经验值，不是原理值**；如果哪天要按页面类型调这个数，说明前提变了，要重测。

两条相关约束：
- **`program.reLaunch(route)` 不能用来跳页**（本机实测不发包、页面不动）。统一用 `program.evaluate((url) => uni.reLaunch({url}), route)`。`nav.js` 已经封好了。
- 需要**刷新当前页**时必须传 `force: true`。默认 `force:false` 时「已经在目标页就直接返回、不发 reLaunch」—— 对「导航过去」是对的，对「重新拉数据」是错的（很多页在 `onShow` 里拉数据，不发就不会触发），断言会读到**旧数据**。

### 5.4 负例优先断言页内文案，不要抓 toast

申购页 / 赎回页的错误提示渲染在**页面里**（`<text v-if="message" class="message">`），不是 toast。
后端 400 的 `detail` 经 `request.ts` `reject(new Error(detail))` → 页面 `catch` → **原文照搬**写进 `.message`。

⇒ 这类负例直接断言**精确文案**，不需要 toast 探针。

### 5.5 别信下单接口的返回体，要以后端读回来的为准

实测过：只改「写库」那句、不改「返回体」那句时，**响应说冻结了 1000、库里是 0**。
所以交叉断言一律用 `GET /api/portfolio/account` 这类读接口取真值，不要用 `apply-purchase` 的返回字段。

### 5.6 `SKIP` 不等于 `PASS`

`skip` 的意思是「这条用例**这次没跑**」，**不是「它通过了」**。看报告时这两者必须分开读，否则一个 `18 passed / 2 skipped` 很容易被当成「20 条都对」。

现在仓库里的 skip 一共 **3 条**，**没有一条是「时间窗口没到」**（P1 两条：P1-01③ 属 P2 范围、P1-04 见 §8；P3 一条：⑥-bis 用合成的 `touchstart/touchmove/touchend` 复刻真实左滑手势，automator 做不到），
—— 这是刻意的：P1 路径已经做到**零时钟依赖**，任何时间都能跑。
（P2 / P4 两个套件**零 skip**。）

> 将来 P2（AI 对话）的 skip 会是另一回事：**LLM 有成本、非确定性、单条 ≥130 秒**。
> 那种 skip 同样**不能当 PASS 算**，交接时要把理由写清楚。
>
> **2026-10-10 落地时并没有用 skip**：P2 七条全都真跑（`7 passed / 7 total`），
> 只是**不进常规 CI**（成本 + 非确定性），靠「挑答得快的问句」把单轮压到 94 秒（见 §5.10）。

### 5.7 弹窗：`await uni.showModal()` 这种写法，`mockUniMethod` 拦不住

`mockUniMethod('showModal', {confirm:true})`（也就是 `confirmNextModal`）**只对回调写法管用**：
调用方写了 `uni.showModal({ success(res){...} })`，替换才有机会被调到。

但本仓库的页面用的是 `await uni.showModal(...)`（Promise 写法）。这种情况下替换**静默失效**：
日志上看是「按钮点了，但什么也没发生」——`tap()` 不报错，弹窗判断也没往下走，很容易被误读成「产品坏了」。

**处置**：从 `evaluate` 里直接换掉 `wx.showModal`，即 `helpers/withNativeModal(program, {confirm}, fn)`，
要断言弹窗文案时再配 `readNativeModalCalls(program)`。同一个道理见 §5.9：**能不能换要逐个 API 试**。

### 5.8 组件里的 id，在页面作用域下抓不到

`page.$('#chat-input')` → `no such element`。不是因为没这个 id，而是**它在子组件内部**，页面作用域看不见。

**处置**：先拿到组件元素，再在它下面找：

```js
const comp = await page.$('chat-input-area')      // 组件名即选择器（本机实测可用）
const inputEl = await comp.$('#chat-input')       // 这时才找得到
```

`application` 侧实测（2026-10-10）：`#chat-input` / `#chat-send` 在页面作用域下都是 `false`，
换到 `chat-input-area` 组件作用域下**都是 `true`**。

补测（2026-10-10，P2 落地时）另外两个 id 同理，**都在组件里**：

| id | 在谁里面 | 正确写法 |
|---|---|---|
| `#drawer-toggle` | `chat-top-bar` | `(await page.$('chat-top-bar')).$('#drawer-toggle')` |
| `#chat-msg-list` | 消息列表子组件 | 先锚定组件元素再 `.$()` |

**反过来也有一条**：**class 选择器能穿过组件边界**。
`page.$$('.session-item')` / `'.message-wrapper'` / `'.session-action-btn'` 在页面作用域下**抓得到**，
不需要先锚定组件。所以别把「id 抓不到」推广成「组件里的东西全抓不到」——
**id 卡在组件作用域，class 不卡**。

### 5.9 换掉 `wx.request`，自己造一条 SSE 流（2026-10-10 实测可行）

**背景**：P2（AI 对话）走的是 SSE 流式返回。原来以为「E2E 层没法旁观流式响应」，只能靠真后端慢慢跑。
2026-10-10 探针证明：**`wx.request` 在 `evaluate` 里可以换掉，而且应用自己的请求真的会走替换后的那个。**

这跟路由 API 的结论**正好相反** —— `uni.reLaunch` / `wx.reLaunch` 换不掉（uni-app 启动时就把引用缓存住了），
`wx.request` 换得掉（`uni.request` 是**调用时**才去取 `wx.request`）。
⇒ 结论不是「`wx.*` 都能换」也不是「都不能换」，而是**每个 API 各自试一遍**。

**做法**：已经封成 [`helpers/streamMock.js`](helpers/streamMock.js)，别再抄一遍。典型写法：

```js
await helpers.withStreamMock(program, { urlIncludes: '/api/secure-chat' }, async () => {
  // ...点发送键（走真实 UI；别去调 vm 里的方法 —— 实测 vm 上没有 handleSend）
  await helpers.waitChunkHandler(program, { timeout: 10000 })   // 等应用把 onChunkReceived 注册上

  let midway = null
  await helpers.pushChunkSplitMidChar(program, 'data: {"type":"token","content":"你好"}\n\n', {
    onHead: async () => { midway = await readChatMemory() },     // ← 半个字符时的窗口
  })

  await helpers.finishStream(program)                            // 调 success/complete，假装正常结束
})
```

几个**必须知道的点**：

- **喂字节前必须等 `waitChunkHandler`**。发送键点下去之后请求才飞出去、回调才注册得上；
  抢在前面喂就是喂给 `null`，**静默丢**，表现为「气泡一直是空的」。
- **`onHead` 是唯一能观察「半块」状态的窗口**。不加它，你所说的「中途」其实是两块都喂完的样子
  （自己踩过：日志里「半块时气泡」印出来已经是 `你好`）。
- `onChunkReceived` 给的是 `{ data: ArrayBuffer }`，要自己转 UTF-8（小程序环境没有 `TextEncoder`），
  helper 里已经手写好了。
- **关键验证点**：故意在多字节汉字的**中间**切开，分两块喂。半个字符时**不该渲染出内容**，
  喂完后渲染出的文案必须**没有乱码字符 `�`** —— 这才说明应用自己的分块解码器（`createUtf8StreamDecoder`）是对的。
  实测：`onHead` 时气泡是 `""`，喂完后是 `你好`。
- 壳只拦 `enableChunked` 的请求，**其余透传**——同一个用例里「会话列表拉回来没有」这类断言还得靠真后端。

**成本**：单条用例约 35 秒（2026-10-10 实测 30.8s / 31.2s）。

### 5.10 真实 LLM 的用例：**按「答得快不快」挑问句，不是按「问句长不长」**

P2 有**三条**用例要真打 LLM（P2-01 / P2-02 / P2-03）。2026-10-10 踩了一整天的坑，最后定位到**服务方行为**（详见
`ai-etf/docs/e2e/00-背景与已知问题.md` 的 **D-07**）：模型生成时间一长，流会**整条空着返回** ——
HTTP 是 `200 OK`，SSE 只发一个 `done`、**一个字都没有**，后端把这条空答案**当成功存库**，
前端渲染出兜底文案「抱歉，…」。表现是「气泡里没有回答」，**但应用和开发者工具都没有问题**。

实测数据（同一台机器、同一份代码，连跑几分钟）：

| 问句 | 帧数 | 字数 | 耗时 |
|---|---|---|---|
| `为什么要分散投资？` | 416 | 742 | 9.9s |
| `ETF、场外基金、LOF 这三种基金分别在哪个市场交易？`（28 字） | 216 | 395 | 6.5s |
| `再解释一下` | 85 | 138 | 2.3s |
| `介绍一下ETF和股票的区别` | 605 | 1024 | 20.9s（贴边） |
| `ETF 和场外基金到底有什么区别？请详细讲讲` | **0** | **0** | 21.5–23.0s（连跑 3 次全空） |

🔴 **规矩**：要跑真实 LLM 的用例，必须挑**后端答得快（≤10 秒答完）**的问句。
**问句本身多长不是判断标准** —— 上面 28 字的比 8 字的还快。

**为什么不能靠「重试」绕**：空流是**服务方**给的，重试大概率还是空，只会把单轮时间翻倍。

**这条踩过的坑要留档**：曾经以为是「应用进程里第一条 `enableChunked` 请求丢正文」，
在 `beforeAll` 里加了「预热」请求。四组测量（8 秒后有没有迟到帧、挂载后 8 秒才发、
重启开发者工具、Windows 侧 curl 直连）**全都否掉了这个理论**，
最后靠 `GET /api/secure-chat/.../messages` 读到 `content` 长度 0 才定性。
**别再往应用里加预热**。

**另外**：`抱歉，` 这个前缀只能当**服务方表现**读，**不要拿它当应用缺陷的断言**
（P2-02 / P2-03 里改成 `console.warn` 就是这个原因）。

### 5.11 点底部 Tab 要**按文字**点，别按 `.tab-item` 的下标

**2026-10-10 实测**：在「自选」页上 `$$('.tab-item')[0]` 点下去**没切页**，
用例最后卡在 `pages/watchlist/index` 等超时。

原因：**「自选」页自己也有一排 `.tab-item`**（[src/pages/watchlist/index.vue:27-37](src/pages/watchlist/index.vue#L27-L37) 的板块切换），
`$$()` 从页面作用域往回捞，先捞到的是**页面自己的**那一排，不是底部导航条。

**处置**：`.tab-label` 只存在于 `TabBar.vue`（实测 4 处），
所以按**文字**找、找到哪个点哪个：

```js
async function tapTabBar(page, label) {
  const items = await page.$$('.tab-item')
  const found = []
  for (const item of items) {
    const textEl = await item.$('.tab-label')
    if (!textEl) continue                       // 页内自己的 tab 没有 .tab-label
    const text = (await textEl.text()).trim()
    found.push(text)
    if (text === label) { await item.tap(); return }
  }
  // 找不到时把「这一页上到底有哪些」打出来，比 `no such element` 好排查
  throw new Error(`底部导航里没有「${label}」这个 Tab。这一页上找到的底部 Tab 是：[${found.join(', ')}]`)
}
```

**通用教训**：**同一个 class 名在页面里出现两次，`$$()` 的下标就不稳**。
凡是「按位置取元素」的写法，都要先确认这个选择器**只在一处生效**；
**能用文字/id 定位就别用序号**。

### 5.12 `navigateTo` 压上去的页面，短时间内**跳不走**（2026-10-11 实测；真机未验）

**症状**：一个页面提交成功后该跳首页，结果**纹丝不动**，等多久都不跳。
看着像业务逻辑坏了，其实**业务是好的，是导航被吞了**。

**定性实验**（三只一次性探针，验完已删；对照表见 `ai-etf/docs/e2e/00-背景与已知问题.md` **D-08**）：
**同一个注册页**，只是「怎么进来的」不同 ——

| 页面怎么进来的 | 从这个页面发什么 | 结果 |
|---|---|---|
| `uni.reLaunch` 深链打开 | 点提交，应用自己 `reLaunch('/pages/index/index')` | 2 秒到首页 ✅（`auth_token` 长度 926，注册真的成功了）|
| 登录页点「还没有账户？注册」（内部是 `uni.navigateTo`）| 同上 | **两臂都显示「注册成功」toast**，但 12 秒 24 次轮询全停在注册页 ❌ |
| `uni.reLaunch` 进 | **测试侧**发 `uni.reLaunch(...)`（对照组）| 走得掉 ✅ |
| 点链接进 | **测试侧**发同一句 `uni.reLaunch(...)` | 8 秒不动 ❌ |
| 点链接进 | **测试侧**发 `uni.navigateBack()` | 8 秒不动 ❌ |

两个关键点：① 连**测试侧**发的跳转都进不去 ⇒ **不是应用那几行代码的问题**；
② 探针 2 两臂都拿到了「注册成功」toast ⇒ 前端确实进了成功分支、账号也建出来了 ⇒ **别把它当成注册失败去查**。
③ 通道被堵的时间**不止 8 秒**：为了重新进页面而发的 `gotoPage('/pages/login/index')` 重试 3 次、
累计约 **40 秒**仍没跳出去（这一臂因此没测成）。

**处置（只绕，不改 `src/` 里别人写的代码）**：

1. **进场一律 `helpers.gotoPage`** —— 它走 `reLaunch`，属于「正常」的那一类状态。
2. **要离开一个 `navigateTo` 进来的页面时，也用 `gotoPage` 收敛**（它自带重试），不要「点一下然后干等」。
3. ⚠️ **刷新同一页时 `gotoPage` 要加 `force: true`**：默认的 `gotoPage` 看到「已经在目标页」就
   直接 `return page`、**不重新挂载**（[helpers/nav.js:121](helpers/nav.js#L121)），拿到的是**旧 page 对象、旧页面状态**。
   P5-01 负例② 第二轮就红在这上面：上一条负例留下的 `.error-box` 被当成了这一条的。
   `force: true` 会重新 `reLaunch`，靠 **`page.id` 变了**判定「真的重开了」。

**⚠️ 2026-10-11 补：范围比原先写的小 —— 只在「automator 驱动」这条路上出现。**

用户在同一台模拟器、同一个开发者工具版本上**手动点**同样几项操作（登录页→「我的」、注册→首页、
**测评页返回箭头→「我的」**）**全部正常**；另确认**注册页本来就没有左上角返回箭头**
（不是缺陷，退出口是页面底部的「已有账户？登录」）。

⭐ 其中「测评页返回箭头」这一项最有说服力：探针里最刺眼的一条是**测试侧直接发 `uni.navigateBack()` 都进不去**
（D3，8 秒原地不动），而那个箭头实现的就是这一句（[risk-assessment/index.vue:468](src/pages/risk-assessment/index.vue#L468)）。
现在人工点同一个箭头**一次就退回去了** —— 同一个页面、同一行代码、同一个模拟器，**唯一变量是「谁在驱动」**。
⇒ 这不是「模拟器坏了」，也不是应用坏了，是**我们的驱动方式**的局限。
**真机上是不是也这样：仍未验证**（模拟器 ≠ 真机）。验证办法：真机点一遍「登录页 → 注册 → 提交」。
**在真机定性之前不要改业务代码**（按约定，缺陷只登记不顺手修）。

**由此多出一条能补的用例**：既然堵的是「从这种页面往**外**跳」，那**「点链接进注册页」这一步本来是通的**
（探针 2 和对照组都成功进了页面才卡住）⇒ 另立 **P5-04**，只验「进得去」：点完、`waitForPage` 到注册页、
再断言注册页自己的两个输入框渲染出来了，不提交、不往外跳。**「测评页返回箭头」仍然补不了** —— 它本身就是往外跳那一步。
⚠️ **P5-04 必须留在 `p5-register.e2e.js` 最后一条**：它是全文件唯一一个「点一下」把页面压进栈的用例，
排它后面的用例会被自己的 `gotoPage` 噎住。

---

## 6. 常见故障 → 处置

### 6.1 `Failed to connect to runtime` / `Wechat web devTools not found`

| 症状 | 原因 | 处置 |
|---|---|---|
| `Wechat web devTools not found` | `executablePath` 与实际安装位置不符 | 改 [`jest.e2e.config.js`](../jest.e2e.config.js) 的 `executablePath` |
| 日志只有 `gettestpublib`、**没有** `openProject`，然后白等 60s | **端口自撞** | 见下 |
| `Failed to launch Wechat web devTools , please make sure http port is open` | **上一轮残留的开发者工具进程还占着 9420** | 见下面第二段 |
| 从 WSL 里跑，报 rollup 错 | `node_modules` 是 Windows 侧装的 | 到 Windows 侧跑 |

**端口自撞**是这套环境最阴的坑：`jest.e2e.config.js` 里有两个端口，**必须不一样**。

- 顶层 `port: 9520` —— uni-automator 自己**监听**它。
- `'mp-weixin'.port: 9420` —— 只传给微信开发者工具的 `--auto-port`，由**开发者工具**监听。

开发者工具的 `auto` 命令里有一句 `if (await getPort(l) !== l) throw Error('Port ... is in use')`，
**只有过了这关才会走 `openProject`**。所以两个端口撞上时，开发者工具会**静默拒绝打开项目**：
小程序根本没跑起来 → 自动化 SDK 不回连 → `program.currentPage()` 永久挂起（表现为整条用例超时）。
实测：同端口 4 次全挂，错开 4 次全过。

同一个原因还决定了 `teardown` **必须是 `quit`、不能用 `disconnect`**：开发者工具把 9420 一直 LISTENING 着，进程不退端口不放，下一轮就撞自己。`quit` 的代价是每轮多 10–15 秒冷启动。

判断成功的唯一标准：日志里出现 **`automator:runtime connected`**。

**残留实例占着 9420**（同一个家族，但触发方式不同，2026-10-11 实测）：
`teardown: 'quit'` 只管得住**它自己启动的那一轮**。如果开发者工具是**你手动开的、或上一轮没退干净**，它会一直 LISTENING 在 9420 上，
新的一轮起不来，而报的偏偏是那句**极具误导性**的 `please make sure http port is open`。
实测：留着旧实例时一整轮 **28 秒即挂、0 条用例跑到**（`Test suite failed to run`）；`Stop-Process -Force` 杀掉之后立刻重跑，
`automator:runtime connected` → **7 passed / 7 total**。
处置：

```powershell
Get-Process wechatdevtools -ErrorAction SilentlyContinue | Stop-Process -Force
```

⚠️ **这句报错跟"端口没开"没关系，别去翻防火墙、也别去点开发者工具的设置。** 另有历史记录显示同一个字符串也可能与 appid 权限有关，
所以它属于「一句话对应多种成因」的那类报错 —— **先看有没有残留进程，再看别的。**

### 6.2 `连不上后端 ... ECONNRESET`

**先重跑一次，别去改断言。**

实测：后端日志**没有任何 Traceback**、`/docs` 返回 200，且同一轮里 `register` 那步是 **200 成功的**，是紧接着的请求被 TCP reset。
判为 **WSL2 端口转发的瞬时抖动**（1/2 次中标），重跑即绿。

危害在于它**会伪装成「用例不稳定」**。见到 `ECONNRESET` / `连不上后端`，先排除这一条。

### 6.3 `currentPage()` 挂起 / `page destroyed`

`program.currentPage()` 可能交回一个**正处在页面跳转窗口期**上的 page（典型场景：应用启动时 `index → login` 的自动跳转）。
此时开发者工具回 `{"error":{"message":"page destroyed"}}` —— 这是**开发者工具侧**的报错，不是 uni-automator 缺能力。

**处置：取 page 之前先等页面稳定**，别在跳转瞬间去拿。

### 6.4 断言拿到的是空数据

九成是后端**没带 `E2E_MARKET_FIXTURE`**（§2.3）。
另外 K 线有 **1 天文件缓存**（`/tmp/etf_kline_cache/`），**改了快照要 `rm -rf` 它**，否则拿到的还是旧值。

### 6.5 改了 `src/` 但断言行为没变

缓存没清。清掉 `dist/dev/mp-weixin`（以及在开发者工具里清一下缓存）再跑。

### 6.6 P4 套件不稳定 —— 换着红，不是产品坏了（2026-10-09 已定位）

**先说最有用的一条：这条报错现在会告诉你应用当时停在哪一页。**
`waitForPage` 超时是这么报的：

```
等待「401 后应被踢到登录页」超时（8000ms）。最后一次：假值：false。当时实际停在：pages/index/index
```

最后那截 `当时实际停在：xxx` 是 **2026-10-09 新加的**（改的是 `helpers/waitFor.js` 里
`waitForPage` / `waitForLeavePage`：判定照旧，只在超时后把闭包里记下的真实路由贴进报错）。
在这之前它只会说「假值：false」，等于什么都没说 —— 加这一行就是整个定位过程的转折点。

**报错里的「当时实际停在」把问题劈成了两半**：

| 表征 | 停在哪 | 含义 |
|---|---|---|
| **甲：该跳没跳** | `pages/index/index` | 应用**进了首页**，但「失效了就该跳登录页」这件事没发生 |
| **乙：跳没生效** | `pages/login/index` | 导航发出了，但页面没动，还停在上一次的位置 |

⚠️ **甲还分两种**，只有靠探针（见文末「方法学教训」）才分得开，而且两种的修法完全不同：

- **甲-a：旗标把它吞了** —— 应用**没弹 toast**。真因见下，**已定位、已缓解**。
- **甲-b：导航被环境丢了** —— 应用**弹了 toast**（说明它确实决定了要跳），但页面没动。
  属于 §5.3 那一族，**没定位**。

**甲-a 的真因（2026-10-09 用有效探针实测确认）**

`src/utils/auth.ts:184-186` 的 `expireAuthAndRedirect()` 里，`clearAuthSession()` 写在
`if (redirecting) return;` **之前**：

```js
export function expireAuthAndRedirect(message = ...) {
  clearAuthSession();            // ← 先清存储（探针看得见）
  if (redirecting) return;       // ← 旗标没复位就在这里返回：不弹 toast、也不跳转
  redirecting = true;
  uni.showToast({ ... });        // ← 探针看得见
  setTimeout(() => uni.reLaunch({ url: '/pages/login/index', ... }), 250);
}
```

`redirecting` 是模块级变量，只在 `uni.reLaunch` 的 `complete` 回调、（再等 300ms）之后复位。
完整链条：**上一条用例末尾是应用自己跳登录页 → 旗标置 `true` → 紧接着的用例把应用推进首页
→ 首页 `onMounted → fetchSessions() → request()` 立刻判「未登录」→ 进 `expireAuthAndRedirect()`
→ 存储被清干净 → 撞上 `:186` 直接 return。** 于是留下「存储清空 + 停在首页 + 没弹 toast」这个组合。

三条实验证据：

1. **判据**：探针记录里**删了 6 个 key、却没有 toast** ⇒ 旗标是 `true`。
   （删 key 在判断之前、toast 在之后，所以这个组合唯一对应「被吞」。P4-04 在 `-t 'P4'` 里
   三次全量跑全部命中。）
2. **是上一条留下的状态**：`-t 'P4-04'` **单独跑是绿的**（探针里有 toast）；紧跟 `P4-02`
   后面跑就红 ⇒ 不是 P4-04 自己有问题。
3. **旗标会复位，只是慢**：失败后静置 2 秒再推一次，toast 出现、跳转成功。而且重试时
   探针补丁**依然生效**（它照样记录了测试自己的 `reLaunch`）⇒ JS 上下文没换 ⇒ 是真的
   模块变量复位了，不是「重新加载把变量重置了」。

⇒ 旗标名义上 `complete` + 300ms ≈ **550ms** 复位，**本环境实测要 1 秒以上**（600ms 的等待
不够、2500ms 才稳）。多半是 automator 高频轮询 `currentPage()` 把应用逻辑线程挤住、把计时器
拖慢了 —— ⚠️ **这句是推断，没有实测**。

**处置**：

1. **重跑**。别拿单次结果下结论，更别去改断言。
2. 看报错最后那句 `当时实际停在：`。**甲**还是**乙**，处理方向完全不同。
3. ⚠️ **不要**因为这个红去改 `p4-auth.e2e.js` 的断言，更不要改 `src/`。
4. 测试侧的正式修法：**发导航之前先 `waitForStablePage(program, { stableMs: 2500 })`**
   （P4-00 / P4-02 / P4-04 三处都加了）。⚠️ **别把 2500 调小** —— 600ms 只让 P4-02 变绿，
   P4-04 照样红 4/8。

**修好之后还剩什么（诚实版）**

| 阶段 | `-t 'P4'` 的结果 |
|---|---|
| 改之前 | P4-02 **4/4 全红**，且整套换着红 |
| 只加 600ms | P4-02 8 次里 7 绿；**P4-04 仍红 4/8**；P4-00 红了 2/8 |
| 加到 2500ms（含 P4-00）共 8 轮 | **6 轮全绿**；2 轮各红 1 条，且**位置随机**（一次 P4-00 = 乙，一次 P4-01 = 甲-b） |
| 再连跑 3 次收尾确认（2026-10-09 23:50） | **3 轮全绿**（每轮都是 `Tests: 7 passed, 41 skipped, 48 total`，耗时 50–51s） |

⚠️ **剩下的那个红是「导航被环境丢掉」**（测试发的、应用发的都会中招），属于 §5.3 那族，
累计 11 轮里撞上 2 轮（约 5 轮 1 次）。**加多少毫秒都堵不住，别再往上调等待时长。**

**登记、但不修的产品侧问题**（`src/` 是别人写的，按「发现缺陷只登记不顺手修」只登记）：

1. **清存储写在旗标判断之前** —— 即使这次跳转被吞，**用户的登录态也已经被清掉了**。
2. **被吞之后没有任何兜底** —— 不重试、不提示，用户停在业务页。`fetchSessions()` 只在
   挂载时跑一次，所以不是「慢」，是「等多久都不会跳」。真实用户要撞上，得有「两次鉴权失败
   挨得极近」的时序，看着影响有限；但「被吞了就永远不跳」这个性质本身是健壮性缺口。
   建议（交由应用侧定）：把 `clearAuthSession()` 挪到旗标判断之后，或加一次重试。

**⚠️ 方法学教训：探针必须先验证，再拿它的沉默当证据**

这一轮之前走过弯路，记下来免得重犯：

- **`program.evaluate` 里的 `uni` 其实是 `wx`**（automator 序列化时会注入 `var uni = wx;`），
  而应用用的是 uni-app 自己那个 `uni` 对象 —— **不是同一个东西**。
- 更坑的是**路由 API 拦不到**：给 `wx.reLaunch` 包一层，**只能拦到测试自己发的导航**，
  应用发的看不见（uni-app 在启动时就缓存了原生函数引用）。而**通用 API 拦得到** ——
  `showToast` / `removeStorageSync` 都能记下应用侧的调用。
- ⇒ **上一轮「计数器证明应用没发起跳转」的结论是错的，已撤回**（这次靠 `showToast` 才真正
  看清）。**正确姿势：先拿一条「已知必然走这条代码路径」的绿灯用例（这里是 P4-01）验证
  探针能记下应用的动作，再去解读它在失败用例里的沉默。**

**运行记录**（同一台机器、同一天）

| # | 命令 | 跑了几次 | 结果 |
|---|---|---|---|
| 1 | `test:e2e -- -t 'P4'` | **4 次** | **4 次全红，每次都是 P4-02** |
| 2 | `test:e2e`（全量） | 2 次 | 1 次 2 红（日志被 `tail` 截断，未留档）；1 次 1 红：P4-04（甲），同轮 P1、P3 全绿 |
| 3 | `test:e2e -- p4-auth`（按文件） | 1 次 | 2 红：P4-00（乙）、P4-04（甲）；**这一轮 P4-02 反而是绿的** |
| 4 | `-- -t 'P4-02'` 等 4 种组合 | 4 次 | 全绿 |
| 5 | 探针有效性验证（`-t P4-01`，包 `wx.*`） | 2 次 | ✅ 探针记下了应用的 `showToast` / `removeStorageSync` ⇒ **探针有效**，可以用 |
| 6 | 装探针后的全量（`-t 'P4'`） | 3 次 | P4-04 **3/3 红**，每次都是「删 key、无 toast」⇒ 旗标确认被吞 |
| 7 | 隔离实验：`-t 'P4-04'` 单独 / `-t 'P4-02\|P4-04'` | 各 1 次 | 单独 **绿**（有 toast）；成对 **红**（无 toast）⇒ 状态来自 P4-02 |
| 8 | 重试阶梯：失败后静置 2s / 5s 再推一次 | 1 次 | 静置 2s 后 **绿**（有 toast）⇒ 旗标会复位 |
| 9 | 修好之后复测 | 8 次 | 6 轮全绿；2 轮各 1 红，位置随机（P4-00 乙 / P4-01 甲-b） |
| 10 | 收尾确认：`-t 'P4'` 连跑 3 次 | 3 次 | **3 轮全绿**（每轮 `Tests: 7 passed, 41 skipped, 48 total`） |
| 11 | 补 P4-03 / P4-05 后单跑 `-t 'P4-0(3\|5)'` | 1 次 | 第 1 版 **2 红**（见下方「踩坑」），改用 `withNativeModal` + 修 `waitFor` 返回值后 **2 绿** |
| 12 | 补完后 `-t 'P4'` 连跑 3 次（2026-10-10） | 3 次 | **3 轮全绿**（每轮 `Tests: 9 passed, 39 skipped, 48 total`，约 63s） |
| 13 | `wx.request` 可替换性探针（2026-10-10，临时文件） | 4 次 | **4 轮全绿**。结论见 §5.9：`wx.request` 换得掉、**应用自己的请求会走进去**、能造流并渲染出「你好」 |
| 14 | `helpers/streamMock.js` 提炼后复验（2026-10-10，临时文件） | 2 次 | **2 轮全绿**（30.8s / 31.2s）。第 1 版跑完发现「半块」观察点没暴露，加 `onHead` 后复验：半块时气泡 `""`、喂完 `你好`、无乱码 |

**15–18 是 P2（AI 对话）的落地记录**，跟 P4 无关，连同 §5.9–5.11 一起看：

| # | 命令 | 跑了几次 | 结果 |
|---|---|---|---|
| 15 | 写 `e2e/p2-chat.e2e.js` 第 1 版，单跑 `test:e2e -- p2-chat` | 多次 | 先后红在三条**用例自己**的问题上：P2-01（气泡落在兜底文案「抱歉，…」）、P2-06（底部 Tab 点错元素，卡在 `pages/watchlist/index` 直到超时）、P2-07（断言长度写死 `4`，实际 `5`）。结论见 §5.10 / §5.11 |
| 16 | 为 P2-01 找原因的四组测量：① 8 秒后有没有迟到帧 ② 挂载后 8 秒才发 ③ 重启开发者工具 ④ Windows 侧 `curl` 直连同一个接口 | 4 组 | **四组全部否掉「应用丢了第一条流式请求」这个理论**（连 Windows 侧裸 `curl` 都能复现空流 ⇒ 跟应用无关）。真正原因是模型服务方对长回答返回**空流**，见 §5.10 与 D-07 |
| 17 | 换成「答得快」的问句 + 修 P2-06 / P2-07 后单跑 `test:e2e -- p2-chat` | 1 次 | **全绿**（`7 passed / 7 total`，94.4s） |
| 18 | 稳定性复跑 `test:e2e -- p2-chat` | 1 次 | **再次全绿**（`7 passed / 7 total`，94.0s）⇒ 连续两轮全绿，P2 收工 |

**19–21 是 P5（注册 + 风险测评）的落地记录**，跟 P4 无关，连同 §5.12 一起看：

| # | 命令 | 跑了几次 | 结果 |
|---|---|---|---|
| 19 | 写 `e2e/p5-register.e2e.js` 第 1 版，单跑 `test:e2e -- p5-register` | 1 次 | **3 绿 3 红**。红的三条**全是同一个原因**（不是注册坏了）：P5-01 提交后停在注册页 / 负例① 也停在注册页 / P5-03 点返回箭头后停在测评页 —— 都是「导航没生效」，见 **§5.12** |
| 20 | 三只一次性探针（临时文件 `z-probe-register.e2e.js`，**验完已删**）定性「页面怎么进来的」与「跳不跳得走」的关系 | 3 次 | 探针 1（`reLaunch` 进注册页）：提交后 2s 到首页 ✅；探针 2 两臂（点登录页的链接 `navigateTo` 进）：**两臂都记到了「注册成功」toast**，但 12s 内 24 次轮询全停在注册页 ❌；探针 3：D1 对照组（`reLaunch` 进）测试侧 `reLaunch` 走得掉 ✅ / D2 点链接进 ❌ / D3 点链接进 + `navigateBack` ❌ / D4 因通道仍被堵（`gotoPage` 重试 3 次约 40s 没跳出去）**没测成** ⇒ 定性为 **D-08** |
| 21 | 按 §5.12 改完用例侧（进场/离场都走 `gotoPage`，刷新同一页加 `force: true`）后连跑 `test:e2e -- p5-register` | 2 次 | **两轮全绿**（`6 passed / 6 total`，72.4s / 72.6s）；跑完查本地 `auth.users` 里 `e2e%@ai-etf.xyz` **剩 0 条** ⇒ P5 收工 |
| 22 | 新增 **P5-04**（登录页「还没有账户？注册」入口）后单跑 `test:e2e -- p5-register` | 1 次 | **全绿**（`7 passed / 7 total`，122.5s）。P5-04 单条 19.0s（`navigateTo` 本就慢）。日志可见它**真的点了**：`Element.tap` 落在「还没有账户？注册」上，页面 id 13 → 14、path 变 `pages/register/index`，随后 `#reg-username` / `#reg-confirm` 都查到 |
| 23 | ⭐ **P5-04 反向验证**：把 `handleGoRegister` 里那行 `uni.navigateTo` 注释掉，单跑 `test:e2e -- p5-register -t 'P5-04'` | 1 次 | **该条变红** —— 「等待『点「还没有账户？注册」后应进到注册页』超时（15000ms）。**当时实际停在：`pages/login/index`**」（`1 failed, 6 skipped`）⇒ 它确实靠那次真实点击才通过，不是碰巧绿。改完按备份还原，`sha256` 与 git HEAD 一致，净改动为 0 |

⚠️ **P5 每跑一轮真写 2 个账号**（走 HTTP 的 + 走真实注册页 UI 的），两个都在 `afterAll` 里注销。
首跑因用例中途失败漏掉了 UI 那个（当时 `uiAccount` 是在末尾才赋值的），**已改成「点提交之前就先登记待清理」**。

注意 `-t 'P4'` 实际跑 **9 条**（P4 的 6 条 + P3-05 的 3 条 —— 见 §1 的 ⚠️，`-t` 是按完整用例名匹配的，把 describe 标题里含 "P4" 的一起捞了进来）。

**2026-10-10 补 P4-03 / P4-05 时踩的两个坑**（都已固化进代码注释与 `helpers/uniMock.js`）：

1. **`mockUniMethod('showModal', {confirm:true})` 让确认框自动点确定 —— 不管用。**
   它改的是 uni-app 自己的 `uni` 对象（实现是 `uni[method] = mockFn`），而应用的
   `const result = await uni.showModal({...})` 依赖 uni-app 的 **promisify 包装**；
   包装被换成裸函数后没人 resolve → `await` 拿到 `undefined` → `!result.confirm` 抛错。
   **症状是「点了没反应」，特别容易误判成元素没点到。**
   规律：**回调写法**（`success: (res) => ...`，如 `watchlist/index.vue#L548`）用 `mockUniMethod` 有效；
   **`await` 写法**（如 `settings/index.vue#L202`）必须换 `wx.showModal`。
   用的是新 helper `helpers/withNativeModal`（做法：`program.evaluate` 里直接改写 `wx.showModal`）——
   实测 evaluate 里的 `uni` **就是 `wx`**（`uni === wx` 为 true）。
   副产品：换的时候顺手把入参录下来，**弹窗文案因此也能断言了**（`readNativeModalCalls`）。
2. **`waitFor` 的返回值别写成元素。** `waitFor` 是按真值判定的，谓词里 `return (a && b)` 返回的是
   **元素**而不是 page，后面 `page.$('#login-account')` 就变成在元素上找子元素，恒为 `null`
   （报错长这样：`TypeError: Cannot read properties of null (reading 'input')`）。要 page 就 `return p`。

**本轮改动的代码只有两个文件**：`application/e2e/helpers/waitFor.js`（`waitForPage` 报错
文案 + 新增 `waitForStablePage`）与 `application/e2e/p4-auth.e2e.js`（三处
`waitForStablePage({ stableMs: 2500 })`）。**所有临时探针都已拆除；断言与 `src/` 均未动。**

**顺带确认的一件事：`findLeftoverAuthKeys` 会读到「撕裂快照」。**

曾经有过一次失败长这样：`P4-02` 红在 `:227`，存储残留报成
`["user","loginTime","expireTime"]` —— **`auth_token` 没了，另外三个还在**，当时没解释掉。
现在能解释了，而且**它不是应用的问题**：

- 应用的 `clearAuthSession()` 是一个 `forEach`，**逐个**调 `uni.removeStorageSync`
  （auth.ts:166），4 个 key 是 4 次独立的往返；
- 测试的 `findLeftoverAuthKeys` 也是**逐个**调 `uni.getStorageSync`（6 次独立往返）。

两边交错，就会读到「删到一半」的中间态。`auth_token` 是
`Object.values(AUTH_STORAGE_KEYS)` 里的**第一个**（auth.ts:5-10），所以「token 没了、
其余还在」正是最典型的那一帧。另外，这一帧**不可能**是 `getAuthSession()` 写出来的 ——
它在 auth.ts:113 就因为缺 token 直接 `return null` 了，走不到后面写回时间的分支。

⇒ **这条断言的失败不能单独当成「应用没清干净」的证据**，得连着「当时停在哪一页」一起看。
（要根治，得让测试先等应用跳到登录页、稳定下来再读存储，或者把 6 次读合成一次读。）

> 同一件事在 `ai-etf/docs/e2e/05-执行计划.md` 里有对应记录。
>
> 🔗 **这条产品侧缺口已收进统一缺陷台账**：[00 §五 **D-04**](../../ai-etf/docs/e2e/00-背景与已知问题.md)
> （清存储早于跳转旗标 + 被吞无兜底；连同 D-01~D-07 共 7 条，**只登记、不修**）。

### 6.7 P2 气泡里是「抱歉，…」或干脆是空的

**先别改成用例、也别改 `src/`** —— 这多半是**模型服务方**的问题，不是应用。

症状 | 真正原因
---|---
气泡渲染出兜底文案「抱歉，…」 | 后端拿到的是**空回答**（SSE 只有 `done`、没有 `token` 帧），还是当成功存库了
用例在等「气泡出现文字」超时 | 同上，只是问句更长，空流概率更高

**怎么确认**：直接问后端要这条会话的消息 —— `GET /api/secure-chat/{chat_id}/messages`，
看那条 assistant 消息的 `content` 长度是不是 `0`。是 `0` 就坐实了是空流。

**处置**：把用例的问句换成**答得快（≤10 秒答完）**的（§5.10 有实测表）。
**不要加重试、也不要加「预热」请求** —— 那是上一轮被四组测量否掉的做法。

---

## 7. 反向验证：把代码故意改坏，看这几条用例会不会变红

做法很简单 —— 把被测的那行代码**故意改坏**，跑一遍，再改回来：

**不做这一步，就分不清「这条用例真的测到了东西」和「写了个永远不会失败的用例」。**
下面这三条是专门挑出来做这件事的，它们各自钉住一处「一改坏就该报错」的地方：

| 用例 | 位置 | 怎么把它改坏 |
|---|---|---|
| **P1-03**（申购 → pending 语义） | [`p1-trading.e2e.js`](p1-trading.e2e.js) 的 ②③③-bis④ | 把 `ai-etf/server/services/portfolio_service.py` 里那行 `"frozen_cash": float(frozen_cash + amount)` 改成 `float(frozen_cash)`（**故意不再冻结资金**）→ **重启后端**（没有 `--reload`）→ 跑 `npm run test:e2e -- p1-trading` |
| **C1**（契约测试） | `ai-etf/tests/contract/` | 把 `PUT .../title` 那条路由注释掉 → C1 必须变红 |
| **P2-07**（分块解码，⚠️ **反向验证还没做过**；用例本身 2026-10-11 跑绿） | [`p2-chat.e2e.js`](p2-chat.e2e.js) | 把 `src/utils/sse.ts` 里那个 `createUtf8StreamDecoder` 的分块拼接改坏（例如丢掉半块残留，见 §7.1）→ 跑 `npm run test:e2e -- p2-chat` → **P2-07 必须变红**（它就是要抓「半个汉字被切开」）<br>✅ 同一条防线在**单元测试**侧已经做过反向验证（§7.1 第 ①，5 条红），**要不要再在真机上做一次可以商量** |

**已验证过一次（2026-10-08）**：改 `frozen_cash` 那行 → **4 条变红**（P1-03②③ + 连带 P1-05②/P1-06②）→ `git checkout` 还原 → 重启 → 重回 18 passed。
细节与两条副产物见 `ai-etf/docs/e2e/05-执行计划.md` 的验收标准。

### 7.1 单元 / 集成测试那套也做过同样的反向验证（2026-10-11 已实做）

`npm run test:unit` 那 86 条**一次性改坏 5 处，5 个文件全部命中、共 10 条变红**，改完核对过原样还原（sha256 逐个比对，5/5 一致）：

| 改坏哪行 | 变红 |
|---|---|
| `src/utils/sse.ts` 不再保留凑不齐的半个字符（`pendingBytes.slice(index)` → `[]`） | 5 条 |
| `src/utils/auth.ts` 去掉 `isAuthSessionValid` 的第三条（防篡改） | 1 条 |
| `src/utils/request.ts` 取消「行情接口未登录也放行」的例外 | 2 条 |
| `src/stores/watchlist.ts` 去掉搜索里的竞态保护 | 1 条 |
| `src/stores/chat.ts` 去掉 `appendBotToken` 的越界检查 | 1 条 |

📌 **一个值得记的细节**：第一条**只让「手写降级实现」那一组变红，原生 `TextDecoder` 那一组照样绿** ——
改的是降级实现自己的缓冲区，碰不到原生解码器。**真机走的正是降级那套**，所以两套必须分开测，不能只测一套。

**跟 §7 上半部分的区别**：那三条是**真机**用例（慢、要开发者工具）；这里 5 条是**纯逻辑**用例（0.8 秒跑完）。
**两套都要有**：单元测试能秒级抓回归，真机用例才能证明「用户看得见的东西是对的」。

⚠️ **做反向验证要动被测源码，做完必须 `git checkout` 还原并确认 `git status` 干净。**

---

## 8. 「知道但没覆盖」的地方（别当成漏测）

| 位置 | 没覆盖什么 | 为什么 |
|---|---|---|
| `p1-trading.e2e.js` P1-03③ | **点结果页的「查看持仓」按钮**回自选页 | 那是 `uni.reLaunch`，会撞上 §5.3 的「初始化期间导航被丢弃」。改成断言按钮文案存在 + 用 `gotoPage` 自己走。**「持仓 Tab 数值正确」这个真正的考点不受影响** |
| `p1-trading.e2e.js` P1-06 | 赎回拦截的 **UI 层** | 赎回页 `!position` 时表单被 `v-if` 短路，而唯一入口是持仓项 → **UI 闭合不可达**，降为 L3 接口级 |
| `p1-trading.e2e.js` P1-04 | **整个用例**（`it.skip`） | 见下 |
| `p2-chat.e2e.js` P2-01 / P2-02 | **「长回答」这条路**（真后端答 20 秒以上的问句） | 见 §5.10 / **D-07**：服务方对长回答返回**空流**，用例只能挑「答得快」的问句。所以「长回答能不能正确渲染」在 E2E 里是**故意不覆盖**的，别当成漏测 |
| `p2-chat.e2e.js` 全部 | **不模拟的流式行为**（中途断流、服务方报错、超长回答分页） | §5.9 的 `streamMock` 能造，但造出来的是**我们想象的**协议，只能验证「应用怎么处理」，不能验证「服务方实际发什么」。真协议只能靠跑真实 LLM |
| ~~`p5-register.e2e.js` P5-01~~ | ~~**登录页「还没有账户？注册」这条入口本身**~~ | ✅ **2026-10-11 已补** —— 见 **P5-04**。原先判定「补不了」是把 D-08 的范围看宽了：D-08 堵的是「从 `navigateTo` 压上去的页面往**外**跳」，而**点链接进注册页这一步本来是通的**。于是另立一条**只验「进得去」**的用例（点完看一眼注册页的内容就收工，不提交、不往外跳）。**主流程**（P5-01）仍然走深链，理由不变 |
| `p5-register.e2e.js` P5-03 | **测评页左上角返回箭头这个动作** | 同 D-08：测评页也是 `navigateTo` 压上去的，自动化点返回箭头后一直停在测评页。改为用 `gotoPage` 收敛回设置页。**「重进直接看画像」这个考点不受影响**。<br>⭐ **但功能本身是好的**（2026-10-11 人工验证）：人手动点同一个箭头**一次就退回「我的」（= 设置页）**。⇒ 这条「没覆盖」是**自动化驱动的局限**，**不是漏测、更不是功能坏了**。写出来每次都会红且红得没意义，故不写 |
| `p5-register.e2e.js` P5-01 | 「两次输入密码不一致」的前端拦截 | 与负例② 同属前端就地拦下的分支，一个套路，没重复做 |
| `p5-register.e2e.js` | 问卷加载失败的分支、`loadProfileResult()` 的「API 失败 → 回退本地缓存」、重测后覆盖旧画像 | 都是异常分支；要造「后端挂了但缓存还在」的状态得反过来改坏 `wx.request`，本阶段没做 |

### P1-04 为什么走不到（⚠️ 这条容易理解错）

后端 `apply_redeem` 的校验顺序是：**先查持仓**（`:784-786`）→ 再查 pending 申购（`:788-801`）。

- **本用例**用新账号、先申购再赎回，**从未持有过** → 持仓恒为空 → **持仓校验先命中**，拿到的是「未持有基金 110020，无法赎回」，不是文档期望的 pending 文案。
- **但这不代表 `:788-801` 是死代码** —— 它**可达**，触发条件是「该基金**已确认**持有」+「该基金有 pending 申购」。
  E2E 覆盖不到它，是因为**会话内造不出已确认持仓**（申购单当天确认不了）。
- **真实使用中这个组合很常见**（昨天买的已确认，今天又买一笔）。所以这条拦截实际挡住的是一个**合法操作**。
  **2026-10-10 已定性为产品缺陷并登记**（台账编号 **D-01**），完整版（代码 / 触发条件 / 实测佐证 / 建议修法）见 [`ai-etf/docs/e2e/00-背景与已知问题.md` §五 缺陷专项](../../ai-etf/docs/e2e/00-背景与已知问题.md)；用例侧的处置见 `ai-etf/docs/e2e/03` §二 P1-04。
  **它挡得住的是产品流程，不是我们的测试** —— 覆盖它只需夹具回填状态，不是绕不开。

要真覆盖它，得用夹具回填状态（把订单 `confirm_date` 改到过去再调 `confirm-pending`），不是绕不开。

---

## 9. 交接前必须知道的三件事

1. ⭐ **`application` 下次有人接线那 21 个未接线端点时，要同步更新契约测试快照与 E2E 白名单。**
   目前 21 个后端端点**前端零调用** —— 它们只能做接口级测试或当夹具，不能做 E2E 步骤。这是**防止测试悄悄睡着**的最关键一条。

2. ⭐ **`e2e-testing` skill 在两个仓库各存一份（`.claude/skills/e2e-testing/`），必须逐字节一致。**
   真源是 `ai-etf` 那份。改完跑 `ai-etf/docs/e2e/scripts/sync_e2e_skill.sh` 同步（`--check` 只校验）。
   **只改一份不会报错**，会让前后端「都按规范做了」却对不上。

3. **文档真源在 `ai-etf/docs/e2e/00–09`。** 本文件是操作手册，不是规划文档。
   换开发者工具版本、加新路径、改分层策略，都改那边，别改这里。

---

## 10. 环境锁定记录

| 项 | 值 | 备注 |
|---|---|---|
| Node | **v22.21.0** | 见 §2.5，正落在 `spawn .bat` 的 EINVAL 线上 |
| jest | 27.0.4 | 由 `@dcloudio/uni-automator` 带入，**不需要** nvm 隔离 |
| `@dcloudio/uni-automator` | `3.0.0-4080420251103001` | |
| 微信开发者工具 | **Stable v1.06.2504040**（本机） | ⚠️ 换版本前先读 `ai-etf/docs/e2e/04 §5.3` |
| 开发者工具路径 | `D:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat` | 与默认查找路径（C 盘）不同，所以 `jest.e2e.config.js` 里必须显式写 `executablePath` |
| 自动化端口 | automator `9520` / devtools `9420` | **必须错开**，见 §6.1 |

> ⚠️ 版本号有个历史坑：曾有一份记录写着 `Stable v2.01.2510290` —— 那是**另一台机器**报的。本机是 `v1.06.2504040`。两台机器两串号，不是矛盾。
