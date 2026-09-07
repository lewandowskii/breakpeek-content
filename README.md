# Breakpeek Content

Breakpeek 的可独立更新内容仓库。这里的 JSON 是受 Git 管理的内容源稿，
不会作为插件用户机器上的运行时存储。发布时由构建脚本生成版本化 NDJSON
和清单，后续上传到对象存储/CDN，由 Breakpeek Host 校验并缓存。

## 目录

- `catalog.json`：资料库元数据和默认启用策略。
- `sources/*.json`：各资料库源稿。
- `schemas/*.schema.json`：源稿与目录的 JSON Schema。
- `scripts/validate.mjs`：结构、ID、长度、日期和引用校验。
- `scripts/build.mjs`：生成确定性 NDJSON、SHA-256 和 Manifest。
- `generated/`：本地产物目录，不提交到 Git。

## 内容模型

条目使用创建时自动生成、跨版本稳定的 UUID v4 `id`。`summary` 对应浮窗预览，`body` 对应展开详情；
没有 `body` 的条目不支持展开。`kind` 描述内容语义，`sourceId` 表示所属资料库。

## 本地使用

要求 Node.js 22.19 或更高版本，不需要安装第三方依赖：

```bash
npm run validate
npm run build
```

新增内容使用命令生成 UUID，不要手工编写 ID：

```bash
npm run content:add -- \
  --source interview-frontend \
  --kind interview \
  --title "事件循环" \
  --summary "前端面试题：宏任务与微任务如何调度？" \
  --body "在这里填写详情。" \
  --tags "JavaScript,事件循环"
```

构建结果位于 `generated/<revision>/`：

```text
generated/<revision>/
├── manifest.json
└── sources/*.ndjson
```

如设置 `CONTENT_SIGNING_PRIVATE_KEY`（PKCS#8 PEM 文本或 PEM 文件路径），
构建脚本会使用 Ed25519 对清单负载签名。`CONTENT_SIGNING_KEY_ID` 用于标识公钥。
未设置私钥时生成开发清单，`signature` 为 `null`，不得发布到生产环境。

## 编辑约束

1. 使用 `npm run content:add` 自动生成 UUID；不修改已有条目的 `id`。
2. `summary` 不超过 200 个 Unicode 字符，`body` 不超过 8192 字节。
3. 内容只允许纯文本或受限 Markdown，不允许原始 HTML。
4. 时效性内容设置 `expiresAt`，时间使用带时区的 ISO 8601 格式。
5. 引用外部事实或资料时填写 `sourceUrl`，并确认内容授权。

## 发布边界

当前初始化版本只完成内容、校验、构建和 CI 产物归档。R2 上传、生产签名密钥
和 Breakpeek Host 同步将在后续阶段接入。
