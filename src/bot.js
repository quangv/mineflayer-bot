/**
 * Bot creation — loads mineflayer + all plugins.
 */

import mineflayer from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
const { pathfinder } = pathfinderPkg;
import pvpPkg from "mineflayer-pvp";
const { plugin: pvp } = pvpPkg;
import collectBlockPkg from "mineflayer-collectblock";
const { plugin: collectBlock } = collectBlockPkg;
import { loader as autoEat } from "mineflayer-auto-eat";
import armorManager from "mineflayer-armor-manager";
import toolPkg from "mineflayer-tool";
const { plugin: toolPlugin } = toolPkg;

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
import { setupPersonality } from "./plugins/personality.js";
import { setupAutonomous } from "./plugins/autonomous.js";
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
    /** Player whose fate the bot shares (if they die, bot dies) */
    boundTo: null,
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
    setupPersonality(bot);
    setupAutonomous(bot);
    setupProgression(bot);
    setupChat(bot);

    // ── Die-with-player: if the bound player dies, bot kills itself ──
    bot.on("entityDead", (entity) => {
      if (!bot.friendlyBot.boundTo) return;
      const bound = bot.players[bot.friendlyBot.boundTo];
      if (bound && bound.entity && bound.entity.id === entity.id) {
        bot.chat(
          `${bot.friendlyBot.boundTo} has fallen… I follow them into the void!`,
        );
        bot.chat("/kill");
      }
    });
  });

  bot.on("death", () => {
    console.log("[FriendlyBot] I died! Respawning…");
    bot.friendlyBot.busy = false;
    // If bound to a player, auto-rebind after respawn
    if (bot.friendlyBot.boundTo) {
      const name = bot.friendlyBot.boundTo;
      setTimeout(() => {
        bot.chat(`I'm back, ${name}! Still bound to you.`);
      }, 3000);
    }
  });

  bot.on("kicked", (reason) => console.log(`[FriendlyBot] Kicked: ${reason}`));
  bot.on("error", (err) => console.error("[FriendlyBot] Error:", err.message));
  bot.on("end", () => console.log("[FriendlyBot] Disconnected."));

  return bot;
}
