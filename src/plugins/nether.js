/**
 * Nether plugin — portal building, blaze rods, ender pearl gathering.
 */

import Vec3 from "vec3";
import mcDataLoader from "minecraft-data";

export function setupNether(bot) {
  const mcData = mcDataLoader(bot.version);

  /** Build a nether portal from obsidian. */
  bot.friendlyBot.buildNetherPortal = async () => {
    const fb = bot.friendlyBot;
    if (fb.countItem("obsidian") < 10) {
      bot.chat("I need at least 10 obsidian to build a portal.");
      return false;
    }
    if (fb.countItem("flint_and_steel") < 1) {
      bot.chat("I need flint and steel to light the portal.");
      return false;
    }

    bot.chat("Building a Nether portal…");
    const base = bot.entity.position.offset(2, 0, 0).floored();
    const portalBlocks = [];

    // Bottom & top rows
    for (let z = 0; z < 4; z++) portalBlocks.push(base.offset(0, 0, z));
    for (let z = 0; z < 4; z++) portalBlocks.push(base.offset(0, 4, z));
    // Side columns
    for (let y = 1; y < 4; y++) portalBlocks.push(base.offset(0, y, 0));
    for (let y = 1; y < 4; y++) portalBlocks.push(base.offset(0, y, 3));

    for (const pos of portalBlocks) {
      const existing = bot.blockAt(pos);
      if (existing && existing.name !== "air" && existing.name !== "obsidian") {
        await bot.dig(existing);
      }
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

    // Light the portal
    const flint = bot.inventory
      .items()
      .find((i) => i.name === "flint_and_steel");
    if (flint) {
      await bot.equip(flint, "hand");
      const insideBlock = bot.blockAt(base.offset(0, 1, 1));
      if (insideBlock) {
        try {
          await bot.activateBlock(insideBlock);
        } catch {}
      }
    }

    bot.chat("Nether portal is ready!");
    return true;
  };

  /** Hunt blazes in a Nether fortress. */
  bot.friendlyBot.huntBlazes = async (targetRods = 7) => {
    bot.chat(`Looking for blazes… need ${targetRods} rods.`);
    let collected = bot.friendlyBot.countItem("blaze_rod");

    while (collected < targetRods) {
      const blaze = Object.values(bot.entities).find(
        (e) =>
          e.name === "blaze" && e.position.distanceTo(bot.entity.position) < 32,
      );

      if (blaze) {
        await bot.friendlyBot.attackEntity(blaze);
        await bot.waitForTicks(20);
        collected = bot.friendlyBot.countItem("blaze_rod");
      } else {
        const randomDir = new Vec3(
          (Math.random() - 0.5) * 20,
          0,
          (Math.random() - 0.5) * 20,
        );
        try {
          await bot.friendlyBot.goTo(bot.entity.position.plus(randomDir), 2);
        } catch {
          break;
        }
        await bot.waitForTicks(40);
        collected = bot.friendlyBot.countItem("blaze_rod");
      }
    }
    return collected >= targetRods;
  };

  /** Trade with piglins for ender pearls (barter gold ingots). */
  bot.friendlyBot.barterForPearls = async (targetPearls = 12) => {
    let pearls = bot.friendlyBot.countItem("ender_pearl");
    if (pearls >= targetPearls) return true;

    bot.chat("Looking for piglins to trade gold for ender pearls…");
    while (pearls < targetPearls) {
      const gold = bot.inventory.items().find((i) => i.name === "gold_ingot");
      if (!gold) {
        bot.chat("I ran out of gold ingots!");
        return false;
      }

      const piglin = Object.values(bot.entities).find(
        (e) =>
          e.name === "piglin" &&
          e.position.distanceTo(bot.entity.position) < 16,
      );

      if (piglin) {
        await bot.equip(gold, "hand");
        await bot.lookAt(piglin.position.offset(0, 1, 0));
        await bot.toss(gold.type, null, 1);
        await bot.waitForTicks(200);
        pearls = bot.friendlyBot.countItem("ender_pearl");
      } else {
        break;
      }
    }
    return pearls >= targetPearls;
  };

  console.log("[Nether] Ready.");
}
