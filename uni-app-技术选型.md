# AI-ETF App 技术选型与规范

## 项目概述

| 项目信息 | 说明 |
| -------- | ---- |
| 项目名称 | AI-ETF App |
| 目标平台 | **iOS** + **Android**（纯 App，不支持小程序和 H5） |
| 开发工具 | **HBuilderX** |

---

## 技术栈

| 类别 | 技术选型 | 说明 |
| ---- | -------- | ---- |
| 跨端框架 | **uni-app** | 支持一次开发，多端发布 |
| 前端框架 | **Vue 3** | Composition API |
| 开发语言 | **TypeScript** | 类型安全 |
| 构建工具 | **Vite** | 快速构建 |
| 状态管理 | **Pinia** | Vue 3 官方推荐 |
| 请求封装 | **uni.request** + 拦截器 | 统一请求/响应处理 |
| UI 组件库 | **uv-ui-plus** | Vue 3 版本的 uv-ui |
| 样式方案 | **SCSS** / **CSS Variables** / **rpx** | rpx 自动适配多屏幕 |

---

## 环境要求

| 环境 | 版本 |
| ---- | ---- |
| Node.js | v20 |
| HBuilderX | 最新稳定版 |

---

## 项目目录结构

```
ai-etf-app/
├── src/
│   ├── api/                    # API 层 - 纯 HTTP 请求
│   │   ├── index.ts            # 统一导出
│   │   ├── request.ts          # uni.request 封装 + 拦截器
│   │   ├── modules/            # 按业务模块划分
│   │   │   ├── user.ts         # 用户相关接口
│   │   │   ├── etf.ts          # ETF 相关接口
│   │   │   └── portfolio.ts    # 持仓相关接口
│   │   └── types.ts            # API 响应类型定义
│   │
│   ├── composables/            # Composables 层 - 业务逻辑封装
│   │   ├── index.ts
│   │   ├── useAuth.ts          # 认证逻辑
│   │   ├── useEtf.ts           # ETF 数据逻辑
│   │   ├── usePortfolio.ts     # 持仓逻辑
│   │   └── useRequest.ts       # 通用请求状态管理
│   │
│   ├── stores/                 # Pinia Store 层 - 全局状态
│   │   ├── index.ts
│   │   ├── user.ts             # 用户信息
│   │   ├── watchlist.ts        # 自选列表
│   │   └── settings.ts         # 应用设置
│   │
│   ├── pages/                  # 页面
│   │   ├── index/              # 首页
│   │   │   └── index.vue
│   │   ├── watchlist/          # 自选页（关注 + 持仓）
│   │   │   └── index.vue
│   │   ├── etf-detail/         # ETF 详情
│   │   │   └── index.vue
│   │   └── settings/           # 设置
│   │       └── index.vue
│   │
│   ├── components/             # 公共组件
│   │   ├── common/             # 通用组件
│   │   │   ├── NavBar.vue
│   │   │   ├── Loading.vue
│   │   │   └── Empty.vue
│   │   ├── business/           # 业务组件
│   │   │   ├── EtfCard.vue
│   │   │   └── PositionItem.vue
│   │   └── index.ts            # 组件注册
│   │
│   ├── static/                 # 静态资源
│   │   ├── images/
│   │   └── icons/
│   │
│   ├── styles/                 # 全局样式
│   │   ├── variables.scss      # CSS 变量 / 主题色
│   │   ├── mixins.scss         # SCSS mixins
│   │   ├── reset.scss          # 样式重置
│   │   └── index.scss          # 统一入口
│   │
│   ├── utils/                  # 工具函数
│   │   ├── index.ts
│   │   ├── storage.ts          # 本地存储封装
│   │   ├── format.ts           # 格式化（金额、日期等）
│   │   ├── validate.ts         # 校验工具
│   │   └── permission.ts       # 权限处理
│   │
│   ├── types/                  # TypeScript 类型定义
│   │   ├── global.d.ts         # 全局类型
│   │   ├── api.d.ts            # API 相关类型
│   │   └── models.d.ts         # 数据模型
│   │
│   ├── hooks/                  # uni-app 生命周期 hooks
│   │   └── usePage.ts
│   │
│   ├── config/                 # 配置文件
│   │   ├── index.ts            # 运行时配置
│   │   └── constants.ts        # 常量定义
│   │
│   ├── App.vue                 # 应用入口
│   ├── main.ts                 # 主入口
│   ├── manifest.json           # uni-app 配置（App 图标、权限等）
│   ├── pages.json              # 页面路由配置
│   └── uni.scss                # uni-app 全局样式变量
│
├── .env                        # 环境变量
├── .env.development            # 开发环境
├── .env.production             # 生产环境
├── .eslintrc.cjs               # ESLint 配置
├── .prettierrc                 # Prettier 配置
├── tsconfig.json               # TypeScript 配置
├── vite.config.ts              # Vite 配置
└── package.json
```

---

## 数据流转设计

采用 **API 层 / Composables 层 / Store 层** 职责分离模式：

```
┌─────────────────────────────────────────────────────────────┐
│                      页面 / 组件层                           │
│           只消费 composables 和 stores，禁止直接调用 API      │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌──────────────┐ ┌──────────┐ ┌──────────┐
│ Composables  │ │  Stores  │ │  Stores  │
│   业务逻辑    │ │ 全局状态  │ │          │
└──────┬───────┘ └──────────┘ └──────────┘
       │
       ▼
┌──────────────┐
│    API 层    │
│ 纯 HTTP 请求 │
└──────────────┘
```

| 层级 | 职责 | 说明 |
| ---- | ---- | ---- |
| **API 层** | 仅负责 HTTP 请求 | 返回 Promise，不处理 loading、错误弹窗等 UI 状态 |
| **Composables 层** | 封装业务逻辑 | 调用 API 层，管理 loading/error 等响应式状态，返回给页面使用 |
| **Store 层** | 管理跨页面共享状态 | 仅管理全局状态，不包含复杂业务逻辑 |
| **页面/组件层** | 消费数据 | 只消费 composables 和 stores |

### 后端交互

- 后端采用 **FastAPI** 与前端交互
- 接口文档：Swagger / OpenAPI

---

## 核心页面规划

| 页面 | 路由 | 说明 |
| ---- | ---- | ---- |
| 首页 | `/pages/index/index` | 应用入口，展示核心功能入口 |
| 自选 | `/pages/watchlist/index` | 关注列表 + 持仓列表（Tab 切换） |
| ETF 详情 | `/pages/etf-detail/index` | 单个 ETF 的详细信息 |
| 设置 | `/pages/settings/index` | 用户设置、账户管理 |

---

## 工程化配置

| 配置项 | 选择 | 说明 |
| ------ | ---- | ---- |
| ESLint | `@typescript-eslint` + `eslint-plugin-vue` | Vue 3 + TS 规范 |
| Prettier | 与 ESLint 集成 | 统一代码格式化 |
| 环境变量 | `.env.development` / `.env.production` | 区分 API 基地址 |
| Git Hooks | `husky` + `lint-staged` | 提交前自动检查 |
| Commit 规范 | `commitlint` + `czg` | 约定式提交 |

### Git 分支策略

| 分支 | 说明 |
| ---- | ---- |
| `main` | 生产环境，只接受 merge |
| `develop` | 开发分支 |

### Commit Message 规范

```
<type>(<scope>): <subject>

type:
- feat:     新功能
- fix:      修复 bug
- docs:     文档更新
- style:    代码格式（不影响逻辑）
- refactor: 重构
- perf:     性能优化
- test:     测试相关
- chore:    构建/工具相关
```

---

## uni-app 开发规范

### 常用组件对照表

| HTML | uni-app |
| ---- | ------- |
| `div` | `view` |
| `span` | `text` |
| `img` | `image` |
| `a` | `navigator` |
| `input` | `input` / `uni-easyinput` |
| `button` | `button` / `uv-button` |

### 常用 API

```typescript
// 路由跳转
uni.navigateTo({ url: '/pages/etf-detail/index?id=123' })
uni.redirectTo({ url: '/pages/login/index' })
uni.switchTab({ url: '/pages/index/index' })

// 数据缓存
uni.setStorageSync('token', 'xxx')
uni.getStorageSync('token')

// 提示
uni.showToast({ title: '操作成功', icon: 'success' })
uni.showLoading({ title: '加载中' })

// 下拉刷新
uni.startPullDownRefresh()
uni.stopPullDownRefresh()
```

---

## 代码规范

### 命名规范

| 类型 | 规范 | 示例 |
| ---- | ---- | ---- |
| 文件夹 | kebab-case | `etf-detail/` |
| Vue 组件 | PascalCase | `EtfCard.vue` |
| TS/JS 文件 | camelCase | `useEtf.ts` |
| 变量/函数 | camelCase | `etfList`, `fetchEtfData` |
| 常量 | UPPER_SNAKE_CASE | `API_BASE_URL` |
| CSS 类名 | kebab-case | `.etf-card` |

### 注释要求

```typescript
/**
 * 获取 ETF 详情
 * @param etfId - ETF 编号
 * @returns ETF 详情数据
 */
export function getEtfDetail(etfId: string): Promise<EtfDetail> {
  // 实现逻辑
}
```

