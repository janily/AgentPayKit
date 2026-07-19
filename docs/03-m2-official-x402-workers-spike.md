# M2 Official x402 Workers Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 证明官方 x402 v2、CDP Facilitator、Base USDC 与 Cloudflare Workers/Hono 可在固定版本下完成一次 Sepolia 同步 verify/settle。

**Architecture:** `@agentpaykit/payment` 是官方 SDK 的薄 Adapter；`apps/runtime` 提供只用于兼容验证的同步 `/spike/paid-ping`，M3 不复用该路由作为异步 Execution Endpoint。

**Tech Stack:** `@x402/core|evm|hono|fetch|extensions` 2.19.0、Hono、Workers、Miniflare、CDP、Base Sepolia USDC。

## Global Constraints

- 五个 `@x402/*` 包必须精确锁定 `2.19.0`，禁止 `^` 与 `~`。
- 不实现或复制 EIP-712/EIP-3009 验签逻辑。
- Spike 可以同步 settle，但路由名和文档必须明确为非生产兼容试验。
- 默认测试使用 fake facilitator；真实 Sepolia 只在 `AGENTPAY_E2E_SEPOLIA=1` 时运行。

---

### Task 1: Implement the official payment adapter contract

**Files:** Modify `packages/payment/package.json`, `src/index.ts`; create `src/types.ts`, `src/x402-payment-adapter.ts`, `test/x402-payment-adapter.test.ts`.

- [ ] 先用 fake resource server 写测试：`verify()` 只调用 `processHTTPRequest()`；`settle()` 只调用 `processSettlement()`；两者不互相调用。
- [ ] 运行 `pnpm --filter @agentpaykit/payment test`；预期因 Adapter 缺失失败。
- [ ] 实现并导出固定接口：

```ts
interface PaymentVerifier { verify(input: VerifyPaymentInput): Promise<VerifiedPayment>; }
interface PaymentSettler {
  settle(input: SettlePaymentInput): Promise<SettlementResult>;
  reconcile(input: ReconcilePaymentInput): Promise<SettlementState>;
}
```

- [ ] Adapter 内构造 `HTTPFacilitatorClient`、`ExactEvmScheme` 与 `x402HTTPResourceServer`；只把可序列化 payload/requirements/extensions 返回调用方。
- [ ] 运行包级 test/typecheck；预期通过且 verify 测试中的 settle spy 调用数为 `0`。
- [ ] 提交：`git commit -m "feat(payment): wrap official x402 resource server"`。

### Task 2: Pin network and asset configuration

**Files:** Create `packages/payment/src/networks.ts`, `src/config.ts`, `test/config.test.ts`; modify root lockfile.

- [ ] 测试仅接受 `eip155:84532` 与 `eip155:8453`，金额为 decimal string，asset/payee 为校验后的 `0x` 地址。
- [ ] 测试五个官方包版本完全相同且等于 `2.19.0`；运行后预期因依赖未加入失败。
- [ ] 增加精确依赖并执行 `pnpm install`；从环境分别读取 Sepolia/Mainnet CDP URL/凭据，不提供隐式主网默认值。
- [ ] 运行 `pnpm test --filter @agentpaykit/payment` 与 `pnpm install --frozen-lockfile`；预期成功。
- [ ] 提交：`git commit -m "build(payment): pin x402 v2 and Base networks"`。

### Task 3: Prove Workers and Hono compatibility locally

**Files:** Create `apps/runtime/src/index.ts`, `src/spike.ts`, `test/spike.test.ts`, `wrangler.toml`; modify runtime package scripts.

- [ ] Miniflare 测试断言 `GET /health` 返回 `{status:"ok"}`，无签名请求 `POST /spike/paid-ping` 返回 402 与 `PAYMENT-REQUIRED`。
- [ ] 运行 `pnpm --filter @agentpaykit/runtime test`；预期路由不存在失败。
- [ ] 用 Hono 实现 health 与同步 spike；仅开启官方 SDK 所需的 `nodejs_compat`，不设置 wildcard credentialed CORS。
- [ ] 使用 fake facilitator 完成签名请求的 verify → handler → settle，响应 200 且含 `PAYMENT-RESPONSE`。
- [ ] 运行 `pnpm --filter @agentpaykit/runtime test && pnpm --filter @agentpaykit/runtime build`；预期成功且 bundle 无 Node 内置模块错误。
- [ ] 提交：`git commit -m "spike(runtime): run official x402 on Workers"`。

### Task 4: Run the opt-in Base Sepolia compatibility gate

**Files:** Create `tests/e2e/x402-sepolia-spike.test.ts`, `scripts/run-sepolia-spike.sh`, `docs/acceptance/m2-sepolia.md`.

- [ ] 测试在未开启 flag 时明确 skip；开启时要求 `CDP_API_KEY_ID`、`CDP_API_KEY_SECRET`、`SEPOLIA_PAYEE_ADDRESS` 和外部测试钱包 signer。
- [ ] 先以缺失变量运行 `AGENTPAY_E2E_SEPOLIA=1 pnpm vitest run tests/e2e/x402-sepolia-spike.test.ts`；预期输出缺失变量列表且不广播交易。
- [ ] 配置隔离测试钱包后运行脚本，验证 402、verify、handler、settle、链上 receipt 和 `0.01` USDC 收款一致。
- [ ] 将脱敏 header 摘要、交易哈希、网络、金额和测试时间写入 evidence 文档；不得保存 payload 或秘密。
- [ ] 提交：`git commit -m "test: prove x402 Workers flow on Base Sepolia"`。

## M2 Definition of Done

- [ ] `pnpm list -r --depth -1` 显示所有 `@x402/*` 均为 `2.19.0`。
- [ ] Miniflare contract tests 证明 verify 与 settle 可分离。
- [ ] Workers bundle/build 通过。
- [ ] Base Sepolia 真实交易为 `0.01` USDC，receipt 与 payee 余额变化一致。
- [ ] `/spike/paid-ping` 被文档和代码注释标记为 M2-only，M3 删除该路由。
