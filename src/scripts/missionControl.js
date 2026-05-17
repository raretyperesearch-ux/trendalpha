// ============================================================
// OINK Mission Control dashboard generator
// Run: npm run mission-control
// ============================================================

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const OUTPUT = path.resolve("mission-control.html");

const data = await loadMissionControlData();
const html = renderMissionControl(data);
await fs.writeFile(OUTPUT, html);

console.log(`🐷 OINK Mission Control written to ${OUTPUT}`);
console.log("Open this file in a browser. Read-only dashboard; no launches, wallets, or broadcasts.");

async function loadMissionControlData() {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) throw new Error("Supabase not configured");
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const [clusters, shadow, deployments] = await Promise.all([
      supabase.from("narrative_cluster_snapshots").select("*").order("timestamp", { ascending: false }).limit(20),
      supabase.from("shadow_launches").select("*").order("created_at", { ascending: false }).limit(20),
      supabase.from("deployment_attempts").select("*").order("created_at", { ascending: false }).limit(20),
    ]);
    return {
      source: "supabase",
      clusters: clusters.data || [],
      shadowLaunches: shadow.data || [],
      deployments: deployments.data || [],
      errors: [clusters.error, shadow.error, deployments.error].filter(Boolean).map((err) => err.message),
    };
  } catch (err) {
    return {
      source: "mock",
      clusters: [
        { cluster_id: "cluster-banana", cluster_name: "Banana Dog", narrative_phase: "forming", launch_readiness: 86, swarm_pressure: 18, identity_strength: 91, persistence_score: 78 },
        { cluster_id: "cluster-spot", cluster_name: "Spotghost", narrative_phase: "accelerating", launch_readiness: 82, swarm_pressure: 22, identity_strength: 88, persistence_score: 80 },
      ],
      shadowLaunches: [
        { launch_id: "dry-cluster-banana-BANANA", ticker: "BANANA", title: "Banana Dog", launch_readiness: 86, narrative_phase: "forming", swarm_pressure: 18 },
      ],
      deployments: [
        { attempt_id: "deploy-cluster-banana", ticker: "BANANA", deployment_state: "deployment_prepared", failure_class: "", mode: "DRY_WIRE", state_timeline: [] },
      ],
      errors: [err.message],
    };
  }
}

function renderMissionControl({ source, clusters, shadowLaunches, deployments, errors }) {
  const activeWarnings = deployments.filter((item) => item.failure_class || item.deployment_state === "failed").length;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OINK Mission Control</title>
  <style>
    body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #101418; color: #f4f1e8; }
    header { padding: 24px 28px; border-bottom: 1px solid #2a3036; background: #171d22; }
    h1, h2 { margin: 0; letter-spacing: 0; }
    main { padding: 24px 28px; display: grid; gap: 18px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .panel { border: 1px solid #303840; border-radius: 8px; padding: 16px; background: #171d22; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid #2a3036; padding: 8px 6px; text-align: left; vertical-align: top; }
    th { color: #a8b3bd; font-weight: 600; }
    .metric { font-size: 28px; font-weight: 750; }
    .muted { color: #a8b3bd; }
    .ok { color: #88e0a1; }
    .warn { color: #ffd166; }
    .bad { color: #ff7b7b; }
    code { color: #9ee7ff; }
    .timeline { display: flex; gap: 6px; flex-wrap: wrap; }
    .step { padding: 5px 8px; border-radius: 5px; background: #26313a; font-size: 12px; }
    .preview { width: 54px; height: 54px; background: #26313a; border-radius: 6px; display: grid; place-items: center; color: #ffd166; font-weight: 800; }
  </style>
</head>
<body>
  <header>
    <h1>🐷 OINK Mission Control</h1>
    <div class="muted">Read-only deployment, narrative, and shadow-launch terminal. Source: ${escapeHtml(source)}</div>
  </header>
  <main>
    ${errors.length ? `<section class="panel warn">Diagnostics: ${errors.map(escapeHtml).join(" | ")}</section>` : ""}
    <section class="grid">
      <div class="panel"><div class="muted">Active Clusters</div><div class="metric">${clusters.length}</div></div>
      <div class="panel"><div class="muted">Shadow Launches</div><div class="metric">${shadowLaunches.length}</div></div>
      <div class="panel"><div class="muted">Deployment Queue</div><div class="metric">${deployments.length}</div></div>
      <div class="panel"><div class="muted">Saturation / Failure Warnings</div><div class="metric ${activeWarnings ? "warn" : "ok"}">${activeWarnings}</div></div>
    </section>
    <section class="panel">
      <h2>Active Clusters</h2>
      ${table(["Cluster", "Phase", "Readiness", "Identity", "Swarm"], clusters.map((c) => [
        c.cluster_name || c.cluster_id,
        c.narrative_phase || "forming",
        `${c.launch_readiness || 0}/100`,
        `${c.identity_strength || 0}/100`,
        `${c.swarm_pressure || 0}/100`,
      ]))}
    </section>
    <section class="panel">
      <h2>Shadow Launches & Identity Previews</h2>
      ${table(["Preview", "Ticker", "Title", "Readiness", "Ticker Quality", "Saturation"], shadowLaunches.map((s) => [
        `<div class="preview">${escapeHtml(String(s.ticker || "?").slice(0, 2))}</div>`,
        `$${s.ticker || "OINK"}`,
        s.title || s.cluster_id,
        `${s.launch_readiness || 0}/100`,
        scoreTicker(s.ticker),
        `${s.swarm_pressure || 0}/100`,
      ]))}
    </section>
    <section class="panel">
      <h2>Deployment Timeline</h2>
      ${deployments.map(renderDeployment).join("")}
    </section>
    <section class="grid">
      <div class="panel"><h2>Dry-Run Payload Inspector</h2><pre>${escapeHtml(JSON.stringify(deployments[0]?.payload || {}, null, 2)).slice(0, 2200)}</pre></div>
      <div class="panel"><h2>Failure Diagnostics</h2>${table(["Attempt", "State", "Failure"], deployments.map((d) => [d.attempt_id, d.deployment_state, d.failure_class || "none"]))}</div>
      <div class="panel"><h2>Provider Health</h2><p class="ok">PumpPortal adapter: DRY-WIRE</p><p class="muted">Broadcast: disabled</p><p class="muted">Wallets: disabled</p></div>
      <div class="panel"><h2>Telegram Deep Links</h2><p><a href="https://t.me/" style="color:#9ee7ff">Open Telegram</a></p><p class="muted">Alerts remain Telegram-first; no actions are executed from this dashboard.</p></div>
    </section>
  </main>
</body>
</html>`;
}

function renderDeployment(d) {
  const timeline = Array.isArray(d.state_timeline) ? d.state_timeline : [];
  const steps = timeline.length ? timeline.map((item) => item.to || item).slice(-12) : [d.deployment_state || "payload_ready"];
  return `<div style="margin-top:12px"><b>$${escapeHtml(d.ticker || "OINK")}</b> <span class="muted">${escapeHtml(d.attempt_id || "")}</span><div class="timeline">${steps.map((s) => `<span class="step">${escapeHtml(s)}</span>`).join("")}</div></div>`;
}

function table(headers, rows) {
  return `<table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${String(cell).startsWith("<") ? cell : escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function scoreTicker(ticker = "") {
  const clean = String(ticker || "");
  if (/^[A-Z0-9]{3,8}$/.test(clean)) return "HIGH";
  if (/^[A-Z0-9]{3,10}$/.test(clean)) return "MEDIUM";
  return "LOW";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
}
