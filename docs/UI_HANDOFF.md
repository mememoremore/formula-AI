# Formula AI 前端 UI 接手说明

> 供新 Codex 会话接手使用。当前阶段只做前端 UI 修复，不扩展业务功能。

## 技术栈与组织

- Nuxt 4、Vue 3、TypeScript；页面在 `app/pages`，组件在 `app/components`，前端状态与逻辑在 `app/composables`。
- 沿用项目现有浅紫主色、淡色背景、纸页质感、柔和边框和较多留白；全局变量见 `app/assets/css/main.css`。
- 页面优先移动端，复用现有设计 Token、组件和布局，不另建一套 UI 框架或全局样式系统。

## 已完成与当前状态

- 已调整公式库卡片、公式详情、识别页、裁剪弹窗、任务进度和分类选择器等 UI。
- 公式预览卡片移除了下方说明文字，同时用最小高度保留卡片尺寸；识别前可填写公式名称；账号公式支持软删除，避免随机 ID 作为标题显示。
- 识别任务页保留圆形进度环并收紧说明布局；分类弹窗改为项目内样式的选项列表。
- 当前重点：`app/components/FormulaImageCropper.vue` 的旋转。旋转使用 Cropper 原生 90° 变换；此前 390px 用例发现旋转后只导出图片中心区域。已尝试在旋转后同步选区，但修复后的浏览器回归结果尚未确认。

## 页面与相关文件

- 识别上传与命名：`app/pages/upload.vue`、`app/composables/useAccountRecognition.ts`、`app/composables/useDemoLibrary.ts`。
- 裁剪：`app/components/FormulaImageCropper.vue`、`shared/image-crop.ts`。
- 识别任务：`app/pages/recognitions/[id].vue`、`app/components/AccountRecognitionTask.vue`、`app/components/RecognitionSteps.vue`、`app/components/TaskProgress.vue`。
- 公式库与分类：`app/components/AccountLibrary.vue`、`app/components/AccountCategoryPicker.vue`、`app/components/AccountFormulaCard.vue`。
- 公式详情与删除：`app/pages/formulas/[id].vue`、`app/components/FormulaDetailContent.vue`。

## 必须遵守的约束

- Mobile First；至少关注 320、390、430px 手机宽度和 1440px 桌面视口。避免横向溢出、遮挡和文字截断。
- 不用全局 `overflow: hidden` 掩盖局部布局问题。长公式应在公式区域内独立滚动。
- 保持现有导航、安全区、固定底栏和弹窗层级；触控目标与焦点状态清楚。
- 旋转应即时改变方向，避免反复重新编码原图；保留 EXIF 方向处理、像素/大小校验及临时资源释放。
- 维持账号数据与游客演示隔离、幂等和历史版本语义；不做后端架构重构或未经批准的数据库操作。

## 验证记录与下一步

- 上下文中最近记录：类型检查通过，单元测试 127/127 通过，隔离集成测试 225/225 通过（Pandoc 使用已有本地工具配置）。320px E2E 曾通过；390px 旋转回归先失败，之后的修复运行没有取得明确结束结果。430px、1440px 尚未确认。
- 新会话先检查当前分支和工作区，再针对裁剪旋转验证输出宽高及图像方向；确认 390px 后再跑 430px、1440px，并记录实际结果。不要把未完成的验证写成通过。
- 最近代码副本：桌面 `Formula-AI-R18`，分支 `codex/formula-library-polish`。这批改动尚未确认已同步到 GitHub `main`。
