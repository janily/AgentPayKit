# AgentPayKit Community Preview Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 发布一个可供社区开发者真实安装和测试的 `v0.1.0-alpha.1`，完成“创建付费 Skill → 部署 → 在 Agent 中安装 → Base Sepolia 人工确认付款 → 获得结构化结果”的最小闭环。

**Architecture:** 继续维持当前去中心化工具链边界：Publisher 自己部署 Skill Endpoint，Consumer 通过 CLI 校验报价并连接钱包，x402 Facilitator 负责验证和结算。首版只支持 Base Sepolia、固定 USDC 价格、同步 JSON 请求、人工确认付款，不扩展市场、订阅或自主钱包。

**Tech Stack:** TypeScript、pnpm workspace、npm registry、x402、Base Sepolia、USDC、MetaMask、Vercel、GitHub Actions。

## Global Constraints

- 发布名称固定为 `v0.1.0-alpha.1 — Developer Preview`。
- 当前承诺范围只包含 Base Sepolia，不宣传 Base Mainnet production-ready。
- 三个 npm 包分别为 `@agentpaykit/server`、`@agentpaykit/cli`、`create-agentpay-skill`。
- npm 预发布版本必须使用 `alpha` dist-tag，不能覆盖 `latest`。
- 每次真实支付必须由用户在钱包中确认。
- CLI 必须要求或强烈约束 `--max-price`，报价超限时不得连接钱包或发起支付。
- `PAYMENT_STATE_UNKNOWN` 不得自动重试付款。
- 不保存私钥、助记词或钱包长期授权凭据。
- 社区测试只使用测试钱包和小额测试网资产。
- 不锁死 pnpm 版本；README 推荐当前稳定版。Node.js 只声明经过测试证明的最低兼容范围，不随意声明“支持所有版本”。
- 本计划不包含主网、动态报价、订阅、异步长任务、Skill 市场、自动付款和托管钱包。

---

## 0. 发布完成的定义

下面五个 Gate 全部通过，才可以向社区推送测试：

| Gate       | 必须达到的结果                                                                   |
| ---------- | -------------------------------------------------------------------------------- |
| G1：可安装 | 三个 npm 包能从全新临时目录安装，包内不依赖 monorepo 源文件或 `workspace:*`      |
| G2：可创建 | `pnpm create agentpay-skill@alpha demo-skill` 能生成项目，安装依赖后可启动和构建 |
| G3：可部署 | 示例 Skill 使用真实测试收款地址部署，公开 Endpoint 能稳定返回 x402 报价          |
| G4：可支付 | Base Sepolia 成功、拒绝、业务失败三条真实链路均有证据，且扣款行为符合预期        |
| G5：可复现 | 一位未参与开发的人只看 README，能在 30 分钟内完成首次调用或准确报告阻塞点        |

如果 G1–G4 任一未通过，可以继续在仓库中开发，但不要对外宣布 Developer Preview 已可用。

## 1. 冻结首版产品范围和版本

**Files:**

- Modify: root `package.json`
- Modify: workspace package manifests under `packages/*/package.json`
- Create or modify: `CHANGELOG.md`
- Create: `docs/acceptance/v0.1.0-alpha.1-scope.md`

- [ ] 将三个发布包的版本统一为 `0.1.0-alpha.1`，确认内部依赖引用同一预发布版本。
- [ ] 在范围文档中写明只支持 Base Sepolia、固定价格、同步 JSON、人工确认支付。
- [ ] 明确列出本次不做的能力：Mainnet、市场、动态报价、订阅、异步任务、自动付款。
- [ ] 在 `CHANGELOG.md` 写出 Added、Security、Known limitations 三部分。
- [ ] 执行仓库现有完整验证命令，记录通过数量和失败项；失败项必须修复或从发布范围中明确移除。
- [ ] 提交建议：`chore: freeze v0.1.0-alpha.1 release scope`。

**验收标准：** 仓库、README、开发者指南和三个包显示的版本与支持范围一致，不再同时出现“0.1.0 正式可用”和“not ready for release”这类冲突口径。

## 2. 让三个 npm 包真正可发布

**Files:**

- Modify: `packages/server/package.json`
- Modify: `packages/cli/package.json`
- Modify: `packages/create-agentpay-skill/package.json` 或脚手架当前实际目录下的 `package.json`
- Modify: 各包构建配置，如 `tsconfig.json`、bundler 配置和发布脚本
- Add tests: 各包的 package/tarball smoke tests

### 2.1 包元数据

- [ ] 确认 npm 上的 `@agentpaykit` scope 归属和发布权限；若 scope 不可用，在写代码前决定新的最终包名，三个包及全部文档一次性同步。
- [ ] 每个包设置正确的 `name`、`version`、`description`、`license`、`repository`、`homepage`、`bugs` 和 `keywords`。
- [ ] 删除要发布包中的 `private: true`。
- [ ] 使用 `files` 白名单，只发布 `dist`、README、LICENSE 和运行必需的模板资源。
- [ ] 核对 `main`、`module`、`types`、`exports` 与实际构建产物完全一致。
- [ ] CLI 包配置正确的 `bin`，生成文件包含 Node shebang，并在打包后保持可执行。
- [ ] 脚手架包确认模板文件不会被 `.npmignore` 或 `files` 白名单漏掉。
- [ ] 将运行时必需依赖放在 `dependencies`；构建和测试工具放在 `devDependencies`；不要依赖使用者机器上的全局包。
- [ ] 检查发布产物中不存在 `.env`、测试钱包、Token、私钥、缓存、源码映射中的敏感路径或无关大型文件。

### 2.2 monorepo 依赖和构建产物

- [ ] 执行完整 build，确认三个包从干净 checkout 都能生成 `dist`。
- [ ] 检查发布 tarball 内部依赖，确保 npm 消费者不会拿到无法解析的 `workspace:*`。
- [ ] 对每个包执行 `npm pack --dry-run`，人工检查文件列表、入口和包大小。
- [ ] 再执行 `npm pack` 生成真实 `.tgz`，从临时目录安装 tarball，而不是直接引用 workspace。
- [ ] 在临时目录验证 Server 包可 import、CLI 可执行 `--help`、脚手架能创建项目。
- [ ] 添加自动化 package smoke test，后续每次发布前都重复上述三项。
- [ ] 提交建议：`build: make AgentPayKit packages publishable`。

**验收标准：** 三个 `.tgz` 可以在仓库之外独立工作，删除 monorepo 后测试仍不依赖本地软链接。

## 3. 补齐 CLI 的社区可用路径

**Files:**

- Modify: CLI command entry and call workflow under `packages/cli/src/`
- Add tests: CLI argument、quote validation、wallet rejection、unknown payment state tests
- Modify: CLI package README

- [ ] 验证全局安装后命令名稳定为 `agentpay`，`agentpay --help` 能列出可执行命令和示例。
- [ ] 调用命令支持结构化 JSON 文件输入，并对文件不存在、JSON 非法和 Schema 不匹配返回可理解错误。
- [ ] 调用前展示 Endpoint、network、asset、amount、receiver 和用户设置的最大价格。
- [ ] 报价超过 `--max-price` 时立即退出，不打开钱包、不生成支付凭证。
- [ ] network、USDC 合约、receiver 或 Endpoint 与 Skill 声明不一致时立即退出。
- [ ] 用户拒绝 MetaMask 请求时返回稳定错误码 `USER_REJECTED_PAYMENT`，不得自动重试。
- [ ] 网络断开或结算结果不明确时返回 `PAYMENT_STATE_UNKNOWN`，提示用户查询链上状态，不得自动重试。
- [ ] 命令退出码可被 Agent 判断：成功为 `0`，参数、报价、用户拒绝、业务失败和未知支付状态分别返回非零。
- [ ] 终端日志默认隐藏支付凭证、会话信息和敏感请求头。
- [ ] 增加 `--json` 或等价机器可读输出，确保 Agent 不需要解析彩色终端文案。
- [ ] 提交建议：`feat: harden CLI for community preview`。

**验收标准：** 人能看懂付款前发生什么，Agent 能通过退出码和 JSON 结果判断下一步；任何不确定状态都不会触发第二次付款。

## 4. 补齐脚手架的一次创建体验

**Files:**

- Modify: `create-agentpay-skill` 源码和模板目录
- Add tests: generated-project integration test
- Modify: generated README and `.env.example`

- [ ] 确认以下命令可以工作：`pnpm create agentpay-skill@alpha my-paid-skill`。
- [ ] 脚手架检查目标目录冲突；目录非空时不静默覆盖用户文件。
- [ ] 生成的项目包含 `agentpay.skill.ts`、业务入口、输入示例、`.env.example`、`.gitignore`、README 和测试样例。
- [ ] `.env.example` 只包含变量名和安全说明，不包含真实地址之外的秘密信息。
- [ ] 模板默认网络为 Base Sepolia，默认价格为明确的小额测试价格，并要求开发者替换 receiver。
- [ ] receiver 缺失或仍是销毁/占位地址时，开发服务器和部署前检查应明确失败。
- [ ] 新项目在生成后执行安装、类型检查、测试、构建和本地启动均通过。
- [ ] 生成 README 包含从配置到部署的最短路径，不要求用户回主仓库猜步骤。
- [ ] 提交建议：`feat: complete paid skill scaffolding flow`。

**验收标准：** 在全新临时目录里，从运行 create 命令到本地获得有效 `402 Payment Required` 响应不超过 10 分钟。

## 5. 固化 Server 与 x402 支付契约

**Files:**

- Modify: Server payment middleware and `definePaidSkill` implementation under `packages/server/src/`
- Add tests: quote、input、output、success、settlement and idempotency tests
- Modify: Server package README

- [ ] 服务端返回的 402 报价包含确定的 network、官方 Base Sepolia USDC、amount、receiver 和资源标识。
- [ ] 金额使用无浮点误差的表示方式，配置值和链上最小单位转换有测试覆盖。
- [ ] 输入在执行业务逻辑前完成 Schema 校验。
- [ ] 业务结果先通过输出 Schema 和 `success(result)` 判断，再进入当前协议允许的结算/交付阶段。
- [ ] 输入失败、业务异常、输出 Schema 失败和 success=false 都返回稳定的结构化错误。
- [ ] 对同一支付凭证或请求标识建立防重复处理策略，并用并发或重复请求测试证明行为。
- [ ] Facilitator 超时、拒绝和不明确状态分别处理，不把“不确定”伪装成普通失败。
- [ ] 服务端日志不输出完整支付凭证、API Key 或用户敏感输入。
- [ ] 提交建议：`test: lock x402 payment and settlement contract`。

**验收标准：** 单元与集成测试能证明“什么情况下收费、什么情况下不收费”，而不是只证明接口返回 200。

## 6. 提供一个真实可调用的示例 Skill

**Files:**

- Modify: `examples/paid-repo-review/`
- Create: 示例输入、输出和 Agent Skill 分发文件
- Modify: deployment configuration and example README

- [ ] 把 `0x...dEaD` 等占位 receiver 替换为专用 Base Sepolia 测试收款地址。
- [ ] 将价格设置为社区测试可接受的小额 USDC，并在 README 中保持一致。
- [ ] 示例业务必须返回有意义的结构化结果，不能只返回固定 mock 文本。
- [ ] 增加稳定的正常输入和故意失败输入，方便测试成功与零扣款路径。
- [ ] 部署公开 Endpoint，记录部署版本、commit SHA、网络、价格和 receiver。
- [ ] 加入健康检查，但健康检查本身不能触发 402 或支付。
- [ ] 确认公开日志和错误响应不泄露部署密钥。
- [ ] 提交建议：`feat: deploy community preview example skill`。

**验收标准：** 社区用户不需要自己先开发 Publisher，就能直接扮演 Consumer 完成第一笔测试网调用。

## 7. 打通真实 Agent 的 Skill 安装

**Files:**

- Create or modify: 示例 Skill 的 `SKILL.md`
- Create: `docs/zh-CN/install-paid-skill.md`
- Modify: CLI 或安装辅助脚本（仅在当前没有可靠安装入口时）

- [ ] 首轮只选择一个官方支持目标 Agent 做完整验收，建议优先 Codex；其他 Agent 标为后续兼容，不写成已验证。
- [ ] `SKILL.md` 明确触发条件、输入格式、调用命令、`--max-price`、风险提示和结果格式。
- [ ] 提供唯一、可复制的安装方法。最低可接受方案是精确的手工复制步骤；更好的方案是实现 `agentpay skill install <source>`。
- [ ] 安装过程校验 Skill 标识、Endpoint 和发布来源，不静默覆盖同名本地 Skill。
- [ ] 在一个没有 AgentPayKit 仓库源码的新环境中安装 Skill。
- [ ] 用自然语言提示触发 Skill，确认 Agent 会先说明可能产生测试网付款，再调用 CLI。
- [ ] Agent 遇到 `USER_REJECTED_PAYMENT`、`PRICE_EXCEEDS_LIMIT` 和 `PAYMENT_STATE_UNKNOWN` 时不得自行再次付款。
- [ ] 提交建议：`docs: add verified Agent skill installation path`；若新增安装命令，则使用 `feat:` 提交。

**验收标准：** “Agent 中安装并调用”不再依赖口头解释或开发者知道仓库内部结构，有一条经过录屏或终端记录验证的完整路径。

## 8. 完成 Base Sepolia 真实验收

**Files:**

- Create: `docs/acceptance/v0.1.0-alpha.1-base-sepolia.md`
- Create: 脱敏后的终端输出、交易链接或截图证据目录
- Modify: `docs/acceptance/mvp-dod.md`

- [ ] 场景 A：未付款首次请求返回 402，链上零转账。
- [ ] 场景 B：报价高于 `--max-price`，钱包不打开，链上零转账。
- [ ] 场景 C：用户在 MetaMask 拒绝，返回 `USER_REJECTED_PAYMENT`，链上零转账。
- [ ] 场景 D：用户确认，业务成功，返回结构化结果，链上恰好一笔预期 USDC 结算。
- [ ] 场景 E：输入或业务失败，返回明确错误，链上零转账。
- [ ] 场景 F：模拟回调中断或状态不明确，返回 `PAYMENT_STATE_UNKNOWN`，CLI 不自动重试。
- [ ] 场景 G：篡改 network、asset、amount、receiver 或 Endpoint 中任一报价字段，CLI 拒绝付款。
- [ ] 场景 H：重复提交同一凭证或请求，不能造成重复扣款或重复交付失控。
- [ ] 每个场景记录日期、commit SHA、CLI/Server 版本、Endpoint、预期结果、实际结果和脱敏证据。
- [ ] 将 `mvp-dod.md` 中对应的 pending 项改为带证据的完成状态；Mainnet 仍保持未完成且不阻塞 Developer Preview。
- [ ] 提交建议：`test: record Base Sepolia preview acceptance`。

**验收标准：** 任何人都可以根据验收文档判断扣款是否符合预期，不需要相信开发者口头说明。

## 9. 发布 npm `alpha` 包

**Files:**

- Modify: release scripts or workflow
- Create: `docs/releasing.md`
- Modify: lockfile after final version synchronization

### 9.1 首次发布准备

- [ ] 注册或确认 npm 账号，启用 2FA，并确认 `npm whoami` 返回预期发布者。
- [ ] 确认三个包名在 npm registry 中的状态和归属。
- [ ] 对 scoped public 包使用 public access；首次直接发布需要显式确认公开访问。
- [ ] 发布前再次执行 test、typecheck、build、pack 和临时目录 smoke test。
- [ ] 用 `npm view <package> versions` 检查 `0.1.0-alpha.1` 尚未存在；已发布版本不可覆盖，必须递增预发布号。

### 9.2 发布顺序

- [ ] 先发布 `@agentpaykit/server@0.1.0-alpha.1`，使用 `alpha` tag 和 public access。
- [ ] 再发布 `@agentpaykit/cli@0.1.0-alpha.1`，使用 `alpha` tag 和 public access。
- [ ] 最后发布 `create-agentpay-skill@0.1.0-alpha.1`，使用 `alpha` tag。
- [ ] 检查三个包的 `dist-tags`：`alpha` 指向本次版本，`latest` 不应因预发布被误改。
- [ ] 从与仓库无关的全新目录通过 registry 安装三个包，不使用本地 tarball或 pnpm workspace cache 作为结果依据。
- [ ] 运行 `npx @agentpaykit/cli@alpha --help` 和 `pnpm create agentpay-skill@alpha smoke-skill`。

npm 当前要求发布使用 2FA、符合条件的细粒度 Token，或 Trusted Publishing。首次社区 alpha 可以人工 2FA 发布；稳定后建议改为 GitHub Actions Trusted Publishing，并生成 provenance。参考 [npm scoped public package](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)、[2FA publishing requirements](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/) 和 [trusted publishing](https://docs.npmjs.com/trusted-publishers/)。

**验收标准：** npm 公网页面可访问，README 正常显示，三条 registry 安装/创建命令均在干净环境通过。

## 10. 建立 CI 与后续安全发布流程

**Files:**

- Modify or create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`（首次人工 alpha 发布验证完成后启用）
- Modify: repository branch protection settings

- [ ] PR 和 main push 自动执行 lint、typecheck、unit tests、integration tests、build 和 package smoke tests。
- [ ] CI 使用干净安装，禁止因为本机未提交文件而通过。
- [ ] 把 Base Sepolia 真钱包测试放在显式手工工作流或受保护环境，不在每个 PR 中花费测试资产。
- [ ] 为发布 tag 增加版本一致性校验，三个包版本不一致时停止发布。
- [ ] alpha 首次人工发布稳定后，再配置 npm Trusted Publishing；CI 使用 OIDC，不长期保存传统 npm Token。
- [ ] GitHub-hosted runner 配置 `id-token: write`，发布来源可在 npm provenance 中验证。
- [ ] 发布任务必须依赖 CI 通过，并绑定明确的 git tag/commit。
- [ ] 提交建议：`ci: add package and release verification`。

**验收标准：** 后续 alpha 版本不再依赖“记住一串本地发布步骤”，代码、构建产物和来源之间可追溯。

## 11. 同步社区文档

**Files:**

- Modify: `README.md`
- Modify: `docs/zh-CN/developer-guide.md`
- Create or modify: English quickstart
- Create: `SECURITY.md`
- Create or modify: issue templates

- [ ] README 顶部展示 `Developer Preview / Base Sepolia only / Not audited / Do not use high-value wallets`。
- [ ] Quickstart 中的包名、版本 tag、命令、价格、Endpoint 与实际发布结果一致。
- [ ] 删除“npm 包发布后”“如果尚未发布”等已经过期的预览文案。
- [ ] 分开写 Publisher Quickstart 和 Consumer Quickstart，避免两种角色混在一起。
- [ ] 给出一份可复制的输入 JSON 和对应结果示例。
- [ ] 写清获取 Base Sepolia Gas 和测试 USDC 的实际步骤或官方入口。
- [ ] 增加错误码与处理表，特别说明未知状态不要重试。
- [ ] `SECURITY.md` 写明私钥安全、漏洞报告入口、非审计状态和不支持的主网范围。
- [ ] 建立 Bug、Payment issue、Publisher feedback 三类 issue 模板，支付问题不得要求用户公开私钥或完整支付凭证。
- [ ] 提交建议：`docs: prepare community preview onboarding`。

**验收标准：** README 中出现的每条命令都在最终 npm 包和部署 Endpoint 上重新执行过，没有“理论上应该可以”的步骤。

## 12. 发布 GitHub Pre-release

**Files:**

- Create: git tag `v0.1.0-alpha.1`
- Create: GitHub pre-release notes

- [ ] 确认工作树干净、main CI 通过、npm 包已发布、示例 Endpoint 与验收证据可访问。
- [ ] 从完成验收的确切 commit 创建 annotated tag `v0.1.0-alpha.1`。
- [ ] 创建 GitHub Pre-release，不标记为 Latest stable release。
- [ ] Release Notes 包含：解决的问题、五个非共识判断、安装方式、三分钟体验路径、已知限制、安全提醒、反馈入口。
- [ ] Release Notes 明确说明这是测试网 Developer Preview，不是生产版本。
- [ ] 发布后重新点击 README 和 Release Notes 的所有关键链接。

**验收标准：** GitHub tag、npm 版本、部署 commit 和验收文档指向同一份代码。

## 13. 小范围社区测试，而不是一次性大推送

**Files:**

- Create: `docs/feedback/community-preview-test-script.md`
- Create: `docs/feedback/community-preview-results.md`

- [ ] 先邀请 5–10 位开发者，至少包含 2 位没有参与项目讨论的人。
- [ ] 给测试者的任务只包含目标，不提前教每一步，用来检验文档是否真的自洽。
- [ ] 分别收集 Publisher 与 Consumer 的完成时间、卡点、错误信息和是否愿意再次使用。
- [ ] 记录四个核心指标：首次创建成功率、首次调用成功率、首次付款成功率、30 分钟内完成率。
- [ ] 询问价值判断：愿不愿意发布自己的 Skill、愿不愿意为别人的 Skill 付费、最担心什么。
- [ ] 支付或安全类问题标为 P0，安装/文档阻塞标为 P1，体验优化标为 P2。
- [ ] 修复 P0/P1 后发布 `0.1.0-alpha.2`，不要覆盖 `alpha.1`。

**验收标准：** 至少一位项目外开发者完成端到端调用；如果没人完成，先修链路，不以 Star、浏览量或点赞数替代产品验证。

## 14. 明确延后项

以下项目不要阻塞 `v0.1.0-alpha.1`：

- [ ] Base Mainnet 支持与主网资金安全承诺。
- [ ] Skill 市场、搜索、排名、评价和托管。
- [ ] 动态报价、订阅、套餐、退款和争议处理。
- [ ] 异步长任务、回调和任务队列。
- [ ] Agent 自主钱包、额度授权和白名单自动支付。
- [ ] 多 Token、多链和法币支付。
- [ ] 完整第三方安全审计。
- [ ] 复杂 Publisher 数据分析和收入后台。

这些能力只有在社区验证“开发者愿意发布一次能力，也愿意完成一次小额付款”之后再进入路线图。

## 建议本地执行顺序

1. **里程碑 A：安装闭环** — 完成任务 1、2、3、4，得到三个可从 tarball 独立使用的包。
2. **里程碑 B：支付闭环** — 完成任务 5、6、7、8，得到真实 Agent + Base Sepolia 的端到端证据。
3. **里程碑 C：公开发布** — 完成任务 9、10、11、12，发布 npm alpha 和 GitHub Pre-release。
4. **里程碑 D：社区验证** — 完成任务 13，根据真实反馈决定 `alpha.2`，延后任务保持不动。

## 最终发布检查（一页版）

- [ ] 三个 npm 包的 `alpha` 安装通过。
- [ ] 脚手架在全新目录创建、安装、构建、启动通过。
- [ ] 示例 Endpoint 使用 Base Sepolia 和真实测试 receiver。
- [ ] 真实 Agent 安装 Skill 的步骤已验证。
- [ ] 成功付款恰好一次并拿到有效结果。
- [ ] 超价、拒绝、业务失败均零扣款。
- [ ] 未知支付状态不自动重试。
- [ ] README 所有命令均重新执行通过。
- [ ] CI 绿色，验收证据与 commit 对齐。
- [ ] GitHub Release 标记为 Pre-release。
- [ ] 文档明确 Not audited、Base Sepolia only、测试钱包。
- [ ] 反馈入口和首批测试者名单已准备好。

当这 12 项全部勾选后，再向社区发布测试邀请。
