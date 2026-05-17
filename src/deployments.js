import { preparePumpPortalDeployment, preparePumpPortalMetadataPackage } from "./launchers/pumpPortalProvider.js";
import { saveDeploymentAttempt, saveLaunchAsset } from "./db.js";
import { sendDeploymentReadyAlert, sendMetadataReadyAlert } from "./telegram.js";
import { buildIdempotencyKey, createDeploymentStateMachine, classifyDeploymentFailure } from "./deploymentStateMachine.js";
import { evaluateLaunchSaturationSafety } from "./saturationSafety.js";
import { simulateTransaction } from "./transactionSimulation.js";
import { createSignerIsolationManager } from "./walletIsolation.js";
import { createLaunchObservationQueue } from "./observationQueue.js";

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
      if (machine.state !== "failed") machine.transition("assets_hosted", { reason: "hosted_assets_ready" });
    } else if (machine.state !== "failed") {
      machine.fail("metadata_failure", "Hosted metadata validation failed", { errors: hostedMetadata.metadataValidation.errors });
    }
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

async function prepareHostedMetadataForAttempt(deploymentAttempt) {
  try {
    if (!deploymentAttempt.payload?.metadata?.imageUpload) return null;
    const hosted = await preparePumpPortalMetadataPackage(deploymentAttempt);
    if (hosted.metadataValidation.valid) {
      console.log(`   🖼️  Hosted metadata prepared: ${hosted.metadataUpload?.metadataUrl || "dry-wire"}`);
      return hosted;
    }
    console.log(`   ⚠️  Hosted metadata not ready: ${hosted.metadataValidation.errors.join(", ") || hosted.imageValidation.errors.join(", ")}`);
    return hosted;
  } catch (err) {
    console.warn(`   ⚠️  Hosted metadata preparation skipped: ${err.message}`);
    deploymentAttempt.failureClass = classifyDeploymentFailure(err);
    return null;
  }
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
