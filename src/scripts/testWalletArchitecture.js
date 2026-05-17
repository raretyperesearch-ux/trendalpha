// ============================================================
// Test OINK wallet isolation architecture
// Run: npm run test-wallet-architecture
// ============================================================

process.env.DEPLOY_WALLET_KEY_STUB = "deploy-stub-only";
process.env.MONITORING_WALLET_KEY_STUB = "monitor-stub-only";

const { createSignerIsolationManager, WALLET_ROLES } = await import("../walletIsolation.js");

const disabled = createSignerIsolationManager({ disabled: true });
const enabled = createSignerIsolationManager({ disabled: false });
const signature = enabled.simulateSign({ role: "deploy_wallet", payload: { ticker: "SPOT" } });
const denied = enabled.authorize({ role: "treasury_wallet", capability: "sign_deployment_stub", transactionType: "deployment" });

console.log("Wallet architecture test");
console.log(`Roles: ${WALLET_ROLES.join(", ")}`);
console.log(`Disabled deploy sign: ${disabled.can("deploy_wallet", "sign_deployment_stub") ? "yes" : "no"}`);
console.log(`Enabled deploy sign: ${signature.signed ? "yes" : "no"}`);
console.log(`Treasury denied deploy signing: ${denied.allowed ? "no" : "yes"}`);
console.log("Diagnostics:");
console.log(JSON.stringify(enabled.getDiagnostics(), null, 2));

if (disabled.can("deploy_wallet", "sign_deployment_stub")) process.exitCode = 1;
if (!signature.signed) process.exitCode = 1;
if (denied.allowed) process.exitCode = 1;
