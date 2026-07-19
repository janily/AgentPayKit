# M6 Deep Research Lite Acceptance

- Price: `10000` USDC atomic units (`0.01` USDC).
- Testnet network: `eip155:84532`.
- Mainnet network: `eip155:8453`.
- Core package digest: `sha256:c81fe6b1031c79024bd80830883a7997b36b4e7e34a782390a1403998f5cab55`.
- Testnet Release ID: `rel_0fdf24542344f31741805cd89e696c4b1f89ec1f6619dca444edf14f0c27936b`.
- Mainnet Release ID: `rel_a08de5809ca724010a4ec45ebbfc7de590eaab1d902ce522ebeaca7aa2a78c86`.
- Both Releases verify offline; signed package bytes differ because the detached Release metadata is environment-specific.
- Fake-provider flow covers quote, approval, execution, Success Policy, settlement, result and Receipt.
- Retention gates: input removed after execution, result within 24 hours, metadata/Receipt/logs within 30 days.
- Evidence contains no input, result body, wallet secret or provider credential.
