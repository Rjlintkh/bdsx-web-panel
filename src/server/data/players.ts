import { BlockPos, ChunkBlockPos } from "bdsx/bds/blockpos";
import { MinecraftPacketIds } from "bdsx/bds/packetids";
import { serverInstance } from "bdsx/bds/server";
import { events } from "bdsx/event";
import { Utils } from "../../utils";
import { selectedPlayers, serverData } from "../data";
import { panel, SocketEvents } from "../server";
import fs = require("fs");
import path = require("path");

events.packetAfter(MinecraftPacketIds.Login).on(async (pk, ni) => {
    const connreq = pk.connreq;
    if (connreq) {
        const cert = connreq.cert.json.value();
        const data = connreq.getJsonValue()!;

        const uuid = cert["extraData"]["identity"];

        serverData.server.game.players[uuid] = {
            name: cert["extraData"]["displayName"],
            uuid: uuid,
            xuid: cert["extraData"]["XUID"],
            ip: ni.getAddress().split("|")[0],
            skin: {
                head: "",
            },
            device: {
                type: data.DeviceOS,
                model: data.DeviceModel,
                id: data.DeviceId,
            },
            version: data.GameVersion,
            lang: data.LanguageCode,
        };

        try {
            const languageNames = JSON.parse(fs.readFileSync(path.join(process.cwd(), "resource_packs", "vanilla", "texts", "language_names.json"), "utf8")) as [string, string][];
            serverData.server.game.players[uuid].lang = languageNames.find(l => l[0] === data.LanguageCode)?.[1] ?? data.LanguageCode;
        } catch { }

        try {
            const geometryName = JSON.parse(Buffer.from(data.SkinResourcePatch, "base64").toString())["geometry"]["default"];
            const geometryData = JSON.parse(Buffer.from(data.SkinGeometryData, "base64").toString());

            const faceTextureOffset: [number, number] = [8, 8];
            const faceTextureSize: [number, number] = [8, 8];

            let fromAnimatedData = false;

            if (geometryData === null) {
                // HD skins
                if (data.SkinImageHeight === 128) {
                    faceTextureOffset[0] = 16;
                    faceTextureOffset[1] = 16;
    
                    faceTextureSize[0] = 16;
                    faceTextureSize[1] = 16;
                }
            } else {
                let geometry: {bones: any[]};
    
                // Format version 1.12.0
                if ("minecraft:geometry" in geometryData) {
                    const geometries = geometryData["minecraft:geometry"];
                    if (Array.isArray(geometries)) {
                        geometry = geometryData["minecraft:geometry"].find((g: any) => g.description.identifier === geometryName);
                    } else {
                    geometry = geometryData["minecraft:geometry"][geometries];
                    }
                }
                // Fomrat version 1.8.0
                else {
                    geometry = geometryData[geometryName];
                }
    
                const headModel = geometry.bones.find(b => b.name === "head");
    
                if (headModel.cubes?.[0]?.uv) {
                    const uv = headModel.cubes[0].uv;
                    const size = headModel.cubes[0].size;
    
                    faceTextureOffset[0] = uv[0] + size[0];
                    faceTextureOffset[1] = uv[1] + size[1];
    
                    faceTextureSize[0] = size[0];
                    faceTextureSize[1] = size[1];
                } else {
                    fromAnimatedData = true;
                }
            }
    
            if (fromAnimatedData) {
                if (data.AnimatedImageData[0]) {
                    serverData.server.game.players[uuid].skin.head = await Utils.readSkinBuffer(Buffer.from(data.AnimatedImageData[0].Image, "base64"), data.AnimatedImageData[0].ImageWidth, data.AnimatedImageData[0].ImageHeight, faceTextureOffset, faceTextureSize);
                } else {
                    panel.log(`Failed to parse ${cert["extraData"]["displayName"]}'s skin image. It will not be seen in the Players panel.`.yellow);
                }
            } else {
                serverData.server.game.players[uuid].skin.head = await Utils.readSkinBuffer(Buffer.from(data.SkinData, "base64"), data.SkinImageWidth, data.SkinImageHeight, faceTextureOffset, faceTextureSize);
            }
        } catch {
            panel.log(`Failed to parse ${cert["extraData"]["displayName"]}'s skin data. It will not be seen in the Players panel.`.yellow);
        }

        Utils.players.set(uuid, ni);
    }
});

events.networkDisconnected.on(data => {
    for (const [uuid, ni] of Utils.players) {
        if (ni.equals(data)) {
            selectedPlayers.splice(selectedPlayers.findIndex(e => e[0] === uuid), 1);
            panel.io.emit(SocketEvents.StopRequestPlayerInfo, uuid);
            const scoreboardId = serverData.server.game.players[uuid].scoreboardId!;
            for (const [name, obj] of Object.entries(serverData.server.game.objectives)) {
                if (obj.scores[scoreboardId]) {
                    obj.scores[scoreboardId].name = "Player Offline";
                }
            }
            delete serverData.server.game.players[uuid];
            Utils.players.delete(uuid);
            break;
        }
    }
});

events.packetAfter(MinecraftPacketIds.PlayerAuthInput).on((pk, ni) => {
    for (const [uuid, _ni] of selectedPlayers) {
        if (_ni.equals(ni)) {
            const data = serverData.server.game.players[uuid];
            const player = ni.getActor()!;
            const { x, y, z } = player.getPosition();
            const blockPos = BlockPos.create(parseInt(x.toFixed(0)), parseInt(y.toFixed(0)), parseInt(z.toFixed(0)));
            data.gameInfo!.pos.x = pk.pos.x;
            data.gameInfo!.pos.y = pk.pos.y;
            data.gameInfo!.pos.z = pk.pos.z;
            data.gameInfo!.rot.x = pk.pitch;
            data.gameInfo!.rot.y = pk.yaw;
            const chunk = player.getRegion().getChunkAt(blockPos);
            if (chunk) {
                data.gameInfo!.biome = chunk.getBiome(ChunkBlockPos.create(blockPos)).name;
            }
            data.gameInfo!.ping = data.ip === "127.0.0.1" ?
                serverInstance.networkHandler.instance.peer.GetLastPing(ni.address) - 30 :
                serverInstance.networkHandler.instance.peer.GetLastPing(ni.address);
            break;
        }
    }
});

events.entityHealthChange.on(event => {
    if (event.entity.isPlayer()) {
        const ni = event.entity.getNetworkIdentifier();
        for (const [uuid, _ni] of selectedPlayers) {
            if (_ni.equals(ni)) {
                const data = serverData.server.game.players[uuid];
                data.gameInfo!.health.current = event.newHealth;
                data.gameInfo!.health.max = event.entity.getMaxHealth();
                break;
            }
        }
    }
});

fs.watchFile(path.join(process.cwd(), "permissions.json"), (curr, prev) => {
    try {
        serverData.server.game.permissions = JSON.parse(fs.readFileSync(path.join(process.cwd(), "permissions.json"), "utf8"));
    } catch { }
});
events.serverClose.on(() => {
    fs.unwatchFile(path.join(process.cwd(), "permissions.json"));
});