/**
 * ============================================
 * 聊天会话状态管理 Store
 * ============================================
 * 管理会话列表、当前会话消息、会话切换等
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { request } from '@/utils/request';
import type { ChatMessage } from '@/types/models.d';

// ==================== 类型定义 ====================

/** 会话预览（列表中的一项） */
interface ChatSession {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

/** 后端返回的历史消息 */
interface ChatMessageRecord {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

/** 会话列表响应 */
interface ChatListResponse {
  total: number;
  chats: ChatSession[];
}

/** 消息历史响应 */
interface ChatMessagesResponse {
  chat_id: string;
  chat_title: string;
  total: number;
  messages: ChatMessageRecord[];
}

// ==================== Store ====================

export const useChatStore = defineStore('chat', () => {
  // ==================== State ====================

  /** 会话列表 */
  const sessions = ref<ChatSession[]>([]);

  /** 当前会话 ID */
  const currentChatId = ref<string>('');

  /** 当前会话的消息列表 */
  const messages = ref<ChatMessage[]>([]);

  /** 是否正在加载列表 */
  const loadingSessions = ref(false);

  /** 是否正在加载消息历史 */
  const loadingMessages = ref(false);

  /** 是否正在发送消息/等待回复 */
  const sendingMessage = ref(false);

  // ==================== Getters ====================

  /** 当前会话的消息数 */
  const messageCount = computed(() => messages.value.length);

  /** 当前会话 */
  const currentSession = computed(() =>
    sessions.value.find(s => s.id === currentChatId.value) || null
  );

  /** 会话列表是否为空 */
  const hasSessions = computed(() => sessions.value.length > 0);

  // ==================== Actions ====================

  /**
   * 加载会话列表
   */
  async function fetchSessions() {
    loadingSessions.value = true;
    try {
      const res = await request<ChatListResponse>({
        url: '/api/secure-chat/chats?limit=50',
        method: 'GET',
      });
      sessions.value = (res.data as any as ChatListResponse).chats || [];
      console.log('[ChatStore] 会话列表加载完成:', sessions.value.length, '个会话');
    } catch (e) {
      console.error('[ChatStore] 加载会话列表失败:', e);
    } finally {
      loadingSessions.value = false;
    }
  }

  /**
   * 加载指定会话的历史消息
   * @param chatId - 会话 ID
   */
  async function fetchMessages(chatId: string) {
    loadingMessages.value = true;
    try {
      const res = await request<ChatMessagesResponse>({
        url: `/api/secure-chat/chats/${chatId}/messages?limit=100`,
        method: 'GET',
      });
      const data = res.data as any as ChatMessagesResponse;
      // 转换为前端的 ChatMessage 格式
      messages.value = data.messages.map((msg: ChatMessageRecord) => ({
        id: msg.id,
        type: msg.role === 'user' ? 'user' : 'bot',
        content: msg.content,
        timestamp: new Date(msg.created_at).getTime(),
      }));
      currentChatId.value = chatId;
      console.log('[ChatStore] 消息加载完成:', messages.value.length, '条');

      // 同步当前会话标题
      const session = sessions.value.find(s => s.id === chatId);
      if (session && data.chat_title) {
        session.title = data.chat_title;
      }
    } catch (e) {
      console.error('[ChatStore] 加载消息失败:', e);
      messages.value = [];
    } finally {
      loadingMessages.value = false;
    }
  }

  /**
   * 切换到指定会话
   * @param chatId - 会话 ID
   */
  async function switchChat(chatId: string) {
    if (chatId === currentChatId.value) return;
    await fetchMessages(chatId);
  }

  /**
   * 开始新会话
   * @description 清空当前消息，重置 chatId，不调用后端
   */
  function startNewChat() {
    currentChatId.value = '';
    messages.value = [];
  }

  /**
   * 删除会话
   * @param chatId - 要删除的会话 ID
   */
  async function deleteChat(chatId: string) {
    try {
      await request({
        url: `/api/secure-chat/chats/${chatId}`,
        method: 'DELETE',
      });
      // 从列表中移除
      sessions.value = sessions.value.filter(s => s.id !== chatId);
      // 如果删除的是当前会话，清空消息
      if (currentChatId.value === chatId) {
        currentChatId.value = '';
        messages.value = [];
      }
      console.log('[ChatStore] 会话已删除:', chatId);
    } catch (e) {
      console.error('[ChatStore] 删除会话失败:', e);
      throw e;
    }
  }

  /**
   * 重命名会话
   * @param chatId - 会话 ID
   * @param newTitle - 新标题
   */
  async function renameChat(chatId: string, newTitle: string) {
    try {
      await request({
        url: `/api/secure-chat/chats/${chatId}/title`,
        method: 'PUT',
        header: { 'Content-Type': 'application/json' },
        data: { title: newTitle },
      });
      // 更新本地列表
      const session = sessions.value.find(s => s.id === chatId);
      if (session) {
        session.title = newTitle;
      }
      console.log('[ChatStore] 会话已重命名:', chatId, newTitle);
    } catch (e) {
      console.error('[ChatStore] 重命名失败:', e);
      throw e;
    }
  }

  /**
   * 添加一条用户消息到当前会话
   */
  function addUserMessage(content: string): ChatMessage {
    const msg: ChatMessage = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 8),
      type: 'user',
      content,
      timestamp: Date.now(),
    };
    messages.value.push(msg);
    return msg;
  }

  /**
   * 添加一条空的 AI 消息（逐步填充）
   * @returns AI 消息在数组中的索引
   */
  function addEmptyBotMessage(): number {
    messages.value.push({
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 8),
      type: 'bot',
      content: '',
      timestamp: Date.now(),
    });
    return messages.value.length - 1;
  }

  /**
   * 更新指定索引的 AI 消息内容（追加 token）
   */
  function appendBotToken(index: number, token: string) {
    if (index >= 0 && index < messages.value.length) {
      messages.value[index] = {
        ...messages.value[index],
        content: messages.value[index].content + token,
      };
    }
  }

  /**
   * 设置指定索引的 AI 消息（用于错误提示等完整替换）
   */
  function setBotMessage(index: number, content: string) {
    if (index >= 0 && index < messages.value.length) {
      messages.value[index] = {
        ...messages.value[index],
        content,
      };
    }
  }

  /**
   * 设置当前会话 ID（从 SSE done 事件获取）
   */
  function setCurrentChatId(chatId: string) {
    currentChatId.value = chatId;
  }

  /**
   * 刷新会话列表后更新当前会话的标题
   */
  function syncCurrentSessionTitle() {
    // 刷新列表时自动同步
  }

  return {
    // state
    sessions,
    currentChatId,
    messages,
    loadingSessions,
    loadingMessages,
    sendingMessage,

    // getters
    messageCount,
    currentSession,
    hasSessions,

    // actions
    fetchSessions,
    fetchMessages,
    switchChat,
    startNewChat,
    deleteChat,
    renameChat,
    addUserMessage,
    addEmptyBotMessage,
    appendBotToken,
    setBotMessage,
    setCurrentChatId,
  };
});