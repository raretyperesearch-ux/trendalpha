import nacl from "tweetnacl";
import { config } from "./config.js";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function getDeployPrivateSignerDiagnostics() {
  const parsed = parseDeployWalletPrivateKey();
  const derivedPublicKey = parsed.ok ? encodeBase58(parsed.publicKeyBytes) : "";
  const publicKeyMatch = Boolean(parsed.ok && config.wallets.deployPublicKey && derivedPublicKey === config.wallets.deployPublicKey);
  const roleConfigValid = walletRoleConfigIsValid();
  const signerEnabled = Boolean(config.launch.enableRealLaunches && !config.wallets.signerDisabled);

  return {
    role: "deploy_wallet",
    privateKeyPresent: parsed.present,
    privateKeyFormatValid: parsed.ok,
    publicKeyMatch,
    signerEnabled,
    liveSignerReady: Boolean(signerEnabled && parsed.ok && publicKeyMatch && roleConfigValid),
    roleConfigValid,
    reason: signerReadyReason({ parsed, publicKeyMatch, signerEnabled, roleConfigValid }),
  };
}

export function signDeploymentPayload({ role = "deploy_wallet", payload = {} } = {}) {
  const diagnostics = getDeployPrivateSignerDiagnostics();
  const allowed = role === "deploy_wallet" && diagnostics.liveSignerReady;

  if (!allowed) {
    return {
      signed: false,
      role,
      reason: role !== "deploy_wallet" ? "role_not_allowed_to_sign" : diagnostics.reason,
      diagnostics,
    };
  }

  const parsed = parseDeployWalletPrivateKey();
  const message = Buffer.from(JSON.stringify(payload));
  const signature = nacl.sign.detached(message, Uint8Array.from(parsed.secretKeyBytes));

  return {
    signed: true,
    role,
    signature: encodeBase58(Array.from(signature)),
    publicKey: config.wallets.deployPublicKey,
    diagnostics,
  };
}

export function parseDeployWalletPrivateKey() {
  const raw = process.env.DEPLOY_WALLET_PRIVATE_KEY || "";
  if (!raw.trim()) {
    return { present: false, ok: false, reason: "missing_private_key", secretKeyBytes: [], publicKeyBytes: [] };
  }

  try {
    const secretKeyBytes = raw.trim().startsWith("[") ? parseJsonSecretKey(raw) : decodeBase58(raw.trim());
    if (secretKeyBytes.length !== 64) {
      return {
        present: true,
        ok: false,
        reason: "secret_key_must_be_64_bytes",
        secretKeyBytes: [],
        publicKeyBytes: [],
      };
    }

    return {
      present: true,
      ok: true,
      reason: "parsed",
      secretKeyBytes,
      publicKeyBytes: secretKeyBytes.slice(32, 64),
    };
  } catch {
    return { present: true, ok: false, reason: "invalid_private_key_format", secretKeyBytes: [], publicKeyBytes: [] };
  }
}

export function encodeBase58(bytes) {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    digits.push(0);
  }
  return digits.reverse().map((digit) => BASE58_ALPHABET[digit]).join("");
}

function parseJsonSecretKey(raw) {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("secret key must be array");
  if (!parsed.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
    throw new Error("secret key array contains invalid byte");
  }
  return parsed;
}

function decodeBase58(value) {
  const bytes = [0];
  for (const char of value) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit < 0) throw new Error("invalid base58");
    let carry = digit;
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of value) {
    if (char !== "1") break;
    bytes.push(0);
  }
  return bytes.reverse();
}

function walletRoleConfigIsValid() {
  return config.wallets.publicKeyDiagnostics.every((item) => item.configured && item.valid && item.warnings.length === 0);
}

function signerReadyReason({ parsed, publicKeyMatch, signerEnabled, roleConfigValid }) {
  if (!signerEnabled) return "real_launches_disabled_or_signer_disabled";
  if (!parsed.present) return "missing_private_key";
  if (!parsed.ok) return parsed.reason;
  if (!publicKeyMatch) return "private_key_public_key_mismatch";
  if (!roleConfigValid) return "wallet_role_config_invalid";
  return "ready";
}
