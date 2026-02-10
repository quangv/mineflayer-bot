/**
 * Beat Mode — a single bot focused on beating Minecraft in survival.
 *
 * Usage:
 *   npm run beat
 *
 * Chat commands (say in-game):
 *   arm              — Give the bot weapons, armor, and blocks (no diamond/netherite)
 *   next             — Skip to the next phase/task
 *   mine <block> [n]  — Mine a block type (e.g. "mine diamond_ore 3")
 *   craft <item> [n]  — Craft an item (e.g. "craft iron_pickaxe")
 *   smelt <item> [n]  — Smelt an item (e.g. "smelt raw_iron 5")
 *   build <type>      — Build a structure: house, wall, tower
 *   give <item> [n]   — /give an item to the bot (no diamond/netherite)
 *   drop <item> [n]   — Drop items from inventory
 *   equip             — Equip best gear from inventory
 *   eat               — Eat the best food available
 *   sleep             — Try to sleep in a nearby bed
 *   follow <player>   — Follow a player
 *   attack <mob>      — Attack nearest mob of that type
 *   come              — Come to the speaker
 *   status            — Check progress
 *   stop              — Pause progression
 *   resume            — Resume progression
 *   inventory         — List items
 *   help              — Show commands
 *   beat              — Reset and fight the Ender Dragon again
 *   quit              — Disconnect
 */

import "dotenv/config";
import mineflayer from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
const { pathfinder, Movements, goals } = pathfinderPkg;
import pvpPkg from "mineflayer-pvp";
const { plugin: pvp } = pvpPkg;
import collectBlockPkg from "mineflayer-collectblock";
const { plugin: collectBlock } = collectBlockPkg;
import { loader as autoEat } from "mineflayer-auto-eat";
import armorManager from "mineflayer-armor-manager";
import toolPkg from "mineflayer-tool";
const { plugin: toolPlugin } = toolPkg;
import mcDataLoader from "minecraft-data";
import Vec3 from "vec3";

// ── Config ──────────────────────────────────────────────────────────────

const HOST = process.env.BOT_HOST || "127.0.0.1";
const PORT = parseInt(process.env.BOT_PORT, 10) || 25565;
const VERSION = process.env.BOT_VERSION || "1.20.4";
const BOT_NAME = process.env.BEAT_BOT_NAME || "DragonSlayer";

const RECONNECT_DELAY = 5000;
const MAX_RECONNECT_ATTEMPTS = 50;

// ── Persistent state (survives reconnects) ──────────────────────────────

const persistentState = {
  phase: "start",
  phaseIndex: 0,
  houseBuilt: false,
  deaths: 0,
  dragonsKilled: 0,
  reconnects: 0,
};

let bot = null;
let intentionalQuit = false;
let reconnectAttempts = 0;
let progressionRunning = false;
let chatInterval = null;
let pickupInterval = null;
let sleepInterval = null;

// ── Hostile mobs list ───────────────────────────────────────────────────

const HOSTILE_MOBS = [
  "zombie",
  "skeleton",
  "spider",
  "cave_spider",
  "creeper",
  "enderman",
  "witch",
  "pillager",
  "vindicator",
  "ravager",
  "drowned",
  "husk",
  "stray",
  "phantom",
  "blaze",
  "wither_skeleton",
  "ghast",
  "piglin_brute",
  "hoglin",
  "zombified_piglin",
  "magma_cube",
  "slime",
  "shulker",
  "endermite",
  "silverfish",
  "vex",
  "evoker",
];

// ── "arm" command items — NO diamonds, NO netherite ─────────────────────

const ARM_ITEMS = [
  // Weapons & tools
  "iron_sword 1",
  "iron_pickaxe 1",
  "iron_axe 1",
  "iron_shovel 1",
  "bow 1",
  "arrow 64",
  "shield 1",
  "crossbow 1",
  // Armor
  "iron_helmet 1",
  "iron_chestplate 1",
  "iron_leggings 1",
  "iron_boots 1",
  // Food
  "cooked_beef 64",
  "golden_carrot 32",
  // Blocks
  "cobblestone 128",
  "oak_planks 128",
  "oak_log 64",
  "torch 64",
  "crafting_table 2",
  "furnace 2",
  "chest 4",
  // Utility
  "bucket 2",
  "flint_and_steel 1",
  "ender_pearl 16",
  "obsidian 14",
  "bed 1",
];

// ── Chat flavor text ────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const CHAT = {
  spawn: [
    "Ready to slay the dragon! Let's gooo!",
    "The Ender Dragon's days are numbered!",
    "Time to beat this game! Watch me work.",
    "DragonSlayer has entered the server! The End awaits.",
  ],
  progress: [
    "Making progress! One step closer to the dragon.",
    "This is going well! Keep it up, me.",
    "I can feel the dragon trembling already.",
    "Every block mined brings us closer to victory!",
    "Efficiency is my middle name.",
    "The grind pays off!",
    "Almost there... well, maybe not almost. But getting there!",
  ],
  combat: [
    "Take that, you monster!",
    "Not on my watch!",
    "Back off! I'm on a mission!",
    "You picked the wrong bot!",
    "Nothing stops the DragonSlayer!",
  ],
  building: [
    "Building a cozy base to rest in!",
    "Home sweet home! Every adventurer needs one.",
    "Shelter time! Safety first, dragon second.",
    "A good house keeps the creepers out!",
  ],
  death: [
    "Oof! That was rough. Getting back on track!",
    "A minor setback! The dragon won't get off that easy.",
    "I'll be right back! Death can't stop me.",
    "Respawning... the dragon gets one more minute to live.",
  ],
  nether: [
    "Into the Nether! It's getting hot in here.",
    "Blaze rods, here I come!",
    "The Nether is terrifying but I'm not scared. Much.",
    "Nether trip! Wish me luck.",
  ],
  end: [
    "THE END! It's dragon-fighting time!",
    "Here we go! The final battle!",
    "Ender Dragon, prepare to meet your maker!",
    "This is what I was built for!",
  ],
  victory: [
    "WE DID IT! The Ender Dragon is DEFEATED!",
    "GG! The game is beaten! I'm the greatest bot ever!",
    "VICTORY! The dragon has fallen! What a journey!",
    "I beat Minecraft! Someone give me a trophy!",
  ],
  idle: [
    "Hmm, what's that over there?",
    "I should gather more resources...",
    "The dragon isn't gonna slay itself! Oh wait, that's my job.",
    "Anyone got some tips? Just kidding, I know what I'm doing.",
    "Mining, crafting, dragon-slaying... all in a day's work.",
    "I wonder how many blocks I've placed today...",
    "Did you hear that? Probably a creeper. Yikes.",
  ],
  hurt: [
    "Ouch! That stings!",
    "Hey, watch it!",
    "I'm taking damage! Not ideal.",
    "Ow ow ow!",
  ],
};

// ═══════════════════════════════════════════════════════════════════════
//  BOT CREATION & LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════

function startBot() {
  if (intentionalQuit) return;

  // Clean up old bot to prevent memory leaks
  if (bot) {
    try {
      bot.removeAllListeners();
    } catch {}
    try {
      bot.end();
    } catch {}
    bot = null;
  }

  console.log(
    `[Beat] Starting "${BOT_NAME}" → ${HOST}:${PORT} (attempt ${reconnectAttempts + 1})`,
  );

  bot = mineflayer.createBot({
    username: BOT_NAME,
    host: HOST,
    port: PORT,
    version: VERSION,
    auth: process.env.BOT_AUTH || undefined,
    checkTimeoutInterval: 300_000,
  });

  // Load third-party plugins
  bot.loadPlugin(pathfinder);
  bot.loadPlugin(pvp);
  bot.loadPlugin(collectBlock);
  bot.loadPlugin(autoEat);
  bot.loadPlugin(armorManager);
  bot.loadPlugin(toolPlugin);

  // Shared state
  bot._beat = {
    busy: false,
    mode: "idle",
    phase: persistentState.phase,
    houseBuilt: persistentState.houseBuilt,
    houseOrigin: null,
    frozen: false,
    followTarget: null,
    alive: true, // set false on disconnect to stop loops
  };

  // ── Spawn ───────────────────────────────────────────────────────────
  bot.once("spawn", () => {
    console.log("[Beat] Spawned into the world!");
    reconnectAttempts = 0;

    const mcData = mcDataLoader(bot.version);

    // Setup pathfinder
    const defaultMove = new Movements(bot);
    defaultMove.scafoldingBlocks = [];
    defaultMove.canDig = true;
    defaultMove.allow1by1towers = true;
    bot.pathfinder.setMovements(defaultMove);

    // Setup auto-eat
    bot.autoEat.enableAuto();
    bot.autoEat.setOpts({
      priority: "foodPoints",
      minHunger: 15,
      minHealth: 14,
      bannedFood: [
        "rotten_flesh",
        "spider_eye",
        "poisonous_potato",
        "pufferfish",
      ],
      returnToLastItem: true,
      offhand: false,
      eatingTimeout: 3000,
    });

    // Greet
    const greeting = pick(CHAT.spawn);
    bot.chat(greeting);

    // Start chatty interval
    startChatter();

    // Resume progression after reconnect
    if (persistentState.phaseIndex > 0 && !progressionRunning) {
      setTimeout(() => {
        bot.chat("Picking up where I left off! The dragon won't wait forever.");
        runProgression();
      }, 3000);
    }

    // Setup chat commands
    setupChatCommands(mcData);

    // React to damage — auto-retaliate against attacking mobs
    let lastHealth = 20;
    let lastRetaliateTime = 0;
    bot.on("health", () => {
      if (bot.health < lastHealth && bot.health > 0) {
        if (Math.random() < 0.5) bot.chat(pick(CHAT.hurt));
        // Auto-retaliate: find the mob that's attacking us
        if (!bot._beat.frozen) {
          const now = Date.now();
          if (now - lastRetaliateTime > 1500) {
            lastRetaliateTime = now;
            const attacker = bot.nearestEntity(
              (e) =>
                e.type === "mob" &&
                HOSTILE_MOBS.includes(e.name) &&
                e.position.distanceTo(bot.entity.position) < 8,
            );
            if (attacker) {
              equipBestWeapon()
                .then(() => attackEntity(attacker))
                .catch(() => {});
            }
          }
        }
      }
      lastHealth = bot.health;
    });

    // Also retaliate when a mob directly hurts us
    bot.on("entityHurt", (entity) => {
      if (entity !== bot.entity) return;
      if (bot._beat.frozen) return;
      const attacker = bot.nearestEntity(
        (e) =>
          e.type === "mob" &&
          HOSTILE_MOBS.includes(e.name) &&
          e.position.distanceTo(bot.entity.position) < 8,
      );
      if (attacker) {
        equipBestWeapon()
          .then(() => attackEntity(attacker))
          .catch(() => {});
      }
    });
  });

  // ── Death ───────────────────────────────────────────────────────────
  bot.on("death", () => {
    persistentState.deaths++;
    console.log(`[Beat] Died! (deaths: ${persistentState.deaths})`);
    bot._beat.busy = false;
    bot.chat(pick(CHAT.death));
  });

  // ── Auto-pickup nearby dropped items ────────────────────────────────
  let lastPickupAttempt = 0;
  bot.on("entitySpawn", (entity) => {
    if (entity.name !== "item") return;
    if (bot._beat.frozen || bot._beat.busy) return;
    const now = Date.now();
    if (now - lastPickupAttempt < 2000) return; // throttle: max once per 2s
    if (!bot.entity) return;
    const dist = entity.position.distanceTo(bot.entity.position);
    if (dist < 6) {
      lastPickupAttempt = now;
      goTo(entity.position, 0).catch(() => {});
    }
  });

  // Periodically sweep for nearby items on the ground
  if (pickupInterval) clearInterval(pickupInterval);
  pickupInterval = setInterval(() => {
    if (!bot || !bot.entity || !bot._beat?.alive) return;
    if (bot._beat.frozen || bot._beat.busy) return;
    let nearestDist = Infinity;
    let nearest = null;
    for (const entity of Object.values(bot.entities)) {
      if (!entity || entity.name !== "item" || !entity.position) continue;
      const dist = entity.position.distanceTo(bot.entity.position);
      if (dist < 8 && dist < nearestDist) {
        nearest = entity;
        nearestDist = dist;
      }
    }
    if (nearest) {
      goTo(nearest.position, 0).catch(() => {});
    }
  }, 5000);

  // ── Auto-sleep at nighttime ─────────────────────────────────────────
  if (sleepInterval) clearInterval(sleepInterval);
  sleepInterval = setInterval(() => {
    if (!bot || !bot.entity || !bot._beat?.alive) return;
    if (bot._beat.frozen) return;
    if (bot.isSleeping) return;
    // bot.time.timeOfDay >= 12541 means it's night
    if (bot.time && bot.time.timeOfDay >= 12541) {
      const bed = bot.findBlock({
        matching: (block) => bot.isABed(block),
        maxDistance: 32,
      });
      if (bed) {
        goTo(bed.position, 2)
          .then(() => bot.sleep(bed))
          .then(() => bot.chat("Goodnight! Sleeping through the night."))
          .catch(() => {}); // bed occupied, too far, etc.
      }
    }
  }, 30000);

  // ── Disconnect / Reconnect ──────────────────────────────────────────
  bot.on("end", (reason) => {
    console.log(`[Beat] Disconnected: ${reason}`);
    progressionRunning = false;
    bot._beat && (bot._beat.busy = false);
    stopChatter();
    if (pickupInterval) {
      clearInterval(pickupInterval);
      pickupInterval = null;
    }
    if (sleepInterval) {
      clearInterval(sleepInterval);
      sleepInterval = null;
    }

    if (!intentionalQuit && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      persistentState.reconnects++;
      const delay = Math.min(
        RECONNECT_DELAY * Math.ceil(reconnectAttempts / 3),
        30000,
      );
      console.log(
        `[Beat] Reconnecting in ${delay / 1000}s… (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
      );
      setTimeout(startBot, delay);
    } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log("[Beat] Max reconnect attempts reached. Giving up.");
    }
  });

  bot.on("error", (err) => {
    console.error(`[Beat] Error: ${err.message}`);
    // 'end' event fires after error → triggers reconnect
  });

  bot.on("kicked", (reason) => {
    console.log(`[Beat] Kicked: ${reason}`);
    bot._beat && (bot._beat.busy = false);
    // 'end' fires after kick → triggers reconnect
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  CHAT COMMANDS
// ═══════════════════════════════════════════════════════════════════════

function setupChatCommands(mcData) {
  const COMMANDS = {
    help: () => {
      bot.chat(
        "Commands: arm | next | beat | mine <block> | craft <item> | smelt <item> | build <type> | give <item> | drop <item> | equip | eat | sleep | follow <player> | attack <mob> | come | status | stop | resume | inventory | quit",
      );
    },

    arm: () => {
      bot.chat("Gearing up! Giving myself iron weapons, armor, and blocks.");
      for (const entry of ARM_ITEMS) {
        const parts = entry.split(" ");
        const item = parts[0];
        const count = parts[1] || "1";
        // Double-check: absolutely no diamond or netherite
        if (item.includes("diamond") || item.includes("netherite")) continue;
        bot.chat(`/give ${bot.username} ${item} ${count}`);
      }
      bot.chat(
        "Armed and ready! No diamond or netherite — just good iron and grit.",
      );
    },

    status: () => {
      const hp = bot.health?.toFixed(1) ?? "?";
      const food = bot.food ?? "?";
      bot.chat(
        `Phase: ${persistentState.phase} | ` +
          `HP: ${hp}/20 | Food: ${food}/20 | ` +
          `Deaths: ${persistentState.deaths} | ` +
          `House: ${persistentState.houseBuilt ? "Built" : "Not yet"} | ` +
          `Reconnects: ${persistentState.reconnects}`,
      );
    },

    stop: () => {
      progressionRunning = false;
      bot._beat.busy = false;
      bot._beat.mode = "idle";
      try {
        bot.pathfinder.stop();
      } catch {}
      try {
        bot.pvp.stop();
      } catch {}
      bot.chat("Paused! Say 'resume' to continue the dragon quest.");
    },

    next: () => {
      if (!progressionRunning) {
        bot.chat("I'm not running right now. Say 'resume' first!");
        return;
      }
      const nextIdx = persistentState.phaseIndex + 1;
      if (nextIdx >= PHASES.length) {
        bot.chat("I'm already on the last phase!");
        return;
      }
      const nextPhase = PHASES[nextIdx];
      bot.chat(
        `Skipping "${PHASES[persistentState.phaseIndex].label}" → moving to "${nextPhase.label}"!`,
      );
      // Stop current activity
      try {
        bot.pathfinder.stop();
      } catch {}
      try {
        bot.pvp.stop();
      } catch {}
      bot._beat.busy = false;
      // Advance the index so the progression loop picks it up
      persistentState.phaseIndex = nextIdx;
      persistentState.phase = nextPhase.name;
      bot._beat.phase = nextPhase.name;
      // Restart the progression loop from the new phase
      progressionRunning = false;
      setTimeout(() => runProgression(), 500);
    },

    resume: () => {
      if (progressionRunning) {
        bot.chat("I'm already working on it!");
        return;
      }
      bot.chat("Back to it! The dragon awaits!");
      runProgression();
    },

    beat: (args) => {
      // Stop everything first
      progressionRunning = false;
      bot._beat.busy = false;
      bot._beat.mode = "idle";
      try {
        bot.pathfinder.stop();
      } catch {}
      try {
        bot.pvp.stop();
      } catch {}

      const target = (args[0] || "").toLowerCase();
      if (target === "reset" || target === "start") {
        // Full reset — start from the very beginning
        persistentState.phaseIndex = 0;
        persistentState.phase = "start";
        bot._beat.phase = "start";
        bot.chat(
          "Full reset! Starting the entire journey from scratch. Here we go!",
        );
      } else {
        // Default: jump to the end phase (dragon fight)
        const endIdx = PHASES.findIndex((p) => p.name === "end");
        if (endIdx === -1) {
          bot.chat("Can't find the End phase! Restarting from the beginning.");
          persistentState.phaseIndex = 0;
          persistentState.phase = "start";
          bot._beat.phase = "start";
        } else {
          persistentState.phaseIndex = endIdx;
          persistentState.phase = "end";
          bot._beat.phase = "end";
          bot.chat(
            "The dragon thinks it won? WRONG. Resetting to the End fight — round 2!",
          );
        }
      }
      persistentState.dragonsKilled = persistentState.dragonsKilled || 0;
      setTimeout(() => runProgression(), 500);
    },

    build: (args) => {
      if (bot._beat.busy) {
        bot.chat("I'm busy right now! Try again in a bit.");
        return;
      }
      const type = args[0] || "house";
      if (type === "house" || type === "shelter") {
        buildSurvivalHouse();
      } else if (type === "wall") {
        buildSimpleStructure("wall");
      } else if (type === "tower") {
        buildSimpleStructure("tower");
      } else {
        bot.chat(`I can build: house, wall, tower. Try "build house"!`);
      }
    },

    mine: (args) => {
      if (bot._beat.busy) {
        bot.chat("I'm busy right now! Try again in a bit.");
        return;
      }
      const blockName = args[0];
      const count = parseInt(args[1], 10) || 1;
      if (!blockName) {
        bot.chat(
          'Tell me what to mine! e.g. "mine oak_log 5" or "mine diamond_ore"',
        );
        return;
      }
      // Resolve friendly names
      const resolved = resolveBlockName(blockName, args.slice(0, 2).join("_"));
      bot.chat(`Mining ${count}x ${resolved}...`);
      bot._beat.busy = true;
      mineBlock(resolved, count)
        .then((ok) => {
          bot.chat(
            ok
              ? `Done mining ${resolved}!`
              : `Couldn't find ${resolved} nearby.`,
          );
        })
        .catch(() => bot.chat(`Had trouble mining ${resolved}.`))
        .finally(() => {
          bot._beat.busy = false;
        });
    },

    craft: (args) => {
      if (bot._beat.busy) {
        bot.chat("I'm busy right now! Try again in a bit.");
        return;
      }
      const itemName = args[0];
      const count = parseInt(args[1], 10) || 1;
      if (!itemName) {
        bot.chat(
          'Tell me what to craft! e.g. "craft iron_pickaxe" or "craft torch 8"',
        );
        return;
      }
      const resolved = resolveItemName(itemName, args.slice(0, 2).join("_"));
      bot.chat(`Crafting ${count}x ${resolved}...`);
      bot._beat.busy = true;
      craftItem(resolved, count)
        .then((ok) => {
          bot.chat(
            ok
              ? `Crafted ${resolved}!`
              : `Can't craft ${resolved} — missing materials?`,
          );
        })
        .catch(() => bot.chat(`Had trouble crafting ${resolved}.`))
        .finally(() => {
          bot._beat.busy = false;
        });
    },

    smelt: (args) => {
      if (bot._beat.busy) {
        bot.chat("I'm busy right now! Try again in a bit.");
        return;
      }
      const inputName = args[0];
      const count = parseInt(args[1], 10) || 1;
      if (!inputName) {
        bot.chat('Tell me what to smelt! e.g. "smelt raw_iron 5"');
        return;
      }
      bot.chat(`Smelting ${count}x ${inputName}...`);
      bot._beat.busy = true;
      smeltItem(inputName, "coal", count)
        .then((ok) => {
          bot.chat(
            ok ? `Done smelting ${inputName}!` : `Couldn't smelt ${inputName}.`,
          );
        })
        .catch(() => bot.chat(`Had trouble smelting ${inputName}.`))
        .finally(() => {
          bot._beat.busy = false;
        });
    },

    give: (args) => {
      const itemName = args[0];
      const count = args[1] || "1";
      if (!itemName) {
        bot.chat('Usage: give <item> [count]. e.g. "give iron_sword"');
        return;
      }
      if (itemName.includes("diamond") || itemName.includes("netherite")) {
        bot.chat("No diamond or netherite items! I play fair.");
        return;
      }
      bot.chat(`/give ${bot.username} ${itemName} ${count}`);
    },

    drop: (args) => {
      const itemName = args[0];
      const count = parseInt(args[1], 10) || 1;
      if (!itemName) {
        bot.chat('Usage: drop <item> [count]. e.g. "drop cobblestone 32"');
        return;
      }
      const item = bot.inventory.items().find((i) => i.name.includes(itemName));
      if (!item) {
        bot.chat(`I don't have any ${itemName}!`);
        return;
      }
      const toDrop = Math.min(count, item.count);
      bot
        .tossStack(item)
        .then(() => bot.chat(`Dropped ${toDrop}x ${item.name}!`))
        .catch(() => bot.chat("Couldn't drop that."));
    },

    equip: () => {
      bot.chat("Equipping my best gear...");
      equipBestWeapon()
        .then(() => bot.chat("Geared up!"))
        .catch(() => bot.chat("Nothing better to equip."));
    },

    eat: () => {
      const food = bot.inventory.items().find((i) => i.foodRecovery > 0);
      if (!food) {
        bot.chat("I don't have any food!");
        return;
      }
      bot
        .equip(food, "hand")
        .then(() => bot.consume())
        .then(() => bot.chat(`Ate ${food.name}! Yum.`))
        .catch(() => bot.chat("Couldn't eat right now."));
    },

    sleep: () => {
      tryToSleep()
        .then(() => bot.chat("Goodnight!"))
        .catch(() =>
          bot.chat("Can't sleep — no bed nearby or it's not night."),
        );
    },

    follow: (args, sender) => {
      const targetName = args[0] || sender;
      const target = bot.players[targetName];
      if (!target?.entity) {
        bot.chat(`I can't see ${targetName}!`);
        return;
      }
      bot.chat(`Following ${targetName}!`);
      bot._beat.followTarget = targetName;
      const currentBot = bot; // capture reference to detect reconnect
      const followLoop = () => {
        if (currentBot !== bot) return; // bot was replaced, stop
        if (!bot._beat.alive) return;
        if (!bot._beat.followTarget || bot._beat.followTarget !== targetName)
          return;
        const p = bot.players[targetName];
        if (!p?.entity) {
          bot.chat(`Lost sight of ${targetName}.`);
          bot._beat.followTarget = null;
          return;
        }
        const dist = bot.entity.position.distanceTo(p.entity.position);
        if (dist > 3) {
          goTo(p.entity.position, 2).catch(() => {});
        }
        setTimeout(followLoop, 1000);
      };
      followLoop();
    },

    unfollow: () => {
      bot._beat.followTarget = null;
      try {
        bot.pathfinder.stop();
      } catch {}
      bot.chat("Stopped following.");
    },

    attack: (args) => {
      const mobName = args[0];
      if (!mobName) {
        bot.chat('Tell me what to attack! e.g. "attack zombie"');
        return;
      }
      const entity = bot.nearestEntity(
        (e) =>
          e.name && e.name.toLowerCase().includes(mobName) && e.type === "mob",
      );
      if (!entity) {
        bot.chat(`No ${mobName} nearby!`);
        return;
      }
      bot.chat(`Attacking ${entity.name}!`);
      equipBestWeapon()
        .then(() => attackEntity(entity))
        .then(() => bot.chat(`Dealt with that ${entity.name}!`))
        .catch(() => bot.chat("Combat got messy."));
    },

    inventory: () => {
      const items = bot.inventory.items();
      if (items.length === 0) {
        bot.chat("My inventory is empty!");
        return;
      }
      const list = items.map((i) => `${i.name}x${i.count}`).join(", ");
      bot.chat(`Inventory: ${list.substring(0, 200)}`);
    },

    come: (_args, sender) => {
      const player = bot.players[sender];
      if (!player?.entity) {
        bot.chat(`I can't see you, ${sender}!`);
        return;
      }
      goTo(player.entity.position, 2)
        .then(() => bot.chat(`Here I am, ${sender}!`))
        .catch(() => bot.chat("I couldn't get there."));
    },

    quit: () => {
      bot.chat("Farewell! The dragon lives another day...");
      intentionalQuit = true;
      setTimeout(() => bot.quit(), 1000);
    },
  };

  // ── Conversational responses ────────────────────────────────────────
  const RESPONSES = [
    {
      match: /hello|hi|hey|howdy|sup/i,
      replies: [
        "Hey! I'm on a mission to slay the dragon!",
        "Hello! Wanna watch me beat the game?",
        "Hi there! The dragon's days are numbered!",
      ],
    },
    {
      match: /how are you|how('s| is) it going/i,
      replies: [
        "Feeling good! Getting closer to that dragon.",
        "Great! Just another day of dragon hunting.",
        "Living the dream — one block at a time!",
      ],
    },
    {
      match: /thank|thanks|thx|ty/i,
      replies: [
        "No problem!",
        "Anytime, friend!",
        "You're welcome! Now let me get back to slaying.",
      ],
    },
    {
      match: /good (job|work|bot)|nice|well done|gg/i,
      replies: [
        "Thanks! The dragon won't thank me though.",
        "Appreciate it! GG!",
        "Teamwork! ...mostly my work though.",
      ],
    },
    {
      match: /dragon|end|ender|beat|win/i,
      replies: [
        "The dragon doesn't stand a chance!",
        "I live for this! Dragon is going DOWN.",
        "Ender Dragon? More like Ender Done-gon!",
      ],
    },
    {
      match: /scary|creeper|zombie|skeleton/i,
      replies: [
        "Don't worry, I'll handle it!",
        "Nothing stops the DragonSlayer!",
        "Pff, mobs are just XP with legs.",
      ],
    },
    {
      match: /house|home|build|shelter/i,
      replies: [
        "I built (or will build) a cozy house! Say 'build' if you want one.",
        "Every hero needs a base of operations!",
        "Home is where the crafting table is.",
      ],
    },
    {
      match: /bye|goodbye|see ya|leaving/i,
      replies: [
        "See you! I'll keep slaying.",
        "Bye! The dragon hunt continues!",
        "Later! I've got a dragon to kill.",
      ],
    },
    {
      match: /yes|yeah|yep|sure|ok/i,
      replies: ["Let's do this!", "Alright!", "You got it!"],
    },
    {
      match: /no|nah|nope/i,
      replies: ["Okay, no worries!", "Fine by me!", "Roger that."],
    },
    {
      match: /lol|haha|lmao|funny/i,
      replies: [
        "Hehe!",
        "Why don't endermen ever get invited to parties? They always pick up and leave!",
        "What did the dragon say? Nothing, it just roared!",
      ],
    },
  ];

  const GENERIC_REPLIES = [
    "Interesting! Now back to dragon slaying.",
    "Cool cool. Hey, did you know I'm gonna beat the game?",
    "Noted! The dragon is still my priority though.",
    "Mhm! *mines aggressively*",
    "That's nice! I found some ore earlier.",
  ];

  bot.on("chat", (username, message) => {
    if (username === bot.username) return;
    const trimmed = message.trim();
    const lower = trimmed.toLowerCase();
    const [cmd, ...args] = lower.split(/\s+/);

    if (COMMANDS[cmd]) {
      console.log(`[Beat] ${username} → ${cmd} ${args.join(" ")}`);
      COMMANDS[cmd](args, username);
      return;
    }

    // Handle two-word aliases: "mine diamond" → mine ["diamond"]
    const twoWord = [cmd, args[0]].filter(Boolean).join(" ");
    const TWO_WORD_ALIASES = {
      "mine diamond": () => COMMANDS.mine(["diamond_ore", "3"], username),
      "mine iron": () => COMMANDS.mine(["iron_ore", "5"], username),
      "mine coal": () => COMMANDS.mine(["coal_ore", "5"], username),
      "mine gold": () => COMMANDS.mine(["gold_ore", "3"], username),
      "mine wood": () => COMMANDS.mine(["oak_log", "10"], username),
      "mine stone": () => COMMANDS.mine(["stone", "16"], username),
      "mine obsidian": () => COMMANDS.mine(["obsidian", "10"], username),
      "build house": () => COMMANDS.build(["house"], username),
      "build wall": () => COMMANDS.build(["wall"], username),
      "build tower": () => COMMANDS.build(["tower"], username),
      "build shelter": () => COMMANDS.build(["shelter"], username),
      "stand still": () => COMMANDS.stand([], username),
    };
    if (TWO_WORD_ALIASES[twoWord]) {
      console.log(`[Beat] ${username} → ${twoWord}`);
      TWO_WORD_ALIASES[twoWord]();
      return;
    }

    // Conversational
    for (const { match, replies } of RESPONSES) {
      if (match.test(trimmed)) {
        const reply = pick(replies);
        setTimeout(
          () => bot.chat(`${username}, ${reply}`),
          600 + Math.random() * 1000,
        );
        return;
      }
    }
    // Generic — only 40% of the time
    if (Math.random() < 0.4) {
      setTimeout(
        () => bot.chat(`${username}, ${pick(GENERIC_REPLIES)}`),
        800 + Math.random() * 1200,
      );
    }
  });

  // Greet joining players
  bot.on("playerJoined", (player) => {
    if (player.username === bot.username) return;
    setTimeout(() => {
      bot.chat(
        `Welcome ${player.username}! I'm on a mission to beat the game. Say 'help' for commands!`,
      );
    }, 2000);
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  IDLE CHATTER
// ═══════════════════════════════════════════════════════════════════════

function startChatter() {
  stopChatter();
  chatInterval = setInterval(
    () => {
      if (!bot || !bot.entity) return;
      // Only chatter if players are nearby
      const nearby = Object.values(bot.players).filter(
        (p) =>
          p.entity &&
          p.username !== bot.username &&
          p.entity.position.distanceTo(bot.entity.position) < 48,
      );
      if (nearby.length === 0 && Math.random() > 0.2) return;

      const phase = persistentState.phase;
      let pool = CHAT.idle;
      if (phase === "nether" || phase === "nether_prep") pool = CHAT.nether;
      else if (phase === "end") pool = CHAT.end;
      else if (progressionRunning) pool = CHAT.progress;
      bot.chat(pick(pool));
    },
    60_000 + Math.random() * 60_000,
  ); // every 1-2 min
}

function stopChatter() {
  if (chatInterval) {
    clearInterval(chatInterval);
    chatInterval = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  HELPER UTILITIES
// ═══════════════════════════════════════════════════════════════════════

// ── Friendly name resolvers ─────────────────────────────────────────────

const BLOCK_ALIASES = {
  diamond: "diamond_ore",
  iron: "iron_ore",
  gold: "gold_ore",
  coal: "coal_ore",
  copper: "copper_ore",
  lapis: "lapis_ore",
  redstone: "redstone_ore",
  emerald: "emerald_ore",
  wood: "oak_log",
  oak: "oak_log",
  birch: "birch_log",
  spruce: "spruce_log",
  jungle: "jungle_log",
  acacia: "acacia_log",
  dark_oak: "dark_oak_log",
  stone: "stone",
  cobblestone: "cobblestone",
  dirt: "dirt",
  sand: "sand",
  gravel: "gravel",
  obsidian: "obsidian",
  netherrack: "netherrack",
  clay: "clay",
};

function resolveBlockName(name, twoWordName) {
  if (BLOCK_ALIASES[twoWordName]) return BLOCK_ALIASES[twoWordName];
  if (BLOCK_ALIASES[name]) return BLOCK_ALIASES[name];
  return name; // pass through as-is
}

const ITEM_ALIASES = {
  pickaxe: "iron_pickaxe",
  iron_pick: "iron_pickaxe",
  sword: "iron_sword",
  axe: "iron_axe",
  shovel: "iron_shovel",
  hoe: "iron_hoe",
  bed: "red_bed",
  door: "oak_door",
  planks: "oak_planks",
  sticks: "stick",
  table: "crafting_table",
  workbench: "crafting_table",
  furnace: "furnace",
  chest: "chest",
  bucket: "bucket",
  torch: "torch",
  ladder: "ladder",
  boat: "oak_boat",
};

function resolveItemName(name, twoWordName) {
  if (ITEM_ALIASES[twoWordName]) return ITEM_ALIASES[twoWordName];
  if (ITEM_ALIASES[name]) return ITEM_ALIASES[name];
  return name;
}

// ── Simple structure builder ──────────────────────────────────────────

async function buildSimpleStructure(type) {
  bot._beat.busy = true;
  const mcData = mcDataLoader(bot.version);

  try {
    // Get building material
    const plankItem = bot.inventory
      .items()
      .find((i) => i.name.endsWith("_planks"));
    const cobble = bot.inventory.items().find((i) => i.name === "cobblestone");
    const material = cobble || plankItem;

    if (!material || material.count < 16) {
      bot.chat(
        "I need at least 16 planks or cobblestone to build! Gathering...",
      );
      await mineBlock("oak_log", 8).catch(() => {});
      const logCount = countItem("oak_log");
      if (logCount > 0) await craftItem("oak_planks", logCount).catch(() => {});
    }

    const matItem = bot.inventory
      .items()
      .find((i) => i.name.endsWith("_planks") || i.name === "cobblestone");
    if (!matItem || matItem.count < 10) {
      bot.chat("Still not enough materials to build!");
      return;
    }
    const MAT = matItem.name;
    const origin = bot.entity.position.floored().offset(2, 0, 2);

    if (type === "wall") {
      bot.chat("Building a defensive wall...");
      for (let x = 0; x < 9; x++) {
        for (let y = 0; y < 3; y++) {
          await placeBlockAt(origin.offset(x, y, 0), MAT);
        }
      }
      bot.chat("Wall is done! That should keep mobs out.");
    } else if (type === "tower") {
      bot.chat("Building a watchtower...");
      // 3x3 base, 6 tall, with platform on top
      for (let y = 0; y < 6; y++) {
        for (let x = 0; x < 3; x++) {
          for (let z = 0; z < 3; z++) {
            if (x > 0 && x < 2 && z > 0 && z < 2 && y < 5) continue; // hollow inside
            await placeBlockAt(origin.offset(x, y, z), MAT);
          }
        }
      }
      // Top platform 5x5
      for (let x = -1; x < 4; x++) {
        for (let z = -1; z < 4; z++) {
          await placeBlockAt(origin.offset(x, 6, z), MAT);
        }
      }
      bot.chat("Watchtower complete! Great view from up there.");
    }
  } catch (err) {
    console.log(`[Beat] Build ${type} error: ${err.message}`);
    bot.chat(`Had some trouble building the ${type}, but I tried!`);
  } finally {
    bot._beat.busy = false;
  }
}

function countItem(name) {
  return bot.inventory
    .items()
    .filter((i) => i.name === name)
    .reduce((s, i) => s + i.count, 0);
}

function hasItem(name, count = 1) {
  return countItem(name) >= count;
}

function hasEnoughFood(min = 8) {
  const edible = [
    "bread",
    "golden_apple",
    "golden_carrot",
    "cooked_beef",
    "cooked_porkchop",
    "cooked_chicken",
    "cooked_mutton",
    "cooked_rabbit",
    "cooked_salmon",
    "cooked_cod",
    "baked_potato",
    "apple",
    "melon_slice",
    "sweet_berries",
    "pumpkin_pie",
    "cookie",
    "dried_kelp",
  ];
  const food = bot.inventory
    .items()
    .filter((i) => i.name.includes("cooked") || edible.includes(i.name));
  return food.reduce((s, i) => s + i.count, 0) >= min;
}

async function goTo(pos, range = 1) {
  const goal = new goals.GoalNear(pos.x, pos.y, pos.z, range);
  await bot.pathfinder.goto(goal);
}

async function goToBlock(blockName, range = 64) {
  const mcData = mcDataLoader(bot.version);
  const block = bot.findBlock({
    matching: mcData.blocksByName[blockName]?.id,
    maxDistance: range,
  });
  if (!block) return null;
  await goTo(block.position, 2);
  return block;
}

async function mineBlock(blockName, count = 1) {
  const mcData = mcDataLoader(bot.version);
  for (let i = 0; i < count; i++) {
    if (!progressionRunning && bot._beat.mode === "idle") return false;
    const block = bot.findBlock({
      matching: mcData.blocksByName[blockName]?.id,
      maxDistance: 64,
    });
    if (!block) return false;
    try {
      await bot.tool.equipForBlock(block);
      await bot.collectBlock.collect(block);
    } catch {
      return false;
    }
  }
  return true;
}

async function craftItem(itemName, count = 1) {
  const mcData = mcDataLoader(bot.version);
  const item = mcData.itemsByName[itemName];
  if (!item) return false;

  // Try 2x2 grid
  const recipes = bot.recipesFor(item.id, null, 1, null);
  if (recipes.length > 0) {
    try {
      await bot.craft(recipes[0], count, null);
      return true;
    } catch {}
  }

  // Try with crafting table
  let table = bot.findBlock({
    matching: mcData.blocksByName.crafting_table.id,
    maxDistance: 32,
  });
  if (!table) {
    const tableItem = bot.inventory
      .items()
      .find((i) => i.name === "crafting_table");
    if (!tableItem) {
      const planks = bot.inventory
        .items()
        .find((i) => i.name.endsWith("_planks"));
      if (!planks || planks.count < 4) return false;
      const tr = bot.recipesFor(mcData.itemsByName.crafting_table.id);
      if (tr.length === 0) return false;
      await bot.craft(tr[0], 1, null);
    }
    const refBlock = bot.blockAt(bot.entity.position.offset(1, -1, 0));
    if (refBlock) {
      const inv = bot.inventory
        .items()
        .find((i) => i.name === "crafting_table");
      if (inv) {
        await bot.equip(inv, "hand");
        try {
          await bot.placeBlock(refBlock, { x: 0, y: 1, z: 0 });
        } catch {}
      }
    }
    table = bot.findBlock({
      matching: mcData.blocksByName.crafting_table.id,
      maxDistance: 32,
    });
  }

  if (table) {
    await goTo(table.position, 3);
    const recipesT = bot.recipesFor(item.id, null, 1, table);
    if (recipesT.length > 0) {
      try {
        await bot.craft(recipesT[0], count, table);
        return true;
      } catch {}
    }
  }
  return false;
}

async function smeltItem(inputName, fuelName, count = 1) {
  const mcData = mcDataLoader(bot.version);
  let furnace = bot.findBlock({
    matching: mcData.blocksByName.furnace.id,
    maxDistance: 32,
  });

  if (!furnace) {
    const furnaceItem = bot.inventory.items().find((i) => i.name === "furnace");
    if (furnaceItem) {
      const refBlock = bot.blockAt(bot.entity.position.offset(-1, -1, 0));
      if (refBlock) {
        await bot.equip(furnaceItem, "hand");
        try {
          await bot.placeBlock(refBlock, { x: 0, y: 1, z: 0 });
        } catch {}
        furnace = bot.findBlock({
          matching: mcData.blocksByName.furnace.id,
          maxDistance: 32,
        });
      }
    }
  }
  if (!furnace) return false;

  await goTo(furnace.position, 3);
  const f = await bot.openFurnace(furnace);
  const input = bot.inventory.items().find((i) => i.name === inputName);
  const fuel = bot.inventory.items().find((i) => i.name === fuelName);
  if (!input || !fuel) {
    f.close();
    return false;
  }

  await f.putFuel(
    fuel.type,
    null,
    Math.min(fuel.count, Math.ceil(count / 8) + 1),
  );
  await f.putInput(input.type, null, Math.min(input.count, count));
  await new Promise((r) => setTimeout(r, count * 10_000 + 2000));
  await f.takeOutput();
  f.close();
  return true;
}

async function equipBestWeapon() {
  // NO diamond or netherite weapons
  const weapons = [
    "iron_sword",
    "stone_sword",
    "wooden_sword",
    "iron_axe",
    "stone_axe",
    "wooden_axe",
  ];
  for (const name of weapons) {
    const item = bot.inventory.items().find((i) => i.name === name);
    if (item) {
      await bot.equip(item, "hand");
      return;
    }
  }
}

function findNearestHostile(pos, radius = 16) {
  let nearest = null;
  let nearestDist = Infinity;
  for (const entity of Object.values(bot.entities)) {
    if (!entity || entity === bot.entity) continue;
    if (entity.type !== "mob") continue;
    if (!HOSTILE_MOBS.includes(entity.name)) continue;
    const dist = entity.position.distanceTo(pos);
    if (dist < radius && dist < nearestDist) {
      nearest = entity;
      nearestDist = dist;
    }
  }
  return nearest;
}

async function attackEntity(entity) {
  if (!entity || !entity.isValid) return;
  try {
    await equipBestWeapon();
    await bot.pvp.attack(entity);
  } catch {}
}

async function stripMine(targetOre, count = 1) {
  const mcData = mcDataLoader(bot.version);
  let collected = 0;
  const oreId = mcData.blocksByName[targetOre]?.id;
  if (!oreId) return false;

  for (let attempt = 0; attempt < 200 && collected < count; attempt++) {
    if (!progressionRunning) return false;
    const oreBlock = bot.findBlock({ matching: oreId, maxDistance: 16 });
    if (oreBlock) {
      try {
        await bot.tool.equipForBlock(oreBlock);
        await bot.collectBlock.collect(oreBlock);
        collected++;
        continue;
      } catch {}
    }
    const forward = bot.entity.position.offset(
      Math.round(-Math.sin(bot.entity.yaw)),
      0,
      Math.round(Math.cos(bot.entity.yaw)),
    );
    const blockAhead = bot.blockAt(forward);
    const blockAbove = bot.blockAt(forward.offset(0, 1, 0));
    if (blockAhead && bot.canDigBlock(blockAhead)) {
      await bot.tool.equipForBlock(blockAhead);
      await bot.dig(blockAhead);
    }
    if (blockAbove && bot.canDigBlock(blockAbove)) {
      await bot.tool.equipForBlock(blockAbove);
      await bot.dig(blockAbove);
    }
    try {
      await goTo(forward, 0);
    } catch {
      break;
    }
  }
  return collected >= count;
}

async function digDown(targetY) {
  while (Math.floor(bot.entity.position.y) > targetY) {
    if (!progressionRunning) return;
    const below = bot.blockAt(bot.entity.position.offset(0, -1, 0));
    if (below && bot.canDigBlock(below)) {
      await bot.tool.equipForBlock(below);
      await bot.dig(below);
    }
    await bot.waitForTicks(4);
  }
}

async function tryToSleep() {
  if (!bot.time?.isDay) {
    const bed = bot.findBlock({
      matching: (block) => bot.isABed(block),
      maxDistance: 32,
    });
    if (bed) {
      try {
        await bot.sleep(bed);
        return true;
      } catch {}
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════
//  BUILDING — survival house
// ═══════════════════════════════════════════════════════════════════════

function findGroundY(pos) {
  for (let y = pos.y + 5; y > pos.y - 10; y--) {
    const block = bot.blockAt(new Vec3(pos.x, y, pos.z));
    const blockAbove = bot.blockAt(new Vec3(pos.x, y + 1, pos.z));
    if (
      block &&
      blockAbove &&
      block.boundingBox === "block" &&
      blockAbove.boundingBox === "empty"
    ) {
      return y;
    }
  }
  return null;
}

async function findFlatArea(width, depth) {
  const pos = bot.entity.position.floored();
  for (let dx = 2; dx < 20; dx += 3) {
    for (let dz = 2; dz < 20; dz += 3) {
      for (const [sx, sz] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const check = pos.offset(dx * sx, 0, dz * sz);
        const groundY = findGroundY(check);
        if (groundY === null) continue;
        let flat = true;
        for (let x = 0; x < width && flat; x++) {
          for (let z = 0; z < depth && flat; z++) {
            const gy = findGroundY(check.offset(x, 0, z));
            if (gy === null || Math.abs(gy - groundY) > 1) flat = false;
          }
        }
        if (flat) return new Vec3(check.x, groundY + 1, check.z);
      }
    }
  }
  return null;
}

async function clearArea(origin, w, h, d) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < d; z++) {
        const block = bot.blockAt(origin.offset(x, y, z));
        if (block && block.name !== "air" && bot.canDigBlock(block)) {
          try {
            await bot.tool.equipForBlock(block);
            await bot.dig(block);
          } catch {}
        }
      }
    }
  }
}

async function placeBlockAt(targetPos, blockName) {
  const item = bot.inventory.items().find((i) => i.name === blockName);
  if (!item) return false;
  try {
    const offsets = [
      [0, -1, 0],
      [0, 1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    for (const [ox, oy, oz] of offsets) {
      const refPos = targetPos.offset(ox, oy, oz);
      const refBlock = bot.blockAt(refPos);
      if (refBlock && refBlock.boundingBox === "block") {
        const dist = bot.entity.position.distanceTo(targetPos);
        if (dist > 4.5) {
          try {
            await goTo(targetPos, 3);
          } catch {}
        }
        await bot.equip(item, "hand");
        await bot.placeBlock(refBlock, new Vec3(-ox, -oy, -oz));
        return true;
      }
    }
  } catch {}
  return false;
}

async function placeItemAt(targetPos, itemName) {
  const item = bot.inventory.items().find((i) => i.name === itemName);
  if (!item) return false;
  try {
    const dist = bot.entity.position.distanceTo(targetPos);
    if (dist > 4) {
      try {
        await goTo(targetPos, 2);
      } catch {}
    }
    const below = bot.blockAt(targetPos.offset(0, -1, 0));
    if (below && below.boundingBox === "block") {
      await bot.equip(item, "hand");
      await bot.placeBlock(below, new Vec3(0, 1, 0));
      return true;
    }
  } catch {}
  return false;
}

async function buildSurvivalHouse() {
  if (persistentState.houseBuilt) {
    bot.chat("I already built a house! We're good.");
    return true;
  }

  bot._beat.busy = true;
  bot.chat(pick(CHAT.building));

  try {
    // Gather wood
    const logTypes = [
      "oak_log",
      "birch_log",
      "spruce_log",
      "dark_oak_log",
      "acacia_log",
      "jungle_log",
    ];
    const totalPlanks = bot.inventory
      .items()
      .filter((i) => i.name.endsWith("_planks"))
      .reduce((s, i) => s + i.count, 0);

    if (totalPlanks < 80) {
      bot.chat("Chopping wood for the house...");
      for (const log of logTypes) {
        const have = countItem(log);
        if (have < 20) await mineBlock(log, 24 - have).catch(() => {});
        if (countItem(log) >= 16) break;
      }
      for (const log of logTypes) {
        const c = countItem(log);
        if (c > 0)
          await craftItem(log.replace("_log", "_planks"), Math.floor(c)).catch(
            () => {},
          );
      }
    }

    // Craft necessities
    if (
      !hasItem("oak_door") &&
      !hasItem("spruce_door") &&
      !hasItem("birch_door")
    )
      await craftItem("oak_door", 1).catch(() => {});
    if (!hasItem("crafting_table"))
      await craftItem("crafting_table", 1).catch(() => {});
    if (!hasItem("chest")) await craftItem("chest", 1).catch(() => {});

    // Craft torches
    if (!hasItem("torch", 4)) {
      if (!hasItem("coal", 2)) await mineBlock("coal_ore", 2).catch(() => {});
      if (hasItem("coal") && hasItem("stick"))
        await craftItem("torch", 4).catch(() => {});
    }

    const plankItem = bot.inventory
      .items()
      .find((i) => i.name.endsWith("_planks"));
    if (!plankItem || plankItem.count < 30) {
      bot.chat("Not enough planks to build! I'll keep gathering...");
      return false;
    }
    const PLANK = plankItem.name;

    // Find flat area
    bot.chat("Finding a good spot to build...");
    const basePos = await findFlatArea(7, 7);
    const origin = basePos || bot.entity.position.floored().offset(2, 0, 2);
    bot._beat.houseOrigin = origin;

    bot.chat("Building! Stand back...");
    await clearArea(origin, 7, 6, 7);

    // Floor (7x7)
    bot.chat("Laying the floor...");
    for (let x = 0; x < 7; x++) {
      for (let z = 0; z < 7; z++) {
        await placeBlockAt(origin.offset(x, -1, z), PLANK);
      }
    }

    // Walls (4 high)
    bot.chat("Building walls...");
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 7; x++) {
        for (let z = 0; z < 7; z++) {
          if (x > 0 && x < 6 && z > 0 && z < 6) continue; // interior
          if (z === 0 && x === 3 && y < 2) continue; // door opening
          if (y === 2 && (z === 0 || z === 6) && x === 3) continue; // front/back windows
          if (y === 2 && (x === 0 || x === 6) && z === 3) continue; // side windows
          await placeBlockAt(origin.offset(x, y, z), PLANK);
        }
      }
    }

    // Roof
    bot.chat("Adding the roof...");
    for (let x = 0; x < 7; x++) {
      for (let z = 0; z < 7; z++) {
        await placeBlockAt(origin.offset(x, 4, z), PLANK);
      }
    }

    // Furnishings
    bot.chat("Decorating the interior...");
    const doorItem = bot.inventory
      .items()
      .find((i) => i.name.endsWith("_door"));
    if (doorItem) await placeItemAt(origin.offset(3, 0, 0), doorItem.name);
    if (hasItem("crafting_table"))
      await placeItemAt(origin.offset(1, 0, 1), "crafting_table");
    if (hasItem("chest")) await placeItemAt(origin.offset(5, 0, 1), "chest");
    if (hasItem("furnace"))
      await placeItemAt(origin.offset(1, 0, 5), "furnace");
    if (hasItem("torch")) {
      await placeItemAt(origin.offset(3, 2, 3), "torch");
      if (hasItem("torch")) await placeItemAt(origin.offset(1, 2, 3), "torch");
    }
    const bedItem = bot.inventory.items().find((i) => i.name.endsWith("_bed"));
    if (bedItem) await placeItemAt(origin.offset(5, 0, 5), bedItem.name);

    bot.chat("House is DONE! Home sweet home! Now back to dragon slaying.");
    persistentState.houseBuilt = true;
    bot._beat.houseBuilt = true;
    return true;
  } catch (err) {
    console.log(`[Beat] Build error: ${err.message}`);
    bot.chat("Had trouble building, but I did my best!");
    return false;
  } finally {
    bot._beat.busy = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  NETHER HELPERS
// ═══════════════════════════════════════════════════════════════════════

async function buildNetherPortal() {
  if (countItem("obsidian") < 10) {
    bot.chat("Need at least 10 obsidian!");
    return false;
  }
  if (countItem("flint_and_steel") < 1) {
    bot.chat("Need flint and steel!");
    return false;
  }

  bot.chat("Building a Nether portal...");
  const base = bot.entity.position.offset(2, 0, 0).floored();
  const portalBlocks = [];
  for (let z = 0; z < 4; z++) portalBlocks.push(base.offset(0, 0, z));
  for (let z = 0; z < 4; z++) portalBlocks.push(base.offset(0, 4, z));
  for (let y = 1; y < 4; y++) portalBlocks.push(base.offset(0, y, 0));
  for (let y = 1; y < 4; y++) portalBlocks.push(base.offset(0, y, 3));

  for (const pos of portalBlocks) {
    const existing = bot.blockAt(pos);
    if (existing && existing.name !== "air" && existing.name !== "obsidian")
      await bot.dig(existing);
    if (!existing || existing.name !== "obsidian") {
      const refBlock = bot.blockAt(pos.offset(0, -1, 0));
      if (refBlock && refBlock.boundingBox !== "empty") {
        const obs = bot.inventory.items().find((i) => i.name === "obsidian");
        if (obs) {
          await bot.equip(obs, "hand");
          try {
            await bot.placeBlock(refBlock, { x: 0, y: 1, z: 0 });
          } catch {}
        }
      }
    }
  }

  const flint = bot.inventory.items().find((i) => i.name === "flint_and_steel");
  if (flint) {
    await bot.equip(flint, "hand");
    const insideBlock = bot.blockAt(base.offset(0, 1, 1));
    if (insideBlock) {
      try {
        await bot.activateBlock(insideBlock);
      } catch {}
    }
  }
  bot.chat("Nether portal is ready! Let's go!");
  return true;
}

async function huntBlazes(targetRods = 7) {
  bot.chat(`Hunting blazes... need ${targetRods} rods.`);
  let collected = countItem("blaze_rod");
  for (
    let i = 0;
    i < 300 && collected < targetRods && progressionRunning;
    i++
  ) {
    const blaze = Object.values(bot.entities).find(
      (e) =>
        e.name === "blaze" && e.position.distanceTo(bot.entity.position) < 32,
    );
    if (blaze) {
      await attackEntity(blaze);
      await bot.waitForTicks(20);
    } else {
      const dir = new Vec3(
        (Math.random() - 0.5) * 20,
        0,
        (Math.random() - 0.5) * 20,
      );
      try {
        await goTo(bot.entity.position.plus(dir), 2);
      } catch {
        break;
      }
      await bot.waitForTicks(40);
    }
    collected = countItem("blaze_rod");
  }
  return collected >= targetRods;
}

async function barterForPearls(target = 12) {
  let pearls = countItem("ender_pearl");
  if (pearls >= target) return true;
  bot.chat("Trading gold with piglins for ender pearls...");
  for (let i = 0; i < 200 && pearls < target && progressionRunning; i++) {
    const gold = bot.inventory.items().find((i) => i.name === "gold_ingot");
    if (!gold) {
      bot.chat("Ran out of gold!");
      return false;
    }
    const piglin = Object.values(bot.entities).find(
      (e) =>
        e.name === "piglin" && e.position.distanceTo(bot.entity.position) < 16,
    );
    if (piglin) {
      await bot.equip(gold, "hand");
      await bot.lookAt(piglin.position.offset(0, 1, 0));
      await bot.toss(gold.type, null, 1);
      await bot.waitForTicks(200);
    } else break;
    pearls = countItem("ender_pearl");
  }
  return pearls >= target;
}

// ═══════════════════════════════════════════════════════════════════════
//  END HELPERS
// ═══════════════════════════════════════════════════════════════════════

async function craftEyesOfEnder(count = 12) {
  const blazeRods = countItem("blaze_rod");
  const existingPowder = countItem("blaze_powder");
  const neededPowder = Math.max(0, count - existingPowder);
  if (neededPowder > 0 && blazeRods > 0)
    await craftItem(
      "blaze_powder",
      Math.min(blazeRods, Math.ceil(neededPowder / 2)),
    );
  const eyes = countItem("ender_eye");
  if (eyes >= count) return true;
  return await craftItem("ender_eye", count - eyes);
}

async function locateStronghold() {
  const mcData = mcDataLoader(bot.version);
  bot.chat("Throwing Eyes of Ender to find the stronghold...");
  for (let i = 0; i < 3; i++) {
    const eye = bot.inventory.items().find((it) => it.name === "ender_eye");
    if (!eye) {
      bot.chat("Need more Eyes of Ender!");
      return null;
    }
    await bot.equip(eye, "hand");
    await bot.look(bot.entity.yaw, -Math.PI / 4);
    await bot.activateItem();
    await bot.waitForTicks(60);

    const portalFrame = bot.findBlock({
      matching: mcData.blocksByName.end_portal_frame?.id,
      maxDistance: 128,
    });
    if (portalFrame) {
      bot.chat("Found the stronghold!");
      return portalFrame.position;
    }

    const moveDir = new Vec3(
      (Math.random() > 0.5 ? 1 : -1) * 80,
      0,
      (Math.random() > 0.5 ? 1 : -1) * 80,
    );
    try {
      await goTo(bot.entity.position.plus(moveDir), 5);
    } catch {}
  }
  return null;
}

async function activateEndPortal() {
  const mcData = mcDataLoader(bot.version);
  const frameId = mcData.blocksByName.end_portal_frame?.id;
  if (!frameId) return false;
  const frames = bot.findBlocks({
    matching: frameId,
    maxDistance: 16,
    count: 12,
  });
  if (frames.length === 0) {
    bot.chat("Can't find End portal frames!");
    return false;
  }
  bot.chat("Activating the End portal...");
  for (const pos of frames) {
    const block = bot.blockAt(new Vec3(pos.x, pos.y, pos.z));
    if (!block) continue;
    const hasEye = block.getProperties?.().eye === "true";
    if (hasEye) continue;
    const eye = bot.inventory.items().find((i) => i.name === "ender_eye");
    if (!eye) {
      bot.chat("Ran out of Eyes of Ender!");
      return false;
    }
    await goTo(pos, 3);
    await bot.equip(eye, "hand");
    try {
      await bot.activateBlock(block);
    } catch {}
    await bot.waitForTicks(10);
  }
  bot.chat("End portal activated! Jumping in!");
  return true;
}

async function fightDragon() {
  bot.chat(pick(CHAT.end));
  bot._beat.busy = true;

  try {
    // Destroy End Crystals
    bot.chat("Destroying End Crystals first...");
    for (let i = 0; i < 60 && progressionRunning; i++) {
      const crystal = Object.values(bot.entities).find(
        (e) =>
          e.name === "end_crystal" &&
          e.position.distanceTo(bot.entity.position) < 64,
      );
      if (!crystal) break;
      const bow = bot.inventory.items().find((i) => i.name === "bow");
      if (bow && crystal.position.distanceTo(bot.entity.position) > 8) {
        await bot.equip(bow, "hand");
        await bot.lookAt(crystal.position.offset(0, 1, 0));
        bot.activateItem();
        await bot.waitForTicks(15);
        bot.deactivateItem();
      } else {
        try {
          await goTo(crystal.position, 4);
          await equipBestWeapon();
          await bot.attack(crystal);
        } catch {}
      }
      await bot.waitForTicks(20);
    }

    // Attack Dragon
    bot.chat("Engaging the Ender Dragon!");
    for (let round = 0; round < 300 && progressionRunning; round++) {
      const dragon = Object.values(bot.entities).find(
        (e) => e.name === "ender_dragon",
      );
      if (!dragon) break;
      const dist = dragon.position.distanceTo(bot.entity.position);
      if (dist < 8) {
        await equipBestWeapon();
        try {
          await bot.attack(dragon);
        } catch {}
      } else if (dist < 48) {
        const bow = bot.inventory.items().find((i) => i.name === "bow");
        const arrows = bot.inventory.items().find((i) => i.name === "arrow");
        if (bow && arrows) {
          await bot.equip(bow, "hand");
          await bot.lookAt(dragon.position.offset(0, 2, 0));
          bot.activateItem();
          await bot.waitForTicks(15);
          bot.deactivateItem();
        } else {
          try {
            await goTo(dragon.position, 5);
          } catch {}
        }
      } else {
        try {
          await goTo({ x: 0, y: 64, z: 0 }, 10);
        } catch {}
      }
      await bot.waitForTicks(10);
    }

    const dragon = Object.values(bot.entities).find(
      (e) => e.name === "ender_dragon",
    );
    if (!dragon) {
      persistentState.dragonsKilled++;
      bot.chat(pick(CHAT.victory));
    } else {
      bot.chat("The dragon's tough! I might need another try...");
    }
  } catch (err) {
    console.log(`[Beat] Dragon fight error: ${err.message}`);
    bot.chat("Dragon fight hit a snag...");
  } finally {
    bot._beat.busy = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  PROGRESSION — beat the game
// ═══════════════════════════════════════════════════════════════════════

const PHASES = [
  {
    name: "start",
    label: "Gather wood and make basic tools",
    async execute() {
      const logTypes = [
        "oak_log",
        "birch_log",
        "spruce_log",
        "dark_oak_log",
        "acacia_log",
        "jungle_log",
      ];
      const hasLogs = logTypes.some((l) => hasItem(l, 8));
      if (!hasLogs) {
        bot.chat("First things first — chopping some trees!");
        for (const log of logTypes) {
          if (await mineBlock(log, 16)) break;
        }
      }
      for (const log of logTypes) {
        const planks = log.replace("_log", "_planks");
        if (countItem(log) >= 4) await craftItem(planks, 4);
      }
      if (!hasItem("stick", 8)) await craftItem("stick", 4);
      if (!hasItem("crafting_table")) await craftItem("crafting_table", 1);
      if (
        !hasItem("wooden_pickaxe") &&
        !hasItem("stone_pickaxe") &&
        !hasItem("iron_pickaxe")
      )
        await craftItem("wooden_pickaxe", 1);
      if (
        !hasItem("wooden_sword") &&
        !hasItem("stone_sword") &&
        !hasItem("iron_sword")
      )
        await craftItem("wooden_sword", 1);
      bot.chat("Basic tools crafted! Moving on.");
      return true;
    },
  },
  {
    name: "base",
    label: "Build a house for safety",
    async execute() {
      bot.chat("Time to build a home base!");
      if (!hasItem("torch", 4)) {
        if (!hasItem("coal", 2)) await mineBlock("coal_ore", 2).catch(() => {});
        if (hasItem("coal") && hasItem("stick"))
          await craftItem("torch", 4).catch(() => {});
      }
      return await buildSurvivalHouse();
    },
  },
  {
    name: "iron",
    label: "Get stone tools and mine iron",
    async execute() {
      bot.chat("Going underground for iron!");
      if (!hasItem("cobblestone", 20)) await mineBlock("stone", 24);
      if (!hasItem("stone_pickaxe") && !hasItem("iron_pickaxe"))
        await craftItem("stone_pickaxe", 1);
      if (!hasItem("stone_sword") && !hasItem("iron_sword"))
        await craftItem("stone_sword", 1);
      if (!hasItem("furnace")) await craftItem("furnace", 1);

      if (!hasItem("iron_ingot", 16) && !hasItem("raw_iron", 16)) {
        await digDown(40);
        await stripMine("iron_ore", 12);
        await stripMine("deepslate_iron_ore", 6);
      }
      if (!hasItem("coal", 8)) {
        await stripMine("coal_ore", 8);
        await stripMine("deepslate_coal_ore", 4);
      }
      const rawIron = countItem("raw_iron");
      if (rawIron > 0) await smeltItem("raw_iron", "coal", rawIron);

      if (hasItem("iron_ingot", 3)) await craftItem("iron_pickaxe", 1);
      if (hasItem("iron_ingot", 2)) await craftItem("iron_sword", 1);
      if (hasItem("iron_ingot", 8)) {
        await craftItem("iron_chestplate", 1);
        if (hasItem("iron_ingot", 5)) await craftItem("iron_helmet", 1);
        if (hasItem("iron_ingot", 7)) await craftItem("iron_leggings", 1);
        if (hasItem("iron_ingot", 4)) await craftItem("iron_boots", 1);
      }
      if (hasItem("iron_ingot", 1)) await craftItem("shield", 1);
      if (hasItem("iron_ingot", 3)) await craftItem("bucket", 1);
      bot.chat("Iron gear acquired! Looking strong.");
      return hasItem("iron_pickaxe");
    },
  },
  {
    name: "nether_prep",
    label: "Prepare for the Nether",
    async execute() {
      bot.chat("Preparing for the Nether! Getting obsidian and supplies...");
      if (!hasItem("obsidian", 10)) {
        await goToBlock("lava", 64);
        await mineBlock("obsidian", 10);
      }
      if (!hasItem("flint_and_steel")) {
        if (!hasItem("flint")) await mineBlock("gravel", 5);
        if (hasItem("flint") && hasItem("iron_ingot"))
          await craftItem("flint_and_steel", 1);
      }
      if (!hasItem("gold_ingot", 32)) {
        await stripMine("gold_ore", 16);
        await stripMine("deepslate_gold_ore", 16);
        const raw = countItem("raw_gold");
        if (raw > 0) await smeltItem("raw_gold", "coal", raw);
      }
      if (!hasEnoughFood(16)) {
        for (const animal of ["cow", "pig", "sheep", "chicken"]) {
          const mob = Object.values(bot.entities).find(
            (e) =>
              e.name === animal &&
              e.position.distanceTo(bot.entity.position) < 32,
          );
          if (mob) {
            await attackEntity(mob);
            await bot.waitForTicks(20);
          }
        }
        for (const raw of [
          "raw_beef",
          "raw_porkchop",
          "raw_mutton",
          "raw_chicken",
        ]) {
          const c = countItem(raw);
          if (c > 0) await smeltItem(raw, "coal", c);
        }
      }
      if (!hasItem("bow")) await craftItem("bow", 1);
      if (!hasItem("arrow", 32)) await craftItem("arrow", 16);
      bot.chat("Nether prep done! Let's light this portal.");
      return hasItem("obsidian", 10) && hasItem("flint_and_steel");
    },
  },
  {
    name: "nether",
    label: "Enter Nether — blaze rods & ender pearls",
    async execute() {
      bot.chat(pick(CHAT.nether));
      await buildNetherPortal();
      bot.chat("Entering the Nether...");
      await bot.waitForTicks(100);
      await huntBlazes(7);
      await barterForPearls(12);
      return hasItem("blaze_rod", 7) && hasItem("ender_pearl", 12);
    },
  },
  {
    name: "stronghold",
    label: "Find the stronghold & activate End portal",
    async execute() {
      bot.chat("Heading back to find the stronghold!");
      const mcData = mcDataLoader(bot.version);
      const portal = bot.findBlock({
        matching: mcData.blocksByName.nether_portal?.id,
        maxDistance: 128,
      });
      if (portal) {
        await goTo(portal.position, 1);
        await bot.waitForTicks(100);
      }
      await craftEyesOfEnder(12);
      const pos = await locateStronghold();
      if (pos) await goTo(pos, 5);
      return await activateEndPortal();
    },
  },
  {
    name: "end",
    label: "Fight the Ender Dragon!",
    async execute() {
      await bot.waitForTicks(100);
      await fightDragon();
      const dragon = Object.values(bot.entities).find(
        (e) => e.name === "ender_dragon",
      );
      return !dragon;
    },
  },
];

async function runProgression() {
  if (progressionRunning) return;
  progressionRunning = true;
  bot._beat.mode = "progress";
  bot.chat("Let's beat Minecraft! The Ender Dragon won't know what hit it.");

  try {
    for (let i = persistentState.phaseIndex; i < PHASES.length; i++) {
      if (!progressionRunning) break;
      const phase = PHASES[i];
      persistentState.phase = phase.name;
      persistentState.phaseIndex = i;
      bot._beat.phase = phase.name;

      bot.chat(`--- Phase: ${phase.label} ---`);
      console.log(`[Beat] Phase: ${phase.name}`);

      // Fight nearby hostiles between phases
      const hostile = findNearestHostile(bot.entity.position, 16);
      if (hostile) {
        bot.chat(pick(CHAT.combat));
        await attackEntity(hostile);
      }

      // Try to sleep
      await tryToSleep();

      let success = false;
      try {
        success = await phase.execute();
      } catch (err) {
        console.log(`[Beat] Phase ${phase.name} error: ${err.message}`);
      }

      if (!success && progressionRunning) {
        bot.chat(`Stuck on "${phase.label}". Retrying...`);
        try {
          success = await phase.execute();
        } catch {}
        if (!success) {
          bot.chat(
            `Still stuck on "${phase.label}". Might need help or I'll keep trying!`,
          );
        }
      }
    }

    if (progressionRunning) {
      persistentState.phase = "victory";
      bot.chat(pick(CHAT.victory));
    }
  } catch (err) {
    console.error(`[Beat] Progression error: ${err.message}`);
    bot.chat(`Hit a snag: ${err.message}. I'll keep trying!`);
  } finally {
    progressionRunning = false;
    bot._beat.mode = "idle";
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  START
// ═══════════════════════════════════════════════════════════════════════

startBot();

// Auto-start progression 5s after first spawn
setTimeout(() => {
  if (bot && !progressionRunning) {
    runProgression();
  }
}, 8000);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("[Beat] Shutting down...");
  intentionalQuit = true;
  stopChatter();
  if (bot) bot.quit();
  process.exit(0);
});
