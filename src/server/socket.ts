import { AttributeId } from "bdsx/bds/attribute";
import { TextPacket } from "bdsx/bds/packets";
import { serverInstance } from "bdsx/bds/server";
import { events } from "bdsx/event";
import { bedrockServer } from "bdsx/launcher";
import { loadedPlugins } from "bdsx/plugins";
import { execSync } from "child_process";
import { Utils } from "../utils";
import { selectedPlayers, serverData } from "./data";
import { panel, SocketEvents } from "./server";

panel.io.on("connection", (socket: any) => {
    Utils.fetchAllPlugins().then(plugins => {
        if (plugins !== null) {
            serverData.server.onlinePlugins = [];
            for (const plugin of plugins) {
                if (!loadedPlugins.includes(plugin.package.name)) {
                    serverData.server.onlinePlugins.push(plugin);
                }
            }
        }
    });
    socket.emit(SocketEvents.SyncServerData, {
        path: [],
        value: serverData,
    });
    socket.emit(SocketEvents.UpdateResourceUsage);

    socket.on(SocketEvents.StopServer, () => {
       bedrockServer.stop();
    });
    socket.on(SocketEvents.RestartServer, () => {
        events.serverStop.on(() => {
            setTimeout(() => {
                execSync(process.argv.join(" "), {stdio: "inherit"});
            }, 5000);
        });
        bedrockServer.stop();
    });
    socket.on(SocketEvents.InputCommand, (command: string) => {
       socket.emit(SocketEvents.Toast, "Command sent");
       bedrockServer.executeCommandOnConsole(command);
    });
    socket.on(SocketEvents.InputChat, (chat: string) => {
        const pk = TextPacket.create();
        pk.type = TextPacket.Types.Chat;
        pk.name = panel.config["chat_name"];
        pk.message = chat;
        Utils.broadcastPacket(pk);
        socket.emit(SocketEvents.Toast, "Message sent");
        serverData.server.logs.chat.push({
            name: panel.config["chat_name"],
            message: chat,
            time: new Date().getTime(),
        });
    });
    socket.on(SocketEvents.CheckForPluginUpdates, async (plugin: string, version: string) => {
        const update = await Utils.checkForPluginUpdates(plugin, version);
        switch (update) {
        case "not on npm":
            socket.emit(SocketEvents.Toast, "Plugin not on npm");
            break;
        case "up to date":
            socket.emit(SocketEvents.Toast, "Plugin is up to date");
            break;
        default:
            socket.emit(SocketEvents.Toast, `Plugin update available (${update})`);
        }
    });
    socket.on(SocketEvents.InstallPlugin, (plugin: string, version?: string) => {
        execSync(`npm i ${plugin}${version ? "@" + version : ""}`, {stdio:'inherit'});
        socket.emit(SocketEvents.Toast, `Tried to install ${plugin}`);
    });
    socket.on(SocketEvents.RemovePlugin, (plugin: string) => {
        execSync(`npm r ${plugin}`, {stdio:'inherit'});
        socket.emit(SocketEvents.Toast, `Tried to uninstall ${plugin}`);
    });
    socket.on(SocketEvents.StartRequestPlayerInfo, (uuid: string) => {
        const ni = Utils.players.get(uuid);
        const player = ni?.getActor();
        if (player?.isPlayer()) {
            selectedPlayers.push([uuid, ni!]);
            serverData.server.game.players[uuid].gameInfo = {
                pos: player.getPosition().toJSON(),
                rot: player.getRotation().toJSON(),
                health: {
                    current: player.getHealth(),
                    max: player.getMaxHealth(),
                },
                food: {
                    current: player.getAttribute(AttributeId.PlayerSaturation),
                    max: 20,
                },
                //inv: new InventoryRenderer(player.getInventory()),
            };
        }
        socket.emit(SocketEvents.UpdateRequestedPlayerInventory);
    });
    socket.on(SocketEvents.StopRequestPlayerInfo, (uuid: string) => {
        selectedPlayers.splice(selectedPlayers.findIndex(e => e[0] === uuid), 1);
    });
    socket.on(SocketEvents.KickPlayer, (uuid: string, reason: string | null) => {
        if (reason === null) {
            serverInstance.disconnectClient(Utils.players.get(uuid)!);
        } else {
            serverInstance.disconnectClient(Utils.players.get(uuid)!, reason);
        }
    });
});