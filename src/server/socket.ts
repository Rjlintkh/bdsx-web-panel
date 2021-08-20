import { TextPacket } from "bdsx/bds/packets";
import { events } from "bdsx/event";
import { bedrockServer } from "bdsx/launcher";
import { execSync } from "child_process";
import { Utils } from "../utils";
import { serverData } from "./data";
import { panel, SocketEvents } from "./server";

panel.io.on("connection", (socket: any) => {
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
});