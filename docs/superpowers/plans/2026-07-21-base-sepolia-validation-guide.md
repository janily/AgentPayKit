# Base Sepolia 中文验证指南实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `docs/runbooks/base-sepolia-validation.md` 生成一份可由真实环境操作者独立执行的中文 Base Sepolia 验证指南。

**Architecture:** 指南按“无广播准备 → 真实环境交叉核对 → 显式启用 Gate → 链上和签名证据验收 → 保守重跑与脱敏提交”组织。指南只调用仓库已有脚本和测试，不新增钱包签名实现，也不覆盖 Base Mainnet 或第三方验收。

**Tech Stack:** Markdown、Bash、当前稳定版 Node.js 和 pnpm、Vitest、Cloudflare Workers、CDP Facilitator、Base Sepolia JSON-RPC。

## Global Constraints

- 网络必须是 `eip155:84532`，单次价格必须是 `10000` atomic USDC。
- 真实 Gate 需要操作者自备 `SEPOLIA_E2E_DRIVER`；仓库不包含生产钱包签名 Driver。
- 私钥、助记词、CDP secret、Payment Payload、完整输入和结果不得进入仓库、命令行参数、日志或 evidence。
- 设置 `AGENTPAY_E2E_SEPOLIA=1` 后，Driver 可以签名并广播交易。
- Release ID、Runtime URL/key、USDC、payee、网络或金额任一不一致时立即停止。
- settlement unknown 或超时时，重跑前必须查询 Invocation 和链上交易状态。
- Sepolia 通过不等于可以发布 Mainnet Release。

---

### Task 1: 编写分阶段 Base Sepolia Runbook

**Files:**

- Create: `docs/runbooks/base-sepolia-validation.md`
- Reference: `scripts/e2e-sepolia.sh`
- Reference: `tests/e2e/sepolia.test.ts`
- Reference: `tests/e2e/scenarios/runner.ts`
- Reference: `scripts/mainnet-evidence.mjs`
- Reference: `docs/acceptance/m7-sepolia.md`

**Interfaces:**

- Consumes: `SEPOLIA_E2E_DRIVER` 的 `run({ environment, secret })` 接口，以及现有十个必需环境变量。
- Produces: 一份中文 Runbook，指导操作者生成并验收 `artifacts/e2e-sepolia.json`。

- [ ] **Step 1: 建立指南标题、范围和硬停止条件**

  明确指南只覆盖 M7 Base Sepolia，列出会产生四笔 `10000` atomic USDC 结算的预期、测试网 gas 要求、专用低价值钱包要求，以及不包含 Mainnet 的边界。

- [ ] **Step 2: 写入环境准备和十个变量说明**

  逐项解释 `CDP_API_KEY_ID`、`CDP_API_KEY_SECRET`、`CLOUDFLARE_ACCOUNT_ID`、`SEPOLIA_E2E_DRIVER`、`SEPOLIA_PAYEE_ADDRESS`、`SEPOLIA_RELEASE_FILE`、`SEPOLIA_RPC_URL`、`SEPOLIA_RUNTIME_URL`、`SEPOLIA_USDC_ADDRESS`、`SEPOLIA_WALLET_ADDRESS` 的来源、格式和安全存放方式。使用当前 shell 的安全导出示例，不写真实值。

- [ ] **Step 3: 写入无广播预检**

  指导操作者运行：

  ```bash
  node --version
  pnpm --version
  git status --short
  pnpm install --frozen-lockfile
  pnpm verify
  node packages/cli/dist/index.js release verify --environment testnet --release "$SEPOLIA_RELEASE_FILE" --json
  ```

  说明预期 Node major 为 22、pnpm 为 9.15.9、工作区为空、Release 为 testnet/Base Sepolia/`10000`，并强调这些命令本身不广播。

- [ ] **Step 4: 写入 Driver 接口和十二场景矩阵**

  给出不含签名实现的 ESM 接口骨架，列出六个 `chain` 场景与六个 `bridge` 场景。为每个场景写明最终状态、收费状态、执行/结算/转账次数和结果可见性；说明 Driver 不得返回 secret。

- [ ] **Step 5: 写入最终人工核对和 Gate 命令**

  要求操作者人工核对 Release 与环境的 network、amount、asset、payee、Runtime URL/key 和 Release ID，然后运行：

  ```bash
  AGENTPAY_E2E_SEPOLIA=1 bash scripts/e2e-sepolia.sh
  ```

  明确只有这一步启用真实签名/广播路径。

- [ ] **Step 6: 写入证据验收、失败处理和清理**

  说明报告必须 `passed=12`、`failed=0`，四个付费场景各有唯一 txHash、Transfer、AuthorizationUsed 和签名 Receipt，余额双向增量均为 `40000`；零收费场景不能有交易证据。给出 `jq` 检查命令、重跑前核对规则、shell secret 清理方法和允许提交的 evidence 文件。

- [ ] **Step 7: 格式化指南**

  Run:

  ```bash
  pnpm exec prettier --write docs/runbooks/base-sepolia-validation.md
  ```

  Expected: Prettier completes without error and only formats the new Runbook.

### Task 2: 复核指南与仓库实现一致

**Files:**

- Verify: `docs/runbooks/base-sepolia-validation.md`
- Reference: `scripts/e2e-sepolia.sh`
- Reference: `tests/e2e/sepolia.test.ts`
- Reference: `scripts/mainnet-evidence.mjs`

**Interfaces:**

- Consumes: Task 1 生成的中文 Runbook。
- Produces: 通过格式、敏感信息、字段一致性和 Git 差异检查的最终文档。

- [ ] **Step 1: 检查十个环境变量是否完全一致**

  Run:

  ```bash
  rg -o '\b(CDP_API_KEY_ID|CDP_API_KEY_SECRET|CLOUDFLARE_ACCOUNT_ID|SEPOLIA_[A-Z0-9_]+)\b' scripts/e2e-sepolia.sh docs/runbooks/base-sepolia-validation.md | sort -u
  ```

  Expected: Runbook 覆盖脚本要求的全部十个变量，没有杜撰额外必需变量。

- [ ] **Step 2: 检查指南没有秘密或未完成占位符**

  Run:

  ```bash
  rg -n 'BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|mnemonic|seed phrase|TBD|TODO|FIXME' docs/runbooks/base-sepolia-validation.md
  ```

  Expected: no output.

- [ ] **Step 3: 检查格式和 Git 差异**

  Run:

  ```bash
  pnpm exec prettier --check docs/runbooks/base-sepolia-validation.md
  git diff --check
  git status --short
  ```

  Expected: Prettier and `git diff --check` exit `0`; status contains only the planned Runbook before commit.

- [ ] **Step 4: 提交最终指南**

  ```bash
  git add docs/runbooks/base-sepolia-validation.md
  git commit -m "docs: add Base Sepolia validation guide"
  ```
