# M3 Async Runtime and Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现可恢复的异步 Invocation：verify 后入队，Handler 与 Success Policy 成功后才 settle，链上确认后才交付结果。

**Architecture:** `protocol` 固定跨端类型与签名；`runtime` 用 D1 做状态机与幂等、R2 保存加密正文、Queue 执行和结算；`payment` 仅提供 verify/settle/reconcile。

**Tech Stack:** TypeScript、Hono、Cloudflare D1/Queues/R2、WebCrypto AES-256-GCM、official x402 v2、viem、Vitest/Miniflare。

## Global Constraints

- `payment-identifier === invocationId`，请求指纹冲突返回 `409 INVOCATION_BINDING_CONFLICT`。
- `POST /v1/invocations` 返回 202 时 settle 调用数必须为零。
- Payment Payload、原始输入和候选结果只以应用层加密形式进入 R2，绝不进入 D1、日志或响应。
- 状态转换只能通过集中状态机和 D1 conditional update。

---

### Task 1: Freeze protocol types, canonical JSON, digests and signatures

**Files:** Create `packages/protocol/src/{ids,status,canonical-json,digests,envelopes,signatures,errors}.ts`, `schemas/*.json`, `test/*.test.ts`; modify `src/index.ts`.

- [x] 用固定 fixtures 写 canonical JSON、SHA-256、Runtime signature、Release signature 与错误 Envelope 的 golden tests。
- [x] 运行 `pnpm --filter @agentpaykit/protocol test`；预期因 exports 缺失失败。
- [x] 实现品牌类型 `ReleaseId/InputDigest/PackageDigest/PublisherId/InvocationId/QuoteId/TraceId` 和设计文档中的 11 个 `InvocationStatus`。
- [x] 固定 `ChargeState = NOT_CHARGED | CHARGED | SETTLEMENT_UNKNOWN`；未知字段/状态解析必须失败。
- [x] 运行 test/typecheck；预期 golden bytes 在 Node 与 Workers 环境一致。
- [x] 提交：`git commit -m "feat(protocol): define signed invocation contracts"`。

### Task 2: Create D1 schema, repository and guarded state machine

**Files:** Create `packages/runtime/migrations/0001_initial.sql`, `src/repository.ts`, `src/state-machine.ts`, `test/repository.test.ts`, `test/state-machine.test.ts`.

- [x] 测试唯一约束：Invocation ID 唯一、Quote ID 唯一、同 ID 同指纹返回旧记录、不同指纹冲突。
- [x] 表驱动测试所有合法转换，并断言 `EXECUTING → SETTLING`、`QUOTED → RESULT_AVAILABLE` 等非法跨越失败。
- [x] 运行包级测试；预期 schema/repository 缺失失败。
- [x] 建表 `releases, quotes, invocations, receipts`；D1 仅保存摘要、状态、R2 key、交易哈希和时间戳。
- [x] 用 `UPDATE ... WHERE id=? AND status=? AND version=?` 实现 CAS；并发领取 Queue job 只能一个成功。
- [x] 运行 Miniflare D1 tests；预期并发测试仅一个 winner。
- [x] 提交：`git commit -m "feat(runtime): add D1 invocation state machine"`。

### Task 3: Implement quote and execution acceptance

**Files:** Create `packages/runtime/src/{quote-service,invocation-service,blob-vault,fingerprint}.ts`, `apps/runtime/src/routes/invocations.ts`, corresponding contract/integration tests; delete `apps/runtime/src/spike.ts`.

- [x] 测试 `POST /v1/invocations/quote` 只接收 Invocation ID、Release ID、Input Digest、environment，返回 402、`PAYMENT-REQUIRED` 与 5 分钟签名 Quote。
- [x] 测试 Execution 固定顺序：Release/Quote/input/payment-identifier 校验 → fingerprint → CDP verify → 原子持久化 → enqueue → 202；任何前置失败不入队。
- [x] 运行路由测试；预期 404/缺失服务失败。
- [x] 实现 `VerifiedPaymentSnapshot` 精确字段；AES-256-GCM 每个 blob 使用独立 96-bit nonce 与 key version，D1 只存 R2 ref/digest。
- [x] 对重复相同请求返回已有 signed status；不同 fingerprint 返回 409；确认 settle spy 为零。
- [x] 运行 `pnpm --filter @agentpaykit/runtime test`；预期通过，并确认 `/spike/paid-ping` 为 404。
- [x] 提交：`git commit -m "feat(runtime): verify and enqueue paid invocations"`。

### Task 4: Execute, apply Success Policy, settle and deliver

**Files:** Create `packages/runtime/src/{queue-consumer,handler-runner,success-policy,settlement-service,receipt-service}.ts`, `apps/runtime/src/queue.ts`, integration tests.

- [x] 写三组顺序测试：Handler 失败 settle=0；Policy 失败 settle=0；成功时先 policy、后 settle、链上确认后 `RESULT_AVAILABLE`。
- [x] 增加 Queue 重投测试：相同 job 不重复执行；`SETTLING` 重投只进入 reconcile。
- [x] 运行测试；预期 consumer 缺失失败。
- [x] 实现执行超时、output schema、Policy；候选结果在结算确认前不可通过 HTTP 读取。
- [x] 生成签名 Receipt，至少含 invocation/release/input digest、payer/payee、network/asset/amount、txHash、timestamps、result digest。
- [x] 运行 test/typecheck/build；预期调用顺序与状态断言全部通过。
- [x] 提交：`git commit -m "feat(runtime): settle only after successful execution"`。

### Task 5: Reconcile unknown settlement and expose recovery APIs

**Files:** Create `packages/payment/src/reconcile.ts`, `packages/runtime/src/reconciliation.ts`, `apps/runtime/src/routes/{status,result,receipt}.ts`, `src/cleanup.ts`, tests.

- [x] 测试优先查 tx receipt；无 hash 时查 USDC `AuthorizationUsed`；不存在且授权有效才以相同 payload 重试；过期则最终 `NOT_CHARGED`。
- [x] 测试 `GET /status`、`/result`、`/receipt` 的 signed envelope，以及结算未知不交付、24 小时后只返回 Receipt + `RESULT_EXPIRED`。
- [x] 运行测试；预期 reconcile/route 缺失失败。
- [x] 实现对账、Cron 清理：输入执行后即删且硬上限 1h；结果结算后 24h；元数据/Receipt 30d。
- [x] 运行 Miniflare 集成测试，模拟 Worker 重启、Queue 重投、CDP timeout 和 cleanup。
- [x] 提交：`git commit -m "feat(runtime): reconcile settlement and expire results"`。

## M3 Definition of Done

- [x] Contract tests 证明 202 永不 settle。
- [x] Handler/Policy 失败的 settle 调用数和链上转账数均为零。
- [x] 同 Invocation 并发请求只执行、结算一次；冲突 fingerprint 返回 409。
- [x] CDP timeout 后可由 receipt/event 对账恢复且不要求第二次签名。
- [x] 结算前 result endpoint 不泄露候选结果；24 小时清理测试通过。
