import { GameRule, GameRuleId } from "bdsx/bds/gamerules";
import { serverInstance } from "bdsx/bds/server";
import { events } from "bdsx/event";
import { bedrockServer } from "bdsx/launcher";
import { loadedPackages, loadedPlugins } from "bdsx/plugins";
import { Utils } from "../../utils";
import { serverData } from "../data";
import { panel, SocketEvents } from "../server";
import { refreshScoreboard } from "./scores";
import pidusage = require("pidusage");
import os = require("os");

let tps = 0;

let pidusageErr = false;
bedrockServer.afterOpen().then(() => {
    panel.io.emit(SocketEvents.Logout);
    const startTime = new Date().getTime();
    serverData.status = 1;
    serverData.process.sessionId = bedrockServer.sessionId;
    serverData.server.version = serverInstance.getGameVersion().fullVersionString;
    serverData.server.protocol = serverInstance.getNetworkProtocolVersion();
    serverData.server.info.name = serverInstance.getMotd();
    serverData.server.info.players.max = serverInstance.getMaxPlayers();
    for (const plugin of loadedPackages) {
        serverData.server.plugins.push({
            name: plugin.name,
            json: {
                name: plugin.json.name,
                version: plugin.json.version,
                description: plugin.json.description,
                keywords: plugin.json.keywords,
                author: plugin.json.author,
                license: plugin.json.license,
            }
        });
    }
    serverData.server.game.options["Game Rules"] = {};
    const level = serverInstance.minecraft.getLevel();
    const gameRules = level.getGameRules();
    for (let i = 0; i < Object.keys(GameRuleId).length / 2; i++) {
        const rule = gameRules.getRule(i);
        serverData.server.game.options["Game Rules"][GameRuleId[i]] = {
            displayName: Utils.mapGameRuleName(i),
            type: rule.type,
            value: rule.getValue(),
        }
    }
    serverData.server.game.options["World"] = {
        // "difficulty": {
        //     displayName: "Difficulty",
        //     type: GameRule.Type.Int,
        //     enum: ["Peaceful", "Easy", "Normal", "Hard"],
        //     value: serverInstance.minecraft.getLevel().getDifficulty(),
        // },
        "allow-cheats": {
            displayName: "Allow Cheats",
            type: GameRule.Type.Bool,
            value: serverInstance.minecraft.getLevel().hasCommandsEnabled(),
        }
    };
    refreshScoreboard();
    Utils.fetchAllPlugins().then(plugins => {
        if (plugins !== null) {
            for (const plugin of plugins) {
                if (!loadedPlugins.includes(plugin.package.name)) {
                    serverData.server.onlinePlugins.push(plugin);
                }
            }
        }
    });
    setInterval(() => {
        serverData.server.uptime = new Date().getTime() - startTime;
        serverData.server.game.tps = tps > 20 ? 20 : tps;
        tps = 0;
    }, 1000).unref();
    setInterval(function _() {
        if (serverData.process.usage.ram.length >= 30) {
            serverData.process.usage.ram.shift();
            serverData.process.usage.cpu.shift();
        }
        const time = new Date().getTime();
        pidusage(process.pid, (err: any, stats: any) => {
            if (stats) {
                if (pidusageErr) {
                    panel.log(`Memory and CPU usage charts will be enabled again.`.yellow);
                    pidusageErr = false;
                }
                serverData.process.usage.ram.push({
                    percent: stats.memory * 100 / os.totalmem(),
                    time,
                });
                serverData.process.usage.cpu.push({
                    percent: stats.cpu,
                    time,
                });
            } else {
                if (err && !pidusageErr) {
                    panel.log(`An error encountered: 'wmic' is missing, try adding '%SystemRoot%\\System32\\Wbem' to PATH. Memory and CPU usage charts will be disabled.`.yellow);
                    pidusageErr = true;
                }
            }
            panel.io.emit(SocketEvents.UpdateResourceUsage);
        });
        return _;
    }(), 60000).unref();
});
events.queryRegenerate.on(event => {
    serverData.server.announcement.name = Utils.formatColorCodesToHTML(event.motd);
    serverData.server.announcement.level = Utils.formatColorCodesToHTML(event.levelname);
    serverData.server.announcement.players.current = event.currentPlayers;
    serverData.server.announcement.players.max = event.maxPlayers;
});
events.levelTick.on(() => {
    tps += 1;
});