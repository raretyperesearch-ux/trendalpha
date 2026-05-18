import { config } from "./config.js";
import { saveDeploymentAttempt } from "./db.js";
import { executePumpPortalLocalLaunch } from "./launchers/pumpPortalLocalFlow.js";

const LIVE_SOURCE_PLATFORMS = new Set(["x", "tiktok"]);

export function evaluateLiveLaunchBridge(deploymentAttempt, { token = null, sourcePlatform = "" } = {}) {
  const payload = deploymentAttempt?.payload || {};
  const finalGate = payload.finalLaunchGate || {};
  const checks = finalGate.checks || {};
  const identity = payload.identity?.selected || {};
  const metadata = payload.metadata || {};
  const source = sourcePlatform || metadata.sourcePlatform || payload.sourcePlatform || deploymentAttempt?.sourcePlatform || "";
  const blocks = [];

  if (!config.launch.enableRealLaunches) blocks.push("ENABLE_REAL_LAUNCHES=false");
  if (!config.launch.enableLiveLaunchFromScan) blocks.push("ENABLE_LIVE_LAUNCH_FROM_SCAN=false");
  if (config.wallets.signerDisabled) blocks.push("SIGNER_DISABLED=true");
  if (!checks.liveSignerReady) blocks.push("deploy_signer_not_live_ready");
  if (!finalGate.readyForFutureLiveLaunch) blocks.push("final_launch_gate_not_ready");
  if (!checks.walletConfigValid) blocks.push("wallet_config_invalid");
  if (!metadata.hostedMetadataUrl && !payload.finalMetadataPreview?.metadataUrl) blocks.push("metadata_not_hosted");
  if (!metadata.image && !payload.finalMetadataPreview?.imageUrl) blocks.push("image_not_hosted");
  if (!identityQualityPasses(identity)) blocks.push("identity_quality_below_threshold");
  if (deploymentAttempt?.saturationSafety && !deploymentAttempt.saturationSafety.allowed) blocks.push("saturation_safety_failed");
  if (payload.transactionSimulation?.status !== "success" && deploymentAttempt?.simulationResult?.status !== "success") {
    blocks.push("transaction_simulation_not_success");
  }
  if (!LIVE_SOURCE_PLATFORMS.has(source)) blocks.push(`unsupported_source_platform:${source || "unknown"}`);
  if (token?.matchStatus === "canonical" || payload.marketStatus === "canonical" || payload.narrative?.marketStatus === "canonical") {
    blocks.push("canonical_market_already_exists");
  }

  return {
    allowed: blocks.length === 0,
    blocks: [...new Set(blocks)],
    sourcePlatform: source,
  };
}

export async function maybeExecuteLiveLaunchFromScan(deploymentAttempt, {
  token = null,
  sourcePlatform = "",
  executeImpl = executePumpPortalLocalLaunch,
  persistFailure = true,
} = {}) {
  const decision = evaluateLiveLaunchBridge(deploymentAttempt, { token, sourcePlatform });

  if (!config.launch.enableRealLaunches) {
    console.log("   🛑 Live launch skipped: ENABLE_REAL_LAUNCHES=false");
    return { status: "skipped", decision };
  }
  if (!config.launch.enableLiveLaunchFromScan) {
    console.log("   🛑 Live launch skipped: ENABLE_LIVE_LAUNCH_FROM_SCAN=false");
    return { status: "skipped", decision };
  }
  if (!decision.allowed) {
    console.log(`   🛑 Live launch blocked for $${deploymentAttempt?.ticker || "UNKNOWN"}:`);
    for (const block of decision.blocks) console.log(`      - ${block}`);
    return { status: "blocked", decision };
  }

  try {
    console.log(`   🚀 Live PumpPortal launch execution starting: $${deploymentAttempt.ticker}`);
    const result = await executeImpl(deploymentAttempt, { sendTelegram: true, persist: true });
    if (result?.status === "confirmed") {
      console.log(`   ✅ Live launch confirmed: $${deploymentAttempt.ticker} mint=${result.mint} tx=${result.txSignature}`);
    } else if (result?.status === "blocked") {
      console.log(`   🛑 Live launch blocked by PumpPortal flow: ${result.gates?.errors?.join(", ") || "unknown"}`);
    } else {
      console.log(`   ⚠️ Live launch ended with status=${result?.status || "unknown"}`);
    }
    return { status: result?.status || "unknown", decision, result };
  } catch (err) {
    console.error(`   ❌ Live launch failed for $${deploymentAttempt?.ticker || "UNKNOWN"}: ${err.message}`);
    deploymentAttempt.deploymentState = "failed";
    deploymentAttempt.failureClass = classifyLiveLaunchFailure(err);
    deploymentAttempt.failure = {
      failureClass: deploymentAttempt.failureClass,
      message: err.message,
      stage: "scan_live_launch_bridge",
    };
    if (persistFailure) await saveDeploymentAttempt(deploymentAttempt);
    return {
      status: "failed",
      decision,
      error: err.message,
      failureClass: deploymentAttempt.failureClass,
    };
  }
}

function identityQualityPasses(identity = {}) {
  return Number(identity.tickerQualityScore || 0) >= 75 &&
    Number(identity.namingQualityScore || 0) >= 75 &&
    Number(identity.identityCohesionScore || 0) >= 75;
}

function classifyLiveLaunchFailure(err) {
  const message = String(err?.message || "").toLowerCase();
  if (message.includes("pinata") || message.includes("metadata")) return "metadata_failure";
  if (message.includes("image") || message.includes("upload")) return "upload_failure";
  if (message.includes("trade-local") || message.includes("pumpportal")) return "provider_failure";
  if (message.includes("signer") || message.includes("wallet")) return "validation_failure";
  if (message.includes("confirm") || message.includes("rpc") || message.includes("transaction")) return "chain_failure";
  return "provider_failure";
}
