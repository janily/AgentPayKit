# M6 Deep Research Lite and Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付首个 0.01 USDC Paid Skill，并用结构化日志、用户支出查询和 Publisher PayInsight 支撑诊断与验收。

**Architecture:** Deep Research Lite Handler 只经声明的 search/model adapters 处理输入，并由硬上限与 Success Policy 决定是否可结算；Observability 在写日志前使用字段 allowlist，CLI 分别查询本地 SQLite 与 D1 聚合。

**Tech Stack:** TypeScript、Workers/Hono、D1/R2、JSON Schema、Vitest、共享 Client/CLI、外部 search/model providers。

## Global Constraints

- 价格固定 `0.01` USDC；最多 5 次搜索、5 个页面、3,000 output tokens、5 分钟、无副作用请求最多重试 1 次。
- 输出至少 500 个非空白字符与 2 个不重复 HTTPS citations；失败不 settle、不交付部分结果。
- 用户无需配置 search/model key；key 只存在 Cloudflare Secrets。
- 不做 Web Dashboard；只提供 CLI 与结构化日志。

---

### Task 1: Implement provider interfaces and hard caps

**Files:** Create `examples/paid-deep-research-lite/src/{types,search-adapter,model-adapter,budget,handler}.ts`, schemas and tests.

- [ ] Fake providers 测试 query/input schema、processor allowlist、5/5/3000/5min 上限与最多一次安全重试。
- [ ] 测试新增未声明 processor、请求正文超限、成本上限、timeout 均返回可分类的 Handler error。
- [ ] 运行示例测试；预期模块缺失失败。
- [ ] 实现 provider-neutral interfaces；完整输入仅传给 Release 声明的处理方，不记录 response body。
- [ ] 以 `developerReportedCostUsd` 记录 Publisher 申报成本，不使用“审计成本”措辞。
- [ ] 提交：`git commit -m "feat(example): implement bounded deep research handler"`。

### Task 2: Implement and bind the Success Policy

**Files:** Create `examples/paid-deep-research-lite/src/success-policy.ts`, `test/success-policy.test.ts`; modify Release template/config.

- [ ] 表驱动测试：499/500 字符、1/2 citation、重复 citation、HTTP citation、schema 错误、provider/cost/cap violation。
- [ ] 运行测试；预期 policy 缺失失败。
- [ ] Policy 验证 output schema、非空白字符数、去重 HTTPS URL 与所有 hard-cap telemetry；返回结构化原因且不含正文。
- [ ] 集成测试断言每个失败样本 settle spy=0，成功样本 settle=1。
- [ ] 提交：`git commit -m "feat(example): gate settlement with research success policy"`。

### Task 3: Add allowlisted structured logging

**Files:** Create `packages/observability/src/{event,logger,redaction}.ts`, tests; integrate runtime/client/example call sites.

- [ ] Property test 向 logger 输入私钥、API key、payload、raw input、provider body 和任意额外字段；序列化结果只能含 10 个批准业务字段。
- [ ] 运行测试；预期 logger 缺失失败。
- [ ] 实现 `AgentPayLogEvent`：timestamp、level、event、releaseId、invocationId、status、durationMs、amount、network、errorCode、traceId；写入前 pick allowlist。
- [ ] 禁止异常原文直接返回或记录；用稳定 errorCode 和 traceId 关联。
- [ ] 运行 `pnpm --filter @agentpaykit/observability test` 与 repository secret/log scan。
- [ ] 提交：`git commit -m "feat(observability): emit allowlisted payment logs"`。

### Task 4: Implement user spend and Publisher PayInsight CLI

**Files:** Create `packages/cli/src/commands/{spend,receipts,payinsight}.ts`, `packages/observability/src/payinsight.ts`, D1 aggregation query and CLI tests.

- [ ] Snapshot tests 固定 human/`--json` 输出；用户命令只读本地 SQLite，PayInsight 必须有 Publisher Cloudflare identity。
- [ ] 测试按时间/release/status 汇总、unknown settlement、结果过期、空数据和权限拒绝。
- [ ] 运行 tests；预期命令/queries 缺失失败。
- [ ] 实现 `agentpay spend|receipts` 与 `agentpay publisher payinsight`；后者只返回聚合元数据与 `developerReportedCostUsd`。
- [ ] 确认任何命令不返回输入、结果正文、Payment Snapshot 或完整 payer 数据。
- [ ] 提交：`git commit -m "feat(cli): add spend and PayInsight queries"`。

### Task 5: Package and test the official example

**Files:** Complete `examples/paid-deep-research-lite/agentpay.json`, testnet/mainnet Release configs, package tests, `docs/acceptance/m6-example.md`.

- [ ] 用 M5 Publisher 工具分别构建 testnet/mainnet Release 与 Package；断言价格相同、network/Release ID 不同。
- [ ] fake provider full-flow 测试 quote → approve → execute → policy → settle → result → receipt。
- [ ] retention 测试输入执行后删除、结果 24h 删除、元数据/Receipt 30d，结构化日志不超过 30d。
- [ ] 运行 `pnpm --filter paid-deep-research-lite test && pnpm test --filter ./tests/integration`。
- [ ] 记录 package/release digests 与脱敏测试证据。
- [ ] 提交：`git commit -m "feat(example): publish Deep Research Lite package"`。

## M6 Definition of Done

- [ ] 所有硬上限与边界值测试通过。
- [ ] Policy 失败样本 settle 调用数为零。
- [ ] 日志 property/secret scan 泄露数为零。
- [ ] 用户 CLI 与 PayInsight 的 `--json` schema 稳定且数据域分离。
- [ ] testnet/mainnet 示例 Release 可离线验证且 ID 不同。
