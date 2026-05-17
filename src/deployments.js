import { preparePumpPortalDeployment, preparePumpPortalMetadataPackage } from "./launchers/pumpPortalProvider.js";
import { saveDeploymentAttempt, saveLaunchAsset } from "./db.js";
import { sendDeploymentReadyAlert, sendMetadataReadyAlert } from "./telegram.js";

export async function prepareAndPersistDeploymentAttempt(shadowLaunch, {
  existingTickers = [],
  sendTelegram = true,
} = {}) {
  const deploymentAttempt = preparePumpPortalDeployment(shadowLaunch, { existingTickers });
  const hostedMetadata = await prepareHostedMetadataForAttempt(deploymentAttempt);
  if (hostedMetadata) {
    deploymentAttempt.payload.hostedMetadata = hostedMetadata;
    if (hostedMetadata.metadataValidation.valid) {
      deploymentAttempt.payload.metadata.image = hostedMetadata.metadataJson.image;
      deploymentAttempt.payload.metadata.hostedMetadataUrl = hostedMetadata.metadataUpload?.metadataUrl || "";
      deploymentAttempt.payload.metadata.imageUpload = hostedMetadata.launchAsset;
    }
  }

  logDeploymentAttempt(deploymentAttempt);
  const saved = await saveDeploymentAttempt(deploymentAttempt);
  if (saved) console.log(`   💾 Deployment attempt saved: ${deploymentAttempt.attemptId}`);
  if (deploymentAttempt.payload?.metadata?.imageUpload) {
    const assetSaved = await saveLaunchAsset(deploymentAttempt.payload.metadata.imageUpload);
    if (assetSaved) console.log(`   🖼️  Launch asset saved: ${deploymentAttempt.payload.metadata.imageUpload.validationStatus}`);
  }

  if (sendTelegram && deploymentAttempt.validation.valid) {
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
