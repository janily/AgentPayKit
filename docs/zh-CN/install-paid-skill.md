# 在 Codex 中安装付费 Skill

本预览版只支持 Base Sepolia。请使用专用低价值测试钱包，不要使用主网或高价值钱包。

1. 安装 CLI：`npm install --global @agentpaykit/cli@alpha`。
2. 运行 `agentpay doctor`，确认 Node、MetaMask 和 Base Sepolia RPC 可用。
3. 将已部署示例生成的 `SKILL.md` 放入 Codex 本地 Skill 目录。若同名目录已存在，先人工检查，不要覆盖。
4. 核对文件中的 Endpoint、Base Sepolia、固定价格和 `--max-price`。
5. 用自然语言触发 Skill。Agent 必须先展示报价，付款必须在 MetaMask 中逐次人工确认。

遇到 `USER_REJECTED_PAYMENT` 或 `PRICE_EXCEEDS_LIMIT` 时不得自动重试。遇到
`PAYMENT_STATE_UNKNOWN` 时立即停止，查询钱包和链上状态，只有在重新获得人工批准后才能发起新的调用。
