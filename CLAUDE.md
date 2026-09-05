# CLAUDE.md

## 一、项目概览

AI-ETF 是一个基于 uni-app + Vue 3 的跨平台投资辅助应用。

### 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | uni-app 3.x + Vue 3 (Composition API) |
| 语言 | TypeScript |
| 状态管理 | Pinia (setup 函数模式) |
| 样式 | SCSS (Sass 3.0, `@use` 语法) |
| 构建 | Vite 5.x |

### 文件分工

```
src/
├── api/                # 接口层
├── components/         # 组件
├── composables/        # 组合式函数（业务逻辑复用）
├── config/             # 配置
├── hooks/              # 通用 hooks
├── pages/              # 页面（路由页面，每个目录一个 index.vue）
├── stores/             # Pinia 状态管理
├── styles/             # 全局样式
├── types/              # 类型定义
├── utils/              # 工具函数
├── uni.scss            # uni-app 全局样式变量（自动注入所有组件）
├── main.ts             # 应用入口
├── App.vue             # 根组件
└── pages.json          # 路由与页面配置
```

---

## 二、前端页面设计规范

### 样式优先级：全局 → 层部

编写样式时严格遵循以下优先级：

1. **全局变量**（`variables.scss`）— 颜色、字体、间距、圆角等必须使用已定义的变量
   ```scss
   /* ✅ 正确 */
   color: $color-text-primary;
   padding: $spacing-base;
   border-radius: $radius-md;

   /* ❌ 错误 — 硬编码值 */
   color: #2D1E16;
   padding: 16px;
   border-radius: 12px;
   ```

2. **全局 Mixins**（`mixins.scss`）— 布局、省略号、卡片等复用样式
   ```scss
   /* ✅ 正确 */
   @include flex(row, space-between, center);
   @include text-ellipsis(2);
   @include card();

   /* ❌ 错误 — 重复写已有 mixin 的代码 */
   display: flex;
   flex-direction: row;
   justify-content: space-between;
   ```

4. **局部样式** — 仅在以上都不满足时，才在组件 `<style lang="scss" scoped>` 中定义局部样式

### 品牌风格要求

- **严格遵循** `assert/DESIGN_SYSTEM.md` 和 `frontend-design` 中定义的设计规范
- **暖色调体系**：所有颜色必须与米色背景 `#F9F6F0` 协调，禁止使用冷色调
- **红涨绿跌**：上涨用 `#DC2626`（红色），下跌用 `#16A34A`（绿色），符合中国市场惯例

### 图标规范

- **必须使用 SVG 图标**，通过 `SvgIcon` 组件引入
- **禁止使用任何表情包/emoji** 作为图标替代
- **品牌logo** 在 `assert\ai-etf-抠图.png` 路径下
- SVG 图标放在 `src/static/icons/` 目录下
- 使用方式：`<SvgIcon name="icon-name" />`

---

## 三、uni-app 开发规范

### 平台 API

- 使用 `uni.xxx` API，不使用 Web API
  ```ts
  /* ✅ 正确 */
  uni.request({ url: '...' });
  uni.navigateTo({ url: '/pages/detail/index' });
  uni.setStorageSync('key', value);

  /* ❌ 错误 */
  fetch('...');
  router.push('/detail');
  localStorage.setItem('key', value);
  ```

### 路由与页面

- 路由在 `src/pages.json` 中声明，不使用 vue-router
- 路由跳转使用 `uni.navigateTo` / `uni.switchTab` / `uni.redirectTo`
- 页面文件统一放在 `src/pages/xxx/index.vue`

### 组件标签

- 使用 uni-app 基础组件，不使用 HTML 标签
  ```html
  <!-- ✅ 正确 -->
  <view class="container">
    <text class="title">标题</text>
    <image src="..." mode="aspectFill" />
  </view>

  <!-- ❌ 错误 -->
  <div class="container">
    <span class="title">标题</span>
    <img src="..." />
  </div>
  ```

### 生命周期

- 使用 uni-app 生命周期：`onLoad`、`onShow`、`onHide`、`onReady`、`onUnload`
- 页面级逻辑优先用 uni-app 生命周期

### SCSS 变量注入

- **不要**在组件中 `@import` 变量文件，变量已通过 `vite.config.ts` 的 `additionalData` 自动注入
- `uni.scss` 中的变量同样自动注入所有组件，无需 import

---

## 四、代码规范

### 注释要求

**关键逻辑必须添加注释**，便于调试和定位问题：

```ts
// ✅ 正确 — 说明意图和原因
// 从本地缓存恢复 token，避免每次启动都要重新登录
const savedToken = uni.getStorageSync('token');

// ✅ 正确 — 复杂逻辑分步骤注释
// 步骤1: 校验持仓数量
if (positions.length > MAX_POSITIONS) {
  // 步骤2: 超出上限时触发风险提示
  showRiskWarning();
  return;
}

// ❌ 错误 — 注释只是重复代码
// 获取 token
const token = getToken();
```

### 调试信息

**在关键节点添加调试日志**，使用统一的前缀格式便于过滤：

```ts
// 接口请求
console.log('[API] 请求发起:', url, params);
console.log('[API] 响应成功:', url, response);
console.error('[API] 请求失败:', url, error);

// 状态变更
console.log('[Store] 用户登录:', userInfo.nickname);
console.log('[Store] Token 过期，清除认证状态');

// 页面生命周期
console.log('[Page] ETF详情页加载:', etfCode);
```

---

## 五、会话行为规范

### 回答前信息对齐

在回答用户的任何问题或执行任何任务之前，必须先做以下三件事：

1. **复述理解**：用自己的话概括你理解的用户指令和需求
2. **列出获取的信息**：列出你从当前会话、文件、搜索结果中获取到的所有相关信息
3. **说明假设**：列出你尚未确认但正在采用的假设（如果有）

这样做是为了确保我们信息对齐，避免因理解偏差导致无效工作。

```markdown
<!-- 示例格式 -->

**我理解的你的需求：**
- 需求1：...
- 需求2：...

**我获取的信息：**
- 信息1：...
- 信息2：...

**我的假设：**
- 假设1：...
- 假设2：...
```



