# M0 Fork Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 固定 PayBot 上游来源，在不改变行为的前提下把仓库迁移到 Node.js 22、pnpm 与可重复 CI。

**Architecture:** 只改仓库元数据、包管理器和构建编排；应用与支付实现保持上游行为，为 M1 提供可对比基线。

**Tech Stack:** Git、Node.js 22 LTS、Corepack、pnpm 9、Turborepo、GitHub Actions。

## Global Constraints

- 实施必须从含完整 Git 历史的 PayBot Fork 开始，而不是复制源码压缩包。
- 本阶段不得删除旧实现、重写支付接口或更改 UI 行为。
- `LICENSE` 原文保留；上游 SHA 固定为 `1d6d3f4ac33e2a338e068cdfb80a67f63544a8e1`。

---

### Task 1: Freeze provenance and baseline evidence

**Files:** Create `docs/upstream/paybot-baseline.md`, `tests/repository/provenance.test.ts`; preserve `LICENSE`.

- [ ] 写失败测试，读取 `docs/upstream/paybot-baseline.md`，断言 repository、SHA、license 三个字段以及 `LICENSE` 包含 `MIT License`。
- [ ] 运行 `pnpm exec vitest run tests/repository/provenance.test.ts`；预期因文档不存在失败。
- [ ] 创建基线文档，记录上游 URL、固定 SHA、复用/删除清单，以及 `git diff 1d6d3f4...HEAD` 为审计入口。
- [ ] 运行同一测试；预期 `1 passed`。
- [ ] 提交：`git commit -m "chore: record PayBot upstream provenance"`。

测试的核心断言：

```ts
expect(baseline).toContain("superposition/paybot");
expect(baseline).toContain("1d6d3f4ac33e2a338e068cdfb80a67f63544a8e1");
expect(license).toContain("MIT License");
```

### Task 2: Migrate Bun workspace to pinned pnpm

**Files:** Modify `package.json`, `turbo.json`, all workspace `package.json`; create `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.npmrc`, `.node-version`; delete `bun.lock`.

- [ ] 在 `tests/repository/toolchain.test.ts` 断言 `packageManager === "pnpm@9.15.9"`、`engines.node === ">=22 <23"`、无 `bun.lock`。
- [ ] 运行 `corepack pnpm exec vitest run tests/repository/toolchain.test.ts`；预期 packageManager 断言失败。
- [ ] 将 Bun scripts 改为 `pnpm --filter`/`turbo run`；workspace 仅覆盖 `apps/*` 与 `packages/*`。
- [ ] 执行 `corepack enable && pnpm install` 生成 lockfile，不手工编辑 lockfile。
- [ ] 运行 `pnpm install --frozen-lockfile && pnpm typecheck && pnpm build`；预期全部退出码 `0`。
- [ ] 提交：`git commit -m "build: migrate workspace from Bun to pnpm"`。

根配置必须包含：

```json
{"private":true,"packageManager":"pnpm@9.15.9","engines":{"node":">=22 <23"}}
```

### Task 3: Add repeatable baseline CI

**Files:** Create `.github/workflows/ci.yml`, `scripts/assert-clean-build.mjs`; modify root `package.json`.

- [ ] 为 `assert-clean-build.mjs` 写测试，模拟缺失 lockfile 和不匹配 Node major；预期返回非零。
- [ ] 实现脚本并在根 `verify` 串联 `format:check lint typecheck test build`。
- [ ] CI 使用 `actions/setup-node` 的 Node 22、Corepack、`pnpm install --frozen-lockfile`，不配置链上密钥。
- [ ] 运行 `pnpm verify` 两次；预期两次均退出码 `0` 且第二次不改动 lockfile。
- [ ] 将输出保存到 `docs/upstream/m0-build-evidence.txt`。
- [ ] 提交：`git commit -m "ci: establish reproducible PayBot baseline"`。

## M0 Definition of Done

- [ ] `git merge-base --is-ancestor 1d6d3f4ac33e2a338e068cdfb80a67f63544a8e1 HEAD` 退出码为 `0`。
- [ ] License 与 provenance 测试通过。
- [ ] `rg -n 'bun (run|install)|bunx' --glob '!docs/**'` 无匹配。
- [ ] `pnpm verify` 在干净 checkout 成功。
- [ ] 本阶段未删除或重写任何支付业务代码。
