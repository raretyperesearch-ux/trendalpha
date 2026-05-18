import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import { config } from "./config.js";
import { BUYBACK_CONFIG } from "./buybacks.js";
import { getDeployPrivateSignerDiagnostics, getDeploySecretKeyBytesForSigning } from "./privateSigner.js";
import { confirmSignature } from "./launchers/pumpPortalLocalFlow.js";
import { saveCreatorFeeClaim } from "./db.js";

const SUPPORTED_POOLS = new Set(["pump", "meteora-dbc"]);

export class CreatorFeeService {
  constructor(options = {}) {
    this.fetchImpl = options.fetchImpl || fetch;
    this.ConnectionClass = options.ConnectionClass || Connection;
    this.KeypairClass = options.KeypairClass || Keypair;
    this.VersionedTransactionClass = options.VersionedTransactionClass || VersionedTransaction;
    this.rpcUrl = options.rpcUrl ?? config.solana.rpcUrl;
    this.confirmationTimeoutMs = options.confirmationTimeoutMs ?? config.solana.confirmationTimeoutMs;
    this.confirmationPollMs = options.confirmationPollMs ?? config.solana.confirmationPollMs;
  }

  validateClaimGates({ pool = "pump", mint = "" } = {}) {
    const diagnostics = getDeployPrivateSignerDiagnostics();
    const errors = [];
    if (!SUPPORTED_POOLS.has(pool)) errors.push("unsupported_creator_fee_pool");
    if (pool === "meteora-dbc" && !mint) errors.push("meteora_dbc_claim_requires_mint");
    if (!config.launch.enableRealLaunches) errors.push("real_launches_disabled");
    if (config.wallets.signerDisabled) errors.push("signer_disabled");
    if (!diagnostics.liveSignerReady) errors.push(`deploy_signer_not_ready:${diagnostics.reason}`);
    if (!this.rpcUrl) errors.push("solana_rpc_url_missing");
    return {
      allowed: errors.length === 0,
      errors,
      diagnostics: {
        privateKeyPresent: diagnostics.privateKeyPresent,
        publicKeyMatch: diagnostics.publicKeyMatch,
        signerEnabled: diagnostics.signerEnabled,
        liveSignerReady: diagnostics.liveSignerReady,
      },
    };
  }

  buildCollectCreatorFeeRequest({ pool = "pump", mint = "", priorityFee = config.creatorFees.priorityFee } = {}) {
    const body = {
      publicKey: config.wallets.deployPublicKey,
      action: "collectCreatorFee",
      priorityFee,
      pool,
    };
    if (pool === "meteora-dbc" && mint) body.mint = mint;
    return body;
  }

  async collectCreatorFee({ pool = "pump", mint = "", estimatedCreatorFeesSol = 0, persist = config.launch.enableRealLaunches } = {}) {
    const gates = this.validateClaimGates({ pool, mint });
    if (!gates.allowed) {
      const blocked = {
        mint,
        pool,
        status: "blocked",
        estimatedCreatorFeesSol,
        claimedSol: 0,
        failureClass: "validation_failure",
        recoveryPath: gates.errors.join(","),
        gates,
      };
      if (persist) await saveCreatorFeeClaim(blocked);
      return blocked;
    }

    const requestBody = this.buildCollectCreatorFeeRequest({ pool, mint });
    const serialized = await this.requestCreatorFeeTransaction(requestBody);
    const signed = this.signCreatorFeeTransaction(serialized);
    const started = Date.now();
    const confirmation = await this.broadcastAndConfirm(signed.transaction);
    const confirmationLatencyMs = Date.now() - started;
    const status = confirmation.confirmed ? "claimed" : confirmation.status === "timeout" ? "timeout" : "failed";
    const claim = {
      mint,
      pool,
      status,
      estimatedCreatorFeesSol,
      claimedSol: confirmation.confirmed ? estimatedCreatorFeesSol : 0,
      txSignature: confirmation.signature || "",
      failureClass: confirmation.confirmed ? "" : "chain_failure",
      confirmationLatencyMs,
      recoveryPath: confirmation.confirmed ? "" : "retry_or_manual_review",
      confirmation,
    };
    if (persist) await saveCreatorFeeClaim(claim);
    return claim;
  }

  async sweepCreatorFees({ deployedTokens = [], pools = config.creatorFees.pools, persist = config.launch.enableRealLaunches } = {}) {
    const results = [];
    for (const pool of pools) {
      if (pool === "pump") {
        results.push(await this.collectCreatorFee({
          pool,
          estimatedCreatorFeesSol: sumEstimatedFees(deployedTokens, pool),
          persist,
        }));
      } else {
        for (const token of deployedTokens) {
          results.push(await this.collectCreatorFee({
            pool,
            mint: token.mint,
            estimatedCreatorFeesSol: Number(token.estimatedCreatorFeesSol || 0),
            persist,
          }));
        }
      }
    }
    return buildCreatorFeeDiagnostics({ deployedTokens, claims: results });
  }

  async requestCreatorFeeTransaction(body) {
    const res = await this.fetchImpl(`${config.pumpPortal.apiBaseUrl.replace(/\/$/, "")}/trade-local`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PumpPortal collectCreatorFee failed: ${res.status} ${await readTextSafe(res)}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  signCreatorFeeTransaction(serializedTransaction) {
    const deploySecret = getDeploySecretKeyBytesForSigning();
    if (!deploySecret.ok) throw new Error(`Deploy signer unavailable: ${deploySecret.reason}`);
    const deployKeypair = this.KeypairClass.fromSecretKey(deploySecret.secretKeyBytes);
    const tx = this.VersionedTransactionClass.deserialize(serializedTransaction);
    tx.sign([deployKeypair]);
    return {
      transaction: tx,
      signerPublicKey: deployKeypair.publicKey.toBase58(),
    };
  }

  async broadcastAndConfirm(transaction) {
    const connection = new this.ConnectionClass(this.rpcUrl, "confirmed");
    const signature = typeof connection.sendTransaction === "function"
      ? await connection.sendTransaction(transaction)
      : await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false, maxRetries: 3 });
    return confirmSignature({
      connection,
      signature,
      timeoutMs: this.confirmationTimeoutMs,
      pollMs: this.confirmationPollMs,
    });
  }
}

export function buildCreatorFeeDiagnostics({ deployedTokens = [], claims = [] } = {}) {
  const claimedFees = claims.reduce((sum, claim) => sum + Number(claim.claimedSol || 0), 0);
  const estimatedCreatorFees = deployedTokens.reduce((sum, token) => sum + Number(token.estimatedCreatorFeesSol || 0), 0);
  const pendingClaims = claims.filter((claim) => ["blocked", "pending", "timeout"].includes(claim.status)).length;
  const failedClaims = claims.filter((claim) => claim.status === "failed").length;
  const topLaunch = [...deployedTokens].sort((a, b) => Number(b.estimatedCreatorFeesSol || 0) - Number(a.estimatedCreatorFeesSol || 0))[0] || null;
  return {
    estimatedCreatorFees,
    claimedFees,
    pendingClaims,
    failedClaims,
    cumulativeTreasuryGrowth: claimedFees,
    topLaunch,
    claims,
  };
}

export function createBuybackRoutingPlan({ treasurySol = 0 } = {}) {
  return {
    status: "planned_not_active",
    automaticBuybacksEnabled: false,
    treasurySol,
    buybackQueue: treasurySol > 0 ? [{
      asset: "$OINK",
      plannedSol: Number((treasurySol * BUYBACK_CONFIG.buybackPercent / 100).toFixed(6)),
      status: "queued_not_active",
    }] : [],
    allocation: {
      buybacksPercent: BUYBACK_CONFIG.buybackPercent,
      treasuryPercent: BUYBACK_CONFIG.treasuryPercent,
      opsPercent: BUYBACK_CONFIG.opsPercent,
    },
    note: "Future buyback routing placeholder only. No automatic buybacks are active.",
  };
}

export function createCreatorFeeService(options = {}) {
  return new CreatorFeeService(options);
}

function sumEstimatedFees(tokens, pool) {
  return tokens
    .filter((token) => !token.pool || token.pool === pool)
    .reduce((sum, token) => sum + Number(token.estimatedCreatorFeesSol || 0), 0);
}

async function readTextSafe(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
