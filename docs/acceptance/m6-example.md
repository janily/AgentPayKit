# M6 Deep Research Lite Acceptance

- Price: `10000` USDC atomic units (`0.01` USDC).
- Testnet network: `eip155:84532`.
- Mainnet network: `eip155:8453`.
- Core package digest: `sha256:4e6e65cdbf5e8fb3c320372a036e4fbe4815d5234ea06075cb8a5bb880ff3581`.
- Testnet Release ID: `rel_f68acce08e7c51e28be14d26989d03def6db074f58dba7ed6b30cdc46f30d81c`.
- Mainnet Release ID: `rel_a140a34927220617d439913e1b8797e90971f266031466f33f209333137177f9`.
- Both Releases verify offline; signed package bytes differ because the detached Release metadata is environment-specific.
- Fake-provider flow covers quote, approval, execution, Success Policy, settlement, result and Receipt.
- Retention gates: input removed after execution, result within 24 hours, metadata/Receipt/logs within 30 days.
- Evidence contains no input, result body, wallet secret or provider credential.
