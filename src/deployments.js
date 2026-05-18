import { preparePumpPortalDeployment, preparePumpPortalMetadataPackage } from "./launchers/pumpPortalProvider.js";
import { saveDeploymentAttempt, saveLaunchAsset } from "./db.js";
import { sendDeploymentReadyAlert, sendMetadataReadyAlert } from "./telegram.js";
import { buildIdempotencyKey, createDeploymentStateMachine, classifyDeploymentFailure } from "./deploymentStateMachine.js";
import { evaluateLaunchSaturationSafety } from "./saturationSafety.js";
import { simulateTransaction } from "./transactionSimulation.js";
import { createSignerIsolationManager } from "./walletIsolation.js";
import { createLaunchObservationQueue } from "./observationQueue.js";
import { config } from "./config.js";

export async function prepareAndPersistDeploymentAttempt(shadowLaunch, {
  existingTickers = [],
  sendTelegram = true,
  safetyHistory = [],
} = {}) {
  const machine = createDeploymentStateMachine({
    attemptId: `deploy-${shadowLaunch.clusterId || "cluster"}-${shadowLaunch.ticker || "OINK"}`,
    idempotencyKey: buildIdempotencyKey({
      clusterId: shadowLaunch.clusterId,
      ticker: shadowLaunch.ticker,
      launchId: shadowLaunch.launchId,
    }),
  });
  machine.transition("clustered", { reason: "shadow_launch_clustered" });
  machine.transition("identity_ready", { reason: "dry_run_identity_ready" });

  const safety = evaluateLaunchSaturationSafety({
    cluster: shadowLaunch.payload?.narrative || {
      clusterId: shadowLaunch.clusterId,
      canonicalEntity: shadowLaunch.title,
      launchReadiness: shadowLaunch.launchReadiness,
      swarmPressure: shadowLaunch.swarmPressure,
      saturationPressure: shadowLaunch.payload?.launchTiming?.saturationTiming === "immediate_risk" ? 80 : 0,
    },
    shadowLaunch,
    history: safetyHistory,
  });

  if (!safety.allowed) {
    machine.fail("duplicate_launch", `Saturation safety blocked deployment: ${safety.blocks.join(", ")}`, { safety });
  }

  const deploymentAttempt = preparePumpPortalDeployment(shadowLaunch, { existingTickers });
  deploymentAttempt.saturationSafety = safety;
  deploymentAttempt.idempotencyKey = machine.idempotencyKey;
  const hostedMetadata = await prepareHostedMetadataForAttempt(deploymentAttempt);
  if (hostedMetadata) {
    deploymentAttempt.payload.hostedMetadata = hostedMetadata;
    if (hostedMetadata.metadataValidation.valid) {
      if (machine.state !== "failed") machine.transition("metadata_ready", { reason: "metadata_json_ready" });
      deploymentAttempt.payload.metadata.image = hostedMetadata.metadataJson.image;
      deploymentAttempt.payload.metadata.hostedMetadataUrl = hostedMetadata.metadataUpload?.metadataUrl || "";
      deploymentAttempt.payload.metadata.imageUpload = hostedMetadata.launchAsset;
      deploymentAttempt.payload.finalMetadataPreview = buildFinalMetadataPreview(deploymentAttempt, hostedMetadata);
      if (machine.state !== "failed") machine.transition("assets_hosted", { reason: "hosted_assets_ready" });
    } else if (machine.state !== "failed") {
      machine.fail("metadata_failure", "Hosted metadata validation failed", { errors: hostedMetadata.metadataValidation.errors });
    }
  } else if (machine.state !== "failed") {
    machine.fail("metadata_failure", "Hosted metadata could not be prepared", {
      provider: getMetadataProviderName(),
    });
  }
  if (machine.state !== "failed") machine.transition("payload_ready", { reason: "provider_payload_ready" });
  if (machine.state !== "failed" && deploymentAttempt.validation.valid) machine.transition("validation_passed", { reason: "payload_validation_passed" });
  else if (machine.state !== "failed") machine.fail("validation_failure", "Payload validation failed", { errors: deploymentAttempt.validation.errors });
  if (machine.state !== "failed") machine.transition("deployment_prepared", { reason: "dry_wire_deployment_prepared" });
  const signer = createSignerIsolationManager();
  const signature = signer.simulateSign({ role: "deploy_wallet", payload: deploymentAttempt.payload });
  deploymentAttempt.walletDiagnostics = signer.getDiagnostics();
  deploymentAttempt.signatureSimulation = signature;
  deploymentAttempt.simulationResult = simulateTransaction(deploymentAttempt, { scenario: "success" });
  deploymentAttempt.payload.transactionSimulation = deploymentAttempt.simulationResult;
  deploymentAttempt.payload.finalLaunchGate = evaluateFinalLaunchGate(deploymentAttempt);
  const queue = createLaunchObservationQueue();
  const observation = queue.enqueue(shadowLaunch, deploymentAttempt);
  deploymentAttempt.observationState = observation.state;
  deploymentAttempt.payload.observation = {
    observationId: observation.observationId,
    state: observation.state,
    calibration: observation.calibration,
  };
  deploymentAttempt.deploymentState = machine.state;
  deploymentAttempt.stateTimeline = machine.timeline;
  deploymentAttempt.failure = machine.failure;
  deploymentAttempt.payload.deploymentStateMachine = machine.snapshot();

  logDeploymentAttempt(deploymentAttempt);
  const saved = await saveDeploymentAttempt(deploymentAttempt);
  if (saved) console.log(`   💾 Deployment attempt saved: ${deploymentAttempt.attemptId}`);
  if (deploymentAttempt.payload?.metadata?.imageUpload) {
    const assetSaved = await saveLaunchAsset(deploymentAttempt.payload.metadata.imageUpload);
    if (assetSaved) console.log(`   🖼️  Launch asset saved: ${deploymentAttempt.payload.metadata.imageUpload.validationStatus}`);
  }

  if (sendTelegram && deploymentAttempt.validation.valid && deploymentAttempt.deploymentState !== "failed") {
    await sendMetadataReadyAlert(deploymentAttempt);
    await sendDeploymentReadyAlert(deploymentAttempt);
  }

  return deploymentAttempt;
}

function buildFinalMetadataPreview(deploymentAttempt, hostedMetadata) {
  const metadata = hostedMetadata.metadataJson || deploymentAttempt.payload?.metadata || {};
  return {
    name: metadata.name || deploymentAttempt.payload?.token?.name || "",
    symbol: metadata.symbol || deploymentAttempt.ticker || "",
    description: metadata.description || deploymentAttempt.payload?.token?.description || "",
    imageUrl: metadata.image || "",
    metadataUrl: hostedMetadata.metadataUpload?.metadataUrl || "",
    sourceBacklink: metadata.oink?.sourceBacklink || deploymentAttempt.payload?.metadata?.sourceBacklink || "",
    sloganFragments: metadata.oink?.sloganFragments || deploymentAttempt.payload?.metadata?.sloganFragments || [],
  };
}

function evaluateFinalLaunchGate(deploymentAttempt) {
  const payload = deploymentAttempt.payload || {};
  const identity = payload.identity?.selected || {};
  const asset = payload.metadata?.imageUpload || {};
  const walletConfigValid = Boolean(config.wallets.roleConfigValid);
  const liveSignerReady = (deploymentAttempt.walletDiagnostics || []).some((item) => item.role === "deploy_wallet" && item.liveSignerReady);
  const blocks = [];
  if (Number(identity.tickerQualityScore || 0) < 75 || Number(identity.namingQualityScore || 0) < 75 || Number(identity.identityCohesionScore || 0) < 75) {
    blocks.push("identity_not_ready");
  }
  if (payload.metadataState !== "metadata_ready" || payload.metadataValidation?.valid === false) blocks.push("metadata_not_ready");
  if (!asset.uploadedImageUrl && !asset.metadataUrl) blocks.push("asset_not_hosted");
  if (!walletConfigValid) blocks.push("wallet_config_invalid");
  if (!asset.validationStatus || asset.assetType === "placeholder") blocks.push("image_not_launch_ready");
  if (!deploymentAttempt.saturationSafety?.allowed) blocks.push("saturation_safety_failed");
  if (deploymentAttempt.simulationResult?.status !== "success") blocks.push("transaction_simulation_not_success");
  if (!payload.finalMetadataPreview?.imageUrl || !payload.finalMetadataPreview?.metadataUrl) blocks.push("metadata_preview_incomplete");
  return {
    readyForFutureLiveLaunch: blocks.length === 0,
    blocks,
    checks: {
      identityReady: !blocks.includes("identity_not_ready"),
      metadataReady: !blocks.includes("metadata_not_ready"),
      assetHosted: !blocks.includes("asset_not_hosted"),
      walletConfigValid,
      signerDisabled: (deploymentAttempt.walletDiagnostics || []).every((item) => item.signerDisabled),
      liveSignerReady,
      saturationSafetyPassed: !blocks.includes("saturation_safety_failed"),
      transactionSimulationSuccess: !blocks.includes("transaction_simulation_not_success"),
    },
  };
}

async function prepareHostedMetadataForAttempt(deploymentAttempt) {
  const provider = getMetadataProviderName();
  try {
    if (!deploymentAttempt.payload?.metadata?.imageUpload) {
      console.log(`   🧾 metadata_provider=${provider} hosted_metadata_ready=false`);
      return null;
    }
    const hosted = await preparePumpPortalMetadataPackage(deploymentAttempt);
    const loggedProvider = normalizeMetadataProviderName(hosted.report?.uploadProvider || provider);
    console.log(
      `   🧾 metadata_provider=${loggedProvider} ` +
      `hosted_metadata_ready=${hosted.metadataValidation.valid ? "true" : "false"}`
    );
    if (hosted.metadataValidation.valid) {
      console.log(`   🖼️  Hosted metadata prepared: ${hosted.metadataUpload?.metadataUrl || "dry-wire"}`);
      return hosted;
    }
    console.log(`   ⚠️  Hosted metadata not ready: ${hosted.metadataValidation.errors.join(", ") || hosted.imageValidation.errors.join(", ")}`);
    return hosted;
  } catch (err) {
    console.warn(`   ⚠️  Hosted metadata preparation skipped: metadata_provider=${provider} hosted_metadata_ready=false ${err.message}`);
    deploymentAttempt.failureClass = classifyDeploymentFailure(err);
    return null;
  }
}

function getMetadataProviderName() {
  if (config.launch.enableRealLaunches && config.pinata.jwtPresent) return "pinata";
  return config.metadata.uploadProvider || config.metadata.assetHostingProvider || "dry_wire";
}

function normalizeMetadataProviderName(provider = "") {
  if (provider === "pinata_ipfs") return "pinata";
  return provider || "dry_wire";
}

function logDeploymentAttempt(attempt) {
  console.log(
    `   🧷 PumpPortal ${attempt.mode}: $${attempt.ticker} ` +
    `state=${attempt.deploymentState} valid=${attempt.validation.valid ? "yes" : "no"}`
  );
  if (attempt.validation.errors.length > 0) {
    console.log(`      Validation failures: ${attempt.validation.errors.join(", ")}`);
  }
  if (attempt.validation.warnings.length > 0) {
    console.log(`      Validation warnings: ${attempt.validation.warnings.join(", ")}`);
  }
  for (const entry of attempt.auditLog.slice(0, 5)) {
    console.log(`      audit:${entry.stage}:${entry.status} ${entry.message}`);
  }
}
