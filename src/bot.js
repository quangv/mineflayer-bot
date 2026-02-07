/**
 * Bot creation — loads mineflayer + all plugins.
 */

import mineflayer from "mineflayer";
import { pathfinder } from "mineflayer-pathfinder";
import { plugin as pvp } from "mineflayer-pvp";
import { plugin as collectBlock } from "mineflayer-collectblock";
import { loader as autoEat } from "mineflayer-auto-eat";
import armorManager from "mineflayer-armor-manager";
import { plugin as toolPlugin } from "mineflayer-tool";

import { setupChat } from "./chat.js";
import { setupProtection } from "./plugins/protection.js";
import { setupCombat } from "./plugins/combat.js";
import { setupNavigation } from "./plugins/navigation.js";
import { setupSurvival } from "./plugins/survival.js";
import { setupMining } from "./plugins/mining.js";
import { setupCrafting } from "./plugins/crafting.js";
import { setupInventory } from "./plugins/inventory.js";
import { setupNether } from "./plugins/nether.js";
import { setupEnd } from "./plugins/end.js";
import { setupProgression } from "./progression/index.js";

export function createBot(config) {
  const bot = mineflayer.createBot(config.bot);

  // ── Load third-party plugins ──────────────────────────────────────
  bot.loadPlugin(pathfinder);
  bot.loadPlugin(pvp);
  bot.loadPlugin(collectBlock);
  bot.loadPlugin(autoEat);
  bot.loadPlugin(armorManager);
  bot.loadPlugin(toolPlugin);

  // ── Shared state the plugins can read/write ───────────────────────
  bot.friendlyBot = {
    config,
    /** Current high-level goal: 'idle' | 'protect' | 'progress' */
    mode: "idle",
    /** Current progression phase (see progression/phases.js) */
    phase: "start",
    /** Whether the bot is currently busy with an action */
    busy: false,
    /** Player the bot is currently following / protecting */
    followTarget: null,
  };

  // ── Lifecycle events ──────────────────────────────────────────────
  bot.once("spawn", () => {
    console.log("[FriendlyBot] Spawned into the world!");
    bot.chat('Hello! I\'m FriendlyBot. Say "help" for commands!');

    // Initialize all custom modules
    setupNavigation(bot);
    setupCombat(bot);
    setupProtection(bot);
    setupSurvival(bot);
    setupMining(bot);
    setupCrafting(bot);
    setupInventory(bot);
    setupNether(bot);
    setupEnd(bot);
    setupProgression(bot);
    setupChat(bot);
  });

  bot.on("death", () => {
    console.log("[FriendlyBot] I died! Respawning…");
    bot.friendlyBot.busy = false;
  });

  bot.on("kicked", (reason) => console.log(`[FriendlyBot] Kicked: ${reason}`));
  bot.on("error", (err) => console.error("[FriendlyBot] Error:", err.message));
  bot.on("end", () => console.log("[FriendlyBot] Disconnected."));

  return bot;
}
