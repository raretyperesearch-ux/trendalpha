export function preparePumpFunLaunch(launchBrief) {
  return {
    platform: "pump.fun",
    status: "prepared",
    note: "Launch prepared only. No transaction submitted.",
    metadata: {
      name: launchBrief.suggestedName,
      symbol: launchBrief.suggestedTicker,
      description: launchBrief.description,
      imagePrompt: launchBrief.imagePrompt,
      sourceUrl: launchBrief.sourceUrl,
    },
  };
}
