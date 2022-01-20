import { MinecraftPacketIds } from "bdsx/bds/packetids";
import { DisplaySlot } from "bdsx/bds/scoreboard";
import { serverInstance } from "bdsx/bds/server";
import { events } from "bdsx/event";
import { Utils } from "../../utils";
import { serverData } from "../data";

export function refreshScoreboard() {
    const scoreboard = serverInstance.minecraft.getLevel().getScoreboard();
    const trackedIds = scoreboard.getTrackedIds();
    for (const objective of scoreboard.getObjectives()) {
        const scores: Record<number, {
            name: string,
            value: number|string,
        }> = {};
        for (const scoreboardId of trackedIds) {
            const score = objective.getPlayerScore(scoreboardId);
            if (score.valid && scoreboardId.identityDef) {
                scores[scoreboardId.idAsNumber] = {
                    name: Utils.formatColorCodesToHTML(scoreboardId.identityDef.getName() ?? "Player Offline"),
                    value: score.value,
                };
            }
        }
        serverData.server.game.objectives[objective.name] = {
            displayName: Utils.formatColorCodesToHTML(objective.displayName),
            pinned: "",
            scores,
        };
    }
    const belowName = scoreboard.getDisplayObjective(DisplaySlot.BelowName);
    if (belowName) {
        serverData.server.game.objectives[belowName.objective!.name].pinned += "label";
    }
    const list = scoreboard.getDisplayObjective(DisplaySlot.List);
    if (list) {
        serverData.server.game.objectives[list.objective!.name].pinned += "format_list_numbered_rtl";
    }
    const sidebar = scoreboard.getDisplayObjective(DisplaySlot.Sidebar);
    if (sidebar) {
        serverData.server.game.objectives[sidebar.objective!.name].pinned += "push_pin";
    }
}

events.objectiveCreate.on(objective => {
    serverData.server.game.objectives[objective.name] = {
        displayName: Utils.formatColorCodesToHTML(objective.displayName),
        pinned: "",
        scores: {},
    };
});
events.scoreReset.on(event => {
    if (serverData.server.game.objectives[event.objective.name]) {
        delete serverData.server.game.objectives[event.objective.name].scores[event.identityRef.scoreboardId.idAsNumber];
    } else {
        refreshScoreboard();
    }
});
events.scoreSet.on(event => {
    if (serverData.server.game.objectives[event.objective.name]) {
        serverData.server.game.objectives[event.objective.name].scores[event.identityRef.scoreboardId.idAsNumber] = {
            name: Utils.formatColorCodesToHTML(event.identityRef.scoreboardId.identityDef.getName() ?? "Player Offline"),
            value: event.score,
        };
    } else {
        refreshScoreboard();
    }
});
events.scoreAdd.on(event => {
    if (serverData.server.game.objectives[event.objective.name]) {
        serverData.server.game.objectives[event.objective.name].scores[event.identityRef.scoreboardId.idAsNumber] = {
            name: Utils.formatColorCodesToHTML(event.identityRef.scoreboardId.identityDef.getName() ?? "Player Offline"),
            value: event.objective.getPlayerScore(event.identityRef.scoreboardId).value + event.score,
        }
    } else {
        refreshScoreboard();
    }
});
events.scoreRemove.on(event => {
    if (serverData.server.game.objectives[event.objective.name]) {
        serverData.server.game.objectives[event.objective.name].scores[event.identityRef.scoreboardId.idAsNumber] = {
            name: Utils.formatColorCodesToHTML(event.identityRef.scoreboardId.identityDef.getName() ?? "Player Offline"),
            value: event.objective.getPlayerScore(event.identityRef.scoreboardId).value - event.score,
        }
    } else {
        refreshScoreboard();
    }
});
events.playerJoin.on(event => {
    const ni = event.player.getNetworkIdentifier();
    for (const [uuid, _ni] of Utils.players) {
        if (_ni.equals(ni)) {
            serverData.server.game.players[uuid].scoreboardId = serverInstance.minecraft.getLevel().getScoreboard().getPlayerScoreboardId(event.player).idAsNumber;
            break;
        }
    }
});
events.packetSend(MinecraftPacketIds.SetScore).on((pk, ni) => {
    refreshScoreboard();
});
