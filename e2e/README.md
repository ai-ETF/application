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
> 实例：`p3-market-watchlist.e2e.js:828` 的 `describe` 标题是
> `'P3-05 行情接口放行未登录（跨 P3/P4 关键负例）'`，**字面含 "P4"**。
> 所以 `-t 'P4'` 实际跑的是 **10 条**（P4 的 7 条 + P3-05 的 3 条），不是"只跑 P4"。
> （`-t` 匹配的是「describe 链 + it 标题」拼起来的完整用例名，所以 P3-05 那 3 条**标题里并没有 "P4"**，被抓进来是因为它们的 describe 标题含 "P4"。）
> 想只跑一个套件，**用文件名**（`npm run test:e2e -- p4-auth`），别用 `-t`。

`test:e2e` 实际做两件事：**先打 `node_modules` 补丁**（§2.5），再 `jest -i --config jest.e2e.config.js`。

单跑一遍 P1 约 **130–150 秒**（其中开发者工具冷启动 10–15 秒）；单跑 P2 约 **94 秒**。
2026-10-09 实测「P1+P3+P4」约 **225–250 秒**；加上 P2 再约 **+95 秒**。

### 1.1 另一套：不需要开发者工具的单元 / 集成测试

上面那套是**驱动真机**跑的（慢、要开开发者工具、要起后端）。纯逻辑那部分**不用这么重**：

```powershell
npm run test:unit      # 6 个文件 / 92 条，约 0.8 秒（算上 vitest 启动约 6 秒）
```

- **不用开微信开发者工具、不用起后端、不用联网**，Windows 或 WSL 都能跑。
- 跑的是 `src/**/__tests__/**/*.spec.ts`：SSE 行解析、分块 UTF-8 解码、账号格式与本地登录态、
  请求模块的 401/放行/token 注入、两个 store 的纯动作与竞态保护，以及
  `useAuth.login` 的三条分支（200 落会话 / 401 文案 / 未识别错误透出后端原文）。
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
ENABLE_TEST_ENDPOINTS=1 \
  poetry run uvicorn server.app:app --port 8000
```

⚠️ **`E2E_MARKET_FIXTURE` 不能省**。本机连不上东财行情 API（不是代码 bug），不带夹具时行情/自选相关断言拿到的是空数据。
启动日志里应出现 `哈希表构建完成，共 3 只ETF`（不带夹具是 0 只）。

⚠️ **`ENABLE_TEST_ENDPOINTS=1` 只有跑 P1（交易）才必须**，但建议统一带上。后端从 2026-10-13 起
**默认不注册** `/api/portfolio/test/*` 那组免登录端点（原先只是「生产环境返回 404」，管不住
「非生产但公网可达」的机器）。不带这个变量时这些路径**根本不存在**，P1 一上来就会红，
报的是 404 —— 看起来像后端没起，其实起了。启动日志里会有一行
`ENABLE_TEST_ENDPOINTS 未开启，/api/portfolio/test/* 不注册（默认行为）`，照着看就知道。

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
├── p4-auth.e2e.js                    # P4 鉴权失效 —— 7 条（含 P4-00 对照组），**0 条 skip**（2026-10-10 补全）
├── p3-market-watchlist.e2e.js        # P3 行情 + 自选 —— 6 组（P3-01~05，P3-04 分「正常/取消」两支；外面还包一层 describe）共 21 条，**0 条 skip**（2026-10-14 起）
├── p1-trading.e2e.js                 # P1 交易核心 —— 6 组（P1-01~06）共 22 条，**0 条 skip**（2026-10-15 起）
├── p2-chat.e2e.js                    # P2 AI 对话 —— 8 条，**0 条 skip**（真打 LLM，单轮约 94s，见 §5.10）
├── p5-register.e2e.js                # P5 注册 + 风险测评 —— 7 条，**0 条 skip**（⚠️ 每轮真写 2 个 Supabase 账号、afterAll 注销；单轮约 73s，见 §5.12）
├── helpers/
│   ├── index.js                      # 统一出口，用 require('./helpers') 引
│   ├── waitFor.js                    # sleep / withTimeout / waitFor / waitForPage / waitForLeavePage / waitForStablePage
│   ├── nav.js                        # reLaunch / gotoPage（带静置与重试，见 §5.3）
│   ├── storage.js                    # 本地存储读写 / 种一个有效会话 / 清 auth key
│   ├── api.js                        # 直连后端的 HTTP 客户端（交叉断言 + 造服务端状态；P2 的会话增删改查也在这里）
│   ├── env.js                        # 跑前环境自检（数据安全闸门在这里）
│   ├── uniMock.js                    # uni API 的「结果式」mock + 换掉任意原生 API（withNativeModal / withNativeCall，见 §5.7）
│   ├── streamMock.js                 # 换掉 wx.request 自己造 SSE 流（见 §5.9，P2 用）
│   └── requestMock.js                # 让普通请求失败 / 返回伪造响应（见 §5.13，P5 异常分支用）
├── patches/apply-node-modules-patches.js
├── README.md                         # 本文件：怎么跑、怎么排查、写用例的规矩
└── 环境配置.md                        # 「照着做」的配置说明（含仓库里没有、必须自己建的那个文件）
```

> ⚠️ **「5 条」「6 条」在文档里有两种口径**，别对不上号：规划文档（`03`/`05`）说的「P4 5 条」「P3 5 条」指的是**用例编号的组数**（P4-01~05、P3-01~05）；
> 而 jest 报的是 **`it` 的条数**（P4-00~05 → 7，P4-03 还拆了「正常/取消」两支；P3 每组下还有 ①~⑦ 子用例 → 21）。
> 所以「跑全量」时 `Tests:` 那一行的总数，不等于规划文档里各组数字的简单相加。
> P2 也不是一组一条：**8 条 `it`**（P2-01~07 里 P2-05 拆了两条：`P2-05（取消支）` + `P2-05 删除会话`）。
>
> ⚠️ **上面的条数是 2026-10-14 用 `grep -cE '^\s*it\('` 静态数出来的**，之前那组数字已经飘了
> （文档里加了用例但没回来改）。**数乱了就现场重数**：`grep -cE '^\s*it\(' e2e/*.e2e.js`。

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
| 拦任意一个原生 API（不只是弹窗） | `withNativeCall(program, 'showToast', fn)` + `readNativeCalls(program, 'showToast')` | 通用版，`withNativeModal` 是它的特例。用来断言 toast —— 本仓库没有 toast 探针，只能这么抓（见 §6.6 的旁听桩） |
| 造一条 SSE 流 | `withStreamMock(program, {urlIncludes}, fn)` | 见 §5.9。只拦 `enableChunked` 的请求，其余透传 |
| 喂分块 / 汉字切两半 | `waitChunkHandler` → `pushChunkSplitMidChar(program, text, {onHead})` → `finishStream` | `onHead` 是观察「半块」状态的唯一窗口 |
| 拿应用发出去的流式请求 | `readInterceptedSse(program)` | `{url, method, enableChunked, hasAuth, body}` |
| 让流式请求在网络层失败 | `failStream(program, errMsg)` | 走应用的 `fail` 回调，和 `finishStream({statusCode:500})` 是**两条不同分支**（见 §5.9） |
| 让普通请求失败 / 返回伪造响应 | `withRequestMock(program, rules, fn)` + `readRequestMockHits(program)` | 见 §5.13。**只拦匹配到的 URL，其余透传** |

---

## 5. 写新用例要守的规矩

这几条都是**踩过坑总结出来的**，不是风格偏好。

### 5.1 断言要能指到代码行

每条断言旁边写清楚依据（`file:line`）。这个项目的后端分支逻辑有多处反直觉（例如 §8 的 P1-04），凭直觉写的断言会给出**看起来对但其实是假的**结论。

### 5.2 元素 API 的三个坑

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

**`touchstart` / `touchmove` / `touchend` 的参数是 `touches`，不是 `x` / `y`。**（2026-10-13 发现）

这三个 RPC 收的是：

```js
const t = (x, y) => ({ identifier: 1, clientX: x, clientY: y, pageX: x, pageY: y })
await el.touchstart({ touches: [t(300, 200)], changedTouches: [t(300, 200)] })
await el.touchmove({ touches: [t(200, 200)], changedTouches: [t(200, 200)] })
await el.touchend({ touches: [], changedTouches: [t(200, 200)] })   // 松手时 touches 为空 = 手指都离开了
```

⚠️ 传成 `{ x, y }` 的后果**特别隐蔽**：RPC 照样返回成功、日志里一点异常都没有，
只是合成出来的事件 `touches` 是**空数组** → 页面里 `event.touches[0]` 是 `undefined`
→ 页面自己第一行 `if (!touch) return` 直接退出 → **页面上什么都不会发生**。

2026-10-06 就是这样把「参数传错了」误判成「本机做不到左滑手势」，还把它写进了 p3 文件头和本文档，直到 10-13 才推翻。
⭐ **「工具做不到」这个结论，写进文档之前先把参数形状确认一遍** —— 错误的能力结论比没有结论更糟，它会让后来的人照着绕路。
`clientX` / `pageX` 给哪个都行（开发者工具会把缺的补上），实测细节与探针证据见 `p3-market-watchlist.e2e.js` 的 `swipeRowLeft()`。

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

现在仓库里的 skip 一共 **0 条**，**没有一条是「时间窗口没到」** —— 六个套件的用例全部真跑。
⚠️ **条数是这么降到 0 的**：2026-10-11 P1-04 从 skip 转正（夹具能回填确认日，见 §8）；
2026-10-13 P3 的 `⑥-bis`「左滑手势」转正 —— **它的 skip 理由是错的**（见 §5.2 的 `touches` 参数坑）；
2026-10-15 P1-01③ 那句 `it.skip` **直接删除** —— 它的函数体是**空的**，永远不可能通过；
而它声明的理由（「属 P2 范围」）**是真的**，覆盖在 P2 的 `beforeAll`（`p2-chat.e2e.js:366-368`）。
**空壳留着没有任何作用**，只会让后来的人（比如 10-14 那次排查）误以为这里有洞。
—— 这是刻意的：P1 路径已经做到**零时钟依赖**，任何时间都能跑。

> ⭐ **所以「零 skip」现在是一个可检查的不变量**（**只对「不带 `-t` 的全量跑」成立**）：
> 不带 `-t` 跑全量时，报告里只要出现 `skipped`，就说明有人新挂了跳过，**必须当场问清楚为什么**。
> ⚠️ **带 `-t` 时这条不变量不成立**：`-t` 是按用例名过滤，没被选中的用例 jest 一律记成 `skipped`。
> 本文 §6.6 里那两轮 `41 skipped` / `39 skipped` 就是这么来的（`-t 'P4'`），**跟 `it.skip` 无关**。
> —— 这比「大概都跑了吧」可靠得多，但前提是看对跑法。

> 将来 P2（AI 对话）的 skip 会是另一回事：**LLM 有成本、非确定性、单轮约 1.5 分钟**（实测 94 秒；单条约 20 秒出头，见 §5.10）。
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

#### 5.7.1 ⚠️ 结果式桩「模拟点取消」的坑：`errMsg` 里**不能**带 `:fail`（2026-10-12）

`confirmNextModal(program, {confirm:false})` 原先把 `errMsg` 写成 `'showModal:fail cancel'`。而 runtime 的桩
**是按 `errMsg` 决定调哪个回调**的（[`uni-mp-weixin/lib/automator.js`](application/node_modules/@dcloudio/uni-mp-weixin/lib/automator.js) 的 `mockUniMethod`）：

```js
result.errMsg.indexOf(':fail') !== -1 ? params.fail?.(result) : params.success?.(result)
```

带 `:fail` ⇒ 桩去调 **`fail`**。而回调写法的调用点（`watchlist/index.vue` 的 `handleClearAll`）**只注册了 `success`**
⇒ **应用的回调一次都不会被调到**，`if (res.confirm)` 那支根本没跑过 ⇒「取消支」的绿是**假绿**。

**真机语义**：点取消走的是 `success({confirm:false, cancel:true, errMsg:'showModal:ok'})` —— 取消不是失败。
**处置**：`errMsg` 一律填 `'showModal:ok'`，取消与否只用 `confirm` 表达（已修，见 `helpers/uniMock.js`）。

**这类假绿怎么查出来**：反向验证时往 `success` 里插一句 `res.confirm = true`（`src/` 侧变体），
用例**照样绿** ⇒ 那句压根没执行到。见 §7.2 的 2026-10-12 订正。

#### 5.7.2 ⚠️ 结果式 mock 是**全局且持久**的，用完不还原会盖住后面所有套件的 `wx` 桩（2026-10-18 定位）

`mockUniMethod` 在运行时里就是 `uni[method] = mockFn`，**没有「只生效一次」**
（`@dcloudio/uni-mp-weixin/lib/automator.js`：`originUni[method] || (originUni[method] = uni[method]); uni[method] = mockFn`）。
只有再调一次**不带 result** 的 `mockUniMethod`（即 `helpers.restoreUni`）才还原。

而六个 `*.e2e.js` **共用同一个 app 实例**，所以一旦某个套件装完没还原：

- 后面所有套件的 `withNativeModal` / `stubNativeModal`（换的是 `wx.showModal`）**一条都记不到** ——
  `uni.showModal` 已经是 mock，调用根本走不到 `wx.showModal`；
- 应用拿到的是 mock 塞的固定返回值：`{confirm:true}` 但**没有 `content`** 时，
  重命名回调 `res.confirm && res.content && res.content.trim()`（`SessionDrawer.vue:220-222`）直接为假
  ⇒ **静默什么都不做**；删除回调只看 `res.confirm`（`:193`）⇒ **真的删**，却一条记录都没有。
- 实测（临时探针 `z-probe-mock-leak`，跑完已删）：同一页、同一个「清空自选」按钮，
  **A 组**只装 `wx` 桩 → 记到 1 条；**B 组**先装 `mockUniMethod` 再装桩 → **记到 0 条，但后端照样清空了**
  ⇒ mock 确实盖住了桩，而且**不报错**。
- 这正是 2026-10-18 全量跑里 **P2-04 / P2-05×2 / P2-06 与 P4-03×2** 的真实成因：
  P3 的 `confirmNextModal` 装完没有还原（全量日志里 4 次 `App.mockUniMethod`、**0 次** `restoreUniMethod`），
  而套件顺序是 p1 → p3 → p2 → p4。**单跑 P2 / P4 都绿，因为没有 P3。**
- **规矩**：优先用能自还原的 `withNativeModal`；非要用结果式 mock，就包在 `withMockedUni` 里（`finally` 还原），
  或者至少在套件 `afterAll` 补一次 `restoreUni(program, 'showModal')`。
- ✅ **已按此改正（2026-10-18）**：P3 的 4 处裸调全部换成 `withNativeModal`；全量复跑 **66/66 通过**，
  日志里 `App.mockUniMethod` 0 次（验收记录见 §6.6）。

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

#### 5.9.1 流式异常的四种造法（2026-10-19 追加，已落地为 P2-08 ~ P2-11）

`streamChatMp` 里有**四条互不相同**的失败路径，别混成一种：

| 造法 | 走到的分支 | 气泡文案 |
|---|---|---|
| `finishStream(program, { statusCode: 500 })` | `success` 里 HTTP 非 2xx（[index.vue:230](src/pages/index/index.vue#L230-L234)） | `抱歉，AI 请求失败（HTTP 500）。` |
| `pushChunk('data: {"type":"error","message":"…"}\n\n')` | 解析出 error 帧后在 `success` 里统一 reject（[index.vue:190](src/pages/index/index.vue#L190-L192)、[:243](src/pages/index/index.vue#L243-L246)） | `抱歉，<服务端 message>。`（**即使已经渲染了 token 也会被覆盖**） |
| `finishStream(program)` 但一个 token 都没喂 | `!receivedToken`（[index.vue:248](src/pages/index/index.vue#L248-L251)） | `抱歉，AI 服务未返回有效回复。` |
| `failStream(program, 'request:fail …')` | `fail` 回调（[index.vue:254](src/pages/index/index.vue#L254-L268)） | `抱歉，<errMsg>。` |

⚠️ 四条最终都走 `handleSend` 的同一个 catch（[index.vue:411-414](src/pages/index/index.vue#L411-L414)），
所以**只断言文案分不出是哪条路径**。判据要加上「怎么触发的」：
HTTP 失败必须用 `finishStream(500)`、网络失败必须用 `failStream`，别用同一个造法去验四句话。
另外每条都要断言 `sending === false`（[:416](src/pages/index/index.vue#L416)）——
标志位没复位的话输入区永远禁用，用户看到的是「卡死」而不是一句错误。

**反向验证（2026-10-19 已做、已还原）**：把 P2-08 的期望文案改成兜底文案、把 P2-11 恢复段里的
token 去掉 → 恰好这 2 条变红（10 通过 / 2 没通过），还原后 12/12。

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

### 5.12 `navigateTo` 压上去的页面，短时间内**跳不走**（2026-10-11 实测；模拟器手点正常；真机也正常）

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
**真机上是不是也这样：已经验过了，正常**（2026-10-11，用户拿真机走了一遍「登录页 → 注册 → 提交」）。
⇒ 三条路径全部点过：**模拟器手点正常 / 真机正常 / 只有 automator 驱动时不跳**。
「产品有没有问题」这一格到此关掉，**但用例侧处置不变**（用例本身就是 automator 驱动的），
也**不要为它改业务代码**（按约定，缺陷只登记不顺手修）。

**由此多出一条能补的用例**：既然堵的是「从这种页面往**外**跳」，那**「点链接进注册页」这一步本来是通的**
（探针 2 和对照组都成功进了页面才卡住）⇒ 另立 **P5-04**，只验「进得去」：点完、`waitForPage` 到注册页、
再断言注册页自己的两个输入框渲染出来了，不提交、不往外跳。**「测评页返回箭头」仍然补不了** —— 它本身就是往外跳那一步。
⚠️ **P5-04 必须留在 `p5-register.e2e.js` 最后一条**：它是全文件唯一一个「点一下」把页面压进栈的用例，
排它后面的用例会被自己的 `gotoPage` 噎住。

### 5.13 让普通请求失败 / 返回伪造响应（2026-10-19 新增，P5 异常分支用）

**要解决的问题**：P5 有几条分支只在「后端挂了 / 返回了别的数据」时才走到，比如
`loadProfileResult()` 的「画像接口失败 → 回退本地缓存」和 `loadQuestionnaire()` 的失败 toast。
原来的文档里这些写的是「本阶段没做」，理由是「要造这个状态得改坏 `wx.request`」——
`wx.request` **是换得掉的**（同 §5.9 的依据），于是补成 [`helpers/requestMock.js`](helpers/requestMock.js)。

```js
await helpers.withRequestMock(program, [
  // 网络层失败（走 request() 的 fail → reject）
  { urlIncludes: '/api/risk/profile', action: 'fail', errMsg: 'request:fail 模拟断网' },
  // 伪造一个响应（走 success，statusCode/ data 原样给应用）
  { urlIncludes: '/api/risk/questionnaire', action: 'respond', statusCode: 500, data: { detail: '…' } },
], async () => {
  const page = await helpers.gotoPage(program, RISK_ROUTE, RISK_PATH, { force: true });
  // …断言
  const hits = await helpers.readRequestMockHits(program);  // 证明这些请求真的发生过
})
```

必须知道的点：

- **只拦匹配到的 URL，其余原样透传**给真 `wx.request`（和 `streamMock` 同一个原则）。
- **`readRequestMockHits` 的断言不能省**：只断言「页面显示了缓存内容」的话，如果壳没生效、
  请求真的打到后端并成功了，用例照样绿 —— 那就成了假绿。要断言**这条请求确实被我们接管过**。
- 回调是**异步**的（`setTimeout 20ms`），和真 `uni.request` 的时序一致；同步回调会让「页面还在挂载」
  和「响应已到」的先后关系失真。
- `respond` 的 `data` 会原样成为 `res.data`。`request()` 对非 2xx 会 reject，错误文案取
  `detail` / `message` / `error`（[src/utils/request.ts:19-27](src/utils/request.ts#L19-L27)）。

**落地用例**：P5-06（画像失败 → 缓存）、P5-07（问卷失败 → toast）。**注意顺序**：两者都要
`gotoPage(..., { force: true })` 重新挂载，否则会读到上一个状态的页面实例。

**反向验证（2026-10-19 已做、已还原）**：把 P5-06 的 `urlIncludes` 改成不存在的 URL（壳形同虚设）、
把 P5-07 期望的 toast 文案改短 → 恰好这 2 条变红（9 通过 / 2 没通过），还原后 11/11。
⚠️ P5-06 在壳失效那一轮**只红在 hits 断言上** —— 这正说明 hits 那条不是摆设，别删。

---

## 6. 常见故障 → 处置

### 6.1 `Failed to connect to runtime` / `Wechat web devTools not found`

| 症状 | 原因 | 处置 |
|---|---|---|
| `Wechat web devTools not found` | `executablePath` 与实际安装位置不符 | 改 [`jest.e2e.config.js`](../jest.e2e.config.js) 的 `executablePath` |
| 日志只有 `gettestpublib`、**没有** `openProject`，然后白等 60s | **端口自撞** | 见下 |
| `Failed to launch Wechat web devTools , please make sure http port is open` | ①上一轮残留进程占着 9420；②appid 权限；③**Windows 保留端口段吃掉了开发者工具内部用的 3799**（2026-10-18 遇到） | 先跑 `cli.bat islogin` 看真实报错，见下面第三段 |
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

**第三种成因：Windows 保留端口段把 3799 圈走了**（2026-10-18 实测，整轮 6 个套件全部 `Test suite failed to run`、0 条用例执行）。
开发者工具的命令行内部**写死用 3799**（`code/package.nw/js/common/cli/index.js` 里 `let j=3799`）。
WinNAT 开机时会随机圈一段 TCP 端口给 WSL/Hyper-V 用，如果恰好覆盖 3799，`cli.bat` 一启动就 `EACCES`：

```
× #initialize-error: Error: listen EACCES: permission denied 127.0.0.1:3799
```

**判断方法**（比看 jest 那句假报错快）：直接单跑命令行，它会打出真实错误：

```powershell
& "D:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat" islogin
```

同时看一眼保留段是否包含 3799：

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

**处置**（管理员 PowerShell）：

```powershell
net stop winnat
net start winnat
```

重启后 WinNAT 会重新分配端口段。复跑 `cli.bat islogin`，正常输出形如
`√ IDE server started successfully, listening on http://127.0.0.1:<新端口>` + `{"login":true}`，就说明修好了。
若重启服务后 3799 仍在保留段里，**重启一次电脑**。

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

⚠️ **「乙」的落点就是「上一次停的地方」，不一定是登录页。** 2026-10-18 全量跑实测：
套件顺序变成 p1 → p2 → p3 → **p5 → p4** → hello，P5 刚跑完停在 `pages/register/index`，
P4-00 紧接着发的第一次 `reLaunch('/pages/login/index')` 被吞，等到的是
「当时实际停在：`pages/register/index`」。**判据是「没到目标页」，不是「停在登录页」。**
另外注意：**套件顺序不是固定的** —— 配置里没有任何排序，jest 按历史耗时排序，
同一套用例不同轮次的顺序可能不同（上面这轮就跳过了原先的 p1→p3→p2→p4→p5）。

⚠️ **别以为「乙」只会长在 P4 的用例里。** 它也能在**别的套件的 setup 阶段**发作，而且长相很不一样、
更容易被误读：**整份套件 N 条一次性全红、报错信息一模一样**，比如
「等待『应停在首页』超时（15000ms）。**当时实际停在：`pages/login/index`**」
（2026-10-11 实测于 `p2-chat.e2e.js` 的 `beforeAll`，卡在 `gotoIndex()`）。
遇到这个形状**不要一头扎进用例本身** —— 一条都没跑到，说明问题在**进首页这一步**，属本文这一节。
它还是**偶发**的：同一台机器、同一天跑了 3 轮 `p2-chat`，**只有 1 轮**在 `beforeAll` 中招
（另外 2 轮的 `beforeAll` 都正常通过 —— 其中一轮是**故意把代码改坏**跑的，那轮的 5 红是预期结果，与本节无关）；
而且**跟残留 `wechatdevtools` 进程无关**（中招那轮有 9 个残留，
另有一轮**有 8 个残留却全绿**）。
⚠️ **成因未查明**，标「需确认」；只知道现象与复跑可恢复，**别据此改业务代码**。

**2026-10-11 又见到它两次，而且是「镜像」那种**（补三条取消支用例那轮跑出来的）：

| 次数 | 长在哪 | 报错 | 耗时 |
|---|---|---|---|
| 复发 1 | `p2-chat.e2e.js` 的 `beforeAll` | 整份套件 8 条全红，`P2-01` 在 **1 ms** 就红 —— 就是上面那条「乙」 | — |
| 镜像 1 | **`P4-01`** | 「等待『本地过期后应被踢到登录页』超时（5000ms）。**当时实际停在：`pages/index/index`**」 | 13.1s（正常约 1.7s） |
| 镜像 2 | **`P4-04`** | 同上形状：**该被踢走却留在原地** | 15.6s |

**「镜像」是指**：前面记的「乙」是**测试发的导航没生效**（应用还停在登录页）；这两次是
**应用该发的导航没生效**（应用没被踢走、还停在业务页）—— 方向反过来，但看着都像「导航丢了」。
两次都是**复跑即恢复**，且同轮别的用例全绿。

> ⭐ **2026-10-12 补记：这两次「镜像」已经定到原因了**（见下方同名补记）——
> 根因不是存储、不是应用逻辑，而是**测试那发「reLaunch 首页」没让首页重新挂载**，
> 于是触发链压根没跑起来。下面那个「统一猜想」也因此在本场景下**撤回**。

⭐ **一个统一的猜想（⚠️ 只是猜想，未做验证，标「需确认」）**：
这三次、以及 P4-04 原先那次「清完存储却没被踢」，可能都是**同一条根因的不同脸** ——
**测试侧看到的存储 和 应用看到的存储会不同步**（新近发现，单独记在 **§6.8**）。
按这个猜想：应用「没被踢」是因为**它眼里登录态还有效**（测试没清到它看的那个副本），
而不是应用逻辑坏了。⚠️ **没有验证过**，写在这里只是为了下次遇到能少走一段路 ——
**不要据此改 `src/`，也不要据此改断言**。要验证它，得在失败现场同时读两条通道
（`helpers.getKey` 与 `helpers.readAuthKeysInApp`）比对，见 §6.8 的「怎么确认」。

> ⚠️ **2026-10-12 更新：这个猜想在本场景下已经撤回了** —— 对照实验里两条存储通道
> 三个方向全都对得上，见下方同名补记。§6.8 自己的观察仍然有效，但**不能拿来解释这类红**。

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

**2026-10-12 补记：残留那次红定到「首页没被重新挂载」，顺带撤掉一个猜想**

（跑了 5 轮一次性探针，临时文件 `e2e/zz-probe-p4.e2e.js`，**用完已删**。下面只记结论。）

**结论（能直接拿去做判断的那句）**：P4-01 / P4-04 的踢人**全靠**「首页被重新挂载 →
`onMounted` → `fetchSessions()` → `request()`」，而 `onMounted` 只在挂载时跑一次。
所以只要测试那发 `reLaunch(首页)` **没让首页重新挂载**，应用就会**永远停在首页**：
存储一个没少、也不弹任何提示，等多久都不会跳。**这正是 2026-10-11 那次「镜像红」的现场。**

两组对照（都用**真 token**，即后端发的 926 字符 JWT）：

| 臂 | 做什么 | 结果 |
|---|---|---|
| **T1**（8 轮） | 停在首页 + 把会话改成「本地已过期」→ **发一次 `reLaunch(首页)`** | **8/8 被踢**；6 个 key 全清；提示「登录状态已过期，请重新登录」；`reLaunch` **全部回包**，耗时 931–1106ms |
| **T2**（3 轮） | **前提完全相同，但不发任何导航** | **0/3 被踢**；停在 `pages/index/index` 干等 5 秒；key **一个没少**（`auth_token` 926 字符）；无提示 |

⇒ 「重挂一次首页」是被踢的**必要条件**。T2 的现场与那次镜像红**逐项对得上**。

**时长也对得上**（旁证）：P4-01 正常约 1.7s，红的那次 **13.1s** ≈ 8s（`helpers.reLaunch`
不回包的超时，`nav.js:40`）+ 5s（`waitForPage`）；P4-04 的 **15.6s** ≈ 3s + 8s + 5s。

**顺带撤回一个猜想**：§6.8 那套「测试侧看到的存储 ≠ 应用侧看到的存储，所以应用眼里登录态
还在」**在这个场景里不成立**。专门做了存储对照实验，两条通道交叉读写 ——
`callUniMethod` 写 → `wx` 读、`wx` 写 → `callUniMethod` 读、`callUniMethod` 删 → `wx` 读
—— **三个方向全对得上**。T2 那 3 轮里 key 也是完完整整的 926 字符，不存在「测试以为清了、
应用还留着」。§6.8 自己那条观察（P4-03 取消支里单独把 `auth_token` 读成空串）**仍然有效、
仍然没查明**，只是**不能拿来解释这一类红**。

⚠️ **还没查明的（标「需确认」）**：*为什么*测试发的 `reLaunch` 偶尔不生效。探针里连着逼了
20 多次 `reLaunch`，**一次都没丢** —— 它本来就是偶发，跟 §5.3 那族「导航被环境丢弃」同源。

**下一次再遇到这个红，怎么读**（新加的失败现场就是为这件事）

`p4-auth.e2e.js` 里 P4-01 / P4-02 / P4-04 现在改走 `waitForKickToLogin()`：超时后除了原来的
「当时实际停在：xxx」，还会多贴四行现场（当时停在哪页 / 应用侧 4 个 key 的长度 / 测试侧 6 个
key 的长度 / 等待期间应用弹过的提示）。照着读：

| 现场 | 判读 | 往哪走 |
|---|---|---|
| 4 个 key **还在** | 触发链压根没跑起来 —— 这发 `reLaunch` 没让首页重新挂载 | 就是本节（T2 的现场）⇒ 重跑，**别改断言、别改 `src/`** |
| key 已清 + **弹了提示** | 走的是 `expireAuthAndRedirect()` 那条，**确实决定了要跳**，但那发导航丢了 | §5.3 那一族 |
| key 已清 + **没弹提示** | ⚠️ **不能直接下结论** | 见下 |

⚠️ 为什么最后那格不能定因：应用一共有**四条**踢人路径，其中**三条本来就不弹提示**
（`App.vue` 的 `onShow` 守卫、导航拦截器、`onLaunch` 的 `restoreSession`）。2026-10-12 实测过
这一幕：单独跑 P4-01、故意去等一个不存在的页面（等 3 秒），应用**照样自己跳到了登录页**，
而全程**一次提示都没有**。所以「没提示」既可能是被 `redirecting` 旗标吞了（甲-a），
也可能只是走了另一条不弹提示的路。⇒ 遇到这格，按 2026-10-09 的探针法再查。

> 附一笔（免得下次怀疑桩坏了）：这类「包一层 `wx.showToast`」的旁观桩，**和 2026-10-09
> 探针里手写的那层包装是同一个机制**，探针那次是记到了提示的。今天它记不到，是**因为那条
> 路径压根没弹提示，不是桩失效** —— 这点专门验过：桩装上了（自检返回已打补丁）、页面也
> 确实跳到了登录页，而记录仍是空的。

**本轮改动**：`p4-auth.e2e.js` 新增 `waitForKickToLogin()`（**只改失败时的报错文案**）+
`beforeAll` 里装一个只记录的提示旁观桩；三个调用点（P4-01 / P4-02 / P4-04）改用它。
**判定、断言、`src/` 一律没动**，改前改后各跑一轮整套 P4：**都是 7/7 通过**。

⚠️ **方法学教训：探针必须先验证，再拿它的沉默当证据**

这一轮之前走过弯路，记下来免得重犯：

- **`program.evaluate` 里的 `uni` 其实是 `wx`**（automator 序列化时会注入 `var uni = wx;`），
  而应用用的是 uni-app 自己那个 `uni` 对象 —— **不是同一个东西**。
- 更坑的是**路由 API 拦不到**：给 `wx.reLaunch` 包一层，**只能拦到测试自己发的导航**，
  应用发的看不见（uni-app 在启动时就缓存了原生函数引用）。而**通用 API 拦得到** ——
  `showToast` / `removeStorageSync` 都能记下应用侧的调用。
- ⇒ **上一轮「计数器证明应用没发起跳转」的结论是错的，已撤回**（这次靠 `showToast` 才真正
  看清）。**正确姿势：先拿一条「已知必然走这条代码路径」的绿灯用例（这里是 P4-01）验证
  探针能记下应用的动作，再去解读它在失败用例里的沉默。**

**2026-10-12 再加两条**（都是这一轮探针踩出来的，代价是前三版结论全部作废）：

- **探针必须用和套件一样的夹具，不能用手造的东西代替。** 前三版探针为了省事，自己拼了一个
  JWT 塞进存储。结果：后端**一律回 401**，而前端收到 401 **自己就会**走
  `expireAuthAndRedirect()`（清 key + 提示 + 跳登录页）—— 于是**每一臂其实都跑在「应用早已
  自认未登录」的状态下**。后遗症是两条结论全错：D1 的「12/12 绿」是**假绿**（应用本来就停在
  登录页，`waitForPage(登录页)` 一读就满足），D2 的「不发导航也被踢 4/4」也是这么来的。
  **两条都撤回**；换成真 token 的 T1 / T2 才是干净的对照。
- **每一轮都要自检起点，并且把起点打进日志。** 上面那种「一整臂都跑在错误状态里」的事，
  只要每轮开头确认一句「此刻真的停在首页吗」，当场就能发现。探针里后来就是这么写的
  （起点不是首页就标记本轮作废），日志里也留了痕。

**这一轮的运行记录**

| # | 命令 / 动作 | 跑了几次 | 结果 |
|---|---|---|---|
| 24 | 探针 v1–v3（手造 JWT） | 3 次 | 结论**全部作废**（见上：假绿 + 误判），只买到「两条存储通道不同步」这个否证 |
| 25 | 探针 v4（换**真 token**） | 1 次 | 存储对照实验 **三个方向全对得上**；同时**一次复现**出「不发导航就不被踢」 |
| 26 | 探针 v5：T1 发 `reLaunch` / T2 不发 | 1 次（11 轮） | **T1 8/8 被踢**（key 全清、有提示、reLaunch 931–1106ms 全回包）；**T2 0/3 被踢**（停在首页、key 一个没少） |
| 27 | 改完 `p4-auth.e2e.js` 后跑 `test:e2e -- p4-auth` | 1 次 | **7/7 通过**（63.5s） |
| 28 | 反向验证：临时把 P4-01 的等待缩到 50ms / 300ms / 3s（并故意等一个不存在的页面） | 3 次 | 失败现场**确实会打出来**（key 长度、提示、判读都在）；并顺带查明「有提示那次和没提示那次走的是不同路径」。**验完已把超时改回 5000** |
| 29 | 反向验证后重跑 `test:e2e -- p4-auth` 收尾 | 1 次 | **7/7 通过**（63.5s）⇒ 改前改后一致，判定未变 |

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
| 16 | 为 P2-01 找原因的四组测量：① 8 秒后有没有迟到帧 ② 挂载后 8 秒才发 ③ 重启开发者工具 ④ Windows 侧 `curl` 直连同一个接口 | 4 组 | **四组全部否掉「应用丢了第一条流式请求」这个理论**（连 Windows 侧裸 `curl` 都能复现空流 ⇒ 跟应用无关）。真正原因是模型服务方**在单次生成超过约 21 秒时**返回**空流**，见 §5.10 与 D-07 |
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

**24–28 是 2026-10-18 的整轮执行记录**（Windows 侧全量跑 + P2 复跑）：

| # | 命令 / 动作 | 跑了几次 | 结果 |
|---|---|---|---|
| 24 | 修复开发者工具 3799 被 WinNAT 保留段占用（`cli.bat islogin` → `EACCES 127.0.0.1:3799`；管理员 PowerShell `net stop winnat` / `net start winnat`） | 1 次 | `islogin` 返回 `{"login":true}`、IDE server 听在 34376；6 个套件恢复可启动。成因与完整命令见 §6.1 第三种成因 |
| 25 | `npm run test:e2e -- p1-trading`（后端进程已自己死掉） | 2 次 | 第 1 次 **22/22 全红**；`curl 127.0.0.1:8000/docs` 返回 000 ⇒ 带 `E2E_MARKET_FIXTURE` + `ENABLE_TEST_ENDPOINTS=1` 重启后端后复跑 **22/22 通过（186.8s）** |
| 26 | `npm run test:e2e`（全量第 1 轮） | 1 次 | **4 套件没通过 / 19 条**（1510.6s）：P4 的 7 条全卡在 `POST /api/secure-chat/register` 15s 超时、P3-03 ⑥ 卡在 2s 等后端列表更新。后端日志显示同批请求 200/409，判为 6 套件串行时的负载性超时，**第 2 轮未复现** |
| 27 | `npm run test:e2e`（全量第 2 轮，`Tee-Object` 留档） | 1 次 | **58 通过 / 8 没通过 / 66**；只有 P2 没通过：8 条全是 `beforeAll` 的**同一条错误**（`gotoIndex` 的 reLaunch 8s 无回包，页面停在 `pages/register/index`），用例体一条都没执行。P1/P3/P4/P5/hello 全过 |
| 28 | `npm run test:e2e -- p2-chat`（复跑） | 1 次 | **8/8 通过（110.6s）** ⇒ 全量下的 P2 没通过是套件顺序/导航偶发（§6.6「乙：跳没生效」），不是用例或产品问题 |
| 29 | 把 `gotoIndex` 改成 `helpers.gotoPage(..., { force: true })`（内置静置 3 秒 + 最多 3 次退避重试，见 §6.6 末尾），连续复跑 | 4 次 | **3 轮全绿**（119.3s / 128.7s / 111.4s）；**1 轮 5 红**（93.4s）。4 轮都**没有**再出现导航失败或 `gotoPage` 重试告警。那轮 5 红的日志被启动命令的 `tail` 截掉，只剩 P2-06 的条数断言；但后端日志显示**整轮没有一次 `PUT .../title`** ⇒ 失败起点在 P2-04 的抽屉操作，后 4 条缺前置连坐，**与导航无关、未复现**，标「需确认」 —— ⚠️ **订正（2026-10-18 晚）**：真正起点是 **P2-03 断言了异步刷新的旧快照**，P2-04 根本没执行；见 §6.6 末尾「再追加」 |
| 30 | ⭐ **加固后的全量第 3 轮**（`D:\run_full.cmd`，完整日志 `D:\full-run.log`） | 1 次 | **60 通过 / 6 没通过 / 66**（501.6s）。**P2 的 `beforeAll` 导航问题没有再出现** —— P2-01/02/03/07 正常执行并通过，后端有 3 次 `POST /api/secure-chat` 均 200 ⇒ `gotoPage` 加固对目标问题有效。没通过的 6 条：P2-04、P2-05（取消支）、P2-05 删除、P2-06（缺前置连坐），以及 P4-03 两条。**P2 这组仍是老形状**：抽屉按钮点了、`wx.showModal` 没记录、后端**整轮没有一次 `PUT .../title`**；P2-04 等标题 15s 超时，P2-05 两条的「弹窗确实弹了」对照组为 0。**P4-03 形状不同**：弹窗调用读数为 0，但后端有 `POST /api/secure-chat/logout 200` ⇒ 应用的处理函数其实跑了，判为测试侧「`tap()` 之后立刻读」的竞态。另：P3 的 `openWatchlist` 有 3 次、P5 有 1 次「第 1/3 次没落到」重试告警，**都在第 2 次成功**、两个套件仍全过 ⇒ 导航丢失仍偶发，`gotoPage` 重试在兜底 |
| 31 | 针对 #30 里 P4-03 的竞态：两处「`tap()` 后立刻读弹窗记录」改成**轮询等记录出现**（`helpers.waitFor`，最多 5s），单跑 `test:e2e -- p4-auth` | 1 次 | **7/7 通过**（77.1s），P4-03 与取消支都过 ⇒ 改动没弄坏原流程。⚠️ 这两条本来就偶发，**通过不能证明竞态已被彻底覆盖**，只能说读法改稳了；要等下一次全量再验收 |
| 32 | 按 §6.6 末尾「再追加」修 P2-03：不再断言采样快照，改用 `helpers.waitFor` 等会话列表收敛（8s）；先补 5 轮基线，再连跑 5 轮 | 5 + 5 次 | 基线（未修）**5 轮全绿**（110.5–115.4s），符合「约 1/4 概率、这轮没踩中」；修后**5 轮全绿**（109.5 / 107.9 / 117.2 / 115.4 / 108.5s，每轮 8/8）。⭐ **反向验证**：把条件临时改成 `=== 3`（永远不成立）→ **5 没通过 / 3 通过 / 93.9s**，P2-03 报「等待『发完消息后会话列表刷成 2 个（新会话排第一）』超时（8000ms）」，后面三条「缺前置」、P2-06 拿到 2 条 ≠ 4 —— **与原偶发那一轮（93.4s / 5 红）形状一致**；还原后复跑 **8/8 通过（110.3s）** |
| 33 | P2 修好后第 1 次全量（`D:\full-after-p2fix.log`） | 1 次 | **65 通过 / 1 没通过 / 66（495.5s）**，**P2 一次没再红** ⇒ P2-03 的修复有效。唯一没通过的是 **P4-00 的 `beforeAll`**：那轮顺序 `p1 → p2 → p3 → p5 → p4 → hello`，P5 停在 `pages/register/index`，P4-00 第一发 `reLaunch(登录页)` 被吞、等登录页超时。判为套件边界导航丢失（同 §6.6「乙」），与产品无关 |
| 34 | 单跑 P4 ×2，确认 #33 与产品无关 | 2 次 | **7/7 通过**（69.7s / 76.9s）⇒ 加固前先证明「单跑没问题」，再把 P4-00 换成 `helpers.gotoPage`（不用 `force`） |
| 35 | 加固后第 2 次全量（`D:\full-run2.log`） | 1 次 | **65 通过 / 1 没通过 / 66（539.2s）**：**P4 通过（56.9s）**，加固生效；这次换成 **P3-04 ①** 报「等待『后端自选已清空』超时（10000ms）。最后一次：…挂起超过 2000ms（无回包）」。后端日志同窗口 `DELETE /api/watchlist/clear 200（removed=2）`、`GET /api/watchlist/list 200（total=0）` ⇒ **后端答了**；失败窗口出现 APScheduler「job was missed by 2.0s / 4.6s」，判为后端进程短暂卡顿超过 `waitFor` 单次尝试的 2s 上限。单跑 P3 两轮：**21/21（145.6s）** 与 **1 没通过 / 20 通过（146.3s，失败点换成 P3-04 取消支的对照组，同形状）** ⇒ 与用例/产品无关，**属环境/负载类，未定案（需确认）**，详见 §6.6 末尾「再追加 2」 —— ✅ **2026-10-19 已查明**：D-09（后端每个请求重建 Supabase 客户端），同见该节 |
| 36 | ⭐ **最后一次全量验收（`D:\full-run4.log`，后端重启后）** | 1 次 | **6/6 套件通过、66/66 条通过（541.4s）**。顺序 `p3 → p1 → p2 → p5 → p4 → hello`（各套件 170.4 / 144.1 / 103.6 / 73.4 / 49.5s，hello 即时）。**P3-04 的环境卡顿没有复现**，P2 / P4 均一次通过 ⇒ P2-03 与 P4-00 两处加固在「全量 + 全新后端进程」下验收通过。注：中途被会话结束打断的上一轮（只跑到 P1/P3）里 P3 也是通过的，进一步说明 #35 那条是偶发 |
| 37 | ⭐ **补齐 P2 流式异常 4 条 + P5 异常分支 4 条后的第 1 次全量**（`D:\full-run5.log`） | 1 次 | **73 通过 / 1 没通过 / 74（641.5s）**，新增的 P2-08~11、P5-05~07 全部通过 ⇒ 与既有用例共用一个 App 实例不互相干扰。唯一没通过的是 **P3-04 ①**，报错与 #35 **逐字同形**：「等待『后端自选已清空』超时（10000ms）。最后一次：…挂起超过 2000ms（无回包）」。同窗口后端日志 `DELETE /api/watchlist/clear 200`、随后多次 `GET /api/watchlist/list 200（total=0）` ⇒ **后端答了、数据也清掉了**，是 Node 侧单次尝试没在 2s 内等到（负载/后端卡顿超过 `waitFor` 单次上限），**不是用例或产品问题**；单跑 `test:e2e -- p3-market-watchlist` **21/21 通过（157.1s）**，P3-04 ① 耗时 3.5s。属已知偶发（#35 / D-09），**只登记不改** |
| 38 | ⭐ **第 2 次全量验收（`D:\full-run6.log`，同一后端进程）** | 1 次 | **6/6 套件通过、74/74 条通过（533.3s）**。顺序 `p1 → p3 → p2 → p5 → p4 → hello`（各套件 180.7 / 120.9 / 110.1 / 78.1 / 43.1s，hello 即时）。**P3-04 没有复现**；新增的 P2-08~11、P5-05~07 在全量下全部通过 ⇒ 74 条共用同一 App 实例互不干扰。**74/74 的干净全量验收到此完成** |

⚠️ **P5 每跑一轮真写 2 个账号**（走 HTTP 的 + 走真实注册页 UI 的），两个都在 `afterAll` 里注销。
首跑因用例中途失败漏掉了 UI 那个（当时 `uiAccount` 是在末尾才赋值的），**已改成「点提交之前就先登记待清理」**。

注意 `-t 'P4'` 实际跑 **10 条**（P4 的 7 条 + P3-05 的 3 条 —— 见 §1 的 ⚠️，`-t` 是按完整用例名匹配的，把 describe 标题里含 "P4" 的一起捞了进来）。

**2026-10-10 补 P4-03 / P4-05 时踩的两个坑**（都已固化进代码注释与 `helpers/uniMock.js`）：

1. **`mockUniMethod('showModal', {confirm:true})` 让确认框自动点确定 —— 不管用。**
   它改的是 uni-app 自己的 `uni` 对象（实现是 `uni[method] = mockFn`），而应用的
   `const result = await uni.showModal({...})` 依赖 uni-app 的 **promisify 包装**；
   包装被换成裸函数后没人 resolve → `await` 拿到 `undefined` → `!result.confirm` 抛错。
   **症状是「点了没反应」，特别容易误判成元素没点到。**
   规律：**回调写法**（`success: (res) => ...`，如 `watchlist/index.vue#L548`）用 `mockUniMethod` 有效；
   **`await` 写法**（如 `settings/index.vue:204`）必须换 `wx.showModal`。
   用的是新 helper `helpers/withNativeModal`（做法：`program.evaluate` 里直接改写 `wx.showModal`）——
   实测 evaluate 里的 `uni` **就是 `wx`**（`uni === wx` 为 true）。
   副产品：换的时候顺手把入参录下来，**弹窗文案因此也能断言了**（`readNativeModalCalls`）。
   ⚠️ **2026-10-11 补记：这条规矩反过来也成立，而且「用错」是静默的。** 写 P3-04（取消支）时
   我给 `watchlist` 那个**回调写法**的调用点也用了 `withNativeModal` —— 结果**一次都没记到**
   （`readNativeModalCalls` 回 `[]`），**不报错、不挂起、用例照跑**，是最难发现的那种失效。
   改成 `confirmNextModal` 之后正常。⇒ **两种桩各管一种写法，选桩只看应用那一行怎么写**；
   判据表与「怎么发现自己用错了」见 **§6.8**。
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

**2026-10-18 补：P2 的 `gotoIndex` 已改用 `gotoPage`（针对「乙」的测试侧加固）。**

- **起因**：全量跑时 P5 刚结束、页面停在注册页，P2 的 `beforeAll` 立刻发 `reLaunch('/pages/index/index')` →
  8 秒无回包、页面不动 → 等首页 15 秒超时 → **8 条用例报同一条 `beforeAll` 错误，用例体一条没执行**。
  同一文件单跑 **8/8 通过** ⇒ 判为套件顺序/导航偶发，不是用例或产品问题。
- **改法**：`gotoIndex` 不再裸发 `reLaunch`，改用 [`helpers.gotoPage`](helpers/nav.js)——
  它内置「**发之前先静置 3 秒 + 失败退避 8 秒重试，最多 3 次**」。
  ⚠️ 必须带 `force: true`：已经在首页时也要重新挂载，P2-06 靠 `onMounted` 重新拉历史消息。
- **效果（连跑 4 轮）**：**3 轮全绿**（119.3s / 128.7s / 111.4s，比改前多约 9–18 秒）；
  **4 轮都没有再出现导航失败，也没有一次 `gotoPage` 重试告警**。
  剩下 1 轮 5 红（93.4s）：该轮日志被启动命令的 `tail` 截掉，只能看到 P2-06 在消息条数上对不上；
  但后端日志显示**整轮没有一次 `PUT .../title`** ⇒ 失败起点在 **P2-04 的抽屉操作**（重命名请求根本没发出），
  后 4 条是缺前置连坐，**与导航无关、后续 3 轮未复现**，标「需确认」。
  ⚠️ **2026-10-18 晚订正**：这段推断是错的 —— 起点在 **P2-03 断言了异步刷新的旧快照**，
  P2-04 压根没执行；机理、证据与修复见本节末尾「2026-10-18 再追加」。
- 仍**不能保证 100%**：这类导航丢失只能降低概率，别把这条改动当成「从此不会再偶发」。

**2026-10-18 补：加固后的全量复跑（6 个套件串行）。**

- **目标问题没有再出现**：P2 的 `beforeAll` 正常落到首页，P2-01/02/03/07 都执行并通过，后端有 3 次
  `POST /api/secure-chat` 均 200 ⇒ `gotoPage` 加固对「乙」在 P2 `beforeAll` 上的表现确实有效。
- 但这一轮 **60 通过 / 6 没通过 / 66**：P2-04、P2-05（取消支）、P2-05 删除、P2-06（连坐），
  加上 **P4-03 两条**。P2 这组仍是上面那轮单跑 5 红的形状：抽屉按钮点了、`wx.showModal` 没记录、
  **后端整轮没有一次 `PUT .../title`**，等标题 15s 超时；**成因仍未查明，标「需确认」**。
- **P4-03 不是同一类**：弹窗调用读数为 0，但后端有 `POST /api/secure-chat/logout 200`
  ⇒ 处理函数其实跑了，只是测试侧 `tap()` 之后**立刻**读，读在了应用处理点击之前。
  P2-05 两条的「弹窗确实弹了」对照组为 0 也可能是同一竞态，但没有后端证据支持，不并入结论。
- **已按上面的证据改稳 P4-03 两处的读法**：`tap()` 后不再立刻读一次，改为轮询等弹窗记录出现（最多 5 秒）。
  单跑 `test:e2e -- p4-auth` **7/7 通过（77.1s）**，但这两条本来就偶发，通过**只说明没弄坏**，
  竞态是否真被覆盖，要等下一次全量里再遇到才知道。
- 导航侧：P3 的 `openWatchlist` 出现 3 次、P5 出现 1 次「第 1/3 次没落到」告警，
  **全部在第 2 次重试成功**，两个套件仍全过 ⇒ 导航丢失仍偶发，`gotoPage` 重试在起兜底作用。

**2026-10-18 追加：上面那 6 条红的成因已查明 —— P3 泄漏了 `uni.showModal` 的 mock，不是用例竞态。**

- **证据一（日志）**：该轮全量里 `App.mockUniMethod` 共 4 次、**`restoreUniMethod` 0 次**，全部发生在 P3
  （13:36:46 / 13:37:01 / 13:37:12 / 13:37:16，最后一次是 `{confirm:true}`）。mock 改的是 uni-app 自己的
  `uni.showModal`（`uni[method] = mockFn`），**一直留到 app 实例销毁**；套件顺序是 p1 → p3 → p2 → p4。
- **证据二（行为完全吻合）**：P2-04 的重命名 → mock 返回 `{confirm:true}` 但**没有 `content`**
  ⇒ `res.confirm && res.content && res.content.trim()` 为假 ⇒ 不调 `renameChat` ⇒ **后端整轮无 `PUT .../title`**、
  标题不变、`wx` 桩 **0 条**；P2-05 删除 → 回调只看 `res.confirm` ⇒ **真删**（后端那两笔 `DELETE`）、
  但 `wx` 桩 **0 条**；P2-05 取消支的「弹窗确实弹了」对照组同样是 0；P2-06 缺前置连坐。
- **证据三（现场复现，临时探针已删）**：干净环境下只装 `wx` 桩点「清空自选」→ 记到 1 条；
  **先装 `mockUniMethod('showModal', {confirm:true})` 再装 `wx` 桩** → 记到 **0 条**，但后端**照样清空**
  ⇒ mock 盖住了 `wx.showModal`，且**静默无报错**。
- **订正 P4-03 的结论**：上一段说「P4 是 `tap()` 后立刻读的竞态」**不成立** —— 同一轮里 P4 也跑在 P3 之后，
  `wx` 桩同样被 mock 盖住，所以读数**永远**是 0（也因此 10-18 改的 `waitFor` 轮询在**全量**里救不了它，
  只在单跑 P4 时有效）。P2-05 两条同理，不是两条不同的病，是**同一个泄漏**。
- **真凶位置**：`p3-market-watchlist.e2e.js` 的 4 处 `helpers.confirmNextModal(...)`
  （:646 / :701 / :794 / :816）**都是裸调**，没有任何 `restoreUni`，`afterAll` 里也没有兜底。
  而 `helpers/uniMock.js` 的 `withMockedUni` 注释早就写了「一定要用这个而不是裸调 mock……制造出极难查的串扰」。
- **已修复（2026-10-18，测试侧）**：采用「更彻底」方案 —— 4 处全部改成
  `helpers.withNativeModal(program, { confirm }, async () => { await xxx.tap(); })`（自还原、还能录文案），
  结果式 mock 从用例里彻底去掉；`helpers/uniMock.js` 里 10-11 那条「回调写法拦不到」的错误注释一并订正。
- **验收（全量）**：单跑 P3 21/21（165s）→ 全量 **66/66 通过、6/6 套件 PASS（501.7s）**；
  P2-04 / P2-05×2 / P4-03×2 全部通过；全量日志里 `App.mockUniMethod` **0 次**。
  单跑 P2/P4 本来就绿，证明不了修复，验收只认全量。

**2026-10-18 再追加：上面那轮「单跑 P2 的 5 红」也查明了 —— 是 P2-03 的断言赌了「异步刷新」的时序。**
（**订正**：前面两处写的「起点在 P2-04 的抽屉操作」**不对**。P2-04 根本没执行用例体，
它死在 `requireChat(state.chat2)` 的「缺前置」；后端整轮没有 `PUT .../title` 只能说明
**重命名请求没有发出**，不能反推成「抽屉点开了但没反应」。）

- **机理（产品代码没毛病）**：`handleSend` 里 `chatStore.fetchSessions()` **没有 await**
  （[index.vue:409](../../application/src/pages/index/index.vue#L409)），紧接着 `finally` 就把
  `sendingMessage` 置 false（[index.vue:416](../../application/src/pages/index/index.vue#L416)）。
  而 `sampleBotBubble` 的退出条件是「bot 非空 **且** 不在发送中」——
  所以它可能在**会话列表的 HTTP 响应回来之前**就返回。P2-03 却直接断言
  `sample.last.sessions` 有 2 条（[p2-chat.e2e.js:542](../../application/e2e/p2-chat.e2e.js#L542) 改前），
  撞上「列表还是 1 条」那一帧就红。
- **证据（三条独立线索）**：
  - **后端日志**：chat2 的回答落库后，下一条 jest 侧请求直接是 P2-06 的 `getMessages(chat1)`
    —— P2-04 / P2-05（取消支）/ P2-05 **一条 HTTP 都没发**，印证它们死在「缺前置」而不是抽屉；
  - **开发者工具日志**（`WeappLog/logs/2026-10-18-20-55-01-898-IPWAvXPPaG.log`）：P2-03 之后整轮
    只有 **3 次页面跳转**（P2-06 两次 Tab 切换 + P2-07 的 `gotoIndex`），P2-04 ④ / P2-05（取消支）
    收尾的 `gotoIndex` 都没发生 ⇒ 这两条确实没走到结尾；
  - **耗时**：那轮 93.4s，正常约 110–117s —— 差的正是两条 15 秒的 `waitFor`（P2-04 等标题、
    P2-06 等回填），它们都在「缺前置」之前就被跳过了；反向验证复现的一轮是 93.9s，形状一致。
- **概率对得上**：采样轮询间隔 200ms、列表刷新约几十毫秒 ⇒ 约 **1/4** 的轮次踩中。
  事后补跑 5 轮基线**一次都没复现**（110.5–115.4s），也和这个概率相符。
- **修法（测试侧，没碰 `src/`）**：P2-03 不再断言采样快照，改成用 `helpers.waitFor`
  **等会话列表真收敛**（最多 8 秒，标签「发完消息后会话列表刷成 2 个（新会话排第一）」），
  断言仍落在应用的真实状态上；`sampleBotBubble` 的注释同步写明「`last` 只是退出那一刻的快照，
  别直接断言 `last.sessions`」。
- **验收**：修后连跑 **5 轮全绿**（109.5 / 107.9 / 117.2 / 115.4 / 108.5 秒，每轮 8/8）。
  **反向验证**：把条件 `=== 2` 临时改成 `=== 3`（永远不成立）→ **P2-03 按新标签超时变红**
  （`5 没通过 / 3 通过`，93.9s，P2-04/05/05 取消支三条「缺前置」、P2-06 拿到 2 条 ≠ 4）
  ⇒ 新断言读的是实时状态，不是碰巧绿。已还原，还原后再跑一轮 **8/8 通过**。
- **顺带一条通用纪律**（已写进 skill `references/02` §5.1 第 4 条）：**断言「异步刷新之后」的状态，
  要等它落地，别赌轮询快照** —— 应用把请求「发出去就不管」时，任何「此刻」的读取都可能早于响应。

**2026-10-18 再追加 2：P2 修好之后连续两轮全量各挂 1 条，但两次是不同的条、不同的成因。**

这两轮（539.2s / 约 540s）都是 `65 通过 / 1 没通过 / 66`，**P2 一次都没再红**，
说明上面那处修复有效。两条红的成因分开记：

- **第一条：P4-00「开套件就落在登录页」的 `beforeAll` —— 套件边界上导航被吞（已加固）。**
  - 那轮顺序是 `p1 → p2 → p3 → p5 → p4 → hello`，P5 结束时页面停在 `pages/register/index`；
    P4-00 第一发 `reLaunch(/pages/login/index)` 被吞，随后等登录页 5 秒超时（实际停在 register）。
  - **判据**：单跑 P4 连跑 2 轮都是 **7/7 通过**（69.7s / 76.9s）⇒ 与产品无关，是套件边界问题。
  - **⚠️ 套件顺序不是固定的**：`jest.e2e.config.js` 里没有任何排序配置，jest 按历史耗时排序。
    所以「上一个套件最后停在哪」每轮都可能不同 —— 加固要按「不知道从哪来」写，
    不能假设从首页或登录页开始。
  - **修法**（同 P2 的 `gotoIndex`）：P4-00 改用 `helpers.gotoPage(program, LOGIN_ROUTE, LOGIN_PATH)`
    （[p4-auth.e2e.js:314](../../application/e2e/p4-auth.e2e.js#L314)；实现见
    [nav.js:103](../../application/e2e/helpers/nav.js#L103)）—— 内置「发之前先静置 3 秒 +
    最多 3 次、退避 8 秒重试」。这里**不用** `force`：只要落在登录页即可，不要求重新挂载。
  - **验收**：加固后的下一轮全量 P4 **通过**（56.9s）。

- **第二条：P3-04 读后端自选列表时「无回包」超时 —— 后端短暂卡顿。根因已查明（2026-10-19，D-09）。**
  - 失败文案：`等待「后端自选已清空」超时（10000ms）。最后一次：抛错：「后端自选已清空」挂起超过 2000ms（无回包）`。
    另一轮单跑 P3 时，失败点换成了 P3-04（取消支）的对照组，**同一条形状**。
  - **后端其实是答了的**：同一窗口的后端日志里 `DELETE /api/watchlist/clear` **200（removed=2）**、
    紧随的 `GET /api/watchlist/list` **200（total=0）** ⇒ 不是接口错、也不是数据没清掉。
    两处断言点分别在 [p3-market-watchlist.e2e.js:718](../../application/e2e/p3-market-watchlist.e2e.js#L718)
    与 [:829](../../application/e2e/p3-market-watchlist.e2e.js#L829)（都给了 10 秒总预算）。
  - **线索指向后端进程自身停顿**：两个失败窗口各出现一次 APScheduler 的
    「job was missed by `0:00:01.955729`」/「`0:00:04.567091`」；而 `helpers.waitFor` 对**每次**尝试
    只给 `max(200ms×5, 2000ms)`（[waitFor.js:54](../../application/e2e/helpers/waitFor.js#L54)），
    后端一卡 2–4.5 秒，这一次尝试就被判「挂起」，10 秒总预算也跟着耗光
    （`requestJson` 自己给了 15 秒，[api.js:33](../../application/e2e/helpers/api.js#L33)，没到上限）。
  - 机器体检：后端进程已连续跑 5 小时 19 分、常驻内存约 950 MB；主机 20 核、空闲内存约 3.5 GB，
    **不是整机被拖垮**。P3 单跑结果：第 1 轮 **21/21 通过（145.6s）**，第 2 轮 **1 没通过 / 20 通过（146.3s）**。
  - **根因已查明（2026-10-19，登记为 `ai-etf/docs/e2e/00-背景与已知问题.md` 的 D-09）**：
    `get_supabase()` **每次调用都 `create_client`**（[supabase_client.py:13-33](../../ai-etf/server/storage/supabase_client.py#L13-L33)），
    而服务是**每个请求 new 一个**（[watchlist_service.py:18-21](../../ai-etf/server/services/watchlist_service.py#L18-L21)）。
    单次创建 p50 **311 ms**：耗时几乎全在 httpx 建 SSL 上下文，证书包在 `/mnt/d` 跨盘读 **81 ms/次**；
    环境里的 `HTTP(S)_PROXY` 又让一个客户端建 3 个上下文。
    **受控加压**（本机）：健康端点 16 并发 p50 **11 ms**；DB 端点同负载 p50 **11.8 s**、`128/128` 超 1 秒，
    期间定时任务延迟记录 +5。**临时把客户端缓存后**同负载 p50 **638 ms**、最慢 923 ms、**0 条超 1 秒**，
    进程只初始化 1 次、定时任务零延迟。
  - **处置**：**E2E 侧不改** `waitFor` / `api.js` 的超时参数 —— 不是用例的问题；
    后端修复方向（缓存客户端；本地后端别设代理变量）写进 D-09，交负责人拍板。**只登记，未改任何代码。**

> **本轮给下一位的提醒**：看到「无回包 / 挂起超过 2000ms」时，**先去看后端日志那一秒答没答**。
> 答了 200 ⇒ 不是产品 bug，别改断言去迎合，也别改 `src/`；先把「环境/负载」这条路走完。

**验收（2026-10-19）**：重启后端后跑完整全量 —— **6/6 套件、66/66 条通过（541.4s）**，
顺序 `p3 → p1 → p2 → p5 → p4 → hello`，P2 / P4 一次通过，**P3-04 的卡顿没有复现**。

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

### 6.8 ⚠️ 测试读到的存储 ≠ 应用读到的存储（2026-10-11 发现，**成因未查明**）

**一句话**：`program.callUniMethod('getStorageSync', ...)` 和**应用自己**的
`wx.getStorageSync(...)` 会看到**不一样**的存储视图 —— **两个方向都出现过**。
这不是应用坏了，但也**不是**我们看错了，是本环境一个真实的坑。

**证据一：读，测试侧读到空、应用侧读到满**

在 P4-03（取消支）那条的时序里，**3 轮 3 次都在同一点复现**：

| 通道 | 读 `auth_token` |
|---|---|
| `helpers.getKey` → `program.callUniMethod('getStorageSync','auth_token')` | **9/9 次空串** |
| `helpers.readAuthKeysInApp` → `program.evaluate(() => wx.getStorageSync('auth_token'))` | **9/9 次完整的 926 字符 JWT** |

同一次断言里，另外 3 个键（`auth_user` / `auth_login_time` / `auth_expire_time`）**两条通道读出来是一致的** ——
只有 `auth_token` 会这样。换个更短的时序**复现不了**，所以**不是**「这条通道坏了」，更像是**时序相关**。

**证据二：删，测试侧清干净了、应用还以为自己登录着**

P4-04（「未登录直接进首页应被踢到登录页」）偶发超时，表征是**应用留着不走**。
查下来：`clearAuthKeys` 走 `callUniMethod('removeStorageSync')` 清完，**测试侧再读是空的**，
但**应用那边登录态仍然有效**（否则它进门就该被踢）。

⚠️ 早先还有个**看着相反、其实同族**的现象（记在 §6.6 末尾）：`findLeftoverAuthKeys` 读到
`["user","loginTime","expireTime"]`（`auth_token` 没了、另三个还在）——
那是**撕裂读**（两边都逐个增删、交错所致），**不是**「应用没清干净」。

**📌 2026-10-12 做过一次复现尝试：结论是「不是永久两个存储，是时序相关」**（探针是临时文件，跑完已删）。

四个相位、共 **14 行采样 / 45 次键级比对，0 次不一致**：

| 相位 | 怎么读的 | 结果 |
|---|---|---|
| **A** | 真实 UI 登录，值由**应用自己**写入 → 登录刚结束就连读 5 次 × 4 个键 | 5/5 全一致（含 926 字符的 token） |
| **B** | 用**遥控通道** `seedValidSession` 写入 → 写完立刻连读 5 次 × 4 个键 | 5/5 全一致 |
| **C** | 短值(9字符) / 长值(**900字符**) × 应用写 / 遥控写 共 4 组 | **4/4 全一致** |
| **D** | 遥控通道清空之后 | 两条通道都读到空；两边对「还算不算登录着」的判断也一致 |

⇒ **能排除的**：
- ❌ **不是「两个各自独立的存储」** —— 否则上面这些简单序列也该分叉；
- ❌ **不是「只有长值才这样」** —— 900 字符的假键照样一致（原先怀疑过 `auth_token` 长 926 字符才出问题）；
- ✅ **只在某些特定时序下出现**：P4-03（取消支）那条**原始时序** 3/3 都复现，换成上面这些更简单的时序 **0/45**。

⇒ **影响面因此收窄**：是**测试工具在特定时序下会读到旧值**，不是应用的存储坏了。
再加上 2026-10-12 查过的一件事：**应用内部只用 `uni.*StorageSync`，一处 `wx.*StorageSync` 都没有**
（`grep` 0 命中）⇒ 应用自己不会「一个本子两个看法」，**大概不影响真人用户**。
所以处置**到此为止**：规避那套继续留着，成因按「需确认」收档。

> **想再查时的配方**（10 分钟能写出来）：进登录页 → 真实 UI 登录（`#login-account`/`#login-password`
> `el.input()` + `#login-submit` `el.tap()`）→ 用 `program.callUniMethod('getStorageSync', key)` 与
> `program.evaluate((k) => wx.getStorageSync(k), key)` **背靠背**读同一个键、连读 5 次、间隔 500ms，
> 把「长度 + 头 10 字符 + 时刻」打出来。要继续追，就往**原始时序**上贴：照 P4-03（取消支）那条的
> 步骤顺序走一遍（`waitForStablePage` → `clearAuthKeys` → `reLaunch` 登录页 → HTTP 登录 →
> `seedValidSession` → `reLaunch` 设置页 → 装弹窗桩 → `tap`），在断言点读两条通道 —— 看是**哪一步**
> 把两条通道读岔的（二分法）。

**怎么确认**：在失败现场**同时读两条通道**比一比 ——

```js
const viaHarness = await helpers.getKey(program, 'auth_token');        // callUniMethod
const viaApp = await helpers.readAuthKeysInApp(program);              // evaluate
console.log({ viaHarness, viaApp });
```

两个不一样 ⇒ 撞上本节。**两处都别改**（不改断言、不改 `src/`），记下来、复跑。

**处置（已固化进 `helpers/storage.js`）**：

| 你要做的事 | 用哪条通道 | 为什么 |
|---|---|---|
| **正向**断言「某个键**还在**」 | `readAuthKeysInApp`（= 应用读的那条） | 这才是应用真实看到的东西；用 `getKey` 会把「还在」误报成不在 |
| **反向**断言「键都清空了」 | `findLeftoverAuthKeys` 无妨（`getKey`） | 空串只会让它**多报**「已清空」，**不会**伪造出「还在」⇒ 这个方向是安全的 |
| **造**状态（`seedValidSession` 等） | **两条都写** | 只写一条时应用可能看不见（P4-04 就是这么红的） |
| **清**状态（`clearAuthKeys`） | **两条都删** | 同上 |

⇒ 所以 `clearAuthKeys` / `seedValidSession` / `seedLocallyExpiredSession` 现在都是「**两条通道各做一遍**」，
并且 `readAuthKeysInApp` / `setKeysInApp` / `removeKeysInApp` 都已导出。

⚠️ **诚实标注一处推断**：「`readAuthKeysInApp` 读到的就是应用看到的那份」是**推断**，不是读代码
得出的结论 —— 依据是 P4-04 那次「**应用的行为跟它吻合**」（应用没被踢走 = 它眼里登录态还在）。
正常时序下两条通道本来就一致（见上面的复现尝试），所以**用哪条都不亏**；真分歧时以**应用那条**为准。

⚠️ **另外两处旧的「正向读」还没跟着改**（本次没动，留个记号）：`p5-register.e2e.js:350`
（「预期③：本地 auth_token 非空」）和 `p1-trading.e2e.js:511` 走的是 `helpers.getKey`。
它们目前是绿的，**要么本来就撞不上这个时序、要么是运气**，没有进一步确定 —— **标「需确认」**。

**顺带记一条同类的：桩选错了，也是静默的**（与存储无关，但一样「不报错却什么都没测到」）。

`helpers/uniMock.js` 里有两套让确认框自动应答的桩，**各只对一种写法有效**：

| 应用那个调用点怎么写 | 用哪个桩 | 用错的后果 |
|---|---|---|
| `await uni.showModal({...})`（如 `settings/index.vue:204`） | `withNativeModal` / `stubNativeModal`（换 `wx.showModal`） | 换 `confirmNextModal` → 应用 `await` 拿到 `undefined` → `!result.confirm` 抛错，**看着像「点了没反应」** |
| `uni.showModal({ ..., success: (res) => ... })`（如 `watchlist/index.vue:567`、`SessionDrawer.vue:189` / `:215`） | **两种都可以**，优先 `withNativeModal`（它会自还原） | 见下面的订正：2026-10-11 那条「换 `withNativeModal` 一次都记不到」是**误判** |

> ⚠️ **2026-10-18 订正（已实测）**：上面第二行「回调写法换 `withNativeModal` 记不到」的结论**不成立**。
> 临时探针（`z-probe-mock-leak`，跑完已删）在干净环境下只装 `wx` 桩，点 `#wl-clear`
> （`watchlist/index.vue:567` 的回调写法）→ **记到 1 条**；P2-04 的重命名（同样是回调写法）在全量跑绿的那些轮里
> 也一直被 `wx` 桩记到。2026-10-11 那次为什么记不到？**因为同文件前一条用例刚装过 `confirmNextModal`
> 且没有还原**，mock 一直盖着 `wx.showModal` —— 这正是 §5.7.2 说的泄漏，当时被误读成了「桩不适用」。
> ⇒ **能用 `withNativeModal` 就用它**：两种写法都拦得到、还会还原、还能录文案。
> 只在「必须先让 app 在一次调用里拿到固定结果、且不方便换 `wx`」时才用结果式 mock，并且**必须还原**。

**选桩只看应用那一行**（`await` 还是 `success:`），别按「哪个更熟」挑。
`withNativeModal` 多给一样东西（弹窗文案），**只在能用的那种写法上才有**。
⚠️ 「回调写法」那一侧拿不到文案，所以那种用例**不要硬断言文案** —— 直接不写，
把覆盖不到的部分在 `03-E2E用例清单.md` 里登记清楚，比写个查不出东西的断言强。

**防「桩其实没生效」的通用办法：加一组对照组。** 用**同一个按钮、同一套桩法**，
只把桩的值翻过来再点一次，看**另一端**（后端数据）有没有按预期变化。
P3-04（取消支）就是这么做的：先 `{confirm:false}` 断言「没清空」，再 `{confirm:true}` 断言
「这次真清空了」——后者证明桩确实喂进了应用，前者的绿才不是「什么都没发生」的假绿。
（这也是**反向验证**的一种，见 §7.2。）

---

## 7. 反向验证：把代码故意改坏，看这几条用例会不会变红

做法很简单 —— 把被测的那行代码**故意改坏**，跑一遍，再改回来：

**不做这一步，就分不清「这条用例真的测到了东西」和「写了个永远不会失败的用例」。**
下面这三条是专门挑出来做这件事的，它们各自钉住一处「一改坏就该报错」的地方：

| 用例 | 位置 | 怎么把它改坏 |
|---|---|---|
| **P1-03**（申购 → pending 语义） | [`p1-trading.e2e.js`](p1-trading.e2e.js) 的 ②③③-bis④ | 把 `ai-etf/server/services/portfolio_service.py` 里那行 `"frozen_cash": float(frozen_cash + amount)` 改成 `float(frozen_cash)`（**故意不再冻结资金**）→ **重启后端**（没有 `--reload`）→ 跑 `npm run test:e2e -- p1-trading` |
| **C1**（契约测试） | `ai-etf/tests/contract/` | 把 `PUT .../title` 那条路由注释掉 → C1 必须变红 |
| **P2-07**（分块解码，✅ **反向验证已做**，2026-10-11） | [`p2-chat.e2e.js`](p2-chat.e2e.js) | ⚠️ **别改手写降级那套**（见下方「改哪条实现」）→ 正确改法是把 `src/utils/sse.ts` **第 79 行**的 `{ stream: true }` 去掉 → 跑 `npm run test:e2e -- p2-chat` → **P2-07 必须变红**（它就是要抓「半个汉字被切开」）<br>✅ 同一条防线在**单元测试**侧也做过（§7.1 第 ①，5 条红）|
| **P2-08 ~ P2-11**（流式异常，✅ **反向验证已做**，2026-10-19） | [`p2-chat.e2e.js`](p2-chat.e2e.js) | 改**期望文案**（如把 P2-08 的 `AI 请求失败（HTTP 500）` 改成兜底文案）、或去掉 P2-11 恢复段的 token → 跑 `p2-chat` → 恰好这 2 条变红。**别改 `src/`**，反过来改用例的期望值就够证明断言非空 |
| **P5-05 ~ P5-07**（测评异常分支，✅ **反向验证已做**，2026-10-19） | [`p5-register.e2e.js`](p5-register.e2e.js) | 把 P5-06 的 `urlIncludes` 改成不存在的 URL、把 P5-07 期望的 toast 文案改短 → 跑 `p5-register` → 恰好这 2 条变红。P5-06 会**只红在 hits 断言**上，这正是 `readRequestMockHits` 存在的理由 |

**已验证过一次（2026-10-08）**：改 `frozen_cash` 那行 → **4 条变红**（P1-03②③ + 连带 P1-05②/P1-06②）→ `git checkout` 还原 → 重启 → 重回 18 passed。
细节与两条副产物见 `ai-etf/docs/e2e/05-执行计划.md` 的验收标准。

**P2-07 那一轮（2026-10-11 实做，结论：✅ 它确实抓得住）**

⚠️ **先说一个会让人白跑一轮的坑：`createUtf8StreamDecoder` 有两条实现，E2E 只走得到其中一条。**
有 `TextDecoder` 时用系统的（[`sse.ts:75-85`](src/utils/sse.ts#L75-L85)），没有才用手写的那套
（[`sse.ts:87-147`](src/utils/sse.ts#L87-L147)）。**开发者工具有 `TextDecoder`，走的正是系统那条**
（这条原先只是 [`sse.spec.ts:24`](src/utils/__tests__/sse.spec.ts#L24) 注释里的说法，2026-10-11 实测坐实）；
**手写那套只有微信真机才跑**（真机没有 `TextDecoder`）。

⇒ 所以改 §7.1 那次改的那行（`sse.ts:145` 手写实现里的 `pendingBytes.slice(index)`），
**在 E2E 里根本执行不到**，改完 P2-07 会**照绿** —— 那不是「用例没用」，是我们改错了地方。
（§7.1 的 📌 记的就是这个现象：那次改坏后，两组实现里只有「手写降级」那一组红。）
要验 E2E 这一侧，得改**系统那条**。

**做法**：把 [`sse.ts:79`](src/utils/sse.ts#L79) 的

```js
return nativeDecoder.decode(new Uint8Array(buffer), { stream: true });
```

改成（**去掉 `{ stream: true }`**）

```js
return nativeDecoder.decode(new Uint8Array(buffer));
```

`stream: true` 的意思是「这只是一段，凑不齐的字节先留着，等下一段」；去掉它，切在两块之间的汉字
就会当场变成乱码。**改完要还原**（`git checkout -- src/utils/sse.ts`，核对 sha256 与 HEAD 一致）。

**结果**：

| | 结果 |
|---|---|
| 改坏后 `test:e2e -- p2-chat` | **2 绿（P2-01、P2-02）/ 5 红**，P2-07 报 `Expected: "你好，世界"` / `Received: "锟斤拷锟藉ソ，世界"`（乱码）—— ✅ **正是它要抓的** |
| 还原后复跑 | **7 passed / 7 total**（89.5s）→ 绿是改坏带来的，不是本来就红 |

同轮另外 4 条红的说明（**别误读成「反向验证失败了」**）：P2-04 / P2-05 / P2-06 的报错原文是
「**缺前置**：P2-0x 依赖前一条用例建立的真实会话」，是 P2-03 的连带；而 P2-03 自己的失败
**不能**用「乱码把新建会话的记账搞坏了」解释 —— P2-01 干的是同一件事（新开会话 → 发消息 →
新会话落地 → 会话列表更新），它在同一轮是**绿的**。所以 P2-03 那条更像真实 LLM 这条路本身的
不确定（§6.6 记过这套书会「换着红」），但**只有一轮样本，未钉死，标「需确认」**。

### 7.1 单元 / 集成测试那套也做过同样的反向验证（2026-10-11 已实做）

`npm run test:unit` 那 86 条（**当时是 5 个文件 / 86 条；现在 6 个文件 / 92 条** —— 10-11 之后补了 `useAuth.login` 的 6 条，见文件地图）**一次性改坏 5 处，5 个文件全部命中、共 10 条变红**，改完核对过原样还原（sha256 逐个比对，5/5 一致）：

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

### 7.2 变体：**不动 `src/`**，改桩的值（2026-10-11 用于三条「取消支」）

`src/` 是别人写的（改之前要先问），而上面那套办法全都要改 `src/`。有个**不用碰 `src/`** 的替代做法：

**把桩的值从「点取消」翻成「点确定」，看用例会不会红。**

这不是「改坏了应用」，而是**把所有观察面都摆到「另一支」上**：应用这次真的会去执行那个破坏性动作。
所以它验的是**「断言有没有真的盯住那一支的结果」** —— 具体说，验的是这个：

> 假如应用**无视了取消**、真把东西删了/清了/登出了，我这些断言**拦不拦得住**？

**拦得住 = 断言绑到了分支结果上，不是绑在了「函数被调用过」上。** 这正是取消支最需要的性质 ——
取消支的失败模式就是「用例绿了，但其实什么都没发生」。

**2026-10-11 三条取消支各做一遍，结果如下**（都是「翻桩 → 跑 → 还原 → 核对 sha256」）：

| 用例 | 桩怎么翻 | 结果 | 读法 |
|---|---|---|---|
| **P4-03（取消支）** | `withNativeModal(…, {confirm:false})` → `true` | **只这 1 条红** | 理想形状 |
| **P3-04（取消支）** | `confirmNextModal(…, {confirm:false})` → `true` | **只这 1 条红**，红在「后端列表从 `["510300","510500"]` 变成 `[]`」 | 理想形状 |
| **P2-05（取消支）** | `withNativeModal(…, {confirm:false})` → `true` | **2 条红** = 本条 + 紧随其后的 P2-05 | **非级联的红要能解释**，见下 |

**P2 那第 2 条红是可预期的级联，不是「连带看到红就说不清」**：桩一翻，这条取消支**真的把 chat2 删掉了**，
于是紧接着的 P2-05 前置 `expect(before.total).toBe(2)` 拿到 `1` → 红（耗时 9ms，是**前置断言**失败，
不是超时）。⇒ **级联的方向是「本条把后来者的前置吃掉了」，逻辑上完全说得通，不是另一处未定位的问题。**

⚠️ **2026-10-12 订正上表 P3-04 那一行**：那次「翻桩值」的红**没能证明取消分支被走到** ——
翻成 `confirm:true` 之后两处桩的 `errMsg` 都是 `':ok'`，桩调的是 `success`，走的是**确定**那条路（详见 §5.7.1）。
真正把「取消」送进应用，是在修好 `:fail` 那个坑之后（`confirm:false` 现在也走 `success`）。
修好后再做**`src/` 侧**的反向验证（往 `handleClearAll` 的 `success` 里插 `res.confirm = true`）：
**只有 P3-04（取消支）这一条红**，红在「后端 `items` 从 `["510300","510500"]` 变成 `[]`」；
`src/` 已还原并核对 sha256（`1c9060f2…`）⇒ 现在这条用例的两层结论都有实跑支撑。

⭐ **反向验证里「红了几条」是有信息的，别只看「有没有红」**：

| 看到什么 | 说明什么 |
|---|---|
| **只有目标那条红** | 理想 —— 断言精确瞄准了那一支 |
| **目标红 + 能说清因果的级联** | 可以接受，**但必须把级联解释掉**（如上表 P2） |
| **目标红 + 解释不掉的红** | ⚠️ **不能当通过** —— 要么是另一处未定位的问题，要么是别处被这次改动带坏了，**标「需确认」**并写进记录 |

⚠️ **这个变体的边界要说清（免得当成万能）：它验的是「断言绑住了结果」，不是「`src/` 里那一行就是被跑的那行」。**
真正的 `src/` 侧反向验证（把 `if (!result.confirm) return` 改成永远 return、或把 `if (res.confirm)` 反过来）
**本次没做** —— 按「改 `src/` 下别人写的代码前先问一声」，这一步**等用户点头**再补。
两者的关系：桩变体是**便宜、随时可做**的那层；`src/` 侧是**更强、但要么动别人代码要么动后端**的那层，
§7 上半部分那三条（P1-03 / C1 / P2-07）走的就是后者。

---

## 8. 「知道但没覆盖」的地方（别当成漏测）

| 位置 | 没覆盖什么 | 为什么 |
|---|---|---|
| `p1-trading.e2e.js` P1-03③ | **点结果页的「查看持仓」按钮**回自选页 | 那是 `uni.reLaunch`，会撞上 §5.3 的「初始化期间导航被丢弃」。改成断言按钮文案存在 + 用 `gotoPage` 自己走。**「持仓 Tab 数值正确」这个真正的考点不受影响** |
| `p1-trading.e2e.js` P1-06 | 赎回拦截的 **UI 层** | 赎回页 `!position` 时表单被 `v-if` 短路，而唯一入口是持仓项 → **UI 闭合不可达**，降为 L3 接口级 |
| ~~`p1-trading.e2e.js` P1-04~~ | ~~**整个用例**（`it.skip`）~~ | ✅ **2026-10-13 已补** —— 夹具能回填确认日了，P1-04 转正为**接口级 + UI 级各一条**，见下 |
| `p2-chat.e2e.js` P2-01 / P2-02 | **「长回答」这条路**（真后端答 20 秒以上的问句） | 见 §5.10 / **D-07**：服务方对**生成超过约 21 秒**的慢回答返回**空流**，用例只能挑「答得快」的问句。所以「长回答能不能正确渲染」在 E2E 里是**故意不覆盖**的，别当成漏测 |
| ~~`p2-chat.e2e.js` 的流式异常~~ | ~~中途断流、服务方报错~~ | ✅ **2026-10-19 已补** —— P2-08 ~ P2-11 四条（HTTP 非 2xx / error 帧 / 空流 / 网络层失败），见 §5.9.1。⚠️ 仍然只能验证**应用怎么处理**，不能验证「服务方实际发什么」；真协议只能靠跑真实 LLM |
| `p2-chat.e2e.js` 全部 | **超长回答的分页** | 需要真实 LLM 生成足够长的一次回答（≥ D-07 的 21 秒阈值附近会直接空流），既慢又不稳定，本阶段不做 |
| ~~`p5-register.e2e.js` P5-01~~ | ~~**登录页「还没有账户？注册」这条入口本身**~~ | ✅ **2026-10-11 已补** —— 见 **P5-04**。原先判定「补不了」是把 D-08 的范围看宽了：D-08 堵的是「从 `navigateTo` 压上去的页面往**外**跳」，而**点链接进注册页这一步本来是通的**。于是另立一条**只验「进得去」**的用例（点完看一眼注册页的内容就收工，不提交、不往外跳）。**主流程**（P5-01）仍然走深链，理由不变 |
| `p5-register.e2e.js` P5-03 | **测评页左上角返回箭头这个动作** | 同 D-08：测评页也是 `navigateTo` 压上去的，自动化点返回箭头后一直停在测评页。改为用 `gotoPage` 收敛回设置页。**「重进直接看画像」这个考点不受影响**。<br>⭐ **但功能本身是好的**（2026-10-11 人工验证）：人手动点同一个箭头**一次就退回「我的」（= 设置页）**。⇒ 这条「没覆盖」是**自动化驱动的局限**，**不是漏测、更不是功能坏了**。写出来每次都会红且红得没意义，故不写 |
| ~~`p5-register.e2e.js` P5-01~~ | ~~「两次输入密码不一致」的前端拦截~~ | ✅ **2026-10-19 已补** —— **P5-01 负例③**（断言文案 + `wx.request` 调用次数为 0 + 不跳走） |
| ~~`p5-register.e2e.js` 异常分支~~ | ~~问卷加载失败、画像接口失败回退本地缓存、重测覆盖旧画像~~ | ✅ **2026-10-19 已补** —— **P5-05**（重测后总分变化、UI 与后端一致、缓存被覆盖）、**P5-06**（画像接口失败 → 缓存）、**P5-07**（问卷失败 → toast、停在加载态）。造状态用 [`helpers/requestMock.js`](helpers/requestMock.js)，见 §5.13 |
| `p1` P1-01③ / `p2` | **「新用户拉开抽屉、里面 0 条会话」这条界面层断言** | **不做，因为它和已断言的是同一份数据。** `SessionDrawer.vue:127-135` 在没有搜索词时 `filteredSessions` **就是 `chatStore.sessions` 本身**（同一个数组，不是副本），而「store 会话列表为空 + 消息为空 + 后端 `total === 0`」P2 已经断言过（`p2-chat.e2e.js:366-368`，P2-01 在 `:399` 又断言一次后端）。且 `src/stores/chat.ts` **不落本地盘**（没有任何 `uni.setStorage`／缓存回填）⇒ **不存在**「store 干净、界面还留着上一个账号的会话」这种隐私场景。**store 为空则界面必为空，再加一条等于把同一条断言写两层**（违反 skill 的「分层归属」）。<br>⚠️ 要说唯一不重复的缝隙，是 **「`loadingSessions` 为 true 卡住 → 抽屉一直转圈、空状态不出现」**（`SessionDrawer.vue:90` 的空状态带 `!loading` 条件、`:153` 读 `loadingSessions`）—— 那属于**加载状态**问题，与「新用户为空」是两回事，本阶段不做。<br>🔁 2026-10-15 删掉了 P1 里那句空壳 `it.skip`（原 P1-01③ 的占位），本条就是「为什么删了也不用补」的完整答案 |

### P1-04 从「走不到」到「已覆盖」（2026-10-13）—— ⚠️ 这段容易理解错

**曾经为什么走不到**：后端 `apply_redeem` 的校验顺序是**先查持仓**（`:784-786`）→ 再查 pending 申购（`:788-803`）。
用例用新账号、先申购再赎回，**从未持有过** → 持仓恒为空 → **持仓校验先命中**，拿到的是「未持有基金 110020，无法赎回」，不是期望的 pending 文案。
**但这不代表 `:788-803` 是死代码** —— 它**可达**，触发条件是「该基金**已确认**持有」+「该基金有 pending 申购」；当年走不到，是因为**会话内造不出已确认持仓**（买单落库的确认日 = 受理日 + `confirm_delay` 个交易日，本仓库所有基金都 ≥ 1，当天确认不了）。

> **真实使用中这个组合很常见**（昨天买的已确认，今天又买一笔），所以这条拦截实际挡住的是一个**合法操作**：2026-10-10 已定性为产品缺陷并登记（台账编号 **D-01**），完整版见 [`ai-etf/docs/e2e/00-背景与已知问题.md` §五 缺陷专项](../../ai-etf/docs/e2e/00-背景与已知问题.md)。

**现在怎么覆盖的**（两步，顺序不能反）：

1. 夹具/助手回填确认日 —— `helpers.backdateOrder(userId, '110020')` 打后端开发端点 `POST /api/portfolio/test/backdate-order`，把该基金**最早一笔** pending 买单的 `confirm_date` 改到今天。**走 HTTP 而不是直连库**，所以测试进程不需要任何数据库密钥（呼应本目录 `helpers/api.js` 开头的孪生约定；Python 侧同名子命令是 `e2e_fixture.py backdate-order`）。
2. 用例**带着自己的 JWT** 调 `POST /api/portfolio/confirm-pending` → 该笔被确认、建仓。然后**再买一笔**，才凑齐被拦截的那个组合。

⚠️ **前置条件**：后端**必须带 `E2E_MARKET_FIXTURE` 启动**（确认时要取 110020 的确认日净值，取不到订单会被判 rejected）。用例 ② 失败时会直接把这个提示写在报错里。
⚠️ **赎回页要等表单渲染**：`onLoad` 只负责发请求，取持仓是异步的，期间停在「正在读取持仓...」。跳过去就查 `#sell-quantity` 会拿到 `null`（2026-10-13 第一轮实测正是这么红的），必须 `waitFor`。
⚠️ **这条钉的是 D-01 的当前（有缺陷的）行为**：D-01 修好后 P1-04 会变红，**那是预期信号**，回来改成「可赎回已确认份额」的正例。
⇒ 也就是说，**D-01 现在有回归保护了** —— 不再是「登记了但没人看着」。
用例侧完整记录（含反向验证）见 `ai-etf/docs/e2e/03` §二 P1-04。

### P3 左滑：不是「做不到」，是参数传错了（2026-10-13）

**曾经记的是**：`Element.touchstart/touchmove/touchend` 三个 RPC 都发得出、也都回包，但
`.etf-item` 的 style 恒为 `translateX(0px)` ⇒ 「本机无法用当前手法驱动左滑」，于是
`⑥-bis` 挂了个 `it.skip`，并把它写进「未覆盖」。

**真相**：当年传的是 `{ x, y }`，而官方参数是 `{ touches: [...], changedTouches: [...] }`
（见 §5.2 第三条）。传 `{x, y}` 时 `touches` 是空数组 → 页面里 `event.touches[0]` 是
`undefined` → `watchlist/index.vue:470` 第一行 `if (!touch) return` 直接退出。
**现象一模一样，只是归因错了。**

⇒ 探针实测（正确形状）四种坐标写法**全部滑开**；20px 短滑不打开、45px 中滑打开
（说明位移真由我们给的坐标决定）。`⑥-bis` 已删除，能力并入 ⑥ 并被 ⑦ 兜住。
P3 从此**零 skip**，整文件跑 21/21 通过。

**反向验证（2026-10-14，做完已改回）**：把参数临时改回旧的 `{ x, y }` 形状再跑一遍
—— ⑥ 立刻红，报错原文是
`Received: "transform:translateX(0px) ｜ rpc: touchstart:ok touchmove#1:ok touchmove#2:ok touchend:ok"`。
注意 **四个 RPC 全部 `ok`（没有任何报错）而手势完全没生效** —— 这就是当年那个静默失效的
原样复现，也说明这条断言抓的是真东西，不是碰巧绿。改回后 21/21 恢复通过。

⭐ 留在这里的教训：**「工具/环境做不到」这类结论，在写进文档之前先确认一遍参数形状**。
它和「已登记但没覆盖」不一样 —— 后者至多是漏测，前者会**主动误导后来的人绕路**。

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
