/**
 * Co-op Mode — 6 bots working TOGETHER to beat Minecraft!
 *
 * THE SQUAD:
 *   - FriendlyBot  (leader — runs full game progression)
 *   - RedGuard1    (bodyguard — protects the leader)
 *   - RedGuard2    (gatherer — mines resources for the team)
 *   - RedScout     (scout — explores ahead, warns about mobs)
 *   - BlueHelper1  (fighter — kills hostile mobs around the group)
 *   - BlueHelper2  (builder — follows leader, helps with tasks)
 *
 * All bots are a little dumb and talk to each other constantly.
 *
 * Usage:
 *   node battle.js
 *
 * Chat commands (say in-game):
 *   go / beat      — Start progression (beat the game!)
 *   stop           — Everyone stops
 *   regroup        — Everyone comes to you
 *   status         — Show what everyone is doing
 *   kit <tier>     — Give all bots gear (stone/iron/diamond/netherite)
 *   arm            — Give everyone random gear
 *   reset          — Heal all bots
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
  { name: "FriendlyBot", role: "leader", color: "\x1b[31m", emoji: "[LEADER]" },
  { name: "RedGuard1", role: "bodyguard", color: "\x1b[33m", emoji: "[GUARD]" },
  { name: "RedGuard2", role: "gatherer", color: "\x1b[35m", emoji: "[GATHER]" },
  { name: "RedScout", role: "scout", color: "\x1b[32m", emoji: "[SCOUT]" },
  { name: "BlueHelper1", role: "fighter", color: "\x1b[34m", emoji: "[FIGHT]" },
  { name: "BlueHelper2", role: "builder", color: "\x1b[36m", emoji: "[BUILD]" },
];

const BOT_NAMES = BOTS_CONFIG.map((b) => b.name);

// ── State ───────────────────────────────────────────────────────────────

const bots = {};
let active = false;
let readyCount = 0;

// ── Dumb Bot Config ─────────────────────────────────────────────────────

const DUMB_CHANCE = 0.2;

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

/** Conversations bots have with each other. Format: [speaker_role, line, reply_role, reply] */
const CONVERSATIONS = [
  // General banter
  [
    "bodyguard",
    "Hey {leader}, how's the progression going?",
    "leader",
    "Still working on it! We need more resources.",
  ],
  ["leader", "Does anyone have iron?", "gatherer", "I'll go look for some!"],
  [
    "fighter",
    "I just killed a zombie!",
    "scout",
    "Nice! I saw more over that way.",
  ],
  [
    "gatherer",
    "I found some coal!",
    "leader",
    "Great job! Bring it over here.",
  ],
  [
    "scout",
    "Guys there's a cave over here!",
    "fighter",
    "Ooh let's check it out!",
  ],
  [
    "builder",
    "Should I build something?",
    "leader",
    "Not yet, stay close for now.",
  ],
  [
    "bodyguard",
    "All clear around us!",
    "scout",
    "I see some skeletons to the north though...",
  ],
  [
    "fighter",
    "Who wants to help me fight that creeper?",
    "bodyguard",
    "I got your back!",
  ],
  [
    "gatherer",
    "My inventory is getting full...",
    "builder",
    "Give me some stuff, I'll carry it!",
  ],
  [
    "scout",
    "The view from up here is amazing!",
    "leader",
    "Stop sightseeing and keep scouting!",
  ],
  [
    "builder",
    "I wish I could build a house right now",
    "bodyguard",
    "We don't have time for that!",
  ],
  [
    "fighter",
    "Why am I always the one fighting?!",
    "leader",
    "Because you're good at it!",
  ],
  [
    "gatherer",
    "Anyone want some wood?",
    "builder",
    "Yes please! Throw it here!",
  ],
  ["scout", "I think I'm lost...", "bodyguard", "Just follow my nametag!"],
  [
    "builder",
    "This is actually kinda fun!",
    "fighter",
    "Until a creeper shows up...",
  ],

  // Directed at each other
  [
    "bodyguard",
    "{leader}, you're walking too fast!",
    "leader",
    "Sorry! I'm excited about progress!",
  ],
  [
    "scout",
    "{fighter}, there's a spider behind you!",
    "fighter",
    "WHERE?! Oh... I see it. HYAAA!",
  ],
  [
    "gatherer",
    "{builder}, catch! *throws logs*",
    "builder",
    "Got 'em! Thanks!",
  ],
  ["fighter", "{bodyguard}, wanna spar later?", "bodyguard", "You'd lose!"],
  [
    "leader",
    "Good work everyone! We're making progress!",
    "fighter",
    "This team is unstoppable!",
  ],
  [
    "builder",
    "{scout}, what do you see out there?",
    "scout",
    "Trees, mountains, and... is that a village?!",
  ],
  [
    "bodyguard",
    "Stay behind me {leader}!",
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
  ["fighter", "Nothing can stop us!", "gatherer", "Famous last words..."],

  // Silly conversations
  [
    "scout",
    "Do you think the Ender Dragon is scared of us?",
    "fighter",
    "It SHOULD be!",
  ],
  [
    "builder",
    "What do you guys want for dinner?",
    "gatherer",
    "Steak! If I can find a cow...",
  ],
  [
    "bodyguard",
    "I've been walking for so long my feet hurt",
    "scout",
    "You don't even have real feet!",
  ],
  [
    "fighter",
    "One time I punched a tree and it didn't break",
    "builder",
    "That's... that's not how this works.",
  ],
  [
    "leader",
    "Remember the plan everyone!",
    "scout",
    "What plan? I thought we were winging it!",
  ],
  [
    "gatherer",
    "I accidentally mined into lava...",
    "fighter",
    "Are you okay?!",
    "gatherer",
    "NO!",
  ],
  [
    "builder",
    "Can we take a break?",
    "leader",
    "The Ender Dragon waits for no one!",
  ],
  [
    "scout",
    "Hey {bodyguard}, race you to that mountain!",
    "bodyguard",
    "I can't leave my post!",
  ],
  [
    "fighter",
    "I'm bored, someone pick a fight with me",
    "builder",
    "No thanks, I choose life.",
  ],
  [
    "leader",
    "We're in this together, team!",
    "gatherer",
    "Aww, that's actually sweet.",
  ],

  // Panic / combat
  [
    "scout",
    "CREEPER! EVERYONE RUN!",
    "fighter",
    "RUN?! I'M RUNNING TOWARD IT!",
  ],
  [
    "bodyguard",
    "HOSTILE MOB! Protect {leader}!",
    "fighter",
    "On it! Cover me!",
  ],
  ["gatherer", "I don't have a weapon!!", "bodyguard", "Get behind us!"],
  ["leader", "Watch out for that skeleton!", "scout", "I see it! On the left!"],
  ["fighter", "There's too many of them!", "bodyguard", "Just keep swinging!"],

  // Night time
  ["scout", "It's getting dark...", "leader", "Everyone stay close."],
  ["builder", "I hear zombies...", "fighter", "Good. I was getting bored."],
  [
    "gatherer",
    "Can we please find a bed?",
    "bodyguard",
    "No beds, only vigilance!",
  ],
  [
    "leader",
    "Night time. Stay alert everyone.",
    "scout",
    "I can barely see anything!",
  ],
  [
    "fighter",
    "Nighttime is fighting time!",
    "builder",
    "Nighttime is HIDING time!",
  ],
];

/** Messages bots say to each other when someone dies */
const DEATH_REACTIONS = [
  [
    "{dead}! NOOOO!",
    "{dead} is down! Someone help!",
    "We lost {dead}!",
    "Avenge {dead}!",
  ],
  [
    "RIP {dead}...",
    "{dead} will be remembered.",
    "Pour one out for {dead}.",
    "They got {dead}!",
  ],
  [
    "Don't worry {dead}, we'll keep going!",
    "Come back {dead}, we need you!",
    "{dead}!! Not like this!",
  ],
];

/** Messages when someone respawns */
const RESPAWN_REACTIONS = [
  "Welcome back {name}!",
  "{name} is alive again!",
  "We missed you {name}!",
  "{name}! You're back! Don't scare us like that!",
  "The team is whole again!",
  "{name} has returned from the dead!",
  "Good to have you back {name}!",
];

/** Messages bots say when they kill a mob together */
const TEAM_KILL_REACTIONS = [
  "Teamwork!",
  "Got 'em!",
  "Nice one!",
  "High five!",
  "Another one down!",
  "Nobody messes with us!",
  "Too easy when we work together!",
  "That's how it's done!",
];

let lastConvoTime = 0;
const CONVO_COOLDOWN = 12000; // 12 seconds between conversations

/** Start a random conversation between two bots */
function triggerConversation() {
  const now = Date.now();
  if (now - lastConvoTime < CONVO_COOLDOWN) return;

  const livingBots = BOTS_CONFIG.filter((bc) => bots[bc.name]?.entity?.isValid);
  if (livingBots.length < 2) return;

  const convo = pick(CONVERSATIONS);
  const speakerRole = convo[0];
  const speakerLine = convo[1];
  const replyRole = convo[2];
  const replyLine = convo[3];

  // Find bots with matching roles, or pick random if no match
  let speaker = livingBots.find((bc) => bc.role === speakerRole);
  let replier = livingBots.find(
    (bc) => bc.role === replyRole && bc.name !== speaker?.name,
  );

  if (!speaker) speaker = pick(livingBots);
  if (!replier)
    replier = pick(livingBots.filter((bc) => bc.name !== speaker.name));
  if (!speaker || !replier) return;

  const speakerBot = bots[speaker.name];
  const replierBot = bots[replier.name];
  if (!speakerBot || !replierBot) return;

  const leaderName =
    BOTS_CONFIG.find((b) => b.role === "leader")?.name || "FriendlyBot";

  // Replace placeholders
  const processLine = (line) =>
    line
      .replace("{leader}", leaderName)
      .replace("{fighter}", "BlueHelper1")
      .replace("{bodyguard}", "RedGuard1")
      .replace("{scout}", "RedScout")
      .replace("{gatherer}", "RedGuard2")
      .replace("{builder}", "BlueHelper2");

  lastConvoTime = now;

  // Speaker says their line
  speakerBot.chat(processLine(speakerLine));

  // Replier responds after a short delay
  setTimeout(
    () => {
      replierBot.chat(processLine(replyLine));

      // Sometimes a third bot chimes in
      if (convo.length > 4 && Math.random() < 0.5) {
        const thirdRole = convo[4];
        const thirdLine = convo[5];
        const third = livingBots.find(
          (bc) =>
            bc.role === thirdRole &&
            bc.name !== speaker.name &&
            bc.name !== replier.name,
        );
        if (third && bots[third.name]) {
          setTimeout(
            () => bots[third.name].chat(processLine(thirdLine)),
            1500 + Math.random() * 1500,
          );
        }
      }

      // Random third-party reaction
      if (Math.random() < 0.25) {
        const bystander = livingBots.find(
          (bc) => bc.name !== speaker.name && bc.name !== replier.name,
        );
        if (bystander && bots[bystander.name]) {
          const reactions = [
            "lol",
            "haha",
            "true",
            "same",
            "^",
            "mood",
            "facts",
            "that's what I was thinking!",
            "relatable",
            "wait what?",
            "lmaooo",
            "I heard that!",
            "are you guys serious rn",
            "focus everyone!",
          ];
          setTimeout(
            () => bots[bystander.name].chat(pick(reactions)),
            2000 + Math.random() * 2000,
          );
        }
      }
    },
    1000 + Math.random() * 2000,
  );
}

/** React to a bot dying */
function reactToDeath(deadBotName) {
  const reactions = pick(DEATH_REACTIONS);
  const living = BOTS_CONFIG.filter(
    (bc) => bc.name !== deadBotName && bots[bc.name]?.entity?.isValid,
  );

  // 2-3 bots react
  const reactors = living
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(3, living.length));
  let delay = 500;
  for (const bc of reactors) {
    const bot = bots[bc.name];
    if (!bot) continue;
    const line = pick(reactions).replace("{dead}", deadBotName);
    setTimeout(() => bot.chat(line), delay);
    delay += 800 + Math.random() * 1200;
  }
}

/** React to a bot respawning */
function reactToRespawn(respawnedName) {
  const living = BOTS_CONFIG.filter(
    (bc) => bc.name !== respawnedName && bots[bc.name],
  );
  const reactor = pick(living);
  if (reactor && bots[reactor.name]) {
    const line = pick(RESPAWN_REACTIONS).replace("{name}", respawnedName);
    setTimeout(
      () => bots[reactor.name].chat(line),
      1500 + Math.random() * 2000,
    );
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

/** Find nearest hostile mob */
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

/** Find the leader bot entity */
function findLeaderEntity(bot) {
  const leaderName = BOTS_CONFIG.find((b) => b.role === "leader").name;
  return bot.players[leaderName]?.entity;
}

/** Find the nearest bot teammate */
function findNearestTeammate(bot) {
  const mates = BOT_NAMES.filter((n) => n !== bot.username);
  let nearest = null;
  let nearestDist = Infinity;
  for (const name of mates) {
    const player = bot.players[name];
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
//  BOT AI ROLES (All cooperative now!)
// ═══════════════════════════════════════════════════════════════════════

/** Leader — runs game progression, directs the team */
function setupLeaderAI(bot) {
  let aiInterval = null;
  let convoInterval = null;

  bot._coopAI = {
    start() {
      bot.chat("Alright team, let's beat Minecraft TOGETHER!");

      // Start progression
      if (bot.friendlyBot?.startProgression) {
        bot.friendlyBot.startProgression();
      }

      // Periodic tick
      aiInterval = setInterval(() => this.tick(), 5000 + Math.random() * 3000);

      // Conversation trigger
      convoInterval = setInterval(
        () => triggerConversation(),
        8000 + Math.random() * 6000,
      );
    },

    async tick() {
      if (maybeDoDumbThing(bot)) return;

      // Announce progress sometimes
      if (Math.random() < 0.1 && bot.friendlyBot) {
        const phase = bot.friendlyBot.phase || "start";
        const lines = [
          `Current phase: ${phase}. Keep it up team!`,
          `We're on the "${phase}" phase. Almost there!`,
          `Progress update: ${phase}. Everyone doing great!`,
          `Stay focused! We're in the ${phase} phase.`,
        ];
        bot.chat(pick(lines));
      }

      // Fight back if hostile is very close
      const { entity: hostile, distance } = findNearestHostile(bot, 6);
      if (hostile) {
        bot.chat("Mob near me! Help!");
        await delayedAction(200, 600);
        try {
          const sword = bot.inventory
            .items()
            .find((it) => it.name.includes("sword"));
          if (sword) await bot.equip(sword, "hand");
          bot.pvp.attack(hostile);
        } catch {}
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

/** Bodyguard — stays near leader, fights anything that threatens them */
function setupBodyguardAI(bot) {
  let aiInterval = null;

  bot._coopAI = {
    start() {
      bot.chat("I'm on guard duty! Nobody touches the boss!");
      aiInterval = setInterval(() => this.tick(), 3000 + Math.random() * 3000);
    },

    async tick() {
      if (maybeDoDumbThing(bot)) return;

      // Priority 1: Kill hostile mobs near the leader or self
      const { entity: hostile, distance: hostDist } = findNearestHostile(
        bot,
        14,
      );
      if (hostile) {
        await delayedAction(200, 800);

        if (Math.random() < 0.12) {
          bot.chat("Wait where'd it go??");
          bot.look(Math.random() * Math.PI * 2, 0);
          return;
        }

        const warnings = [
          `Mob incoming! I got it!`,
          `Watch out! ${hostile.name}!`,
          `Hostile spotted! Engaging!`,
          `Die, ${hostile.name}!`,
          `${hostile.name}! I'll handle it!`,
        ];
        bot.chat(pick(warnings));
        try {
          const sword = bot.inventory
            .items()
            .find((it) => it.name.includes("sword"));
          if (sword) await bot.equip(sword, "hand");
          bot.pvp.attack(hostile);
        } catch {}
        return;
      }

      // Priority 2: Stay near leader
      const leader = findLeaderEntity(bot);
      if (leader) {
        const dist = leader.position.distanceTo(bot.entity.position);
        if (dist > 10) {
          if (Math.random() < 0.2) {
            bot.chat("Coming boss! ...I think you're this way?");
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
        } else if (Math.random() < 0.05) {
          const idles = [
            "*stands guard*",
            "*looks around alertly*",
            "All clear for now.",
            "I got my eye on everything.",
            "*cracks knuckles*",
          ];
          bot.chat(pick(idles));
        }
      } else {
        if (Math.random() < 0.4) bot.chat("FriendlyBot?? Where'd you go??");
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

/** Gatherer — mines nearby resources, brings them to leader */
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

  bot._coopAI = {
    start() {
      bot.chat("Resource gathering mode: ON! ...mostly.");
      aiInterval = setInterval(() => this.tick(), 4000 + Math.random() * 5000);
    },

    async tick() {
      if (maybeDoDumbThing(bot)) return;

      // Fight hostiles if they're close (reluctantly)
      const { entity: hostile, distance: hostDist } = findNearestHostile(
        bot,
        8,
      );
      if (hostile) {
        await delayedAction(400, 1500);
        if (Math.random() < 0.35) {
          bot.chat("AHHH! Someone help!! A " + hostile.name + "!");
          const away = bot.entity.position.offset(
            (Math.random() - 0.5) * 20,
            0,
            (Math.random() - 0.5) * 20,
          );
          try {
            bot.pathfinder.setGoal(
              new goals.GoalNear(away.x, away.y, away.z, 2),
              true,
            );
          } catch {}
          return;
        }
        bot.chat("Fine I'll fight! *swings wildly*");
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
          bot.chat("Wait up everyone! I'm falling behind!");
          try {
            bot.pathfinder.setGoal(new goals.GoalFollow(leader, 6), true);
          } catch {}
          return;
        }
      }

      // Mine stuff
      if (Math.random() < 0.65) {
        try {
          const mcData = (await import("minecraft-data")).default(bot.version);
          const blockName = pick(GATHER_BLOCKS);
          const block = bot.findBlock({
            matching: mcData.blocksByName[blockName]?.id,
            maxDistance: 16,
          });
          if (block) {
            const announcements = [
              `Ooh, ${blockName}! Dibs!`,
              `Found some ${blockName}!`,
              `I see ${blockName}, grabbing it!`,
              `${blockName}! That'll be useful!`,
            ];
            bot.chat(pick(announcements));
            await bot.pathfinder.goto(
              new goals.GoalNear(
                block.position.x,
                block.position.y,
                block.position.z,
                1,
              ),
            );
            await bot.dig(block);
            if (Math.random() < 0.3) bot.chat("Got it! You're welcome, team!");
          } else {
            if (Math.random() < 0.3) bot.chat("Nothing good to mine nearby...");
          }
        } catch {
          if (Math.random() < 0.4) bot.chat("Ugh, I can't reach that block!");
        }
      } else {
        // Wander near group
        const wander = bot.entity.position.offset(
          (Math.random() - 0.5) * 12,
          0,
          (Math.random() - 0.5) * 12,
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

/** Scout — runs ahead of the group, reports back about mobs and points of interest */
function setupScoutAI(bot) {
  let aiInterval = null;

  bot._coopAI = {
    start() {
      bot.chat("I'll scout ahead! *runs off excitedly*");
      aiInterval = setInterval(() => this.tick(), 3500 + Math.random() * 4000);
    },

    async tick() {
      if (maybeDoDumbThing(bot)) return;

      const leader = findLeaderEntity(bot);
      const { entity: hostile, distance: hostDist } = findNearestHostile(
        bot,
        20,
      );

      // Report hostiles
      if (hostile && hostDist < 20) {
        const warnings = [
          `Heads up! ${hostile.name} spotted ${Math.round(hostDist)} blocks away!`,
          `I see a ${hostile.name}! Everyone be careful!`,
          `Warning: ${hostile.name} nearby!`,
          `GUYS! There's a ${hostile.name} over here!`,
          `${hostile.name} alert!! About ${Math.round(hostDist)} blocks out!`,
        ];
        bot.chat(pick(warnings));

        // Fight if very close
        if (hostDist < 6) {
          await delayedAction(200, 800);
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

      // Stay somewhat ahead of the leader but not too far
      if (leader) {
        const dist = leader.position.distanceTo(bot.entity.position);
        if (dist > 30) {
          bot.chat("Oops, I went too far! Coming back!");
          try {
            bot.pathfinder.setGoal(new goals.GoalFollow(leader, 8), true);
          } catch {}
        } else if (dist < 8) {
          // Run ahead!
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

        // Report interesting things
        if (Math.random() < 0.08) {
          const reports = [
            "I see a village in the distance!",
            "There's a ravine over here!",
            "Found a cave entrance!",
            "I see water ahead!",
            "There's a mountain this way!",
            "Looks clear ahead!",
            "The terrain opens up over here!",
            "I see animals nearby!",
            "There's a lava pool — watch out!",
            "Looks like a flat area for building!",
          ];
          bot.chat(pick(reports));
        }
      } else {
        if (Math.random() < 0.4) bot.chat("I... I think I'm lost. Help?");
        const wander = bot.entity.position.offset(
          (Math.random() - 0.5) * 15,
          0,
          (Math.random() - 0.5) * 15,
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

/** Fighter — actively hunts hostile mobs around the group */
function setupFighterAI(bot) {
  let aiInterval = null;

  bot._coopAI = {
    start() {
      bot.chat("Any mobs around here? I'm ready to fight!");
      aiInterval = setInterval(() => this.tick(), 2500 + Math.random() * 3000);
    },

    async tick() {
      if (maybeDoDumbThing(bot)) return;

      // Priority 1: Hunt hostiles (LOVES fighting)
      const { entity: hostile, distance: hostDist } = findNearestHostile(
        bot,
        18,
      );
      if (hostile) {
        await delayedAction(100, 600);

        // Sometimes swing at air
        if (Math.random() < 0.15) {
          bot.chat(`Take this, ${hostile.name}! *misses*`);
          bot.swingArm("hand");
          await new Promise((r) => setTimeout(r, 400));
        }

        const battleCries = [
          `${hostile.name}! You're MINE!`,
          `Come here ${hostile.name}!`,
          `HYAAAA! *charges at ${hostile.name}*`,
          `Eat sword, ${hostile.name}!`,
          `I've been waiting for this!`,
          `Finally some action!`,
          `${hostile.name}? More like DEAD ${hostile.name}!`,
        ];
        bot.chat(pick(battleCries));

        try {
          const sword = bot.inventory
            .items()
            .find((it) => it.name.includes("sword"));
          if (sword) await bot.equip(sword, "hand");
          bot.pvp.attack(hostile);
        } catch {}

        // Other bots cheer sometimes
        if (Math.random() < 0.3) {
          const others = BOTS_CONFIG.filter((bc) => bc.name !== bot.username);
          const cheerBot = bots[pick(others).name];
          if (cheerBot) {
            setTimeout(
              () => cheerBot.chat(pick(TEAM_KILL_REACTIONS)),
              1500 + Math.random() * 2000,
            );
          }
        }
        return;
      }

      // Priority 2: Stay with the group
      const leader = findLeaderEntity(bot);
      if (leader) {
        const dist = leader.position.distanceTo(bot.entity.position);
        if (dist > 16) {
          if (Math.random() < 0.3) bot.chat("No mobs? Fine, I'll regroup...");
          try {
            bot.pathfinder.setGoal(new goals.GoalFollow(leader, 5), true);
          } catch {}
        } else {
          // Patrol around the group
          if (Math.random() < 0.5) {
            const patrol = leader.position.offset(
              (Math.random() - 0.5) * 14,
              0,
              (Math.random() - 0.5) * 14,
            );
            try {
              bot.pathfinder.setGoal(
                new goals.GoalNear(patrol.x, patrol.y, patrol.z, 2),
                true,
              );
            } catch {}
          }
          if (Math.random() < 0.06) {
            const bored = [
              "Any mobs? Anyone? No?",
              "*practices sword swings*",
              "Come on, something attack us!",
              "I'm getting bored over here!",
              "*looks for trouble*",
              "This is way too quiet...",
            ];
            bot.chat(pick(bored));
          }
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

/** Builder — follows leader closely, does odd jobs, helps with anything */
function setupBuilderAI(bot) {
  let aiInterval = null;

  bot._coopAI = {
    start() {
      bot.chat("I'm here to help with anything! Just say the word!");
      aiInterval = setInterval(() => this.tick(), 4000 + Math.random() * 4000);
    },

    async tick() {
      if (maybeDoDumbThing(bot)) return;

      // Fight if necessary (reluctantly)
      const { entity: hostile, distance: hostDist } = findNearestHostile(
        bot,
        8,
      );
      if (hostile) {
        await delayedAction(300, 1200);
        if (Math.random() < 0.25) {
          bot.chat("Why is it always ME who finds the mobs?!");
        } else {
          bot.chat(`I'll try... ${hostile.name} here goes nothing!`);
        }
        try {
          const sword = bot.inventory
            .items()
            .find((it) => it.name.includes("sword"));
          if (sword) await bot.equip(sword, "hand");
          bot.pvp.attack(hostile);
        } catch {}
        return;
      }

      // Stay close to leader
      const leader = findLeaderEntity(bot);
      if (leader) {
        const dist = leader.position.distanceTo(bot.entity.position);
        if (dist > 12) {
          if (Math.random() < 0.2) bot.chat("Wait for me!");
          try {
            bot.pathfinder.setGoal(new goals.GoalFollow(leader, 4), true);
          } catch {}
        } else {
          // Comment on things
          if (Math.random() < 0.06) {
            const comments = [
              "This would be a great spot for a house!",
              "I could build something cool here.",
              "*picks up random block*",
              "Anyone need anything built?",
              "Following the leader, following the leader~",
              "What a nice day for an adventure!",
              "I wonder what the Ender Dragon looks like up close...",
              "Are we there yet?",
              "My feet hurt but I'm having fun!",
            ];
            bot.chat(pick(comments));
          }

          // Sometimes pick up nearby items or mine stuff
          if (Math.random() < 0.2) {
            try {
              const mcData = (await import("minecraft-data")).default(
                bot.version,
              );
              const block = bot.findBlock({
                matching: [
                  mcData.blocksByName["oak_log"]?.id,
                  mcData.blocksByName["birch_log"]?.id,
                  mcData.blocksByName["spruce_log"]?.id,
                ].filter(Boolean),
                maxDistance: 8,
              });
              if (block) {
                bot.chat("I'll grab this log real quick!");
                await bot.pathfinder.goto(
                  new goals.GoalNear(
                    block.position.x,
                    block.position.y,
                    block.position.z,
                    1,
                  ),
                );
                await bot.dig(block);
              }
            } catch {}
          }
        }
      } else {
        if (Math.random() < 0.3) bot.chat("Guys? Where is everyone?");
        const wander = bot.entity.position.offset(
          (Math.random() - 0.5) * 12,
          0,
          (Math.random() - 0.5) * 12,
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

// ═══════════════════════════════════════════════════════════════════════
//  BOT SPAWNING
// ═══════════════════════════════════════════════════════════════════════

function spawnBot(botConfig) {
  const { name, role, color } = botConfig;
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

  bot.once("spawn", () => {
    console.log(`${color}[SPAWN] ${name} joined! (${role})\x1b[0m`);

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

    const greetings = [
      `${name} here! Ready to go!`,
      `${name} reporting for duty!`,
      `${name} has arrived! Let's do this!`,
      `Yo it's ${name}! What's up everyone!`,
      `${name} checking in! What's the plan?`,
    ];
    bot.chat(pick(greetings));

    readyCount++;
    if (readyCount >= BOTS_CONFIG.length) {
      setTimeout(() => initializeCoOp(), 1500);
    }
  });

  // Death handling — teammates react
  bot.on("death", () => {
    console.log(`${color}[DEATH] ${name} died!\x1b[0m`);
    bot.chat(
      pick([
        "Ow... that hurt...",
        "I'll be back!",
        "Not like this...",
        "Tell the team... I tried...",
        "Respawning!",
        "x_x",
        "I blame lag!",
        "That was totally unfair!",
        "Nooooo!",
      ]),
    );
    reactToDeath(name);
  });

  // Respawn — teammates welcome back
  bot.on("spawn", () => {
    if (bots[name]) {
      // Only on RE-spawn
      reactToRespawn(name);
    }
  });

  // Eat when low hp
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

  // Hurt reactions + team awareness
  bot.on("entityHurt", (entity) => {
    if (entity !== bot.entity) return;
    if (Math.random() < 0.35) {
      bot.chat(
        pick([
          "Ow!",
          "Hey!",
          "Ouch!",
          "I'm hit!",
          "Help!",
          "Oof!",
          "*screams*",
          "That stings!",
        ]),
      );
    }
    // Dumb dodge
    if (Math.random() < 0.25) {
      bot.look(bot.entity.yaw + (Math.random() > 0.5 ? 1.5 : -1.5), 0);
      bot.setControlState(Math.random() > 0.5 ? "left" : "right", true);
      setTimeout(() => bot.clearControlStates(), 300 + Math.random() * 400);
    }
    // Nearby teammate reacts
    if (Math.random() < 0.3) {
      const nearby = BOTS_CONFIG.find((bc) => {
        if (bc.name === name) return false;
        const b = bots[bc.name];
        return b?.entity?.position?.distanceTo(bot.entity.position) < 15;
      });
      if (nearby && bots[nearby.name]) {
        setTimeout(
          () => {
            bots[nearby.name].chat(
              pick([
                `Hang on ${name}!`,
                `I'll help you ${name}!`,
                `${name}! Are you okay?!`,
                `They hit ${name}!`,
              ]),
            );
          },
          500 + Math.random() * 1000,
        );
      }
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
//  INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════

function initializeCoOp() {
  console.log(
    "\n\x1b[32m[Co-op] All 6 bots ready! The squad is assembled!\x1b[0m",
  );
  console.log(
    '\x1b[32m[Co-op] Say "go" or "beat" in-game to start the adventure!\x1b[0m\n',
  );

  const leaderName = BOTS_CONFIG.find((b) => b.role === "leader").name;
  const leader = bots[leaderName];

  // Set up AI for each role
  for (const bc of BOTS_CONFIG) {
    const bot = bots[bc.name];
    if (!bot) continue;

    switch (bc.role) {
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
      case "fighter":
        setupFighterAI(bot);
        break;
      case "builder":
        setupBuilderAI(bot);
        break;
    }
  }

  // Team introduction conversation
  setTimeout(() => {
    leader.chat("Alright everyone, roll call! Sound off!");
    let d = 1500;
    for (const bc of BOTS_CONFIG.filter((b) => b.role !== "leader")) {
      const b = bots[bc.name];
      if (!b) continue;
      const intros = {
        bodyguard: `${bc.name} here! I'll keep you safe, boss!`,
        gatherer: `${bc.name} reporting! I'll get us resources!`,
        scout: `${bc.name} ready! I'll run ahead and scout!`,
        fighter: `${bc.name} locked and loaded! Point me at something to fight!`,
        builder: `${bc.name} here! I'll help with whatever you need!`,
      };
      setTimeout(() => b.chat(intros[bc.role] || `${bc.name} here!`), d);
      d += 1200 + Math.random() * 800;
    }
    setTimeout(
      () =>
        leader.chat('Perfect! Now let\'s beat Minecraft! Say "go" to start!'),
      d + 500,
    );
  }, 2000);

  // Chat command listener
  leader.on("chat", (username, message) => {
    if (BOT_NAMES.includes(username)) return;
    const msg = message.trim().toLowerCase();

    if (msg === "go" || msg === "beat") {
      startAdventure();
    } else if (msg === "stop") {
      stopAll();
    } else if (msg === "regroup") {
      regroupAll(username);
    } else if (msg === "status") {
      showStatus();
    } else if (msg === "reset") {
      resetAll();
    } else if (msg === "quit") {
      leader.chat("GG squad! Until next time!");
      const others = BOTS_CONFIG.filter((b) => b.role !== "leader");
      let d = 500;
      for (const bc of others) {
        setTimeout(
          () =>
            bots[bc.name]?.chat(
              pick([
                "GG!",
                "Was fun!",
                "Later everyone!",
                "Bye!",
                "See ya!",
                "Peace out!",
              ]),
            ),
          d,
        );
        d += 400;
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
    } else if (msg.startsWith("kit ")) {
      const kitName = msg.split(" ")[1];
      if (KITS[kitName]) {
        for (const bot of Object.values(bots)) giveKit(bot, kitName);
        leader.chat(`${kitName} kit for the whole squad!`);
      } else {
        leader.chat("Available kits: stone, iron, diamond, netherite");
      }
    }
  });
}

function startAdventure() {
  if (active) return;
  active = true;

  // Dramatic startup
  const leader = bots[BOTS_CONFIG[0].name];
  leader?.chat("LET'S GOOO! Adventure time!");

  let d = 800;
  for (const bc of BOTS_CONFIG.filter((b) => b.role !== "leader")) {
    const b = bots[bc.name];
    if (!b) continue;
    const cheers = [
      "YEAH!",
      "Let's go!",
      "Woo!",
      "Finally!",
      "HYPED!",
      "Adventure!!",
    ];
    setTimeout(() => b.chat(pick(cheers)), d);
    d += 400 + Math.random() * 400;
  }

  // Start all AIs
  setTimeout(() => {
    for (const bc of BOTS_CONFIG) {
      bots[bc.name]?._coopAI?.start();
    }
  }, d);
}

function stopAll() {
  active = false;
  for (const bot of Object.values(bots)) {
    bot._coopAI?.stop();
    bot.clearControlStates();
  }
  bots[BOTS_CONFIG[0].name]?.chat("Everyone stop! Taking a break.");
  setTimeout(() => {
    const bc = pick(BOTS_CONFIG.filter((b) => b.role !== "leader"));
    bots[bc.name]?.chat(
      pick([
        "Finally a break!",
        "My legs needed rest.",
        "Break time!",
        "Thank goodness.",
      ]),
    );
  }, 1000);
}

function regroupAll(playerName) {
  const leader = bots[BOTS_CONFIG[0].name];
  leader?.chat("Everyone regroup!");

  for (const bc of BOTS_CONFIG) {
    const bot = bots[bc.name];
    if (!bot) continue;
    const player = bot.players[playerName]?.entity;
    if (player) {
      try {
        bot.pathfinder.setGoal(new goals.GoalFollow(player, 3), true);
      } catch {}
    }
  }

  setTimeout(() => {
    const bc = pick(BOTS_CONFIG.filter((b) => b.role !== "leader"));
    bots[bc.name]?.chat("Coming!");
  }, 500);
  setTimeout(() => {
    const bc = pick(BOTS_CONFIG.filter((b) => b.role !== "leader"));
    bots[bc.name]?.chat("On my way!");
  }, 1200);
}

function showStatus() {
  const leader = bots[BOTS_CONFIG[0].name];
  if (!leader) return;

  const phase = leader.friendlyBot?.phase || "idle";
  leader.chat(`=== SQUAD STATUS === Phase: ${phase}`);

  for (const bc of BOTS_CONFIG) {
    const bot = bots[bc.name];
    if (!bot?.entity) {
      leader.chat(`  ${bc.name} (${bc.role}): OFFLINE`);
      continue;
    }
    const hp = Math.round(bot.health || 0);
    const food = Math.round(bot.food || 0);
    leader.chat(`  ${bc.name} (${bc.role}): HP ${hp}/20 Food ${food}/20`);
  }
}

function resetAll() {
  stopAll();
  for (const bot of Object.values(bots)) {
    bot.chat(`/effect give ${bot.username} instant_health 1 10`);
    setTimeout(() => bot.chat(`/effect clear ${bot.username}`), 500);
  }
  setTimeout(
    () =>
      bots[BOTS_CONFIG[0].name]?.chat("Everyone healed! Ready to go again!"),
    800,
  );
  setTimeout(() => {
    const bc = pick(BOTS_CONFIG.filter((b) => b.role !== "leader"));
    bots[bc.name]?.chat("I feel so much better!");
  }, 2000);
}

// ═══════════════════════════════════════════════════════════════════════
//  LAUNCH
// ═══════════════════════════════════════════════════════════════════════

console.log("==========================================================");
console.log("      MINEFLAYER CO-OP MODE (6 Bots, 1 Team!)");
console.log("==========================================================");
console.log("");
console.log("  THE SQUAD:");
for (const bc of BOTS_CONFIG) {
  console.log(`    ${bc.color}${bc.name}\x1b[0m - ${bc.role}`);
}
console.log("");
console.log(`  Server: ${HOST}:${PORT} (v${VERSION})`);
console.log("==========================================================");
console.log("  In-game commands:");
console.log('    "go" / "beat" - Start the adventure!');
console.log('    "stop"        - Everyone stops');
console.log('    "regroup"     - Everyone comes to you');
console.log('    "status"      - Show squad status');
console.log('    "reset"       - Heal all bots');
console.log('    "arm"         - Random gear for all');
console.log('    "kit iron"    - Specific gear for all');
console.log('    "quit"        - Disconnect all bots');
console.log("==========================================================");
console.log("");
console.log("  (All bots are a little dumb and talk A LOT. Enjoy!)");
console.log("");

// Stagger joins
let delay = 0;
for (const bc of BOTS_CONFIG) {
  setTimeout(() => spawnBot(bc), delay);
  delay += 2500;
}

process.on("SIGINT", () => {
  console.log("\n[Co-op] Shutting down...");
  for (const bot of Object.values(bots)) {
    try {
      bot.quit();
    } catch {}
  }
  process.exit(0);
});
