/**
 * Progression manager — drives the bot through Minecraft phases.
 */

import PHASES from "./phases.js";

export function setupProgression(bot) {
  let running = false;

  /** Start the full progression loop. */
  bot.friendlyBot.startProgression = async () => {
    if (running) {
      bot.chat("I'm already working on beating the game!");
      return;
    }
    running = true;
    bot.friendlyBot.mode = "progress";
    bot.chat("Let's beat Minecraft! Starting progression…");

    try {
      for (const phase of PHASES) {
        if (!running) break;
        bot.friendlyBot.phase = phase.name;
        bot.chat(`Phase: ${phase.label}`);
        console.log(`[Progression] ── Phase: ${phase.name} ──`);

        let success = await phase.execute(bot);
        if (!success) {
          bot.chat(`Stuck on "${phase.label}". Retrying…`);
          success = await phase.execute(bot);
          if (!success) {
            bot.chat(
              `Still stuck on "${phase.label}". You might need to help me!`,
            );
          }
        }
      }

      if (running) {
        bot.friendlyBot.phase = "victory";
        bot.chat("We beat Minecraft! The Ender Dragon is defeated!");
      }
    } catch (err) {
      console.error(`[Progression] Error: ${err.message}`);
      bot.chat(`Something went wrong: ${err.message}`);
    } finally {
      running = false;
      bot.friendlyBot.mode = "idle";
    }
  };

  /** Stop progression. */
  bot.friendlyBot.stopProgression = () => {
    running = false;
    bot.friendlyBot.mode = "idle";
    bot.friendlyBot.stopMoving();
    bot.chat("Stopped progression. Ready for commands.");
  };

  /** Get current phase info. */
  bot.friendlyBot.getPhase = () => bot.friendlyBot.phase;

  console.log("[Progression] Ready.");
}
