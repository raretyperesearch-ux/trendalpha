import { config } from "./config.js";
import { prepareDryRunPumpPortalLaunch } from "./launchers/dryRunPumpPortalProvider.js";
import {
  getMemoryOnlyLaunchClusters,
  getRecentShadowLaunchTickers,
  saveShadowLaunch,
  wasShadowLaunchPreparedRecently,
} from "./db.js";
import { sendDryRunLaunchAlert } from "./telegram.js";
import { prepareAndPersistDeploymentAttempt } from "./deployments.js";

export async function runMemoryOnlyLaunchTest({
  force = false,
  sendTelegram = true,
  limit = 5,
  hours = 168,
} = {}) {
  if (!force && !config.launch.memoryOnlyLaunchTestMode) {
    console.log("🧠 Memory-only launch test mode disabled");
    return { loaded: 0, rejected: 0, generated: 0, saved: 0, alerted: 0 };
  }

  console.log("🧠 MEMORY-ONLY DRY-RUN LAUNCH MODE");
  console.log(`   Window: last ${hours}h`);
  console.log("   Criteria: readiness >= 75, persistence >= 70, swarm <= 40");

  const clusters = await getMemoryOnlyLaunchClusters({ hours, limit: limit * 3 });
  console.log(`   Clusters loaded: ${clusters.length}`);

  const stats = { loaded: clusters.length, rejected: 0, generated: 0, saved: 0, alerted: 0 };
  if (clusters.length === 0) {
    console.log("   No stored clusters met memory-only launch criteria");
    console.log(
      `🧠 Memory-only dry-run complete: loaded=${stats.loaded}, rejected=${stats.rejected}, ` +
      `generated=${stats.generated}, saved=${stats.saved}, alerted=${stats.alerted}`
    );
    return stats;
  }

  const existingTickers = await getRecentShadowLaunchTickers();

  for (const cluster of clusters) {
    if (stats.generated >= limit) break;

    const rejection = getMemoryLaunchRejection(cluster);
    if (rejection) {
      stats.rejected++;
      console.log(
        `   🧪 Rejected ${cluster.canonicalEntity}: ${rejection} ` +
        `(readiness=${cluster.launchReadiness}/100 persistence=${cluster.propagationPersistence}/100 swarm=${cluster.swarmPressure}/100)`
      );
      continue;
    }

    if (await wasShadowLaunchPreparedRecently(cluster.clusterId)) {
      stats.rejected++;
      console.log(`   ⏭️  Rejected ${cluster.canonicalEntity}: shadow_launch_recently_prepared`);
      continue;
    }

    const shadowLaunch = prepareDryRunPumpPortalLaunch(cluster, { existingTickers });
    stats.generated++;
    console.log(`   ✅ Payload generated: ${shadowLaunch.title} ($${shadowLaunch.ticker})`);

    const saved = await saveShadowLaunch(shadowLaunch);
    if (saved) {
      stats.saved++;
      console.log(`   💾 Shadow launch saved: ${shadowLaunch.launchId}`);
    }

    if (sendTelegram) {
      const alerted = await sendDryRunLaunchAlert(shadowLaunch);
      if (alerted) stats.alerted++;
    }

    await prepareAndPersistDeploymentAttempt(shadowLaunch, {
      existingTickers,
      sendTelegram,
    });
    existingTickers.push(shadowLaunch.ticker);
  }

  console.log(
    `🧠 Memory-only dry-run complete: loaded=${stats.loaded}, rejected=${stats.rejected}, ` +
    `generated=${stats.generated}, saved=${stats.saved}, alerted=${stats.alerted}`
  );
  return stats;
}

export function getMemoryLaunchRejection(cluster) {
  if (!cluster) return "missing_cluster";
  if (Number(cluster.launchReadiness || 0) < 75) return "launch_readiness_below_75";
  if (Number(cluster.propagationPersistence || 0) < 70) return "persistence_below_70";
  if (Number(cluster.swarmPressure || 0) > 40) return "swarm_pressure_above_40";
  if (cluster.launchWindow === "SATURATED" || cluster.launchWindow === "LATE_STAGE") return "late_or_saturated_window";
  if (Number(cluster.saturationPressure || 0) >= 72) return "saturation_pressure_high";
  return null;
}
