
import { MinecraftPacketIds, nethook, NetworkIdentifier, serverInstance } from "bdsx";
import { events } from "bdsx/event";
import { tmp } from "./data";
import { io } from "./server";

events.queryRegenerate.on(ev => {
    tmp.info.announcement.name = ev.motd;
    tmp.info.announcement.level = ev.levelname;
    tmp.info.announcement.players.current = ev.currentPlayers;
    tmp.info.announcement.players.max = ev.maxPlayers;
    io.emit("info.announcement", tmp.info.announcement);
    tmp.info.server.players.max = serverInstance.getMaxPlayers();
    io.emit("info.server", tmp.info.server);
});

nethook.after(MinecraftPacketIds.Login).on((pk, ni) => {
    let extraData = pk.connreq.cert.json.value()["extraData"];
    let clientData = pk.connreq.something.json.value();
    let player = {
        event: "join",
        name: extraData["displayName"],
        uuid: extraData["identity"],
        xuid: extraData["XUID"],
        address: ni.getAddress().replace("|", ":"),
        device: clientData["DeviceModel"] || "Not specified",
        os: clientData["DeviceOS"],
        skin: {
            size: [clientData["SkinImageWidth"], clientData["SkinImageHeight"]],
            texture: Buffer.from(clientData["SkinData"], "base64").toString(),
            geometry: JSON.parse(Buffer.from(clientData["SkinGeometryData"], "base64").toString())
        }
    };
    //console.log(Object.keys(clientData))
    tmp.players.set(ni, player);
    io.emit("player", player);
});

nethook.before(MinecraftPacketIds.Text).on((pk, ni) => {
    let data = {
        name: pk.name,
        message: pk.message,
        time: new Date().toLocaleTimeString(),
    };
    tmp.chats.push(data as never);
    io.emit("chat", data);
});

NetworkIdentifier.close.on(ni => {
    io.emit("player", {
        event: "leave",
        uuid: tmp.players.get(ni).uuid
    });
    tmp.players.delete(ni);
});

serverInstance.minecraft.something.shandler.updateServerAnnouncement();