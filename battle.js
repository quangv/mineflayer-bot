/**
 * Battle Mode — 5 bots, Team Red vs Team Blue!
 *
 * RED TEAM (3 bots — trying to beat the game):
 *   - FriendlyBot  (leader, runs full progression)
 *   - RedGuard1    (bodyguard, protects FriendlyBot)
 *   - RedGuard2    (bodyguard, gathers resources & defends)
 *
 * BLUE TEAM (2 bots — hunters trying to stop Red):
 *   - BlueHunter1  (aggressive, chases red team)
 *   - BlueHunter2  (sneaky, flanker)
 *
 * All bots are a little dumb — they miss, get distracted,
 * panic, forget what they were doing, etc.
 *
 * Usage:
 *   node battle.js
 *
 * Chat commands (say in-game):
 *   fight          — Blue team starts hunting Red team
 *   stop           — Everyone stops fighting
 *   beat           — Red team starts progression (beat the game)
 *   score          — Show kill scoreboard
 *   reset          — Heal all bots
 *   kit <tier>     — Give all bots gear (stone/iron/diamond/netherite)
 *   arm red / arm blue — Give random gear to one team
 *   quit           — Disconnect all bots
 */

import "dotenv/config";
import mineflayer from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
const { pathfinder, Movements, goals } = pathfinderPkg;
import pvpPkg from "mineflayer-pvp";
const { plugin: pvp } = pvpPkg;
import armorManager from "mineflayer-armor-manager";
import collectBlockPkg from "mineflayer-collectblock";
const { plugin: collectBlock } = collectBlockPkg;
import { loader as autoEat } from "mineflayer-auto-eat";
import toolPkg from "mineflayer-tool";
const { plugin: toolPlugin } = toolPkg;

// Import the full FriendlyBot module system for red leader
import { setupNavigation } from "./src/plugins/navigation.js";
import { setupCombat } from "./src/plugins/combat.js";
import { setupProtection } from "./src/plugins/protection.js";
import { setupSurvival } from "./src/plugins/survival.js";
import { setupMining } from "./src/plugins/mining.js";
import { setupCrafting } from "./src/plugins/crafting.js";
import { setupInventory } from "./src/plugins/inventory.js";
import { setupNether } from "./src/plugins/nether.js";
import { setupEnd } from "./src/plugins/end.js";
import { setupBuilding } from "./src/plugins/building.js";
import { setupProgression } from "./src/progression/index.js";
import config from "./config.js";

// ── Config ──────────────────────────────────────────────────────────────

const HOST = process.env.BOT_HOST || "127.0.0.1";
const PORT = parseInt(process.env.BOT_PORT, 10) || 25565;
const VERSION = process.env.BOT_VERSION || "1.20.4";

const BOTS_CONFIG = [
  // ── Red Team ──
  { name: "FriendlyBot", team: "red", role: "leader", color: "\x1b[31m" },
  { name: "RedGuard1", team: "red", role: "bodyguard", color: "\x1b[33m" },
  { name: "RedGuard2", team: "red", role: "gatherer", color: "\x1b[35m" },
  // ── Blue Team ──
  { name: "BlueHunter1", team: "blue", role: "hunter", color: "\x1b[34m" },
  { name: "BlueHunter2", team: "blue", role: "flanker", color: "\x1b[36m" },
];

// ── State ───────────────────────────────────────────────────────────────

const bots = {}; // { name: bot }
const score = { red: 0, blue: 0 };
let hunting = false; // Blue team is actively hunting
let progressing = false; // Red team is trying to beat the game
let readyCount = 0;

// ── Dumb Bot Personality ────────────────────────────────────────────────

const DUMB_CHANCE = 0.25; // 25% chance to do something stupid each tick

const DUMB_THINGS = [
  (bot) => {
    bot.chat("Wait... where am I?");
    bot.look(Math.random() * Math.PI * 2, 0);
  },
  (bot) => {
    bot.chat("Ooh a butterfly!");
    bot.setControlState("jump", true);
    setTimeout(() => bot.clearControlStates(), 1500);
  },
  (bot) => {
    bot.chat("I think I dropped something...");
    bot.setControlState("back", true);
    setTimeout(() => bot.clearControlStates(), 800);
  },
  (bot) => {
    bot.chat("*sneezes*");
    bot.swingArm("hand");
  },
  (bot) => {
    bot.chat("Hmm let me think about this...");
  },
  (bot) => {
    bot.chat("Was I supposed to go left or right?");
    bot.look(bot.entity.yaw + Math.PI, 0);
  },
  (bot) => {
    bot.chat("Hold on I need to tie my shoes");
  },
  (bot) => {
    bot.chat("*walks into a wall*");
    bot.setControlState("forward", true);
    setTimeout(() => bot.clearControlStates(), 600);
  },
  (bot) => {
    bot.chat("Is that a chicken? I love chickens!");
  },
  (bot) => {
    bot.setControlState("sneak", true);
    bot.chat("shh I'm being sneaky");
    setTimeout(() => bot.clearControlStates(), 2000);
  },
  (bot) => {
    bot.chat("Guys... which way is north?");
  },
  (bot) => {
    bot.chat("I forgot my sword at home!");
  },
  (bot) => {
    bot.swingArm("hand");
    bot.swingArm("hand");
    bot.chat("Take that, air!");
  },
  (bot) => {
    bot.chat("*trips over nothing*");
    bot.setControlState("jump", true);
    setTimeout(() => bot.clearControlStates(), 300);
  },
  (bot) => {
    bot.chat("BRB gonna check something");
  },
];

const RED_CHATTER = [
  "Team Red! Let's go!",
  "Protect the leader!",
  "We got this, boys!",
  "Blue team is coming, watch out!",
  "Stay together!",
  "I'll watch your back!",
  "Did anyone bring food?",
  "We need more wood!",
  "The Ender Dragon doesn't stand a chance!",
  "Is it just me or is that creeper staring at us?",
];

const BLUE_CHATTER = [
  "Find them! Destroy them!",
  "Red team can't hide forever!",
  "Let's go hunting!",
  "I smell fear... and oak planks.",
  "They're trying to beat the game? Not on my watch!",
  "Split up and flank them!",
  "Where'd they go?!",
  "I think I see one!",
  "GET 'EM!",
  "Blue team best team!",
];

const DEATH_LINES = [
  "Ow... that hurt...",
  "I'll be back!",
  "This isn't over!",
  "Respawning in 3... 2... 1...",
  "Lucky shot!",
  "My lag was terrible!",
  "I wasn't even trying!",
  "Tell my crafting table... I loved her...",
  "x_x",
  "I blame the server tick rate.",
];

const KILL_LINES = [
  "Get rekt!",
  "Too easy!",
  "One down!",
  "Bye bye!",
  "Should've brought better armor!",
  "That's what happens!",
  "ELIMINATED!",
  "Next!",
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
};

function giveKit(bot, kitName) {
  if (kitName === "random") {
    kitName = pick(["stone", "iron", "diamond"]);
    bot.chat(`Ooh I got ${kitName}!`);
  }
  const kit = KITS[kitName];
  if (!kit) return;
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
    setTimeout(() => equipAll(bot), 1500);
  }, 500);
}

async function equipAll(bot) {
  try {
    const slots = ["head", "torso", "legs", "feet"];
    const kw = [["helmet"], ["chestplate"], ["leggings"], ["boots"]];
    for (let i = 0; i < slots.length; i++) {
      const item = bot.inventory
        .items()
        .find((it) => kw[i].some((k) => it.name.includes(k)));
      if (item) await bot.equip(item, slots[i]);
    }
    const sword = bot.inventory.items().find((it) => it.name.includes("sword"));
    if (sword) await bot.equip(sword, "hand");
    const shield = bot.inventory.items().find((it) => it.name === "shield");
    if (shield) await bot.equip(shield, "off-hand");
  } catch {
    /* equip errors are ok */
  }
}

// ── Dumb AI helpers ─────────────────────────────────────────────────────

function maybeDoDumbThing(bot) {
  if (Math.random() < DUMB_CHANCE) {
    pick(DUMB_THINGS)(bot);
    return true;
  }
  return false;
}

function delayedAction(minMs = 500, maxMs = 2000) {
  const delay = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/** Find nearest enemy entity for a bot (opposite team) */
function findNearestEnemy(bot, teamName) {
  const enemies = BOTS_CONFIG.filter((b) => b.team !== teamName).map(
    (b) => b.name,
  );
  let nearest = null;
  let nearestDist = Infinity;

  for (const enemyName of enemies) {
    const player = bot.players[enemyName];
    if (!player?.entity) continue;
    const dist = player.entity.position.distanceTo(bot.entity.position);
    if (dist < nearestDist) {
      nearest = player.entity;
      nearestDist = dist;
    }
  }
  return { entity: nearest, distance: nearestDist };
}

/** Find nearest teammate entity */
function findNearestTeammate(bot, teamName) {
  const mates = BOTS_CONFIG.filter(
    (b) => b.team === teamName && b.name !== bot.username,
  ).map((b) => b.name);
  let nearest = null;
  let nearestDist = Infinity;

  for (const mateName of mates) {
    const player = bot.players[mateName];
    if (!player?.entity) continue;
    const dist = player.entity.position.distanceTo(bot.entity.position);
    if (dist < nearestDist) {
      nearest = player.entity;
      nearestDist = dist;
    }
  }
  return { entity: nearest, distance: nearestDist };
}

// ═══════════════════════════════════════════════════════════════════════
//  RED TEAM AI
// ═══════════════════════════════════════════════════════════════════════

/** Red Leader (FriendlyBot) — tries to beat the game, fights back when attacked */
function setupRedLeader(bot) {
  let aiInterval = null;

  bot._battleAI = {
    start() {
      bot.chat("I'm the leader! Let's beat this game!");

      // Start game progression
      if (bot.friendlyBot?.startProgression) {
        progressing = true;
        bot.friendlyBot.startProgression();
      }

      // Periodic awareness tick
      aiInterval = setInterval(() => this.tick(), 4000 + Math.random() * 3000);
    },

    async tick() {
      if (maybeDoDumbThing(bot)) return;

      // Chat sometimes
      if (Math.random() < 0.15) bot.chat(pick(RED_CHATTER));

      // If enemies are very close, fight back (but a bit slow to react)
      if (hunting) {
        const { entity: enemy, distance } = findNearestEnemy(bot, "red");
        if (enemy && distance < 8) {
          // 70% chance to actually fight back, 30% panic and run
          if (Math.random() < 0.7) {
            bot.chat("They found me! Fighting back!");
            await delayedAction(300, 800);
            try {
              const sword = bot.inventory
                .items()
                .find((it) => it.name.includes("sword"));
              if (sword) await bot.equip(sword, "hand");
              bot.pvp.attack(enemy);
            } catch {}
          } else {
            bot.chat("AHHH! RUN!");
            try {
              const away = bot.entity.position.offset(
                (Math.random() - 0.5) * 20,
                0,
                (Math.random() - 0.5) * 20,
              );
              const goal = new goals.GoalNear(away.x, away.y, away.z, 2);
              bot.pathfinder.setGoal(goal, true);
            } catch {}
          }
        }
      }
    },

    stop() {
      if (aiInterval) clearInterval(aiInterval);
      aiInterval = null;
      bot.pvp.stop();
      bot.pathfinder.stop();
      if (bot.friendlyBot?.stopProgression) bot.friendlyBot.stopProgression();
      progressing = false;
    },
  };
}

/** Red Bodyguard — follows the leader, fights enemies that get close */
function setupRedBodyguard(bot, leaderName) {
  let aiInterval = null;

  bot._battleAI = {
    start() {
      bot.chat(`I'll protect ${leaderName} with my life!`);
      aiInterval = setInterval(() => this.tick(), 3000 + Math.random() * 4000);
    },

    async tick() {
      if (maybeDoDumbThing(bot)) return;

      // Chat sometimes
      if (Math.random() < 0.1) bot.chat(pick(RED_CHATTER));

      const { entity: enemy, distance: enemyDist } = findNearestEnemy(
        bot,
        "red",
      );
      const leader = bot.players[leaderName]?.entity;

      // Priority 1: Fight enemies that are close
      if (enemy && enemyDist < 12) {
        // Dumb delay before reacting
        await delayedAction(200, 1200);

        // Sometimes miss or get confused
        if (Math.random() < 0.15) {
          bot.chat("Wait where'd they go??");
          bot.look(Math.random() * Math.PI * 2, 0);
          return;
        }

        try {
          bot.chat("Enemy spotted! Attacking!");
          const sword = bot.inventory
            .items()
            .find((it) => it.name.includes("sword"));
          if (sword) await bot.equip(sword, "hand");
          bot.pvp.attack(enemy);
        } catch {}
        return;
      }

      // Priority 2: Stay near leader
      if (leader) {
        const leaderDist = leader.position.distanceTo(bot.entity.position);
        if (leaderDist > 12) {
          try {
            // Sometimes wander in wrong direction first
            if (Math.random() < 0.2) {
              bot.chat("Coming, boss! ...I think you're this way?");
              const wrongWay = bot.entity.position.offset(
                (Math.random() - 0.5) * 10,
                0,
                (Math.random() - 0.5) * 10,
              );
              const wrongGoal = new goals.GoalNear(
                wrongWay.x,
                wrongWay.y,
                wrongWay.z,
                2,
              );
              bot.pathfinder.setGoal(wrongGoal, true);
              await new Promise((r) => setTimeout(r, 2000));
            }
            const goal = new goals.GoalFollow(leader, 4);
            bot.pathfinder.setGoal(goal, true);
          } catch {}
        }
      } else {
        // Can't find leader, wander around confused
        if (Math.random() < 0.5) {
          bot.chat(`${leaderName}?? Where are you??`);
        }
        try {
          const wander = bot.entity.position.offset(
            (Math.random() - 0.5) * 16,
            0,
            (Math.random() - 0.5) * 16,
          );
          const goal = new goals.GoalNear(wander.x, wander.y, wander.z, 2);
          bot.pathfinder.setGoal(goal, true);
        } catch {}
      }
    },

    stop() {
      if (aiInterval) clearInterval(aiInterval);
      aiInterval = null;
      bot.pvp.stop();
      bot.pathfinder.stop();
    },
  };
}

/** Red Gatherer — tries to help by gathering resources, but gets distracted */
function setupRedGatherer(bot, leaderName) {
  let aiInterval = null;
  const GATHER_BLOCKS = [
    "oak_log",
    "birch_log",
    "spruce_log",
    "coal_ore",
    "iron_ore",
  ];

  bot._battleAI = {
    start() {
      bot.chat("I'll get us some supplies... if I remember to.");
      aiInterval = setInterval(() => this.tick(), 4000 + Math.random() * 5000);
    },

    async tick() {
      if (maybeDoDumbThing(bot)) return;

      if (Math.random() < 0.1) bot.chat(pick(RED_CHATTER));

      const { entity: enemy, distance: enemyDist } = findNearestEnemy(
        bot,
        "red",
      );

      // Fight if enemy is close
      if (enemy && enemyDist < 10) {
        await delayedAction(400, 1500);

        // 40% chance to panic instead of fight
        if (Math.random() < 0.4) {
          bot.chat("ENEMY! I'M NOT A FIGHTER!");
          try {
            const away = bot.entity.position.offset(
              (Math.random() - 0.5) * 25,
              0,
              (Math.random() - 0.5) * 25,
            );
            const goal = new goals.GoalNear(away.x, away.y, away.z, 2);
            bot.pathfinder.setGoal(goal, true);
          } catch {}
          return;
        }

        try {
          bot.chat("Fine, I'll fight! *swings wildly*");
          const sword = bot.inventory
            .items()
            .find((it) => it.name.includes("sword"));
          if (sword) await bot.equip(sword, "hand");
          bot.pvp.attack(enemy);
        } catch {}
        return;
      }

      // Stay near leader if too far
      const leader = bot.players[leaderName]?.entity;
      if (leader) {
        const leaderDist = leader.position.distanceTo(bot.entity.position);
        if (leaderDist > 25) {
          bot.chat("Wait up guys!");
          try {
            const goal = new goals.GoalFollow(leader, 6);
            bot.pathfinder.setGoal(goal, true);
          } catch {}
          return;
        }
      }

      // Try to mine something nearby (dumbly)
      if (Math.random() < 0.6) {
        try {
          const mcData = (await import("minecraft-data")).default(bot.version);
          const blockName = pick(GATHER_BLOCKS);
          const block = bot.findBlock({
            matching: mcData.blocksByName[blockName]?.id,
            maxDistance: 16,
          });
          if (block) {
            bot.chat(`Ooh, ${blockName}! I'll grab that.`);
            const goal = new goals.GoalNear(
              block.position.x,
              block.position.y,
              block.position.z,
              1,
            );
            await bot.pathfinder.goto(goal);
            await bot.dig(block);
            bot.chat("Got it!");
          } else {
            bot.chat("I don't see anything good nearby...");
          }
        } catch {
          if (Math.random() < 0.5) bot.chat("Ugh, I can't reach it!");
        }
      } else {
        // Wander around
        try {
          const wander = bot.entity.position.offset(
            (Math.random() - 0.5) * 20,
            0,
            (Math.random() - 0.5) * 20,
          );
          const goal = new goals.GoalNear(wander.x, wander.y, wander.z, 2);
          bot.pathfinder.setGoal(goal, true);
        } catch {}
      }
    },

    stop() {
      if (aiInterval) clearInterval(aiInterval);
      aiInterval = null;
      bot.pvp.stop();
      bot.pathfinder.stop();
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  BLUE TEAM AI
// ═══════════════════════════════════════════════════════════════════════

/** Blue Hunter — aggressively chases the nearest Red team member */
function setupBlueHunter(bot) {
  let aiInterval = null;

  bot._battleAI = {
    start() {
      bot.chat("Time to hunt! Red team is going DOWN!");
      aiInterval = setInterval(() => this.tick(), 2500 + Math.random() * 3000);
    },

    async tick() {
      if (!hunting) return;
      if (maybeDoDumbThing(bot)) return;

      if (Math.random() < 0.12) bot.chat(pick(BLUE_CHATTER));

      const { entity: enemy, distance } = findNearestEnemy(bot, "blue");

      if (!enemy) {
        // Can't find anyone, wander around looking
        if (Math.random() < 0.4) bot.chat("Where are they hiding?!");
        try {
          const wander = bot.entity.position.offset(
            (Math.random() - 0.5) * 30,
            0,
            (Math.random() - 0.5) * 30,
          );
          const goal = new goals.GoalNear(wander.x, wander.y, wander.z, 2);
          bot.pathfinder.setGoal(goal, true);
        } catch {}
        return;
      }

      // Dumb reaction time
      await delayedAction(200, 1000);

      if (distance < 5) {
        // Close enough to attack
        // Sometimes swing at air first
        if (Math.random() < 0.2) {
          bot.chat("Take this! *misses*");
          bot.swingArm("hand");
          await new Promise((r) => setTimeout(r, 500));
        }

        try {
          const sword = bot.inventory
            .items()
            .find((it) => it.name.includes("sword"));
          if (sword) await bot.equip(sword, "hand");
          bot.pvp.attack(enemy);
        } catch {}
      } else if (distance < 40) {
        // Chase them
        if (Math.random() < 0.3) bot.chat("I see you! Get over here!");
        try {
          const goal = new goals.GoalFollow(enemy, 2);
          bot.pathfinder.setGoal(goal, true);
        } catch {}
      } else {
        // Too far, wander toward center
        try {
          const wander = bot.entity.position.offset(
            (Math.random() - 0.5) * 20,
            0,
            (Math.random() - 0.5) * 20,
          );
          const goal = new goals.GoalNear(wander.x, wander.y, wander.z, 2);
          bot.pathfinder.setGoal(goal, true);
        } catch {}
      }
    },

    stop() {
      if (aiInterval) clearInterval(aiInterval);
      aiInterval = null;
      bot.pvp.stop();
      bot.pathfinder.stop();
    },
  };
}

/** Blue Flanker — tries to sneak up on Red team from behind */
function setupBlueFlanker(bot) {
  let aiInterval = null;

  bot._battleAI = {
    start() {
      bot.chat("I'll sneak around and get them from behind...");
      aiInterval = setInterval(() => this.tick(), 3500 + Math.random() * 4000);
    },

    async tick() {
      if (!hunting) return;
      if (maybeDoDumbThing(bot)) return;

      if (Math.random() < 0.1) bot.chat(pick(BLUE_CHATTER));

      const { entity: enemy, distance } = findNearestEnemy(bot, "blue");
      const { entity: teammate } = findNearestTeammate(bot, "blue");

      if (!enemy) {
        if (Math.random() < 0.3) bot.chat("*sneaks around looking*");
        try {
          bot.setControlState("sneak", true);
          const wander = bot.entity.position.offset(
            (Math.random() - 0.5) * 25,
            0,
            (Math.random() - 0.5) * 25,
          );
          const goal = new goals.GoalNear(wander.x, wander.y, wander.z, 2);
          bot.pathfinder.setGoal(goal, true);
          setTimeout(() => bot.setControlState("sneak", false), 3000);
        } catch {}
        return;
      }

      // Dumb reaction time
      await delayedAction(300, 1500);

      if (distance < 5) {
        if (Math.random() < 0.3) {
          bot.chat("SURPRISE ATTACK!");
        }
        bot.setControlState("sneak", false);

        // Sometimes fumble the weapon
        if (Math.random() < 0.15) {
          bot.chat("Wait, where's my sword?!");
          await new Promise((r) => setTimeout(r, 1000));
        }

        try {
          const sword = bot.inventory
            .items()
            .find((it) => it.name.includes("sword"));
          if (sword) await bot.equip(sword, "hand");
          bot.pvp.attack(enemy);
        } catch {}
      } else if (distance < 30) {
        // Try to go around the enemy (flank)
        try {
          const offset = teammate
            ? enemy.position.minus(teammate.position).normalize().scaled(5)
            : enemy.position
                .offset(
                  (Math.random() - 0.5) * 10,
                  0,
                  (Math.random() - 0.5) * 10,
                )
                .minus(enemy.position);

          const flankPos = enemy.position.plus(offset);
          const goal = new goals.GoalNear(
            flankPos.x,
            flankPos.y,
            flankPos.z,
            2,
          );
          bot.pathfinder.setGoal(goal, true);

          if (Math.random() < 0.2) {
            bot.setControlState("sneak", true);
            setTimeout(() => bot.setControlState("sneak", false), 4000);
          }
        } catch {
          try {
            const goal = new goals.GoalFollow(enemy, 2);
            bot.pathfinder.setGoal(goal, true);
          } catch {}
        }
      }
    },

    stop() {
      if (aiInterval) clearInterval(aiInterval);
      aiInterval = null;
      bot.pvp.stop();
      bot.pathfinder.stop();
      bot.setControlState("sneak", false);
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  BOT SPAWNING
// ═══════════════════════════════════════════════════════════════════════

function spawnBot(botConfig) {
  const { name, team, role, color } = botConfig;
  const isLeader = role === "leader";

  const opts = {
    username: name,
    host: HOST,
    port: PORT,
    version: VERSION,
  };

  const bot = mineflayer.createBot(opts);

  // Load plugins
  bot.loadPlugin(pathfinder);
  bot.loadPlugin(pvp);
  bot.loadPlugin(armorManager);

  // Leader gets the full FriendlyBot plugin stack
  if (isLeader) {
    bot.loadPlugin(collectBlock);
    bot.loadPlugin(autoEat);
    bot.loadPlugin(toolPlugin);
  }

  bot.once("spawn", () => {
    console.log(
      `${color}[${team.toUpperCase()}] ${name} spawned! (${role})\x1b[0m`,
    );

    // Setup pathfinder
    const defaultMove = new Movements(bot);
    defaultMove.canDig = isLeader; // Only leader can dig (for progression)
    bot.pathfinder.setMovements(defaultMove);

    // If this is the leader, set up full FriendlyBot state
    if (isLeader) {
      bot.friendlyBot = {
        config,
        mode: "idle",
        phase: "start",
        busy: false,
        followTarget: null,
        boundTo: null,
      };
      setupNavigation(bot);
      setupCombat(bot);
      setupProtection(bot);
      setupSurvival(bot);
      setupMining(bot);
      setupCrafting(bot);
      setupInventory(bot);
      setupNether(bot);
      setupEnd(bot);
      setupBuilding(bot);
      setupProgression(bot);
    }

    bots[name] = bot;
    bot.chat(`${name} reporting for duty! Team ${team.toUpperCase()}!`);

    readyCount++;
    if (readyCount >= BOTS_CONFIG.length) {
      initializeBattle();
    }
  });

  // Death handling
  bot.on("death", () => {
    console.log(`${color}[${team.toUpperCase()}] ${name} died!\x1b[0m`);

    if (hunting || progressing) {
      if (team === "red") {
        score.blue++;
      } else {
        score.red++;
      }

      // Announce
      setTimeout(() => {
        bot.chat(pick(DEATH_LINES));
        // Find a living enemy to gloat
        const enemyTeam = team === "red" ? "blue" : "red";
        const gloater = BOTS_CONFIG.find((c) => c.team === enemyTeam);
        if (gloater && bots[gloater.name]) {
          bots[gloater.name].chat(pick(KILL_LINES));
          bots[gloater.name].chat(
            `Score: Red ${score.red} - Blue ${score.blue}`,
          );
        }
      }, 1500);
    }
  });

  // Eat food when low (for all bots)
  bot.on("health", () => {
    if (bot.health < 10) {
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

  // Random hurt reactions
  bot.on("entityHurt", (entity) => {
    if (entity !== bot.entity) return;
    if (Math.random() < 0.3) {
      const reactions = [
        "Ow!",
        "Hey!",
        "That hurt!",
        "Ouch!",
        "Watch it!",
        "Oof!",
        "*screams*",
      ];
      bot.chat(pick(reactions));
    }
    // Dumb dodge
    if (Math.random() < 0.3) {
      const yaw = bot.entity.yaw + (Math.random() > 0.5 ? 1.5 : -1.5);
      bot.look(yaw, 0);
      bot.setControlState(Math.random() > 0.5 ? "left" : "right", true);
      setTimeout(() => bot.clearControlStates(), 300 + Math.random() * 500);
    }
  });

  bot.on("kicked", (reason) =>
    console.log(`${color}[${name}] Kicked: ${reason}\x1b[0m`),
  );
  bot.on("error", (err) =>
    console.error(`${color}[${name}] Error: ${err.message}\x1b[0m`),
  );
  bot.on("end", () => console.log(`${color}[${name}] Disconnected.\x1b[0m`));

  return bot;
}

// ═══════════════════════════════════════════════════════════════════════
//  BATTLE INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════

function initializeBattle() {
  console.log("\n\x1b[32m[Battle] All 5 bots ready!\x1b[0m");
  console.log(
    '\x1b[32m[Battle] Say "fight" to start hunting, "beat" for Red to start progression!\x1b[0m\n',
  );

  const leaderName = BOTS_CONFIG.find((b) => b.role === "leader").name;
  const leader = bots[leaderName];

  // Setup AI for each bot
  setupRedLeader(leader);

  for (const bc of BOTS_CONFIG) {
    const bot = bots[bc.name];
    if (!bot) continue;

    if (bc.role === "bodyguard") {
      setupRedBodyguard(bot, leaderName);
    } else if (bc.role === "gatherer") {
      setupRedGatherer(bot, leaderName);
    } else if (bc.role === "hunter") {
      setupBlueHunter(bot);
    } else if (bc.role === "flanker") {
      setupBlueFlanker(bot);
    }
  }

  // Listen for chat commands on ONE bot
  leader.on("chat", (username, message) => {
    // Ignore any bot's own messages
    if (BOTS_CONFIG.some((b) => b.name === username)) return;

    const msg = message.trim().toLowerCase();

    if (msg === "fight") {
      startHunting();
    } else if (msg === "stop") {
      stopAll();
    } else if (msg === "beat") {
      startProgression();
    } else if (msg === "score") {
      leader.chat(`Score: Red ${score.red} - Blue ${score.blue}`);
    } else if (msg === "reset") {
      resetAll();
    } else if (msg === "quit") {
      leader.chat("GG everyone!");
      setTimeout(() => {
        for (const bot of Object.values(bots)) {
          try {
            bot.quit();
          } catch {}
        }
        process.exit(0);
      }, 1000);
    } else if (msg === "arm red") {
      for (const bc of BOTS_CONFIG.filter((b) => b.team === "red")) {
        if (bots[bc.name]) giveKit(bots[bc.name], "random");
      }
    } else if (msg === "arm blue") {
      for (const bc of BOTS_CONFIG.filter((b) => b.team === "blue")) {
        if (bots[bc.name]) giveKit(bots[bc.name], "random");
      }
    } else if (msg === "arm") {
      for (const bot of Object.values(bots)) giveKit(bot, "random");
    } else if (msg.startsWith("kit ")) {
      const kitName = msg.split(" ")[1];
      if (KITS[kitName]) {
        for (const bot of Object.values(bots)) giveKit(bot, kitName);
        leader.chat(`${kitName} kit for everyone!`);
      } else {
        leader.chat(`Unknown kit. Available: stone, iron, diamond, netherite`);
      }
    }
  });
}

function startHunting() {
  if (hunting) return;
  hunting = true;

  // Start all AIs
  for (const bc of BOTS_CONFIG) {
    bots[bc.name]?._battleAI?.start();
  }

  bots[BOTS_CONFIG[0].name]?.chat("Blue team is coming! Everyone watch out!");
  bots[BOTS_CONFIG[3].name]?.chat("Here we come, Red team!");
}

function startProgression() {
  if (progressing) return;
  const leader = bots[BOTS_CONFIG[0].name];

  // Start the leader's full AI (includes progression)
  leader._battleAI?.start();

  // Start guards too
  for (const bc of BOTS_CONFIG.filter(
    (b) => b.team === "red" && b.role !== "leader",
  )) {
    bots[bc.name]?._battleAI?.start();
  }
}

function stopAll() {
  hunting = false;
  progressing = false;

  for (const bot of Object.values(bots)) {
    bot._battleAI?.stop();
    bot.clearControlStates();
  }

  bots[BOTS_CONFIG[0].name]?.chat("Everyone stand down.");
}

function resetAll() {
  stopAll();
  for (const bot of Object.values(bots)) {
    bot.chat(`/effect give ${bot.username} instant_health 1 10`);
    setTimeout(() => bot.chat(`/effect clear ${bot.username}`), 500);
  }
  bots[BOTS_CONFIG[0].name]?.chat("Everyone healed! Ready for another round.");
}

// ═══════════════════════════════════════════════════════════════════════
//  LAUNCH
// ═══════════════════════════════════════════════════════════════════════

console.log("==========================================================");
console.log("       MINEFLAYER TEAM BATTLE MODE (5 Bots)");
console.log("==========================================================");
console.log("");
console.log("  \x1b[31mRED TEAM (Beat the Game):\x1b[0m");
for (const bc of BOTS_CONFIG.filter((b) => b.team === "red")) {
  console.log(`    ${bc.color}${bc.name}\x1b[0m - ${bc.role}`);
}
console.log("");
console.log("  \x1b[34mBLUE TEAM (Stop Red Team):\x1b[0m");
for (const bc of BOTS_CONFIG.filter((b) => b.team === "blue")) {
  console.log(`    ${bc.color}${bc.name}\x1b[0m - ${bc.role}`);
}
console.log("");
console.log(`  Server: ${HOST}:${PORT} (v${VERSION})`);
console.log("==========================================================");
console.log("  In-game commands:");
console.log('    "fight"    - Blue team starts hunting Red');
console.log('    "beat"     - Red team starts game progression');
console.log('    "stop"     - Everyone stops');
console.log('    "score"    - Show scoreboard');
console.log('    "reset"    - Heal all bots');
console.log('    "arm"      - Random gear for all');
console.log('    "arm red"  - Random gear for Red team');
console.log('    "arm blue" - Random gear for Blue team');
console.log('    "kit iron" - Specific gear kit for all');
console.log('    "quit"     - Disconnect all bots');
console.log("==========================================================");
console.log("");
console.log("  (All bots are a little dumb. Expect chaos.)");
console.log("");

// Stagger bot joins to avoid server overload
let delay = 0;
for (const bc of BOTS_CONFIG) {
  setTimeout(() => spawnBot(bc), delay);
  delay += 2500;
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[Battle] Shutting down...");
  for (const bot of Object.values(bots)) {
    try {
      bot.quit();
    } catch {}
  }
  process.exit(0);
});
