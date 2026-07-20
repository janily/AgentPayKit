# Base Sepolia 真实环境验证指南

本文用于在真实 Base Sepolia 环境执行 AgentPayKit M7 Gate，并生成可供后续 Mainnet 预检使用的脱敏证据。它不包含 Base Mainnet 支付、发布 Tag 或第三方 30 分钟验收。

## 1. 先确认风险和预期花费

设置 `AGENTPAY_E2E_SEPOLIA=1` 后，操作者提供的 E2E Driver 可以签名并广播测试网交易。完整通过时，以下四个场景各结算一次 `10000` atomic USDC，也就是 `0.01` USDC：

- `happy-path`
- `concurrent-submit`
- `settle-recovery`
- `cli-resume`

预期总支出和 payee 总增量均为 `40000` atomic USDC，即 `0.04` USDC，另需少量 Base Sepolia ETH 支付 gas。建议使用专用、低价值、可随时停用的测试钱包，准备略高于 `0.04` 的测试 USDC，例如 `0.05`，并保留足够的测试网 ETH。

遇到以下任一情况都应停止，不要启用 Gate：

- Release 不是 `testnet`，或网络不是 `eip155:84532`。
- Release 金额不是 `10000`。
- Release 中的 USDC、payee、Runtime URL 或 Runtime key 与部署值不一致。
- Runtime 不是 HTTPS，或无法正常返回签名状态。
- 测试钱包、payee、USDC 地址不是合法的 `0x` 加 40 位十六进制字符地址（20 字节）。
- 工作区不干净，或者尚未确定哪个提交将作为受测提交。
- Driver 会输出私钥、助记词、CDP secret、Payment Payload、完整输入或完整结果。

Sepolia Gate 通过后，Mainnet、双 Agent 人工确认、第三方验收和签名发布仍然保持阻塞。

## 2. 仓库当前提供什么

仓库已经提供：

- Gate 入口：[scripts/e2e-sepolia.sh](../../scripts/e2e-sepolia.sh)
- 12 场景验证与证据生成：[tests/e2e/sepolia.test.ts](../../tests/e2e/sepolia.test.ts)
- 场景期望值：[tests/e2e/scenarios/runner.ts](../../tests/e2e/scenarios/runner.ts)
- 后续 Mainnet 证据校验器：[scripts/mainnet-evidence.mjs](../../scripts/mainnet-evidence.mjs)

仓库没有提供生产钱包签名 Driver。操作者必须自行提供 `SEPOLIA_E2E_DRIVER`，负责连接真实 Runtime、Bridge/provider 和隔离钱包。不要把真实私钥直接补进仓库示例或测试文件。

## 3. 准备真实环境

开始前应具备：

1. 已部署并可通过 HTTPS 访问的 testnet Runtime。
2. 与该 Runtime 一致的签名 testnet Release JSON。
3. 可访问 Base Sepolia 的 RPC URL。
4. Release 指定的 Base Sepolia USDC 合约地址和 payee。
5. 已注入 Runtime/Facilitator 所需 secret 的 Cloudflare 部署。
6. 可用的 CDP API key。
7. 专用 Base Sepolia 钱包及 Driver 使用的安全 signer。
8. 本地绝对路径或仓库相对路径形式的 E2E Driver 模块。

### 3.1 十个必需环境变量

| 变量                     | 用途与要求                                                            |
| ------------------------ | --------------------------------------------------------------------- |
| `CDP_API_KEY_ID`         | CDP API key ID。Driver 可读取，但不得写入 evidence。                  |
| `CDP_API_KEY_SECRET`     | CDP secret。测试会以单独的 `secret` 参数交给 Driver；不得记录或返回。 |
| `CLOUDFLARE_ACCOUNT_ID`  | 已部署 Runtime 所属的 Cloudflare account ID。                         |
| `SEPOLIA_E2E_DRIVER`     | 导出 `run(input)` 的 ESM 模块路径；文件必须存在。                     |
| `SEPOLIA_PAYEE_ADDRESS`  | Release 绑定的 Base Sepolia 收款地址。                                |
| `SEPOLIA_RELEASE_FILE`   | 已签名 testnet Release JSON 路径；文件必须存在。                      |
| `SEPOLIA_RPC_URL`        | Base Sepolia JSON-RPC HTTPS URL。                                     |
| `SEPOLIA_RUNTIME_URL`    | 已部署 Runtime 的 HTTPS 根 URL。                                      |
| `SEPOLIA_USDC_ADDRESS`   | Release 绑定的 Base Sepolia USDC 合约地址。                           |
| `SEPOLIA_WALLET_ADDRESS` | Driver 实际使用的隔离付款钱包地址。                                   |

先在当前 zsh 会话交互读取非秘密值，避免误用文档中的示例地址：

```zsh
read -r "CLOUDFLARE_ACCOUNT_ID?Cloudflare Account ID: "
read -r "SEPOLIA_E2E_DRIVER?E2E Driver path: "
read -r "SEPOLIA_PAYEE_ADDRESS?Base Sepolia payee address: "
read -r "SEPOLIA_RELEASE_FILE?Signed testnet Release path: "
read -r "SEPOLIA_RPC_URL?Base Sepolia RPC URL: "
read -r "SEPOLIA_RUNTIME_URL?Deployed Runtime URL: "
read -r "SEPOLIA_USDC_ADDRESS?Base Sepolia USDC address: "
read -r "SEPOLIA_WALLET_ADDRESS?Isolated wallet address: "
export CLOUDFLARE_ACCOUNT_ID SEPOLIA_E2E_DRIVER SEPOLIA_PAYEE_ADDRESS
export SEPOLIA_RELEASE_FILE SEPOLIA_RPC_URL SEPOLIA_RUNTIME_URL
export SEPOLIA_USDC_ADDRESS SEPOLIA_WALLET_ADDRESS
```

不要把 secret 直接写进命令历史。可在当前 zsh 会话交互读取 CDP 凭据：

```zsh
read -r "CDP_API_KEY_ID?CDP API Key ID: "
read -rs "CDP_API_KEY_SECRET?CDP API Key Secret: "
echo
export CDP_API_KEY_ID CDP_API_KEY_SECRET
```

Driver 所需的钱包 signer 应通过硬件钱包、系统 Keychain、受控签名服务或 Driver 自己的临时安全输入获得。它不是上述十个公共 Gate 变量之一，也不得由 Driver 返回。

### 3.2 检查变量是否齐全，但不要打印值

```zsh
required=(
  CDP_API_KEY_ID
  CDP_API_KEY_SECRET
  CLOUDFLARE_ACCOUNT_ID
  SEPOLIA_E2E_DRIVER
  SEPOLIA_PAYEE_ADDRESS
  SEPOLIA_RELEASE_FILE
  SEPOLIA_RPC_URL
  SEPOLIA_RUNTIME_URL
  SEPOLIA_USDC_ADDRESS
  SEPOLIA_WALLET_ADDRESS
)

for name in "${required[@]}"; do
  if [[ -n "${(P)name:-}" ]]; then
    print -- "$name=SET"
  else
    print -- "$name=MISSING"
  fi
done
```

所有项目都应显示 `SET`。不要运行不带过滤的 `env`、`export -p` 或 shell trace；它们可能把 secret 写进终端记录。

## 4. 无广播预检

以下步骤不会启用 Driver，不应签名或广播交易。

### 4.1 固定受测提交

```bash
node --version
pnpm --version
git branch --show-current
git status --short
git rev-parse HEAD
```

预期：

- Node major 为 `22`。
- pnpm 为 `9.15.9`。
- 位于预期分支。
- `git status --short` 无输出。
- 保存 `git rev-parse HEAD` 的 40 位小写提交号；成功报告会把它写入 `commit`。

如果后续修改了源码、测试、脚本或 Release 生成逻辑，应重新建立干净提交并重新执行 Gate。不要把旧交易证据绑定到新代码。

### 4.2 安装、验证和构建

```bash
pnpm install --frozen-lockfile
pnpm verify
```

`pnpm verify` 必须完成格式、lint、类型检查、本地测试和构建。两个真实链路测试在未设置 opt-in flag 时显示 skip 是预期行为。

### 4.3 离线验证 Release

CLI 构建完成后，用临时 Client 目录执行 Release 验签：

```bash
preflight_home="$(mktemp -d)"
AGENTPAYKIT_HOME="$preflight_home" \
  node packages/cli/dist/index.js release verify \
  --environment testnet \
  --release "$SEPOLIA_RELEASE_FILE" \
  --json
rm -r "$preflight_home"
```

验签结果必须成功。然后只查看需要人工核对的 Release 字段：

```bash
jq '(.payload // .) | {
  releaseId,
  environment,
  network,
  amount,
  asset,
  payee,
  runtimeKeyId: .runtimeDelegation.payload.runtimeKeyId,
  runtimePublicKey: .runtimeDelegation.payload.runtimePublicKey,
  runtimeUrl: .runtimeDelegation.payload.runtimeUrl
}' "$SEPOLIA_RELEASE_FILE"
```

必须确认：

- `environment` 为 `testnet`。
- `network` 为 `eip155:84532`。
- `amount` 为字符串 `10000`。
- `asset` 等于 `SEPOLIA_USDC_ADDRESS`，忽略地址大小写。
- `payee` 等于 `SEPOLIA_PAYEE_ADDRESS`，忽略地址大小写。
- `runtimeUrl` 与 `SEPOLIA_RUNTIME_URL` 完全一致。
- `releaseId` 符合 `rel_` 加 64 位小写十六进制字符的格式。
- Runtime delegation 中存在预期的 key ID 和 Ed25519 public key。

### 4.4 检查 Runtime 与 RPC

先检查 Runtime HTTPS 连通性；具体健康路径应以本次部署配置为准：

```bash
curl --fail --silent --show-error "$SEPOLIA_RUNTIME_URL/health" | jq .
```

检查 RPC chain ID：

```bash
curl --fail --silent --show-error \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
  "$SEPOLIA_RPC_URL" | jq .
```

Base Sepolia 的 chain ID 应返回十六进制 `0x14a34`，即十进制 `84532`。不要只依赖钱包 UI 中显示的网络名称。

## 5. 准备 E2E Driver

`SEPOLIA_E2E_DRIVER` 指向的 ESM 模块必须导出一个异步 `run(input)` 函数。以下代码只描述接口，不是可运行的钱包实现：

```ts
type ScenarioName =
  | "happy-path"
  | "data-rejected"
  | "wallet-rejected"
  | "wrong-network"
  | "insufficient-balance"
  | "quote-expired"
  | "concurrent-submit"
  | "input-mismatch"
  | "handler-timeout"
  | "policy-failed"
  | "settle-recovery"
  | "cli-resume";

interface ScenarioOutcome {
  finalStatus: string;
  chargeState: string;
  executionCount: number;
  settleCount: number;
  transferCount: number;
  resultVisible: boolean;
}

interface ScenarioEvidence {
  name: ScenarioName;
  mode: "chain" | "bridge";
  actual: ScenarioOutcome;
  invocationId?: string;
  transactionHash?: string;
}

interface DriverInput {
  environment: {
    CDP_API_KEY_ID: string;
    CLOUDFLARE_ACCOUNT_ID: string;
    SEPOLIA_E2E_DRIVER: string;
    SEPOLIA_PAYEE_ADDRESS: string;
    SEPOLIA_RELEASE_FILE: string;
    SEPOLIA_RPC_URL: string;
    SEPOLIA_RUNTIME_URL: string;
    SEPOLIA_USDC_ADDRESS: string;
    SEPOLIA_WALLET_ADDRESS: string;
  };
  secret: string;
}

export function run(input: DriverInput): Promise<ScenarioEvidence[]>;
```

Driver 必须：

- 恰好返回 12 条记录，每个场景名出现一次。
- 为六个 `chain` 场景使用真实部署的 Runtime。
- 为六个 `bridge` 场景使用真实 Browser Bridge 逻辑和受控 mock provider。
- 为每个 `chain` 场景返回唯一且格式合法的 `invocationId`。
- 只为预期收费的四个场景返回链上 `transactionHash`。
- 对并发提交复用同一个 Invocation，不创建两个独立支付。
- 对 settlement recovery 查询同一 Invocation 的链上状态，不重新签署第二笔付款。
- 不把 `secret` 放入返回值、Error、console、HTTP 日志或本地文件。
- 不打印 Payment Payload、完整输入、完整结果、私钥或助记词。

### 5.1 十二场景期望矩阵

| 场景                   | 模式   | 最终状态             | 收费状态      | 执行 | 结算 | 转账 | 结果可见 |
| ---------------------- | ------ | -------------------- | ------------- | ---: | ---: | ---: | -------- |
| `happy-path`           | chain  | `RESULT_AVAILABLE`   | `CHARGED`     |    1 |    1 |    1 | 是       |
| `data-rejected`        | bridge | `FAILED_NOT_CHARGED` | `NOT_CHARGED` |    0 |    0 |    0 | 否       |
| `wallet-rejected`      | bridge | `QUOTED`             | `NOT_CHARGED` |    0 |    0 |    0 | 否       |
| `wrong-network`        | bridge | `QUOTED`             | `NOT_CHARGED` |    0 |    0 |    0 | 否       |
| `insufficient-balance` | bridge | `QUOTED`             | `NOT_CHARGED` |    0 |    0 |    0 | 否       |
| `quote-expired`        | bridge | `QUOTED`             | `NOT_CHARGED` |    0 |    0 |    0 | 否       |
| `concurrent-submit`    | chain  | `RESULT_AVAILABLE`   | `CHARGED`     |    1 |    1 |    1 | 是       |
| `input-mismatch`       | bridge | `QUOTED`             | `NOT_CHARGED` |    0 |    0 |    0 | 否       |
| `handler-timeout`      | chain  | `FAILED_NOT_CHARGED` | `NOT_CHARGED` |    1 |    0 |    0 | 否       |
| `policy-failed`        | chain  | `POLICY_REJECTED`    | `NOT_CHARGED` |    1 |    0 |    0 | 否       |
| `settle-recovery`      | chain  | `RESULT_AVAILABLE`   | `CHARGED`     |    1 |    1 |    1 | 是       |
| `cli-resume`           | chain  | `RESULT_AVAILABLE`   | `CHARGED`     |    1 |    1 |    1 | 是       |

Gate 会再次从 Runtime、RPC 和签名证据推导 chain 场景的最终结果，不会只相信 Driver 声明的 `actual`。

## 6. 广播前最后核对

在同一终端逐项确认：

- 当前 `HEAD` 仍是第 4.1 节记录的提交。
- `git status --short` 仍无输出。
- Release 已离线验签成功。
- Release、环境变量与已部署 Runtime 的 network、amount、asset、payee、URL、key 全部一致。
- RPC 返回 Base Sepolia chain ID `0x14a34`。
- 钱包拥有至少 `0.04` 测试 USDC，建议准备 `0.05`，并有测试网 ETH。
- Driver 使用的是该钱包对应的安全 signer。
- Driver 已禁用敏感日志和 shell trace。
- 当前没有另一个相同 Gate 或相同钱包的并发执行。

任何一项不确定都应停止。

## 7. 执行真实 Gate

从仓库根目录运行：

```bash
AGENTPAY_E2E_SEPOLIA=1 bash scripts/e2e-sepolia.sh
```

脚本会依次：

1. 检查显式 opt-in flag 和十个环境变量。
2. 检查 Release 文件和 Driver 文件存在。
3. 在临时 Client home 中离线验证 testnet Release。
4. 启动 `tests/e2e/sepolia.test.ts`。
5. 读取运行前钱包和 payee 的 USDC 余额。
6. 调用 Driver 执行 12 个场景。
7. 通过 Runtime 签名状态、结果和 Receipt，以及 RPC receipt/log 独立复核 Driver 输出。
8. 核对运行后余额。
9. 仅在全部断言通过时写入 `artifacts/e2e-sepolia.json`，权限为 `0600`。

测试超时上限为 10 分钟。命令失败或报告文件不存在，不代表没有广播交易。

## 8. 验收生成的证据

### 8.1 检查报告摘要

```bash
jq '{
  schemaVersion,
  capturedAt,
  commit,
  network,
  releaseId,
  passed,
  failed,
  walletSpendDelta,
  payeeBalanceDelta
}' artifacts/e2e-sepolia.json
```

预期：

- `schemaVersion` 为 `1`。
- `commit` 等于受测 `HEAD`。
- `network` 为 `eip155:84532`。
- `releaseId` 等于已验签 Release。
- `passed` 为 `12`，`failed` 为 `0`。
- `walletSpendDelta` 和 `payeeBalanceDelta` 都是字符串 `40000`。

### 8.2 检查所有场景

```bash
jq -r '.scenarios[] |
  [.name, .mode, .finalStatus, .chargeState, (.transactionHash // "-")] |
  @tsv' artifacts/e2e-sepolia.json
```

输出必须与第 5.1 节矩阵一致。

检查唯一性和零收费证据：

```bash
jq '{
  chainCount: ([.scenarios[] | select(.mode == "chain")] | length),
  uniqueInvocationIds: ([.scenarios[] | select(.mode == "chain") | .invocationId] | unique | length),
  chargedCount: ([.scenarios[] | select(.outcome.transferCount == 1)] | length),
  uniqueTransactions: ([.scenarios[] | select(.outcome.transferCount == 1) | .transactionHash | ascii_downcase] | unique | length),
  zeroChargeWithEvidence: ([.scenarios[] |
    select(.outcome.transferCount == 0 and
      (.transactionHash != null or .receiptDigest != null))] | length)
}' artifacts/e2e-sepolia.json
```

预期：

```json
{
  "chainCount": 6,
  "uniqueInvocationIds": 6,
  "chargedCount": 4,
  "uniqueTransactions": 4,
  "zeroChargeWithEvidence": 0
}
```

### 8.3 运行仓库证据校验器

```bash
node --input-type=module -e '
import { readFile } from "node:fs/promises";
import { validateSepoliaEvidence } from "./scripts/mainnet-evidence.mjs";
const report = JSON.parse(await readFile("artifacts/e2e-sepolia.json", "utf8"));
validateSepoliaEvidence(report);
console.log("Sepolia evidence valid");
'
```

预期输出：

```text
Sepolia evidence valid
```

### 8.4 Gate 已自动验证的链上与签名证据

对每个收费场景，测试已经验证：

- tx receipt 状态为成功。
- USDC 日志包含 payee 收到 `10000` 的 `Transfer`。
- USDC 日志包含 `AuthorizationUsed`。
- txHash 和 Receipt digest 在四个场景中唯一。
- Runtime Receipt 绑定相同的 Invocation ID、txHash、amount、payee 和 network。
- Runtime status、result 和 Receipt 使用 Release delegation 中的 Ed25519 key 正确签名。

对零收费场景，测试已经验证没有 transactionHash 或 Receipt digest。不要用区块浏览器截图替代结构化 RPC 和签名证据。

## 9. 失败时如何处理

### 9.1 Driver 调用前失败

缺少变量、Release/Driver 文件不存在、Release 验签失败、地址格式错误、Runtime URL 非 HTTPS、初始余额不足等错误会在 Driver 执行前失败。修正后可以重新运行，但仍应确认钱包没有新交易。

### 9.2 Driver 调用后失败

一旦 Driver 已开始运行，测试失败、超时或终端断开都不能证明没有签名或结算。不要立刻重跑。

先做以下检查：

1. 收集 Driver 已返回或安全日志中保留的 Invocation ID 和 txHash，不收集 Payment Payload。
2. 对每个 Invocation 查询 Runtime 的 status、result 和 receipt endpoint。
3. 对每个 txHash 调用 `eth_getTransactionReceipt`，确认成功、失败或仍 pending。
4. 查询 USDC `AuthorizationUsed` 和 `Transfer` 日志。
5. 重新读取钱包与 payee 的 USDC 余额。
6. 特别检查 `settle-recovery` 和 `cli-resume` 是否已经结算。

只有确认旧 Invocation 不会再执行、签名或结算后，才能用全新的 Invocation ID 和支付授权重跑对应场景。不要复用旧 Payment Payload，也不要为 settlement unknown 手工再发一笔付款。

### 9.3 报告存在但校验失败

不要手工修改 txHash、余额增量、场景结果或签名 digest 来“修复”报告。报告与链上状态不一致时应保留原始文件到仓库外的受控位置，调查 Runtime/Driver，然后从干净候选提交重新执行 Gate。

## 10. 脱敏、回填与提交

成功后先确认报告没有以下内容：

- CDP secret、钱包私钥或助记词。
- Payment Payload 或签名原文。
- 完整业务输入或结果正文。
- RPC provider credential。
- 未经允许的钱包身份信息。

更新 [docs/acceptance/m7-sepolia.md](../acceptance/m7-sepolia.md)，记录：

- 状态为通过。
- 受测 commit。
- Release ID。
- Runtime deployment 的非秘密标识。
- `passed=12`、`failed=0`。
- `Credential material stored: no`。

同时更新 `artifacts/release-evidence.json`：

- `candidateCommit` 指向报告中的受测 commit。
- `external.sepolia.passed` 改为 `true`。
- 删除仅表示 Sepolia 尚未执行的 blocking reason。
- 保留 Mainnet、第三方验收和签名发布的阻塞状态。
- `releaseStatus` 仍为 `not_ready`。

从 Gate 成功到 evidence commit 之间，只允许修改：

- `artifacts/e2e-sepolia.json`
- `artifacts/release-evidence.json`
- `docs/acceptance/m7-sepolia.md`

先检查变化：

```bash
git status --short
git diff --check
git diff -- artifacts/e2e-sepolia.json artifacts/release-evidence.json docs/acceptance/m7-sepolia.md
```

确认没有其他文件后提交：

```bash
git add artifacts/e2e-sepolia.json artifacts/release-evidence.json docs/acceptance/m7-sepolia.md
git commit -m "test: pass AgentPayKit Base Sepolia gate"
```

不要在这个 evidence commit 中夹带源码、脚本、测试、依赖或 Release 变更。后续 Mainnet preflight 会验证受测 commit 是候选提交的祖先，并拒绝 Sepolia Gate 之后的非 evidence 变更。

## 11. 清理当前 shell

提交脱敏证据后，从当前 shell 删除凭据：

```zsh
unset CDP_API_KEY_ID CDP_API_KEY_SECRET CLOUDFLARE_ACCOUNT_ID
unset SEPOLIA_E2E_DRIVER SEPOLIA_PAYEE_ADDRESS SEPOLIA_RELEASE_FILE
unset SEPOLIA_RPC_URL SEPOLIA_RUNTIME_URL SEPOLIA_USDC_ADDRESS
unset SEPOLIA_WALLET_ADDRESS AGENTPAY_E2E_SEPOLIA
```

关闭终端，按组织策略撤销临时 CDP 凭据、Signer 授权或测试部署访问权。保留链上公开交易和脱敏 evidence，不保留钱包密钥、Payment Payload、输入或结果正文。
