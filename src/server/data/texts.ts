import { MinecraftPacketIds } from "bdsx/bds/packetids";
import { TextPacket } from "bdsx/bds/packets";
import { events } from "bdsx/event";
import { Utils } from "../../utils";
import { serverData } from "../data";

events.packetBefore(MinecraftPacketIds.Text).on(pk => {
    if (pk.type === TextPacket.Types.Chat) {
        serverData.server.logs.chat.push({
            name: pk.name,
            message: Utils.formatColorCodesToHTML(pk.message),
            time: new Date().getTime()
        });
    }
});
events.command.on((command, originName, ctx) => {
    serverData.server.logs.commands.push({
        name: originName,
        command,
        time: new Date().getTime(),
    });
});
{
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = (buffer: any, callback: any) => {
        serverData.server.logs.console.push({
            log: Utils.formatConsoleCodesToHTML(buffer.toString()/*.replace(/(\[\d+m|\u001b)/g, "")*/),
            time: new Date().getTime(),
        });
        return original(buffer, callback);
    };
}