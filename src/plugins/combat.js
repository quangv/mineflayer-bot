/**
 * Combat plugin — fighting utilities.
 */

export function setupCombat(bot) {
  const config = bot.friendlyBot.config;

  /** Attack an entity until it dies or moves out of range. */
  bot.friendlyBot.attackEntity = async (entity) => {
    if (!entity || !entity.isValid) return;
    bot.friendlyBot.busy = true;
    try {
      await bot.friendlyBot.equipBestWeapon();
      await bot.pvp.attack(entity);
    } catch {
      // pvp.attack rejects when target dies or despawns
    } finally {
      bot.friendlyBot.busy = false;
    }
  };

  /** Find the nearest hostile mob within a radius. */
  bot.friendlyBot.findNearestHostile = (pos, radius) => {
    radius = radius || config.protection.radius;
    const hostileNames = config.hostileMobs;
    let nearest = null;
    let nearestDist = Infinity;

    for (const entity of Object.values(bot.entities)) {
      if (!entity || entity === bot.entity) continue;
      if (entity.type !== "mob") continue;
      if (!hostileNames.includes(entity.name)) continue;
      const dist = entity.position.distanceTo(pos);
      if (dist < radius && dist < nearestDist) {
        nearest = entity;
        nearestDist = dist;
      }
    }
    return nearest;
  };

  /** Equip the best melee weapon from inventory. */
  bot.friendlyBot.equipBestWeapon = async () => {
    const weapons = [
      "netherite_sword",
      "diamond_sword",
      "iron_sword",
      "stone_sword",
      "wooden_sword",
      "netherite_axe",
      "diamond_axe",
      "iron_axe",
      "stone_axe",
      "wooden_axe",
    ];
    for (const name of weapons) {
      const item = bot.inventory.items().find((i) => i.name === name);
      if (item) {
        await bot.equip(item, "hand");
        return;
      }
    }
  };

  /** Stop fighting. */
  bot.friendlyBot.stopFighting = () => {
    bot.pvp.stop();
  };

  console.log("[Combat] Ready.");
}
