/**
 * ============================================
 * 聊天输入区域组件
 * ============================================
 * 提供文本输入、语音按钮、加号按钮和发送功能
 */

<template>
  <view class="input-area">
    <!-- 语音按钮 -->
    <view class="action-btn" @tap="handleVoiceClick">
      <SvgIcon name="mic" size="40rpx" color="primary" />
    </view>

    <!-- 文本输入框 -->
    <view class="input-field-wrapper" :class="{ 'input-field-wrapper--focused': isFocused }">
      <input
        v-model="inputText"
        class="text-input"
        type="text"
        :placeholder="placeholder"
        placeholder-class="input-placeholder"
        confirm-type="send"
        @confirm="handleSend"
        @focus="isFocused = true"
        @blur="isFocused = false"
      />
      <!-- 加号按钮 -->
      <view class="plus-btn" @tap="handlePlusClick">
        <SvgIcon name="plus" size="28rpx" color="tertiary" />
      </view>
    </view>

    <!-- 发送按钮 -->
    <view
      class="send-btn"
      :class="{ 'send-btn--active': canSend }"
      @tap="handleSend"
    >
      <SvgIcon name="send" size="40rpx" :color="canSend ? 'white' : 'tertiary'" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import SvgIcon from '@/components/common/SvgIcon.vue';

interface Props {
  placeholder?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '发消息或按住说话...',
  disabled: false,
});

const emit = defineEmits<{
  (e: 'send', content: string): void;
  (e: 'voice'): void;
  (e: 'plus'): void;
}>();

const inputText = ref<string>('');
const isFocused = ref<boolean>(false);

const canSend = computed(() => {
  return inputText.value.trim().length > 0 && !props.disabled;
});

function handleSend() {
  const content = inputText.value.trim();
  if (!content || props.disabled) return;
  emit('send', content);
  inputText.value = '';
}

function handleVoiceClick() { emit('voice'); }
function handlePlusClick() { emit('plus'); }
</script>

<style lang="scss" scoped>
.input-area {
  @include flex(row, center, center);
  gap: $spacing-md;
  padding: $spacing-sm $spacing-base $spacing-base;
  background-color: $color-bg-primary;
  position: relative;

  /* 顶部阴影分隔线 */
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2rpx;
    background: linear-gradient(to right, transparent, $color-border, transparent);
  }
}

/* 语音/加号按钮 */
.action-btn {
  @include flex-center;
  width: 80rpx;
  height: 80rpx;
  transition: all $transition-fast $ease-in-out;

  &:active {
    opacity: 0.7;
    transform: scale(0.92);
  }
}

.input-field-wrapper {
  flex: 1;
  @include flex(row, flex-start, center);
  height: $input-height;
  padding: 0 $spacing-base;
  background-color: $color-bg-card;
  border-radius: $input-radius;
  border: 2rpx solid $color-border;
  box-shadow: $shadow-inner;
  transition: all $transition-fast $ease-in-out;
}

.input-field-wrapper--focused {
  border-color: $color-brand-primary;
  box-shadow: 0 0 0 4rpx rgba($color-brand-primary, 0.1), $shadow-inner;
}

.text-input {
  flex: 1;
  height: 100%;
  font-size: $font-size-base;
  color: $color-text-primary;
  background-color: transparent;
}

.input-placeholder {
  color: $color-text-tertiary;
}

.plus-btn {
  @include flex-center;
  width: 56rpx;
  height: 56rpx;

  &:active {
    opacity: 0.7;
  }
}

.send-btn {
  @include flex-center;
  width: 112rpx;
  height: 112rpx;
  background-color: $color-border;
  border-radius: 56rpx;
  transition: all $transition-fast $ease-in-out;

  &:active {
    opacity: 0.8;
    transform: scale(0.95);
  }
}

.send-btn--active {
  background: linear-gradient(135deg, $color-brand-primary, $color-brand-hover);
  box-shadow: 0 4rpx 12rpx rgba($color-brand-primary, 0.3);
}
</style>