/**
 * Two Bot Mode — 2 builders cooperate to build a large 50×50 house in creative.
 * Each bot takes alternating blocks from the same blueprint so they build together.
 *
 * Usage:
 *   npm run two
 *
 * Chat commands (say in-game):
 *   go          — Start building
 *   items       — Give both bots building materials
 *   items a     — Give only BuilderA materials
 *   items b     — Give only BuilderB materials
 *   stop        — Pause building
 *   resume      — Resume building
 *   status      — Check building progress
 *   rebuild     — Reset progress and start over
 *   quit        — Disconnect bots
 */

import "dotenv/config";
import mineflayer from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
const { pathfinder, Movements, goals } = pathfinderPkg;
import vec3 from "vec3";

// ── Config ──────────────────────────────────────────────────────────────

const HOST = process.env.BOT_HOST || "127.0.0.1";
const PORT = parseInt(process.env.BOT_PORT, 10) || 25565;
const VERSION = process.env.BOT_VERSION || "1.20.4";

const RECONNECT_DELAY = 5000;

const PLOT_SPACING = 60; // blocks apart so houses don't overlap

const BOTS_CONFIG = [
  { name: "BuilderA", tag: "A", color: "\x1b[33m", plotDir: -1 },
  { name: "BuilderB", tag: "B", color: "\x1b[36m", plotDir: 1 },
];

// Per-bot persistent state (survives reconnects)
const botState = {};
for (const bc of BOTS_CONFIG) {
  botState[bc.name] = {
    blueprint: null,
    plotOrigin: null,
    buildIndex: 0,
    initialized: false,
  };
}

const bots = {};
let challengeActive = false;
let intentionalQuit = false;

// ── Building Materials ──────────────────────────────────────────────────

const BUILD_ITEMS = [
  "oak_planks 256",
  "oak_log 128",
  "cobblestone 128",
  "stone_bricks 128",
  "glass_pane 64",
  "glass 64",
  "oak_stairs 64",
  "oak_slab 64",
  "oak_door 4",
  "oak_fence 32",
  "lantern 32",
  "torch 32",
  "smooth_stone 64",
  "white_wool 32",
  "bookshelf 16",
  "crafting_table 2",
  "furnace 2",
  "chest 8",
  "red_bed 2",
  "carpet 32",
  "flower_pot 8",
  "brick_stairs 32",
  "stone_brick_stairs 32",
  "spruce_planks 64",
  "dark_oak_planks 64",
  "stripped_oak_log 64",
];

// ── Chat Lines ──────────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const CHAT = {
  start: [
    "My house is gonna be WAY better!",
    "Watch and learn! Building time!",
    "Let's see who builds faster!",
    "Prepare to be amazed!",
  ],
  building: [
    "This is looking SO good.",
    "Great teamwork!",
    "My side is looking amazing.",
    "Almost done with this section!",
    "*places blocks furiously*",
    "We're making great progress!",
    "This house is gonna be legendary!",
    "Check out these walls!",
  ],
  finished: [
    "Done! Come check it out!",
    "WE DID IT! What a house!",
    "Teamwork! Best house ever!",
    "Move-in ready!",
  ],
  items_received: [
    "Ooh, building materials! Thanks!",
    "More blocks! Let's gooo!",
    "Perfect, I needed more stuff!",
  ],
  resumed: [
    "I'm back! Let me keep building!",
    "Back on the job!",
    "Reconnected — picking up where I left off!",
  ],
};

// ═══════════════════════════════════════════════════════════════════════
//  LARGE HOUSE BLUEPRINT — 50×50
// ═══════════════════════════════════════════════════════════════════════

function generateHouse() {
  const blocks = [];
  const W = 50,
    D = 50,
    H = 8;
  const midX = Math.floor(W / 2);
  const midZ = Math.floor(D / 2);

  // Foundation
  for (let x = -1; x <= W; x++)
    for (let z = -1; z <= D; z++)
      blocks.push({ offset: [x, -1, z], block: "stone_bricks" });

  // Floor (checker)
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) {
      const border = x === 0 || x === W - 1 || z === 0 || z === D - 1;
      const checker = (x + z) % 2 === 0 ? "oak_planks" : "spruce_planks";
      blocks.push({
        offset: [x, 0, z],
        block: border ? "smooth_stone" : checker,
      });
    }

  // Corner pillars
  for (const cx of [0, W - 1])
    for (const cz of [0, D - 1])
      for (let y = 1; y <= H + 1; y++)
        blocks.push({ offset: [cx, y, cz], block: "oak_log" });

  // Interval pillars every 10 blocks
  for (let x = 10; x < W; x += 10)
    for (const cz of [0, D - 1])
      for (let y = 1; y <= H; y++)
        blocks.push({ offset: [x, y, cz], block: "stripped_oak_log" });
  for (let z = 10; z < D; z += 10)
    for (const cx of [0, W - 1])
      for (let y = 1; y <= H; y++)
        blocks.push({ offset: [cx, y, z], block: "stripped_oak_log" });

  // Walls
  const doorX = midX;
  function isWindowPos(pos, wallLen) {
    return (pos % 5 === 2 || pos % 5 === 3) && pos > 1 && pos < wallLen - 2;
  }

  for (let y = 1; y <= H; y++) {
    const mat = y <= 3 ? "stone_bricks" : "oak_planks";
    const isWindowY = y === 4 || y === 5;

    for (let x = 1; x < W - 1; x++) {
      if (x % 10 === 0) continue;
      if ((x === doorX || x === doorX - 1 || x === doorX + 1) && y <= 3)
        continue;
      if (isWindowY && isWindowPos(x, W)) {
        blocks.push({ offset: [x, y, 0], block: "glass_pane" });
        continue;
      }
      blocks.push({ offset: [x, y, 0], block: mat });
    }

    for (let x = 1; x < W - 1; x++) {
      if (x % 10 === 0) continue;
      if ((x === doorX || x === doorX - 1 || x === doorX + 1) && y <= 3)
        continue;
      if (isWindowY && isWindowPos(x, W)) {
        blocks.push({ offset: [x, y, D - 1], block: "glass_pane" });
        continue;
      }
      blocks.push({ offset: [x, y, D - 1], block: mat });
    }

    for (let z = 1; z < D - 1; z++) {
      if (z % 10 === 0) continue;
      if (isWindowY && isWindowPos(z, D)) {
        blocks.push({ offset: [0, y, z], block: "glass_pane" });
        continue;
      }
      blocks.push({ offset: [0, y, z], block: mat });
    }

    for (let z = 1; z < D - 1; z++) {
      if (z % 10 === 0) continue;
      if (isWindowY && isWindowPos(z, D)) {
        blocks.push({ offset: [W - 1, y, z], block: "glass_pane" });
        continue;
      }
      blocks.push({ offset: [W - 1, y, z], block: mat });
    }
  }

  // Flat Roof
  for (let x = -1; x <= W; x++)
    for (let z = -1; z <= D; z++) {
      const edge = x === -1 || x === W || z === -1 || z === D;
      blocks.push({
        offset: [x, H + 1, z],
        block: edge ? "stone_brick_stairs" : "dark_oak_planks",
      });
    }
  for (let x = -1; x <= W; x++) {
    blocks.push({ offset: [x, H + 2, -1], block: "oak_fence" });
    blocks.push({ offset: [x, H + 2, D], block: "oak_fence" });
  }
  for (let z = 0; z < D; z++) {
    blocks.push({ offset: [-1, H + 2, z], block: "oak_fence" });
    blocks.push({ offset: [W, H + 2, z], block: "oak_fence" });
  }

  // Interior walls — 4 quadrants
  for (let x = 1; x < W - 1; x++) {
    for (let y = 1; y <= H - 1; y++) {
      const q1 = Math.floor(W / 4);
      const q3 = Math.floor((3 * W) / 4);
      if ((x >= q1 - 1 && x <= q1 + 1) || (x >= q3 - 1 && x <= q3 + 1))
        continue;
      blocks.push({ offset: [x, y, midZ], block: "oak_planks" });
    }
  }
  for (let z = 1; z < D - 1; z++) {
    if (z === midZ) continue;
    for (let y = 1; y <= H - 1; y++) {
      const q1 = Math.floor(D / 4);
      const q3 = Math.floor((3 * D) / 4);
      if ((z >= q1 - 1 && z <= q1 + 1) || (z >= q3 - 1 && z <= q3 + 1))
        continue;
      blocks.push({ offset: [midX, y, z], block: "oak_planks" });
    }
  }

  // Front Porch
  for (let x = doorX - 5; x <= doorX + 5; x++)
    for (let dz = -1; dz >= -4; dz--)
      blocks.push({ offset: [x, 0, dz], block: "oak_planks" });
  for (const px of [doorX - 5, doorX + 5]) {
    for (let y = 1; y <= 3; y++)
      blocks.push({ offset: [px, y, -4], block: "oak_log" });
    blocks.push({ offset: [px, 4, -4], block: "lantern" });
  }
  for (let x = doorX - 5; x <= doorX + 5; x++)
    for (let dz = -1; dz >= -4; dz--)
      blocks.push({ offset: [x, 4, dz], block: "oak_slab" });
  for (let x = doorX - 4; x <= doorX + 4; x++)
    blocks.push({ offset: [x, 1, -4], block: "oak_fence" });

  // Room 1: Living Room
  blocks.push({ offset: [2, 1, 2], block: "crafting_table" });
  blocks.push({ offset: [3, 1, 2], block: "crafting_table" });
  blocks.push({ offset: [2, 1, 3], block: "furnace" });
  blocks.push({ offset: [3, 1, 3], block: "furnace" });
  for (let z = 2; z < midZ - 1; z += 2) {
    blocks.push({ offset: [1, 1, z], block: "bookshelf" });
    blocks.push({ offset: [1, 2, z], block: "bookshelf" });
  }
  for (let x = 4; x < midX - 2; x++)
    for (let z = 3; z < midZ - 2; z += 2)
      blocks.push({ offset: [x, 1, z], block: "carpet" });
  for (let x = 5; x < midX; x += 8)
    for (let z = 4; z < midZ; z += 8)
      blocks.push({ offset: [x, 1, z], block: "lantern" });

  // Room 2: Kitchen / Storage
  for (let x = midX + 2; x < midX + 8; x++)
    blocks.push({ offset: [x, 1, 1], block: "furnace" });
  for (let x = midX + 2; x < midX + 10; x++)
    blocks.push({ offset: [x, 1, 2], block: "chest" });
  for (let x = midX + 2; x < midX + 10; x++)
    blocks.push({ offset: [x, 1, 3], block: "chest" });
  for (let x = midX + 5; x < W - 2; x += 8)
    for (let z = 4; z < midZ; z += 8)
      blocks.push({ offset: [x, 1, z], block: "lantern" });

  // Room 3: Bedroom
  for (let x = 2; x < 12; x += 3) {
    blocks.push({ offset: [x, 1, midZ + 3], block: "red_bed" });
    blocks.push({ offset: [x + 1, 1, midZ + 3], block: "red_bed" });
  }
  for (let x = 2; x < 12; x += 3) {
    blocks.push({ offset: [x, 1, midZ + 6], block: "red_bed" });
    blocks.push({ offset: [x + 1, 1, midZ + 6], block: "red_bed" });
  }
  for (let x = 2; x < midX - 2; x++)
    for (let z = midZ + 2; z < D - 3; z += 2)
      blocks.push({ offset: [x, 1, z], block: "carpet" });
  for (let x = 5; x < midX; x += 8)
    for (let z = midZ + 4; z < D - 2; z += 8)
      blocks.push({ offset: [x, 1, z], block: "lantern" });

  // Room 4: Library
  for (let z = midZ + 2; z < D - 2; z++) {
    blocks.push({ offset: [W - 2, 1, z], block: "bookshelf" });
    blocks.push({ offset: [W - 2, 2, z], block: "bookshelf" });
    blocks.push({ offset: [W - 2, 3, z], block: "bookshelf" });
  }
  for (let z = midZ + 2; z < D - 2; z++) {
    blocks.push({ offset: [W - 3, 1, z], block: "bookshelf" });
    blocks.push({ offset: [W - 3, 2, z], block: "bookshelf" });
  }
  blocks.push({ offset: [midX + 3, 1, D - 3], block: "crafting_table" });
  blocks.push({ offset: [midX + 4, 1, D - 3], block: "chest" });
  blocks.push({ offset: [midX + 5, 1, D - 3], block: "chest" });
  for (let x = midX + 5; x < W - 2; x += 8)
    for (let z = midZ + 4; z < D - 2; z += 8)
      blocks.push({ offset: [x, 1, z], block: "lantern" });

  // Wall torches
  for (let x = 5; x < W - 2; x += 8) {
    blocks.push({ offset: [x, 4, 1], block: "torch" });
    blocks.push({ offset: [x, 4, D - 2], block: "torch" });
  }
  for (let z = 5; z < D - 2; z += 8) {
    blocks.push({ offset: [1, 4, z], block: "torch" });
    blocks.push({ offset: [W - 2, 4, z], block: "torch" });
  }

  // Flower pots
  for (let x = 3; x < W - 2; x += 6)
    blocks.push({ offset: [x, 1, -1], block: "flower_pot" });

  return blocks;
}

// ═══════════════════════════════════════════════════════════════════════
//  BLOCK PLACEMENT
// ═══════════════════════════════════════════════════════════════════════

async function placeBlockAt(b, targetPos, blockName) {
  try {
    b.chat(`/give ${b.username} ${blockName} 1`);
    await new Promise((r) => setTimeout(r, 30));
  } catch {}

  try {
    const item = b.inventory.items().find((it) => it.name === blockName);
    if (item) await b.equip(item, "hand");
  } catch {}

  const faces = [
    vec3(0, -1, 0),
    vec3(0, 1, 0),
    vec3(1, 0, 0),
    vec3(-1, 0, 0),
    vec3(0, 0, 1),
    vec3(0, 0, -1),
  ];

  let refBlock = null;
  let faceVec = null;
  for (const face of faces) {
    const checkPos = targetPos.plus(face);
    const block = b.blockAt(checkPos);
    if (block && block.name !== "air" && block.name !== "cave_air") {
      refBlock = block;
      faceVec = face.scaled(-1);
      break;
    }
  }

  const dist = b.entity.position.distanceTo(targetPos);
  if (dist > 4.5) {
    try {
      const flyTarget = targetPos.offset(0, 0.5, -2);
      b.chat(
        `/tp ${b.username} ${flyTarget.x.toFixed(1)} ${flyTarget.y.toFixed(1)} ${flyTarget.z.toFixed(1)}`,
      );
      await new Promise((r) => setTimeout(r, 50));
    } catch {}
  }

  if (refBlock && faceVec) {
    try {
      await b.lookAt(targetPos.offset(0.5, 0.5, 0.5));
      await new Promise((r) => setTimeout(r, 15));
      await b.placeBlock(refBlock, faceVec);
      return true;
    } catch {}
  }

  try {
    b.chat(
      `/setblock ${Math.floor(targetPos.x)} ${Math.floor(targetPos.y)} ${Math.floor(targetPos.z)} ${blockName}`,
    );
  } catch {}
  return false;
}

// ═══════════════════════════════════════════════════════════════════════
//  SURFACE FINDER
// ═══════════════════════════════════════════════════════════════════════

function findSurfaceY(b, x, z) {
  const startY = Math.min(b.entity.position.y + 40, 319);
  for (let y = startY; y > b.entity.position.y - 20; y--) {
    const block = b.blockAt(vec3(x, y, z));
    const above = b.blockAt(vec3(x, y + 1, z));
    if (
      block &&
      above &&
      block.name !== "air" &&
      block.name !== "cave_air" &&
      block.name !== "water" &&
      block.name !== "lava" &&
      (above.name === "air" || above.name === "cave_air")
    ) {
      const above2 = b.blockAt(vec3(x, y + 2, z));
      if (above2 && (above2.name === "air" || above2.name === "cave_air")) {
        return y + 1;
      }
    }
  }
  return b.entity.position.floored().y;
}

// ═══════════════════════════════════════════════════════════════════════
//  BUILD AI — each bot builds its OWN separate house
// ═══════════════════════════════════════════════════════════════════════

function setupBuildAI(b, botConfig) {
  let building = false;
  let chatInterval = null;
  const state = botState[botConfig.name];

  b._buildAI = {
    start() {
      if (!b.entity) return;

      // Each bot gets its own blueprint + plot origin
      if (!state.initialized) {
        const spawn = b.entity.position.floored();
        const buildX = spawn.x + botConfig.plotDir * PLOT_SPACING / 2;
        const buildZ = spawn.z + 5;
        const surfaceY = findSurfaceY(b, buildX, buildZ);
        state.plotOrigin = { x: buildX, y: surfaceY, z: buildZ };
        state.blueprint = generateHouse();
        state.buildIndex = 0;
        state.initialized = true;
        console.log(
          `[${botConfig.name}] Blueprint: ${state.blueprint.length} blocks, origin: (${buildX}, ${surfaceY}, ${buildZ})`,
        );
      }

      building = true;
      b.chat(pick(CHAT.start));

      setTimeout(() => {
        try { b.chat(`/gamemode creative ${b.username}`); } catch {}
      }, 500);

      this._runLoop();

      chatInterval = setInterval(() => {
        if (!building || !challengeActive) return;
        if (Math.random() < 0.3) b.chat(pick(CHAT.building));
        if (Math.random() < 0.15) {
          const p = this.getProgress();
          b.chat(`My progress: ${p.pct}%`);
        }
      }, 30000 + Math.random() * 20000);
    },

    async _runLoop() {
      const bp = state.blueprint;
      if (!bp) return;

      while (building && challengeActive && state.buildIndex < bp.length) {
        const step = bp[state.buildIndex];
        state.buildIndex++;

        if (step.block !== "air") {
          const o = state.plotOrigin;
          const [dx, dy, dz] = step.offset;
          const targetPos = vec3(o.x + dx, o.y + dy, o.z + dz);

          try {
            await placeBlockAt(b, targetPos, step.block);
          } catch {
            if (!b.entity) { building = false; return; }
          }

          await new Promise((r) => setTimeout(r, 75 + Math.random() * 100));
        }

        if (!building || !challengeActive) return;
      }

      if (state.buildIndex >= bp.length && challengeActive && building) {
        b.chat(pick(CHAT.finished));
        building = false;
      }
    },

    pause() {
      building = false;
      b.chat("Pausing...");
    },

    resume() {
      if (!challengeActive) { b.chat('Say "go" first!'); return; }
      building = true;
      b.chat("Back to building!");
      this._runLoop();
    },

    stop() {
      building = false;
      if (chatInterval) { clearInterval(chatInterval); chatInterval = null; }
    },

    reset() {
      this.stop();
      state.buildIndex = 0;
      state.blueprint = null;
      state.plotOrigin = null;
      state.initialized = false;
    },

    getProgress() {
      const total = state.blueprint?.length || 0;
      return {
        placed: state.buildIndex,
        total,
        pct: total ? Math.floor((state.buildIndex / total) * 100) : 0,
      };
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  GIVE ITEMS
// ═══════════════════════════════════════════════════════════════════════

function giveItems(b) {
  b.chat(pick(CHAT.items_received));
  let delay = 0;
  for (const item of BUILD_ITEMS) {
    const parts = item.split(" ");
    const name = parts[0];
    const count = parts[1] || "1";
    setTimeout(() => {
      try {
        b.chat(`/give ${b.username} ${name} ${count}`);
      } catch {}
    }, delay);
    delay += 60;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  CHAT COMMANDS (only set up on first bot to avoid duplicates)
// ═══════════════════════════════════════════════════════════════════════

function setupChatHandler(b) {
  b.on("chat", (username, message) => {
    if (BOTS_CONFIG.some((bc) => bc.name === username)) return;
    const msg = message.trim().toLowerCase();

    if (msg === "go") {
      if (challengeActive) {
        b.chat('Already building! Say "status" to check progress.');
        return;
      }
      challengeActive = true;
      b.chat("=== TWO BUILDERS — LET'S GO! ===");
      for (const bot of Object.values(bots)) bot._buildAI?.start();
      return;
    }

    if (msg === "items" || msg === "items a" || msg === "items b") {
      if (msg === "items" || msg === "items a") {
        if (bots["BuilderA"]) giveItems(bots["BuilderA"]);
      }
      if (msg === "items" || msg === "items b") {
        if (bots["BuilderB"]) giveItems(bots["BuilderB"]);
      }
      return;
    }

    if (msg === "stop") {
      for (const bot of Object.values(bots)) bot._buildAI?.pause();
      return;
    }

    if (msg === "resume") {
      for (const bot of Object.values(bots)) bot._buildAI?.resume();
      return;
    }

    if (msg === "status") {
      for (const bc of BOTS_CONFIG) {
        const st = botState[bc.name];
        const total = st.blueprint?.length || 0;
        const pct = total ? Math.floor((st.buildIndex / total) * 100) : 0;
        b.chat(`${bc.name}: ${pct}% (${st.buildIndex}/${total} blocks)`);
      }
      return;
    }

    if (msg === "rebuild") {
      for (const bot of Object.values(bots)) bot._buildAI?.reset();
      challengeActive = false;
      b.chat('Reset! Say "go" to start fresh.');
      return;
    }

    if (msg === "quit") {
      intentionalQuit = true;
      for (const bot of Object.values(bots)) {
        bot._buildAI?.stop();
        try {
          bot.quit();
        } catch {}
      }
      setTimeout(() => process.exit(0), 1000);
      return;
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  BOT SPAWNING + AUTO-RECONNECT
// ═══════════════════════════════════════════════════════════════════════

function spawnBot(botConfig) {
  const { name, tag, color } = botConfig;

  console.log(`${color}[TwoBot] Connecting ${name} → ${HOST}:${PORT}\x1b[0m`);

  const b = mineflayer.createBot({
    username: name,
    host: HOST,
    port: PORT,
    version: VERSION,
    checkTimeoutInterval: 300_000,
  });

  b.loadPlugin(pathfinder);

  b.once("spawn", () => {
    console.log(`${color}[SPAWN] ${name} joined! (Builder ${tag})\x1b[0m`);

    const defaultMove = new Movements(b);
    defaultMove.canDig = false;
    defaultMove.allow1by1towers = true;
    defaultMove.allowFreeMotion = true;
    b.pathfinder.setMovements(defaultMove);

    bots[name] = b;

    setTimeout(() => {
      try {
        b.chat(`/gamemode creative ${name}`);
      } catch {}
    }, 800);

    b.chat(
      pick([
        `${name} ready to build!`,
        `Builder ${tag} in the house!`,
        `${name} reporting for duty!`,
      ]),
    );

    // Chat handler on first bot only
    if (tag === "A") setupChatHandler(b);

    setupBuildAI(b, botConfig);

    // Auto-resume on rejoin
    if (challengeActive && botState[name].initialized) {
      const st = botState[name];
      const total = st.blueprint?.length || 0;
      const pct = total ? Math.floor((st.buildIndex / total) * 100) : 0;
      console.log(`${color}[REJOIN] ${name} resuming at ${pct}%\x1b[0m`);
      setTimeout(() => {
        b.chat(pick(CHAT.resumed));
        b.chat(`Picking up at ${pct}%...`);
        b._buildAI?.start();
      }, 2000);
    } else if (Object.keys(bots).length >= BOTS_CONFIG.length) {
      setTimeout(() => {
        const first = Object.values(bots)[0];
        if (first) {
          first.chat("=== Both builders are here! ===");
          setTimeout(() => first.chat('Say "go" to start building!'), 1500);
        }
      }, 2000);
    }
  });

  b.on("kicked", (reason) =>
    console.log(`${color}[${name}] Kicked: ${reason}\x1b[0m`),
  );
  b.on("error", (err) =>
    console.error(`${color}[${name}] Error: ${err.message}\x1b[0m`),
  );
  b.on("end", () => {
    console.log(`${color}[${name}] Disconnected.\x1b[0m`);
    b._buildAI?.stop();
    if (!intentionalQuit) {
      setTimeout(() => {
        if (intentionalQuit) return;
        console.log(`${color}[REJOIN] ${name} reconnecting...\x1b[0m`);
        delete bots[name];
        spawnBot(botConfig);
      }, RECONNECT_DELAY);
    }
  });

  return b;
}

// ═══════════════════════════════════════════════════════════════════════
//  LAUNCH
// ═══════════════════════════════════════════════════════════════════════

console.log("==========================================================");
console.log("       MINEFLAYER TWO BOTS — SEPARATE HOUSES");
console.log("==========================================================");
console.log("");
for (const bc of BOTS_CONFIG)
  console.log(`  ${bc.color}${bc.name}\x1b[0m - Builder ${bc.tag} (${bc.plotDir < 0 ? 'LEFT' : 'RIGHT'} side)`);
console.log("");
console.log(`  Server: ${HOST}:${PORT} (v${VERSION})`);
console.log(`  Houses: Each bot builds its own 50×50 house`);
console.log("");
console.log("  In-game commands:");
console.log('    "go"          - Start building');
console.log('    "items"       - Give both bots materials');
console.log('    "items a/b"   - Give one bot materials');
console.log('    "stop"        - Pause building');
console.log('    "resume"      - Resume building');
console.log('    "status"      - Building progress');
console.log('    "rebuild"     - Reset and start over');
console.log('    "quit"        - Disconnect bots');
console.log("==========================================================");
console.log("");

let delay = 0;
for (const bc of BOTS_CONFIG) {
  setTimeout(() => spawnBot(bc), delay);
  delay += 3000;
}

process.on("uncaughtException", (err) => {
  console.error("\x1b[31m[UNCAUGHT]", err.message, "\x1b[0m");
});
process.on("unhandledRejection", (err) => {
  console.error("\x1b[31m[UNHANDLED]", err?.message || err, "\x1b[0m");
});

process.on("SIGINT", () => {
  console.log("\n[TwoBot] Shutting down…");
  intentionalQuit = true;
  for (const bot of Object.values(bots)) {
    bot._buildAI?.stop();
    try {
      bot.quit();
    } catch {}
  }
  process.exit(0);
});
