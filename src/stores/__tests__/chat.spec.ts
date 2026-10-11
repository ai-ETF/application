/**
 * L1 单元测试：聊天 Store 的纯动作
 *
 * 这些函数是流式回复的"写入口"：AI 每吐一个 token 就往某条消息上追加一次。
 * 它们本身很短，但越界索引、用户切换时没清干净这两类问题，在真机上表现为
 * "消息串台"或"闪一下就崩"，很难复现 —— 这里直接把边界喂进去。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeUni } from '@/utils/__tests__/helpers/fake-uni';
import { useChatStore } from '@/stores/chat';
import { activateFreshPinia } from './helpers/pinia';

let fake: ReturnType<typeof createFakeUni>;

beforeEach(() => {
  activateFreshPinia();
  fake = createFakeUni();
  fake.install();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('流式写入消息', () => {
  it('addUserMessage 追加一条用户消息并返回它', () => {
    const store = useChatStore();

    const message = store.addUserMessage('你好');

    expect(message.type).toBe('user');
    expect(message.content).toBe('你好');
    expect(store.messages).toHaveLength(1);
  });

  it('addEmptyBotMessage 返回新消息的下标，供后续逐字追加', () => {
    const store = useChatStore();
    store.addUserMessage('你好');

    const index = store.addEmptyBotMessage();

    expect(index).toBe(1);
    expect(store.messages[1]).toMatchObject({ type: 'bot', content: '' });
  });

  it('appendBotToken 把 token 拼在已有内容后面', () => {
    const store = useChatStore();
    const index = store.addEmptyBotMessage();

    store.appendBotToken(index, '你');
    store.appendBotToken(index, '好');

    expect(store.messages[index].content).toBe('你好');
  });

  it('越界下标不炸、也不改动任何消息', () => {
    const store = useChatStore();
    const index = store.addEmptyBotMessage();
    store.appendBotToken(index, '好');

    // 用户在中途切走会话时，回调里的下标就可能已经越界了
    store.appendBotToken(-1, 'x');
    store.appendBotToken(99, 'x');

    expect(store.messages).toHaveLength(1);
    expect(store.messages[index].content).toBe('好');
  });

  it('setBotMessage 整体替换，不是追加', () => {
    const store = useChatStore();
    const index = store.addEmptyBotMessage();
    store.appendBotToken(index, '半截回答');

    store.setBotMessage(index, 'AI 服务调用失败');

    expect(store.messages[index].content).toBe('AI 服务调用失败');
  });

  it('越界的 setBotMessage 同样不炸', () => {
    const store = useChatStore();
    store.addEmptyBotMessage();

    store.setBotMessage(-1, 'x');
    store.setBotMessage(99, 'x');

    expect(store.messages).toHaveLength(1);
    expect(store.messages[0].content).toBe('');
  });
});

describe('resetForAuthChange', () => {
  it('把上一位用户留下的会话和消息全部清空', () => {
    const store = useChatStore();
    store.addUserMessage('上一位用户说的话');
    store.addEmptyBotMessage();
    store.setCurrentChatId('chat-1');

    store.resetForAuthChange();

    expect(store.messages).toEqual([]);
    expect(store.currentChatId).toBe('');
    // 这几个标志如果没清，新用户进来会一直转圈
    expect(store.loadingSessions).toBe(false);
    expect(store.loadingMessages).toBe(false);
    expect(store.sendingMessage).toBe(false);
  });
});
