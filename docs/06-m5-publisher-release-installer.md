# M5 Publisher, Release and Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Skill 创作者可脚手架、构建、签署和发布不可变 Paid Skill，并让用户一条命令安装共享 Client、Skill、Codex 与 Claude Code 入口。

**Architecture:** Publisher CLI 生成确定性 Package/Release，由收款钱包签名 Release；Installer 先离线验证再原子写入共享 Client 与两个 Agent adapter，支持幂等升级和回滚。

**Tech Stack:** TypeScript、Node.js、Hono/Wrangler、viem external wallet signing、tar、SHA-256、macOS filesystem、Vitest。

## Global Constraints

- Publisher 与 Payee 是不同字段；MVP 默认同一收款钱包签 Release。
- Testnet/Mainnet Release 必须分开构建、签名且 Release ID 不同。
- 验证失败不得写 Codex/Claude Code 目录；普通复制不得静默联网补 Client。
- Package 不携带 Client 副本，只声明兼容范围和安装要求。

---

### Task 1: Scaffold a paid skill and runtime handler

**Files:** Create `packages/publisher/src/scaffold.ts`, `templates/paid-skill/**`, `packages/cli/src/commands/create.ts`, golden tests.

- [x] Golden test 运行 `create-agentpay-skill research-lite` 并比较完整文件树、manifest、Handler、Success Policy、schema 与 tests。
- [x] 运行测试；预期命令缺失失败。
- [x] 模板包含 Workers/Hono Handler、processor allowlist、maximum execution duration、testnet/mainnet config；不包含 secrets 或钱包私钥。
- [x] 生成项目执行 `pnpm install --frozen-lockfile && pnpm test && pnpm build` 成功。
- [x] 提交：`git commit -m "feat(publisher): scaffold paid skills"`。

### Task 2: Build, sign and verify immutable Releases

**Files:** Create `packages/publisher/src/{release-builder,release-signer,release-verifier,delegation}.ts`, fixtures/tests; extend protocol schemas.

- [x] Golden tests 固定 canonical Release bytes、Release ID、signature recovery 和 Runtime Delegation；一字节篡改必须失败。
- [x] 测试相同源码但 network 不同产生不同 Release ID，且 mainnet Release 不能接受 Sepolia delegation。
- [x] 运行测试；预期 builder 缺失失败。
- [x] 外部钱包签署 domain-separated Release；默认 recovered signer 等于 Payee，但字段仍分别编码。
- [x] `release verify` 离线验证 schema、digest、publisher signature、payee binding、runtime delegation 和 expiry。
- [x] 提交：`git commit -m "feat(publisher): sign immutable paid-skill releases"`。

### Task 3: Build deterministic Skill Packages

**Files:** Create `packages/publisher/src/{package-builder,archive}.ts`, `packages/protocol/schemas/package.json`, reproducibility/security tests.

- [x] 测试两次构建字节与 Package Digest 完全相同；symlink、absolute path、`..`、秘密文件和未声明文件失败。
- [x] 运行测试；预期 package builder 缺失失败。
- [x] 归一化文件顺序、mode、mtime、uid/gid；Package 包含薄 Agent adapter、Release、schemas、manifest 与安装声明。
- [x] 增加秘密扫描，拒绝 `.env`、key/seed 常见模式、Cloudflare/CDP credentials。
- [x] 提交：`git commit -m "feat(publisher): build deterministic skill packages"`。

### Task 4: Install shared Client and both Agent entries atomically

**Files:** Create `packages/installer/src/{preflight,layout,transaction,install,uninstall}.ts`, fixtures for Codex/Claude Code, integration tests; add CLI `install` and `doctor`.

- [x] 在临时 HOME 中测试：首次安装、重复安装、兼容 Client 复用、升级、名称冲突、篡改、磁盘写失败回滚、卸载保留共享 Client。
- [x] 运行测试；预期 installer 缺失失败。
- [x] 固定顺序：macOS preflight → Package/Release verify → stage → install/reuse Client → install Skill → Codex link → Claude Code link → doctor → atomic commit。
- [x] 任一步失败回滚 staging 与本次新写内容；既有用户文件不覆盖。
- [x] Client 缺失且仅复制 Skill 时返回 `AGENTPAY_CLIENT_MISSING` 和明确的 `agentpay install-client` 命令。
- [x] 提交：`git commit -m "feat(installer): install one skill for Codex and Claude Code"`。

### Task 5: Add publisher deployment preflight

**Files:** Create `packages/publisher/src/deploy-preflight.ts`, `packages/cli/src/commands/release.ts`, `docs/runbooks/publisher-release.md`, tests.

- [ ] 测试缺少 CDP/upstream/encryption secrets、错误 network、Release/config digest 漂移均阻止 deploy。
- [ ] 实现 `agentpay release build|sign|verify|deploy --environment testnet|mainnet`；mainnet 强制二次文字确认且不复用 testnet Release。
- [ ] 文档给出 Cloudflare secret 名称与 Wrangler 命令，但不写值。
- [ ] 运行 publisher/CLI tests 和模板 dry-run；预期成功且无网络花费。
- [ ] 提交：`git commit -m "feat(publisher): gate testnet and mainnet releases"`。

## M5 Definition of Done

- [ ] 从空目录脚手架出的 Skill 可 test/build。
- [ ] Release/Package 的篡改测试全部失败且安装目录零写入。
- [ ] 一条 install 命令建立一个共享 Client 和两个 Agent 入口。
- [ ] 重复安装幂等，失败注入可回滚，用户已有文件不丢失。
- [ ] testnet/mainnet Release ID 不同；Publisher/Payee 字段可独立审计。
