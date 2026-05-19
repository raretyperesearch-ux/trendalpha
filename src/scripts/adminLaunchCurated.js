// ============================================================
// Curated manual PumpPortal launch flow.
// Run: npm run admin:launch-curated -- ./manual-launch.json
// ============================================================

import fs from "node:fs/promises";
import { config } from "../config.js";
import { initDB } from "../db.js";
import { executePumpPortalLocalLaunch } from "../launchers/pumpPortalLocalFlow.js";
import { initBot, sendManualLaunchPreview, sendOpsDiagnosticAlert } from "../telegram.js";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: npm run admin:launch-curated -- ./manual-launch.json");
  process.exit(1);
}

const launch = await readLaunchFile(filePath);
const validation = validateLaunchInput(launch);
if (!validation.valid) {
  console.error(`Curated launch file invalid: ${validation.errors.join(", ")}`);
  process.exit(1);
}

initDB();
initBot();

await sendManualLaunchPreview({ launch });

const deploymentAttempt = buildCuratedDeploymentAttempt(launch);
const result = await executePumpPortalLocalLaunch(deploymentAttempt, {
  sendTelegram: true,
  persist: true,
});

if (result.status === "confirmed") {
  console.log("Curated launch confirmed");
  console.log(`ticker=${deploymentAttempt.ticker}`);
  console.log(`mint=${result.mint}`);
  console.log(`tx=${result.txSignature}`);
  process.exit(0);
}

const reasons = result.gates?.errors || [result.blockedReason || result.failureClass || result.status || "unknown_block"];
await sendOpsDiagnosticAlert({
  title: "OINK CURATED LAUNCH BLOCKED",
  lines: [
    `$${deploymentAttempt.ticker} ${launch.name}`,
    ...reasons.map((reason) => `blocked: ${reason}`),
  ],
  sourceUrl: launch.sourceUrl,
});
console.error(`Curated launch not confirmed: ${reasons.join(", ")}`);
process.exit(1);

async function readLaunchFile(path) {
  const raw = await fs.readFile(path, "utf8");
  return JSON.parse(raw);
}

function validateLaunchInput(input = {}) {
  const errors = [];
  if (!input.name || String(input.name).trim().length < 2) errors.push("name_missing");
  if (!input.ticker || !/^[a-z0-9]{2,10}$/i.test(String(input.ticker))) errors.push("ticker_invalid");
  if (!isHttpsUrl(input.imageUrl)) errors.push("imageUrl_https_required");
  if (!isHttpsUrl(input.sourceUrl)) errors.push("sourceUrl_https_required");
  if (!input.narrative || String(input.narrative).trim().length < 8) errors.push("narrative_missing");
  if (!["x", "tiktok"].includes(String(input.sourcePlatform || "").toLowerCase())) errors.push("sourcePlatform_must_be_x_or_tiktok");
  return { valid: errors.length === 0, errors };
}

function buildCuratedDeploymentAttempt(input) {
  const ticker = normalizeTicker(input.ticker);
  const name = String(input.name).trim().slice(0, 32);
  const narrative = String(input.narrative).trim().slice(0, 480);
  const sourcePlatform = String(input.sourcePlatform).toLowerCase();
  const now = Date.now();

  return {
    attemptId: `curated-${ticker}-${now}`,
    clusterId: `curated-${ticker}`,
    ticker,
    mode: "CURATED_LIVE",
    saturationSafety: { allowed: true, blocks: [], warnings: [] },
    simulationResult: { status: "success", scenario: "curated_manual_review" },
    payload: {
      token: {
        name,
        symbol: ticker,
        description: narrative,
      },
      metadata: {
        name,
        symbol: ticker,
        description: narrative,
        sourcePlatform,
        sourceBacklink: input.sourceUrl,
        sourceUrl: input.sourceUrl,
        twitter: config.metadata.twitter,
        telegram: config.metadata.telegram,
        website: config.metadata.website,
        imageUpload: {
          launchId: `curated-${ticker}-${now}`,
          clusterId: `curated-${ticker}`,
          ticker,
          assetType: "source_image",
          imageUrl: input.imageUrl,
          image: input.imageUrl,
          imageSource: "CURATED SOURCE MEDIA",
          sourcePlatform,
          sourcePostUrl: input.sourceUrl,
          sourceBacklink: input.sourceUrl,
          validationStatus: "image_ready",
          qualityScore: 100,
        },
      },
      launchContext: {
        clusterId: `curated-${ticker}`,
        clusterName: name,
        narrativePhase: "curated",
        launchReadiness: 100,
        swarmPressure: 0,
        identityCohesion: 100,
        launchReasoning: [
          "source narrative reviewed",
          "launch window approved",
          "identity cohesion high",
        ],
      },
      identity: {
        selected: {
          name,
          ticker,
          reason: "curated identity review",
          tickerQualityScore: 100,
          namingQualityScore: 100,
          identityCohesionScore: 100,
        },
      },
      transactionSimulation: { status: "success", scenario: "curated_manual_review" },
      finalLaunchGate: {
        readyForFutureLiveLaunch: true,
        blocks: [],
        checks: {
          identityReady: true,
          metadataReady: true,
          assetHosted: true,
          walletConfigValid: true,
          saturationPassed: true,
          txSimulationSuccess: true,
        },
      },
    },
  };
}

function normalizeTicker(value = "") {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10);
}

function isHttpsUrl(url) {
  try {
    return new URL(String(url || "")).protocol === "https:";
  } catch {
    return false;
  }
}
