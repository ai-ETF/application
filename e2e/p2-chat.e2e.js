/**
 * P2 AI 对话核心 —— E2E。
 *
 * 覆盖用例：P2-01 发消息→流式回复→新会话落地｜P2-02 会话续聊｜P2-03 新建会话｜
 *          P2-04 重命名会话｜P2-05 删除会话｜P2-06 历史消息回填
 * 另加一条 **P2-07 造流专项**（不在 6 条之列，见下）。
 *
 * 依据行号（写断言之前逐个核对过）：
 *   - 发消息主流程 handleSend：src/pages/index/index.vue#L528-L562
 *     · 先 addUserMessage + addEmptyBotMessage（**同步**，不等后端）→ 断言「立即出现」
 *     · 成功后 setCurrentChatId(newChatId) + fetchSessions()
 *     · 失败时气泡写成 `抱歉，${message}。`（#L557）→ 所有「AI 有回复」的断言都要排除它
 *   - 带 chat_id 续聊：src/pages/index/index.vue#L122-L127
 *   - 小程序端 SSE（enableChunked + onChunkReceived）：src/pages/index/index.vue#L153-L277
 *   - 标题截断 `question[:20] + "..."`：ai-etf/server/api/secure_chat.py#L271-L274
 *   - 会话列表按 updated_at 倒序：ai-etf/server/storage/chat_repo.py#L104-L110
 *   - store 各 action：src/stores/chat.ts（fetchSessions #L88 / fetchMessages #L108 /
 *     startNewChat #L152 / deleteChat #L161 / renameChat #L186 / appendBotToken #L237）
 *   - 抽屉重命名/删除（小程序分支走 uni.showModal 回调写法）：
 *     src/components/chat/SessionDrawer.vue#L172-L199（删除）、#L204-L236（重命名 + toast）
 *   - 首页 onMounted 自动拉最近会话：src/pages/index/index.vue#L84-L94
 *   - TabBar 用 uni.redirectTo：src/components/common/TabBar.vue#L105-L125
 *
 * ───────────────────────── 怎么观测（这套是本文件的核心，别绕过）─────────────────────────
 *
 * 1. **气泡文案一律读 Pinia store**，不读 DOM。
 *    原因：bot 气泡是 `<rich-text :nodes="renderedContent">`（markdown→HTML），
 *    `el.text()` 取不到；`#chat-msg-list` 这个 id 在组件内部，页面级 `page.$()` 也拿不到
 *    （2026-10-10 探针实测：`page.$('#chat-msg-list')` = false，
 *      `page.$('#chat-input')` = false 而 `(await page.$('chat-input-area')).$('#chat-input')` = true）。
 *    实测 `.message-text`（user 气泡）的 `el.text()` 是可用的，所以「user 气泡立即出现」
 *    这条**同时**用 DOM 和 store 两路验（一个证明渲染、一个证明状态）。
 *
 * 2. **「是不是流式」靠对 store 高频采样**（不需要任何前端测试钩子）：
 *    发送后每 200ms 读一次 bot 气泡长度，要求出现 **≥2 个不同的非空长度**。
 *    非流式实现（一次到位）过不了这条。2026-10-10 实测 Q1 的真实回答：
 *    416 个 token 帧 / 正文 742 字 / 整条约 10 秒，采样点里出现多个不同长度，余量很大。
 *    但**首个 token 要等好几秒**，所以采样窗口给到 130s（前端自己的首个 token 超时是 65s，
 *    总超时 120s，见 index.vue#L63-L66）—— 别按「几秒」去估。
 *
 * 3. **交叉断言直连后端**（helpers/api.js）：会话列表 `total`/标题、消息条数/顺序，
 *    都以后端返回为准，不写死期望值。
 *
 * 4. ⚠️ **真实 LLM 有成本且非确定性** → 本文件**不在常规 CI 里跑**（见 ai-etf/docs/e2e/03 §三）。
 *    断言全部是结构性的（非空、顺序、条数、不含 `抱歉，`），没有一条依赖具体措辞。
 *
 * ─────────────── ⚠️ 真实 LLM 的已知行为：回答太长会**整条变空**（2026-10-10 实测）───────────────
 *
 * 后端调的模型是 **DeepSeek 的 Anthropic 兼容端点**（日志里 `POST https://api.deepseek.com/
 * anthropic/v1/messages`，`stream: true`，`model: claude-sonnet-4-20250514`）。
 *
 * 它对「生成耗时超过约 21 秒」的请求会：**HTTP 200 + `text/event-stream`，但一个 token 帧都不发**，
 * 只有一个 `done` 帧；后端照样把 assistant 消息存成**空串**（`content` 长度 0）。
 * 应用拿到「零个 token」→ 走 index.vue#L246-L249 的兜底 → 气泡显示
 * `抱歉，AI 服务未返回有效回复。`（16 字）。**这不是应用或后端的逻辑缺陷，是模型服务方的行为**；
 * 应用的兜底是对的。登记见 ai-etf/docs/e2e/00-背景与已知问题.md §五。
 *
 * 实测（同一个后端、同一个账号，逐条换问句）：
 *   · `ETF 和场外基金到底有什么区别？请详细讲讲`  → 0 帧 / 0 字 / 21.5-23.0 秒（**连跑 3 次全空**）
 *   · `帮我讲讲ETF和场外基金的申购赎回机制有什么不同` → 0 帧 / 0 字 / 23.2 秒
 *   · `为什么要分散投资？`                        → 416 帧 / 742 字 / 9.9 秒
 *   · `ETF、场外基金、LOF 这三种基金分别在哪个市场交易？` → 216 帧 / 395 字 / 6.5 秒
 *   · `介绍一下ETF和股票的区别`                    → 605 帧 / 1024 字 / 20.9 秒（贴边，能过但余量小）
 *   · `再解释一下`                                → 85 帧 / 138 字 / 2.3 秒
 * 关键：**决定因素是回答要生成多久，不是问句本身有多长** —— 28 字的短答问句照样秒回流式。
 * 所以本文件挑问句的标准是「答案短、回答稳定在 10 秒内」，**不是**「问得漂亮」。
 * 想复现/排查这条时别去翻开发者工具的锅 —— 直连后端的 curl 也能复现（`curl -N`）。
 *
 * ───────────────────────── 用例之间有顺序依赖（跑法要求）─────────────────────────
 *
 * P2-01 建会话 C1 → P2-02 往 C1 里续聊 → P2-03 再建 C2 → P2-04 改名（C2）→
 * P2-05（取消支）删 C2 弹确认框时点「取消」，验证什么也没发生 →
 * P2-05 删 C2（同时验「删的是当前会话 → 消息清空」）→ P2-06 剩 C1，验证回填。
 *
 * 「取消支」那条是 2026-10-11 补的（全仓 3 个 showModal 调用点各有一条，另两条在
 * p4-auth 的 P4-03（取消支）和 p3 的 P3-04（取消支））。它不改任何服务端状态，
 * 只夹在中间做一次「点取消不该删」的对证。
 *
 * 所以**必须整文件连着跑**：`npm run test:e2e -- p2-chat`。
 * 单跑 `-t 'P2-05'` 会因为「没有会话可删」而红 —— 那是缺前置，不是产品缺陷
 * （每条用例开头都有前置检查，失败信息会写明这一点）。
 *
 * ───────────────────────── P2-07（额外一条，不在 6 条之列）─────────────────────────
 *
 * 它是 ai-etf/docs/e2e/03 §三「L4 E2E · 造流」那一行的落地：用
 * `helpers/streamMock.js` 换掉 `wx.request` 自己造分块，验三件真实链路**验不到**的事：
 *   ① 把一个汉字切在两个分块之间 → 最终文案无乱码（前端解码器对）
 *   ② 只喂前半块时**不提前渲染**半截字符（`onHead` 是唯一观察窗口）
 *   ③ `done` 帧的 `chat_id` 被落地成 `currentChatId`，且**下一次发送真的带上了它**
 * 它不需要真实 LLM（约 35 秒），跑在最后，不会污染前面几条的真实会话。
 *
 * ───────────────────────── P2-08 ~ P2-11（流式异常，2026-10-19 补）─────────────────────────
 *
 * `streamChatMp` 里有四条**互不相同**的失败路径，四条都靠 streamMock 造，不花真实 token：
 *   · HTTP 非 2xx            → finishStream({statusCode:500})        （index.vue#L230-L234）
 *   · 服务端 error 帧        → pushChunk('data:{"type":"error",…}')  （#L190-L192 → #L243-L246）
 *   · 空流（一个 token 没有）→ finishStream() 但不喂分块             （#L248-L251）
 *   · 网络层失败             → failStream(program, errMsg)            （#L254-L268）
 * 它们分不出「哪条路径」时只看文案 —— 文案相同，触发方式不同，别用一种造法验四句话。
 * 每条都断言 `sendingMessage` 复位（#L416），否则输入区会永远禁用。
 * 详见 application/e2e/README.md §5.9.1。
 *
 * 2026-10-10 实测记录：见 application/e2e/README.md 的运行记录表。
 */

const helpers = require('./helpers');

// 注意两种写法并存（跟 p4-auth.e2e.js 一致）：
//   PATH  —— currentPage().path 的返回形式，不带前导斜杠
//   ROUTE —— 传给 uni.reLaunch 的形式，带前导斜杠
const INDEX_PATH = 'pages/index/index';
const INDEX_ROUTE = '/pages/index/index';
const WATCHLIST_PATH = 'pages/watchlist/index';

// 问句是按「回答生成得快不快」挑的，理由见上方「真实 LLM 的已知行为」——别按问得好不好换。
/** P2-01 的提问（8 字）：实测 742 字 / 9.9 秒，流式稳。<20 字，所以标题不截断。 */
const Q1 = '为什么要分散投资？';
/** P2-02 的提问（5 字）：实测 138 字 / 2.3 秒，稳。 */
const Q2 = '再解释一下';
/** P2-03 的提问（28 字）：承担**标题截断**那一条断言（secure_chat.py#L273）；
 *  同时实测 395 字 / 6.5 秒 —— 「问句长」和「答案久」是两件事，这个问句长但答得很快。 */
const Q3 = 'ETF、场外基金、LOF 这三种基金分别在哪个市场交易？';

/** 真实 LLM 单条最长等 130s（03 的 P2-01 预期⑤），加上前后导航留足余量。 */
jest.setTimeout(240000);

function buildUser(account) {
  return { id: account.userId, username: 'e2e', displayName: 'e2e' };
}

/** 按后端规则算出期望标题：`question[:20] + ("..." if len>20 else "")`。 */
function expectedTitleOf(question) {
  return question.slice(0, 20) + (question.length > 20 ? '...' : '');
}

// ───────────────────────── 观测手段 ─────────────────────────

/**
 * 等应用自己的导航停稳再取 page。
 * 为什么：`currentPage()` 可能把一个站在跳转窗口期的 page 交给你，后续所有元素操作会
 * 报 `page destroyed`（见 p4-auth.e2e.js 文件头与 helpers/waitFor.js#L117-L138）。
 */
async function pageNow() {
  await helpers.waitForStablePage(program, { stableMs: 1200 });
  return program.currentPage();
}

/**
 * 读聊天 store —— 本文件里**气泡文案的真值来源**（理由见文件头「怎么观测」第 1 条）。
 * 走 `getCurrentPages()[last].$vm.$pinia.state.value.chat`：store 不在 `page.data()` 上。
 */
function readChat() {
  return program.evaluate(() => {
    const pages = getCurrentPages();
    const vm = pages[pages.length - 1].$vm;
    const chat = vm.$pinia.state.value.chat;
    return {
      currentChatId: chat.currentChatId || '',
      sending: !!chat.sendingMessage,
      messages: chat.messages.map((m) => ({ type: m.type, content: m.content || '' })),
      sessions: chat.sessions.map((s) => ({ id: s.id, title: s.title })),
    };
  });
}

/**
 * 等最后一条 bot 气泡**正好等于**期望文案（流式异常分支用）。
 *
 * 为什么不对 `sampleBotBubble` 复用：那个函数等到「非空且不再发送中」就返回，
 * 而异常分支里气泡本来就非空（错误文案是同步写入的），用它会让断言早于状态收敛。
 */
async function waitForBotText(expected, { timeout = 8000 } = {}) {
  return helpers.waitFor(
    async () => {
      const chat = await readChat();
      const bot = [...chat.messages].reverse().find((m) => m.type === 'bot');
      if (!bot || !bot.content) return false;
      return bot.content === expected ? chat : false;
    },
    { timeout, label: `bot 气泡显示「${expected}」` }
  );
}

/** 每条流式异常用例的统一起点：回首页并清空内存里的消息（不碰后端会话）。 */
async function resetChatForStreamTest() {
  await gotoIndex({ settle: 800 });
  await clearChatMessages();
  expect((await readChat()).messages).toHaveLength(0);
}

/** 把 store 的消息/当前会话清空（P2-06 用它证明「回填」而不是「内存里还留着」）。 */
function clearChatMessages() {
  return program.evaluate(() => {
    const pages = getCurrentPages();
    const chat = pages[pages.length - 1].$vm.$pinia.state.value.chat;
    chat.messages = [];
    chat.currentChatId = '';
    return { messages: chat.messages.length, currentChatId: chat.currentChatId };
  });
}

/** 进首页并等它渲染完（reLaunch 会重新挂载页面 → 触发 onMounted）。 */
async function gotoIndex({ settle = 1500 } = {}) {
  // ⚠️ 走 gotoPage 而不是裸 reLaunch：它内置「发之前先静置 3 秒 + 失败退避 8 秒重试，最多 3 次」。
  // 全量跑时本文件紧跟在别的套件后面，上一个套件结束时页面可能还在跳转窗口期 ——
  // 此时立刻发 reLaunch 会 8 秒无回包、页面不动，导致 beforeAll 整份套件全红
  // （2026-10-18 实测：P5 刚跑完停在注册页，P2 的 reLaunch 被吞；单跑不复现。
  //  见 README §6.6「乙：跳没生效」）。
  // force: true 必须留 —— 已经在首页时也要重新挂载，P2-06 靠 onMounted 重新拉历史消息。
  await helpers.gotoPage(program, INDEX_ROUTE, INDEX_PATH, { force: true });
  await helpers.sleep(settle);
}

/**
 * 在输入框里填字并点发送。
 *
 * ⚠️ `#chat-input` / `#chat-send` 在 `ChatInputArea` **组件内部**，页面级 `page.$()`
 * 拿不到（2026-10-10 实测 false）。必须先取组件元素（标签名 = 组件名的 kebab-case），
 * 再往下查。same 适用于 `#drawer-toggle`（在 `ChatTopBar` 里）。
 */
async function sendViaUi(text) {
  const page = await pageNow();
  const comp = await page.$('chat-input-area');
  if (!comp) throw new Error('找不到 chat-input-area 组件元素（页面没渲染好？）');
  await (await comp.$('#chat-input')).input(text);
  await (await comp.$('#chat-send')).tap();
}

/**
 * 采样 bot 气泡，直到「非空 且 不再发送中」。
 *
 * ⚠️ 返回的 `last` 是**退出那一刻的快照**，只保证「气泡和发送中标志」已就绪。
 *    应用发完消息后还会**异步**刷新会话列表 —— `handleSend` 里
 *    `chatStore.fetchSessions()` 没有 await（index.vue#L409），紧接着 `finally`
 *    就把 `sendingMessage` 置 false（index.vue#L416）⇒ 本函数可能在列表响应回来
 *    **之前**就返回。所以：**别直接断言 `last.sessions`**，要用 `helpers.waitFor`
 *    等它收敛（2026-10-18 实证，见 P2-03 与 README §6.6 末尾「2026-10-18 再追加」）。
 *
 * @returns {{samples: Array<{t:number,len:number}>, last: any, elapsed: number,
 *            distinctLengths: number, botText: string}}
 */
async function sampleBotBubble({ timeout = 130000, interval = 200 } = {}) {
  const t0 = Date.now();
  const samples = [];
  let last = null;
  for (;;) {
    try {
      last = await readChat();
    } catch (e) {
      // 采样期间页面可能在跳转，读失败就当这一次没采到，继续等
      await helpers.sleep(interval);
      continue;
    }
    const bot = [...last.messages].reverse().find((m) => m.type === 'bot');
    samples.push({ t: Date.now() - t0, len: bot ? bot.content.length : -1 });
    if (bot && bot.content.length > 0 && !last.sending) break;
    if (Date.now() - t0 > timeout) {
      throw new Error(
        `等了 ${timeout}ms，bot 气泡仍为空或仍在发送中。最后 5 次采样：${JSON.stringify(samples.slice(-5))}`
      );
    }
    await helpers.sleep(interval);
  }
  const botText = [...last.messages].reverse().find((m) => m.type === 'bot').content;
  return {
    samples,
    last,
    elapsed: Date.now() - t0,
    distinctLengths: new Set(samples.filter((s) => s.len > 0).map((s) => s.len)).size,
    botText,
  };
}

/**
 * 点底部导航条上那个 Tab —— **按文字找，不按 `.tab-item` 的下标**。
 *
 * ⚠️ 为什么下标不行：`自选`页**自己顶部也有一排 `.tab-item`**
 * （src/pages/watchlist/index.vue#L27-L37，是真的「自选 / 持仓」页内切换）。
 * 所以在自选页上 `page.$$('.tab-item')[0]` 点到的是那个页内切换器，**不是**底部导航，
 * 表现为「点了没反应、页面一直不动」——P2-06 首跑就是这么红的（等 10 秒超时）。
 * `.tab-label` 全仓只有 TabBar.vue 的 4 处（grep 过），拿它当锚点才能区分两者。
 *
 * @param {string} label 底部导航上的文字，如 '自选' / '问小E'
 */
async function tapTabBar(page, label) {
  const items = await page.$$('.tab-item');
  const found = [];
  for (const item of items) {
    const textEl = await item.$('.tab-label');
    if (!textEl) continue; // 页内自己的 tab 没有 .tab-label
    const text = (await textEl.text()).trim();
    found.push(text);
    if (text === label) {
      await item.tap();
      return;
    }
  }
  throw new Error(
    `底部导航里没有「${label}」这个 Tab。这一页上找到的底部 Tab 是：[${found.join(', ')}]`
  );
}

/** 打开会话抽屉（`#drawer-toggle` 在 ChatTopBar 组件里，得先拿组件元素）。 */
async function openDrawer() {
  const page = await pageNow();
  const bar = await page.$('chat-top-bar');
  if (!bar) throw new Error('找不到 chat-top-bar 组件元素');
  const toggle = await bar.$('#drawer-toggle');
  if (!toggle) throw new Error('chat-top-bar 里找不到 #drawer-toggle');
  await toggle.tap();
  await helpers.sleep(700); // 抽屉是 transform 动画，等它滑出来
}

/** 抽屉里的会话条目（不依赖抽屉是否打开：面板一直在 DOM 里，关闭只是 CSS 位移）。 */
async function drawerSessions() {
  const page = await pageNow();
  const items = await page.$$('.session-item');
  const out = [];
  for (const item of items) {
    const titleEl = await item.$('.session-title');
    out.push({
      title: titleEl ? await titleEl.text() : null,
      renameBtn: await item.$('.session-action-btn'),
      deleteBtn: await item.$('.session-action-btn--danger'),
    });
  }
  return out;
}

/** 抽屉里第 index 条会话的标题（DOM 文案）。 */
async function drawerTitleAt(index) {
  const page = await pageNow();
  const items = await page.$$('.session-item');
  if (items.length <= index) return null;
  const titleEl = await items[index].$('.session-title');
  return titleEl ? await titleEl.text() : null;
}

/** 点抽屉里第 index 条会话的某个按钮（'.session-action-btn' 重命名 / 带 --danger 是删除）。 */
async function tapDrawerAction(index, selector) {
  const page = await pageNow();
  const items = await page.$$('.session-item');
  if (items.length <= index) {
    throw new Error(`抽屉里只有 ${items.length} 条会话，点不到第 ${index + 1} 条的按钮`);
  }
  const btn = await items[index].$(selector);
  if (!btn) throw new Error(`第 ${index + 1} 条会话里找不到 ${selector}`);
  await btn.tap();
}

/** 前置检查：这组用例是串起来的，缺前置时给出「是缺前置不是产品缺陷」的明确报错。 */
function requireChat(state, label) {
  if (!state.chatId) {
    throw new Error(
      `缺前置：${label} 依赖前一条用例建立的真实会话。` +
        `本文件必须整跑（npm run test:e2e -- p2-chat），单跑单条会在这里停住。`
    );
  }
}

/**
 * ⚠️ 这里原本有一段「预热」逻辑，2026-10-10 已**删除**。留这段说明是为了别再有下一个人加回来。
 *
 * 当时的判断：小程序进程的**第一条 `enableChunked` 请求会丢掉整段响应体**
 * （`success` 拿到空串、`onChunkReceived` 一次不触发），所以先用一条废请求「烧掉」它。
 *
 * 那个判断**是错的**，真因不在小程序侧（证据链，都已实测）：
 *   ① 丢的不是「第几条」，而是**这个问句的后端回答是空的** ——
 *      直连后端 `curl -N` 打同一个问句，一样是 200 + 空流；换成别的问句立刻正常流式。
 *   ② 后端日志里每一次请求都拿到了 `POST https://api.deepseek.com/anthropic/v1/messages`
 *      `200 OK` + `text/event-stream`，但 assistant 消息存下来是**空串**（长度 0）——
 *      也就是说应用压根没收到过 token，谈不上「收到了但丢了」。
 *   ③ 重启开发者工具（排除长跑进程退化）、从 Windows 侧 curl（排除 WSL 网络）都复现同样的空流。
 *   ④ 真流式的那些回答，开发者工具把分块**一个不少**地送到了（P2-07 造流那条也证明这条通路是好的）。
 *
 * 结论：**应用和开发者工具都没问题**，「预热」纯属把模型服务方的行为误判成了小程序侧的现象。
 * 正确的做法是挑一个「后端回答生成得快」的问句（见上方「真实 LLM 的已知行为」）。
 */

// ───────────────────────── 用例 ─────────────────────────

describe('P2 AI 对话核心', () => {
  let account;
  /** 用例之间传递的会话 id（真实链路那几条共用）。 */
  const state = { chat1: '', chat2: '' };

  beforeAll(async () => {
    // ── 数据安全闸门（与 p4-auth.e2e.js 一致）─────────────────────
    helpers.assertLocalApiBase();
    helpers.assertUrlCheckDisabled();
    helpers.assertTouristAppId();

    if (!(await helpers.ping())) {
      throw new Error(
        '后端没起来，P2 无法跑。\n' +
          '→ 启动：poetry run uvicorn server.app:app --port 8000\n' +
          '→ 或设 E2E_API 指向别的地址。'
      );
    }

    account = await helpers.registerAccount();
    console.log('[P2] 一次性账号：', account.email);
    console.log('[P2] ⚠️ 真实 LLM：单条回答约 10-25 秒，全文件预计 3-6 分钟');

    // 造登录态（写 Storage，与真实登录后关键字段一致；本文件测的是聊天，不是登录）
    await helpers.seedValidSession(program, { token: account.token, user: buildUser(account) });
    await gotoIndex();

    // 前置条件：新账号、0 会话、首页消息为空（P2-01 要验「新会话落地」，必须从这里开始）
    await gotoIndex({ settle: 1200 });
    await clearChatMessages();

    const initial = await readChat();
    expect(initial.sessions).toHaveLength(0);
    expect(initial.messages).toHaveLength(0);
    expect((await helpers.getChats(account.token)).total).toBe(0);
  });

  afterAll(async () => {
    try {
      await helpers.clearAuthKeys(program);
    } catch (e) {
      console.warn('[P2] 清本地登录态失败：', (e && e.message) || e);
    }
    if (account) {
      try {
        // 先删聊天记录再注销账号，避免 Supabase 里堆积测试会话
        const fresh = await helpers.loginWithPassword(account.email, account.password);
        console.log('[P2] 清理会话：', JSON.stringify(await helpers.deleteAllChats(fresh.token)));
        console.log(
          '[P2] 清理账号：',
          JSON.stringify(await helpers.deleteAccount(fresh.token, account.password))
        );
      } catch (e) {
        console.warn(
          `[P2] ⚠️ 清理失败，Supabase 里可能残留 ${account.email}：${(e && e.message) || e}`
        );
      }
    }
  });

  // ─────────────────────────────────────────────────────────────
  it('P2-01 发消息 → 流式回复 → 新会话落地', async () => {
    // 前置：新账号应该 0 会话（否则「新会话落地」验不准）
    const before = await helpers.getChats(account.token);
    expect(before.status).toBe(200);
    expect(before.total).toBe(0);

    await sendViaUi(Q1);

    // ① 立即出现 user 气泡，文本 == 输入内容；② 同时出现一个 bot 气泡。
    //    「立即」= 不等后端：handleSend 里 addUserMessage + addEmptyBotMessage 这两步是
    //    同步的（index.vue#L534-L537），所以 1.2 秒之后两条都在了。
    //    ⚠️ 这里**不**断言 bot 气泡此刻还是空的 —— 「第几个 token 什么时候到」是模型服务方的
    //    节奏，不是应用的保证；应用保证的是「不等后端就把气泡摆出来」。
    //    下面把那瞬间的长度打出来，方便回看时知道它当时已经流到哪了。
    await helpers.sleep(1200);
    const justSent = await readChat();
    console.log(`[P2-01] 发送后 1.2s：bot 气泡长度 ${justSent.messages[1].content.length}`);
    expect(justSent.messages[0]).toEqual({ type: 'user', content: Q1 });
    expect(justSent.messages[1].type).toBe('bot');
    expect(justSent.messages).toHaveLength(2);

    // ① 的另一路证据（DOM）：user 气泡真的渲染出来了。
    const page = await pageNow();
    const userBubble = await page.$('.message-text');
    expect(userBubble).not.toBeNull();
    expect(await userBubble.text()).toBe(Q1);

    // 采样 bot 气泡，直到它「有内容 且 不再发送中」
    const sample = await sampleBotBubble();
    console.log(
      `[P2-01] 采样 ${sample.samples.length} 点 / 不同长度 ${sample.distinctLengths} 个 / 耗时 ${sample.elapsed}ms`
    );

    // ④ 先判这条：最终文案非空 ∧ 不以「抱歉，」开头（排除把超时/报错当成成功）。
    //    放在 ③ 前面是为了**失败信息有用** —— 采样数据只说明「不流式」，
    //    「模型服务方这次回答是空的」（见文件头「真实 LLM 的已知行为」）跟
    //    「应用把流式做成了非流式」是两回事，这里直接用文案把两者分开。
    expect(sample.botText.length).toBeGreaterThan(0);
    if (sample.botText.startsWith('抱歉，')) {
      throw new Error(
        `bot 气泡是兜底文案、不是 AI 回复：${sample.botText}\n` +
          `（采样 ${sample.samples.length} 点，不同非空长度 ${sample.distinctLengths} 个，耗时 ${sample.elapsed}ms）\n` +
          '先看文件头「真实 LLM 的已知行为」—— 若这条问句生成超过约 21 秒，模型服务方会返回空流，' +
          '此时应用显示兜底文案是**正确行为**，该换的是问句（见 Q1 的注释）。'
      );
    }

    // ③ 流式证据：≥2 个不同的非空长度（一次到位、非流式的实现过不了这条）
    expect(sample.distinctLengths).toBeGreaterThanOrEqual(2);

    // ⑤（耗时上限由 sampleBotBubble 的 130s 超时兜住，这里只记录）
    expect(sample.elapsed).toBeLessThan(130000);

    // ⑥ 抽屉里出现 1 个会话，标题 == 前 20 字 + '...'
    await openDrawer();
    const drawer = await drawerSessions();
    expect(drawer).toHaveLength(1);
    expect(drawer[0].title).toBe(expectedTitleOf(Q1));

    // ⑦ 交叉断言：后端真的有这个会话，且标题一致
    const after = await helpers.getChats(account.token);
    expect(after.status).toBe(200);
    expect(after.total).toBe(1);
    expect(after.chats[0].title).toBe(expectedTitleOf(Q1));

    // done 帧的 chat_id 确实被落地（才能续聊）
    state.chat1 = after.chats[0].id;
    expect(sample.last.currentChatId).toBe(state.chat1);

    // 后端也该有 2 条（1 user + 1 assistant）
    const msgs = await helpers.getMessages(account.token, state.chat1);
    expect(msgs.status).toBe(200);
    expect(msgs.total).toBe(2);
    expect(msgs.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(msgs.messages[0].content).toBe(Q1);
  });

  // ─────────────────────────────────────────────────────────────
  it('P2-02 会话续聊（带 chat_id）', async () => {
    requireChat({ chatId: state.chat1 }, 'P2-02');

    await sendViaUi(Q2);
    const sample = await sampleBotBubble();
    console.log(`[P2-02] 耗时 ${sample.elapsed}ms`);
    // 这条用例验的是「续聊带上了 chat_id」，**不验流式**（流式的证据在 P2-01 和 P2-07）。
    // 所以模型服务方偶尔返回空流时，这里只警告不判红 —— 否则一个 provider 抖动会被
    // 误读成「续聊坏了」，把真正的信号埋掉。文案兜底时下面的结构性断言仍然有效
    // （消息条数/顺序/chat_id 都不受回答内容影响，会话和 user 消息在调模型之前就已落库）。
    if (sample.botText.startsWith('抱歉，')) {
      console.warn('[P2-02] ⚠️ 这次回答是兜底文案（模型服务方返回空流），本用例不据此判红，见文件头');
    }

    // ① 消息列表累积到 4 条，顺序交替 user → bot
    expect(sample.last.messages.map((m) => m.type)).toEqual(['user', 'bot', 'user', 'bot']);
    expect(sample.last.messages[2].content).toBe(Q2);
    // 当前会话没变（没新建）
    expect(sample.last.currentChatId).toBe(state.chat1);

    // ② 会话列表仍只有 1 个
    expect(sample.last.sessions).toHaveLength(1);

    // ③ 交叉断言：后端 total 仍为 1；这条会话里正好 4 条，顺序交替
    const chats = await helpers.getChats(account.token);
    expect(chats.total).toBe(1);
    expect(chats.chats[0].id).toBe(state.chat1);

    const msgs = await helpers.getMessages(account.token, state.chat1);
    expect(msgs.total).toBe(4);
    expect(msgs.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(msgs.messages[2].content).toBe(Q2);
  });

  // ─────────────────────────────────────────────────────────────
  it('P2-03 新建会话', async () => {
    requireChat({ chatId: state.chat1 }, 'P2-03');

    // 步骤 1：抽屉里点「新建会话」
    await openDrawer();
    const page = await pageNow();
    await (await page.$('.new-chat-btn')).tap();
    await helpers.sleep(600);

    // ① 消息列表清空、currentChatId 置空（startNewChat 只动内存，不打后端）
    const cleared = await readChat();
    expect(cleared.messages).toHaveLength(0);
    expect(cleared.currentChatId).toBe('');
    // 会话列表还在（只是当前会话被重置）
    expect(cleared.sessions).toHaveLength(1);

    // 步骤 2：再发一条
    await sendViaUi(Q3);
    const sample = await sampleBotBubble();
    console.log(`[P2-03] 耗时 ${sample.elapsed}ms`);
    // 同 P2-02：这条验的是「新建会话 + 新标题」，不拿模型服务方的抖动判红。
    if (sample.botText.startsWith('抱歉，')) {
      console.warn('[P2-03] ⚠️ 这次回答是兜底文案（模型服务方返回空流），本用例不据此判红，见文件头');
    }
    expect(sample.last.messages).toHaveLength(2);

    // ② 会话列表变成 2 个，新会话标题来自新问题
    //
    // ⚠️ **不能直接断言 `sample.last.sessions`** —— 它是采样循环退出那一刻的快照，
    //    而应用刷新会话列表是「发出去就不管」的：`handleSend` 里
    //    `chatStore.fetchSessions()` 没 await（index.vue#L409），紧接着 finally 里
    //    `sendingMessage = false`（index.vue#L416）。`sampleBotBubble` 一看到
    //    「不在发送中」就退出，可能在列表的 HTTP 响应回来**之前**。
    //
    //    2026-10-18 实证（单跑 P2 连跑 4 轮里的 1 轮，5 条没通过 / 93.4s）：
    //      · 后端日志：chat2 回答落库后，下一条 jest 侧请求直接是 P2-06 的
    //        `getMessages(chat1)` —— P2-04 / P2-05(取消) / P2-05 **一条 HTTP 都没发**
    //        ⇒ 它们死在 `requireChat(state.chat2)`「缺前置」，根本没走到抽屉；
    //      · 开发者工具日志：P2-03 之后整轮只有 3 次页面跳转（P2-06 两次 Tab 切换 +
    //        P2-07 的 gotoIndex），P2-04 ④ / P2-05(取消) 收尾的 gotoIndex 都没发生；
    //      · ⇒ 真正的第一现场就是**本条**：`sessions` 还是旧的 1 条（本会话创建前是 1），
    //        断言失败 → `state.chat2` 没被赋值 → 后面三条全秒挂，
    //        P2-06 因 chat2 仍是最新而只拿到 2 条消息（≠4）。
    //      · 概率也对得上：轮询间隔 200ms、列表刷新约几十毫秒 ⇒ 约 1/4 的轮次会踩中。
    //
    //    改成「等列表收敛再断言」：断言的仍是应用的真实状态，只是不再赌刷新时序。
    const afterSend = await helpers.waitFor(
      async () => {
        const chat = await readChat();
        return chat.sessions.length === 2 && chat.sessions[0].title === expectedTitleOf(Q3)
          ? chat
          : false;
      },
      { timeout: 8000, label: '发完消息后会话列表刷成 2 个（新会话排第一）' }
    );
    expect(afterSend.sessions).toHaveLength(2);
    expect(afterSend.sessions.map((s) => s.title)).toContain(expectedTitleOf(Q3));
    // 新会话是「最新」的，排第一
    expect(afterSend.sessions[0].title).toBe(expectedTitleOf(Q3));
    expect(afterSend.currentChatId).not.toBe(state.chat1);

    // ③ 交叉断言：后端 total=2
    const chats = await helpers.getChats(account.token);
    expect(chats.total).toBe(2);
    state.chat2 = chats.chats[0].id;
    expect(state.chat2).toBe(afterSend.currentChatId);
    expect(chats.chats[1].id).toBe(state.chat1);
  });

  // ─────────────────────────────────────────────────────────────
  it('P2-04 重命名会话', async () => {
    requireChat({ chatId: state.chat2 }, 'P2-04');

    const NEW_TITLE = '我的第一个会话';
    const oldTitle = await drawerTitleAt(0);
    expect(oldTitle).toBe(expectedTitleOf(Q3));

    // 重命名走的是 uni.showModal 的**回调写法**，`withNativeModal` 两种写法都能应付，
    // 而且要把弹窗参数录下来 —— 预期①只能这样验（原生输入框 automator 敲不了字）。
    // 同时装一个 showToast 的记录壳：toast 文案是「后端是否真的成功」的直接证据
    // （doRename 只在 request 没抛错时才 toast「已重命名」，SessionDrawer.vue#L229-L236）。
    await helpers.withNativeCall(program, 'showToast', async () => {
      await helpers.withNativeModal(program, { confirm: true, content: NEW_TITLE }, async () => {
        await openDrawer();
        await tapDrawerAction(0, '.session-action-btn');

        // 等 UI 上的标题变成新名字（store.renameChat 成功后才会改本地列表）
        await helpers.waitFor(
          async () => {
            const t = await drawerTitleAt(0);
            return t === NEW_TITLE ? { title: t } : false;
          },
          { timeout: 15000, label: '抽屉里的标题变成新名称' }
        );

        // ① 弹窗参数：editable + placeholderText == 原名
        const modalCalls = await helpers.readNativeModalCalls(program);
        expect(modalCalls).toHaveLength(1);
        expect(modalCalls[0].title).toBe('重命名会话');
        expect(modalCalls[0].editable).toBe(true);
        expect(modalCalls[0].placeholderText).toBe(oldTitle);

        // toast 文案（顺带证明 request 没抛错）。
        // ⚠️ 顺序要紧：`renameChat` 是先改本地列表、**再**返回，doRename 拿到返回才 toast
        //    （SessionDrawer.vue#L229-L236）。所以「标题变了」只说明 PUT 已经回来了，
        //    toast 可能还差一拍 —— 单独等它，别紧接着就读。
        const toasts = await helpers.waitFor(
          async () => {
            const calls = await helpers.readNativeCalls(program, 'showToast');
            return calls.length > 0 ? { titles: calls.map((t) => t.title) } : false;
          },
          { timeout: 8000, label: '重命名成功的 toast' }
        );
        expect(toasts.titles).toContain('已重命名');
      });
    });

    // ② UI（store + DOM 两路）里标题是新名字
    const chat = await readChat();
    expect(chat.sessions[0].title).toBe(NEW_TITLE);
    expect(await drawerTitleAt(0)).toBe(NEW_TITLE);

    // ③ 交叉断言（关键）：后端**真的**改了 —— 防「只改本地状态、后端 404」那类 bug
    const chats = await helpers.getChats(account.token);
    expect(chats.status).toBe(200);
    expect(chats.total).toBe(2);
    expect(chats.chats.find((c) => c.id === state.chat2).title).toBe(NEW_TITLE);

    // ④ 重进首页（重新挂载 → onMounted → fetchSessions），标题仍是新标题（证明持久化）
    await gotoIndex({ settle: 2000 });
    const afterReload = await readChat();
    expect(afterReload.sessions.find((s) => s.id === state.chat2).title).toBe(NEW_TITLE);
    expect(await drawerTitleAt(0)).toBe(NEW_TITLE);
  });

  // ─────────────────────────────────────────────────────────────
  // P2-05（取消支）删会话点「取消」→ 不许删
  //
  // 与 settings 那条「P4-03（取消支）」是同一类误触防呆，但**调用点不同、写法也不同**：
  //   · SessionDrawer.vue#L189-L197 是**回调写法**（`success: async (res) => { if (res.confirm) ... }`）
  //   · settings/index.vue#L204 是 **await 写法**（`if (!result.confirm) return`）
  // 所以两条都得单独验 —— 「UI 上都是个确认框，各人各写各的实现」正是这类防呆
  // 最容易漏掉其中一处的地方。全仓只有 3 处 showModal，这是第 2 处（第 3 处在 P3-04）。
  //
  // ⚠️ 位置很关键：必须夹在 P2-04 和 P2-05 之间。P2-05 要删的正是下面这条 chat2；
  //    「先证明取消删不掉、紧接着点确定就删掉了」这两条连着读，比单看一条有说服力。
  it('P2-05（取消支）点「取消」→ 会话还在：本地 2 条、后端 2 条', async () => {
    requireChat({ chatId: state.chat2 }, 'P2-05(取消)');

    const before = await helpers.getChats(account.token);
    expect(before.total).toBe(2);

    // 与 P2-05 同一起点：当前会话 = chat2（P2-04 结尾重进过首页，onMounted 把最近一条拉成当前）
    const current = await readChat();
    expect(current.currentChatId).toBe(state.chat2);
    expect(current.sessions.map((s) => s.id)).toEqual([state.chat2, state.chat1]);

    let modalCalls = [];
    await helpers.withNativeModal(program, { confirm: false }, async () => {
      await openDrawer();
      await tapDrawerAction(0, '.session-action-btn--danger');
      modalCalls = await helpers.readNativeModalCalls(program);
    });

    // 对照组（不能省）：弹窗确实弹了。没有它，「没删」和「按钮没点到」分不出来。
    expect(modalCalls).toHaveLength(1);
    expect(modalCalls[0].title).toBe('删除会话');
    expect(modalCalls[0].content).toBe('确定要删除此会话吗？');

    // 等它去「犯错」：真删的话列表会立刻变成 1 条（P2-05 那条就是点完立刻等这个变化）
    await helpers.sleep(2500);

    // ① 本地列表没变 —— UI + store 两路，与 P2-05 的观测面保持一致
    expect(await drawerSessions()).toHaveLength(2);
    const afterCancel = await readChat();
    expect(afterCancel.sessions.map((s) => s.id)).toEqual([state.chat2, state.chat1]);

    // ② 顺带验没被误伤：chat2 还是当前会话、消息还在。
    //    （P2-05 点确定之后这两样都会被清掉，依据 chat.ts#L170-L173）
    expect(afterCancel.currentChatId).toBe(state.chat2);
    expect(afterCancel.messages.length).toBeGreaterThan(0);

    // ③ 交叉断言（关键）：后端还是 2 条、两条都在 —— 证明真的没发 DELETE
    const after = await helpers.getChats(account.token);
    expect(after.total).toBe(2);
    expect(after.chats.map((c) => c.id).sort()).toEqual([state.chat1, state.chat2].sort());

    // 收尾：重进首页（和 P2-04 的收尾一样）。
    // 既把抽屉状态复位（不确定取消后抽屉是开是闭，别把这个不确定性传给下一条），
    // 也让 P2-05 的前置与本条插入之前**完全一致**（最近一条仍是 chat2 → 仍是当前会话）。
    await gotoIndex({ settle: 2000 });
  });

  // ─────────────────────────────────────────────────────────────
  it('P2-05 删除会话', async () => {
    requireChat({ chatId: state.chat2 }, 'P2-05');

    const before = await helpers.getChats(account.token);
    expect(before.total).toBe(2);

    // 要删的是**当前会话**（state.chat2），这样才能顺带验「删当前会话 → 消息列表清空」。
    // P2-04 结尾重进过首页，onMounted 会把最近一条（chat2）拉成当前会话。
    const current = await readChat();
    expect(current.currentChatId).toBe(state.chat2);
    expect(current.messages.length).toBeGreaterThan(0);
    expect(current.sessions[0].id).toBe(state.chat2);

    await helpers.withNativeModal(program, { confirm: true }, async () => {
      await openDrawer();
      await tapDrawerAction(0, '.session-action-btn--danger');

      // ① 弹窗文案
      const modalCalls = await helpers.readNativeModalCalls(program);
      expect(modalCalls).toHaveLength(1);
      expect(modalCalls[0].title).toBe('删除会话');
      expect(modalCalls[0].content).toBe('确定要删除此会话吗？');

      // ② UI 里该会话消失
      await helpers.waitFor(
        async () => {
          const items = await drawerSessions();
          return items.length === 1 ? { count: items.length } : false;
        },
        { timeout: 15000, label: '抽屉里只剩 1 条会话' }
      );
    });

    // ③ 删的是当前会话 → 消息列表清空、currentChatId 置空（chat.ts#L170-L173）
    const afterDelete = await readChat();
    expect(afterDelete.messages).toHaveLength(0);
    expect(afterDelete.currentChatId).toBe('');
    expect(afterDelete.sessions.map((s) => s.id)).toEqual([state.chat1]);

    // ④ 交叉断言：后端 total 减 1
    const chats = await helpers.getChats(account.token);
    expect(chats.total).toBe(1);
    expect(chats.chats[0].id).toBe(state.chat1);
  });

  // ─────────────────────────────────────────────────────────────
  it('P2-06 历史消息回填（切走再回来）', async () => {
    requireChat({ chatId: state.chat1 }, 'P2-06');

    // 期望值从后端现取（不写死）：C1 里应该有 P2-01/P2-02 留下的 4 条
    const truth = await helpers.getMessages(account.token, state.chat1);
    expect(truth.status).toBe(200);
    expect(truth.total).toBe(4);
    expect(truth.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);

    // 把内存里的消息清掉 —— 否则「回填回来了」无法与「上次的残留还在」区分。
    // （这一步是测法上的刻意构造，不是产品行为；对照面是 P4-05 的「注入残留再观察它消失」。）
    const cleared = await clearChatMessages();
    expect(cleared.messages).toBe(0);
    expect(cleared.currentChatId).toBe('');

    // 步骤：点底部导航的「自选」切走，再点「问小E」切回（真实用户路径，
    // 走的是 TabBar 里的 uni.redirectTo，见 TabBar.vue#L105-L125 —— redirectTo 会**替换**页面，
    // 所以切回来时首页是重新挂载的，onMounted 才会再拉一次会话和消息）。
    const p1 = await pageNow();
    await tapTabBar(p1, '自选');
    await helpers.waitForPage(program, WATCHLIST_PATH, { timeout: 10000, label: '点「自选」应离开首页' });

    const p2 = await pageNow();
    await tapTabBar(p2, '问小E');
    await helpers.waitForPage(program, INDEX_PATH, { timeout: 10000, label: '点「问小E」应回到首页' });

    // ① onMounted → fetchSessions → 自动加载最近一个会话的消息，条数与后端一致
    const filled = await helpers.waitFor(
      async () => {
        const chat = await readChat();
        return chat.messages.length > 0 ? chat : false;
      },
      { timeout: 15000, label: '首页重新挂载后自动回填消息' }
    );
    expect(filled.messages).toHaveLength(truth.total);
    expect(filled.currentChatId).toBe(state.chat1);

    // ② role user/assistant 映射成 user/bot，顺序一致
    const expectedTypes = truth.messages.map((m) => (m.role === 'user' ? 'user' : 'bot'));
    expect(filled.messages.map((m) => m.type)).toEqual(expectedTypes);

    // ③ 中文内容完全一致（顺带验 UTF-8 往返；这一路不经过 SSE 分块）
    expect(filled.messages.map((m) => m.content)).toEqual(truth.messages.map((m) => m.content));
  });

  // ─────────────────────────────────────────────────────────────
  // 额外一条：不在 6 条之列，见文件头「P2-07」。放在最后，不污染上面几条的真实会话。
  it('P2-07 造流专项：换掉 wx.request 自己造分块（中文切两半 / 半块不提前渲染 / done 落地）', async () => {
    const FAKE_CHAT_ID = 'e2e-fake-chat-0000-1111-2222-333344445555';
    const TOKENS = ['你', '好', '，', '世界'];
    const PAYLOAD =
      TOKENS.map((c) => `data: {"type": "token", "content": "${c}"}\n\n`).join('') +
      `data: {"type": "done", "chat_id": "${FAKE_CHAT_ID}"}\n\n`;
    const FULL_TEXT = TOKENS.join('');

    // 回到干净的首页状态（上一条把 C1 打开了，先新开会话，免得断言被历史消息干扰）
    await gotoIndex({ settle: 1000 });
    const page0 = await pageNow();
    await (await (await page0.$('chat-top-bar')).$('#drawer-toggle')).tap(); // 开抽屉
    await helpers.sleep(700);
    await (await (await pageNow()).$('.new-chat-btn')).tap();
    await helpers.sleep(600);
    expect((await readChat()).messages).toHaveLength(0);

    let midwayBotText = null;
    let intercepted = null;

    await helpers.withStreamMock(program, { urlIncludes: '/api/secure-chat' }, async () => {
      await sendViaUi('分批测试');

      // 喂字节之前必须等应用注册好分块回调 —— 否则字节喂给 null，静默丢，
      // 表现为「气泡一直是空的」然后超时（helpers/streamMock.js#L224-L240）。
      await helpers.waitChunkHandler(program);

      intercepted = await helpers.readInterceptedSse(program);
      expect(intercepted).not.toBeNull();
      expect(intercepted.method).toBe('POST');
      expect(intercepted.body.question).toBe('分批测试');
      // 新会话：不该带 chat_id
      expect(intercepted.body.chat_id).toBeUndefined();

      // ⭐ 把「你」这个汉字切在两个分块之间喂进去
      const split = await helpers.pushChunkSplitMidChar(program, PAYLOAD, {
        midDelay: 500,
        // onHead 是唯一能观察「只喂了前半块」的窗口 —— 这时一个完整的 token 帧都还没凑齐，
        // 所以气泡必须是空的（实现要是「来多少渲染多少」，这里就会看到半个乱码字符）。
        onHead: async () => {
          const chat = await readChat();
          midwayBotText = [...chat.messages].reverse().find((m) => m.type === 'bot').content;
        },
      });
      console.log(`[P2-07] 切点：第 ${split.charIndex} 字节后切开（共 ${split.byteLength} 字节）`);
      expect(split.charIndex).toBeGreaterThan(0);

      // ② 半块时没有提前渲染
      expect(midwayBotText).toBe('');

      // ① 全部喂完：文案 == 我们造的那 4 个字，且无乱码替换字符
      const rendered = await helpers.waitFor(
        async () => {
          const chat = await readChat();
          const bot = [...chat.messages].reverse().find((m) => m.type === 'bot');
          return bot && bot.content.length > 0 ? { text: bot.content } : false;
        },
        { timeout: 8000, label: '造流的内容渲染出来' }
      );
      expect(rendered.text).toBe(FULL_TEXT);
      expect(rendered.text.includes('�')).toBe(false);
      // 半截字符没有被当成乱码吞掉：字符数 == 我们造的那几个字。
      // （注意别写死数字：'你','好','，','世界' 拼起来是 5 个字符，不是 4 —— 这里按数组算。）
      expect(rendered.text).toHaveLength(FULL_TEXT.length);

      // ③ 收尾（真的调用应用传进来的 success）→ done 帧的 chat_id 被落地
      await helpers.finishStream(program);
      const settled = await helpers.waitFor(
        async () => {
          const chat = await readChat();
          return chat.currentChatId ? chat : false;
        },
        { timeout: 8000, label: 'done 帧的 chat_id 落到 currentChatId' }
      );
      expect(settled.currentChatId).toBe(FAKE_CHAT_ID);
      expect(settled.sending).toBe(false);
    });

    // ③ 的后半：下一条消息**真的**带上了这个 chat_id（这是 P2-02 的机制，
    //     真实链路只能从后端侧面看结果，这里能直接看请求体）
    await helpers.withStreamMock(program, { urlIncludes: '/api/secure-chat' }, async () => {
      await sendViaUi('带上下文');
      await helpers.waitChunkHandler(program);
      const second = await helpers.readInterceptedSse(program);
      expect(second.body.question).toBe('带上下文');
      expect(second.body.chat_id).toBe(FAKE_CHAT_ID);
      // 顺手把这轮也收尾，避免留下一个挂着的请求
      await helpers.pushChunk(program, `data: {"type": "token", "content": "ok"}\n\n`);
      await helpers.finishStream(program);
      await helpers.sleep(500);
    });

    // 收尾：把 store 复位，别把假 chat_id 留在这里
    await clearChatMessages();
  });

  // ─────────────────────────────────────────────────────────────
  // P2-08 ~ P2-11 流式异常分支（2026-10-19 补）
  //
  // 覆盖 src/pages/index/index.vue#streamChatMp 里**四条互不相同的失败路径**，
  // 全部靠 streamMock 造，不花真实 LLM token、不等 130 秒：
  //   · success 里 HTTP 非 2xx          → #L230-L234
  //   · success 里收到服务端 error 帧   → #L190-L192 记录， #L243-L246 统一 reject
  //   · success 里一个 token 都没收到   → #L248-L251
  //   · fail（网络层失败）              → #L254-L268
  // 四条最终都由 handleSend 的 catch 落到展示点 `抱歉，${message}。`（#L411-L414），
  // 并且 `sendingMessage` 必须复位（#L416）——不复位的话输入区会永远禁用，用户以为卡死。
  //
  // 断言用**应用展示给用户的原文**，不自己发明文案：文案变了就说明 product 行为变了，
  // 应该让用例红、回来更新，而不是在用例里提前「对齐」成我们以为的样子。
  // ─────────────────────────────────────────────────────────────
  it('P2-08 流式异常①：HTTP 500 → 显示「抱歉，AI 请求失败（HTTP 500）。」，发送状态复位', async () => {
    await resetChatForStreamTest();

    await helpers.withStreamMock(program, { urlIncludes: '/api/secure-chat' }, async () => {
      await sendViaUi('服务端错误测试');
      await helpers.waitChunkHandler(program);

      // 请求确实发出去了，且这是新会话（不带 chat_id）——否则下面的断言可能打在一个没发的请求上
      const intercepted = await helpers.readInterceptedSse(program);
      expect(intercepted.body.question).toBe('服务端错误测试');
      expect(intercepted.body.chat_id).toBeUndefined();

      // `success` 里 statusCode 非 2xx（index.vue#L230）→ reject
      await helpers.finishStream(program, { statusCode: 500 });

      const chat = await waitForBotText('抱歉，AI 请求失败（HTTP 500）。');
      expect(chat.sending).toBe(false);
    });
  });

  it('P2-09 流式异常②：中途收到服务端 error 帧 → 已渲染的内容被错误文案覆盖', async () => {
    await resetChatForStreamTest();

    await helpers.withStreamMock(program, { urlIncludes: '/api/secure-chat' }, async () => {
      await sendViaUi('上游错误测试');
      await helpers.waitChunkHandler(program);

      // 先喂一个正常 token，证明「已经收到内容」——这样后面的覆盖才有意义。
      await helpers.pushChunk(program, `data: {"type": "token", "content": "半截回答"}\n\n`);
      await waitForBotText('半截回答');

      // 再喂 error 帧（parseSSELine 对应 src/utils/sse.ts#L39-L41）
      await helpers.pushChunk(
        program,
        `data: {"type": "error", "message": "上游模型服务不可用"}\n\n`
      );
      await helpers.finishStream(program);

      // 关键：即使已经渲染过 token，也必须按失败处理（不能把半截回答当成功留下）
      const chat = await waitForBotText('抱歉，上游模型服务不可用。');
      expect(chat.sending).toBe(false);
    });
  });

  it('P2-10 流式异常③：网络层失败 → 显示「抱歉，request:fail 模拟网络异常。」', async () => {
    await resetChatForStreamTest();

    await helpers.withStreamMock(program, { urlIncludes: '/api/secure-chat' }, async () => {
      await sendViaUi('网络失败测试');
      await helpers.waitChunkHandler(program);

      // 走 `fail` 回调（index.vue#L254），不是 success 里的 HTTP 分支
      await helpers.failStream(program, 'request:fail 模拟网络异常');

      const chat = await waitForBotText('抱歉，request:fail 模拟网络异常。');
      expect(chat.sending).toBe(false);
    });
  });

  it('P2-11 流式异常④：正常结束但一个 token 都没有 → 显示「抱歉，AI 服务未返回有效回复。」，之后还能再发', async () => {
    await resetChatForStreamTest();

    await helpers.withStreamMock(program, { urlIncludes: '/api/secure-chat' }, async () => {
      await sendViaUi('空流测试');
      await helpers.waitChunkHandler(program);

      // HTTP 200、不喂任何分块、正常收尾 → index.vue#L248-L251
      // 这正是 D-07 在应用层的表现：真实 LLM 偶尔整段不吐字，页面必须给出可读提示。
      await helpers.finishStream(program);

      const chat = await waitForBotText('抱歉，AI 服务未返回有效回复。');
      expect(chat.sending).toBe(false);
    });

    // 失败之后还能发下一条 —— 只断言 `sending === false` 不够，
    // 要证明「发送这个动作本身真的还能走通」，而不是只把标志位改回去了。
    await helpers.withStreamMock(program, { urlIncludes: '/api/secure-chat' }, async () => {
      await sendViaUi('恢复测试');
      await helpers.waitChunkHandler(program);
      await helpers.pushChunk(program, `data: {"type": "token", "content": "恢复了"}\n\n`);
      await helpers.finishStream(program);
      await waitForBotText('恢复了');
    });
  });
});
