# AgentPayKit 开发者指南

AgentPayKit `v0.1.0-alpha.2` 是未经审计的 Base Sepolia Developer Preview。
当前范围只有固定 USDC 价格、同步 JSON 请求和逐次人工确认付款。

发布者从 `pnpm create agentpay-skill@alpha my-paid-skill` 开始，在 `.env.local`
设置 `AGENTPAY_RECEIVER_ADDRESS`，完成 `agentpay.skill.ts` 和业务逻辑后运行
`pnpm verify` 与 `pnpm deploy`。部署脚本会检查线上 402 报价是否与本地配置一致。

消费者安装 `@agentpaykit/cli@alpha`，调用时必须设置 `--max-price`，推荐使用
`--input-file` 和 `--json`。CLI 会在连接钱包前校验 Endpoint、network、asset、amount
和 receiver。未知付款状态不得自动重试。

发布前必须完成 [Base Sepolia 验收](../acceptance/v0.1.0-alpha.2-base-sepolia.md)
和一位项目外开发者的 README 独立复现。Mainnet、订阅、动态报价、异步任务、自动付款和托管钱包不在本次范围内。
