import { Blob } from "node:buffer";
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import { config } from "../config.js";
import { getDeployPrivateSignerDiagnostics, getDeploySecretKeyBytesForSigning } from "../privateSigner.js";
import { sendLaunchCreatedAlert } from "../telegram.js";
import { saveDeploymentAttempt } from "../db.js";

const PUMP_FUN_BASE = "https://pump.fun";

export class PumpPortalLocalLaunchFlow {
  constructor(options = {}) {
    this.fetchImpl = options.fetchImpl || fetch;
    this.ConnectionClass = options.ConnectionClass || Connection;
    this.KeypairClass = options.KeypairClass || Keypair;
    this.VersionedTransactionClass = options.VersionedTransactionClass || VersionedTransaction;
    this.now = options.now || (() => new Date());
    this.pinataJwt = options.pinataJwt ?? process.env.PINATA_JWT ?? "";
    this.rpcUrl = options.rpcUrl ?? config.solana.rpcUrl;
    this.confirmationTimeoutMs = options.confirmationTimeoutMs ?? config.solana.confirmationTimeoutMs;
    this.confirmationPollMs = options.confirmationPollMs ?? config.solana.confirmationPollMs;
  }

  validateLaunchGates(deploymentAttempt) {
    const diagnostics = getDeployPrivateSignerDiagnostics();
    const finalGate = deploymentAttempt.payload?.finalLaunchGate || {};
    const identity = deploymentAttempt.payload?.identity?.selected || {};
    const errors = [];

    if (!config.launch.enableRealLaunches) errors.push("real_launches_disabled");
    if (config.wallets.signerDisabled) errors.push("signer_disabled");
    if (!diagnostics.privateKeyPresent) errors.push("deploy_private_key_missing");
    if (!diagnostics.publicKeyMatch) errors.push("deploy_public_private_key_mismatch");
    if (!diagnostics.liveSignerReady) errors.push(`deploy_signer_not_ready:${diagnostics.reason}`);
    if (!finalGate.readyForFutureLiveLaunch) errors.push("final_launch_gate_not_ready");
    if (Number(identity.tickerQualityScore || 0) < 75) errors.push("ticker_quality_below_threshold");
    if (Number(identity.namingQualityScore || 0) < 75) errors.push("naming_quality_below_threshold");
    if (Number(identity.identityCohesionScore || 0) < 75) errors.push("identity_cohesion_below_threshold");
    if (deploymentAttempt.payload?.transactionSimulation?.status !== "success" && deploymentAttempt.simulationResult?.status !== "success") {
      errors.push("transaction_simulation_not_success");
    }
    if (deploymentAttempt.saturationSafety && !deploymentAttempt.saturationSafety.allowed) errors.push("saturation_safety_failed");
    if (!this.pinataJwt) errors.push("pinata_jwt_missing");
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

  async execute(deploymentAttempt, { sendTelegram = false, persist = config.launch.enableRealLaunches } = {}) {
    const gates = this.validateLaunchGates(deploymentAttempt);
    if (!gates.allowed) {
      return {
        status: "blocked",
        deploymentState: "failed",
        failureClass: "validation_failure",
        gates,
      };
    }

    const metadata = deploymentAttempt.payload?.metadata || {};
    const imageUpload = await this.uploadLaunchImage(deploymentAttempt);
    const metadataUpload = await this.uploadMetadataJson(deploymentAttempt, imageUpload.imageUri);
    const mintKeypair = this.KeypairClass.generate();
    const mint = mintKeypair.publicKey.toBase58();
    const txRequest = this.buildCreateTransactionRequest(deploymentAttempt, metadataUpload.metadataUri, mint);
    const serialized = await this.requestCreateTransaction(txRequest);
    const signedTransaction = this.signLocalTransaction(serialized, mintKeypair);
    const confirmationStartedAt = Date.now();
    const confirmation = await this.broadcastAndConfirm(signedTransaction.transaction);
    const confirmationLatencyMs = Date.now() - confirmationStartedAt;
    if (!confirmation.confirmed) {
      return {
        status: confirmation.status === "timeout" ? "timeout" : "failed",
        deploymentState: "failed",
        failureClass: confirmation.status === "timeout" ? "timeout" : "chain_failure",
        recoveryPath: confirmation.status === "timeout" ? "retry_confirmation_polling" : "dropped_tx_recovery_review",
        confirmation,
        confirmationLatencyMs,
      };
    }
    const launchedToken = {
      name: metadata.name || deploymentAttempt.payload?.token?.name || "",
      ticker: metadata.symbol || deploymentAttempt.ticker || "",
      contractAddress: mint,
      launchUrl: `${PUMP_FUN_BASE}/${mint}`,
      platform: "Pump.fun / PumpPortal",
      imageSource: metadata.imageUpload?.imageSource || "SOURCE POST MEDIA",
      buybackRoute: "pending",
      txSignature: confirmation.signature,
      txUrl: `https://solscan.io/tx/${confirmation.signature}`,
      launchScore: deploymentAttempt.payload?.launchContext?.launchReadiness,
      launchReasons: deploymentAttempt.payload?.launchContext?.launchReasoning || [],
    };
    const result = {
      status: "confirmed",
      deploymentState: "confirmed",
      mint,
      contractAddress: mint,
      txSignature: confirmation.signature,
      metadataUri: metadataUpload.metadataUri,
      imageUri: imageUpload.imageUri,
      imageCid: imageUpload.cid,
      metadataCid: metadataUpload.cid,
      launchTimestamp: this.now().toISOString(),
      confirmationLatencyMs,
      launchScore: deploymentAttempt.payload?.launchContext?.launchReadiness,
      selectedIdentity: deploymentAttempt.payload?.identity?.selected || {},
      sourceNarrativeCluster: deploymentAttempt.clusterId,
      sourcePostUrl: metadata.sourceBacklink || deploymentAttempt.payload?.sourceUrl || "",
      sourcePlatform: metadata.sourcePlatform || deploymentAttempt.payload?.metadata?.sourcePlatform || "memory",
      confirmation,
      launchedToken,
    };
    deploymentAttempt.launchResult = result;
    deploymentAttempt.mint = result.mint;
    deploymentAttempt.contractAddress = result.contractAddress;
    deploymentAttempt.txSignature = result.txSignature;
    deploymentAttempt.metadataUri = result.metadataUri;
    deploymentAttempt.imageUri = result.imageUri;
    deploymentAttempt.imageCid = result.imageCid;
    deploymentAttempt.metadataCid = result.metadataCid;
    deploymentAttempt.launchTimestamp = result.launchTimestamp;
    deploymentAttempt.confirmationLatencyMs = result.confirmationLatencyMs;
    deploymentAttempt.launchScore = result.launchScore;
    deploymentAttempt.selectedIdentity = result.selectedIdentity;
    deploymentAttempt.sourcePostUrl = result.sourcePostUrl;
    deploymentAttempt.sourcePlatform = result.sourcePlatform;
    deploymentAttempt.deploymentState = "confirmed";

    if (persist) await saveDeploymentAttempt(deploymentAttempt);

    if (sendTelegram) {
      await sendLaunchCreatedAlert({
        trend: {
          sourcePlatform: result.sourcePlatform,
          sourceUrl: result.sourcePostUrl,
        },
        launchBrief: {
          sourceUrl: result.sourcePostUrl,
          imageSource: launchedToken.imageSource,
          launchReasons: launchedToken.launchReasons,
        },
        launchedToken: {
          ...launchedToken,
          launchScore: deploymentAttempt.payload?.launchContext?.launchReadiness,
        },
      });
    }

    return result;
  }

  async uploadLaunchImage(deploymentAttempt) {
    const imageAsset = deploymentAttempt.payload?.metadata?.imageUpload || {};
    const imageBuffer = await this.resolveImageBuffer(imageAsset);
    const filename = `${safeName(deploymentAttempt.ticker || "oink")}.png`;
    const response = await this.uploadPinataFile({
      filename,
      contentType: imageBuffer.contentType,
      buffer: imageBuffer.buffer,
    });
    return {
      cid: response.cid,
      imageUri: `https://ipfs.io/ipfs/${response.cid}`,
      source: imageAsset.imageSource || imageBuffer.source,
    };
  }

  async uploadMetadataJson(deploymentAttempt, imageUri) {
    const metadata = deploymentAttempt.payload?.metadata || {};
    const metadataJson = {
      name: metadata.name || deploymentAttempt.payload?.token?.name || "",
      symbol: metadata.symbol || deploymentAttempt.ticker || "",
      image: imageUri,
      description: metadata.description || deploymentAttempt.payload?.token?.description || "",
      twitter: metadata.twitter || config.metadata.twitter || "",
      telegram: metadata.telegram || config.metadata.telegram || "",
      website: metadata.website || config.metadata.website || "",
    };
    const response = await this.uploadPinataFile({
      filename: `${safeName(metadataJson.symbol || "oink")}-metadata.json`,
      contentType: "application/json",
      buffer: Buffer.from(JSON.stringify(metadataJson)),
    });
    return {
      cid: response.cid,
      metadataUri: `https://ipfs.io/ipfs/${response.cid}`,
      metadataJson,
    };
  }

  async uploadPinataFile({ filename, contentType, buffer }) {
    const form = new FormData();
    form.append("network", "public");
    form.append("file", new Blob([buffer], { type: contentType }), filename);
    const res = await this.fetchImpl(config.pinata.uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.pinataJwt}`,
      },
      body: form,
    });
    const body = await readJsonSafe(res);
    if (!res.ok) {
      throw new Error(`Pinata upload failed: ${res.status} ${body?.error || body?.message || res.statusText || ""}`.trim());
    }
    const cid = body?.data?.cid || body?.cid || body?.IpfsHash;
    if (!cid) throw new Error("Pinata upload response missing CID");
    return { cid, body };
  }

  buildCreateTransactionRequest(deploymentAttempt, metadataUri, mint) {
    const metadata = deploymentAttempt.payload?.metadata || {};
    return {
      publicKey: config.wallets.deployPublicKey,
      action: "create",
      tokenMetadata: {
        name: metadata.name || deploymentAttempt.payload?.token?.name || "",
        symbol: metadata.symbol || deploymentAttempt.ticker || "",
        uri: metadataUri,
      },
      mint,
      denominatedInSol: "true",
      amount: config.pumpPortal.createAmount,
      slippage: config.pumpPortal.slippage,
      priorityFee: config.pumpPortal.priorityFee,
      pool: config.pumpPortal.pool || "pump",
    };
  }

  async requestCreateTransaction(body) {
    const res = await this.fetchImpl(`${config.pumpPortal.apiBaseUrl.replace(/\/$/, "")}/trade-local`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await readTextSafe(res);
      throw new Error(`PumpPortal trade-local failed: ${res.status} ${text || res.statusText || ""}`.trim());
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  signLocalTransaction(serializedTransaction, mintKeypair) {
    const deploySecret = getDeploySecretKeyBytesForSigning();
    if (!deploySecret.ok) throw new Error(`Deploy signer unavailable: ${deploySecret.reason}`);
    const deployKeypair = this.KeypairClass.fromSecretKey(deploySecret.secretKeyBytes);
    const tx = this.VersionedTransactionClass.deserialize(serializedTransaction);
    tx.sign([mintKeypair, deployKeypair]);
    return {
      transaction: tx,
      signerPublicKey: deployKeypair.publicKey.toBase58(),
      mintPublicKey: mintKeypair.publicKey.toBase58(),
    };
  }

  async broadcastAndConfirm(transaction) {
    const connection = new this.ConnectionClass(this.rpcUrl, "confirmed");
    const signature = typeof connection.sendTransaction === "function"
      ? await connection.sendTransaction(transaction)
      : await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });
    return confirmSignature({
      connection,
      signature,
      timeoutMs: this.confirmationTimeoutMs,
      pollMs: this.confirmationPollMs,
    });
  }

  async resolveImageBuffer(imageAsset) {
    if (imageAsset.localPath) {
      const fs = await import("node:fs/promises");
      return {
        buffer: await fs.readFile(imageAsset.localPath),
        contentType: imageAsset.mimeType || "image/png",
        source: "local_path",
      };
    }
    const url = imageAsset.uploadedImageUrl || imageAsset.imageUrl || imageAsset.image || imageAsset.sourceMediaUrl;
    if (!url || !isHttpsUrl(url)) throw new Error("Launch image must be an HTTPS URL or local path before Pinata upload");
    const res = await this.fetchImpl(url, {
      headers: { "User-Agent": "OINK PumpPortal local launch image fetch/1.0" },
    });
    if (!res.ok) throw new Error(`Image download failed before Pinata upload: ${res.status}`);
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers?.get?.("content-type") || imageAsset.mimeType || "image/png",
      source: "remote_url",
    };
  }
}

export async function executePumpPortalLocalLaunch(deploymentAttempt, options = {}) {
  return new PumpPortalLocalLaunchFlow(options).execute(deploymentAttempt, options);
}

export async function uploadPinataLaunchAsset(input, options = {}) {
  return new PumpPortalLocalLaunchFlow(options).uploadPinataFile(input);
}

export async function confirmSignature({ connection, signature, timeoutMs = 60000, pollMs = 2500 }) {
  const started = Date.now();
  let attempts = 0;
  while (Date.now() - started <= timeoutMs) {
    attempts += 1;
    const statuses = await connection.getSignatureStatuses([signature]);
    const status = statuses?.value?.[0];
    if (status?.err) {
      return { signature, status: "failed", confirmed: false, attempts, error: status.err };
    }
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return { signature, status: status.confirmationStatus, confirmed: true, attempts };
    }
    await sleep(pollMs);
  }
  return { signature, status: "timeout", confirmed: false, attempts };
}

async function readJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function readTextSafe(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function safeName(value = "oink") {
  return String(value || "oink").replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "oink";
}

function isHttpsUrl(url) {
  try {
    return new URL(String(url || "")).protocol === "https:";
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
