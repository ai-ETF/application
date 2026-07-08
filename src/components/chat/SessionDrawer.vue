/**
 * ============================================
 * 会话列表侧滑抽屉组件
 * ============================================
 * 从左侧滑出的会话列表面板
 * 展示所有历史会话，支持切换和新建
 */

<template>
  <!-- 遮罩层 -->
  <view
    v-if="visible"
    class="overlay"
    @tap="emit('close')"
  />

  <!-- 抽屉面板 -->
  <view
    class="drawer"
    :class="{ 'drawer--open': visible }"
  >
    <!-- 顶部：标题 + 新建按钮 -->
    <view class="drawer-header">
      <text class="drawer-title">会话历史</text>
      <view class="new-chat-btn" @tap="handleNewChat">
        <SvgIcon name="plus" size="36rpx" color="white" />
      </view>
    </view>

    <!-- 会话列表 -->
    <scroll-view class="session-list" scroll-y>
      <view
        v-for="session in sessions"
        :key="session.id"
        class="session-item"
        :class="{ 'session-item--active': session.id === currentChatId }"
        @tap="handleSelectChat(session.id)"
      >
        <view class="session-icon">
          <SvgIcon name="message-circle" size="36rpx" color="tertiary" />
        </view>
        <view class="session-info">
          <text class="session-title">{{ session.title }}</text>
          <text class="session-time">{{ formatSessionTime(session.updated_at) }}</text>
        </view>
        <!-- 操作按钮组 -->
        <view class="session-actions">
          <!-- 重命名按钮 -->
          <view
            class="session-action-btn"
            @tap.stop="handleRenameChat(session.id, session.title)"
          >
            <SvgIcon name="edit" size="28rpx" color="tertiary" />
          </view>
          <!-- 删除按钮 -->
          <view
            class="session-action-btn session-action-btn--danger"
            @tap.stop="handleDeleteChat(session.id)"
          >
            <SvgIcon name="trash-2" size="28rpx" color="tertiary" />
          </view>
        </view>
      </view>

      <!-- 空状态 -->
      <view v-if="!loading && sessions.length === 0" class="empty-state">
        <SvgIcon name="message-square" size="80rpx" color="tertiary" />
        <text class="empty-text">暂无会话记录</text>
        <text class="empty-hint">开始一段新对话吧</text>
      </view>

      <!-- 加载中 -->
      <view v-if="loading" class="loading-state">
        <text class="loading-text">加载中...</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import SvgIcon from '@/components/common/SvgIcon.vue';
import { useChatStore } from '@/stores/chat';

interface Props {
  visible: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'select-chat', chatId: string): void;
  (e: 'new-chat'): void;
}>();

const chatStore = useChatStore();

/** 从 store 获取会话列表 */
const sessions = computed(() => chatStore.sessions);
const currentChatId = computed(() => chatStore.currentChatId);
const loading = computed(() => chatStore.loadingSessions);

/**
 * 选择会话
 */
function handleSelectChat(chatId: string) {
  emit('select-chat', chatId);
}

/**
 * 新建会话
 */
function handleNewChat() {
  emit('new-chat');
}

/**
 * 删除会话
 */
async function handleDeleteChat(chatId: string) {
  console.log('[SessionDrawer] 删除会话:', chatId);

  async function doDelete(id: string) {
    try {
      await chatStore.deleteChat(id);
    } catch (e) {
      uni.showToast({ title: '删除失败', icon: 'none' });
    }
  }

  // 在 H5 环境用 window.confirm，其他环境用 uni.showModal
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    if (window.confirm('确定要删除此会话吗？')) {
      await doDelete(chatId);
    }
  } else {
    uni.showModal({
      title: '删除会话',
      content: '确定要删除此会话吗？',
      success: async (res) => {
        if (res.confirm) {
          await doDelete(chatId);
        }
      },
    });
  }
}

/**
 * 重命名会话
 */
function handleRenameChat(chatId: string, currentTitle: string) {
  console.log('[SessionDrawer] 重命名会话:', chatId);

  // H5 用 prompt
  if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
    const newTitle = window.prompt('请输入新的会话名称', currentTitle);
    if (newTitle && newTitle.trim() && newTitle.trim() !== currentTitle) {
      doRename(chatId, newTitle.trim());
    }
  } else {
    // 小程序/App 用 input 模态框
    uni.showModal({
      title: '重命名会话',
      content: '新名称',
      editable: true,
      placeholderText: currentTitle,
      success: async (res) => {
        if (res.confirm && res.content && res.content.trim()) {
          await doRename(chatId, res.content.trim());
        }
      },
    });
  }
}

async function doRename(chatId: string, newTitle: string) {
  try {
    await chatStore.renameChat(chatId, newTitle);
    uni.showToast({ title: '已重命名', icon: 'success' });
  } catch (e) {
    uni.showToast({ title: '重命名失败', icon: 'none' });
  }
}

/**
 * 格式化会话时间
 */
function formatSessionTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHour < 24) return `${diffHour}小时前`;
  if (diffDay < 7) return `${diffDay}天前`;

  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${m}-${d}`;
}
</script>

<style lang="scss" scoped>
/* 遮罩层 */
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 100;
}

/* 抽屉面板 */
.drawer {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 560rpx;
  background-color: $color-bg-card;
  z-index: 101;
  display: flex;
  flex-direction: column;
  box-shadow: 4rpx 0 24rpx rgba(0, 0, 0, 0.1);
  transform: translateX(-100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.drawer--open {
  transform: translateX(0);
}

/* 顶部 */
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 100rpx $spacing-base $spacing-md;
  border-bottom: 2rpx solid $color-border-light;
}

.drawer-title {
  font-size: $font-size-2xl;
  font-weight: $font-weight-bold;
  color: $color-text-primary;
}

.new-chat-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  height: 72rpx;
  background: linear-gradient(135deg, $color-brand-primary, $color-brand-hover);
  border-radius: $radius-circle;
  box-shadow: 0 4rpx 12rpx rgba($color-brand-primary, 0.3);

  &:active {
    opacity: 0.8;
    transform: scale(0.95);
  }
}

/* 会话列表 */
.session-list {
  flex: 1;
  padding: $spacing-sm 0;
}

.session-item {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-md $spacing-base;
  margin: 0 $spacing-sm;
  border-radius: $radius-md;
  transition: all 0.15s ease;
  cursor: pointer;

  &:active {
    background-color: $color-bg-primary;
  }
}

.session-item--active {
  background-color: $color-brand-bg;
  border: 2rpx solid rgba($color-brand-primary, 0.15);
}

.session-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  background-color: $color-bg-primary;
  border-radius: $radius-base;
}

.session-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
  min-width: 0;
}

.session-title {
  font-size: $font-size-base;
  font-weight: $font-weight-medium;
  color: $color-text-primary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-time {
  font-size: $font-size-xs;
  color: $color-text-tertiary;
}

.session-delete {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56rpx;
  height: 56rpx;
  border-radius: $radius-circle;
  opacity: 0;
  transition: opacity 0.15s ease;

  &:active {
    background-color: $color-up-bg;
  }
}

.session-item:hover .session-delete,
.session-item:active .session-delete {
  opacity: 1;
}

/* 操作按钮组 */
.session-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: $spacing-xs;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.session-item:hover .session-actions,
.session-item:active .session-actions {
  opacity: 1;
}

.session-action-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56rpx;
  height: 56rpx;
  border-radius: $radius-circle;
  transition: all 0.15s ease;

  &:active {
    background-color: $color-bg-primary;
  }
}

.session-action-btn--danger:active {
  background-color: $color-up-bg;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx $spacing-xl;
  gap: $spacing-md;
}

.empty-text {
  font-size: $font-size-lg;
  color: $color-text-secondary;
}

.empty-hint {
  font-size: $font-size-sm;
  color: $color-text-tertiary;
}

/* 加载中 */
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: $spacing-xl;
}

.loading-text {
  font-size: $font-size-base;
  color: $color-text-tertiary;
}
</style>