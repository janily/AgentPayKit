# M4 Client and Browser Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供 Codex/Claude Code 共用的 macOS Client、预算控制、可恢复 CLI 与每次调用明确授权的 MetaMask Browser Bridge。

**Architecture:** Agent 只调用共享 Client；Client 在本机验证 Release、计算 Input Digest、预约预算并启动 loopback Bridge；Bridge 让 MetaMask 生成官方 x402 Payload，Client 提交并轮询 Runtime。

**Tech Stack:** Node.js 22、TypeScript、SQLite、`@x402/fetch` 2.19.0、React、wagmi、viem、MetaMask、Vitest/Playwright。

## Global Constraints

- 仅支持 macOS；其他平台在联网、写钱包会话或安装 Agent 入口前返回 `UNSUPPORTED_PLATFORM`。
- AgentPayKit 不接触私钥/助记词；每笔 Invocation 均需钱包签名。
- Bridge 仅绑定随机 `127.0.0.1` 端口，token 至少 256 bit、单次、短时且不在 URL。
- 预算 Reservation 失败时不打开钱包、不发送输入。

---

### Task 1: Implement shared Client invoke/status/resume

**Files:** Create `packages/client/src/{client,release-verifier,http,status-poller}.ts`, tests; modify `src/index.ts`.

- [ ] 使用 fake runtime 写测试：先验证 Package/Release/Runtime identity，再本地 digest，再 quote；失败时 HTTP 调用数符合阶段边界。
- [ ] 测试中断后 `resume(invocationId)` 只查询状态/结果，不重新 quote、签名、执行或收费。
- [ ] 运行包级测试；预期 `AgentPayClient` 缺失失败。
- [ ] 实现固定接口：

```ts
interface AgentPayClient {
  invoke(skill: InstalledSkill, input: unknown): Promise<InvocationHandle>;
  status(id: InvocationId): Promise<SignedStatus>;
  resume(id: InvocationId): Promise<ResultEnvelope>;
}
```

- [ ] 对每个 runtime response 验签；退避轮询有最大时长并返回可恢复 handle。
- [ ] 提交：`git commit -m "feat(client): add shared invocation and resume flow"`。

### Task 2: Add local SQLite budget and reservations

**Files:** Create `packages/client/src/{budget-store,budget-policy,reservations}.ts`, `migrations/001_local.sql`, concurrency tests.

- [ ] 测试单笔/每日预算、并发 reservation、释放、已结算记账、未知结算保留额度、重复 receipt 不重复记账。
- [ ] 运行测试；预期表/服务不存在失败。
- [ ] 事务实现 `reserve → authorize → settled|released|unknown`；金额以 USDC atomic decimal text 存储并转 `bigint` 计算。
- [ ] 日志与数据库不保存 raw input、payment payload 或钱包秘密。
- [ ] 运行并发测试 100 次；预期无超支且余额恒等式成立。
- [ ] 提交：`git commit -m "feat(client): enforce transactional local budgets"`。

### Task 3: Convert PayBot UI into secure loopback Browser Bridge

**Files:** Create `packages/browser-bridge/src/server/{session-store,loopback-server,csp}.ts`, `src/wallet/x402-signer.ts`; modify payment components/App; add Playwright tests.

- [ ] 测试仅接受 loopback Host、POST body token、正确 Origin；拒绝重放、超时、CSRF、非本机会话和 URL token。
- [ ] UI 测试断言只展示 digest、价格、payee、network、release、数据声明；DOM/localStorage/history 无完整输入。
- [ ] 运行测试；预期 server/session 缺失失败。
- [ ] 实现随机端口、256-bit token、5 分钟 TTL、一次性 consume、完成/拒绝/关闭后销毁；CSP 只允许本地静态资源和 MetaMask provider。
- [ ] 使用官方 x402 client/evm 结构创建 Payment Payload；禁止自行拼 EIP-712 签名。
- [ ] Playwright + mock EIP-1193 验证同意、拒绝、错链、余额不足、窗口关闭。
- [ ] 提交：`git commit -m "feat(bridge): add secure per-invocation MetaMask approval"`。

### Task 4: Build user CLI and charge-aware errors

**Files:** Create `packages/cli/src/{main,commands/invoke,commands/status,commands/resume,commands/spend,output}.ts`, CLI contract tests.

- [ ] Snapshot 测试人类输出与稳定 `--json` schema；所有错误含 `code` 与 `chargeState`。
- [ ] 测试 `process.platform !== "darwin"` 在任何网络调用前失败。
- [ ] 运行 CLI tests；预期命令不存在失败。
- [ ] 实现 `agentpay invoke|status|resume|spend`；SIGINT 保存 invocation handle，输出恢复命令。
- [ ] 将钱包拒绝/verify/handler/settle timeout/result expired 映射到准确 ChargeState，不统一显示“支付失败”。
- [ ] 运行 `pnpm --filter @agentpaykit/cli test && pnpm --filter @agentpaykit/cli build`。
- [ ] 提交：`git commit -m "feat(cli): expose recoverable paid-skill commands"`。

## M4 Definition of Done

- [ ] macOS 上 fake-runtime 完整授权与 resume 流通过。
- [ ] Linux CI 只验证 `UNSUPPORTED_PLATFORM`，不启动 Bridge、不联网。
- [ ] 并发预算测试无超支。
- [ ] Bridge security tests 覆盖 token 重放、CSRF、Origin、TTL、关闭清理。
- [ ] 代码和日志扫描未发现私钥、payload、完整输入或远程 UI 资源。
