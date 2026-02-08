/**
 * One Bot Mode — a single bot focused on building an EPIC house in creative.
 *
 * Usage:
 *   npm run one
 *
 * Chat commands (say in-game):
 *   go          — Start building the epic house
 *   items       — Give the bot building materials
 *   stop        — Pause building
 *   resume      — Resume building
 *   status      — Check building progress
 *   rebuild     — Reset progress and start over
 *   quit        — Disconnect the bot
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
const BOT_NAME = process.env.ONE_BOT_NAME || "Builder";

const RECONNECT_DELAY = 5000;

// ── Persistent State (survives reconnects) ──────────────────────────────

const buildState = {
  blueprint: null,
  buildIndex: 0,
  plotOrigin: null, // { x, y, z }
  initialized: false,
};

let bot = null;
let building = false;
let challengeActive = false;
let intentionalQuit = false;
let chatInterval = null;

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
    "Let's build something EPIC!",
    "I already have the blueprint in my head!",
    "Time to show off my architecture skills!",
    "Stand back, this is gonna be legendary!",
  ],
  building: [
    "This is looking SO good.",
    "Check out this wall! Perfect.",
    "Interior design time!",
    "Hmm, maybe a window here...",
    "Roof time! The hardest part...",
    "Almost done with this section!",
    "*places blocks furiously*",
    "Yeah, this is a masterpiece.",
    "Every block in its perfect place...",
    "The details make the house!",
  ],
  finished: [
    "Done! Come check it out!",
    "I present to you... my MASTERPIECE!",
    "That's a house right there. You're welcome.",
    "Move-in ready! Best house ever!",
    "EPIC HOUSE COMPLETE! Nailed it!",
  ],
  items_received: [
    "Ooh, building materials! Thanks!",
    "More blocks! Let's gooo!",
    "Perfect, I needed more stuff!",
  ],
  resumed: [
    "I'm back! Let me keep building!",
    "Back on the job! Where was I...",
    "Reconnected — picking up where I left off!",
  ],
};

// ═══════════════════════════════════════════════════════════════════════
//  EPIC HOUSE BLUEPRINT
// ═══════════════════════════════════════════════════════════════════════

function generateEpicHouse() {
  const blocks = [];
  const W = 13,
    D = 13,
    H = 6;

  // ── Foundation (stone_bricks) ──────────────────────────────────────
  for (let x = -1; x <= W; x++)
    for (let z = -1; z <= D; z++)
      blocks.push({ offset: [x, -1, z], block: "stone_bricks" });

  // ── Floor (oak_planks interior, stone_bricks border) ──────────────
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) {
      const border = x === 0 || x === W - 1 || z === 0 || z === D - 1;
      blocks.push({
        offset: [x, 0, z],
        block: border ? "smooth_stone" : "oak_planks",
      });
    }

  // ── Corner pillars (oak_log, full height + 1) ─────────────────────
  for (const cx of [0, W - 1])
    for (const cz of [0, D - 1])
      for (let y = 1; y <= H + 1; y++)
        blocks.push({ offset: [cx, y, cz], block: "oak_log" });

  // ── Mid pillars on long walls ─────────────────────────────────────
  const midX = Math.floor(W / 2);
  const midZ = Math.floor(D / 2);
  for (const cz of [0, D - 1])
    for (let y = 1; y <= H; y++)
      blocks.push({ offset: [midX, y, cz], block: "stripped_oak_log" });
  for (const cx of [0, W - 1])
    for (let y = 1; y <= H; y++)
      blocks.push({ offset: [cx, y, midZ], block: "stripped_oak_log" });

  // ── Walls ─────────────────────────────────────────────────────────
  const doorX = midX;
  for (let y = 1; y <= H; y++) {
    const mat = y <= 2 ? "stone_bricks" : "oak_planks";

    // Front wall (z = 0)
    for (let x = 1; x < W - 1; x++) {
      if (x === midX) continue; // mid pillar already placed
      if (x === doorX && y <= 2) continue; // door opening
      if (x === doorX - 1 && y <= 2) continue; // wider door
      if (y === 3 && (x === 3 || x === W - 4)) {
        blocks.push({ offset: [x, y, 0], block: "glass_pane" });
        continue;
      }
      if (y === 4 && (x === 3 || x === W - 4)) {
        blocks.push({ offset: [x, y, 0], block: "glass_pane" });
        continue;
      }
      blocks.push({ offset: [x, y, 0], block: mat });
    }

    // Back wall (z = D-1)
    for (let x = 1; x < W - 1; x++) {
      if (x === midX) continue;
      if (y === 3 && (x === 3 || x === W - 4)) {
        blocks.push({ offset: [x, y, D - 1], block: "glass_pane" });
        continue;
      }
      if (y === 4 && (x === 3 || x === W - 4)) {
        blocks.push({ offset: [x, y, D - 1], block: "glass_pane" });
        continue;
      }
      blocks.push({ offset: [x, y, D - 1], block: mat });
    }

    // Left wall (x = 0)
    for (let z = 1; z < D - 1; z++) {
      if (z === midZ) continue;
      if (y === 3 && (z === 3 || z === D - 4)) {
        blocks.push({ offset: [0, y, z], block: "glass_pane" });
        continue;
      }
      if (y === 4 && (z === 3 || z === D - 4)) {
        blocks.push({ offset: [0, y, z], block: "glass_pane" });
        continue;
      }
      blocks.push({ offset: [0, y, z], block: mat });
    }

    // Right wall (x = W-1)
    for (let z = 1; z < D - 1; z++) {
      if (z === midZ) continue;
      if (y === 3 && (z === 3 || z === D - 4)) {
        blocks.push({ offset: [W - 1, y, z], block: "glass_pane" });
        continue;
      }
      if (y === 4 && (z === 3 || z === D - 4)) {
        blocks.push({ offset: [W - 1, y, z], block: "glass_pane" });
        continue;
      }
      blocks.push({ offset: [W - 1, y, z], block: mat });
    }
  }

  // ── Peaked Roof ───────────────────────────────────────────────────
  for (let layer = 0; layer <= Math.floor(W / 2); layer++) {
    for (let z = -1; z <= D; z++) {
      if (layer < Math.floor(W / 2)) {
        blocks.push({ offset: [layer, H + 1 + layer, z], block: "oak_stairs" });
        blocks.push({
          offset: [W - 1 - layer, H + 1 + layer, z],
          block: "oak_stairs",
        });
      } else {
        // Ridge cap
        blocks.push({ offset: [layer, H + 1 + layer, z], block: "oak_log" });
      }
    }
  }

  // ── Gable ends (front & back triangles) ───────────────────────────
  for (let layer = 1; layer <= Math.floor(W / 2) - 1; layer++) {
    for (let x = layer; x < W - layer; x++) {
      blocks.push({ offset: [x, H + 1 + layer, 0], block: "oak_planks" });
      blocks.push({ offset: [x, H + 1 + layer, D - 1], block: "oak_planks" });
    }
  }

  // ── Front Porch ───────────────────────────────────────────────────
  for (let x = doorX - 3; x <= doorX + 2; x++) {
    blocks.push({ offset: [x, 0, -1], block: "oak_planks" });
    blocks.push({ offset: [x, 0, -2], block: "oak_planks" });
    blocks.push({ offset: [x, 0, -3], block: "oak_planks" });
  }
  // Porch pillars
  for (const px of [doorX - 3, doorX + 2]) {
    blocks.push({ offset: [px, 1, -3], block: "oak_fence" });
    blocks.push({ offset: [px, 2, -3], block: "oak_fence" });
    blocks.push({ offset: [px, 3, -3], block: "lantern" });
  }
  // Porch roof
  for (let x = doorX - 3; x <= doorX + 2; x++) {
    blocks.push({ offset: [x, 3, -1], block: "oak_slab" });
    blocks.push({ offset: [x, 3, -2], block: "oak_slab" });
    blocks.push({ offset: [x, 3, -3], block: "oak_slab" });
  }
  // Porch railing
  for (let x = doorX - 2; x <= doorX + 1; x++) {
    blocks.push({ offset: [x, 1, -3], block: "oak_fence" });
  }

  // ── Interior Walls (divide into 2 rooms) ──────────────────────────
  const divZ = Math.floor(D / 2);
  for (let x = 1; x < W - 1; x++) {
    for (let y = 1; y <= H - 1; y++) {
      // Leave a 2-wide doorway in the middle
      if (x === midX || x === midX - 1) continue;
      blocks.push({ offset: [x, y, divZ], block: "oak_planks" });
    }
  }

  // ── Interior — Front Room (living area) ───────────────────────────
  blocks.push({ offset: [1, 1, 1], block: "crafting_table" });
  blocks.push({ offset: [2, 1, 1], block: "furnace" });
  blocks.push({ offset: [3, 1, 1], block: "furnace" });
  blocks.push({ offset: [W - 2, 1, 1], block: "chest" });
  blocks.push({ offset: [W - 3, 1, 1], block: "chest" });
  blocks.push({ offset: [W - 4, 1, 1], block: "chest" });
  // Bookshelves along side wall
  for (let z = 2; z < divZ - 1; z++) {
    blocks.push({ offset: [1, 1, z], block: "bookshelf" });
    blocks.push({ offset: [1, 2, z], block: "bookshelf" });
  }
  // Carpet in the center
  for (let x = 3; x < W - 3; x++)
    for (let z = 2; z < divZ - 1; z++)
      blocks.push({ offset: [x, 1, z], block: "carpet" });

  // Lighting — lanterns
  blocks.push({ offset: [midX, 1, 2], block: "lantern" });
  blocks.push({ offset: [midX, 1, divZ - 2], block: "lantern" });

  // ── Interior — Back Room (bedroom) ────────────────────────────────
  blocks.push({ offset: [W - 2, 1, D - 2], block: "red_bed" });
  blocks.push({ offset: [W - 3, 1, D - 2], block: "red_bed" });
  blocks.push({ offset: [1, 1, D - 2], block: "chest" });
  blocks.push({ offset: [2, 1, D - 2], block: "chest" });
  // Carpet bedroom
  for (let x = 3; x < W - 3; x++)
    for (let z = divZ + 1; z < D - 2; z++)
      blocks.push({ offset: [x, 1, z], block: "carpet" });

  // Lighting
  blocks.push({ offset: [midX, 1, divZ + 2], block: "lantern" });
  blocks.push({ offset: [midX, 1, D - 3], block: "lantern" });

  // ── Torches on walls (interior) ───────────────────────────────────
  blocks.push({ offset: [1, 3, midZ - 2], block: "torch" });
  blocks.push({ offset: [W - 2, 3, midZ - 2], block: "torch" });
  blocks.push({ offset: [1, 3, midZ + 2], block: "torch" });
  blocks.push({ offset: [W - 2, 3, midZ + 2], block: "torch" });
  blocks.push({ offset: [midX, 3, 1], block: "torch" });
  blocks.push({ offset: [midX, 3, D - 2], block: "torch" });

  // ── Flower pots outside ───────────────────────────────────────────
  blocks.push({ offset: [1, 1, -1], block: "flower_pot" });
  blocks.push({ offset: [W - 2, 1, -1], block: "flower_pot" });

  return blocks;
}

// ═══════════════════════════════════════════════════════════════════════
//  BLOCK PLACEMENT — physically walks to each block, /setblock fallback
// ═══════════════════════════════════════════════════════════════════════

async function placeBlockAt(b, targetPos, blockName) {
  // Give ourselves the block in creative
  try {
    b.chat(`/give ${b.username} ${blockName} 1`);
    await new Promise((r) => setTimeout(r, 60));
  } catch {}

  // Equip
  try {
    const item = b.inventory.items().find((it) => it.name === blockName);
    if (item) await b.equip(item, "hand");
  } catch {}

  // Find adjacent solid block
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

  // Teleport close if needed
  const dist = b.entity.position.distanceTo(targetPos);
  if (dist > 4.5) {
    try {
      const flyTarget = targetPos.offset(0, 0.5, -2);
      b.chat(
        `/tp ${b.username} ${flyTarget.x.toFixed(1)} ${flyTarget.y.toFixed(1)} ${flyTarget.z.toFixed(1)}`,
      );
      await new Promise((r) => setTimeout(r, 100));
    } catch {}
  }

  // Try physical placement
  if (refBlock && faceVec) {
    try {
      await b.lookAt(targetPos.offset(0.5, 0.5, 0.5));
      await new Promise((r) => setTimeout(r, 30));
      await b.placeBlock(refBlock, faceVec);
      return true;
    } catch {}
  }

  // Fallback: /setblock
  try {
    b.chat(
      `/setblock ${Math.floor(targetPos.x)} ${Math.floor(targetPos.y)} ${Math.floor(targetPos.z)} ${blockName}`,
    );
  } catch {}
  return false;
}

// ═══════════════════════════════════════════════════════════════════════
//  BUILD AI
// ═══════════════════════════════════════════════════════════════════════

function findSurfaceY(b, x, z) {
  // Scan from high to low to find the highest solid block with air above
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
      // Make sure the next block up is also air (2-high clearance)
      const above2 = b.blockAt(vec3(x, y + 2, z));
      if (above2 && (above2.name === "air" || above2.name === "cave_air")) {
        return y + 1; // build ON TOP of this block
      }
    }
  }
  // Fallback to bot position
  return b.entity.position.floored().y;
}

function setupBuildAI(b) {
  b._buildAI = {
    start() {
      if (!b.entity) return;

      // Initialize blueprint + origin once (first time or fresh rebuild)
      if (!buildState.initialized) {
        const spawn = b.entity.position.floored();
        const buildX = spawn.x + 5;
        const buildZ = spawn.z + 5;
        const surfaceY = findSurfaceY(b, buildX, buildZ);
        buildState.plotOrigin = { x: buildX, y: surfaceY, z: buildZ };
        buildState.blueprint = generateEpicHouse();
        buildState.buildIndex = 0;
        buildState.initialized = true;
        console.log(
          `[Build] Blueprint: ${buildState.blueprint.length} blocks, surface Y=${surfaceY}, origin: (${buildState.plotOrigin.x}, ${buildState.plotOrigin.y}, ${buildState.plotOrigin.z})`,
        );
      }

      building = true;
      b.chat(pick(CHAT.start));

      // Creative mode
      setTimeout(() => {
        try {
          b.chat(`/gamemode creative ${b.username}`);
        } catch {}
      }, 500);

      this._runLoop();

      // Periodic chat
      chatInterval = setInterval(
        () => {
          if (!building || !challengeActive) return;
          if (Math.random() < 0.4) {
            b.chat(pick(CHAT.building));
          }
          if (Math.random() < 0.2) {
            const pct = buildState.blueprint
              ? Math.floor(
                  (buildState.buildIndex / buildState.blueprint.length) * 100,
                )
              : 0;
            b.chat(`Progress: ${pct}%`);
          }
        },
        25000 + Math.random() * 15000,
      );
    },

    async _runLoop() {
      while (
        building &&
        challengeActive &&
        buildState.buildIndex < buildState.blueprint.length
      ) {
        const step = buildState.blueprint[buildState.buildIndex];
        buildState.buildIndex++;

        if (step.block === "air") continue;

        const o = buildState.plotOrigin;
        const [dx, dy, dz] = step.offset;
        const targetPos = vec3(o.x + dx, o.y + dy, o.z + dz);

        try {
          await placeBlockAt(b, targetPos, step.block);
        } catch (err) {
          // If disconnected, stop loop
          if (!b.entity) {
            building = false;
            return;
          }
        }

        // Delay between blocks — fast but not instant
        await new Promise((r) => setTimeout(r, 150 + Math.random() * 200));

        if (!building || !challengeActive) return;
      }

      // Finished
      if (
        buildState.buildIndex >= buildState.blueprint.length &&
        challengeActive &&
        building
      ) {
        b.chat(pick(CHAT.finished));
        building = false;
      }
    },

    pause() {
      building = false;
      b.chat("Pausing build...");
    },

    resume() {
      if (!challengeActive) {
        b.chat('Say "go" first to start!');
        return;
      }
      building = true;
      b.chat("Back to building!");
      this._runLoop();
    },

    stop() {
      building = false;
      if (chatInterval) {
        clearInterval(chatInterval);
        chatInterval = null;
      }
    },

    reset() {
      this.stop();
      buildState.blueprint = null;
      buildState.buildIndex = 0;
      buildState.plotOrigin = null;
      buildState.initialized = false;
      challengeActive = false;
      b.chat('Build progress reset! Say "go" to start fresh.');
    },

    getProgress() {
      return {
        placed: buildState.buildIndex,
        total: buildState.blueprint?.length || 0,
        pct: buildState.blueprint?.length
          ? Math.floor(
              (buildState.buildIndex / buildState.blueprint.length) * 100,
            )
          : 0,
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
//  CHAT COMMANDS
// ═══════════════════════════════════════════════════════════════════════

function setupChatHandler(b) {
  b.on("chat", (username, message) => {
    if (username === b.username) return;

    const msg = message.trim().toLowerCase();

    if (msg === "go") {
      if (challengeActive && building) {
        b.chat('Already building! Say "status" to check progress.');
        return;
      }
      challengeActive = true;
      b.chat("=== EPIC HOUSE BUILD — LET'S GO! ===");
      b._buildAI?.start();
      return;
    }

    if (msg === "items") {
      giveItems(b);
      return;
    }

    if (msg === "stop") {
      b._buildAI?.pause();
      return;
    }

    if (msg === "resume") {
      b._buildAI?.resume();
      return;
    }

    if (msg === "status") {
      if (!b._buildAI) {
        b.chat("Not set up yet.");
        return;
      }
      const p = b._buildAI.getProgress();
      b.chat(`Build: ${p.pct}% done (${p.placed}/${p.total} blocks)`);
      if (buildState.plotOrigin) {
        b.chat(
          `Plot: (${buildState.plotOrigin.x}, ${buildState.plotOrigin.y}, ${buildState.plotOrigin.z})`,
        );
      }
      return;
    }

    if (msg === "rebuild") {
      b._buildAI?.reset();
      return;
    }

    if (msg === "quit") {
      intentionalQuit = true;
      b._buildAI?.stop();
      try {
        b.quit();
      } catch {}
      setTimeout(() => process.exit(0), 1000);
      return;
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  BOT SPAWNING + AUTO-RECONNECT
// ═══════════════════════════════════════════════════════════════════════

function spawnBot() {
  console.log(
    `[OneBot] Connecting ${BOT_NAME} → ${HOST}:${PORT} (v${VERSION})`,
  );

  const b = mineflayer.createBot({
    username: BOT_NAME,
    host: HOST,
    port: PORT,
    version: VERSION,
    checkTimeoutInterval: 300_000,
  });

  b.loadPlugin(pathfinder);

  b.once("spawn", () => {
    console.log(`\x1b[32m[SPAWN] ${BOT_NAME} joined!\x1b[0m`);

    const defaultMove = new Movements(b);
    defaultMove.canDig = false;
    defaultMove.allow1by1towers = true;
    defaultMove.allowFreeMotion = true;
    b.pathfinder.setMovements(defaultMove);

    bot = b;

    // Set creative mode
    setTimeout(() => {
      try {
        b.chat(`/gamemode creative ${b.username}`);
      } catch {}
    }, 800);

    b.chat(
      pick([
        `${BOT_NAME} ready to build! Say "go" to start!`,
        `Builder bot online! Say "go" when ready!`,
        `I was born to build. Say "go"!`,
      ]),
    );

    // Set up systems
    setupChatHandler(b);
    setupBuildAI(b);

    // AUTO-RESUME: if we were building before disconnect, pick up where we left off
    if (challengeActive && buildState.initialized) {
      const pct = buildState.blueprint
        ? Math.floor(
            (buildState.buildIndex / buildState.blueprint.length) * 100,
          )
        : 0;
      console.log(
        `\x1b[33m[REJOIN] Resuming build at ${pct}% (block ${buildState.buildIndex})\x1b[0m`,
      );
      setTimeout(() => {
        b.chat(pick(CHAT.resumed));
        b.chat(`Picking up at ${pct}%...`);
        b._buildAI?.start();
      }, 2000);
    }
  });

  b.on("kicked", (reason) => {
    console.log(`\x1b[31m[KICKED] ${reason}\x1b[0m`);
  });

  b.on("error", (err) => {
    console.error(`\x1b[31m[ERROR] ${err.message}\x1b[0m`);
  });

  b.on("end", () => {
    console.log(`\x1b[33m[DISCONNECTED] ${BOT_NAME}\x1b[0m`);
    building = false;
    if (chatInterval) {
      clearInterval(chatInterval);
      chatInterval = null;
    }

    if (!intentionalQuit) {
      console.log(`[OneBot] Reconnecting in ${RECONNECT_DELAY / 1000}s…`);
      setTimeout(() => {
        if (intentionalQuit) return;
        spawnBot();
      }, RECONNECT_DELAY);
    }
  });

  return b;
}

// ═══════════════════════════════════════════════════════════════════════
//  LAUNCH
// ═══════════════════════════════════════════════════════════════════════

console.log("==========================================================");
console.log("       MINEFLAYER ONE BOT — EPIC HOUSE BUILDER");
console.log("==========================================================");
console.log("");
console.log(`  Bot:    ${BOT_NAME}`);
console.log(`  Server: ${HOST}:${PORT} (v${VERSION})`);
console.log(`  Mode:   Creative — auto-reconnect enabled`);
console.log("");
console.log("  In-game commands:");
console.log('    "go"          - Start building the epic house');
console.log('    "items"       - Give building materials');
console.log('    "stop"        - Pause building');
console.log('    "resume"      - Resume building');
console.log('    "status"      - Building progress');
console.log('    "rebuild"     - Reset and start over');
console.log('    "quit"        - Disconnect bot');
console.log("==========================================================");
console.log("");

spawnBot();

// Global error handlers
process.on("uncaughtException", (err) => {
  console.error("\x1b[31m[UNCAUGHT]", err.message, "\x1b[0m");
});
process.on("unhandledRejection", (err) => {
  console.error("\x1b[31m[UNHANDLED]", err?.message || err, "\x1b[0m");
});

process.on("SIGINT", () => {
  console.log("\n[OneBot] Shutting down…");
  intentionalQuit = true;
  if (bot) {
    bot._buildAI?.stop();
    try {
      bot.quit();
    } catch {}
  }
  process.exit(0);
});
