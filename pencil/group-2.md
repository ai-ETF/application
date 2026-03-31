

# 🚀 Claude MCP / Pencil Agent 专用执行指令

# （V5 · ETF 深度分组页 · 超精细结构）

---

# 🔒 全局执行规则（必须严格遵守）

1. 在当前活跃页面创建画布。

2. 不创建新页面。

3. 不截图。

4. 不进行解释。

5. 所有布局使用 Auto Layout。

6. 禁止绝对坐标。

7. 所有组件来自：

   **mobile-03-technicalwarm_light**

8. 若组件不存在，使用最接近组合。

9. 统一 8pt 间距系统。

10. 统一圆角。

11. 所有容器必须明确 Fill / Hug / Fixed。

12. 所有元素不可重叠。

13. 适配移动端。

14. 完成后直接返回成功。

---

# 🪜 第一步：创建画布（最高优先级）

1. 创建一个移动端竖屏画布。

2. 画布尺寸：

   * 宽度：390
   * 高度：844

3. 方向：Vertical。

4. 设置背景颜色：

   #F8F5F0

5. 设置字体：

   sans-serif

6. 设置画布主布局为：

   Vertical Auto Layout。

7. 设置画布主容器：

   * 宽度：Fill container
   * 高度：Fill container
   * Padding：

     * 左右：16
     * 上下：0
   * 子元素间距：16
   * 主轴对齐：Start
   * 交叉轴对齐：Stretch

---

# 🪜 第二步：创建页面主结构容器

在画布内创建一个主容器：

### 主容器属性

* 类型：Frame
* 布局：Vertical Auto Layout
* 宽度：Fill
* 高度：Fill
* Padding：0
* 间距：16
* 对齐：Start / Stretch

该容器用于放置所有模块。

---

# 🪜 第三步：创建状态栏模块（StatusBar）

在主容器内创建第一个子容器。

---

## StatusBar 容器

属性：

* 高度：40（Fixed）
* 宽度：Fill
* Auto Layout：Horizontal
* 主轴对齐：Space between
* 交叉轴：Center

---

### 左侧时间区域

创建文本：

* 内容：14:53
* 字号：14
* 颜色：#000000
* Hug 内容

---

### 右侧状态组合容器

创建一个横向容器：

属性：

* Auto Layout：Horizontal
* 间距：8
* Hug
* 垂直居中

依次添加：

1. 4G_signal 图标（16）
2. 文本 4G（12）
3. battery 图标（16）
4. 文本 97（12）

所有颜色 #000000。

---

# 🪜 第四步：创建顶部导航栏（Top Navigation）

在主容器中创建第二个子容器。

---

## TopNav 容器

属性：

* 高度：60 Fixed
* 宽度：Fill
* Auto Layout：Horizontal
* 主轴：Space between
* 交叉轴：Center
* Padding：

  * 上下：8

---

## 左侧区域容器

创建横向容器：

* Auto Layout：Horizontal
* 间距：12
* Hug

---

### 菜单按钮容器

创建 Frame：

* 48 × 48 Fixed
* 背景 #FFFFFF
* 圆角 24
* Center

内部放：

* hamburger 图标
* size 20

---

### 标题区容器

创建纵向容器：

* Auto Layout：Vertical
* Hug

添加：

1. 小E

   * size 20
   * medium
2. 您的 ETF 投资助手

   * size 14
   * #666

---

## 右侧操作区容器

横向容器：

* Auto Layout
* 间距 8

---

### 搜索按钮

容器：

* 48 × 48
* 圆角 24
* 背景 #FFF

内部：

* search 图标

---

### 更多按钮

同上：

* more_options

---

# 🪜 第五步：创建标题区域（ETF 标题）

在主容器中创建第三模块。

文本：

* 沪深300
* size 36
* bold
* 左对齐
* Hug

设置：

* 上间距 20
* 下间距 30

---

# 🪜 第六步：功能卡片区域（Function Cards）

创建横向容器：

* Auto Layout：Horizontal
* Fill
* 间距：16

---

## 卡片一：指令

创建 Frame：

* 宽度：Fill（等比例 1）
* 高度：80
* 背景 #F0EDE8
* 圆角 12
* Padding：16
* Auto Layout：Horizontal
* 主轴：Space between
* 交叉轴：Center

---

### 左区域

横向：

* 图标 custom_instruction

---

### 中区域

纵向：

1. 指令（18）
2. 定制小E在该分组…（14 #999）

---

### 右区域

* arrow_right

---

## 卡片二：资料库

复制卡片一：

* icon：database_folder
* 标题：资料库
* 描述：上传内容作为资料库

---

# 🪜 第七步：空状态区域

创建纵向容器：

* Fill
* 上间距：120
* 居中

添加：

1. new_chat（32）
2. 文本

   * 新建对话或移入历史对话
   * size 16
   * #999
   * 上间距 16

---

# 🪜 第八步：底部输入栏

创建容器：

* 高度：56
* Fill
* 背景 #F0EDE8
* 圆角 24
* Padding：16
* Auto Layout：Horizontal
* 主轴：Space between
* 垂直居中

---

### 左侧

camera + 文本

---

### 中间

voice

---

### 右侧

add

---

# 🪜 第九步：全局校验

必须确认：

1. 无绝对定位。
2. 所有 Fill / Hug 正确。
3. 无重叠。
4. 统一间距。
5. 统一风格。
6. 使用组件库。

---

# ✅ 完成规则

完成后：

* 不解释
* 不截图
* 不分析
* 直接返回成功

---


