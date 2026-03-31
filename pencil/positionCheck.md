下面是 **Claude / MCP / Pencil Agent 可直接执行的 V5 高精度结构化 Prompt**。
满足你的全部要求：
✅ 从画布开始
✅ mobile-03-technicalwarm_light
✅ Auto Layout
✅ 无绝对定位
✅ 容器层级 + Fill / Hug
✅ 视觉约束
✅ 父子关系
✅ 尺寸策略
✅ 组件组合
✅ 可直接执行

---

# 📌 Claude MCP / Pencil Agent 执行指令（V5 · 持仓核心页）

请严格按照以下步骤执行界面设计任务。

---

# 🔒 全局执行规则（必须遵守）

1. 在当前文件中创建一个新的移动端画布。
2. 不创建额外页面。
3. 不调用截图工具。
4. 不进行视觉分析。
5. 所有布局必须使用 Auto Layout。
6. 严禁使用绝对定位。
7. 不允许元素重叠。
8. 所有组件必须来自组件库：

mobile-03-technicalwarm_light

9. 若组件不存在，使用最接近组件组合实现。
10. 所有间距遵循 8pt 递增系统。
11. 圆角统一。
12. 风格保持 technical warm。
13. 适配移动端竖屏。
14. 完成后直接返回成功。

---

# 🪜 第一步：创建画布

1. 在当前文件中创建一个移动端竖屏画布。
2. 设置画布尺寸：

   * 宽度：390
   * 高度：844
   * 方向：Vertical。
3. 设置画布背景颜色：

   * #F9F6F0。
4. 设置页面字体：

   * sans-serif。
5. 页面根节点启用 Vertical Auto Layout。
6. 主容器填满画布：

   * Width：Fill。
   * Height：Fill。

---

# 🪜 第二步：页面主结构容器

创建一个根级主容器（Page_Main）。

## 布局

* Vertical Auto Layout。
* 宽度：Fill。
* 高度：Fill。
* 内边距：

  * 左右 16。
  * 上下 0。
* 子元素间距：16。

## 层级结构如下：

1. 状态栏
2. 顶部资产切换 Tab
3. 资产总览卡片
4. 持仓列表容器

---

# 🪜 第三步：状态栏（高度 40）

创建容器（Status_Bar）。

## 属性

* Horizontal Auto Layout。
* Width：Fill。
* Height：40。
* 垂直居中。
* 左右两端对齐。

---

## 左侧时间

使用 Text 组件：

* 内容：09:08。
* 字号：14。
* 颜色：#000000。
* Hug width。

---

## 右侧状态组合

创建 Horizontal Auto Layout：

* 间距：8。
* Hug。

依次加入：

1. 信号 icon（4G_signal）。
2. 文本：4G。
3. 电池 icon。
4. 文本：98。

全部颜色：

* #000000。

---

# 🪜 第四步：资产类型切换 Tab

创建容器（Top_Tab）。

## 属性

* Horizontal Auto Layout。
* Width：Fill。
* Height：48。
* 背景：#F9F6F0。
* 垂直居中。
* 子元素均分空间。

---

## 左侧 Tab（关注）

创建容器：

* Vertical Auto Layout。
* Width：Fill。
* Height：Hug。
* 垂直居中。
* 水平居中。

子元素：

1. 文本：关注。

   * 字号：16。
   * 颜色：#999999。
2. 激活指示条：

   * Height：2。
   * Width：24。
   * 颜色：透明。

---

## 右侧 Tab（持仓，默认激活）

创建同样结构。

文本：

* 持仓。
* 字重：Medium。
* 颜色：#2D1E16。

底部激活条：

* Height：2。
* Width：24。
* 颜色：#2D1E16。

---

# 🪜 第五步：资产总览卡片

创建卡片容器（Asset_Card）。

## 属性

* Vertical Auto Layout。
* Width：Fill。
* Height：Hug。
* 背景：#FFFFFF。
* 圆角：16。
* 内边距：

  * 20。
* 子元素间距：16。
* 阴影使用组件库默认卡片阴影。

---

## 5.1 标题区域

创建 Horizontal Auto Layout。

左侧：

* 文本：投资总金额。
* 字号：18。
* Medium。

右侧：
创建 Horizontal：

* 间距：8。

加入两个轻量按钮：

### 资产诊断

* Outline Button。
* 文本：资产诊断。
* Hug。

### 晒一晒

* Outline Button。
* 文本：晒一晒。

---

## 5.2 资产金额展示

创建 Vertical Auto Layout。

金额：

* Text：¥ 245,000。
* 字号：36。
* Bold。

单位：

* Text：总资产。
* 字号：14。
* 颜色：#999999。

---

## 5.3 数据更新时间

创建 Horizontal Auto Layout。

文本：

* 数据更新于 2 月 27 日 15:30。
* 字号：12。
* 颜色：#999999。

右侧：

* info icon。

---

## 5.4 收益数据区

创建 Horizontal Auto Layout：

* Width：Fill。
* 子元素均分。

---

### 最新收益模块

Vertical：

* 金额：+1,235。
* 红色。
* 字号：16。
* Bold。

百分比：

* +0.52%。
* 红色。
* 字号：12。

标题：

* 最新收益。

---

### 持有收益模块

结构同上。

---

### 累计收益模块

结构同上。

右侧加入：

* 红色提示 icon。

---

# 🪜 第六步：持仓列表容器

创建容器（Holding_List）。

## 属性

* Vertical Auto Layout。
* Width：Fill。
* Height：Fill。
* 子元素间距：12。

---

# 🪜 第七步：单条持仓卡片组件

创建可复用组件（Holding_Item）。

## 属性

* Vertical Auto Layout。
* Width：Fill。
* 背景：#FFFFFF。
* 圆角：12。
* 内边距：16。
* 子元素间距：12。

---

## 7.1 顶部区域

Horizontal Auto Layout。

左侧：

* 基金名称（Bold 16）。

右侧：

* 日期：2 月 27 日。
* 字号 12。
* #999999。

---

## 7.2 主体三栏

Horizontal：

* Width：Fill。
* 子元素均分。

---

### 左侧：持仓

Vertical：

* 持仓金额。
* 持仓份额。
* 主色。

---

### 中间：当日收益

Vertical：

* 红或绿。
* 金额 + 百分比。

---

### 右侧：累计收益

Vertical：

* 红或绿。
* 金额 + 百分比。

---

# 🪜 第八步：视觉约束与尺寸策略

必须保证：

1. 所有文本使用 Hug。
2. 卡片 Width 为 Fill。
3. Tab 均分。
4. 所有收益模块均分。
5. 所有按钮 Hug。
6. 列表容器 Fill。
7. 无固定像素宽度的子组件。
8. 内容随数据自适应。

---

# 🪜 第九步：交互与可扩展性预留

必须预留：

1. Tab 可扩展为多资产类型。
2. 持仓卡片支持点击进入详情。
3. 收益支持颜色动态。
4. 支持未来 AI 诊断入口。

---

# ✅ 完成规则

完成后：

* 不截图
* 不解释
* 不分析
* 直接返回成功
