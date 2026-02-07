/**
 * Mineflayer Bot — Entry Point
 * A friendly bot that protects human players and beats Minecraft.
 */

import { createBot } from "./src/bot.js";
import config from "./config.js";

console.log(
  `[FriendlyBot] Starting bot "${config.bot.username}" → ${config.bot.host}:${config.bot.port}`,
);

const bot = createBot(config);

process.on("SIGINT", () => {
  console.log("[FriendlyBot] Shutting down…");
  bot.quit();
  process.exit(0);
});
