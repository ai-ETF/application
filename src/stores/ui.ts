/**
 * ============================================
 * 跨页面 UI 状态 Store
 * ============================================
 * 底部 TabBar 通过 uni.redirectTo 切换页面，页面销毁后其本地状态会丢失。
 * 本 Store 持久化各 Tab 页的瞬时 UI 状态，保证切换 Tab 后再回来不丢。
 *
 * 说明：仅存放「切换 Tab 需要保留」的瞬时 UI 状态；
 * 业务数据（聊天消息、自选列表等）由各自的 Store 管理，天然不随页面销毁而丢失。
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUiStore = defineStore('ui', () => {
  /** 聊天输入框草稿（未发送的文字） */
  const chatDraft = ref('');

  /** 自选页当前子 Tab：follow(关注) | position(持仓) */
  const watchlistTab = ref<'follow' | 'position'>('follow');

  /** 自选页搜索关键词 */
  const watchlistSearch = ref('');

  return { chatDraft, watchlistTab, watchlistSearch };
});
