/**
 * Survival plugin — food, health, and basic needs.
 */

export function setupSurvival(bot) {
  // Configure auto-eat (v5 API)
  bot.autoEat.enableAuto();
  bot.autoEat.setOpts({
    priority: "foodPoints",
    minHunger: 15,
    minHealth: 14,
    bannedFood: [
      "rotten_flesh",
      "spider_eye",
      "poisonous_potato",
      "pufferfish",
    ],
    returnToLastItem: true,
    offhand: false,
    eatingTimeout: 3000,
  });

  bot.autoEat.on("eatStart", (opts) => {
    console.log(`[Survival] Eating ${opts.food.name}…`);
  });

  bot.autoEat.on("eatFail", (err) => {
    console.log(`[Survival] Eat failed: ${err}`);
  });

  /** Check if we have enough food. */
  bot.friendlyBot.hasEnoughFood = (min = 8) => {
    const edible = [
      "bread",
      "golden_apple",
      "golden_carrot",
      "cooked_beef",
      "cooked_porkchop",
      "cooked_chicken",
      "cooked_mutton",
      "cooked_rabbit",
      "cooked_salmon",
      "cooked_cod",
      "baked_potato",
      "beetroot_soup",
      "mushroom_stew",
      "apple",
      "melon_slice",
      "sweet_berries",
      "pumpkin_pie",
      "cookie",
      "dried_kelp",
    ];
    const food = bot.inventory
      .items()
      .filter((i) => i.name.includes("cooked") || edible.includes(i.name));
    return food.reduce((sum, i) => sum + i.count, 0) >= min;
  };

  /** Sleep in a bed if night-time and a bed is nearby. */
  bot.friendlyBot.tryToSleep = async () => {
    if (!bot.time.isDay) {
      const bed = bot.findBlock({
        matching: (block) => bot.isABed(block),
        maxDistance: 32,
      });
      if (bed) {
        try {
          await bot.sleep(bed);
          bot.chat("Good night!");
          return true;
        } catch {
          /* bed occupied or unreachable */
        }
      }
    }
    return false;
  };

  /** Check health status. */
  bot.friendlyBot.getHealthStatus = () => ({
    health: bot.health,
    food: bot.food,
    saturation: bot.foodSaturation,
  });

  console.log("[Survival] Ready.");
}
