# Community preview test script

Give testers the goal and public documentation, but do not coach individual
steps. Use only dedicated low-value Base Sepolia wallets.

## Publisher task

Create, configure, verify, and deploy one paid Skill using only the README and
Publisher quickstart. Record completion time, blocking step, error code, and
whether you would publish another Skill.

## Consumer task

Install the official example Skill in Codex, invoke it from natural language,
inspect the quote, and either reject or confirm one test payment. Record
completion time, result, transaction hash when charged, and whether you would
pay for another Skill. Never share wallet secrets or payment credentials.

Classify payment/security failures as P0, installation/documentation blockers as
P1, and nonblocking experience issues as P2.
