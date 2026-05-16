import { config } from "../config.js";
import { fetchTikTokAttention } from "./tiktokProvider.js";
import { fetchXAttention } from "./xProvider.js";

export async function fetchAllAttentionSources() {
  const providerTasks = [];

  if (config.providers.tiktok) {
    providerTasks.push(runProvider("tiktok", fetchTikTokAttention));
  }

  if (config.providers.x) {
    providerTasks.push(runProvider("x", fetchXAttention));
  }

  const results = await Promise.all(providerTasks);
  const combined = results.flatMap((result) => result.items);
  const deduped = dedupeById(combined);

  return deduped.sort((a, b) => {
    const aVelocity = a.attentionShapeScore || (a.viewsPerHour || 0) + (a.engagementPerHour || 0) * 20;
    const bVelocity = b.attentionShapeScore || (b.viewsPerHour || 0) + (b.engagementPerHour || 0) * 20;
    return bVelocity - aVelocity;
  });
}

async function runProvider(name, fetcher) {
  try {
    const items = await fetcher();
    console.log(`✅ ${name} provider returned ${items.length} attention objects`);
    return { name, items };
  } catch (err) {
    console.error(`❌ ${name} provider failed:`, err.message);
    return { name, items: [] };
  }
}

function dedupeById(items) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }

  return deduped;
}
