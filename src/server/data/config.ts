import { GameRuleId } from "bdsx/bds/gamerules";
import { MinecraftPacketIds } from "bdsx/bds/packetids";
import { serverInstance } from "bdsx/bds/server";
import { events } from "bdsx/event";
import { Utils } from "../../utils";
import { serverData } from "../data";

events.packetSend(MinecraftPacketIds.GameRulesChanged).on(pk => {
    const gameRules = serverInstance.minecraft.getLevel().getGameRules();
    for (let i = 0; i < Object.keys(GameRuleId).length / 2; i++) {
        const rule = gameRules.getRule(i);
        serverData.server.game.options["Game Rules"][GameRuleId[i]] = {
            displayName: Utils.mapGameRuleName(i),
            type: rule.type,
            value: rule.getValue(),
        }
    }
});
events.packetSend(MinecraftPacketIds.SetCommandsEnabled).on(pk => {
    serverData.server.game.options["World"]["allow-cheats"].value = pk.commandsEnabled;
});
// events.packetSend(MinecraftPacketIds.SetDifficulty).on(pk => {
//     serverData.server.game.options["World"]["difficulty"].value = pk.commandsEnabled;
// });