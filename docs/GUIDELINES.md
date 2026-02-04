# 开发指导原则

## 开发最佳实践

### 代码规范

- 使用 TypeScript 严格模式，避免 `any` 类型
- 组件、函数命名使用 PascalCase（组件）和 camelCase（函数/变量）
- 文件命名使用 kebab-case（如 `user-profile.vue`）
- 业务逻辑放在 `server/services/`，API 路由保持薄层

### 数据库

- 修改 `schema.prisma` 后执行 `pnpm prisma db push`
- 生产环境使用 `pnpm prisma migrate deploy`
- 字段命名使用 camelCase，表名使用 PascalCase

### 测试

- 核心业务逻辑必须有测试覆盖
- 提交前运行 `pnpm test` 确保测试通过

---

## UI/UX 规范

### 设计原则

- 主动使用 `ui-ux-pro-max` Skill 进行 UI 设计和实现
- 保持界面简洁，核心操作路径短
- 移动端优先，确保响应式适配

### 图标使用

- **禁止**在图标或 UI 组件中使用 emoji 字符
- **必须**使用 [Lucide Icons](https://lucide.dev/)

```vue
<!-- 正确 -->
<template>
  <Icon name="lucide:check" />
  <Icon name="lucide:x" />
  <Icon name="lucide:plus" />
</template>

<!-- 错误 -->
<template>
  <span>✅</span>
  <span>❌</span>
  <span>➕</span>
</template>
```

### 样式

- 仅使用 Tailwind CSS，不写自定义 CSS
- 颜色使用 Tailwind 预设或在 `tailwind.config.ts` 中统一定义
- 优先使用阴影效果而非边框；如需边框，应使用浅色或低对比度样式，避免笨重感

---

## 组件设计

### 目录结构

```
components/
├── ui/                # 基础 UI 组件（按钮、输入框、卡片等）
├── form/              # 表单组件
├── layout/            # 布局组件（导航、侧边栏等）
└── business/          # 业务组件（打卡卡片、进度图等）
```

### 命名规范

| 类型 | 命名示例 | 说明 |
|------|----------|------|
| 基础组件 | `UiButton.vue` | 以 `Ui` 前缀 |
| 表单组件 | `FormInput.vue` | 以 `Form` 前缀 |
| 布局组件 | `LayoutNavbar.vue` | 以 `Layout` 前缀 |
| 业务组件 | `CheckinCard.vue` | 直接使用业务名称 |

### 设计原则

1. **单一职责**：每个组件只做一件事
2. **Props 优先**：通过 props 传递数据，避免组件内部直接请求 API
3. **事件上抛**：子组件通过 `emit` 通知父组件，不直接修改外部状态
4. **插槽扩展**：使用 `slot` 提供灵活的内容定制能力

### 组件模板

```vue
<script setup lang="ts">
interface Props {
  title: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false
})

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    :disabled="props.disabled"
    class="px-4 py-2 bg-blue-500 text-white rounded"
    @click="emit('click')"
  >
    {{ props.title }}
  </button>
</template>
```

---

## Git 提交规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 约定式提交规范。

### 提交格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type 类型

| type | 说明 |
|------|------|
| feat | 新功能 |
| fix | 修复 bug |
| docs | 文档变更 |
| style | 代码格式（不影响逻辑） |
| refactor | 重构（非新功能、非修复） |
| perf | 性能优化 |
| test | 测试相关 |
| chore | 构建/工具/依赖变更 |

### 提交要求

1. **提交前充分考虑**：确保变更完整、测试通过、无遗漏
2. **语言规范**：
   - `<type>(<scope>):` 使用英文
   - `<subject>`、`<body>` 使用中文
3. **禁止内容**：`<footer>` 不包含"与 AI 一起构建"、"Co-Authored-By: Claude" 等信息

### 示例

```
feat(checkin): 实现打卡提交功能

- 支持填写数值和上传证据截图
- 打卡记录提交后进入待审核状态
- 通知监督者进行审核
```

```
fix(goal): 修复时长阶梯判定逻辑错误

当挑战者完成次数为 2 时，应解锁 3 个月而非 2 个月
```

---

## 版本标签规范

### 打标签前

1. 确保 `README.md` 内容是最新的
2. 确保所有测试通过
3. 确保 CHANGELOG 已更新（如有）

### 标签格式

```bash
git tag -a v1.0.0 -m "版本描述"
```

### 标签描述要求

包含该版本的综合描述，概括主要变更：

```bash
# 正确
git tag -a v1.0.0 -m "首个正式版本：用户注册登录、小组管理、目标创建、打卡与审核、进度可视化"

git tag -a v1.1.0 -m "新增动态流功能，优化进度贡献图展示，修复结算时累计数值计算错误"

# 错误（描述过于简单）
git tag -a v1.0.0 -m "v1.0.0"
git tag -a v1.1.0 -m "更新"
```
