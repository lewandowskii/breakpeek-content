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

首次配置 staging 时可生成一对本地 Ed25519 密钥：

```bash
npm run keys:generate -- staging-2026
```

密钥写入被 Git 忽略的 `.secrets/`。私钥只复制到 GitHub Secret，公钥配置给 Breakpeek Host。
GitHub 中建议将 `CONTENT_SIGNING_PRIVATE_KEY` 设置为私钥文件的单行 Base64，
避免多行粘贴被浏览器或密码管理器改写：

```bash
base64 < .secrets/staging-2026-private.pem | tr -d '\n' | pbcopy
```

构建脚本也兼容完整 PEM 文本、含字面量 `\\n` 的 PEM，以及本地开发时的文件路径。

## 编辑约束

1. 使用 `npm run content:add` 自动生成 UUID；不修改已有条目的 `id`。
2. `summary` 不超过 200 个 Unicode 字符，`body` 不超过 8192 字节。
3. 内容只允许纯文本或受限 Markdown，不允许原始 HTML。
4. 时效性内容设置 `expiresAt`，时间使用带时区的 ISO 8601 格式。
5. 引用外部事实或资料时填写 `sourceUrl`，并确认内容授权。

## 发布边界

当前仓库已包含内容、校验、构建、CI 产物归档和手动 R2 staging 发布流程。
生产发布策略与凭证由后续阶段配置。

## 发布到 R2 staging

`Publish staging content` 工作流按“不可变内容优先、稳定 Manifest 最后”的顺序发布：

```text
staging/<revision>/sources/*.ndjson
staging/<revision>.manifest.json
staging/manifest.json
```

稳定清单和归档清单位于同一目录，因此其中的
`<revision>/sources/*.ndjson` 相对路径在两种入口下都保持有效。

在 GitHub `staging` Environment 中配置：

- Secrets：`CLOUDFLARE_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`CONTENT_SIGNING_PRIVATE_KEY`
- Variables：`R2_BUCKET_NAME`、`CONTENT_SIGNING_KEY_ID`

随后从 Actions 手动运行 `Publish staging content`。Breakpeek Host 的目录地址应填写公开读取地址下的 `/staging/manifest.json`。
