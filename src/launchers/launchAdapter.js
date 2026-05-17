export class LaunchAdapter {
  constructor({
    provider = "generic",
    providerVersion = "0.1.0",
    payloadSchemaVersion = "0.1.0",
    endpointAssumptions = [],
    capabilities = {},
  } = {}) {
    this.provider = provider;
    this.providerVersion = providerVersion;
    this.payloadSchemaVersion = payloadSchemaVersion;
    this.endpointAssumptions = endpointAssumptions;
    this.capabilities = {
      metadataUpload: false,
      imageUpload: false,
      transactionPrep: false,
      responseValidation: false,
      dryWireSupport: true,
      broadcast: false,
      ...capabilities,
    };
  }

  async prepareMetadata() {
    throw new Error(`${this.provider} adapter must implement prepareMetadata()`);
  }

  async uploadAssets() {
    throw new Error(`${this.provider} adapter must implement uploadAssets()`);
  }

  buildDeploymentPayload() {
    throw new Error(`${this.provider} adapter must implement buildDeploymentPayload()`);
  }

  validatePayload() {
    throw new Error(`${this.provider} adapter must implement validatePayload()`);
  }

  prepareTransaction() {
    throw new Error(`${this.provider} adapter must implement prepareTransaction()`);
  }

  parseResponse() {
    throw new Error(`${this.provider} adapter must implement parseResponse()`);
  }

  classifyFailure(errorOrResponse) {
    const message = getMessage(errorOrResponse);
    if (/schema|shape|missing|required/i.test(message)) return "schema_mismatch";
    if (/upload|asset|image|metadata/i.test(message)) return "asset_upload_failure";
    if (/timeout|network|fetch|connection/i.test(message)) return "transport_failure";
    if (/validation|invalid/i.test(message)) return "payload_validation_failure";
    return "unknown_provider_failure";
  }

  negotiateCapabilities() {
    return {
      provider: this.provider,
      capabilities: this.capabilities,
      adapterVersion: this.getAdapterVersion(),
      compatibility: this.getCompatibility(),
    };
  }

  getAdapterVersion() {
    return {
      providerVersion: this.providerVersion,
      payloadSchemaVersion: this.payloadSchemaVersion,
      endpointAssumptions: this.endpointAssumptions,
    };
  }

  getCompatibility(extraWarnings = []) {
    const warnings = [
      ...extraWarnings,
      ...this.endpointAssumptions.filter((item) => /unknown|unstable|assumed/i.test(item)),
    ];
    return {
      status: warnings.length ? "CAUTION" : "STABLE",
      warnings,
    };
  }

  buildDiagnostics(extra = {}) {
    const negotiated = this.negotiateCapabilities();
    return {
      provider: this.provider,
      ...negotiated,
      mode: extra.mode || "DRY_WIRE",
      dryWire: Boolean(this.capabilities.dryWireSupport),
      broadcastEnabled: Boolean(this.capabilities.broadcast),
      ...extra,
    };
  }
}

export function createMockProviderResponse({ mutation = "valid", payload = {} } = {}) {
  if (mutation === "valid") {
    return {
      status: "ok",
      signature: "dry-wire-signature-placeholder",
      mint: payload?.token?.symbol ? `dry-${payload.token.symbol}` : "dry-mint",
      metadataUri: payload?.metadata?.hostedMetadataUrl || payload?.metadata?.image || "https://assets.oink.bot/dry-wire/metadata/mock.json",
      transaction: "unsigned-transaction-placeholder",
    };
  }
  if (mutation === "missing_transaction") {
    return {
      status: "ok",
      signature: "dry-wire-signature-placeholder",
      mint: "dry-mint",
      metadataUri: "https://assets.oink.bot/dry-wire/metadata/mock.json",
    };
  }
  if (mutation === "renamed_fields") {
    return {
      ok: true,
      tx: "unsigned-transaction-placeholder",
      tokenMint: "dry-mint",
      uri: "https://assets.oink.bot/dry-wire/metadata/mock.json",
    };
  }
  if (mutation === "malformed") return "not-json-object";
  if (mutation === "upload_failure") {
    return { status: "error", error: "image upload failed" };
  }
  return { status: "error", error: "mock provider failure" };
}

function getMessage(value) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  return JSON.stringify(value || {});
}
