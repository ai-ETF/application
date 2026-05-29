/**
 * ============================================
 * 聊天输入区域组件
 * ============================================
 * 提供文本输入、语音按钮、加号按钮和发送功能
 *
 * 功能：
 * - 文本输入框（胶囊形状）
 * - 语音按钮
 * - 加号按钮（更多功能）
 * - 发送按钮（有内容时激活）
 */
<template>
  <view class="input-area">
    <!-- 语音按钮 -->
    <view class="voice-btn" @tap="handleVoiceClick">
      <SvgIcon name="mic" size="48rpx" color="primary" />
    </view>

    <!-- 文本输入框 -->
    <view class="input-field-wrapper">
      <input
        v-model="inputText"
        class="text-input"
        type="text"
        :placeholder="placeholder"
        placeholder-class="input-placeholder"
        :adjust-position="true"
        confirm-type="send"
        @confirm="handleSend"
        @focus="onFocus"
        @blur="onBlur"
      />
      <!-- 加号按钮 -->
      <view class="plus-btn" @tap="handlePlusClick">
        <SvgIcon name="plus" size="32rpx" color="tertiary" />
      </view>
    </view>

    <!-- 发送按钮 -->
    <view
      class="send-btn"
      :class="{ 'send-btn--active': canSend }"
      @tap="handleSend"
    >
      <SvgIcon name="send" size="44rpx" color="white" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import SvgIcon from '@/components/common/SvgIcon.vue';

/**
 * 组件属性
 */
interface Props {
  /** 输入框占位文本 */
  placeholder?: string;
  /** 是否禁用发送（如正在加载） */
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '发消息或按住说话...',
  disabled: false,
});

/**
 * 组件事件
 */
const emit = defineEmits<{
  (e: 'send', content: string): void;
  (e: 'voice'): void;
  (e: 'plus'): void;
  (e: 'focus'): void;
  (e: 'blur'): void;
}>();

/** 输入框文本 */
const inputText = ref<string>('');

/** 是否可以发送 */
const canSend = computed(() => {
  return inputText.value.trim().length > 0 && !props.disabled;
});

/** 发送消息 */
function handleSend() {
  const content = inputText.value.trim();
  if (!content || props.disabled) return;

  emit('send', content);
  inputText.value = '';
}

/** 语音按钮点击 */
function handleVoiceClick() {
  emit('voice');
}

/** 加号按钮点击 */
function handlePlusClick() {
  emit('plus');
}

/** 输入框获得焦点 */
function onFocus() {
  emit('focus');
}

/** 输入框失去焦点 */
function onBlur() {
  emit('blur');
}
</script>

<style lang="scss" scoped>
.input-area {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-base;
  background-color: $color-bg-primary;
}

.voice-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: $voice-btn-size;
  height: $voice-btn-size;

  &:active {
    opacity: 0.7;
    transform: scale(0.95);
  }
}

.input-field-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  height: $input-height;
  padding: 0 $spacing-base;
  background-color: $color-bg-secondary;
  border-radius: $input-radius;
  border: 2rpx solid $color-border;
}

.text-input {
  flex: 1;
  height: 100%;
  font-size: $font-size-lg;
  color: $color-text-primary;
  background-color: transparent;
}

.input-placeholder {
  color: $color-text-tertiary;
}

.plus-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: $plus-btn-size;
  height: $plus-btn-size;

  &:active {
    opacity: 0.7;
  }
}

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: $btn-height-lg;
  height: $btn-height-lg;
  background-color: $color-border;
  border-radius: $send-btn-radius;
  transition: all $transition-fast ease;

  &:active {
    opacity: 0.8;
    transform: scale(0.95);
  }
}

.send-btn--active {
  background-color: $color-brand-primary;
}
</style>