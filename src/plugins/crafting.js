/**
 * Crafting plugin — recipe helpers.
 */

import mcDataLoader from "minecraft-data";

export function setupCrafting(bot) {
  const mcData = mcDataLoader(bot.version);

  /** Craft an item by name. Automatically uses/places a crafting table if needed. */
  bot.friendlyBot.craftItem = async (itemName, count = 1) => {
    const item = mcData.itemsByName[itemName];
    if (!item) {
      console.log(`[Crafting] Unknown item: ${itemName}`);
      return false;
    }

    // Try 2×2 grid first
    const recipes = bot.recipesFor(item.id, null, 1, null);
    if (recipes.length > 0) {
      try {
        await bot.craft(recipes[0], count, null);
        console.log(`[Crafting] Crafted ${count} × ${itemName} (inventory).`);
        return true;
      } catch {
        /* may need crafting table */
      }
    }

    // Try with crafting table
    let table = bot.findBlock({
      matching: mcData.blocksByName.crafting_table.id,
      maxDistance: 32,
    });

    if (!table) {
      const tableItem = bot.inventory
        .items()
        .find((i) => i.name === "crafting_table");
      if (!tableItem) {
        const planks = bot.inventory
          .items()
          .find((i) => i.name.endsWith("_planks"));
        if (!planks || planks.count < 4) {
          console.log("[Crafting] Need planks to make a crafting table.");
          return false;
        }
        const tableRecipes = bot.recipesFor(
          mcData.itemsByName.crafting_table.id,
        );
        if (tableRecipes.length === 0) return false;
        await bot.craft(tableRecipes[0], 1, null);
      }

      const refBlock = bot.blockAt(bot.entity.position.offset(1, -1, 0));
      if (refBlock) {
        const inv = bot.inventory
          .items()
          .find((i) => i.name === "crafting_table");
        if (inv) {
          await bot.equip(inv, "hand");
          try {
            await bot.placeBlock(refBlock, { x: 0, y: 1, z: 0 });
          } catch {
            /* */
          }
        }
      }

      table = bot.findBlock({
        matching: mcData.blocksByName.crafting_table.id,
        maxDistance: 32,
      });
    }

    if (table) {
      await bot.friendlyBot.goTo(table.position, 3);
      const recipesWithTable = bot.recipesFor(item.id, null, 1, table);
      if (recipesWithTable.length > 0) {
        try {
          await bot.craft(recipesWithTable[0], count, table);
          console.log(`[Crafting] Crafted ${count} × ${itemName} (table).`);
          return true;
        } catch (err) {
          console.log(`[Crafting] Failed: ${err.message}`);
          return false;
        }
      }
    }

    console.log(`[Crafting] No recipe for ${itemName}.`);
    return false;
  };

  /** Smelt items in a nearby furnace. */
  bot.friendlyBot.smeltItem = async (inputName, fuelName, count = 1) => {
    let furnace = bot.findBlock({
      matching: mcData.blocksByName.furnace.id,
      maxDistance: 32,
    });

    if (!furnace) {
      const furnaceItem = bot.inventory
        .items()
        .find((i) => i.name === "furnace");
      if (furnaceItem) {
        const refBlock = bot.blockAt(bot.entity.position.offset(-1, -1, 0));
        if (refBlock) {
          await bot.equip(furnaceItem, "hand");
          try {
            await bot.placeBlock(refBlock, { x: 0, y: 1, z: 0 });
          } catch {
            /* */
          }
          furnace = bot.findBlock({
            matching: mcData.blocksByName.furnace.id,
            maxDistance: 32,
          });
        }
      }
    }

    if (!furnace) {
      console.log("[Crafting] No furnace available.");
      return false;
    }

    await bot.friendlyBot.goTo(furnace.position, 3);
    const f = await bot.openFurnace(furnace);

    const input = bot.inventory.items().find((i) => i.name === inputName);
    const fuel = bot.inventory.items().find((i) => i.name === fuelName);
    if (!input || !fuel) {
      f.close();
      return false;
    }

    await f.putFuel(
      fuel.type,
      null,
      Math.min(fuel.count, Math.ceil(count / 8) + 1),
    );
    await f.putInput(input.type, null, Math.min(input.count, count));

    // Wait for smelting (~10 s per item)
    await new Promise((r) => setTimeout(r, count * 10_000 + 2000));
    await f.takeOutput();
    f.close();

    console.log(`[Crafting] Smelted ${count} × ${inputName}.`);
    return true;
  };

  console.log("[Crafting] Ready.");
}
