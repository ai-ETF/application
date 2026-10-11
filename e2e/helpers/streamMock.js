/**
 * 拦截 `wx.request`，自己造一条 SSE 流 —— 给 P2（AI 对话）用。
 *
 * ⚠️ 先读这段，它跟 `uniMock.js` 里那条「`wx.*` 改不动」的规则**看起来矛盾，其实不矛盾**：
 *
 *   · **路由类**（`wx.reLaunch` / `wx.navigateTo` …）改不动 —— uni-app 启动时就把引用缓存住了。
 *    · **`wx.request` 改得动**，而且**应用自己发的请求真的会走我们换上去的那个函数**。
 *      因为 `uni.request` 是**调用时**才去取 `wx.request`（属性查找），不是启动时缓存的。
 *
 *   ⇒ 规则不是「`wx.*` 都能换」也不是「都不能换」，而是 **每个 API 各自实测**。
 *
 * 2026-10-10 实测证据（探针 `e2e/z-probe-wxrequest.e2e.js`，用完已拆）：
 *   · Q1 `wx.request` 换得掉：`{typeBefore:"function", patched:true, isSameRef:false}`
 *   · Q2 应用自己发的请求被壳拦到了：
 *        `{"url":".../api/secure-chat/chats?limit=50","method":"GET","enableChunked":false}`
 *   · Q3 真 `RequestTask` 只有 `uniqueId` / `taskInvoker` 两个自有键 —— 原型上啥都没有，
 *       所以我们的「假货」只要凑齐应用会调的那几个方法（`onChunkReceived` / `abort`）就够。
 *   · Q4 伪造 task + 手动喂字节，走真实聊天 UI，**把「你」这个汉字切在两块之间**，
 *        最后渲染出 `你好`，**无乱码**。⇒ 应用自己的分块解码器（`createUtf8StreamDecoder`）是对的。
 *
 * 为什么值得造这条假流：P2 的 SSE 原来以为只能在 E2E 层「等真后端慢慢吐」，
 * 于是既不确定（LLM 非确定性）、又贵（单条 ≥130 秒）、还造不出「中文被切两半」这种边界。
 * 现在测试侧自己控字节，这几件事一次解决。
 *
 * 单条用例成本：约 35 秒。
 *
 * @see ai-etf/docs/e2e/04-工具选型.md 「2026-10-10 重大订正」
 */

const { sleep } = require('./waitFor');

/**
 * 装上壳：`enableChunked` 的请求被接住（记住 opts、返回假 task），其余原样透传。
 *
 * 只拦流式请求是**刻意的** —— 同一个用例里往往还有普通请求（会话列表、鉴权），
 * 那些必须走真后端，否则「会话列表拉回来了没有」这类断言就失去意义了。
 *
 * @param {object} program uni-automator 的 program
 * @param {{urlIncludes?: string}} [opts] 只拦 URL 含该串的流式请求；不传则拦所有 `enableChunked`
 */
async function installStreamMock(program, { urlIncludes = '' } = {}) {
  return program.evaluate((needle) => {
    if (wx.__e2eOrigRequest) return 'already';
    wx.__e2eOrigRequest = wx.request;
    wx.__e2eSseOpts = null; // 拦到的那次请求的完整 opts（含 success/complete）
    wx.__e2eSseSeen = null; // 只留可序列化的摘要，给断言用
    wx.__e2eChunkCb = null; // 应用注册的 onChunkReceived 回调
    wx.__e2eSseAborted = false;

    wx.request = function (opts) {
      const o = opts || {};
      if (!o.enableChunked || (needle && String(o.url).indexOf(needle) === -1)) {
        return wx.__e2eOrigRequest.apply(this, arguments);
      }
      wx.__e2eSseOpts = o;
      wx.__e2eSseSeen = {
        url: o.url,
        method: o.method,
        enableChunked: true,
        hasAuth: !!(o.header && (o.header.Authorization || o.header.authorization)),
        body: o.data,
      };
      // 真 RequestTask 只有 uniqueId/taskInvoker 两个自有键（Q3 实测），
      // 这里只需凑齐应用会调的方法。方法返回 task 是链式调用（`.onChunkReceived(...)`）的要求。
      const task = {
        onChunkReceived(cb) {
          wx.__e2eChunkCb = cb;
          return task;
        },
        onHeadersReceived() {
          return task;
        },
        abort() {
          wx.__e2eSseAborted = true;
        },
      };
      return task;
    };
    return 'patched';
  }, urlIncludes);
}

/** 还原 `wx.request`。不还原的话补丁会残留到同文件后面的用例。 */
async function restoreStreamMock(program) {
  return program.evaluate(() => {
    if (!wx.__e2eOrigRequest) return 'nothing-to-restore';
    wx.request = wx.__e2eOrigRequest;
    delete wx.__e2eOrigRequest;
    return 'restored';
  });
}

/** `installStreamMock` + 无论成败都还原。**写用例请一律用这个**，别裸调。 */
async function withStreamMock(program, opts, fn) {
  const args = typeof opts === 'function' ? {} : opts || {};
  const run = typeof opts === 'function' ? opts : fn;
  await installStreamMock(program, args);
  try {
    return await run();
  } finally {
    try {
      await restoreStreamMock(program);
    } catch (e) {
      console.warn(`[streamMock] 还原 wx.request 失败：${(e && e.message) || e}`);
    }
  }
}

/** 应用发出去的那次流式请求的摘要（还没发出去时是 null）。 */
async function readInterceptedSse(program) {
  return program.evaluate(() => wx.__e2eSseSeen);
}

/** 应用有没有注册 `onChunkReceived` —— 没注册就说明请求还没走到那一步。 */
async function hasChunkHandler(program) {
  return program.evaluate(() => typeof wx.__e2eChunkCb === 'function');
}

/**
 * 把一段文本按 UTF-8 编码后当成**一个分块**喂给应用。
 *
 * 小程序环境不一定有 `TextEncoder`，所以编码是手写的（这也是探针里的做法）。
 */
async function pushChunk(program, text) {
  const bytes = await program.evaluate((s) => {
    const out = [];
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      // 注意：这里不处理代理对（emoji 等 4 字节字符），P2 的流里没有，需要时再补。
      else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }, text);

  await program.evaluate((b) => {
    const u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b[i];
    wx.__e2eChunkCb({ data: u.buffer });
    return true;
  }, bytes);
}

/**
 * ⭐ 把一个汉字**切开**成两个分块喂进去 —— 这是这套手法最值钱的地方。
 *
 * 「某个多字节字符横跨两个网络分块」是真实网络里会发生、但在 E2E 里一直造不出来的场景。
 * 应用那边靠 `createUtf8StreamDecoder` 把半个字符攒着等下一块，
 * 这里就是去戳它：**喂完后半块渲染出的文案必须没有 `�`**。
 *
 * @param {{midDelay?: number, onHead?: () => Promise<any>}} [opts]
 *        `onHead` 在**只喂了前半块之后**被 await —— 这是唯一能断言「半个字符还没被渲染出来」的窗口。
 *        没有它的话，你说的「中途」其实已经是两块都喂完的状态了（自己踩过）。
 * @returns {{split:number, charIndex:number, byteLength:number}} 切点信息，方便断言/打日志
 */
async function pushChunkSplitMidChar(program, text, { midDelay = 400, onHead } = {}) {
  const plan = await program.evaluate((s) => {
    const bytes = [];
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    // 找第一个 3 字节字符（汉字就在这一段）的首字节。
    // 合法的 UTF-8 里，0xE0~0xEF 只可能是 3 字节字符的首字节 —— 续字节都是 0x80~0xBF，不会误命中。
    let charIndex = -1;
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] >= 0xe0 && bytes[i] <= 0xef) {
        charIndex = i;
        break;
      }
    }
    if (charIndex === -1) return null;
    const split = charIndex + 1; // 往首字节后面切 1 字节 = 切在这个字符内部
    return {
      byteLength: bytes.length,
      charIndex,
      split,
      head: bytes.slice(0, split),
      tail: bytes.slice(split),
    };
  }, text);

  if (!plan) {
    // 没有多字节字符，退化成整块喂
    await pushChunk(program, text);
    return { split: -1, charIndex: -1, byteLength: -1 };
  }

  await program.evaluate((b) => {
    const u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b[i];
    wx.__e2eChunkCb({ data: u.buffer });
    return true;
  }, plan.head);

  await sleep(midDelay); // 留出窗口：这时应用应该「什么也没渲染出来」，别急着断言内容
  if (onHead) await onHead();

  await program.evaluate((b) => {
    const u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b[i];
    wx.__e2eChunkCb({ data: u.buffer });
    return true;
  }, plan.tail);

  return { split: plan.split, charIndex: plan.charIndex, byteLength: plan.byteLength };
}

/** 收尾：调应用传进来的 `success`/`complete`，让请求「正常结束」。 */
async function finishStream(program, { statusCode = 200 } = {}) {
  return program.evaluate((code) => {
    const o = wx.__e2eSseOpts;
    if (!o) return 'no-intercepted-request';
    const res = { statusCode: code, data: '' };
    if (typeof o.success === 'function') o.success(res);
    if (typeof o.complete === 'function') o.complete(res);
    return 'ok';
  }, statusCode);
}

/**
 * 常用组合：等应用注册好分块回调 → 喂一整条流 → 收尾。
 *
 * `waitFor` 用不了（这里等的是 evaluate 里的状态），所以用轮询。
 * 轮询是必要的：`tap()` 发送键之后，请求要飞出去、回调才注册得上，
 * 立刻喂字节会喂给 `null`（静默丢，表现为「气泡一直是空的」）。
 */
async function waitChunkHandler(program, { timeout = 8000, interval = 200 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await hasChunkHandler(program)) return true;
    if (Date.now() > deadline) {
      throw new Error(`[streamMock] 等了 ${timeout}ms，应用始终没注册 onChunkReceived（SSE 请求没发出去？）`);
    }
    await sleep(interval);
  }
}

module.exports = {
  installStreamMock,
  restoreStreamMock,
  withStreamMock,
  readInterceptedSse,
  hasChunkHandler,
  waitChunkHandler,
  pushChunk,
  pushChunkSplitMidChar,
  finishStream,
};
