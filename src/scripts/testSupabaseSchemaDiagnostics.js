// ============================================================
// Test Supabase startup schema diagnostics
// Run: npm run test-supabase-schema-diagnostics
// ============================================================

process.env.TELEGRAM_BOT_TOKEN ||= "test-token";
process.env.TELEGRAM_CHANNEL_ID ||= "test-channel";
process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_KEY ||= "test-key";

const { runSchemaDiagnostics } = await import("../db.js");

const missing = new Set(["narrative_cluster_snapshots", "shadow_launches"]);
const fakeClient = {
  from(table) {
    return {
      select(columns) {
        return {
          limit() {
            if (missing.has(table)) {
              return {
                data: null,
                error: {
                  code: "42P01",
                  message: `relation public.${table} does not exist`,
                  columns,
                },
              };
            }
            if (table === "deployment_attempts" && !columns.includes("failure_class")) {
              return {
                data: null,
                error: {
                  code: "42703",
                  message: "column failure_class does not exist",
                  columns,
                },
              };
            }
            return { data: [], error: null };
          },
        };
      },
    };
  },
};

const result = await runSchemaDiagnostics({ client: fakeClient, quiet: true });

console.log("Supabase schema diagnostics test");
console.log(`OK: ${result.ok ? "yes" : "no"}`);
console.log(`Missing: ${result.missing.join(", ") || "none"}`);

if (result.ok) process.exitCode = 1;
if (!result.missing.includes("narrative_cluster_snapshots")) process.exitCode = 1;
if (!result.missing.includes("shadow_launches")) process.exitCode = 1;
