/**
 * Progression phases — each phase is a step toward beating Minecraft.
 *
 * Phases:
 *  1. start        → Gather wood, make tools
 *  2. iron         → Mine stone & iron, craft iron gear
 *  3. diamond      → Mine diamonds, craft diamond gear
 *  4. nether_prep  → Get obsidian, flint & steel, gold, food, bow
 *  5. nether       → Enter Nether, blaze rods, barter ender pearls
 *  6. stronghold   → Craft eyes of ender, locate stronghold
 *  7. end          → Enter End, fight dragon
 */

import mcDataLoader from "minecraft-data";

const PHASES = [
  // ── Phase 1: Early Game ──────────────────────────────────────────
  {
    name: "start",
    label: "Gather wood and make basic tools",
    async execute(bot) {
      const fb = bot.friendlyBot;

      // Gather logs
      const logTypes = [
        "oak_log",
        "birch_log",
        "spruce_log",
        "dark_oak_log",
        "acacia_log",
        "jungle_log",
      ];
      const hasLogs = logTypes.some((l) => fb.hasItem(l, 8));
      if (!hasLogs) {
        for (const log of logTypes) {
          if (await fb.mineBlock(log, 16)) break;
        }
      }

      // Craft planks from whatever logs we have
      for (const log of logTypes) {
        const planks = log.replace("_log", "_planks");
        if (fb.countItem(log) >= 4) {
          await fb.craftItem(planks, 4);
        }
      }

      // Sticks, crafting table, basic tools
      if (!fb.hasItem("stick", 8)) await fb.craftItem("stick", 4);
      if (!fb.hasItem("crafting_table"))
        await fb.craftItem("crafting_table", 1);
      if (
        !fb.hasItem("wooden_pickaxe") &&
        !fb.hasItem("stone_pickaxe") &&
        !fb.hasItem("iron_pickaxe")
      )
        await fb.craftItem("wooden_pickaxe", 1);
      if (
        !fb.hasItem("wooden_sword") &&
        !fb.hasItem("stone_sword") &&
        !fb.hasItem("iron_sword")
      )
        await fb.craftItem("wooden_sword", 1);

      return true;
    },
  },

  // ── Phase 2: Stone & Iron ────────────────────────────────────────
  {
    name: "iron",
    label: "Get stone tools and mine iron",
    async execute(bot) {
      const fb = bot.friendlyBot;

      if (!fb.hasItem("cobblestone", 20)) await fb.mineBlock("stone", 24);
      if (!fb.hasItem("stone_pickaxe") && !fb.hasItem("iron_pickaxe"))
        await fb.craftItem("stone_pickaxe", 1);
      if (!fb.hasItem("stone_sword") && !fb.hasItem("iron_sword"))
        await fb.craftItem("stone_sword", 1);
      if (!fb.hasItem("furnace")) await fb.craftItem("furnace", 1);

      // Mine iron
      if (!fb.hasItem("iron_ingot", 16) && !fb.hasItem("raw_iron", 16)) {
        await fb.digDown(40);
        await fb.stripMine("iron_ore", 12);
        await fb.stripMine("deepslate_iron_ore", 6);
      }

      // Mine coal for smelting
      if (!fb.hasItem("coal", 8)) {
        await fb.stripMine("coal_ore", 8);
        await fb.stripMine("deepslate_coal_ore", 4);
      }

      // Smelt iron
      const rawIron = fb.countItem("raw_iron");
      if (rawIron > 0) await fb.smeltItem("raw_iron", "coal", rawIron);

      // Craft iron gear
      if (fb.hasItem("iron_ingot", 3)) await fb.craftItem("iron_pickaxe", 1);
      if (fb.hasItem("iron_ingot", 2)) await fb.craftItem("iron_sword", 1);
      if (fb.hasItem("iron_ingot", 8)) {
        await fb.craftItem("iron_chestplate", 1);
        // More iron for helmet, leggings, boots if we have enough
        if (fb.hasItem("iron_ingot", 5)) await fb.craftItem("iron_helmet", 1);
        if (fb.hasItem("iron_ingot", 7)) await fb.craftItem("iron_leggings", 1);
        if (fb.hasItem("iron_ingot", 4)) await fb.craftItem("iron_boots", 1);
      }
      if (fb.hasItem("iron_ingot", 1)) await fb.craftItem("shield", 1);
      if (fb.hasItem("iron_ingot", 3)) await fb.craftItem("bucket", 1);

      return fb.hasItem("iron_pickaxe");
    },
  },

  // ── Phase 3: Diamonds ────────────────────────────────────────────
  {
    name: "diamond",
    label: "Mine diamonds and upgrade gear",
    async execute(bot) {
      const fb = bot.friendlyBot;

      await fb.digDown(-50);

      if (!fb.hasItem("diamond", 5)) {
        await fb.stripMine("diamond_ore", 5);
        await fb.stripMine("deepslate_diamond_ore", 3);
      }

      if (!fb.hasItem("coal", 16)) {
        await fb.stripMine("coal_ore", 8);
        await fb.stripMine("deepslate_coal_ore", 8);
      }

      if (fb.hasItem("diamond", 3)) await fb.craftItem("diamond_pickaxe", 1);
      if (fb.hasItem("diamond", 2)) await fb.craftItem("diamond_sword", 1);
      if (fb.hasItem("diamond", 8)) await fb.craftItem("diamond_chestplate", 1);

      return fb.hasItem("diamond_pickaxe");
    },
  },

  // ── Phase 4: Nether Preparation ──────────────────────────────────
  {
    name: "nether_prep",
    label: "Prepare for the Nether",
    async execute(bot) {
      const fb = bot.friendlyBot;

      // Get obsidian
      if (!fb.hasItem("obsidian", 10)) {
        await fb.goToBlock("lava", 64);
        await fb.mineBlock("obsidian", 10);
      }

      // Flint and steel
      if (!fb.hasItem("flint_and_steel")) {
        if (!fb.hasItem("flint")) await fb.mineBlock("gravel", 5);
        if (fb.hasItem("flint") && fb.hasItem("iron_ingot"))
          await fb.craftItem("flint_and_steel", 1);
      }

      // Gold for piglin bartering
      if (!fb.hasItem("gold_ingot", 32)) {
        await fb.stripMine("gold_ore", 16);
        await fb.stripMine("deepslate_gold_ore", 16);
        const raw = fb.countItem("raw_gold");
        if (raw > 0) await fb.smeltItem("raw_gold", "coal", raw);
      }

      // Food — hunt animals and cook
      if (!fb.hasEnoughFood(16)) {
        for (const animal of ["cow", "pig", "sheep", "chicken"]) {
          const mob = Object.values(bot.entities).find(
            (e) =>
              e.name === animal &&
              e.position.distanceTo(bot.entity.position) < 32,
          );
          if (mob) {
            await fb.attackEntity(mob);
            await bot.waitForTicks(20);
          }
        }
        for (const raw of [
          "raw_beef",
          "raw_porkchop",
          "raw_mutton",
          "raw_chicken",
        ]) {
          const count = fb.countItem(raw);
          if (count > 0) await fb.smeltItem(raw, "coal", count);
        }
      }

      // Bow & arrows
      if (!fb.hasItem("bow")) await fb.craftItem("bow", 1);
      if (!fb.hasItem("arrow", 32)) await fb.craftItem("arrow", 16);

      return fb.hasItem("obsidian", 10) && fb.hasItem("flint_and_steel");
    },
  },

  // ── Phase 5: Nether ──────────────────────────────────────────────
  {
    name: "nether",
    label: "Enter Nether — blaze rods & ender pearls",
    async execute(bot) {
      const fb = bot.friendlyBot;

      await fb.buildNetherPortal();
      bot.chat("Entering the Nether…");
      await bot.waitForTicks(100);

      await fb.huntBlazes(7);
      await fb.barterForPearls(12);

      return fb.hasItem("blaze_rod", 7) && fb.hasItem("ender_pearl", 12);
    },
  },

  // ── Phase 6: Stronghold ──────────────────────────────────────────
  {
    name: "stronghold",
    label: "Find the stronghold & activate End portal",
    async execute(bot) {
      const fb = bot.friendlyBot;
      const mcData = mcDataLoader(bot.version);

      // Return to Overworld via portal
      const portal = bot.findBlock({
        matching: mcData.blocksByName.nether_portal?.id,
        maxDistance: 128,
      });
      if (portal) {
        await fb.goTo(portal.position, 1);
        await bot.waitForTicks(100);
      }

      await fb.craftEyesOfEnder(12);
      const pos = await fb.locateStronghold();
      if (pos) await fb.goTo(pos, 5);

      return await fb.activateEndPortal();
    },
  },

  // ── Phase 7: The End ─────────────────────────────────────────────
  {
    name: "end",
    label: "Fight the Ender Dragon!",
    async execute(bot) {
      await bot.waitForTicks(100);
      await bot.friendlyBot.fightDragon();

      const dragon = Object.values(bot.entities).find(
        (e) => e.name === "ender_dragon",
      );
      return !dragon;
    },
  },
];

export default PHASES;
