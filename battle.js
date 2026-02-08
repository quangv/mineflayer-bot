/**
 * Battle Mode — 6 bots, Red vs Blue!
 *
 * RED TEAM (beat the game):
 *   - FriendlyBot  (leader — runs full game progression)
 *   - RedGuard1    (bodyguard — protects the leader)
 *   - RedGuard2    (gatherer — mines resources for the team)
 *   - RedScout     (scout — explores ahead, warns about mobs & enemies)
 *
 * BLUE TEAM (hunt Red team):
 *   - BlueHunter1  (hunter — aggressively chases Red team)
 *   - BlueHunter2  (flanker — sneaks around and attacks from behind)
 *
 * All bots are a little dumb, talk to each other (and trash-talk enemies),
 * and auto-rejoin if they get disconnected.
 *
 * Usage:
 *   node battle.js
 *
 * Chat commands (say in-game):
 *   go / beat      — Red team starts progression
 *   fight          — Blue team starts hunting Red
 *   stop           — Everyone stops
 *   status         — Show what everyone is doing
 *   score          — Show kill scoreboard
 *   kit <tier>     — Give all bots gear (stone/iron/diamond/netherite)
 *   arm            — Give everyone random gear
 *   arm red / arm blue — Gear one team
 *   reset          — Heal all bots
 *   quit           — Disconnect all bots (no rejoin)
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

// Import full FriendlyBot modules for the leader
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
  { name: "FriendlyBot", team: "red", role: "leader", color: "\x1b[31m" },
  { name: "RedGuard1", team: "red", role: "bodyguard", color: "\x1b[33m" },
  { name: "RedGuard2", team: "red", role: "gatherer", color: "\x1b[35m" },
  { name: "RedScout", team: "red", role: "scout", color: "\x1b[91m" },
  { name: "BlueHunter1", team: "blue", role: "hunter", color: "\x1b[34m" },
  { name: "BlueHunter2", team: "blue", role: "flanker", color: "\x1b[36m" },
];

const BOT_NAMES = BOTS_CONFIG.map((b) => b.name);
const RED_TEAM = BOTS_CONFIG.filter((b) => b.team === "red");
const BLUE_TEAM = BOTS_CONFIG.filter((b) => b.team === "blue");
const RED_NAMES = RED_TEAM.map((b) => b.name);
const BLUE_NAMES = BLUE_TEAM.map((b) => b.name);

function getTeam(name) {
  return BOTS_CONFIG.find((b) => b.name === name)?.team;
}

// ── State ───────────────────────────────────────────────────────────────

const bots = {};
let redActive = false;
let blueActive = false;
let readyCount = 0;
let intentionalQuit = false; // set true on "quit" to suppress auto-rejoin

// Scoreboard
const kills = {};
for (const bc of BOTS_CONFIG) kills[bc.name] = 0;

// ── Auto-Rejoin ─────────────────────────────────────────────────────────

const REJOIN_DELAY_BASE = 5000; // 5 seconds
const REJOIN_DELAY_MAX = 30000; // 30 seconds max
const rejoinAttempts = {};

function scheduleRejoin(botConfig) {
  if (intentionalQuit) return;
  const { name, color } = botConfig;
  const attempt = (rejoinAttempts[name] || 0) + 1;
  rejoinAttempts[name] = attempt;
  const delay = Math.min(REJOIN_DELAY_BASE * attempt, REJOIN_DELAY_MAX);
  console.log(
    `${color}[REJOIN] ${name} will rejoin in ${Math.round(delay / 1000)}s (attempt #${attempt})\x1b[0m`,
  );
  setTimeout(() => {
    if (intentionalQuit) return;
    console.log(`${color}[REJOIN] ${name} reconnecting...\x1b[0m`);
    // Clean up old bot reference
    delete bots[name];
    readyCount = Object.keys(bots).length;
    spawnBot(botConfig);
  }, delay);
}

// ── Dumb Bot Config ─────────────────────────────────────────────────────

const DUMB_CHANCE = 0.1;

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

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function maybeDoDumbThing(bot) {
  if (Math.random() < DUMB_CHANCE) {
    pick(DUMB_THINGS)(bot);
    return true;
  }
  return false;
}

function delayedAction(minMs = 500, maxMs = 2000) {
  return new Promise((resolve) =>
    setTimeout(resolve, minMs + Math.random() * (maxMs - minMs)),
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  INTER-BOT CONVERSATION SYSTEM
// ═══════════════════════════════════════════════════════════════════════

/** Within-team conversations */
const RED_CONVOS = [
  ["leader", "Does anyone have iron?", "gatherer", "I'll go look for some!"],
  [
    "bodyguard",
    "Hey boss, how's the progression going?",
    "leader",
    "Still working on it!",
  ],
  [
    "scout",
    "Guys there's a cave over here!",
    "leader",
    "Good find! Let's check it out.",
  ],
  [
    "gatherer",
    "I found some coal!",
    "leader",
    "Great job! Bring it over here.",
  ],
  [
    "bodyguard",
    "All clear around us!",
    "scout",
    "I see some skeletons to the north though...",
  ],
  [
    "gatherer",
    "My inventory is getting full...",
    "leader",
    "Drop some stuff for me!",
  ],
  [
    "scout",
    "The view from up here is amazing!",
    "leader",
    "Stop sightseeing and keep scouting!",
  ],
  [
    "leader",
    "Remember the plan everyone!",
    "scout",
    "What plan? I thought we were winging it!",
  ],
  [
    "bodyguard",
    "Stay behind me boss!",
    "leader",
    "I appreciate the protection!",
  ],
  ["scout", "Guys I found a dungeon!", "leader", "Everyone be careful!"],
  [
    "gatherer",
    "I just mined 10 iron ore!",
    "leader",
    "That's exactly what we needed!",
  ],
  ["scout", "It's getting dark...", "leader", "Everyone stay close."],
  [
    "gatherer",
    "Can we please find a bed?",
    "bodyguard",
    "No beds, only vigilance!",
  ],
  [
    "bodyguard",
    "I've been walking for so long my feet hurt",
    "scout",
    "You don't even have real feet!",
  ],
  [
    "leader",
    "We're making great progress!",
    "gatherer",
    "Aww, that's actually sweet.",
  ],
  [
    "scout",
    "I see Blue team nearby! Watch out!",
    "bodyguard",
    "I'm ready for them!",
  ],
  [
    "gatherer",
    "I'm scared of the Blue hunters...",
    "bodyguard",
    "Don't worry, I'll protect you!",
  ],
  [
    "leader",
    "If Blue team shows up, fight together!",
    "scout",
    "Strength in numbers!",
  ],
  [
    "bodyguard",
    "I hear footsteps... Blue team?",
    "scout",
    "Let me check... yeah they're coming!",
  ],
  [
    "leader",
    "We need to keep moving, Blue team is lurking",
    "gatherer",
    "I'm gathering as fast as I can!",
  ],
];

const BLUE_CONVOS = [
  ["hunter", "I see Red team over there!", "flanker", "Let's get 'em!"],
  [
    "flanker",
    "Should we split up?",
    "hunter",
    "Yeah, I'll go head-on, you flank!",
  ],
  ["hunter", "Their bodyguard is tough...", "flanker", "Focus on the leader!"],
  ["flanker", "I'm sneaking up on them!", "hunter", "I'll distract them!"],
  [
    "hunter",
    "Red team is trying to mine... how cute",
    "flanker",
    "Not for long!",
  ],
  [
    "flanker",
    "Which one should we target?",
    "hunter",
    "FriendlyBot. Take out the leader!",
  ],
  [
    "hunter",
    "Their scout spotted me!",
    "flanker",
    "That's fine, they can't stop both of us!",
  ],
  ["flanker", "I just killed one of them!", "hunter", "Nice! Who's next?"],
  ["hunter", "They're running away lol", "flanker", "Not fast enough!"],
  ["flanker", "This is so fun", "hunter", "Best job ever!"],
  [
    "hunter",
    "Red team thinks they can beat the game with us around?",
    "flanker",
    "Hah! Not a chance!",
  ],
  [
    "flanker",
    "I'm gonna go around the back",
    "hunter",
    "Good, I'll charge from the front!",
  ],
];

/** Cross-team trash talk */
const TRASH_TALK = {
  blue_to_red: [
    "Hey Red team! We're coming for you!",
    "You can't hide from us, Red!",
    "Give up Red team! You'll never beat the game!",
    "Knock knock, Red team! It's hunting time!",
    "Run run run, little Red team!",
    "Your 'bodyguard' can't save you!",
    "We're gonna wreck your progression!",
    "Hope you said your goodbyes, Red team!",
    "Red team? More like DEAD team!",
    "Imagine thinking you could beat Minecraft with us around lol",
  ],
  red_to_blue: [
    "You'll never stop us!",
    "We're beating this game no matter what!",
    "Is that the best Blue team can do?",
    "Nice try, Blue! Come back when you're good!",
    "You picked the wrong team to mess with!",
    "Ha! Missed me!",
    "We're faster AND smarter!",
    "Blue team is just making us stronger!",
    "Keep trying, Blue! We're unstoppable!",
    "4 against 2? I like our odds!",
  ],
};

const DEATH_REACTIONS = {
  teammate: [
    "{dead}! NOOOO!",
    "{dead} is down!",
    "We lost {dead}!",
    "Avenge {dead}!",
    "RIP {dead}...",
    "Come back {dead}, we need you!",
    "{dead}!! Not like this!",
  ],
  enemy: [
    "Haha! Got {dead}!",
    "See ya {dead}!",
    "One down!",
    "{dead} is OUT!",
    "That's what you get, {dead}!",
    "Bye bye {dead}!",
    "ELIMINATED: {dead}!",
  ],
};

const RESPAWN_REACTIONS = {
  teammate: [
    "Welcome back {name}!",
    "{name} is alive again!",
    "We missed you {name}!",
    "{name}! Don't scare us like that!",
    "Good to have you back {name}!",
  ],
  enemy: [
    "Oh great, {name} is back...",
    "Not {name} again!",
    "Ugh, {name} respawned.",
    "{name} is back for more punishment!",
    "Round 2, {name}?",
  ],
};

const TEAM_KILL_CHEERS = [
  "Teamwork!",
  "Got 'em!",
  "Nice one!",
  "Another one down!",
  "Nobody messes with us!",
  "That's how it's done!",
  "EZ!",
  "GG!",
];

let lastConvoTime = 0;
const CONVO_COOLDOWN = 25000; // 25 seconds between conversations

function triggerConversation() {
  const now = Date.now();
  if (now - lastConvoTime < CONVO_COOLDOWN) return;

  // Pick a team's conversation
  const useBlue = blueActive && Math.random() < 0.4;
  const convos = useBlue ? BLUE_CONVOS : RED_CONVOS;
  const teamBots = useBlue ? BLUE_TEAM : RED_TEAM;

  const livingTeam = teamBots.filter((bc) => bots[bc.name]?.entity?.isValid);
  if (livingTeam.length < 2) return;

  const convo = pick(convos);
  let speaker = livingTeam.find((bc) => bc.role === convo[0]);
  let replier = livingTeam.find(
    (bc) => bc.role === convo[2] && bc.name !== speaker?.name,
  );
  if (!speaker) speaker = pick(livingTeam);
  if (!replier)
    replier = pick(livingTeam.filter((bc) => bc.name !== speaker.name));
  if (!speaker || !replier) return;

  const speakerBot = bots[speaker.name];
  const replierBot = bots[replier.name];
  if (!speakerBot || !replierBot) return;

  lastConvoTime = now;
  try {
    speakerBot.chat(convo[1]);
  } catch {}

  setTimeout(
    () => {
      try {
        replierBot?.chat(convo[3]);
      } catch {}

      // Cross-team trash talk sometimes
      if (Math.random() < 0.2) {
        const enemyTeam = useBlue ? RED_TEAM : BLUE_TEAM;
        const trashTalker = pick(
          enemyTeam.filter((bc) => bots[bc.name]?.entity?.isValid),
        );
        if (trashTalker && bots[trashTalker.name]) {
          const lines = useBlue
            ? TRASH_TALK.red_to_blue
            : TRASH_TALK.blue_to_red;
          setTimeout(
            () => {
              try {
                bots[trashTalker.name]?.chat(pick(lines));
              } catch {}
            },
            2000 + Math.random() * 3000,
          );
        }
      }
    },
    1500 + Math.random() * 3000,
  );
}

function reactToDeath(deadBotName, killerName) {
  const deadTeam = getTeam(deadBotName);

  // Teammates grieve
  const teammates = BOTS_CONFIG.filter(
    (bc) =>
      bc.team === deadTeam &&
      bc.name !== deadBotName &&
      bots[bc.name]?.entity?.isValid,
  );
  let delay = 800;
  for (const bc of teammates.sort(() => Math.random() - 0.5).slice(0, 1)) {
    const line = pick(DEATH_REACTIONS.teammate).replace("{dead}", deadBotName);
    setTimeout(() => {
      try {
        bots[bc.name]?.chat(line);
      } catch {}
    }, delay);
    delay += 1500 + Math.random() * 1000;
  }

  // Enemies celebrate
  const enemies = BOTS_CONFIG.filter(
    (bc) => bc.team !== deadTeam && bots[bc.name]?.entity?.isValid,
  );
  for (const bc of enemies.sort(() => Math.random() - 0.5).slice(0, 1)) {
    const line = pick(DEATH_REACTIONS.enemy).replace("{dead}", deadBotName);
    setTimeout(() => {
      try {
        bots[bc.name]?.chat(line);
      } catch {}
    }, delay);
    delay += 1000 + Math.random() * 800;
  }

  // Track kill
  if (killerName && kills[killerName] !== undefined) {
    kills[killerName]++;
  }
}

function reactToRespawn(respawnedName) {
  const team = getTeam(respawnedName);
  // Teammate
  const teammate = pick(
    BOTS_CONFIG.filter(
      (bc) => bc.team === team && bc.name !== respawnedName && bots[bc.name],
    ),
  );
  if (teammate && bots[teammate.name]) {
    const line = pick(RESPAWN_REACTIONS.teammate).replace(
      "{name}",
      respawnedName,
    );
    setTimeout(
      () => {
        try {
          bots[teammate.name]?.chat(line);
        } catch {}
      },
      2000 + Math.random() * 3000,
    );
  }
  // Enemy
  if (Math.random() < 0.3) {
    const enemy = pick(
      BOTS_CONFIG.filter((bc) => bc.team !== team && bots[bc.name]),
    );
    if (enemy && bots[enemy.name]) {
      const line = pick(RESPAWN_REACTIONS.enemy).replace(
        "{name}",
        respawnedName,
      );
      setTimeout(
        () => {
          try {
            bots[enemy.name]?.chat(line);
          } catch {}
        },
        3000 + Math.random() * 3000,
      );
    }
  }
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
    for (const extra of kit.extras) bot.chat(`/give ${name} ${extra}`);
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
    /* ok */
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function findNearestHostile(bot, radius = 16) {
  const hostiles = [
    "zombie",
    "skeleton",
    "spider",
    "cave_spider",
    "creeper",
    "enderman",
    "witch",
    "drowned",
    "husk",
    "stray",
    "phantom",
    "pillager",
    "vindicator",
    "blaze",
    "wither_skeleton",
    "ghast",
    "piglin_brute",
    "slime",
    "magma_cube",
  ];
  let nearest = null;
  let nearestDist = Infinity;
  for (const entity of Object.values(bot.entities)) {
    if (!entity || entity === bot.entity) continue;
    if (entity.type !== "mob" || !hostiles.includes(entity.name)) continue;
    const dist = entity.position.distanceTo(bot.entity.position);
    if (dist < radius && dist < nearestDist) {
      nearest = entity;
      nearestDist = dist;
    }
  }
  return { entity: nearest, distance: nearestDist };
}

/** Find nearest enemy team player */
function findNearestEnemy(bot, radius = 32) {
  const myTeam = getTeam(bot.username);
  const enemyNames = myTeam === "red" ? BLUE_NAMES : RED_NAMES;
  let nearest = null;
  let nearestDist = Infinity;
  for (const name of enemyNames) {
    const player = bot.players[name];
    if (!player?.entity) continue;
    const dist = player.entity.position.distanceTo(bot.entity.position);
    if (dist < radius && dist < nearestDist) {
      nearest = player.entity;
      nearestDist = dist;
      nearest._playerName = name;
    }
  }
  return { entity: nearest, distance: nearestDist };
}

/** Find nearest same-team player */
function findNearestTeammate(bot, radius = 64) {
  const myTeam = getTeam(bot.username);
  const teamNames = (myTeam === "red" ? RED_NAMES : BLUE_NAMES).filter(
    (n) => n !== bot.username,
  );
  let nearest = null;
  let nearestDist = Infinity;
  for (const name of teamNames) {
    const player = bot.players[name];
    if (!player?.entity) continue;
    const dist = player.entity.position.distanceTo(bot.entity.position);
    if (dist < radius && dist < nearestDist) {
      nearest = player.entity;
      nearestDist = dist;
    }
  }
  return { entity: nearest, distance: nearestDist };
}

function findLeaderEntity(bot) {
  const leaderName = BOTS_CONFIG.find((b) => b.role === "leader").name;
  return bot.players[leaderName]?.entity;
}

// ═══════════════════════════════════════════════════════════════════════
//  RED TEAM AI (cooperative — beat the game while dodging Blue)
// ═══════════════════════════════════════════════════════════════════════

/** Leader — runs progression, calls out Blue team threats */
function setupLeaderAI(bot) {
  let aiInterval = null;
  let convoInterval = null;

  bot._battleAI = {
    start() {
      bot.chat("Alright Red team, let's beat the game! Watch out for Blue!");
      if (bot.friendlyBot?.startProgression) bot.friendlyBot.startProgression();
      aiInterval = setInterval(() => this.tick(), 8000 + Math.random() * 5000);
      convoInterval = setInterval(
        () => triggerConversation(),
        20000 + Math.random() * 15000,
      );
    },

    async tick() {
      if (maybeDoDumbThing(bot)) return;

      // Check for Blue team enemies
      const { entity: enemy, distance: enemyDist } = findNearestEnemy(bot, 16);
      if (enemy) {
        bot.chat(
          pick([
            "Blue team spotted! Help me!",
            "They found us! Fight back!",
            "BLUE INCOMING! Protect me!",
            "Everyone defend! Blue team is here!",
          ]),
        );
        await delayedAction(200, 800);
        try {
          const sword = bot.inventory
            .items()
            .find((it) => it.name.includes("sword"));
          if (sword) await bot.equip(sword, "hand");
          bot.pvp.attack(enemy);
        } catch {}
        return;
      }

      // Fight hostile mobs if close
      const { entity: hostile } = findNearestHostile(bot, 6);
      if (hostile) {
        bot.chat("Mob near me!");
        await delayedAction(200, 600);
        try {
          const sword = bot.inventory
            .items()
            .find((it) => it.name.includes("sword"));
          if (sword) await bot.equip(sword, "hand");
          bot.pvp.attack(hostile);
        } catch {}
        return;
      }

      // Announce progress
      if (Math.random() < 0.04 && bot.friendlyBot) {
        const phase = bot.friendlyBot.phase || "start";
        bot.chat(
          pick([
            `Phase: ${phase}. Keep it up Red team!`,
            `We're on "${phase}". Blue can't stop us!`,
            `Progress: ${phase}. Stay alert for Blue!`,
          ]),
        );
      }
    },

    stop() {
      if (aiInterval) clearInterval(aiInterval);
      if (convoInterval) clearInterval(convoInterval);
      aiInterval = null;
      convoInterval = null;
      bot.pvp.stop();
      bot.pathfinder.stop();
      if (bot.friendlyBot?.stopProgression) bot.friendlyBot.stopProgression();
    },
  };
}

/** Bodyguard — protects leader from Blue team AND mobs */
function setupBodyguardAI(bot) {
  let aiInterval = null;

  bot._battleAI = {
    start() {
      bot.chat("Nobody touches FriendlyBot! Especially not Blue team!");
      aiInterval = setInterval(() => this.tick(), 6000 + Math.random() * 4000);
    },

    async tick() {
      if (maybeDoDumbThing(bot)) return;

      // Priority 1: Kill Blue team near the leader
      const { entity: enemy, distance: enemyDist } = findNearestEnemy(bot, 20);
      if (enemy) {
        await delayedAction(200, 700);
        if (Math.random() < 0.1) {
          bot.chat("Wait where'd they go??");
          return;
        }
        bot.chat(
          pick([
            `Get away from my boss, ${enemy._playerName || "Blue"}!`,
            `Blue team! You're DEAD!`,
            `PROTECTING THE LEADER!`,
            `I don't think so, Blue!`,
            `CHARGE!!`,
          ]),
        );
        try {
          const sword = bot.inventory
            .items()
            .find((it) => it.name.includes("sword"));
          if (sword) await bot.equip(sword, "hand");
          bot.pvp.attack(enemy);
        } catch {}
        return;
      }

      // Priority 2: Kill hostile mobs
      const { entity: hostile } = findNearestHostile(bot, 14);
      if (hostile) {
        await delayedAction(200, 800);
        bot.chat(
          pick([
            `Mob incoming!`,
            `${hostile.name}! I got it!`,
            `Hostile spotted!`,
          ]),
        );
        try {
          const sword = bot.inventory
            .items()
            .find((it) => it.name.includes("sword"));
          if (sword) await bot.equip(sword, "hand");
          bot.pvp.attack(hostile);
        } catch {}
        return;
      }

      // Priority 3: Follow leader
      const leader = findLeaderEntity(bot);
      if (leader) {
        const dist = leader.position.distanceTo(bot.entity.position);
        if (dist > 10) {
          if (Math.random() < 0.15) {
            bot.chat("Coming boss!");
            const wrong = bot.entity.position.offset(
              (Math.random() - 0.5) * 8,
              0,
              (Math.random() - 0.5) * 8,
            );
            bot.pathfinder.setGoal(
              new goals.GoalNear(wrong.x, wrong.y, wrong.z, 2),
              true,
            );
            await new Promise((r) => setTimeout(r, 1500));
          }
          bot.pathfinder.setGoal(new goals.GoalFollow(leader, 4), true);
        } else if (Math.random() < 0.02) {
          bot.chat(
            pick([
              "*stands guard*",
              "All clear.",
              "*cracks knuckles*",
              "Let them try.",
            ]),
          );
        }
      } else {
        if (Math.random() < 0.3) bot.chat("FriendlyBot?? Where are you??");
        const wander = bot.entity.position.offset(
          (Math.random() - 0.5) * 16,
          0,
          (Math.random() - 0.5) * 16,
        );
        try {
          bot.pathfinder.setGoal(
            new goals.GoalNear(wander.x, wander.y, wander.z, 2),
            true,
          );
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

/** Gatherer — mines resources, runs from Blue team */
function setupGathererAI(bot) {
  let aiInterval = null;
  const GATHER_BLOCKS = [
    "oak_log",
    "birch_log",
    "spruce_log",
    "coal_ore",
    "iron_ore",
    "cobblestone",
  ];

  bot._battleAI = {
    start() {
      bot.chat("Gathering resources! ...and hiding from Blue team!");
      aiInterval = setInterval(() => this.tick(), 8000 + Math.random() * 6000);
    },

    async tick() {
      if (maybeDoDumbThing(bot)) return;

      // Priority 1: RUN from Blue team!
      const { entity: enemy, distance: enemyDist } = findNearestEnemy(bot, 20);
      if (enemy) {
        await delayedAction(300, 1000);
        if (Math.random() < 0.5) {
          bot.chat(
            pick([
              "BLUE TEAM!! HELP ME!!",
              "AHHH THEY FOUND ME!!",
              `${enemy._playerName || "Blue"} IS CHASING ME!!`,
              "RUN RUN RUN!!",
              "I'M JUST A GATHERER LEAVE ME ALONE!!",
              "SOMEBODY SAVE ME!!",
            ]),
          );
          // Run AWAY from enemy
          const dx = bot.entity.position.x - enemy.position.x;
          const dz = bot.entity.position.z - enemy.position.z;
          const away = bot.entity.position.offset(dx * 2, 0, dz * 2);
          try {
            bot.pathfinder.setGoal(
              new goals.GoalNear(away.x, away.y, away.z, 2),
              true,
            );
          } catch {}
        } else {
          // Fight back reluctantly
          bot.chat("Fine I'll fight!! *swings wildly*");
          try {
            const sword = bot.inventory
              .items()
              .find((it) => it.name.includes("sword"));
            if (sword) await bot.equip(sword, "hand");
            bot.pvp.attack(enemy);
          } catch {}
        }
        return;
      }

      // Priority 2: Fight hostile mobs
      const { entity: hostile } = findNearestHostile(bot, 8);
      if (hostile) {
        await delayedAction(400, 1200);
        bot.chat(pick(["AHHH!", "Not a mob too!", "Leave me alone!"]));
        try {
          const sword = bot.inventory
            .items()
            .find((it) => it.name.includes("sword"));
          if (sword) await bot.equip(sword, "hand");
          bot.pvp.attack(hostile);
        } catch {}
        return;
      }

      // Stay near leader
      const leader = findLeaderEntity(bot);
      if (leader) {
        const leaderDist = leader.position.distanceTo(bot.entity.position);
        if (leaderDist > 25) {
          bot.chat("Wait up Red team!");
          try {
            bot.pathfinder.setGoal(new goals.GoalFollow(leader, 6), true);
          } catch {}
          return;
        }
      }

      // Mine stuff
      if (Math.random() < 0.6) {
        try {
          const mcData = (await import("minecraft-data")).default(bot.version);
          const blockName = pick(GATHER_BLOCKS);
          const block = bot.findBlock({
            matching: mcData.blocksByName[blockName]?.id,
            maxDistance: 16,
          });
          if (block) {
            bot.chat(
              pick([
                `Found ${blockName}!`,
                `Grabbing some ${blockName}!`,
                `${blockName}! Dibs!`,
              ]),
            );
            await bot.pathfinder.goto(
              new goals.GoalNear(
                block.position.x,
                block.position.y,
                block.position.z,
                1,
              ),
            );
            await bot.dig(block);
            if (Math.random() < 0.3) bot.chat("Got it!");
          }
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

/** Scout — runs ahead, reports Blue team positions AND mobs */
function setupScoutAI(bot) {
  let aiInterval = null;

  bot._battleAI = {
    start() {
      bot.chat("Scouting ahead! I'll keep an eye out for Blue team!");
      aiInterval = setInterval(() => this.tick(), 7000 + Math.random() * 5000);
    },

    async tick() {
      if (maybeDoDumbThing(bot)) return;

      const leader = findLeaderEntity(bot);

      // Priority 1: Report Blue team
      const { entity: enemy, distance: enemyDist } = findNearestEnemy(bot, 24);
      if (enemy) {
        bot.chat(
          pick([
            `BLUE TEAM ALERT! ${enemy._playerName || "enemy"} is ${Math.round(enemyDist)} blocks away!`,
            `I see ${enemy._playerName || "Blue team"}! Everyone heads up!`,
            `WARNING: Blue team spotted nearby!!`,
            `${enemy._playerName || "Blue"} incoming! Get ready!`,
          ]),
        );
        // Fight if close, retreat if far
        if (enemyDist < 8) {
          await delayedAction(200, 600);
          try {
            const sword = bot.inventory
              .items()
              .find((it) => it.name.includes("sword"));
            if (sword) await bot.equip(sword, "hand");
            bot.pvp.attack(enemy);
          } catch {}
        } else if (leader) {
          // Run back to group to warn them
          try {
            bot.pathfinder.setGoal(new goals.GoalFollow(leader, 5), true);
          } catch {}
        }
        return;
      }

      // Report hostile mobs
      const { entity: hostile, distance: hostDist } = findNearestHostile(
        bot,
        20,
      );
      if (hostile && hostDist < 20) {
        bot.chat(
          pick([
            `${hostile.name} spotted ${Math.round(hostDist)} blocks out!`,
            `Heads up! ${hostile.name} nearby!`,
          ]),
        );
        if (hostDist < 6) {
          try {
            const sword = bot.inventory
              .items()
              .find((it) => it.name.includes("sword"));
            if (sword) await bot.equip(sword, "hand");
            bot.pvp.attack(hostile);
          } catch {}
          return;
        }
      }

      // Stay ahead of leader
      if (leader) {
        const dist = leader.position.distanceTo(bot.entity.position);
        if (dist > 30) {
          bot.chat("Coming back to the group!");
          try {
            bot.pathfinder.setGoal(new goals.GoalFollow(leader, 8), true);
          } catch {}
        } else if (dist < 8) {
          const ahead = leader.position.offset(
            (Math.random() - 0.5) * 20 + 10,
            0,
            (Math.random() - 0.5) * 20 + 10,
          );
          if (Math.random() < 0.3) bot.chat("Scouting ahead!");
          try {
            bot.pathfinder.setGoal(
              new goals.GoalNear(ahead.x, ahead.y, ahead.z, 2),
              true,
            );
          } catch {}
        }
        if (Math.random() < 0.06) {
          bot.chat(
            pick([
              "I see a village in the distance!",
              "Found a cave entrance!",
              "Clear ahead!",
              "There's a mountain this way!",
              "Coast is clear... for now.",
              "No sign of Blue team!",
            ]),
          );
        }
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
//  BLUE TEAM AI (hunt Red team!)
// ═══════════════════════════════════════════════════════════════════════

/** Hunter — aggressively chases and attacks Red team */
function setupHunterAI(bot) {
  let aiInterval = null;

  bot._battleAI = {
    start() {
      bot.chat("Time to hunt some Red bots! Let's GO!");
      aiInterval = setInterval(() => this.tick(), 5000 + Math.random() * 4000);
    },

    async tick() {
      if (maybeDoDumbThing(bot)) return;

      // Priority 1: Hunt Red team
      const { entity: enemy, distance: enemyDist } = findNearestEnemy(bot, 32);
      if (enemy) {
        await delayedAction(100, 500);

        // Miss sometimes
        if (Math.random() < 0.12) {
          bot.chat(`Take this, ${enemy._playerName || "Red"}! *misses*`);
          bot.swingArm("hand");
          await new Promise((r) => setTimeout(r, 400));
        }

        bot.chat(
          pick([
            `${enemy._playerName || "Red"}, you're MINE!`,
            `Come here ${enemy._playerName || "Red"}!`,
            `Found you, ${enemy._playerName || "Red"}!`,
            `HYAAAA! *charges*`,
            `You can't run forever!`,
            `Target acquired: ${enemy._playerName || "Red"}!`,
            `Goodbye, ${enemy._playerName || "Red"}!`,
          ]),
        );

        try {
          const sword = bot.inventory
            .items()
            .find((it) => it.name.includes("sword"));
          if (sword) await bot.equip(sword, "hand");
          bot.pvp.attack(enemy);
        } catch {}

        // Taunt after pursuing
        if (Math.random() < 0.2) {
          setTimeout(
            () => bot.chat(pick(TRASH_TALK.blue_to_red)),
            2000 + Math.random() * 2000,
          );
        }
        return;
      }

      // Priority 2: Look for Red team — go to their last known area
      const leader = findLeaderEntity(bot);
      if (leader) {
        if (Math.random() < 0.3)
          bot.chat(
            pick([
              "I see the leader!",
              "Found Red team's base!",
              "There they are!",
            ]),
          );
        try {
          bot.pathfinder.setGoal(new goals.GoalFollow(leader, 3), true);
        } catch {}
        return;
      }

      // Priority 3: Kill hostile mobs while searching
      const { entity: hostile } = findNearestHostile(bot, 10);
      if (hostile) {
        bot.chat(
          pick([
            "Get out of my way, mob!",
            `Stupid ${hostile.name}!`,
            "I don't have time for mobs!",
          ]),
        );
        try {
          const sword = bot.inventory
            .items()
            .find((it) => it.name.includes("sword"));
          if (sword) await bot.equip(sword, "hand");
          bot.pvp.attack(hostile);
        } catch {}
        return;
      }

      // Wander + search
      if (Math.random() < 0.1)
        bot.chat(
          pick([
            "Where are they hiding?",
            "Come out come out...",
            "Red team can't hide forever!",
            "Searching...",
            "I'll find you, Red team!",
            "They gotta be around here somewhere...",
          ]),
        );

      // Stay near partner
      const { entity: partner } = findNearestTeammate(bot, 40);
      if (partner) {
        const partnerDist = partner.position.distanceTo(bot.entity.position);
        if (partnerDist > 25) {
          try {
            bot.pathfinder.setGoal(new goals.GoalFollow(partner, 8), true);
          } catch {}
          return;
        }
      }

      const wander = bot.entity.position.offset(
        (Math.random() - 0.5) * 30,
        0,
        (Math.random() - 0.5) * 30,
      );
      try {
        bot.pathfinder.setGoal(
          new goals.GoalNear(wander.x, wander.y, wander.z, 2),
          true,
        );
      } catch {}
    },

    stop() {
      if (aiInterval) clearInterval(aiInterval);
      aiInterval = null;
      bot.pvp.stop();
      bot.pathfinder.stop();
    },
  };
}

/** Flanker — sneaks around and attacks Red team from behind */
function setupFlankerAI(bot) {
  let aiInterval = null;

  bot._battleAI = {
    start() {
      bot.chat("I'll flank them! They won't see me coming...");
      aiInterval = setInterval(() => this.tick(), 6000 + Math.random() * 5000);
    },

    async tick() {
      if (maybeDoDumbThing(bot)) return;

      const { entity: enemy, distance: enemyDist } = findNearestEnemy(bot, 28);

      if (enemy) {
        // Sneak up close
        if (enemyDist > 8) {
          if (Math.random() < 0.3) {
            bot.setControlState("sneak", true);
            bot.chat(
              pick([
                "*sneaking up...*",
                "shh...",
                "*flanking*",
                "They don't see me...",
              ]),
            );
          }
          // Circle around them
          const angle = Math.atan2(
            enemy.position.z - bot.entity.position.z,
            enemy.position.x - bot.entity.position.x,
          );
          const flankAngle = angle + (Math.random() > 0.5 ? 1.5 : -1.5);
          const flankPos = enemy.position.offset(
            Math.cos(flankAngle) * 5,
            0,
            Math.sin(flankAngle) * 5,
          );
          try {
            bot.pathfinder.setGoal(
              new goals.GoalNear(flankPos.x, flankPos.y, flankPos.z, 2),
              true,
            );
          } catch {}
          return;
        }

        // Attack!
        bot.clearControlStates();
        await delayedAction(100, 400);

        bot.chat(
          pick([
            `SURPRISE ${enemy._playerName || "Red"}!`,
            `Behind you!`,
            `Didn't see THAT coming, did ya?`,
            `FLANKED!`,
            `*stabs from behind*`,
            `Sneak attack!`,
            `BOO! *swings sword*`,
          ]),
        );

        try {
          const sword = bot.inventory
            .items()
            .find((it) => it.name.includes("sword"));
          if (sword) await bot.equip(sword, "hand");
          bot.pvp.attack(enemy);
        } catch {}

        if (Math.random() < 0.25) {
          setTimeout(() => bot.chat(pick(TRASH_TALK.blue_to_red)), 2000);
        }
        return;
      }

      // No enemies visible — search for them
      const leader = findLeaderEntity(bot);
      if (leader) {
        // Approach from an angle
        const angle = Math.random() * Math.PI * 2;
        const offset = leader.position.offset(
          Math.cos(angle) * 15,
          0,
          Math.sin(angle) * 15,
        );
        if (Math.random() < 0.15)
          bot.chat(
            pick(["Flanking...", "Going around...", "I'll get behind them..."]),
          );
        try {
          bot.pathfinder.setGoal(
            new goals.GoalNear(offset.x, offset.y, offset.z, 2),
            true,
          );
        } catch {}
        return;
      }

      // Kill mobs while searching
      const { entity: hostile } = findNearestHostile(bot, 8);
      if (hostile) {
        bot.chat(pick(["Ugh, a mob.", `${hostile.name}? Out of my way!`]));
        try {
          const sword = bot.inventory
            .items()
            .find((it) => it.name.includes("sword"));
          if (sword) await bot.equip(sword, "hand");
          bot.pvp.attack(hostile);
        } catch {}
        return;
      }

      // Stay near partner
      const { entity: partner } = findNearestTeammate(bot, 40);
      if (partner) {
        const dist = partner.position.distanceTo(bot.entity.position);
        if (dist > 20) {
          try {
            bot.pathfinder.setGoal(new goals.GoalFollow(partner, 8), true);
          } catch {}
          return;
        }
      }

      if (Math.random() < 0.06)
        bot.chat(
          pick([
            "Where'd Red team go?",
            "*lurking*",
            "They can't hide forever...",
          ]),
        );
      const wander = bot.entity.position.offset(
        (Math.random() - 0.5) * 25,
        0,
        (Math.random() - 0.5) * 25,
      );
      try {
        bot.pathfinder.setGoal(
          new goals.GoalNear(wander.x, wander.y, wander.z, 2),
          true,
        );
      } catch {}
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
//  BOT SPAWNING (with auto-rejoin)
// ═══════════════════════════════════════════════════════════════════════

function spawnBot(botConfig) {
  const { name, role, team, color } = botConfig;
  const isLeader = role === "leader";

  const bot = mineflayer.createBot({
    username: name,
    host: HOST,
    port: PORT,
    version: VERSION,
  });

  bot.loadPlugin(pathfinder);
  bot.loadPlugin(pvp);
  bot.loadPlugin(armorManager);

  if (isLeader) {
    bot.loadPlugin(collectBlock);
    bot.loadPlugin(autoEat);
    bot.loadPlugin(toolPlugin);
  }

  let hasSpawnedOnce = false;

  bot.once("spawn", () => {
    console.log(
      `${color}[SPAWN] ${name} joined! (${team} team, ${role})\x1b[0m`,
    );
    hasSpawnedOnce = true;

    // Reset rejoin counter on successful connect
    rejoinAttempts[name] = 0;

    const defaultMove = new Movements(bot);
    defaultMove.canDig = isLeader || role === "gatherer";
    bot.pathfinder.setMovements(defaultMove);

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

    const teamTag = team === "red" ? "[RED]" : "[BLUE]";
    bot.chat(
      pick([
        `${name} (${teamTag}) here! Ready to go!`,
        `${name} reporting for ${team} team!`,
        `${teamTag} ${name} has arrived!`,
      ]),
    );

    // Set up AI immediately
    switch (role) {
      case "leader":
        setupLeaderAI(bot);
        break;
      case "bodyguard":
        setupBodyguardAI(bot);
        break;
      case "gatherer":
        setupGathererAI(bot);
        break;
      case "scout":
        setupScoutAI(bot);
        break;
      case "hunter":
        setupHunterAI(bot);
        break;
      case "flanker":
        setupFlankerAI(bot);
        break;
    }

    // Auto-start if battle is already active when rejoining
    if ((team === "red" && redActive) || (team === "blue" && blueActive)) {
      setTimeout(() => {
        bot.chat("I'm back! Jumping right in!");
        bot._battleAI?.start();
      }, 2000);
    }

    readyCount = Object.keys(bots).length;
    if (readyCount >= BOTS_CONFIG.length && !redActive && !blueActive) {
      setTimeout(() => initializeBattle(), 1500);
    }
  });

  // Track who killed whom
  bot.on("death", () => {
    console.log(`${color}[DEATH] ${name} died!\x1b[0m`);
    bot.chat(
      pick([
        "Ow...",
        "I'll be back!",
        "Not like this...",
        "Respawning!",
        "x_x",
        "I blame lag!",
        "That was unfair!",
        "Nooooo!",
        "gg",
      ]),
    );

    // Try to figure out who killed us
    let killer = null;
    const enemyNames = team === "red" ? BLUE_NAMES : RED_NAMES;
    for (const eName of enemyNames) {
      const eBot = bots[eName];
      if (
        eBot?.entity &&
        eBot.entity.position.distanceTo(bot.entity.position) < 8
      ) {
        killer = eName;
        break;
      }
    }
    reactToDeath(name, killer);
  });

  bot.on("spawn", () => {
    if (hasSpawnedOnce && bots[name]) {
      reactToRespawn(name);
    }
  });

  // Eat when low HP
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
      if (food)
        bot
          .equip(food, "hand")
          .then(() => bot.consume())
          .catch(() => {});
    }
  });

  // Hurt reactions — react differently based on attacker team
  bot.on("entityHurt", (entity) => {
    if (entity !== bot.entity) return;
    if (Math.random() < 0.3) {
      bot.chat(
        pick(["Ow!", "Hey!", "Ouch!", "I'm hit!", "Help!", "*screams*"]),
      );
    }
    // Dumb dodge
    if (Math.random() < 0.2) {
      bot.look(bot.entity.yaw + (Math.random() > 0.5 ? 1.5 : -1.5), 0);
      bot.setControlState(Math.random() > 0.5 ? "left" : "right", true);
      setTimeout(() => bot.clearControlStates(), 300 + Math.random() * 400);
    }
  });

  bot.on("kicked", (reason) =>
    console.log(`${color}[${name}] Kicked: ${reason}\x1b[0m`),
  );
  bot.on("error", (err) =>
    console.error(`${color}[${name}] Error: ${err.message}\x1b[0m`),
  );

  // AUTO-REJOIN on disconnect!
  bot.on("end", () => {
    console.log(`${color}[${name}] Disconnected.\x1b[0m`);
    // Stop AI cleanly
    bot._battleAI?.stop();
    // Schedule rejoin
    scheduleRejoin(botConfig);
  });

  return bot;
}

// ═══════════════════════════════════════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════

function initializeBattle() {
  console.log("\n\x1b[32m[Battle] All 6 bots ready! Red vs Blue!\x1b[0m");
  console.log('\x1b[31m[Battle] Red team: "beat" to start progression\x1b[0m');
  console.log('\x1b[34m[Battle] Blue team: "fight" to start hunting\x1b[0m\n');

  const leaderName = BOTS_CONFIG.find((b) => b.role === "leader").name;
  const leader = bots[leaderName];
  if (!leader) return;

  // Team introductions
  setTimeout(() => {
    leader.chat("Red team! Roll call!");
    let d = 1200;
    for (const bc of RED_TEAM.filter((b) => b.role !== "leader")) {
      setTimeout(
        () =>
          bots[bc.name]?.chat(
            pick([
              `${bc.name} here! ${bc.role} ready!`,
              `${bc.name} reporting! Let's beat this game!`,
              `${bc.name} standing by!`,
            ]),
          ),
        d,
      );
      d += 1000 + Math.random() * 600;
    }

    setTimeout(() => {
      const blueLeader = bots[BLUE_TEAM[0]?.name];
      blueLeader?.chat("Blue team ready! We're coming for you, Red!");
      setTimeout(
        () =>
          bots[BLUE_TEAM[1]?.name]?.chat("Can't wait to wreck some Red bots!"),
        1000,
      );
    }, d + 500);

    setTimeout(
      () =>
        leader.chat(
          'Say "beat" to start Red team, "fight" to start Blue team!',
        ),
      d + 3000,
    );
  }, 2000);

  // Chat command listener — attach to ALL bots so commands work even if leader is dead
  for (const bc of BOTS_CONFIG) {
    const bot = bots[bc.name];
    if (!bot) continue;
    // Only set up the listener once (on leader primarily)
    if (bc.role !== "leader") continue;

    bot.on("chat", (username, message) => {
      if (BOT_NAMES.includes(username)) return;
      const msg = message.trim().toLowerCase();

      if (msg === "beat" || msg === "go") {
        startRed();
      } else if (msg === "fight") {
        startBlue();
      } else if (msg === "stop") {
        stopAll();
      } else if (msg === "status") {
        showStatus();
      } else if (msg === "score") {
        showScore();
      } else if (msg === "reset") {
        resetAll();
      } else if (msg === "quit") {
        intentionalQuit = true;
        leader.chat("GG everyone! Match over!");
        let d = 500;
        for (const b of BOTS_CONFIG.filter((x) => x.role !== "leader")) {
          setTimeout(
            () =>
              bots[b.name]?.chat(
                pick(["GG!", "Was fun!", "Later!", "Bye!", "Peace!"]),
              ),
            d,
          );
          d += 300;
        }
        setTimeout(() => {
          for (const bot of Object.values(bots)) {
            try {
              bot.quit();
            } catch {}
          }
          process.exit(0);
        }, d + 500);
      } else if (msg === "arm") {
        for (const bot of Object.values(bots)) giveKit(bot, "random");
      } else if (msg === "arm red") {
        for (const n of RED_NAMES) {
          if (bots[n]) giveKit(bots[n], "random");
        }
        leader.chat("Red team armed!");
      } else if (msg === "arm blue") {
        for (const n of BLUE_NAMES) {
          if (bots[n]) giveKit(bots[n], "random");
        }
        leader.chat("Blue team armed!");
      } else if (msg.startsWith("kit ")) {
        const kitName = msg.split(" ")[1];
        if (KITS[kitName]) {
          for (const bot of Object.values(bots)) giveKit(bot, kitName);
          leader.chat(`${kitName} kit for everyone!`);
        } else {
          leader.chat("Kits: stone, iron, diamond, netherite");
        }
      }
    });
  }
}

function startRed() {
  if (redActive) return;
  redActive = true;

  const leader = bots[BOTS_CONFIG[0].name];
  leader?.chat("RED TEAM GO! Let's beat Minecraft!");

  let d = 600;
  for (const bc of RED_TEAM.filter((b) => b.role !== "leader")) {
    setTimeout(
      () =>
        bots[bc.name]?.chat(
          pick(["YEAH!", "Let's go!", "For Red team!", "Woo!"]),
        ),
      d,
    );
    d += 300 + Math.random() * 400;
  }

  setTimeout(() => {
    for (const bc of RED_TEAM) {
      bots[bc.name]?._battleAI?.start();
    }
  }, d);

  // Blue team reacts
  setTimeout(() => {
    for (const bc of BLUE_TEAM) {
      bots[bc.name]?.chat(
        pick([
          "Good luck, you'll need it!",
          "We'll be waiting...",
          "Start running, Red!",
        ]),
      );
    }
  }, d + 1000);
}

function startBlue() {
  if (blueActive) return;
  blueActive = true;

  for (const bc of BLUE_TEAM) {
    const b = bots[bc.name];
    if (!b) continue;
    b.chat(
      pick([
        "HUNT TIME!",
        "Let's get 'em!",
        "Blue team, ATTACK!",
        "Here we come, Red!",
      ]),
    );
    b._battleAI?.start();
  }

  // Red team reacts
  setTimeout(() => {
    for (const bc of RED_TEAM) {
      bots[bc.name]?.chat(
        pick([
          "Oh no...",
          "They're coming!",
          "Stay together Red team!",
          "Here they come!",
        ]),
      );
    }
  }, 1500);
}

function stopAll() {
  redActive = false;
  blueActive = false;
  for (const bot of Object.values(bots)) {
    bot._battleAI?.stop();
    bot.clearControlStates();
  }
  bots[BOTS_CONFIG[0].name]?.chat("Everyone stand down!");
  setTimeout(() => {
    const bc = pick(BOTS_CONFIG);
    bots[bc.name]?.chat(
      pick(["Finally a break!", "Ceasefire!", "Timeout!", "Phew!"]),
    );
  }, 1000);
}

function showStatus() {
  const leader = bots[BOTS_CONFIG[0].name];
  if (!leader) return;

  const phase = leader.friendlyBot?.phase || "idle";
  leader.chat(
    `=== BATTLE STATUS === Red: ${redActive ? "ACTIVE" : "idle"} | Blue: ${blueActive ? "HUNTING" : "idle"} | Phase: ${phase}`,
  );

  for (const bc of BOTS_CONFIG) {
    const bot = bots[bc.name];
    if (!bot?.entity) {
      leader.chat(
        `  [${bc.team.toUpperCase()}] ${bc.name} (${bc.role}): OFFLINE`,
      );
      continue;
    }
    const hp = Math.round(bot.health || 0);
    const k = kills[bc.name] || 0;
    leader.chat(
      `  [${bc.team.toUpperCase()}] ${bc.name} (${bc.role}): HP ${hp}/20 | Kills: ${k}`,
    );
  }
}

function showScore() {
  const leader = bots[BOTS_CONFIG[0].name];
  if (!leader) return;

  leader.chat("=== SCOREBOARD ===");

  const redKills = RED_NAMES.reduce((sum, n) => sum + (kills[n] || 0), 0);
  const blueKills = BLUE_NAMES.reduce((sum, n) => sum + (kills[n] || 0), 0);
  leader.chat(`  RED TEAM: ${redKills} kills | BLUE TEAM: ${blueKills} kills`);

  const sorted = [...BOTS_CONFIG].sort(
    (a, b) => (kills[b.name] || 0) - (kills[a.name] || 0),
  );
  for (const bc of sorted) {
    const k = kills[bc.name] || 0;
    if (k > 0) leader.chat(`    ${bc.name}: ${k} kills`);
  }

  if (blueKills > redKills) leader.chat("  Blue team is winning!");
  else if (redKills > blueKills) leader.chat("  Red team is winning!");
  else leader.chat("  It's a tie!");
}

function resetAll() {
  stopAll();
  for (const bot of Object.values(bots)) {
    bot.chat(`/effect give ${bot.username} instant_health 1 10`);
    setTimeout(() => bot.chat(`/effect clear ${bot.username}`), 500);
  }
  setTimeout(
    () =>
      bots[BOTS_CONFIG[0].name]?.chat("Everyone healed! Ready for round 2!"),
    800,
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  LAUNCH
// ═══════════════════════════════════════════════════════════════════════

console.log("==========================================================");
console.log("      MINEFLAYER BATTLE MODE (6 Bots — Red vs Blue!)");
console.log("==========================================================");
console.log("");
console.log("  \x1b[31mRED TEAM (beat the game):\x1b[0m");
for (const bc of RED_TEAM) {
  console.log(`    ${bc.color}${bc.name}\x1b[0m - ${bc.role}`);
}
console.log("  \x1b[34mBLUE TEAM (hunt Red team):\x1b[0m");
for (const bc of BLUE_TEAM) {
  console.log(`    ${bc.color}${bc.name}\x1b[0m - ${bc.role}`);
}
console.log("");
console.log(`  Server: ${HOST}:${PORT} (v${VERSION})`);
console.log("  Auto-rejoin: ON (bots reconnect if disconnected)");
console.log("==========================================================");
console.log("  In-game commands:");
console.log('    "beat" / "go"  - Red team starts progression');
console.log('    "fight"        - Blue team starts hunting');
console.log('    "stop"         - Everyone stops');
console.log('    "status"       - Show battle status');
console.log('    "score"        - Show kill scoreboard');
console.log('    "reset"        - Heal all bots');
console.log('    "arm"          - Random gear for all');
console.log('    "arm red/blue" - Gear one team');
console.log('    "kit iron"     - Specific gear for all');
console.log('    "quit"         - Disconnect all (no rejoin)');
console.log("==========================================================");
console.log("");

// Stagger joins — wider delays to avoid overwhelming the server
let delay = 0;
for (const bc of BOTS_CONFIG) {
  setTimeout(() => spawnBot(bc), delay);
  delay += 5000;
}

// Prevent uncaught errors from killing the process
process.on("uncaughtException", (err) => {
  console.error("\x1b[31m[UNCAUGHT]", err.message, "\x1b[0m");
});
process.on("unhandledRejection", (err) => {
  console.error("\x1b[31m[UNHANDLED]", err?.message || err, "\x1b[0m");
});

process.on("SIGINT", () => {
  console.log("\n[Battle] Shutting down...");
  intentionalQuit = true;
  for (const bot of Object.values(bots)) {
    try {
      bot.quit();
    } catch {}
  }
  process.exit(0);
});
