import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repository = resolve(import.meta.dirname, "..");
const root = mkdtempSync(join(tmpdir(), "agentpaykit-package-smoke-"));
const packs = join(root, "packs");
const install = join(root, "install");
mkdirSync(packs);
mkdirSync(install);

const environment = {
  ...process.env,
  CI: "true",
  NPM_CONFIG_REGISTRY: "https://registry.npmjs.org",
  npm_config_registry: "https://registry.npmjs.org",
  AGENTPAY_RECEIVER_ADDRESS: "0x1234567890123456789012345678901234567890",
};

for (const packageDirectory of [
  "packages/server",
  "packages/cli",
  "packages/create-agentpay-skill",
]) {
  run(
    "pnpm",
    ["pack", "--pack-destination", packs],
    join(repository, packageDirectory),
  );
}

const tarballs = readdirSync(packs)
  .filter((file) => file.endsWith(".tgz"))
  .map((file) => join(packs, file));
if (tarballs.length !== 3)
  throw new Error("PACKAGE_SMOKE_EXPECTED_THREE_TARBALLS");

writeFileSync(
  join(install, "package.json"),
  JSON.stringify(
    { name: "agentpaykit-package-smoke", private: true, type: "module" },
    null,
    2,
  ),
);
run(
  "pnpm",
  ["add", "--registry=https://registry.npmjs.org", ...tarballs],
  install,
);
run(
  process.execPath,
  [
    "--input-type=module",
    "--eval",
    "const root = await import('@agentpaykit/server'); const next = await import('@agentpaykit/server/next'); if (typeof root.definePaidSkill !== 'function' || typeof next.createNextPaidSkillRoute !== 'function') process.exit(1)",
  ],
  install,
);
run("pnpm", ["exec", "agentpay", "--help"], install);
run(
  "pnpm",
  ["exec", "create-agentpay-skill", "smoke-skill", "--cwd", root],
  install,
);

const generated = join(root, "smoke-skill");
const generatedManifestPath = join(generated, "package.json");
const generatedManifest = JSON.parse(
  readFileSync(generatedManifestPath, "utf8"),
);
const serverTarball = tarballs.find((file) =>
  file.includes("agentpaykit-server-"),
);
if (serverTarball === undefined)
  throw new Error("PACKAGE_SMOKE_SERVER_TARBALL_MISSING");
generatedManifest.dependencies["@agentpaykit/server"] = `file:${serverTarball}`;
writeFileSync(
  generatedManifestPath,
  `${JSON.stringify(generatedManifest, null, 2)}\n`,
);
run("pnpm", ["install", "--registry=https://registry.npmjs.org"], generated);
run("pnpm", ["verify"], generated);

process.stdout.write(`Package smoke passed in ${root}\n`);

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, env: environment, stdio: "inherit" });
}
