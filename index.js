/**
 * Mineflayer Bot — Entry Point
 * A friendly bot that protects human players and beats Minecraft.
 * Now with auto-reconnect on disconnect / ECONNABORTED.
 */

import { createBot } from "./src/bot.js";
import config from "./config.js";

const RECONNECT_DELAY = 5000; // ms before reconnecting
let bot = null;
let shuttingDown = false;

function startBot() {
  console.log(
    `[FriendlyBot] Starting bot "${config.bot.username}" → ${config.bot.host}:${config.bot.port}`,
  );
  bot = createBot(config);

  bot.on("end", (reason) => {
    console.log(`[FriendlyBot] Connection ended: ${reason}`);
    if (!shuttingDown) {
      console.log(`[FriendlyBot] Reconnecting in ${RECONNECT_DELAY / 1000}s…`);
      setTimeout(startBot, RECONNECT_DELAY);
    }
  });

  bot.on("error", (err) => {
    console.error(`[FriendlyBot] Error: ${err.message}`);
    // 'end' event will fire after error, triggering reconnect
  });
}

startBot();

process.on("SIGINT", () => {
  console.log("[FriendlyBot] Shutting down…");
  shuttingDown = true;
  if (bot) bot.quit();
  process.exit(0);
});
