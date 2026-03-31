下面是 **Claude / MCP / Pencil Agent 专用高质量执行 Prompt（关注列表页 · 行情结构版）**。

⚠️ 本指令用于自动生成界面
⚠️ 必须严格使用组件库 `mobile-03-technicalwarm_light`
⚠️ 禁止绝对定位
⚠️ 全部使用 Auto Layout
⚠️ 不做解释，直接执行

---

# 🔒 全局执行规则

1. 在当前文件中创建一个新的移动端页面。
2. 使用组件库：`mobile-03-technicalwarm_light`。
3. 所有布局必须使用 Auto Layout。
4. 禁止使用绝对定位。
5. 禁止元素重叠。
6. 间距必须使用 8pt 递增系统（8 / 16 / 24）。
7. 圆角统一。
8. 风格必须保持 technical warm。
9. 页面适配 390 宽度移动端。
10. 所有宽度策略优先使用 Fill container。
11. 所有文本默认 Hug。
12. 完成后直接返回成功。

---

# 🪜 第一步：创建画布

创建移动端竖屏画布：

* 宽度：390
* 高度：844
* 方向：Vertical
* 背景色：#F9F6F0
* 字体：sans-serif

启用根节点 Auto Layout：

* 方向：Vertical
* Width：Fill container
* Height：Fill container
* 主轴对齐：Start
* 交叉轴对齐：Stretch
* Padding：0
* 子元素间距：0

---

# 🪜 第二步：创建页面主容器（Page_Main）

在画布内创建主容器。

属性：

* 类型：Frame
* 布局：Vertical Auto Layout
* Width：Fill
* Height：Fill
* Padding：左右 16，上下 0
* 子元素间距：16
* 主轴对齐：Start
* 交叉轴对齐：Stretch

Page_Main 内部结构顺序：

1. Status_Bar
2. Top_Tab
3. Market_Toolbar
4. Watch_List_Container

---

# 🪜 第三步：状态栏（Status_Bar）

创建 Horizontal Auto Layout：

* Width：Fill
* Height：40（Fixed）
* 主轴：Space Between
* 交叉轴：Center

左侧：

* Text：09:08
* 字号：14
* 颜色：#000000
* Width：Hug

右侧：

创建 Horizontal Auto Layout：

* 间距：8
* Width：Hug
* 交叉轴：Center

添加：

* 4G icon（16x16）
* Text：4G（12）
* battery icon（16x16）
* Text：98（12）

---

# 🪜 第四步：顶部资产切换 Tab（Top_Tab）

创建 Horizontal Auto Layout：

* Width：Fill
* Height：48（Fixed）
* 主轴：Space Evenly
* 交叉轴：Center
* 背景：#F9F6F0

---

## 左侧 Tab（关注，激活）

创建 Vertical Auto Layout：

* Width：Fill
* Height：Hug
* 子元素居中
* 间距：4

添加：

1. Text：关注

   * 字号：16
   * 字重：Medium
   * 颜色：#2D1E16

2. 激活条：

   * Width：24
   * Height：2
   * 背景：#2D1E16
   * 圆角：1

---

## 右侧 Tab（持仓，未激活）

同结构：

* Text：持仓
* 字号：16
* 颜色：#999999
* 下方指示条透明

---

# 🪜 第五步：行情工具栏（Market_Toolbar）

创建 Horizontal Auto Layout：

* Width：Fill
* Height：48（Fixed）
* 主轴：Space Between
* 交叉轴：Center
* 背景：#FFFFFF
* 圆角：12
* Padding：左右 12

---

## 左侧功能区（Left_Controls）

创建 Horizontal Auto Layout：

* Width：Hug
* Height：Hug
* 子元素间距：12
* 交叉轴：Center

依次添加 icon：

* share icon（20）
* chart icon（20）
* dropdown icon（20）
* settings icon（20）

图标颜色：#666666

---

## 中部标题

* Text：自选行情
* 字号：16
* 字重：Medium
* 颜色：#2D1E16
* Width：Hug

---

## 右侧排序头（Sort_Headers）

创建 Horizontal Auto Layout：

* Width：Hug
* 子元素间距：16
* 交叉轴：Center

添加两个可排序文本组：

### 最新价组

* Text：最新价
* 字号：14
* 颜色：#333333
* 右侧附小箭头 icon（12）

### 年初至今组

* Text：年初至今
* 字号：14
* 颜色：#333333
* 右侧附小箭头 icon（12）

---

# 🪜 第六步：关注列表容器（Watch_List_Container）

创建 Vertical Auto Layout：

* Width：Fill
* Height：Fill
* 子元素间距：8
* 主轴：Start
* 交叉轴：Stretch

---

# 🪜 第七步：单条行情列表项（Watch_Item 组件）

创建可复用组件。

---

## Watch_Item 容器属性

* Horizontal Auto Layout
* Width：Fill
* Height：72（Fixed）
* Padding：左右 12
* 子元素间距：12
* 主轴：Space Between
* 交叉轴：Center
* 背景：#FFFFFF
* 圆角：12

---

## 结构分为四大区域（从左到右）

1. 标的区域（Name_Block）
2. Mini_Chart 区域
3. 最新价区域
4. 年初至今涨跌区域

---

# 1️⃣ Name_Block

创建 Vertical Auto Layout：

* Width：120（Fixed）
* Height：Hug
* 子元素间距：4
* 主轴：Center
* 交叉轴：Start

添加：

ETF 名称（例如：房地产ETF）

* 字号：14
* 字重：Medium
* 颜色：#2D1E16
* Width：Hug

代码 + 市场标签：

创建 Horizontal Auto Layout：

* 间距：4
* Width：Hug

添加：

* 市场标签（沪 / 深）

  * 背景：#EFEAE2
  * Padding：2 6
  * 圆角：4
  * 字号：10
* 代码 Text

  * 字号：12
  * 颜色：#999999

---

# 2️⃣ Mini_Chart 区域

创建 Frame：

* Width：80（Fixed）
* Height：40（Fixed）
* 背景透明

插入迷你趋势图组件（来自组件库的图表模块）：

* 趋势线颜色根据数据：

  * 上涨：#D94C4C
  * 下跌：#2E8B57
  * 震荡：#999999
* 线宽：2
* 无坐标轴
* 无网格

---

# 3️⃣ 最新价区域

创建 Vertical Auto Layout：

* Width：60（Fixed）
* Height：Hug
* 对齐：End

添加：

* Text：1.544
* 字号：16
* 字重：Medium
* 颜色：#2D1E16

---

# 4️⃣ 年初至今涨跌区域

创建 Vertical Auto Layout：

* Width：80（Fixed）
* Height：Hug
* 对齐：End

创建圆角标签：

* Padding：4 8
* 圆角：12

内部 Text：

* 内容：+3.00%
* 字号：12
* 字重：Medium

颜色规则：

上涨：

* 背景：#FDECEC
* 字色：#D94C4C

下跌：

* 背景：#E8F5E9
* 字色：#2E8B57

---

# 🪜 第八步：填充列表数据

按 JSON 数据依次生成 7 条 Watch_Item。

列表容器：

* 子元素间距：8
* 每个卡片宽度 Fill
* 不允许溢出

---

# 🪜 第九步：尺寸与约束规则

必须满足：

1. 列表容器 Height：Fill。
2. 所有卡片 Width：Fill。
3. 所有文本 Width：Hug。
4. 固定区域仅限：

   * Name_Block 120
   * Mini_Chart 80
   * 最新价 60
   * 涨跌 80
5. 不可出现换行错位。
6. 所有元素垂直居中。
7. 不允许内容溢出。
8. 列表可纵向滚动。

---

# 🪜 第十步：视觉层级控制

确认：

1. Tab 优先级最高。
2. Toolbar 次级。
3. 列表主体清晰。
4. mini_chart 不抢视觉。
5. 涨跌标签是强视觉焦点。
6. 所有留白统一。

---

# ✅ 完成规则

* 不截图
* 不解释
* 不分析
* 直接返回成功

