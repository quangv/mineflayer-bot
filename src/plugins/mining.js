/**
 * Mining plugin — resource gathering.
 */

import mcDataLoader from "minecraft-data";

export function setupMining(bot) {
  const mcData = mcDataLoader(bot.version);

  /** Mine a specific block type. Returns true if successful. */
  bot.friendlyBot.mineBlock = async (blockName, count = 1) => {
    for (let i = 0; i < count; i++) {
      const block = bot.findBlock({
        matching: mcData.blocksByName[blockName]?.id,
        maxDistance: 64,
      });
      if (!block) {
        console.log(`[Mining] No ${blockName} found nearby.`);
        return false;
      }
      try {
        await bot.tool.equipForBlock(block);
        await bot.collectBlock.collect(block);
      } catch (err) {
        console.log(`[Mining] Failed to mine ${blockName}: ${err.message}`);
        return false;
      }
    }
    return true;
  };

  /** Collect resources until target inventory counts are reached. */
  bot.friendlyBot.gatherResources = async (blocks) => {
    for (const { name, count } of blocks) {
      const have = bot.friendlyBot.countItem(name);
      const need = count - have;
      if (need <= 0) continue;
      console.log(`[Mining] Gathering ${need} × ${name}…`);
      if (!(await bot.friendlyBot.mineBlock(name, need))) return false;
    }
    return true;
  };

  /** Strip-mine at current Y for a specific ore. */
  bot.friendlyBot.stripMine = async (targetOre, count = 1) => {
    let collected = 0;
    const oreId = mcData.blocksByName[targetOre]?.id;
    if (!oreId) return false;

    for (let attempt = 0; attempt < 200 && collected < count; attempt++) {
      const oreBlock = bot.findBlock({ matching: oreId, maxDistance: 16 });
      if (oreBlock) {
        try {
          await bot.tool.equipForBlock(oreBlock);
          await bot.collectBlock.collect(oreBlock);
          collected++;
          continue;
        } catch {
          /* fall through */
        }
      }

      // Dig forward in a 1×2 tunnel
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
        await bot.friendlyBot.goTo(forward, 0);
      } catch {
        break;
      }
    }
    return collected >= count;
  };

  /** Dig straight down to a target Y level. */
  bot.friendlyBot.digDown = async (targetY) => {
    while (Math.floor(bot.entity.position.y) > targetY) {
      const below = bot.blockAt(bot.entity.position.offset(0, -1, 0));
      if (below && bot.canDigBlock(below)) {
        await bot.tool.equipForBlock(below);
        await bot.dig(below);
      }
      await bot.waitForTicks(4);
    }
  };

  console.log("[Mining] Ready.");
}
