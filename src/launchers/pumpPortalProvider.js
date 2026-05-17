import { config } from "../config.js";
import { prepareLaunchMetadata } from "../metadataPipeline.js";
import { prepareHostedPumpPortalMetadata } from "../metadataAssets.js";

const DEPLOYMENT_STATES = {
  PREPARING: "preparing",
  VALIDATING: "validating",
  PAYLOAD_READY: "payload_ready",
  SIMULATED: "simulated",
  AWAITING_ACTIVATION: "awaiting_activation",
  DEPLOYED: "deployed",
  FAILED: "failed",
};

export class PumpPortalProvider {
  constructor({ existingTickers = [], enableRealLaunches = config.launch.enableRealLaunches, imageOptions = {} } = {}) {
    this.existingTickers = new Set(existingTickers.map(normalizeTicker).filter(Boolean));
    this.enableRealLaunches = Boolean(enableRealLaunches);
    this.imageOptions = imageOptions;
    this.connected = true;
  }

  prepareDeployment(shadowLaunch) {
    const auditLog = [];
    auditLog.push(audit("payload_generation", "started", "Building PumpPortal deployment request shape"));

    let payload = this.buildDeploymentPayload(shadowLaunch);
    const metadataPipeline = prepareLaunchMetadata(
      { shadowLaunch, deploymentPayload: payload },
      { imageOptions: this.imageOptions }
    );
    payload = {
      ...payload,
      metadata: {
        ...payload.metadata,
        ...metadataPipeline.metadata,
        imagePrompt: payload.metadata.imagePrompt,
        imageUpload: metadataPipeline.imageAsset,
      },
      metadataState: metadataPipeline.state,
      metadataValidation: metadataPipeline.validation,
    };
    auditLog.push(audit("metadata_pipeline", metadataPipeline.state, metadataPipeline.validation.valid ? "Metadata is ready" : metadataPipeline.validation.errors.join("; ")));
    auditLog.push(audit("image_artifact_preparation", metadataPipeline.imageAsset.validationStatus, payload.metadata.imagePrompt ? "Image asset pipeline completed" : "Image prompt missing"));

    auditLog.push(audit("validation", "started", "Validating deployment payload"));
    const validation = this.validateDeploymentPayload(payload);
    auditLog.push(
      validation.valid
        ? audit("validation", "passed", "Deployment payload passed dry-wire validation")
        : audit("validation", "failed", validation.errors.join("; "))
    );

    const deploymentState = validation.valid
      ? this.enableRealLaunches ? DEPLOYMENT_STATES.AWAITING_ACTIVATION : DEPLOYMENT_STATES.PAYLOAD_READY
      : DEPLOYMENT_STATES.FAILED;
    const simulation = this.enableRealLaunches
      ? {
          mode: "real_launch_requested_but_not_implemented",
          broadcastReady: false,
          reason: "OINK live launch broadcasting is intentionally disabled in this skeleton.",
        }
      : this.simulateDeploymentRequest(payload, validation, auditLog);

    if (!this.enableRealLaunches) {
      auditLog.push(audit("simulated_deployment", validation.valid ? "success" : "blocked", validation.valid ? "Dry-wire request simulated; no transaction broadcast" : "Simulation blocked by validation failure"));
    }

    return {
      attemptId: buildAttemptId(shadowLaunch, payload),
      clusterId: shadowLaunch.clusterId,
      ticker: payload.token.symbol,
      deploymentState,
      mode: this.enableRealLaunches ? "LIVE_DISABLED_SKELETON" : "DRY_WIRE",
      pumpPortal: {
        connected: this.connected,
        apiBaseUrl: config.pumpPortal.apiBaseUrl,
        sdkLayer: "skeleton",
      },
      validation,
      payload,
      simulation,
      auditLog,
      createdAt: new Date().toISOString(),
    };
  }

  async prepareMetadataPackage(deploymentAttempt) {
    return prepareHostedPumpPortalMetadata(deploymentAttempt);
  }

  buildDeploymentPayload(shadowLaunch) {
    const source = shadowLaunch.payload || {};
    const token = source.token || {};
    const narrative = source.narrative || {};

    return {
      platform: "pumpportal",
      action: "prepare_create_token",
      mode: this.enableRealLaunches ? "live_skeleton" : "dry_wire",
      token: {
        name: safeText(token.name || shadowLaunch.title, 32),
        symbol: normalizeTicker(token.ticker || shadowLaunch.ticker),
        description: safeText(token.description || source.socialPostDraft?.pumpfunDescription || "", 480),
      },
      metadata: {
        imagePrompt: source.imagePrompt || "",
        imageUpload: {
          status: "placeholder",
          note: "Future image pipeline hook. No file uploaded in dry-wire mode.",
          artifactMode: source.visualReuseMode || "generate_new_image",
        },
        sourcePlatform: source.sourcePlatform || "memory",
        sourceArtifactType: source.sourceArtifactType || "symbolic_artifact",
        artifactStrength: Number(source.artifactStrength || 0),
        visualReuseMode: source.visualReuseMode || "generate_new_image",
        extractedPhrase: source.extractedPhrase || "",
        emotionalTexture: source.emotionalTexture || "",
        identityCompressionSummary: source.identityCompressionSummary || "",
      },
      launchContext: {
        clusterId: shadowLaunch.clusterId,
        clusterName: narrative.clusterName || shadowLaunch.title,
        narrativePhase: shadowLaunch.narrativePhase || narrative.phase || "forming",
        launchReadiness: Number(shadowLaunch.launchReadiness || narrative.launchReadiness || 0),
        swarmPressure: Number(shadowLaunch.swarmPressure || narrative.swarmPressure || 0),
        identityCohesion: Number(shadowLaunch.identityStrength || narrative.identityStrength || 0),
        launchTiming: source.launchTiming || {},
        launchReasoning: shadowLaunch.launchReasoning || source.launchReasoning || [],
      },
      transaction: {
        status: "not_prepared",
        note: "Transaction preparation placeholder only. No signing, wallet, private key, or broadcast.",
      },
    };
  }

  validateDeploymentPayload(payload) {
    const errors = [];
    const warnings = [];
    const symbol = payload.token.symbol;
    const readiness = Number(payload.launchContext.launchReadiness || 0);
    const swarmPressure = Number(payload.launchContext.swarmPressure || 0);

    if (!symbol || symbol.length < 3 || symbol.length > 10) errors.push("ticker_length_invalid");
    if (!/^[A-Z0-9]+$/.test(symbol || "")) errors.push("ticker_format_invalid");
    if (this.existingTickers.has(symbol)) errors.push("duplicate_ticker_detected");
    if (!payload.token.name || payload.token.name.length < 3) errors.push("token_name_missing");
    if (!payload.token.description || payload.token.description.length < 24) errors.push("description_incomplete");
    if (!payload.metadata.imagePrompt) errors.push("image_prompt_missing");
    if (payload.metadataValidation && !payload.metadataValidation.valid) errors.push("metadata_validation_failed");
    if (payload.metadata?.imageUpload?.validation && !payload.metadata.imageUpload.validation.valid) errors.push("image_asset_validation_failed");
    if (readiness < config.launch.deploymentMinReadiness) errors.push("launch_readiness_below_threshold");
    if (swarmPressure > config.launch.deploymentMaxSwarmPressure) errors.push("swarm_pressure_above_threshold");
    if (payload.metadata.artifactStrength < 45) warnings.push("artifact_strength_low");
    if (payload.metadata.visualReuseMode === "generate_new_image") warnings.push("source_artifact_requires_new_image");

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      checks: {
        tickerLength: symbol.length,
        metadataComplete: Boolean(payload.token.name && payload.token.description && payload.metadata.imagePrompt),
        metadataState: payload.metadataState,
        duplicateTicker: this.existingTickers.has(symbol),
        launchReadiness: readiness,
        swarmPressure,
        imagePromptPresent: Boolean(payload.metadata.imagePrompt),
      },
    };
  }

  simulateDeploymentRequest(payload, validation, auditLog) {
    const expectedActions = [
      "prepare token metadata",
      "reserve image upload placeholder",
      "shape PumpPortal create-token request",
      "prepare unsigned transaction placeholder",
      "validate response envelope",
      "stop before broadcast",
    ];

    auditLog.push(audit("dry_wire", "simulated", expectedActions.join(" -> ")));

    return {
      status: validation.valid ? DEPLOYMENT_STATES.SIMULATED : DEPLOYMENT_STATES.FAILED,
      broadcast: false,
      expectedActions,
      responseValidation: {
        expectedFields: ["signature", "mint", "metadataUri", "transaction"],
        status: "placeholder",
      },
      note: "ENABLE_REAL_LAUNCHES=false, so no request is broadcast and no transaction is submitted.",
    };
  }
}

export function preparePumpPortalDeployment(shadowLaunch, options = {}) {
  return new PumpPortalProvider(options).prepareDeployment(shadowLaunch);
}

export async function preparePumpPortalMetadataPackage(deploymentAttempt, options = {}) {
  return prepareHostedPumpPortalMetadata(deploymentAttempt, options);
}

function audit(stage, status, message) {
  return {
    stage,
    status,
    message,
    timestamp: new Date().toISOString(),
  };
}

function normalizeTicker(value = "") {
  return String(value).replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10);
}

function safeText(value = "", maxLength = 255) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function buildAttemptId(shadowLaunch, payload) {
  return `deploy-${shadowLaunch.clusterId || "cluster"}-${payload.token.symbol}-${Date.now()}`;
}
