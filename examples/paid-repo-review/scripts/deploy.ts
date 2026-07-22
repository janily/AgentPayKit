import skill from "../agentpay.skill.js";
import { deploySkill } from "./lib/deploy.js";
import { runCommand } from "./lib/run.js";

const cwd = process.cwd();
const result = await deploySkill({
  run: runCommand,
  fetch: globalThis.fetch,
  cwd,
});

console.log(`Endpoint: ${result.endpoint}`);
console.log(`Price: ${skill.price} USDC`);
console.log(`Network: ${skill.network}`);
console.log(`Payee: ${skill.payTo}`);
console.log(`SKILL.md: ${cwd}/skill/SKILL.md`);
