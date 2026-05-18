import { config } from "../config.js";
import { LaunchAdapter, createMockProviderResponse } from "./launchAdapter.js";
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

export class PumpPortalProvider extends LaunchAdapter {
  constructor({ existingTickers = [], enableRealLaunches = config.launch.enableRealLaunches, imageOptions = {} } = {}) {
    super({
      provider: "PumpPortal",
      providerVersion: "dry-wire-0.2.0",
      payloadSchemaVersion: "pumpportal-create-token-v1",
      endpointAssumptions: [
        "create-token response is expected to include signature, mint, metadataUri, transaction",
        "upload endpoint shape is not called until real launches are explicitly enabled",
      ],
      capabilities: {
        metadataUpload: true,
        imageUpload: true,
        transactionPrep: "stub",
        responseValidation: true,
        dryWireSupport: true,
        broadcast: false,
      },
    });
    this.existingTickers = new Set(existingTickers.map(normalizeTicker).filter(Boolean));
    this.enableRealLaunches = Boolean(enableRealLaunches);
    this.imageOptions = imageOptions;
    this.connected = true;
  }

  prepareDeployment(shadowLaunch) {
    const auditLog = [];
    auditLog.push(audit("payload_generation", "started", "Building PumpPortal deployment request shape"));

    let payload = this.buildDeploymentPayload(shadowLaunch);
    const metadataPipeline = this.prepareMetadata({ shadowLaunch, deploymentPayload: payload });
    payload = {
      ...payload,
      metadata: {
        ...payload.metadata,
        ...metadataPipeline.metadata,
        imagePrompt: payload.metadata.imagePrompt,
        imageUpload: metadataPipeline.imageAsset,
        imageQualityLabel: metadataPipeline.imageAsset.visualScore?.thumbnailStrengthLabel || labelScore(metadataPipeline.imageAsset.qualityScore),
      },
      metadataState: metadataPipeline.state,
      metadataValidation: metadataPipeline.validation,
    };
    payload.finalLaunchGate = this.evaluateFinalLaunchGate(payload, { hosted: false });
    auditLog.push(audit("metadata_pipeline", metadataPipeline.state, metadataPipeline.validation.valid ? "Metadata is ready" : metadataPipeline.validation.errors.join("; ")));
    auditLog.push(audit("image_artifact_preparation", metadataPipeline.imageAsset.validationStatus, payload.metadata.imagePrompt ? "Image asset pipeline completed" : "Image prompt missing"));

    auditLog.push(audit("validation", "started", "Validating deployment payload"));
    const validation = this.validatePayload(payload);
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
      adapter: this.buildDiagnostics({
        mode: this.enableRealLaunches ? "LIVE_DISABLED_SKELETON" : "DRY_WIRE",
        compatibility: this.getCompatibility(validation.warnings || []),
      }),
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

  prepareMetadata({ shadowLaunch, deploymentPayload }) {
    return prepareLaunchMetadata(
      { shadowLaunch, deploymentPayload },
      { imageOptions: this.imageOptions }
    );
  }

  async uploadAssets(deploymentAttempt, options = {}) {
    return prepareHostedPumpPortalMetadata(deploymentAttempt, options);
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
      identity: source.identity || shadowLaunch.identity || {},
      transaction: {
        status: "not_prepared",
        note: "Transaction preparation placeholder only. No signing, wallet, private key, or broadcast.",
      },
    };
  }

  validatePayload(payload) {
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
    const identityGate = validateIdentityQuality(payload.identity);
    if (!identityGate.valid) errors.push("identity_quality_below_threshold");
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
        identity: identityGate,
      },
    };
  }

  evaluateFinalLaunchGate(payload, { hosted = false, signerDiagnostics = [] } = {}) {
    const identityGate = validateIdentityQuality(payload.identity);
    const metadataReady = payload.metadataState === "metadata_ready" && payload.metadataValidation?.valid !== false;
    const asset = payload.metadata?.imageUpload || {};
    const assetHosted = hosted || Boolean(asset.uploadedImageUrl || asset.metadataUrl || payload.metadata?.hostedMetadataUrl);
    const walletConfigValid = config.wallets.publicKeyDiagnostics.every((item) => item.configured && item.valid && item.warnings.length === 0);
    const liveSignerReady = signerDiagnostics.some((item) => item.role === "deploy_wallet" && item.liveSignerReady);
    const signerSafe = config.wallets.signerDisabled || liveSignerReady;
    const saturationPassed = Number(payload.launchContext?.swarmPressure || 0) <= config.launch.deploymentMaxSwarmPressure;
    const txSimulationSuccess = payload.transactionSimulation?.status === "success";
    const blocks = [];
    if (!identityGate.valid) blocks.push("identity_not_ready");
    if (!metadataReady) blocks.push("metadata_not_ready");
    if (!assetHosted) blocks.push("asset_not_hosted");
    if (!walletConfigValid) blocks.push("wallet_config_invalid");
    if (!signerSafe) blocks.push("signer_not_safe");
    if (!saturationPassed) blocks.push("saturation_safety_failed");
    if (!txSimulationSuccess) blocks.push("transaction_simulation_not_success");
    return {
      readyForFutureLiveLaunch: blocks.length === 0,
      blocks,
      checks: {
        identityReady: identityGate.valid,
        metadataReady,
        assetHosted,
        walletConfigValid,
        signerDisabled: config.wallets.signerDisabled,
        liveSignerReady,
        saturationPassed,
        txSimulationSuccess,
      },
    };
  }

  validateDeploymentPayload(payload) {
    return this.validatePayload(payload);
  }

  prepareTransaction(payload, validation = this.validatePayload(payload)) {
    if (!validation.valid) {
      return {
        status: "blocked",
        broadcastReady: false,
        note: "Transaction placeholder blocked by payload validation.",
        errors: validation.errors,
      };
    }
    return {
      status: "prepared_stub",
      broadcastReady: false,
      transaction: "unsigned-transaction-placeholder",
      note: "Transaction preparation stub only. No wallet, signing, or broadcast.",
    };
  }

  parseResponse(response) {
    if (!response || typeof response !== "object" || Array.isArray(response)) {
      return {
        valid: false,
        failureClass: "schema_mismatch",
        errors: ["response_not_object"],
        parsed: null,
      };
    }
    if (response.status === "error" || response.error) {
      return {
        valid: false,
        failureClass: this.classifyFailure(response.error || response),
        errors: [String(response.error || "provider_error")],
        parsed: null,
      };
    }
    const required = ["signature", "mint", "metadataUri", "transaction"];
    const missing = required.filter((field) => !response[field]);
    if (missing.length) {
      return {
        valid: false,
        failureClass: "schema_mismatch",
        errors: missing.map((field) => `missing_${field}`),
        parsed: null,
      };
    }
    return {
      valid: true,
      failureClass: null,
      errors: [],
      parsed: {
        signature: response.signature,
        mint: response.mint,
        metadataUri: response.metadataUri,
        transaction: response.transaction,
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
      transaction: this.prepareTransaction(payload, validation),
      responseValidation: {
        expectedFields: ["signature", "mint", "metadataUri", "transaction"],
        status: "placeholder",
      },
      note: "ENABLE_REAL_LAUNCHES=false, so no request is broadcast and no transaction is submitted.",
    };
  }

  runSimulationHarness({ mutation = "valid", payload = null, validation = null } = {}) {
    const candidatePayload = payload || this.buildDeploymentPayload({ payload: {}, title: "Mock", ticker: "MOCK", clusterId: "mock" });
    const candidateValidation = validation || this.validatePayload(candidatePayload);
    const response = createMockProviderResponse({ mutation, payload: candidatePayload });
    const parsed = this.parseResponse(response);
    return {
      mutation,
      payloadValid: candidateValidation.valid,
      response,
      parsed,
      failureClass: parsed.failureClass || null,
      deploymentState: parsed.valid && candidateValidation.valid ? DEPLOYMENT_STATES.SIMULATED : DEPLOYMENT_STATES.FAILED,
      preservedState: true,
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

function validateIdentityQuality(identity = {}) {
  const selected = identity.selected || {};
  const checks = {
    tickerQualityScore: Number(selected.tickerQualityScore || 0),
    namingQualityScore: Number(selected.namingQualityScore || 0),
    identityCohesionScore: Number(selected.identityCohesionScore || 0),
  };
  const valid = checks.tickerQualityScore >= 75 && checks.namingQualityScore >= 75 && checks.identityCohesionScore >= 75;
  return {
    valid,
    checks,
    blockReason: valid ? "" : "identity_quality_below_threshold",
  };
}

function labelScore(score) {
  const value = Number(score || 0);
  if (value >= 80) return "HIGH";
  if (value >= 60) return "MEDIUM";
  return "LOW";
}

function buildAttemptId(shadowLaunch, payload) {
  return `deploy-${shadowLaunch.clusterId || "cluster"}-${payload.token.symbol}-${Date.now()}`;
}
