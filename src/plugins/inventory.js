/**
 * Inventory plugin — item counting and management.
 */

import mcDataLoader from "minecraft-data";

export function setupInventory(bot) {
  /** Count how many of an item (by name) we have. */
  bot.friendlyBot.countItem = (name) =>
    bot.inventory
      .items()
      .filter((i) => i.name === name)
      .reduce((sum, i) => sum + i.count, 0);

  /** Check if we have at least N of an item. */
  bot.friendlyBot.hasItem = (name, count = 1) =>
    bot.friendlyBot.countItem(name) >= count;

  /** Toss excess items to make space. */
  bot.friendlyBot.tossItem = async (name, count) => {
    const item = bot.inventory.items().find((i) => i.name === name);
    if (item) await bot.toss(item.type, null, count || item.count);
  };

  /** List inventory contents as a string. */
  bot.friendlyBot.listInventory = () => {
    const items = bot.inventory.items();
    if (items.length === 0) return "Inventory is empty.";
    return items.map((i) => `${i.name} x${i.count}`).join(", ");
  };

  /** Check if inventory is nearly full. */
  bot.friendlyBot.isInventoryFull = () => bot.inventory.emptySlotCount() <= 2;

  /** Deposit items into a nearby chest. */
  bot.friendlyBot.depositIntoChest = async (items) => {
    const mcData = mcDataLoader(bot.version);
    const chest = bot.findBlock({
      matching: mcData.blocksByName.chest.id,
      maxDistance: 32,
    });
    if (!chest) return false;

    await bot.friendlyBot.goTo(chest.position, 3);
    const container = await bot.openContainer(chest);

    for (const { name, count } of items) {
      const invItem = bot.inventory.items().find((i) => i.name === name);
      if (invItem) {
        await container.deposit(
          invItem.type,
          null,
          Math.min(invItem.count, count),
        );
      }
    }
    container.close();
    return true;
  };

  console.log("[Inventory] Ready.");
}
