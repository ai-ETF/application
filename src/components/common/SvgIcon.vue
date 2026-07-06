/**
 * ============================================
 * SVG 图标组件
 * ============================================
 * 基于 SVG 的图标组件，支持主题色和尺寸自定义
 *
 * 使用方式：
 * <SvgIcon name="menu" size="48rpx" color="primary" />
 *
 * 可用图标：
 * - menu: 菜单/汉堡菜单
 * - phone: 电话
 * - cast: 投屏
 * - mic: 麦克风/语音
 * - plus: 加号
 * - send: 发送/箭头
 * - search: 搜索/放大镜
 * - bookmark: 书签/收藏
 * - thermometer: 温度计
 * - user: 用户
 */
<template>
  <view class="svg-icon" :style="containerStyle">
    <view class="svg-content" v-html="svgContent"></view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/**
 * 组件属性
 */
interface Props {
  /** 图标名称 */
  name: 'menu' | 'phone' | 'cast' | 'mic' | 'plus' | 'send' | 'search' | 'bookmark' | 'thermometer' | 'user' | 'bell' | 'more-horizontal' | 'briefcase' | 'file-text' | 'clipboard' | 'message-square' | 'chevron-right' | 'clock';
  /** 图标尺寸，默认 48rpx */
  size?: string;
  /** 图标颜色：primary/secondary/active/brand/tertiary/white 或自定义颜色值 */
  color?: 'primary' | 'secondary' | 'active' | 'brand' | 'tertiary' | 'white' | string;
}

const props = withDefaults(defineProps<Props>(), {
  size: '48rpx',
  color: 'primary',
});

/**
 * 获取实际颜色值
 */
const colorValue = computed(() => {
  const colorMap: Record<string, string> = {
    primary: '#2D1E16',
    secondary: '#78716C',
    active: '#B45309',
    brand: '#B45309',
    tertiary: '#A8A29E',
    white: '#FFFFFF',
  };
  return colorMap[props.color] || props.color;
});

/**
 * 容器样式
 */
const containerStyle = computed(() => ({
  width: props.size,
  height: props.size,
}));

/**
 * SVG 图标内容
 */
const svgContent = computed(() => {
  const icons: Record<string, string> = {
    menu: `<svg viewBox="0 0 24 24" fill="none" stroke="${colorValue.value}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="3" y1="6" x2="21" y2="6"></line>
      <line x1="3" y1="12" x2="21" y2="12"></line>
      <line x1="3" y1="18" x2="21" y2="18"></line>
    </svg>`,
    phone: `<svg viewBox="0 0 24 24" fill="none" stroke="${colorValue.value}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
    </svg>`,
    cast: `<svg viewBox="0 0 24 24" fill="none" stroke="${colorValue.value}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"></path>
      <circle cx="2" cy="20" r="0.5" fill="${colorValue.value}"></circle>
    </svg>`,
    mic: `<svg viewBox="0 0 24 24" fill="none" stroke="${colorValue.value}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      <line x1="12" y1="19" x2="12" y2="23"></line>
      <line x1="8" y1="23" x2="16" y2="23"></line>
    </svg>`,
    plus: `<svg viewBox="0 0 24 24" fill="none" stroke="${colorValue.value}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>`,
    send: `<svg viewBox="0 0 24 24" fill="none" stroke="${colorValue.value}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"></line>
      <polygon points="22 2 15 22 11 13 2 9 22 2" fill="${colorValue.value}"></polygon>
    </svg>`,
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="${colorValue.value}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>`,
    bookmark: `<svg viewBox="0 0 24 24" fill="none" stroke="${colorValue.value}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
    </svg>`,
    thermometer: `<svg viewBox="0 0 24 24" fill="none" stroke="${colorValue.value}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"></path>
    </svg>`,
    user: `<svg viewBox="0 0 24 24" fill="none" stroke="${colorValue.value}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
      <circle cx="12" cy="7" r="4"></circle>
    </svg>`,
    bell: `<svg viewBox="0 0 24 24" fill="none" stroke="${colorValue.value}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
    </svg>`,
    'more-horizontal': `<svg viewBox="0 0 24 24" fill="none" stroke="${colorValue.value}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="1"></circle>
      <circle cx="19" cy="12" r="1"></circle>
      <circle cx="5" cy="12" r="1"></circle>
    </svg>`,
    briefcase: `<svg viewBox="0 0 24 24" fill="none" stroke="${colorValue.value}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
    </svg>`,
    'file-text': `<svg viewBox="0 0 24 24" fill="none" stroke="${colorValue.value}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>`,
    clipboard: `<svg viewBox="0 0 24 24" fill="none" stroke="${colorValue.value}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
      <path d="M9 14l2 2 4-4"></path>
    </svg>`,
    'message-square': `<svg viewBox="0 0 24 24" fill="none" stroke="${colorValue.value}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>`,
    'chevron-right': `<svg viewBox="0 0 24 24" fill="none" stroke="${colorValue.value}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>`,
    clock: `<svg viewBox="0 0 24 24" fill="none" stroke="${colorValue.value}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>`,
  };
  return icons[props.name] || '';
});
</script>

<style lang="scss" scoped>
.svg-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.svg-content {
  width: 100%;
  height: 100%;

  :deep(svg) {
    width: 100%;
    height: 100%;
  }
}
</style>
