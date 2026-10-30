/**
 * Vite 环境变量类型声明
 * @description uni-app 未内置 import.meta.env 的类型，此处手动声明，
 * 使 src/config/index.ts 等文件能通过类型检查。变量由构建期的
 * .env.development / .env.production 注入。
 */
interface ImportMetaEnv {
  /** 后端 API 基础地址 */
  readonly VITE_API_BASE?: string;
  /** 是否启用 mock 模式（字符串 "true" / "false"） */
  readonly VITE_USE_MOCK?: string;
  /** Vite 注入：是否开发模式 */
  readonly DEV?: boolean;
  /** Vite 注入：是否生产模式 */
  readonly PROD?: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
