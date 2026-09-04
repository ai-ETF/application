/**
 * ============================================
 * 系统信息 Composable
 * ============================================
 * 提供状态栏高度、安全区域、窗口高度等平台适配信息
 *
 * 使用方式：
 * const { statusBarHeight, windowHeight } = useSystemInfo();
 * // 在模板中绑定: <view :style="{ minHeight: windowHeight + 'px' }">
 */
import { ref } from 'vue';

/** 状态栏高度（px），默认 44px */
const statusBarHeight = ref<number>(44);

/** 窗口可用高度（px），默认 667px（iPhone 6/7/8） */
const windowHeight = ref<number>(667);

/** 底部安全区域高度（px） */
const safeAreaBottom = ref<number>(0);

try {
  const info = uni.getSystemInfoSync();
  statusBarHeight.value = info.statusBarHeight ?? 44;
  windowHeight.value = info.windowHeight ?? 667;
  if (info.safeAreaInsets) {
    safeAreaBottom.value = info.safeAreaInsets.bottom ?? 0;
  }
} catch {
  // 降级使用默认值
}

export function useSystemInfo() {
  return { statusBarHeight, windowHeight, safeAreaBottom };
}
