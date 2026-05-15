export const BUYBACK_CONFIG = {
  launchFeePercent: 1,
  buybackPercent: 70,
  treasuryPercent: 20,
  opsPercent: 10,
};

export function getBuybackSummary() {
  return "Autonomous launch fees flow back into $OINK buybacks. Current model: 70% buybacks, 20% treasury, 10% ops.";
}
