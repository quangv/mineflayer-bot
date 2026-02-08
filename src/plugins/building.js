/**
 * Building plugin — construct shelters, houses, and structures.
 */

import mcDataLoader from "minecraft-data";
import Vec3 from "vec3";

export function setupBuilding(bot) {
  const mcData = mcDataLoader(bot.version);

  /**
   * Build a simple survival house (5×5 base, 4 high, with door, torch, bed, chest, crafting table).
   */
  bot.friendlyBot.buildHouse = async () => {
    bot.friendlyBot.busy = true;
    bot.chat("I'll build us a house! Gathering materials first…");

    try {
      // ── Step 1: Gather materials ─────────────────────────────────
      const fb = bot.friendlyBot;

      // Need ~64 blocks for walls/floor/roof, some logs for planks
      const logTypes = [
        "oak_log",
        "birch_log",
        "spruce_log",
        "dark_oak_log",
        "acacia_log",
        "jungle_log",
      ];

      // Gather logs if we don't have enough planks
      const totalPlanks = bot.inventory
        .items()
        .filter((i) => i.name.endsWith("_planks"))
        .reduce((s, i) => s + i.count, 0);

      if (totalPlanks < 80) {
        bot.chat("Chopping wood for the house…");
        for (const log of logTypes) {
          const have = fb.countItem(log);
          if (have < 20) {
            await fb.mineBlock(log, 24 - have).catch(() => {});
          }
          if (fb.countItem(log) >= 16) break;
        }

        // Convert logs to planks
        for (const log of logTypes) {
          const count = fb.countItem(log);
          if (count > 0) {
            const plankName = log.replace("_log", "_planks");
            await fb.craftItem(plankName, Math.floor(count)).catch(() => {});
          }
        }
      }

      // Craft door if we don't have one
      if (
        !fb.hasItem("oak_door") &&
        !fb.hasItem("spruce_door") &&
        !fb.hasItem("birch_door") &&
        !fb.hasItem("dark_oak_door")
      ) {
        await fb.craftItem("oak_door", 1).catch(() => {});
      }

      // Craft crafting table if needed
      if (!fb.hasItem("crafting_table")) {
        await fb.craftItem("crafting_table", 1).catch(() => {});
      }

      // Craft chest
      if (!fb.hasItem("chest")) {
        await fb.craftItem("chest", 1).catch(() => {});
      }

      // Get the plank type we have
      const plankItem = bot.inventory
        .items()
        .find((i) => i.name.endsWith("_planks"));
      if (!plankItem || plankItem.count < 30) {
        bot.chat("I don't have enough planks to build. Need more wood!");
        return false;
      }
      const PLANK = plankItem.name;

      // ── Step 2: Find a flat area ─────────────────────────────────
      bot.chat("Finding a good spot to build…");
      const basePos = await findFlatArea(5, 5);
      if (!basePos) {
        bot.chat("Can't find a flat area nearby! I'll build right here.");
      }
      const origin = basePos || bot.entity.position.floored().offset(2, 0, 0);

      // ── Step 3: Build the house ──────────────────────────────────
      bot.chat("Building the house! Stand back…");

      // Clear the build area
      await clearArea(origin, 7, 5, 7);

      // Floor (5×5)
      bot.chat("Laying the floor…");
      for (let x = 0; x < 5; x++) {
        for (let z = 0; z < 5; z++) {
          await placeBlockAt(origin.offset(x, -1, z), PLANK);
        }
      }

      // Walls (4 high, skip door spot at front-center)
      bot.chat("Building walls…");
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 5; x++) {
          for (let z = 0; z < 5; z++) {
            // Only walls (edges)
            if (x > 0 && x < 4 && z > 0 && z < 4) continue;

            // Door opening: front wall (z=0), center (x=2), bottom 2 blocks
            if (z === 0 && x === 2 && y < 2) continue;

            // Windows: leave holes at y=2 on each wall center
            if (y === 2) {
              if ((z === 0 || z === 4) && x === 2) continue; // front/back window
              if ((x === 0 || x === 4) && z === 2) continue; // side windows
            }

            await placeBlockAt(origin.offset(x, y, z), PLANK);
          }
        }
      }

      // Roof (flat for simplicity)
      bot.chat("Adding the roof…");
      for (let x = 0; x < 5; x++) {
        for (let z = 0; z < 5; z++) {
          await placeBlockAt(origin.offset(x, 4, z), PLANK);
        }
      }

      // ── Step 4: Place furnishings ────────────────────────────────
      bot.chat("Decorating the interior…");

      // Place door
      const doorItem = bot.inventory
        .items()
        .find((i) => i.name.endsWith("_door"));
      if (doorItem) {
        await placeItemAt(origin.offset(2, 0, 0), doorItem.name);
      }

      // Place crafting table
      if (fb.hasItem("crafting_table")) {
        await placeItemAt(origin.offset(1, 0, 1), "crafting_table");
      }

      // Place chest
      if (fb.hasItem("chest")) {
        await placeItemAt(origin.offset(3, 0, 1), "chest");
      }

      // Place furnace if we have one
      if (fb.hasItem("furnace")) {
        await placeItemAt(origin.offset(1, 0, 3), "furnace");
      }

      // Place torches for light
      if (fb.hasItem("torch")) {
        await placeItemAt(origin.offset(2, 2, 2), "torch");
      }

      // Place bed if we have one
      const bedItem = bot.inventory
        .items()
        .find((i) => i.name.endsWith("_bed"));
      if (bedItem) {
        await placeItemAt(origin.offset(3, 0, 3), bedItem.name);
      }

      bot.chat("House is done! Home sweet home!");
      return true;
    } catch (err) {
      console.log(`[Building] Error: ${err.message}`);
      bot.chat("Had some trouble building, but I did my best!");
      return false;
    } finally {
      bot.friendlyBot.busy = false;
    }
  };

  /**
   * Build a simple wall/fence around the player for quick defense.
   */
  bot.friendlyBot.buildShelter = async () => {
    bot.friendlyBot.busy = true;
    bot.chat("Building a quick shelter!");

    try {
      const plankItem = bot.inventory
        .items()
        .find((i) => i.name.endsWith("_planks"));
      if (!plankItem || plankItem.count < 12) {
        bot.chat("Need at least 12 planks for a shelter!");
        return false;
      }
      const PLANK = plankItem.name;
      const origin = bot.entity.position.floored().offset(-1, 0, -1);

      // 3×3 walls, 2 high, open top
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 3; x++) {
          for (let z = 0; z < 3; z++) {
            if (x > 0 && x < 2 && z > 0 && z < 2) continue;
            if (x === 1 && z === 0 && y === 0) continue; // door opening
            await placeBlockAt(origin.offset(x, y, z), PLANK);
          }
        }
      }
      // Roof
      for (let x = 0; x < 3; x++) {
        for (let z = 0; z < 3; z++) {
          await placeBlockAt(origin.offset(x, 2, z), PLANK);
        }
      }

      bot.chat("Quick shelter done! We're safe-ish.");
      return true;
    } catch (err) {
      console.log(`[Building] Shelter error: ${err.message}`);
      bot.chat("Couldn't finish the shelter.");
      return false;
    } finally {
      bot.friendlyBot.busy = false;
    }
  };

  // ── Helper functions ──────────────────────────────────────────────

  /** Find a relatively flat area nearby. */
  async function findFlatArea(width, depth) {
    const searchRadius = 20;
    const pos = bot.entity.position.floored();

    for (let dx = 2; dx < searchRadius; dx += 3) {
      for (let dz = 2; dz < searchRadius; dz += 3) {
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

  /** Find the Y coordinate of the ground at a given x, z. */
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

  /** Clear an area by digging blocks. */
  async function clearArea(origin, width, height, depth) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        for (let z = 0; z < depth; z++) {
          const pos = origin.offset(x, y, z);
          const block = bot.blockAt(pos);
          if (block && block.name !== "air" && bot.canDigBlock(block)) {
            try {
              await bot.tool.equipForBlock(block);
              await bot.dig(block);
            } catch {
              /* skip */
            }
          }
        }
      }
    }
  }

  /** Place a block at a specific position. */
  async function placeBlockAt(targetPos, blockName) {
    const item = bot.inventory.items().find((i) => i.name === blockName);
    if (!item) return false;

    try {
      // Find an adjacent solid block to place against
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
          // Navigate close enough
          const dist = bot.entity.position.distanceTo(targetPos);
          if (dist > 4.5) {
            try {
              await bot.friendlyBot.goTo(targetPos, 3);
            } catch {
              /* */
            }
          }

          await bot.equip(item, "hand");
          const faceVector = new Vec3(-ox, -oy, -oz);
          await bot.placeBlock(refBlock, faceVector);
          return true;
        }
      }
    } catch (err) {
      // Placement can fail for many reasons — just skip
      console.log(`[Building] Place failed at ${targetPos}: ${err.message}`);
    }
    return false;
  }

  /** Place a specific item (furniture) at a position. */
  async function placeItemAt(targetPos, itemName) {
    const item = bot.inventory.items().find((i) => i.name === itemName);
    if (!item) return false;

    try {
      const dist = bot.entity.position.distanceTo(targetPos);
      if (dist > 4) {
        try {
          await bot.friendlyBot.goTo(targetPos, 2);
        } catch {
          /* */
        }
      }

      // Place on top of the block below
      const below = bot.blockAt(targetPos.offset(0, -1, 0));
      if (below && below.boundingBox === "block") {
        await bot.equip(item, "hand");
        await bot.placeBlock(below, new Vec3(0, 1, 0));
        return true;
      }
    } catch (err) {
      console.log(`[Building] Furnish failed ${itemName}: ${err.message}`);
    }
    return false;
  }

  console.log("[Building] Ready.");

  // ═════════════════════════════════════════════════════════════════
  //  EPIC HOUSE — a large, detailed build the bot physically places
  // ═════════════════════════════════════════════════════════════════

  bot.friendlyBot.buildEpicHouse = async () => {
    bot.friendlyBot.busy = true;
    bot.chat("Time to build an EPIC house! This is gonna be awesome!");

    try {
      // ── Gather materials ────────────────────────────────────────
      const fb = bot.friendlyBot;
      const logTypes = [
        "oak_log", "birch_log", "spruce_log",
        "dark_oak_log", "acacia_log", "jungle_log",
      ];

      const totalPlanks = bot.inventory
        .items()
        .filter((i) => i.name.endsWith("_planks"))
        .reduce((s, i) => s + i.count, 0);

      if (totalPlanks < 200) {
        bot.chat("Going to need a LOT of wood for this one...");
        for (const log of logTypes) {
          if (fb.countItem(log) < 48) {
            await fb.mineBlock(log, 48 - fb.countItem(log)).catch(() => {});
          }
          // Convert to planks
          const count = fb.countItem(log);
          if (count > 0) {
            const plankName = log.replace("_log", "_planks");
            await fb.craftItem(plankName, Math.floor(count)).catch(() => {});
          }
          const currentPlanks = bot.inventory
            .items()
            .filter((i) => i.name.endsWith("_planks"))
            .reduce((s, i) => s + i.count, 0);
          if (currentPlanks >= 200) break;
        }
      }

      // Also need cobblestone for the foundation
      if (fb.countItem("cobblestone") < 80) {
        bot.chat("Mining some stone for the foundation...");
        await fb.mineBlock("stone", 80 - fb.countItem("cobblestone")).catch(() => {});
      }

      // Craft extras
      if (!fb.hasItem("crafting_table"))
        await fb.craftItem("crafting_table", 1).catch(() => {});
      if (!fb.hasItem("oak_door") && !fb.hasItem("spruce_door"))
        await fb.craftItem("oak_door", 1).catch(() => {});
      if (!fb.hasItem("chest"))
        await fb.craftItem("chest", 2).catch(() => {});
      if (!fb.hasItem("furnace"))
        await fb.craftItem("furnace", 1).catch(() => {});

      // Get available materials
      const plankItem = bot.inventory
        .items()
        .find((i) => i.name.endsWith("_planks"));
      if (!plankItem || plankItem.count < 50) {
        bot.chat("I don't have enough planks! Need way more wood.");
        bot.friendlyBot.busy = false;
        return false;
      }
      const PLANK = plankItem.name;
      const STONE = fb.hasItem("cobblestone") ? "cobblestone" : PLANK;
      const logItem = bot.inventory.items().find((i) => i.name.endsWith("_log"));
      const LOG = logItem ? logItem.name : PLANK;
      const stripped = LOG.replace("_log", "_planks");

      // ── Find build spot ────────────────────────────────────────
      bot.chat("Finding the perfect spot...");
      const basePos = await findFlatArea(11, 11);
      const origin = basePos || bot.entity.position.floored().offset(3, 0, 3);

      bot.chat("Breaking ground! Here we go!");
      await clearArea(origin.offset(-1, 0, -1), 13, 12, 13);

      const W = 11, D = 11, H = 5;

      // ── Foundation ─────────────────────────────────────────────
      bot.chat("Laying the stone foundation...");
      for (let x = 0; x < W; x++) {
        for (let z = 0; z < D; z++) {
          await placeBlockAt(origin.offset(x, -1, z), STONE);
        }
      }

      // ── Floor ──────────────────────────────────────────────────
      bot.chat("Flooring... nice and smooth!");
      for (let x = 1; x < W - 1; x++) {
        for (let z = 1; z < D - 1; z++) {
          await placeBlockAt(origin.offset(x, 0, z), PLANK);
        }
      }

      // ── Walls ──────────────────────────────────────────────────
      bot.chat("Raising the walls! This is the hard part...");

      // Corner pillars — logs
      for (const cx of [0, W - 1]) {
        for (const cz of [0, D - 1]) {
          for (let y = 0; y <= H; y++) {
            await placeBlockAt(origin.offset(cx, y, cz), LOG);
          }
        }
      }

      // Walls — stone bottom 2, planks upper
      for (let y = 0; y < H; y++) {
        const mat = y < 2 ? STONE : PLANK;
        // Front & back walls
        for (let x = 1; x < W - 1; x++) {
          // Front wall: door hole at center
          const doorX = Math.floor(W / 2);
          if (x === doorX && y < 2) {
            // door opening — skip
          } else if (y === 3 && (x === 2 || x === W - 3)) {
            // windows — skip for now, place glass later if available
          } else {
            await placeBlockAt(origin.offset(x, y, 0), mat);
          }
          // Back wall
          if (y === 3 && (x === 2 || x === W - 3)) {
            // back windows — skip
          } else {
            await placeBlockAt(origin.offset(x, y, D - 1), mat);
          }
        }
        // Side walls
        for (let z = 1; z < D - 1; z++) {
          if (y === 3 && (z === 3 || z === D - 4)) {
            // side windows
          } else {
            await placeBlockAt(origin.offset(0, y, z), mat);
          }
          if (y === 3 && (z === 3 || z === D - 4)) {
            // side windows
          } else {
            await placeBlockAt(origin.offset(W - 1, y, z), mat);
          }
        }
      }

      // ── Roof ───────────────────────────────────────────────────
      bot.chat("Putting on the roof!");
      // Peaked roof
      for (let layer = 0; layer <= Math.floor(W / 2); layer++) {
        for (let z = -1; z <= D; z++) {
          if (layer < Math.floor(W / 2)) {
            await placeBlockAt(origin.offset(layer, H + layer, z), PLANK);
            await placeBlockAt(origin.offset(W - 1 - layer, H + layer, z), PLANK);
          } else {
            // Ridge cap
            await placeBlockAt(origin.offset(layer, H + layer, z), LOG);
          }
        }
      }

      // ── Interior ───────────────────────────────────────────────
      bot.chat("Now for the fun part — interior design!");

      // Door
      const doorItem = bot.inventory
        .items()
        .find((i) => i.name.endsWith("_door"));
      if (doorItem) {
        await placeItemAt(origin.offset(Math.floor(W / 2), 0, 0), doorItem.name);
      }

      // Crafting table
      if (fb.hasItem("crafting_table")) {
        await placeItemAt(origin.offset(1, 0, 1), "crafting_table");
      }

      // Furnace
      if (fb.hasItem("furnace")) {
        await placeItemAt(origin.offset(2, 0, 1), "furnace");
      }

      // Chests
      if (fb.hasItem("chest")) {
        await placeItemAt(origin.offset(W - 2, 0, 1), "chest");
        if (fb.hasItem("chest"))
          await placeItemAt(origin.offset(W - 3, 0, 1), "chest");
      }

      // Bed
      const bedItem = bot.inventory
        .items()
        .find((i) => i.name.endsWith("_bed"));
      if (bedItem) {
        await placeItemAt(origin.offset(W - 2, 0, D - 2), bedItem.name);
      }

      // Torches for light
      if (fb.hasItem("torch")) {
        await placeItemAt(origin.offset(1, 2, Math.floor(D / 2)), "torch");
        if (fb.hasItem("torch"))
          await placeItemAt(origin.offset(W - 2, 2, Math.floor(D / 2)), "torch");
        if (fb.hasItem("torch"))
          await placeItemAt(origin.offset(Math.floor(W / 2), 2, 1), "torch");
        if (fb.hasItem("torch"))
          await placeItemAt(origin.offset(Math.floor(W / 2), 2, D - 2), "torch");
      }

      // ── Front porch ────────────────────────────────────────────
      bot.chat("Adding a front porch!");
      const doorX = Math.floor(W / 2);
      for (let x = doorX - 2; x <= doorX + 2; x++) {
        await placeBlockAt(origin.offset(x, -1, -1), STONE);
        await placeBlockAt(origin.offset(x, -1, -2), STONE);
      }
      // Porch fence posts
      await placeBlockAt(origin.offset(doorX - 2, 0, -2), LOG);
      await placeBlockAt(origin.offset(doorX + 2, 0, -2), LOG);
      await placeBlockAt(origin.offset(doorX - 2, 1, -2), LOG);
      await placeBlockAt(origin.offset(doorX + 2, 1, -2), LOG);
      // Porch roof
      for (let x = doorX - 2; x <= doorX + 2; x++) {
        await placeBlockAt(origin.offset(x, 2, -1), PLANK);
        await placeBlockAt(origin.offset(x, 2, -2), PLANK);
      }

      // Torch outside
      if (fb.hasItem("torch")) {
        await placeItemAt(origin.offset(doorX - 2, 2, -2), "torch");
        if (fb.hasItem("torch"))
          await placeItemAt(origin.offset(doorX + 2, 2, -2), "torch");
      }

      bot.chat("MY EPIC HOUSE IS COMPLETE! Come check it out!");
      return true;
    } catch (err) {
      console.log(`[Building] Epic house error: ${err.message}`);
      bot.chat("Had some trouble, but I built what I could!");
      return false;
    } finally {
      bot.friendlyBot.busy = false;
    }
  };
}
