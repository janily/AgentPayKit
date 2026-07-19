# M7 E2E, Mainnet and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用自动化失败矩阵、真实 Base Sepolia、Codex/Claude Code 主网调用与第三方安装证明 AgentPayKit MVP 达到 PRD Definition of Done。

**Architecture:** `testkit` 提供确定性 mocks/fault injection；Sepolia runner 驱动完整外部链路；主网只以隔离小额钱包人工执行；evidence bundle 以脱敏机器可读清单绑定 commit、Release、交易与测试结果。

**Tech Stack:** Vitest、Playwright、Miniflare、Wrangler、Base Sepolia/Mainnet、MetaMask、Codex、Claude Code、shell/JSON evidence tooling。

## Global Constraints

- 默认 CI 绝不广播交易；Sepolia/Mainnet 都需显式 flag，Mainnet 还需交互确认。
- evidence 不含 secrets、Payment Payload、完整输入/结果、钱包私钥或助记词。
- Mainnet 每个 Agent 只执行一次 `0.01` USDC；使用独立小额钱包并人工核对 payee。
- 任何 Gate 失败均不得标记发布完成。

---

### Task 1: Build deterministic testkit and fault injection

**Files:** Create `packages/testkit/src/{fixtures,fake-facilitator,fake-chain,fake-wallet,fake-providers,faults}.ts`, contract tests.

- [x] 写 fixture contract tests，固定 Release/Quote/Payload/Status/Receipt 的 schema 与签名；fake payload 明确标记非真实凭证。
- [x] 覆盖 verify reject、settle timeout/revert/success、AuthorizationUsed found/missing、Queue duplicate、R2/D1 failure、wallet refusal/wrong chain/insufficient funds。
- [x] 运行 testkit tests；预期 exports 缺失失败。
- [x] 实现可注入时钟/nonce/Invocation ID，禁止测试依赖 wall clock 或随机 flaky timing。
- [ ] 提交：`git commit -m "testkit: add deterministic payment fault injection"`。

### Task 2: Automate the twelve acceptance scenarios

**Files:** Create `tests/e2e/scenarios/{happy-path,data-rejected,wallet-rejected,wrong-network,insufficient-balance,quote-expired,concurrent-submit,input-mismatch,handler-timeout,policy-failed,settle-recovery,cli-resume}.test.ts`, runner and report schema.

- [ ] 每个场景先声明预期 final status、ChargeState、execution count、settle count、transfer count、result visibility。
- [ ] 以 testkit 运行全部场景；在实现前预期至少一个断言失败以验证 runner 会阻断。
- [ ] 修正 test harness/产品缺陷，禁止降低断言；生成 `artifacts/e2e-simulated.json`。
- [ ] 运行 `pnpm vitest run tests/e2e/scenarios --reporter=verbose`；预期 12 files passed。
- [ ] 提交：`git commit -m "test(e2e): cover the twelve paid invocation scenarios"`。

### Task 3: Run security, retention and dual-agent installation gates

**Files:** Create `tests/security/{package-tamper,release-conflict,bridge-csrf,secret-scan,log-leak,bundle-scan}.test.ts`, `tests/integration/dual-agent-install.test.ts`, reports.

- [ ] 篡改 Package/Release 后验证安装目录零写入；Bridge 重放/CSRF/remote host 全拒绝。
- [ ] 扫描 source、bundle、fixtures、logs、evidence，拒绝 key、seed、Payment Payload、完整输入标记。
- [ ] 在隔离 HOME 一条命令安装，分别从 Codex 与 Claude Code adapter 调用同一 fake Runtime，并断言共享 Client inode/path 相同。
- [ ] 运行 `pnpm vitest run tests/security tests/integration/dual-agent-install.test.ts`；预期全部通过。
- [ ] 提交：`git commit -m "test(security): gate package bridge logs and dual-agent install"`。

### Task 4: Execute the Base Sepolia release gate

**Files:** Create `scripts/e2e-sepolia.sh`, `tests/e2e/sepolia.test.ts`, `docs/acceptance/m7-sepolia.md`, evidence JSON.

- [ ] 脚本预检 `AGENTPAY_E2E_SEPOLIA=1`、CDP credentials、Cloudflare deployment、test wallet、payee、USDC balance 与 Release network。
- [ ] 在 Base Sepolia 对正常、并发提交、Handler failure、Policy failure、settle timeout/recovery、CLI resume 六个链上关键场景执行；其余 UI/本地失败使用真实 Bridge + mock provider。
- [ ] 对每个付费场景核对 tx receipt、USDC Transfer/AuthorizationUsed、Receipt、用户支出与 payee 增量；零收费场景核对 transfer count=0。
- [ ] 命令：`AGENTPAY_E2E_SEPOLIA=1 bash scripts/e2e-sepolia.sh`；预期 report `passed=12 failed=0`。
- [ ] 提交脱敏 evidence，不提交环境文件：`git commit -m "test: pass AgentPayKit Base Sepolia gate"`。

### Task 5: Perform controlled Mainnet acceptance with both agents

**Files:** Create `scripts/mainnet-preflight.sh`, `docs/runbooks/mainnet-acceptance.md`, `docs/acceptance/m7-mainnet.json`.

- [ ] Preflight 验证 commit 已签/标记、全套 CI/Sepolia Gate、mainnet Release signature/network/payee/price=`0.01`、独立钱包余额与预算上限=`0.02` USDC。
- [ ] 设置 `AGENTPAY_E2E_MAINNET=1` 后先由 Codex 入口调用一次，再由 Claude Code 入口调用一次；每次 MetaMask 显示的 payee/network/amount 必须人工匹配 Release。
- [ ] 使用各自 `INVOCATION_ID` 执行 `agentpay status "$INVOCATION_ID" --json`、`agentpay resume "$INVOCATION_ID" --json`、`agentpay receipts --json`。
- [ ] 核对两笔各 `0.01` USDC、不同 Invocation ID、各执行/结算一次、Receipt/txHash/payee balance 一致。
- [ ] evidence 只保存 commit、Release ID、Invocation ID、txHash、amount、network、时间、结果 digest 与通过状态。
- [ ] 提交：`git commit -m "test: record dual-agent Base Mainnet acceptance"`。

### Task 6: Run third-party 30-minute install and final release gate

**Files:** Create `docs/acceptance/third-party-script.md`, `docs/acceptance/mvp-dod.md`, `artifacts/release-evidence.json`, release checklist.

- [ ] 由未参与开发的 macOS 测试者仅使用发布文档，在 30 分钟内完成安装、doctor、Codex 调用、Claude Code 调用、status/resume 与卸载；记录耗时和阻塞点。
- [ ] 对 PRD DoD 逐项绑定自动测试名或脱敏 evidence 字段；无证据项保持 unchecked 并阻断 release。
- [ ] 运行最终命令：`pnpm install --frozen-lockfile && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`。
- [ ] 运行 `git status --short`，确认仅保留明确计划纳入的 evidence；生成不可变 release tag 候选。
- [ ] 请求独立代码审查与安全审查，解决全部 blocking findings 后重新跑 Gate。
- [ ] 提交：`git commit -m "docs: complete AgentPayKit MVP release evidence"`。

## M7 Definition of Done

- [ ] 12 个场景模拟与 Sepolia 报告均 `failed=0`。
- [ ] 安全、secret、log、bundle 扫描泄露数为零。
- [ ] Codex 与 Claude Code 各完成一笔 Mainnet `0.01` USDC 调用。
- [ ] 同一 Invocation 从未重复执行、签名或结算；unknown settlement 可恢复。
- [ ] 第三方在 30 分钟内完成双 Agent 安装与调用。
- [ ] PRD 每个 DoD 都有测试或 evidence，最终六条全局验证命令退出码为 `0`。
