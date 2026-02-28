# 技术架构文档

## 技术栈

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 框架 | Nuxt 3 | ^3.14 | 全栈框架，前后端一体 |
| 语言 | TypeScript | ^5.0 | 类型安全 |
| UI | Tailwind CSS | ^3.4 | 原子化 CSS |
| ORM | Prisma | ^5.0 | 类型安全的数据库访问 |
| 数据库 | PostgreSQL | 16 | 本地 Docker，线上直连 |
| 认证 | nuxt-auth-utils | ^0.5 | Session 认证 |
| 文件存储 | 本地 / 腾讯云 COS | - | 开发用本地，生产用 COS |
| 定时任务 | node-cron | ^4.2 | 生产环境 cron 调度，开发环境 setInterval 降级 |
| 测试 | Vitest | ^2.0 | 仅测试 Service 层 |
| 包管理 | pnpm | ^9.0 | 快速、节省磁盘 |

## 项目目录结构

```
clock-in-pact/
├── docs/                    # 文档
│   ├── prd/                 # 需求文档
│   └── api/                 # API 文档（前后端联调）
├── prisma/                  # 数据库
│   └── schema.prisma        # 数据模型定义
├── server/                  # 后端
│   ├── api/                 # API 路由
│   ├── services/            # 业务逻辑层
│   ├── plugins/             # Nitro 插件（定时任务启动等）
│   ├── middleware/          # 中间件
│   └── utils/               # 工具函数（prisma client、storage 等）
├── components/              # Vue 组件
├── pages/                   # 页面路由
├── composables/             # 组合式函数
├── layouts/                 # 布局
├── public/                  # 静态资源
│   └── uploads/             # 本地上传文件（开发环境）
├── tests/                   # 测试
│   ├── services/            # Service 层测试
│   └── setup.ts             # 测试初始化
├── nuxt.config.ts           # Nuxt 配置
├── tailwind.config.ts       # Tailwind 配置
├── docker-compose.yml       # 本地 PostgreSQL
└── .env                     # 环境变量
```

## 环境变量

```bash
# .env
DATABASE_URL="postgresql://postgres:123456@localhost:5432/clockinpact"

# 文件存储（production 时配置）
STORAGE_TYPE=""       # 留空时：production 自动 cos，其他环境自动 local；也可显式 local | cos
COS_SECRET_ID=""
COS_SECRET_KEY=""
COS_BUCKET=""         # 例如：clock-in-pact-1250000000（Bucket-APPID）
COS_REGION=""         # 例如：ap-shanghai
COS_SIGNED_URL_EXPIRES_IN_SECONDS="900" # 可选，私有桶签名 URL 过期秒数

# 认证
NUXT_SESSION_PASSWORD="至少32位随机字符串"

# 备案号展示（登录页和登录后首页底部中间）
NUXT_PUBLIC_SHOW_ICP_FILING="false"
NUXT_PUBLIC_ICP_FILING_TEXT=""
NUXT_PUBLIC_ICP_FILING_LINK="https://beian.miit.gov.cn/"
```

## 本地开发

```bash
# 1. 启动数据库
docker compose up -d

# 2. 初始化数据库
pnpm prisma db push

# 3. 启动开发服务器
pnpm dev
```

## 测试

```bash
# 运行所有测试
pnpm test

# 运行单个测试文件
pnpm test checkin.service
```

## API 文档

API 文档位于 `docs/api/` 目录，按模块划分：

| 文件 | 说明 |
|------|------|
| `auth.md` | 认证相关（注册、登录、登出） |
| `group.md` | 小组管理（创建、邀请、加入） |
| `goal.md` | 目标管理（创建、修改、取消、结算） |
| `checkin.md` | 打卡相关（提交、审核） |
| `progress.md` | 进度查询（个人进度、排行榜、贡献图） |
| `feed.md` | 动态流 |

文档格式统一为：

```markdown
## 接口名称

**POST** `/api/xxx`

### 请求参数
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|

### 响应
| 字段 | 类型 | 说明 |
|------|------|------|

### 错误码
| code | 说明 |
|------|------|
```
