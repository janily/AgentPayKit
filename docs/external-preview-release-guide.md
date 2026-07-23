# AgentPayKit v0.1.0-alpha.1 外部发布指引

这份指引覆盖需要你自己的账号、钱包、npm 发布权限、Vercel 项目、
GitHub 权限或真实 Agent 环境才能完成的任务。请在准备发布的确切
commit 上完成 `pnpm verify` 后，再执行下面步骤。

不要使用高价值钱包。不要在公开证据中记录私钥、助记词、QR URI、
钱包 session 标识、完整支付 payload 或完整支付签名。

## 1. 记录发布候选版本

1. 确认工作区只包含已经 review 过的发布变更：

   ```bash
   git status --short
   git rev-parse HEAD
   ```

2. 执行完整本地验证：

   ```bash
   pnpm verify
   ```

3. 在 release notes 草稿中记录 commit SHA、本地日期、Node.js 版本、
   pnpm 版本和 `pnpm verify` 结果。

## 2. 确认 npm 权限

1. 使用拥有 `@agentpaykit` scope 或具备该 scope 发布权限的 npm 账号登录：

   ```bash
   npm login
   npm whoami
   ```

2. 确认包名状态，避免覆盖已经存在的预发布版本：

   ```bash
   npm view @agentpaykit/server versions --json
   npm view @agentpaykit/cli versions --json
   npm view create-agentpay-skill versions --json
   ```

3. 如果任意包已经包含 `0.1.0-alpha.1`，立即停止。不要覆盖旧版本，改为递增到下一个 alpha 版本；npm 版本发布后不可变。

4. 确认该 npm 账号已经启用 2FA，或准备好符合 npm 当前 2FA/trusted publishing 要求的发布方式。

## 3. 发布 npm alpha 包

在仓库根目录最后执行一次 `pnpm verify`，通过后再发布。

1. 先发布 server 包：

   ```bash
   cd packages/server
   npm publish --tag alpha --access public
   ```

2. 再发布 CLI 包：

   ```bash
   cd ../cli
   npm publish --tag alpha --access public
   ```

3. 最后发布脚手架包：

   ```bash
   cd ../create-agentpay-skill
   npm publish --tag alpha
   ```

4. 回到仓库根目录并检查 dist-tag：

   ```bash
   cd ../..
   npm dist-tag ls @agentpaykit/server
   npm dist-tag ls @agentpaykit/cli
   npm dist-tag ls create-agentpay-skill
   ```

5. 确认 `alpha` 指向 `0.1.0-alpha.1`。确认 `latest` 没有被移动到这个预发布版本。

## 4. Registry smoke test

使用仓库外的新目录执行测试，确保不会解析到 workspace link。

```bash
mkdir -p /tmp/agentpaykit-alpha-smoke
cd /tmp/agentpaykit-alpha-smoke
npm init -y
npm install @agentpaykit/server@alpha @agentpaykit/cli@alpha
npx agentpay --help
pnpm create agentpay-skill@alpha smoke-skill
cd smoke-skill
pnpm install
pnpm verify
```

记录通过/失败状态，以及 npm 实际解析到的包版本。

## 5. 部署示例 Skill

使用一个专用的 Base Sepolia receiver 地址。这个地址可以公开，但不要持有有意义的资金。

1. 配置 `examples/paid-repo-review/agentpay.skill.ts`，确认包含：

   - `network: "base-sepolia"`；
   - 官方 Base Sepolia USDC asset；
   - 小额固定测试价格；
   - 你的专用 Base Sepolia receiver；
   - 计划使用的 facilitator URL。

2. 确认 Vercel 已登录：

   ```bash
   vercel whoami
   ```

3. 从示例目录部署：

   ```bash
   cd examples/paid-repo-review
   pnpm deploy
   ```

4. 记录部署后的 Endpoint、commit SHA、network、price、receiver、Vercel deployment URL 和部署时间。

5. 发起一次未签名请求，确认 Endpoint 返回 `402 Payment Required`，并且 quote 与本地配置一致。这个检查不应打开钱包。

## 6. 执行 Base Sepolia 真实证据验收

严格按照 [Base Sepolia MVP gate](runbooks/base-sepolia-mvp-gate.md) 执行。
至少完成并记录这些场景：

- 未付款首次请求返回 `402`，链上零转账；
- quote 高于 `--max-price` 时在打开钱包前退出，链上零转账；
- MetaMask 拒绝付款时返回稳定拒绝错误码，链上零转账；
- 一次人工确认成功后返回结构化 JSON，并且恰好一笔 USDC 转账；
- 业务失败返回结构化失败，链上零转账；
- 任何 `PAYMENT_STATE_UNKNOWN` 都必须停止执行，不得重试。

创建 `docs/acceptance/v0.1.0-alpha.1-base-sepolia.md`，记录：

- 日期和 UTC 时间；
- commit SHA；
- CLI 和 server 包版本；
- Endpoint；
- price、network 和脱敏 receiver；
- 预期结果；
- 实际结果；
- 脱敏证据链接或截图引用。

不要把 Base Mainnet 标记为这个 Developer Preview 的完成项。

## 7. 在 Agent 环境中安装

使用一个不包含本仓库源码的干净环境。

1. 安装已发布的 CLI：

   ```bash
   npm install --global @agentpaykit/cli@alpha
   agentpay doctor
   ```

2. 使用目标 Agent 支持的本地 Skill 机制安装示例 Skill。对于 Codex 风格的本地 Skill，把部署示例输出生成的 `SKILL.md` 复制到新的本地 skill 目录，并确认文件包含：

   - 确切的已部署 Endpoint；
   - `--max-price`；
   - 仅 Base Sepolia；
   - 人工确认付款提示；
   - 不得重试 `PAYMENT_STATE_UNKNOWN` 的说明。

3. 用自然语言触发该 Skill，并确认 Agent 在调用 `agentpay` 前说明可能产生 Base Sepolia 测试付款。

4. 测试这些 Agent 结果：

   - 正常成功；
   - `USER_REJECTED_PAYMENT` 或当前 CLI 使用的拒绝错误码；
   - `PRICE_EXCEEDS_LIMIT`；
   - `PAYMENT_STATE_UNKNOWN`。

5. Agent 不得在没有新一轮人工批准的情况下发起第二次付款。

记录安装路径、Agent 名称/版本、提示词、实际调用命令和脱敏输出。

## 8. 发布 GitHub Pre-release

完成 npm 发布、registry smoke test、示例部署、Base Sepolia gate 和 Agent 安装证据后：

1. 确认证据和文档都已经提交。
2. 从确切完成验证的 commit 创建 annotated tag：

   ```bash
   git tag -a v0.1.0-alpha.1 -m "v0.1.0-alpha.1 Developer Preview"
   git push origin v0.1.0-alpha.1
   ```

3. 创建 GitHub Pre-release，不要标记为最新稳定版。
4. 在 release notes 中包含 npm 安装命令、已部署示例 Endpoint、范围限制、安全提醒和反馈入口。
5. 发布后逐一点击 README、release notes、npm 包页面和证据链接，确认都能访问。

## 9. 停止条件

如果出现任一情况，立即停止，不要对外宣布该 preview 可用：

- 任意 npm 包无法从 registry 在全新目录安装；
- 脚手架生成的项目无法安装、验证或构建；
- 已部署 Endpoint 没有返回预期 Base Sepolia quote；
- 拒绝或失败路径产生了意外 USDC 转账；
- 成功路径产生零转账或多于一笔转账；
- CLI 返回 `PAYMENT_STATE_UNKNOWN`，且你无法独立确认链上状态；
- Agent 在没有新一轮人工确认的情况下重试付款。

触发停止条件后，把它记录为阻塞发布的问题。修复后发布后续 alpha 版本，不要覆盖已经发布的版本。
