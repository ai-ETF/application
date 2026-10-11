/**
 * L1 单元测试：SSE 行解析 + 分块 UTF-8 解码
 *
 * 这两段代码在聊天链路里跑在最前面，上游给什么字节都不由我们控制，
 * 所以这里重点喂「不完整 / 不合法」的输入，而不是只喂一遍正常数据。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUtf8StreamDecoder, parseSSELine } from '@/utils/sse';

// ==================== 分块 UTF-8 解码 ====================

const REAL_TEXT_DECODER = globalThis.TextDecoder;

type Decoder = ReturnType<typeof createUtf8StreamDecoder>;

/**
 * 同一个解码器有两个实现分支：有 TextDecoder 时用原生，没有时用源码里
 * 手写的那份。**真机走的是手写那份**，但开发者工具里走原生 ——
 * 所以两套都得测，且期望结果必须一致，否则「开发者工具里好好的、
 * 真机上乱码」这类问题就会漏过去。
 */
const MODES = [
  {
    name: '原生 TextDecoder（开发者工具 / H5 走这条）',
    apply: () => {
      vi.stubGlobal('TextDecoder', REAL_TEXT_DECODER);
    },
  },
  {
    name: '手写降级实现（微信真机没有 TextDecoder 时走这条）',
    apply: () => {
      vi.stubGlobal('TextDecoder', undefined);
    },
  },
];

/** 按顺序喂若干块字节，返回「逐块解出来的正文」和「收尾 flush 出来的尾巴」。 */
function decodeChunks(chunks: number[][]): { text: string; flushed: string } {
  const decoder: Decoder = createUtf8StreamDecoder();
  let text = '';
  for (const chunk of chunks) {
    text += decoder.decode(Uint8Array.from(chunk).buffer);
  }
  return { text, flushed: decoder.flush() };
}

/** 把字符串按 UTF-8 拆成字节数组。 */
function utf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

describe.each(MODES)('分块 UTF-8 解码器 —— $name', ({ apply }) => {
  beforeEach(apply);
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('一个汉字被切成 2+1 字节，拼回来不能有乱码', () => {
    // 「你」「好」各占 3 字节，切成前 2 字节 + 后 4 字节
    const bytes = utf8Bytes('你好');
    const { text, flushed } = decodeChunks([bytes.slice(0, 2), bytes.slice(2)]);

    expect(text).toBe('你好');
    expect(text + flushed).not.toContain('�');
  });

  it('一个字节一个字节地喂，结果和一次性喂完一样', () => {
    const whole = utf8Bytes('你好世界');
    const { text, flushed } = decodeChunks(whole.map((byte) => [byte]));

    expect(text).toBe('你好世界');
    expect(text + flushed).not.toContain('�');
  });

  it('4 字节字符（emoji）被切成 2+2，拼回一个完整的代理对', () => {
    const bytes = utf8Bytes('😀');
    expect(bytes).toHaveLength(4);

    const { text } = decodeChunks([bytes.slice(0, 2), bytes.slice(2)]);

    expect(text).toBe('😀');
    // JS 里这个字符是 2 个 UTF-16 码元，说明补成了正确的代理对
    expect(text).toHaveLength(2);
  });

  it('半个字停在缓冲区时先不吐乱码，要等 flush 才认输', () => {
    // 这条是「攒着等下一块」的直接证据：如果实现是「碰到不完整就先吐 �」，
    // 真机上每个跨块的汉字都会多出一个乱码
    const { text, flushed } = decodeChunks([utf8Bytes('你').slice(0, 1)]);

    expect(text).toBe('');
    expect(flushed).toBe('�');
  });

  it('凭空出现的续接字节吐乱码，后面的正常字符不受影响', () => {
    const { text } = decodeChunks([[0x80, ...utf8Bytes('你')]]);

    expect(text).toBe('�你');
  });

  it('三字节字符后面跟了个 ASCII，坏的那截被替换、ASCII 照常出来', () => {
    const { text, flushed } = decodeChunks([[0xe4, 0x41]]);

    expect(text + flushed).toBe('�A');
  });

  it('纯 ASCII 分块不受影响', () => {
    const { text } = decodeChunks([[0x68, 0x65], [0x6c, 0x6c, 0x6f]]);

    expect(text).toBe('hello');
  });
});

// ==================== SSE 行解析 ====================

describe('parseSSELine', () => {
  it('data: 前缀的 token 事件', () => {
    expect(parseSSELine('data: {"type":"token","content":"你好"}')).toEqual({
      type: 'token',
      content: '你好',
    });
  });

  it('data: 前缀的 done 事件带上 chat_id', () => {
    expect(parseSSELine('data: {"type":"done","chat_id":"chat-1"}')).toEqual({
      type: 'done',
      chatId: 'chat-1',
    });
  });

  it('[DONE] 哨兵也算结束，只是没有 chat_id', () => {
    expect(parseSSELine('data: [DONE]')).toEqual({ type: 'done', chatId: '' });
  });

  it('error 事件优先用上游给的文案', () => {
    expect(parseSSELine('data: {"type":"error","message":"上游超时"}')).toEqual({
      type: 'error',
      message: '上游超时',
    });
  });

  it('error 事件没给文案时兜底成「AI 服务调用失败」', () => {
    expect(parseSSELine('data: {"type":"error"}')).toEqual({
      type: 'error',
      message: 'AI 服务调用失败',
    });
  });

  it('没有 data: 前缀的裸 JSON 也认', () => {
    expect(parseSSELine('{"type":"token","content":"a"}')).toEqual({ type: 'token', content: 'a' });
  });

  it('token 事件没有 content 时当作无效行，不返回残缺对象', () => {
    expect(parseSSELine('data: {"type":"token"}')).toBeNull();
  });

  it('JSON 坏掉时返回 null 而不是抛异常', () => {
    // 上游偶尔会发半截 JSON；这里必须吞掉，否则整条流会中断
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseSSELine('data: {"type":"tok')).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('空行和空字符串返回 null', () => {
    expect(parseSSELine('')).toBeNull();
    expect(parseSSELine('   ')).toBeNull();
  });

  it('既不是 data: 也不是 JSON 的行（心跳/注释）返回 null', () => {
    expect(parseSSELine(': keep-alive')).toBeNull();
    expect(parseSSELine('event: ping')).toBeNull();
  });
});
