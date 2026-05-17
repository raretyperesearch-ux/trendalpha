import { preparePumpPortalDeployment } from "./launchers/pumpPortalProvider.js";
import { saveDeploymentAttempt, saveLaunchAsset } from "./db.js";
import { sendDeploymentReadyAlert, sendMetadataReadyAlert } from "./telegram.js";

export async function prepareAndPersistDeploymentAttempt(shadowLaunch, {
  existingTickers = [],
  sendTelegram = true,
} = {}) {
  const deploymentAttempt = preparePumpPortalDeployment(shadowLaunch, { existingTickers });

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
