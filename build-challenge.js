/**
 * Build Challenge Mode — 2 bots compete to build the best house!
 *
 * BOTS:
 *   - ArchitectA  (builds on the LEFT side)
 *   - ArchitectB  (builds on the RIGHT side)
 *
 * Rules:
 *   - 25 minute timer
 *   - Each bot gets a building plot
 *   - They build autonomously with their own style
 *   - Player judges the winner!
 *
 * Usage:
 *   npm run build
 *
 * Chat commands (say in-game):
 *   go          — Start the build challenge & timer
 *   items       — Give both bots building materials
 *   items a     — Give only ArchitectA materials
 *   items b     — Give only ArchitectB materials
 *   stop        — Pause building
 *   resume      — Resume building
 *   time        — Check remaining time
 *   winner a/b  — Declare a winner
 *   quit        — Disconnect bots
 */

import "dotenv/config";
import mineflayer from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
const { pathfinder, Movements, goals } = pathfinderPkg;

// ── Config ──────────────────────────────────────────────────────────────

const HOST = process.env.BOT_HOST || "127.0.0.1";
const PORT = parseInt(process.env.BOT_PORT, 10) || 25565;
const VERSION = process.env.BOT_VERSION || "1.20.4";

const CHALLENGE_DURATION = 25 * 60 * 1000; // 25 minutes
const PLOT_OFFSET = 15; // blocks apart from spawn

const BOTS_CONFIG = [
  { name: "ArchitectA", tag: "A", color: "\x1b[33m", plotDir: -1 },
  { name: "ArchitectB", tag: "B", color: "\x1b[36m", plotDir: 1 },
];

// ── State ───────────────────────────────────────────────────────────────

const bots = {};
let challengeActive = false;
let challengeTimer = null;
let challengeStart = 0;
let intentionalQuit = false;

// ── Building Materials ──────────────────────────────────────────────────

const BUILD_ITEMS = [
  "oak_planks 256",
  "oak_log 64",
  "glass_pane 64",
  "oak_stairs 64",
  "oak_slab 64",
  "oak_door 4",
  "oak_fence 32",
  "lantern 16",
  "cobblestone 128",
  "stone_bricks 128",
  "smooth_stone 64",
  "white_wool 64",
  "red_wool 32",
  "blue_wool 32",
  "bookshelf 16",
  "flower_pot 8",
  "torch 32",
  "crafting_table 2",
  "furnace 2",
  "chest 4",
  "bed 2",
  "carpet 32",
  "glass 64",
  "brick_stairs 32",
  "stone_brick_stairs 32",
  "spruce_planks 64",
  "dark_oak_planks 64",
  "stripped_oak_log 32",
];

// ── Helpers ─────────────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatTime(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function timeRemaining() {
  if (!challengeStart) return CHALLENGE_DURATION;
  return Math.max(0, CHALLENGE_DURATION - (Date.now() - challengeStart));
}

// ── Trash Talk / Personality ────────────────────────────────────────────

const BUILDING_CHAT = {
  start: [
    "Let's build! This is gonna be epic!",
    "I already have the blueprint in my head!",
    "You're going DOWN. My house will be legendary!",
    "Time to show off my architecture skills!",
  ],
  building: [
    "This is looking SO good.",
    "My house is gonna be the best.",
    "Check out this wall! Perfect.",
    "Interior design time!",
    "Hmm, maybe a window here...",
    "This needs more detail...",
    "Roof time! The hardest part...",
    "Almost done with this section!",
    "*places blocks furiously*",
    "Yeah, this is a masterpiece.",
  ],
  trash_talk: [
    "Your house looks like a dirt hut!",
    "Is that a house or a box?",
    "My house is way better already!",
    "You call THAT architecture?",
    "Lol have you even started?",
    "I wouldn't live in that thing!",
    "My dog could build better than that!",
    "Oof... that's rough buddy.",
    "Did you learn to build from a creeper?",
    "More like an outhouse than a house!",
  ],
  panicking: [
    "Running out of time!!",
    "HURRY HURRY HURRY!",
    "No time for details, just BUILD!",
    "AHHH IT'S NOT DONE YET!",
    "I need more time!!",
    "5 more minutes PLEASE!",
  ],
  finished: [
    "Done! Come check it out!",
    "I present to you... my MASTERPIECE!",
    "That's a house right there. You're welcome.",
    "Move-in ready! Best house ever!",
  ],
  items_received: [
    "Ooh, building materials! Thanks!",
    "More blocks! Let's gooo!",
    "Perfect, I needed more stuff!",
    "Materials received! Back to work!",
  ],
};

// ═══════════════════════════════════════════════════════════════════════
//  BUILDING AI
// ═══════════════════════════════════════════════════════════════════════

/**
 * Each bot builds a house using a sequence of build phases:
 *   1. Foundation / floor
 *   2. Walls
 *   3. Windows & door
 *   4. Roof
 *   5. Interior (furniture)
 *   6. Decoration (outside details)
 *
 * Each phase places blocks in patterns relative to the bot's plot origin.
 */

// House blueprints — array of { offset: [dx, dy, dz], block: "name" }
// Two different house styles so they don't build identical houses

function generateHouseA() {
  const blocks = [];
  const W = 9,
    D = 9,
    H = 5;

  // Floor — oak_planks
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++)
      blocks.push({ offset: [x, 0, z], block: "oak_planks" });

  // Walls — stone_bricks bottom half, oak_planks top half
  for (let y = 1; y <= H; y++) {
    for (let x = 0; x < W; x++) {
      const mat = y <= 2 ? "stone_bricks" : "oak_planks";
      blocks.push({ offset: [x, y, 0], block: mat });
      blocks.push({ offset: [x, y, D - 1], block: mat });
    }
    for (let z = 1; z < D - 1; z++) {
      const mat = y <= 2 ? "stone_bricks" : "oak_planks";
      blocks.push({ offset: [0, y, z], block: mat });
      blocks.push({ offset: [W - 1, y, z], block: mat });
    }
  }

  // Door hole (front wall, center)
  const doorX = Math.floor(W / 2);
  blocks.push({ offset: [doorX, 1, 0], block: "air" });
  blocks.push({ offset: [doorX, 2, 0], block: "air" });

  // Windows — glass_pane (punch holes in walls, place glass)
  for (const wx of [2, W - 3]) {
    blocks.push({ offset: [wx, 3, 0], block: "glass_pane" });
    blocks.push({ offset: [wx, 3, D - 1], block: "glass_pane" });
  }
  for (const wz of [2, D - 3]) {
    blocks.push({ offset: [0, 3, wz], block: "glass_pane" });
    blocks.push({ offset: [W - 1, 3, wz], block: "glass_pane" });
  }

  // Roof — oak_slab pyramid-ish
  for (let r = 0; r <= 2; r++) {
    for (let x = r; x < W - r; x++) {
      blocks.push({ offset: [x, H + 1 + r, r], block: "oak_stairs" });
      blocks.push({ offset: [x, H + 1 + r, D - 1 - r], block: "oak_stairs" });
    }
    for (let z = r + 1; z < D - r - 1; z++) {
      blocks.push({ offset: [r, H + 1 + r, z], block: "oak_slab" });
      blocks.push({ offset: [W - 1 - r, H + 1 + r, z], block: "oak_slab" });
    }
  }
  // Cap
  for (let x = 3; x < W - 3; x++)
    for (let z = 3; z < D - 3; z++)
      blocks.push({ offset: [x, H + 4, z], block: "oak_planks" });

  // Interior — place some furniture
  blocks.push({ offset: [1, 1, 1], block: "crafting_table" });
  blocks.push({ offset: [2, 1, 1], block: "furnace" });
  blocks.push({ offset: [W - 2, 1, 1], block: "chest" });
  blocks.push({ offset: [1, 1, D - 2], block: "bookshelf" });
  blocks.push({ offset: [2, 1, D - 2], block: "bookshelf" });

  // Torches on walls (as lanterns on floor)
  blocks.push({ offset: [1, 1, Math.floor(D / 2)], block: "lantern" });
  blocks.push({
    offset: [W - 2, 1, Math.floor(D / 2)],
    block: "lantern",
  });

  // Front porch
  for (let x = doorX - 1; x <= doorX + 1; x++)
    blocks.push({ offset: [x, 0, -1], block: "oak_planks" });
  blocks.push({ offset: [doorX - 1, 1, -1], block: "oak_fence" });
  blocks.push({ offset: [doorX + 1, 1, -1], block: "oak_fence" });
  blocks.push({ offset: [doorX - 1, 2, -1], block: "lantern" });

  return blocks;
}

function generateHouseB() {
  const blocks = [];
  const W = 8,
    D = 10,
    H = 5;

  // Floor — spruce_planks
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++)
      blocks.push({ offset: [x, 0, z], block: "spruce_planks" });

  // Walls — cobblestone with dark_oak_planks accents
  for (let y = 1; y <= H; y++) {
    for (let x = 0; x < W; x++) {
      const mat = x === 0 || x === W - 1 ? "dark_oak_planks" : "cobblestone";
      blocks.push({ offset: [x, y, 0], block: mat });
      blocks.push({ offset: [x, y, D - 1], block: mat });
    }
    for (let z = 1; z < D - 1; z++) {
      const mat = z === 0 || z === D - 1 ? "dark_oak_planks" : "cobblestone";
      blocks.push({ offset: [0, y, z], block: mat });
      blocks.push({ offset: [W - 1, y, z], block: mat });
    }
  }

  // Pillars — stripped_oak_log at corners
  for (const cx of [0, W - 1])
    for (const cz of [0, D - 1])
      for (let y = 1; y <= H + 1; y++)
        blocks.push({ offset: [cx, y, cz], block: "stripped_oak_log" });

  // Door (front wall center)
  const doorX = Math.floor(W / 2);
  blocks.push({ offset: [doorX, 1, 0], block: "air" });
  blocks.push({ offset: [doorX, 2, 0], block: "air" });

  // Windows — glass
  for (const wx of [2, W - 3]) {
    blocks.push({ offset: [wx, 2, 0], block: "glass" });
    blocks.push({ offset: [wx, 3, 0], block: "glass" });
    blocks.push({ offset: [wx, 2, D - 1], block: "glass" });
    blocks.push({ offset: [wx, 3, D - 1], block: "glass" });
  }
  for (const wz of [3, D - 4]) {
    blocks.push({ offset: [0, 2, wz], block: "glass" });
    blocks.push({ offset: [0, 3, wz], block: "glass" });
    blocks.push({ offset: [W - 1, 2, wz], block: "glass" });
    blocks.push({ offset: [W - 1, 3, wz], block: "glass" });
  }

  // A-frame roof
  for (let r = 0; r <= 3; r++) {
    for (let z = -1; z <= D; z++) {
      blocks.push({ offset: [r, H + 1 + r, z], block: "stone_brick_stairs" });
      blocks.push({
        offset: [W - 1 - r, H + 1 + r, z],
        block: "stone_brick_stairs",
      });
    }
  }
  // Ridge
  for (let z = -1; z <= D; z++)
    blocks.push({ offset: [Math.floor(W / 2), H + 5, z], block: "oak_slab" });

  // Interior
  blocks.push({ offset: [1, 1, 1], block: "furnace" });
  blocks.push({ offset: [1, 1, 2], block: "crafting_table" });
  blocks.push({ offset: [W - 2, 1, 1], block: "chest" });
  blocks.push({ offset: [W - 2, 1, 2], block: "chest" });
  blocks.push({ offset: [1, 1, D - 2], block: "bookshelf" });
  blocks.push({ offset: [2, 1, D - 2], block: "bookshelf" });
  blocks.push({ offset: [3, 1, D - 2], block: "bookshelf" });

  // Lighting
  blocks.push({ offset: [1, 1, Math.floor(D / 2)], block: "lantern" });
  blocks.push({
    offset: [W - 2, 1, Math.floor(D / 2)],
    block: "lantern",
  });
  blocks.push({
    offset: [Math.floor(W / 2), 1, Math.floor(D / 2)],
    block: "lantern",
  });

  // Front porch — wider
  for (let x = doorX - 2; x <= doorX + 2; x++) {
    blocks.push({ offset: [x, 0, -1], block: "spruce_planks" });
    blocks.push({ offset: [x, 0, -2], block: "spruce_planks" });
  }
  blocks.push({ offset: [doorX - 2, 1, -2], block: "oak_fence" });
  blocks.push({ offset: [doorX + 2, 1, -2], block: "oak_fence" });
  blocks.push({ offset: [doorX - 2, 2, -2], block: "lantern" });
  blocks.push({ offset: [doorX + 2, 2, -2], block: "lantern" });

  return blocks;
}

// ═══════════════════════════════════════════════════════════════════════
//  BUILD AI — drives a bot through its blueprint
// ═══════════════════════════════════════════════════════════════════════

function setupBuildAI(bot, botConfig) {
  let buildInterval = null;
  let chatInterval = null;
  let blueprint = [];
  let buildIndex = 0;
  let plotOrigin = null;
  let paused = false;

  bot._buildAI = {
    start() {
      if (!bot.entity) return;

      // Determine plot origin relative to spawn
      const spawn = bot.entity.position.floored();
      plotOrigin = spawn.offset(botConfig.plotDir * PLOT_OFFSET, 0, 0);

      // Pick blueprint based on bot
      blueprint = botConfig.tag === "A" ? generateHouseA() : generateHouseB();
      buildIndex = 0;
      paused = false;

      bot.chat(pick(BUILDING_CHAT.start));

      // Build tick — place 1-3 blocks per tick
      buildInterval = setInterval(
        () => this.buildTick(),
        1800 + Math.random() * 1200,
      );

      // Chat tick — occasional commentary
      chatInterval = setInterval(
        () => {
          if (paused || !challengeActive) return;

          const remaining = timeRemaining();

          // Panic mode under 3 minutes
          if (remaining < 3 * 60 * 1000 && Math.random() < 0.4) {
            bot.chat(pick(BUILDING_CHAT.panicking));
            return;
          }

          // Trash talk the other bot
          if (Math.random() < 0.3) {
            bot.chat(pick(BUILDING_CHAT.trash_talk));
          } else if (Math.random() < 0.4) {
            bot.chat(pick(BUILDING_CHAT.building));
          }

          // Progress update
          if (Math.random() < 0.15) {
            const pct = Math.floor((buildIndex / blueprint.length) * 100);
            bot.chat(`I'm ${pct}% done!`);
          }
        },
        30000 + Math.random() * 20000,
      );
    },

    async buildTick() {
      if (paused || !challengeActive) return;
      if (buildIndex >= blueprint.length) {
        // Done building!
        if (buildInterval) {
          clearInterval(buildInterval);
          buildInterval = null;
        }
        bot.chat(pick(BUILDING_CHAT.finished));
        return;
      }

      // Place 1-3 blocks per tick
      const blocksThisTick = 1 + Math.floor(Math.random() * 3);
      for (
        let i = 0;
        i < blocksThisTick && buildIndex < blueprint.length;
        i++
      ) {
        const step = blueprint[buildIndex];
        buildIndex++;

        if (step.block === "air") continue; // skip air placeholders

        const [dx, dy, dz] = step.offset;
        const pos = plotOrigin.offset(dx, dy, dz);

        try {
          // Use /setblock command for reliable placement
          bot.chat(
            `/setblock ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)} ${step.block}`,
          );
        } catch (err) {
          // Ignore placement errors, keep going
        }

        // Small delay between blocks within same tick
        if (i < blocksThisTick - 1) {
          await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
        }
      }
    },

    pause() {
      paused = true;
      bot.chat("Pausing build...");
    },

    resume() {
      paused = false;
      bot.chat("Back to building!");
    },

    stop() {
      paused = true;
      if (buildInterval) {
        clearInterval(buildInterval);
        buildInterval = null;
      }
      if (chatInterval) {
        clearInterval(chatInterval);
        chatInterval = null;
      }
    },

    getProgress() {
      return {
        placed: buildIndex,
        total: blueprint.length,
        pct: blueprint.length
          ? Math.floor((buildIndex / blueprint.length) * 100)
          : 0,
      };
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  GIVE ITEMS
// ═══════════════════════════════════════════════════════════════════════

function giveItems(bot) {
  bot.chat(pick(BUILDING_CHAT.items_received));
  let delay = 0;
  for (const item of BUILD_ITEMS) {
    const parts = item.split(" ");
    const name = parts[0];
    const count = parts[1] || "1";
    setTimeout(() => {
      try {
        bot.chat(`/give ${bot.username} ${name} ${count}`);
      } catch {}
    }, delay);
    delay += 150;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  TIMER
// ═══════════════════════════════════════════════════════════════════════

function startTimer() {
  challengeStart = Date.now();

  // Announce at intervals
  const announcements = [
    { at: 5 * 60 * 1000, msg: "20 minutes remaining!" },
    { at: 10 * 60 * 1000, msg: "15 minutes remaining! Halfway!" },
    { at: 15 * 60 * 1000, msg: "10 minutes left!" },
    { at: 20 * 60 * 1000, msg: "5 minutes left! Hurry up!" },
    { at: 22 * 60 * 1000, msg: "3 minutes left!!" },
    { at: 24 * 60 * 1000, msg: "1 MINUTE LEFT!!!" },
    { at: 24.5 * 60 * 1000, msg: "30 SECONDS!" },
  ];

  const timers = [];
  for (const ann of announcements) {
    const t = setTimeout(() => {
      for (const bot of Object.values(bots)) {
        try {
          bot.chat(ann.msg);
        } catch {}
      }
    }, ann.at);
    timers.push(t);
  }

  // Final timer
  challengeTimer = setTimeout(() => {
    challengeActive = false;
    for (const bot of Object.values(bots)) {
      try {
        bot.chat("TIME'S UP! Pencils down! Step away from the blocks!");
        bot._buildAI?.stop();
      } catch {}
    }
    setTimeout(() => {
      const first = Object.values(bots)[0];
      if (first) {
        first.chat("=== BUILD CHALLENGE COMPLETE ===");
        setTimeout(() => {
          for (const bc of BOTS_CONFIG) {
            const b = bots[bc.name];
            if (b?._buildAI) {
              const p = b._buildAI.getProgress();
              first.chat(
                `${bc.name}: ${p.placed}/${p.total} blocks (${p.pct}%)`,
              );
            }
          }
          setTimeout(() => {
            first.chat('Judge the houses and say "winner a" or "winner b"!');
          }, 1500);
        }, 1500);
      }
    }, 2000);

    // Clean up announcement timers
    for (const t of timers) clearTimeout(t);
  }, CHALLENGE_DURATION);
}

// ═══════════════════════════════════════════════════════════════════════
//  CHAT COMMAND HANDLING
// ═══════════════════════════════════════════════════════════════════════

function setupChatHandler(bot) {
  bot.on("chat", (username, message) => {
    // Ignore our own bots
    if (BOTS_CONFIG.some((bc) => bc.name === username)) return;

    const msg = message.trim().toLowerCase();

    if (msg === "go") {
      if (challengeActive) {
        bot.chat(
          "Challenge already running! " +
            formatTime(timeRemaining()) +
            " remaining.",
        );
        return;
      }
      challengeActive = true;
      bot.chat("=== BUILD CHALLENGE START! 25 MINUTES! ===");
      startTimer();
      for (const b of Object.values(bots)) {
        b._buildAI?.start();
      }
      return;
    }

    if (msg === "items" || msg === "items a" || msg === "items b") {
      if (msg === "items" || msg === "items a") {
        if (bots["ArchitectA"]) giveItems(bots["ArchitectA"]);
      }
      if (msg === "items" || msg === "items b") {
        if (bots["ArchitectB"]) giveItems(bots["ArchitectB"]);
      }
      return;
    }

    if (msg === "stop") {
      for (const b of Object.values(bots)) {
        b._buildAI?.pause();
      }
      bot.chat("Building paused.");
      return;
    }

    if (msg === "resume") {
      for (const b of Object.values(bots)) {
        b._buildAI?.resume();
      }
      bot.chat("Building resumed!");
      return;
    }

    if (msg === "time") {
      if (!challengeActive) {
        bot.chat('Say "go" to start the challenge!');
      } else {
        bot.chat(`${formatTime(timeRemaining())} remaining!`);
      }
      return;
    }

    if (msg === "status") {
      for (const bc of BOTS_CONFIG) {
        const b = bots[bc.name];
        if (b?._buildAI) {
          const p = b._buildAI.getProgress();
          bot.chat(`${bc.name}: ${p.pct}% (${p.placed}/${p.total} blocks)`);
        }
      }
      return;
    }

    if (msg === "winner a" || msg === "winner b") {
      const winner = msg === "winner a" ? "ArchitectA" : "ArchitectB";
      const loser = msg === "winner a" ? "ArchitectB" : "ArchitectA";
      const wBot = bots[winner];
      const lBot = bots[loser];
      if (wBot) {
        wBot.chat(
          pick([
            "YES!! I KNEW IT! My house is AMAZING!",
            "WOOO! Best architect ever!!",
            "EZ WIN! My house is a masterpiece!",
            "Called it! Nobody builds like me!",
          ]),
        );
      }
      setTimeout(() => {
        if (lBot) {
          lBot.chat(
            pick([
              "What?! My house was clearly better!",
              "Rigged! RIGGED I say!",
              "Rematch! I demand a rematch!",
              "...okay fine. GG.",
              "That judge is BLIND!",
            ]),
          );
        }
      }, 1500);
      return;
    }

    if (msg === "quit") {
      intentionalQuit = true;
      for (const b of Object.values(bots)) {
        b._buildAI?.stop();
        try {
          b.quit();
        } catch {}
      }
      if (challengeTimer) clearTimeout(challengeTimer);
      setTimeout(() => process.exit(0), 1000);
      return;
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  BOT SPAWNING
// ═══════════════════════════════════════════════════════════════════════

function spawnBot(botConfig) {
  const { name, tag, color } = botConfig;

  const bot = mineflayer.createBot({
    username: name,
    host: HOST,
    port: PORT,
    version: VERSION,
    checkTimeoutInterval: 300_000,
  });

  bot.loadPlugin(pathfinder);

  bot.once("spawn", () => {
    console.log(`${color}[SPAWN] ${name} joined! (Builder ${tag})\x1b[0m`);

    const defaultMove = new Movements(bot);
    defaultMove.canDig = false;
    defaultMove.allow1by1towers = false;
    bot.pathfinder.setMovements(defaultMove);

    bots[name] = bot;

    bot.chat(
      pick([
        `${name} (Builder ${tag}) ready to build!`,
        `Builder ${tag} in the house! ...get it? House?`,
        `${name} reporting! My house will be the BEST!`,
      ]),
    );

    // Set up chat handler on first bot only (avoid duplicate handling)
    if (tag === "A") {
      setupChatHandler(bot);
    }

    // Set up building AI
    setupBuildAI(bot, botConfig);

    if (Object.keys(bots).length >= BOTS_CONFIG.length) {
      setTimeout(() => {
        const first = Object.values(bots)[0];
        if (first) {
          first.chat("=== Both builders are here! ===");
          setTimeout(() => {
            first.chat('Say "items" to give materials, then "go" to start!');
          }, 1500);
        }
      }, 2000);
    }
  });

  bot.on("kicked", (reason) =>
    console.log(`${color}[${name}] Kicked: ${reason}\x1b[0m`),
  );
  bot.on("error", (err) =>
    console.error(`${color}[${name}] Error: ${err.message}\x1b[0m`),
  );
  bot.on("end", () => {
    console.log(`${color}[${name}] Disconnected.\x1b[0m`);
    bot._buildAI?.stop();
    if (!intentionalQuit) {
      // Auto-rejoin after 5s
      setTimeout(() => {
        if (intentionalQuit) return;
        console.log(`${color}[REJOIN] ${name} reconnecting...\x1b[0m`);
        delete bots[name];
        spawnBot(botConfig);
      }, 5000);
    }
  });

  return bot;
}

// ═══════════════════════════════════════════════════════════════════════
//  LAUNCH
// ═══════════════════════════════════════════════════════════════════════

console.log("==========================================================");
console.log("       MINEFLAYER BUILD CHALLENGE (2 Builders!)");
console.log("==========================================================");
console.log("");
for (const bc of BOTS_CONFIG) {
  console.log(`  ${bc.color}${bc.name}\x1b[0m - Builder ${bc.tag}`);
}
console.log("");
console.log(`  Server: ${HOST}:${PORT} (v${VERSION})`);
console.log(`  Timer:  ${CHALLENGE_DURATION / 60000} minutes`);
console.log("==========================================================");
console.log("  In-game commands:");
console.log('    "go"          - Start the build challenge');
console.log('    "items"       - Give both bots building materials');
console.log('    "items a/b"   - Give one bot materials');
console.log('    "stop"        - Pause building');
console.log('    "resume"      - Resume building');
console.log('    "time"        - Check remaining time');
console.log('    "status"      - Building progress');
console.log('    "winner a/b"  - Declare the winner');
console.log('    "quit"        - Disconnect bots');
console.log("==========================================================");
console.log("");

// Stagger joins
let delay = 0;
for (const bc of BOTS_CONFIG) {
  setTimeout(() => spawnBot(bc), delay);
  delay += 3000;
}

// Global error handlers
process.on("uncaughtException", (err) => {
  console.error("\x1b[31m[UNCAUGHT]", err.message, "\x1b[0m");
});
process.on("unhandledRejection", (err) => {
  console.error("\x1b[31m[UNHANDLED]", err?.message || err, "\x1b[0m");
});

process.on("SIGINT", () => {
  console.log("\n[Build Challenge] Shutting down...");
  intentionalQuit = true;
  for (const bot of Object.values(bots)) {
    try {
      bot.quit();
    } catch {}
  }
  if (challengeTimer) clearTimeout(challengeTimer);
  process.exit(0);
});
