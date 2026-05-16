import { initBot, sendLaunchCreatedAlert, formatLaunchCreatedAlert } from "../telegram.js";

const shouldSend = process.argv.includes("--send");

const trend = {
  sourcePlatform: "x",
  sourceUrl: "https://x.com/example/status/1234567890",
  name: "Banana dog refuses to leave the airport",
};

const launchBrief = {
  sourcePlatform: "x",
  sourceUrl: trend.sourceUrl,
  socialTag: "#BananaDog",
};

const launchedToken = {
  name: "Banana Dog",
  ticker: "BANANADOG",
  contractAddress: "So11111111111111111111111111111111111111112",
  launchUrl: "https://pump.fun/example",
  platform: "pump.fun",
};

if (shouldSend) {
  initBot();
  await sendLaunchCreatedAlert({ trend, launchBrief, launchedToken });
  console.log("Sent mock market-created alert.");
} else {
  console.log(formatLaunchCreatedAlert({ trend, launchBrief, launchedToken }));
}
