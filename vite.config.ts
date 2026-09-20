import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";
import VueDevTools from 'vite-plugin-vue-devtools';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni(), VueDevTools()],
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
        additionalData: `@use "@/styles/variables.scss" as *; @use "@/styles/mixins.scss" as *;`,
      },
    },
  },
});
