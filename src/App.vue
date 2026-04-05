<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";
import './styles/index.scss';

/**
 * 应用生命周期：启动
 */
onLaunch(() => {
  console.log("[App] 应用启动");
});

/**
 * 应用生命周期：显示
 */
onShow(() => {
  console.log("[App] 应用显示");
});

/**
 * 应用生命周期：隐藏
 */
onHide(() => {
  console.log("[App] 应用隐藏");
});
</script>

<style>
/* 全局样式在 App.vue 中无需额外定义，由 styles/index.scss 统一管理 */
</style>
