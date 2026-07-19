# M1 Prune Legacy PayBot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 PayBot 原型支付核心与机器人业务，同时把可复用钱包 UI 收敛为 Browser Bridge 骨架。

**Architecture:** 先以 characterization tests 固定保留组件，再显式删除 contracts、自建 facilitator、自定义 x402 与 robot；仓库始终保持可构建。

**Tech Stack:** React、wagmi、viem、Vitest、Testing Library、pnpm/Turborepo。

## Global Constraints

- 删除代码由 Git 历史追溯，不创建可构建的 `legacy/` 副本。
- M1 结束时尚未接入官方 x402，不伪造支付成功路径。
- Browser Bridge 不得展示完整业务输入，也不得保留 Robot 控制语义。

---

### Task 1: Characterize and rename the retained web shell

**Files:** Move `apps/web` to `packages/browser-bridge`; modify its package metadata; create `packages/browser-bridge/src/components/payment/PaymentModal.test.tsx` and `src/App.test.tsx`.

- [ ] 测试固定四项 UI：金额、payee、network、拒绝按钮；并断言不渲染传入的 `rawInput`。
- [ ] 运行 `pnpm --filter @agentpaykit/browser-bridge test`；预期因包名/测试接口不存在失败。
- [ ] 使用 `git mv apps/web packages/browser-bridge`，将组件 props 收敛为 `{ amount, payee, network, inputDigest, onApprove, onReject }`。
- [ ] 删除 Webcam、Robot、Countdown 与 gate 组件；保留 Button/Card 与 payment 组件骨架。
- [ ] 运行包级 test/typecheck/build；预期全部成功。
- [ ] 提交：`git commit -m "refactor: retain PayBot wallet UI as browser bridge shell"`。

### Task 2: Remove custom payment and contract production paths

**Files:** Delete `apps/x402-facilitator`, `packages/contracts`, `packages/x402`, `docker-compose.yml`; modify root workspace/scripts; replace `e2e-test.sh` with a non-paying build smoke test.

- [ ] 创建 `tests/security/no-legacy-paybot.test.ts`，递归扫描 production manifests/source，拒绝 `QUSDToken`、`Escrow.sol`、`hardhat`、`evm-permit`、`X-PAYMENT`、`x402CheckOnly`。
- [ ] 运行该测试；预期至少命中旧实现并失败。
- [ ] 用显式 `git rm` 删除上述目录和文件，清除根 scripts、workspace dependency 与 ABI import。
- [ ] 新 smoke script 仅执行 workspace build 与 Browser Bridge 组件测试，不报告链上闭环成功。
- [ ] 运行 `pnpm test && pnpm build && bash e2e-test.sh`；预期退出码均为 `0`。
- [ ] 提交：`git commit -m "refactor: remove PayBot custom payment stack"`。

核心扫描规则：

```ts
const forbidden = [
  /QUSDToken/,
  /Escrow\.sol/,
  /hardhat/i,
  /evm-permit/,
  /X-PAYMENT/,
  /x402CheckOnly/,
];
expect(matches).toEqual([]);
```

### Task 3: Establish empty AgentPayKit package boundaries

**Files:** Create package manifests and `src/index.ts` for `protocol`, `payment`, `runtime`, `client`, `cli`, `publisher`, `installer`, `observability`, `testkit`; create `apps/runtime/package.json`; modify `pnpm-workspace.yaml` and `turbo.json`.

- [ ] 添加 repository test，断言十个目标 workspace 名称唯一且依赖图无环。
- [ ] 运行测试；预期因包缺失失败。
- [ ] 每个入口仅导出 `PACKAGE_BOUNDARY` 常量，不添加模拟支付逻辑；全部启用 TypeScript strict 与 ESM。
- [ ] 运行 `pnpm install && pnpm typecheck && pnpm build`；预期每个包均进入 Turbo graph 并成功。
- [ ] 提交：`git commit -m "build: establish AgentPayKit package boundaries"`。

## M1 Definition of Done

- [ ] `pnpm test && pnpm build` 成功。
- [ ] `pnpm why hardhat`、`pnpm why ethers` 不返回生产依赖。
- [ ] `rg -n 'QUSD|Escrow|evm-permit|X-PAYMENT|x402CheckOnly' apps packages --glob '!**/*.test.*'` 无匹配。
- [ ] Browser Bridge characterization tests 通过，完整输入不进入 DOM。
- [ ] 仓库中不存在自建 Facilitator 服务或合约部署脚本。
