# 打卡契约 / ClockInPact

社交监督式打卡与 PK 系统，帮助小团体（2-6人）坚持完成长期目标。

## 功能

- **用户注册** - 支持用户名、密码、昵称，昵称按中文=1/英文数字=0.5计长
- **用户登录** - 支持"记住我"功能（7天免登录）

## 技术栈

- **框架**: Nuxt 4 + Vue 3
- **数据库**: PostgreSQL 16 + Prisma 7
- **样式**: Tailwind CSS
- **认证**: nuxt-auth-utils
- **测试**: Vitest

## 快速开始

### 1. 启动数据库

```bash
docker compose up -d
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，设置 `NUXT_SESSION_PASSWORD`（至少 32 位随机字符串）。

### 3. 安装依赖

```bash
pnpm install
```

### 4. 初始化数据库

```bash
pnpm prisma migrate dev
```

### 5. 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:3000

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 构建生产版本 |
| `pnpm preview` | 预览生产构建 |
| `pnpm test` | 运行测试 |
| `pnpm prisma studio` | 打开数据库管理界面 |

## 文档

- [技术架构](docs/ARCHITECTURE.md)
- [开发指南](docs/GUIDELINES.md)
