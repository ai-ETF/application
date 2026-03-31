# AI-ETF App

AI-ETF 移动端应用，基于 uni-app + Vue 3 + TypeScript 开发。

## 环境要求

| 环境 | 版本 | 下载地址 |
| ---- | ---- | -------- |
| Node.js | v20+ | https://nodejs.org/ |
| HBuilderX | 最新稳定版 | https://www.dcloud.io/hbuilderx.html |

## 快速开始

### 1. 拉取代码

```bash
git clone https://github.com/ai-ETF/application.git
cd application
```

### 2. 安装依赖

```bash
npm install
```

### 3. 运行项目

#### 方式一：浏览器运行（H5 模式）

适合开发调试阶段，热更新快。

```bash
npm run dev:h5
```

启动后访问 http://localhost:5173

> 注意：部分原生 API（如相机、蓝牙等）在浏览器中无法使用，涉及原生功能的调试请在模拟器或真机上进行。

#### 方式二：HBuilderX 运行到模拟器/真机

适合完整功能测试和发布。

**步骤：**

1. 打开 HBuilderX
2. 选择 `文件` → `导入` → `从本地目录导入`，选择项目根目录
3. 在项目上右键，选择 `运行`：
   - **Android 模拟器**：`运行` → `运行到手机或模拟器` → `运行到 Android App 基座`
   - **iOS 模拟器**：`运行` → `运行到手机或模拟器` → `运行到 iOS 模拟器`（需要 Mac）
   - **真机调试**：手机通过 USB 连接电脑，开启开发者模式，选择 `运行到 Android/iOS 基座`

**首次运行需要：**

- Android：安装 Android Studio 并配置模拟器，或连接真机
- iOS：需要 Mac 电脑，安装 Xcode 并配置模拟器

## 项目结构

```
src/
├── api/                    # API 层 - HTTP 请求封装
│   ├── index.ts
│   ├── request.ts          # uni.request 封装 + 拦截器
│   ├── types.ts            # API 响应类型
│   └── modules/            # 按业务模块划分
│       ├── user.ts
│       ├── etf.ts
│       └── portfolio.ts
│
├── composables/            # Composables 层 - 业务逻辑封装
│   ├── useAuth.ts
│   ├── useEtf.ts
│   ├── usePortfolio.ts
│   └── useRequest.ts
│
├── stores/                 # Pinia Store - 全局状态
│   ├── user.ts
│   ├── watchlist.ts
│   └── settings.ts
│
├── pages/                  # 页面
│   ├── index/              # 首页
│   ├── watchlist/          # 自选页
│   ├── etf-detail/         # ETF 详情
│   └── settings/           # 设置
│
├── components/             # 公共组件
│   ├── common/             # 通用组件
│   └── business/           # 业务组件
│
├── styles/                 # 全局样式
├── utils/                  # 工具函数
├── types/                  # TypeScript 类型定义
├── hooks/                  # uni-app 生命周期 hooks
└── config/                 # 配置文件
```

## 开发规范

### 分层架构

```
┌─────────────────────────────────────────┐
│              页面 / 组件层               │
│    只消费 composables 和 stores          │
└─────────────────┬───────────────────────┘
                  │
      ┌───────────┼───────────┐
      ▼           ▼           ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│Composables│ │  Stores  │ │          │
│ 业务逻辑  │ │ 全局状态  │ │          │
└────┬─────┘ └──────────┘ └──────────┘
     │
     ▼
┌──────────┐
│  API 层  │
│HTTP 请求 │
└──────────┘
```

- **API 层**：纯 HTTP 请求，不处理 UI 状态
- **Composables 层**：业务逻辑 + 响应式状态（loading/error 等）
- **Store 层**：跨页面共享状态
- **页面/组件**：只消费数据，不直接调用 API

### 命名规范

| 类型 | 规范 | 示例 |
| ---- | ---- | ---- |
| 文件夹 | kebab-case | `etf-detail/` |
| Vue 组件 | PascalCase | `EtfCard.vue` |
| TS 文件 | camelCase | `useEtf.ts` |
| 变量/函数 | camelCase | `etfList`, `fetchData` |
| 常量 | UPPER_SNAKE_CASE | `API_BASE_URL` |
| CSS 类名 | kebab-case | `.etf-card` |

### Commit 规范

```
<type>(<scope>): <subject>

type:
- feat:     新功能
- fix:      修复 bug
- docs:     文档更新
- style:    代码格式
- refactor: 重构
- perf:     性能优化
- test:     测试相关
- chore:    构建/工具相关
```

## 常用命令

```bash
# 开发
npm run dev:h5          # H5 模式
npm run dev:app         # App 模式（需 HBuilderX）

# 构建
npm run build:h5        # 构建 H5
npm run build:app       # 构建 App

# 代码规范
npm run lint            # ESLint 检查
npm run format          # Prettier 格式化
```

## 常见问题

### 1. npm install 失败

尝试切换 npm 镜像：

```bash
npm config set registry https://registry.npmmirror.com
npm install
```

### 2. HBuilderX 运行报错

- 确保使用的是官方正式版 HBuilderX（不是 Alpha 版）
- 检查项目根目录是否正确（包含 `manifest.json` 的 `src` 目录）

### 3. Android 模拟器无法启动

- 确保已安装 Android Studio 并创建 AVD 模拟器
- 或使用真机调试（需开启 USB 调试模式）

### 4. iOS 模拟器无法启动

- iOS 开发必须在 Mac 电脑上进行
- 需要安装 Xcode 并配置命令行工具

## 技术栈

- **框架**：uni-app + Vue 3 + TypeScript
- **构建**：Vite
- **状态管理**：Pinia
- **UI 组件库**：uv-ui-plus
- **样式**：SCSS + rpx

## 相关链接

- [uni-app 官方文档](https://uniapp.dcloud.net.cn/)
- [Vue 3 文档](https://cn.vuejs.org/)
- [Pinia 文档](https://pinia.vuejs.org/zh/)
- [uv-ui-plus 文档](https://www.uvui.cn/)

## License

MIT
