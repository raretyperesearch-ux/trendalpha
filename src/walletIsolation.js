import { config } from "./config.js";

export const WALLET_ROLES = ["deploy_wallet", "treasury_wallet", "fee_wallet", "monitoring_wallet"];

const ROLE_CAPABILITIES = {
  deploy_wallet: ["prepare_deployment", "sign_deployment_stub"],
  treasury_wallet: ["receive_treasury_fees"],
  fee_wallet: ["receive_launch_fees"],
  monitoring_wallet: ["read_balances", "watch_confirmations"],
};

export class SignerIsolationManager {
  constructor({ disabled = config.wallets.signerDisabled } = {}) {
    this.disabled = disabled;
    this.signers = Object.fromEntries(WALLET_ROLES.map((role) => [role, loadSignerStub(role)]));
  }

  getDiagnostics() {
    return WALLET_ROLES.map((role) => ({
      role,
      loaded: this.signers[role].loaded,
      capabilities: ROLE_CAPABILITIES[role],
      enabled: !this.disabled && this.signers[role].loaded,
      health: this.disabled ? "DISABLED" : this.signers[role].loaded ? "READY_STUB" : "MISSING_STUB",
    }));
  }

  can(role, capability) {
    if (this.disabled) return false;
    if (!WALLET_ROLES.includes(role)) return false;
    return this.signers[role].loaded && ROLE_CAPABILITIES[role].includes(capability);
  }

  authorize({ role, capability, transactionType }) {
    const allowed = this.can(role, capability);
    return {
      allowed,
      role,
      capability,
      transactionType,
      reason: allowed ? "dry_run_authorized" : "signer_disabled_or_capability_missing",
      mode: "DRY_RUN_ONLY",
    };
  }

  simulateSign({ role = "deploy_wallet", payload = {} } = {}) {
    const auth = this.authorize({ role, capability: "sign_deployment_stub", transactionType: "deployment" });
    return {
      ...auth,
      signature: auth.allowed ? `dry-signature-${role}-${hashish(JSON.stringify(payload))}` : "",
      signed: auth.allowed,
    };
  }
}

export function createSignerIsolationManager(options = {}) {
  return new SignerIsolationManager(options);
}

function loadSignerStub(role) {
  const envKey = `${role.toUpperCase()}_KEY_STUB`;
  return {
    role,
    envKey,
    loaded: Boolean(process.env[envKey]),
    publicId: process.env[envKey] ? `stub:${hashish(process.env[envKey])}` : "",
  };
}

function hashish(value) {
  let hash = 0;
  for (const char of String(value)) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return Math.abs(hash).toString(36).slice(0, 10);
}
