import { classifyDeploymentFailure } from "./deploymentStateMachine.js";

const SCENARIOS = {
  success: { status: "confirmed", confirmationMs: 4200, failureClass: null, recoveryPath: "none" },
  timeout: { status: "failed", confirmationMs: 15000, failureClass: "chain_failure", recoveryPath: "retry_confirmation_polling" },
  dropped_tx: { status: "failed", confirmationMs: 9000, failureClass: "chain_failure", recoveryPath: "reassemble_and_resubmit_after_review" },
  rpc_failure: { status: "failed", confirmationMs: 3000, failureClass: "provider_failure", recoveryPath: "switch_rpc_and_retry" },
  duplicate_deploy: { status: "failed", confirmationMs: 1200, failureClass: "duplicate_launch", recoveryPath: "suppress_duplicate_and_mark_reviewed" },
  insufficient_funds: { status: "failed", confirmationMs: 800, failureClass: "chain_failure", recoveryPath: "funding_review_required" },
  malformed_payload: { status: "failed", confirmationMs: 500, failureClass: "validation_failure", recoveryPath: "rebuild_payload" },
};

export class TransactionSimulationEngine {
  constructor({ scenario = "success", now = () => Date.now() } = {}) {
    this.scenario = scenario;
    this.now = now;
  }

  simulate(deploymentAttempt = {}) {
    const started = this.now();
    const scenario = SCENARIOS[this.scenario] || SCENARIOS.success;
    const metadata = this.step("metadata_upload", 180, () => Boolean(deploymentAttempt.payload?.metadata?.image));
    const payload = this.step("deployment_payload", 120, () => Boolean(deploymentAttempt.payload?.token?.symbol));
    const txPrep = this.step("transaction_assembly", 260, () => scenario.status !== "failed" || this.scenario !== "malformed_payload");
    const signer = this.step("signer_flow", 90, () => scenario.status !== "failed" || this.scenario !== "insufficient_funds");
    const confirmation = this.step("confirmation_polling", scenario.confirmationMs, () => scenario.status === "confirmed");
    const latencies = {
      metadataPrepMs: metadata.latencyMs,
      uploadMs: metadata.latencyMs,
      txPrepMs: txPrep.latencyMs + payload.latencyMs,
      confirmationMs: confirmation.latencyMs,
      totalMs: metadata.latencyMs + payload.latencyMs + txPrep.latencyMs + signer.latencyMs + confirmation.latencyMs,
    };
    const failureClass = scenario.failureClass || (!metadata.ok || !payload.ok || !txPrep.ok || !signer.ok ? classifyDeploymentFailure(this.scenario) : null);
    const result = {
      simulationId: `txsim-${deploymentAttempt.attemptId || deploymentAttempt.ticker || "attempt"}-${started}`,
      ticker: deploymentAttempt.ticker || deploymentAttempt.payload?.token?.symbol || "",
      scenario: this.scenario,
      status: failureClass ? "failed" : "success",
      metadata,
      payload,
      txPrep,
      signer,
      confirmation,
      latencies,
      simulatedTransactionPayload: {
        token: deploymentAttempt.payload?.token || {},
        metadataUri: deploymentAttempt.payload?.metadata?.hostedMetadataUrl || deploymentAttempt.payload?.metadata?.image || "",
        unsignedTransaction: "dry-wire-unsigned-transaction",
      },
      expectedResponse: buildExpectedResponse(this.scenario, deploymentAttempt),
      failureClass,
      recoveryPath: scenario.recoveryPath,
      failureRisk: failureClass ? "HIGH" : latencies.totalMs > 8000 ? "MEDIUM" : "LOW",
      mode: "DRY_WIRE",
      replayLog: [],
    };
    result.replayLog = buildReplayLog(result);
    return result;
  }

  step(name, latencyMs, predicate) {
    const ok = Boolean(predicate());
    return {
      name,
      ok,
      latencyMs,
      status: ok ? "ok" : "failed",
      timestamp: new Date(this.now()).toISOString(),
    };
  }
}

export function simulateTransaction(deploymentAttempt, options = {}) {
  return new TransactionSimulationEngine(options).simulate(deploymentAttempt);
}

function buildExpectedResponse(scenario, deploymentAttempt) {
  if (scenario === "success") {
    return {
      signature: `sim-${deploymentAttempt.ticker || "OINK"}-signature`,
      confirmationStatus: "confirmed",
      slot: 123456789,
    };
  }
  return {
    error: scenario,
    confirmationStatus: "not_confirmed",
  };
}

function buildReplayLog(result) {
  return [
    { stage: "metadata_upload", payload: result.simulatedTransactionPayload.metadataUri, latencyMs: result.latencies.metadataPrepMs },
    { stage: "transaction_assembly", payload: result.simulatedTransactionPayload.unsignedTransaction, latencyMs: result.latencies.txPrepMs },
    { stage: "signer_flow", payload: "dry-run signer only", latencyMs: result.signer.latencyMs },
    { stage: "confirmation_polling", payload: result.expectedResponse, latencyMs: result.latencies.confirmationMs },
    { stage: "final", payload: { status: result.status, failureClass: result.failureClass, recoveryPath: result.recoveryPath } },
  ];
}
