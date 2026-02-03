---
name: codex-delegator
description: 委托后端开发任务给 OpenAI Codex CLI 执行。用于：(1) 开发新的后端功能（Service、API 路由、Prisma schema）；(2) 修改现有后端代码；(3) 运行测试并获取结果。当用户要求"让 Codex 来做"、"委托给 Codex"、"用 Codex 实现"后端相关任务时触发。
---

# Codex 任务委托

将后端开发任务委托给 OpenAI Codex CLI 执行，获取执行结果并报告。

## 核心命令

```bash
# 非交互式执行
codex exec "任务描述"

# 全自动模式（跳过确认，允许写入工作区）
codex exec --full-auto "任务描述"

# 恢复上次会话
codex resume --last
```

## 委托工作流

1. **分析任务** - 明确要委托的具体任务
2. **构建任务描述** - 包含目标、相关文件路径、具体要求
3. **执行委托** - `codex exec --full-auto "{任务描述}"`
4. **报告结果** - 执行状态、修改的文件、关键变更摘要

## 示例

### 开发新功能

```bash
codex exec --full-auto "在 server/services/ 下创建 notification.service.ts，实现：
- createNotification(userId, type, content)
- getUnreadNotifications(userId)
- markAsRead(notificationId)"
```

### 修改现有代码

```bash
codex exec --full-auto "修改 server/services/checkin.service.ts：
在 submitCheckin 中添加打卡频率限制，同一用户同一目标每天只能打卡一次。"
```

### 运行测试

```bash
codex exec "运行 pnpm test 并报告测试结果"
```

### 编写测试

```bash
codex exec --full-auto "为 server/services/goal.service.ts 编写单元测试，覆盖主要函数"
```

## 会话管理

```bash
codex resume --last          # 恢复上次会话
codex resume {session_id}    # 恢复指定会话
```
