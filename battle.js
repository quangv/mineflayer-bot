/**
 * Battle Mode — Spawn two bots and have them fight each other!
 *
 * Usage:
 *   node battle.js
 *
 * The bots will join the server, wait for you to say "fight" in chat,
 * then battle to the death. You can also build an arena first.
 *
 * Chat commands (say these in-game):
 *   fight         — Start the battle
 *   stop          — Stop the battle
 *   reset         — Teleport bots back to starting positions and heal
 *   score         — Show kill scoreboard
 *   arm           — Give both bots random gear loadouts
 *   arm <bot>     — Give a specific bot (red/blue) gear
 *   rematch       — Reset + fight again
 *   kit stone     — Equip both bots with stone gear
 *   kit iron      — Equip both bots with iron gear
 *   kit diamond   — Equip both bots with diamond gear
 *   kit netherite — Equip both bots with netherite gear
 *   quit          — Disconnect both bots
 */

import "dotenv/config";
import mineflayer from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
const { pathfinder, Movements, goals } = pathfinderPkg;
import pvpPkg from "mineflayer-pvp";
const { plugin: pvp } = pvpPkg;
import armorManager from "mineflayer-armor-manager";

// ── Config ──────────────────────────────────────────────────────────────

const HOST = process.env.BOT_HOST || "127.0.0.1";
const PORT = parseInt(process.env.BOT_PORT, 10) || 25565;
const VERSION = process.env.BOT_VERSION || "1.20.4";

const BOT_RED = {
  username: process.env.BATTLE_RED_NAME || "RedBot",
  host: HOST,
  port: PORT,
  version: VERSION,
};

const BOT_BLUE = {
  username: process.env.BATTLE_BLUE_NAME || "BlueBot",
  host: HOST,
  port: PORT,
  version: VERSION,
};

// ── State ───────────────────────────────────────────────────────────────

const score = { red: 0, blue: 0 };
let fighting = false;
let redReady = false;
let blueReady = false;
let redBot = null;
let blueBot = null;

// ── Taunts & personality ────────────────────────────────────────────────

const RED_TAUNTS = [
  "You're going down, Blue!",
  "Red means danger!",
  "Prepare to be destroyed!",
  "Is that the best you got?",
  "Too slow, too blue!",
  "I eat diamonds for breakfast!",
  "Your sword is as dull as your strategy!",
];

const BLUE_TAUNTS = [
  "Red? More like DEAD!",
  "Blue is the color of victory!",
  "I'll turn you into redstone dust!",
  "Bring it on, ketchup!",
  "You can't beat the best!",
  "My grandma fights better than you!",
  "I haven't even started trying!",
];

const RED_VICTORY = [
  "GG EZ! Red reigns supreme!",
  "Another victory for team Red!",
  "Was that even a challenge?",
];

const BLUE_VICTORY = [
  "Blue wins again! No surprise there!",
  "Better luck next time, Red!",
  "Too easy! Who's next?",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Gear kits ───────────────────────────────────────────────────────────

const KITS = {
  stone: {
    weapon: "stone_sword",
    helmet: "leather_helmet",
    chestplate: "leather_chestplate",
    leggings: "leather_leggings",
    boots: "leather_boots",
    extras: ["cooked_beef 16", "shield"],
  },
  iron: {
    weapon: "iron_sword",
    helmet: "iron_helmet",
    chestplate: "iron_chestplate",
    leggings: "iron_leggings",
    boots: "iron_boots",
    extras: ["cooked_beef 32", "shield", "bow", "arrow 32"],
  },
  diamond: {
    weapon: "diamond_sword",
    helmet: "diamond_helmet",
    chestplate: "diamond_chestplate",
    leggings: "diamond_leggings",
    boots: "diamond_boots",
    extras: ["cooked_beef 64", "shield", "bow", "arrow 64", "golden_apple 4"],
  },
  netherite: {
    weapon: "netherite_sword",
    helmet: "netherite_helmet",
    chestplate: "netherite_chestplate",
    leggings: "netherite_leggings",
    boots: "netherite_boots",
    extras: [
      "cooked_beef 64",
      "shield",
      "bow",
      "arrow 64",
      "golden_apple 8",
      "enchanted_golden_apple 2",
    ],
  },
  random: null, // handled specially
};

function giveKit(bot, kitName) {
  if (kitName === "random") {
    const options = ["stone", "iron", "diamond"];
    kitName = pick(options);
    bot.chat(`I got the ${kitName} kit! Let's see how this goes...`);
  }
  const kit = KITS[kitName];
  if (!kit) return;

  // Use /give commands (requires cheats / operator)
  const name = bot.username;
  bot.chat(`/clear ${name}`);
  setTimeout(() => {
    bot.chat(`/give ${name} ${kit.weapon}`);
    bot.chat(`/give ${name} ${kit.helmet}`);
    bot.chat(`/give ${name} ${kit.chestplate}`);
    bot.chat(`/give ${name} ${kit.leggings}`);
    bot.chat(`/give ${name} ${kit.boots}`);
    for (const extra of kit.extras) {
      bot.chat(`/give ${name} ${extra}`);
    }
    // Auto-equip armor after a short delay
    setTimeout(() => {
      equipArmor(bot);
    }, 1500);
  }, 500);
}

async function equipArmor(bot) {
  try {
    const armorSlots = ["head", "torso", "legs", "feet"];
    const armorKeywords = [["helmet"], ["chestplate"], ["leggings"], ["boots"]];

    for (let i = 0; i < armorSlots.length; i++) {
      const item = bot.inventory
        .items()
        .find((it) => armorKeywords[i].some((kw) => it.name.includes(kw)));
      if (item) {
        await bot.equip(item, armorSlots[i]);
      }
    }

    // Equip sword in hand
    const sword = bot.inventory.items().find((it) => it.name.includes("sword"));
    if (sword) await bot.equip(sword, "hand");

    // Equip shield in off-hand
    const shield = bot.inventory.items().find((it) => it.name === "shield");
    if (shield) await bot.equip(shield, "off-hand");
  } catch (e) {
    // Silently handle equip errors
  }
}

// ── Bot AI (combat strategy) ────────────────────────────────────────────

function setupFighter(bot, opponent, taunts) {
  let tauntInterval = null;

  bot._battleAI = {
    start() {
      // Taunt periodically
      tauntInterval = setInterval(
        () => {
          if (fighting && Math.random() < 0.3) {
            bot.chat(pick(taunts));
          }
        },
        5000 + Math.random() * 5000,
      );

      // Start combat loop
      this.engage();
    },

    async engage() {
      if (!fighting) return;

      const enemy = bot.players[opponent]?.entity;
      if (!enemy) {
        setTimeout(() => this.engage(), 1000);
        return;
      }

      try {
        // Equip best weapon
        const sword = bot.inventory
          .items()
          .find((it) => it.name.includes("sword"));
        if (sword) await bot.equip(sword, "hand");

        // Sprint toward opponent and attack
        bot.pvp.attack(enemy);
      } catch {
        // Retry
        if (fighting) {
          setTimeout(() => this.engage(), 1000);
        }
      }
    },

    stop() {
      if (tauntInterval) clearInterval(tauntInterval);
      tauntInterval = null;
      bot.pvp.stop();
      bot.pathfinder.stop();
    },
  };

  // Re-engage after taking hits (strafing behavior)
  bot.on("entityHurt", (entity) => {
    if (entity === bot.entity && fighting && Math.random() < 0.4) {
      // Dodge sideways occasionally
      const yaw = bot.entity.yaw + (Math.random() > 0.5 ? 1.2 : -1.2);
      bot.look(yaw, 0);
      bot.setControlState("left", Math.random() > 0.5);
      bot.setControlState("right", Math.random() > 0.5);
      setTimeout(
        () => {
          bot.clearControlStates();
        },
        300 + Math.random() * 400,
      );
    }
  });

  // Eat food when low health
  bot.on("health", () => {
    if (bot.health < 10 && fighting) {
      const food = bot.inventory
        .items()
        .find(
          (it) =>
            it.name.includes("cooked") ||
            it.name.includes("golden_apple") ||
            it.name.includes("bread"),
        );
      if (food) {
        bot
          .equip(food, "hand")
          .then(() => bot.consume())
          .catch(() => {});
      }
    }
  });
}

// ── Battle control ──────────────────────────────────────────────────────

function startBattle() {
  if (fighting) return;
  fighting = true;

  redBot.chat("Let's go! FIGHT!");
  blueBot.chat("Bring it on!");

  // Small delay so both are ready
  setTimeout(() => {
    redBot._battleAI.start();
    blueBot._battleAI.start();
  }, 500);
}

function stopBattle() {
  fighting = false;
  if (redBot._battleAI) redBot._battleAI.stop();
  if (blueBot._battleAI) blueBot._battleAI.stop();
  redBot.clearControlStates();
  blueBot.clearControlStates();
  redBot.chat("Battle paused.");
  blueBot.chat("Standing down.");
}

function resetBots() {
  stopBattle();
  // Heal both bots (requires cheats)
  redBot.chat(`/effect give ${redBot.username} instant_health 1 10`);
  blueBot.chat(`/effect give ${blueBot.username} instant_health 1 10`);
  redBot.chat(`/effect clear ${redBot.username}`);
  blueBot.chat(`/effect clear ${blueBot.username}`);
  redBot.chat("Reset! Ready for another round.");
  blueBot.chat("Healed up. Let's go again!");
}

// ── Create bots ─────────────────────────────────────────────────────────

function spawnBot(opts, color) {
  const bot = mineflayer.createBot(opts);

  bot.loadPlugin(pathfinder);
  bot.loadPlugin(pvp);
  bot.loadPlugin(armorManager);

  bot.once("spawn", () => {
    console.log(`[${color}] ${bot.username} spawned!`);

    // Setup pathfinder
    const defaultMove = new Movements(bot);
    defaultMove.canDig = false; // No digging in battle!
    bot.pathfinder.setMovements(defaultMove);

    if (color === "Red") {
      redReady = true;
      redBot = bot;
    } else {
      blueReady = true;
      blueBot = bot;
    }

    bot.chat(`${bot.username} has entered the arena!`);

    // Once both bots are ready, set up fighters
    if (redReady && blueReady) {
      initializeBattle();
    }
  });

  bot.on("death", () => {
    console.log(`[${color}] ${bot.username} died!`);
    if (fighting) {
      fighting = false;

      if (color === "Red") {
        score.blue++;
        setTimeout(() => {
          blueBot?.chat(pick(BLUE_VICTORY));
          blueBot?.chat(`Score: Red ${score.red} — Blue ${score.blue}`);
          blueBot?._battleAI?.stop();
        }, 1000);
      } else {
        score.red++;
        setTimeout(() => {
          redBot?.chat(pick(RED_VICTORY));
          redBot?.chat(`Score: Red ${score.red} — Blue ${score.blue}`);
          redBot?._battleAI?.stop();
        }, 1000);
      }
    }
  });

  bot.on("kicked", (reason) => console.log(`[${color}] Kicked: ${reason}`));
  bot.on("error", (err) => console.error(`[${color}] Error: ${err.message}`));
  bot.on("end", () => console.log(`[${color}] Disconnected.`));

  return bot;
}

function initializeBattle() {
  console.log("[Battle] Both bots ready! Setting up fighters...");
  console.log('[Battle] Say "fight" in-game to start the battle!');

  setupFighter(redBot, blueBot.username, RED_TAUNTS);
  setupFighter(blueBot, redBot.username, BLUE_TAUNTS);

  // Listen for chat commands from any player
  const handleChat = (username, message) => {
    // Ignore bot messages
    if (username === redBot.username || username === blueBot.username) return;

    const msg = message.trim().toLowerCase();

    if (msg === "fight") {
      startBattle();
    } else if (msg === "stop") {
      stopBattle();
    } else if (msg === "reset") {
      resetBots();
    } else if (msg === "rematch") {
      resetBots();
      setTimeout(() => startBattle(), 2000);
    } else if (msg === "score") {
      redBot.chat(`Score: Red ${score.red} — Blue ${score.blue}`);
    } else if (msg === "quit") {
      redBot.chat("GG! See you next time!");
      blueBot.chat("Good fights! Later!");
      setTimeout(() => {
        redBot.quit();
        blueBot.quit();
        process.exit(0);
      }, 1000);
    } else if (msg === "arm") {
      giveKit(redBot, "random");
      giveKit(blueBot, "random");
    } else if (msg === "arm red") {
      giveKit(redBot, "random");
    } else if (msg === "arm blue") {
      giveKit(blueBot, "random");
    } else if (msg.startsWith("kit ")) {
      const kitName = msg.split(" ")[1];
      if (KITS[kitName] || kitName === "random") {
        giveKit(redBot, kitName);
        giveKit(blueBot, kitName);
        redBot.chat(`${kitName} kit equipped!`);
      } else {
        redBot.chat(
          `Unknown kit "${kitName}". Available: stone, iron, diamond, netherite, random`,
        );
      }
    }
  };

  redBot.on("chat", handleChat);
  // Don't double-register — only one bot needs to listen
}

// ── Launch! ─────────────────────────────────────────────────────────────

console.log("═══════════════════════════════════════════════════");
console.log("  ⚔️  MINEFLAYER BATTLE MODE  ⚔️");
console.log("═══════════════════════════════════════════════════");
console.log(`  Red:  ${BOT_RED.username}`);
console.log(`  Blue: ${BOT_BLUE.username}`);
console.log(`  Server: ${HOST}:${PORT} (v${VERSION})`);
console.log("═══════════════════════════════════════════════════");
console.log("  In-game commands:");
console.log('    "fight"    — Start the battle');
console.log('    "stop"     — Pause the battle');
console.log('    "reset"    — Heal & reset bots');
console.log('    "rematch"  — Reset + fight');
console.log('    "score"    — Show scoreboard');
console.log('    "arm"      — Give random gear');
console.log('    "kit iron" — Give specific gear kit');
console.log('    "quit"     — Disconnect bots');
console.log("═══════════════════════════════════════════════════\n");

// Stagger bot joins to avoid race conditions
const red = spawnBot(BOT_RED, "Red");
setTimeout(() => {
  const blue = spawnBot(BOT_BLUE, "Blue");
}, 2000);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[Battle] Shutting down...");
  try {
    redBot?.quit();
    blueBot?.quit();
  } catch {}
  process.exit(0);
});
