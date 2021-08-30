import fs = require("fs");
import path = require("path");
import os = require("os");
import pidusage = require("pidusage")
import { NetworkIdentifier } from "bdsx/bds/networkidentifier";
import { MinecraftPacketIds } from "bdsx/bds/packetids";
import { TextPacket } from "bdsx/bds/packets";
import { DisplaySlot } from "bdsx/bds/scoreboard";
import { serverInstance } from "bdsx/bds/server";
import { DeviceOS } from "bdsx/common";
import { events } from "bdsx/event";
import { bedrockServer } from "bdsx/launcher";
import { loadedPackages, loadedPlugins } from "bdsx/plugins";
import { serverProperties } from "bdsx/serverproperties";
import { Utils } from "../utils";
import { panel, SocketEvents } from "./server";

class DeepProxy {
    private _preproxy: WeakMap<object, any>;
    private _handler: {set: any, deleteProperty:any};
    constructor(target: Record<string, any>, handler:{set: any, deleteProperty:any}) {
        this._preproxy = new WeakMap();
        this._handler = handler;
        return this.proxify(target, []) as any;
    }

    private makeHandler(path: string[]) {
        let dp = this;
        return {
            set(target: Record<string, any>, key: string, value: any, receiver: any) {
                if (typeof value === "object") {
                    value = dp.proxify(value, [...path, key]);
                }
                target[key] = value;

                if (dp._handler.set) {
                    dp._handler.set(target, [...path, key], value, receiver);
                }
                return true;
            },

            deleteProperty(target: Record<string, any>, key: string) {
                if (Reflect.has(target, key)) {
                    dp.unproxy(target, key);
                    let deleted = Reflect.deleteProperty(target, key);
                    if (deleted && dp._handler.deleteProperty) {
                        dp._handler.deleteProperty(target, [...path, key]);
                    }
                    return deleted;
                }
                return false;
            }
        }
    }

    private unproxy(obj: Record<string, any>, key: string) {
        if (this._preproxy.has(obj[key])) {
            obj[key] = this._preproxy.get(obj[key]);
            this._preproxy.delete(obj[key]);
        }

        for (const k of Object.keys(obj[key])) {
            if (typeof obj[key][k] === "object") {
                this.unproxy(obj[key], k);
            }
        }

    }

    private proxify(obj: Record<string, any>, path: string[]) {
        for (let key of Object.keys(obj)) {
            if (typeof obj[key] === "object") {
                obj[key] = this.proxify(obj[key], [...path, key]);
            }
        }
        let p = new Proxy(obj, this.makeHandler(path));
        this._preproxy.set(p, obj);
        return p;
    }
}

interface PlayerData {
    name: string,
    uuid: string,
    xuid: string,
    ip: string,
    skin: {
        head: string,
    },
    device: {
        type: DeviceOS,
        model: string,
        id: string,
    },
    version: string,
    lang: string,
    scoreboardId?: number,
    gameInfo?: {
        pos: {
            x: number,
            y: number,
            z: number,
        },
        rot: {
            x: number,
            y: number,
        },
        lvl: number,
        health: {
            current: number,
            max: number,
        },
        food: {
            current: number,
            max: number,
        },
        //inv: InventoryRenderer,
    }
}

interface ServerData {
    status: 0|1,
    machine: {
        os: string,
        name: string,
        network: {
            ip: string,
            port: number
        }
    },
    process: {
        sessionId: string,
        pid: number,
        cwd: string,
        user: string,
        usage: {
            cpu: {
                percent: number,
                time: number
            }[],
            ram: {
                percent: number,
                time: number
            }[],
        }
    },
    server: {
        version: string,
        protocol: number,
        bdsx: string,
        uptime: number,
        announcement: {
            name: string,
            level: string,
            players: {
                current: number,
                max: number,
            }
        },
        info: {
            name: string,
            level: string,
            players: {
                current: number,
                max: number,
            }
        },
        plugins: any[],
        onlinePlugins: any[],
        logs: {
            chat: {
                name: string,
                message: string,
                time: number
            }[],
            commands: {
                name: string,
                command: string,
                time: number
            }[],
            console: {
                log: string,
                time: number
            }[],
        },
        game: {
            tps: number,
            players: Record<string, PlayerData>,
            objectives: Record<string, {
                displayName: string,
                pinned: string,
                scores: Record<number, {
                    name: string,
                    value: number|string,
                }>,
            }>,
            permissions: any,
        }
    },
}

const data: ServerData = {
    status: 0,
    machine: {
        os: `${os.type()} ${os.release()}`,
        name: os.hostname(),
        network: {
            ip: Utils.getAddress()!,
            port: parseInt(serverProperties["server-port"]!)
        }
    },
    process: {
        sessionId: "",
        pid: process.pid,
        cwd: process.cwd(),
        user: os.userInfo().username,
        usage: {
            cpu: [],
            ram: []
        }
    },
    server: {
        version: "0.0.0",
        protocol: 0,
        bdsx: require("bdsx/version-bdsx.json"),
        uptime: 0,
        announcement: {
            name: "",
            level: "",
            players: {
                current: 0,
                max: 0,
            }
        },
        info: {
            name: serverProperties["server-name"]!,
            level: serverProperties["level-name"]!,
            players: {
                current: 0,
                max: parseInt(serverProperties["max-players"]!),
            }
        },
        plugins: [],
        onlinePlugins: [],
        logs: {
            chat: [],
            commands: [],
            console: []
        },
        game: {
            tps: 0,
            players: {},
            objectives: {},
            permissions: require(path.join(process.cwd(), "permissions.json")),
        }
    }
};

export const serverData = new DeepProxy(data, {
    set: (data: any, path:string[], value:any): boolean => {
        panel.io.emit(SocketEvents.SyncServerData, {
            path,
            value,
        });
        return true;
    },
    deleteProperty(data: any, path:string): boolean {
        panel.io.emit(SocketEvents.SyncServerData, {
            path,
            delete: true,
        });
        return true;
    }
}) as any as ServerData;

let tps = 0;
function refreshScoreboard() {
    const scoreboard = serverInstance.minecraft.getLevel().getScoreboard();
    const pinned = [scoreboard.getDisplayObjective(DisplaySlot.BelowName), scoreboard.getDisplayObjective(DisplaySlot.List), scoreboard.getDisplayObjective(DisplaySlot.Sidebar)];
    const trackedIds = scoreboard.getTrackedIds();
    for (const objective of scoreboard.getObjectives()) {
        const scores: Record<number, {
            name: string,
            value: number|string,
        }> = {};
        for (const scoreboardId of trackedIds) {
            const score = objective.getPlayerScore(scoreboardId);
            if (score.valid) {
                scores[scoreboardId.idAsNumber] = {
                    name: scoreboardId.identityDef.getName() ?? "Player Offline",
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
export const selectedPlayers = new Array<[string, NetworkIdentifier]>();
bedrockServer.afterOpen().then(() => {
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
        pidusage(process.pid, (err, stats) => {
            serverData.process.usage.ram.push({
                percent: stats.memory * 100 / os.totalmem(),
                time,
            });
            serverData.process.usage.cpu.push({
                percent: stats.cpu,
                time,
            });
            panel.io.emit(SocketEvents.UpdateResourceUsage);
        });
        return _;
    }(), 60000).unref();
});
events.queryRegenerate.on(event => {
    serverData.server.announcement.name = event.motd;
    serverData.server.announcement.level = event.levelname;
    serverData.server.announcement.players.current = event.currentPlayers
    serverData.server.announcement.players.max = event.maxPlayers;
});
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
            serverData.server.game.players[uuid].skin.head = await Utils.readSkinBuffer(Buffer.from(data.AnimatedImageData[0].Image, "base64"), data.AnimatedImageData[0].ImageWidth, data.AnimatedImageData[0].ImageHeight, faceTextureOffset, faceTextureSize);
        } else {
            serverData.server.game.players[uuid].skin.head = await Utils.readSkinBuffer(Buffer.from(data.SkinData, "base64"), data.SkinImageWidth, data.SkinImageHeight, faceTextureOffset, faceTextureSize);
        }

        Utils.players.set(uuid, ni);
    }
});
// events.packetRaw(MinecraftPacketIds.PlayerSkin).on(async (ptr, size, ni) => {
//     for (const [uuid, _ni] of Utils.players) {
//         if (_ni.equals(ni)) {
//             console.log("started");
//             ptr.move(1);
//             ptr.readBin64();
//             ptr.readBin64();
//             const data: any = {};
//             data.skinId = ptr.readVarString();
//             data.skinPlayFabId = ptr.readVarString();
//             data.skinResourcePatch = ptr.readVarString();
//             data.skinData = {
//                 width: ptr.readInt32(),
//                 height: ptr.readInt32(),
//                 data: ptr.readVarString(),
//             };
//             data.animations = [];
//             for (let i = 0; i < ptr.readInt32(); i++) {
//                 data.animations.push({
//                     skinImage: {
//                         width: ptr.readInt32(),
//                         height: ptr.readInt32(),
//                         data: ptr.readVarString(),
//                     },
//                     animationType : ptr.readInt32(),
//                     animationFrames : ptr.readFloat64(),
//                     expressionType : ptr.readInt32(),
//                 });
//             }
//             data.capeData = {
//                 width: ptr.readInt32(),
//                 height: ptr.readInt32(),
//                 data: ptr.readVarString(),
//             };
//             data.geometryData = ptr.readVarString();
//             data.animationData = ptr.readVarString();
//             data.premium = ptr.readBoolean();
//             data.persona = ptr.readBoolean();
//             data.capeOnClassic = ptr.readBoolean();
//             data.capeId = ptr.readVarString();
//             data.fullSkinId = ptr.readVarString();
//             data.armSize = ptr.readVarString();
//             data.skinColor = ptr.readVarString();
//             data.personaPieces = [];
//             for (let i = 0; i < ptr.readInt32(); i++) {
//                 data.personaPieces.push({
//                     pieceId: ptr.readVarString(),
//                     pieceType: ptr.readVarString(),
//                     packId: ptr.readVarString(),
//                     isDefaultPiece: ptr.readBoolean(),
//                     productId: ptr.readVarString(),
//                 });
//             }
//             data.pieceTintColors = [];
//             for (let i = 0; i < ptr.readInt32(); i++) {
//                 const color = {
//                     pieceType: ptr.readVarString(),
//                     colors: new Array<string>(),
//                 };
//                 for (let j = 0; j < ptr.readInt32(); j++) {
//                     color.colors.push(ptr.readVarString());
//                 }
//                 data.pieceTintColors.push(color);
//             }

//             console.log("mid1");

//             const geometryName = JSON.parse(data.skinResourcePatch)["geometry"]["default"];
//             console.log("mid2");
//             const geometryData = JSON.parse(data.geometryData);
//             console.log("mid3");

//             const faceTextureOffset: [number, number] = [8, 8];
//             const faceTextureSize: [number, number] = [8, 8];

//             let fromAnimatedData = false;

//             if (geometryData === null) {
//                 // HD skins
//                 if (data.skinData.height === 128) {
//                     faceTextureOffset[0] = 16;
//                     faceTextureOffset[1] = 16;

//                     faceTextureSize[0] = 16;
//                     faceTextureSize[1] = 16;
//                 }
//             } else {
//                 let geometry: {bones: any[]};

//                 // Format version 1.12.0
//                 if ("minecraft:geometry" in geometryData) {
//                     const geometries = geometryData["minecraft:geometry"];
//                     if (Array.isArray(geometries)) {
//                         geometry = geometryData["minecraft:geometry"].find((g: any) => g.description.identifier === geometryName);
//                     } else {
//                     geometry = geometryData["minecraft:geometry"][geometries];
//                     }
//                 }
//                 // Fomrat version 1.8.0
//                 else {
//                     geometry = geometryData[geometryName];
//                 }

//                 const headModel = geometry.bones.find(b => b.name === "head");

//                 if (headModel.cubes?.[0]?.uv) {
//                     const uv = headModel.cubes[0].uv;
//                     const size = headModel.cubes[0].size;

//                     faceTextureOffset[0] = uv[0] + size[0];
//                     faceTextureOffset[1] = uv[1] + size[1];

//                     faceTextureSize[0] = size[0];
//                     faceTextureSize[1] = size[1];
//                 } else {
//                     fromAnimatedData = true;
//                 }

//                 console.log("done1", data.skinData.data);
//             }

//             // Unknown encoding
//             if (fromAnimatedData) {
//                 serverData.server.game.players[uuid].skin.head = await Utils.readSkinBuffer(Buffer.from(data.animations[0].skinImage.data, "utf8"), data.animations[0].skinImage.width, data.animations[0].skinImage.height, faceTextureOffset, faceTextureSize);
//             } else {
//                 serverData.server.game.players[uuid].skin.head = await Utils.readSkinBuffer(Buffer.from(data.skinData.data, "utf8"), data.skinData.width, data.skinData.height, faceTextureOffset, faceTextureSize);
//             }
//             console.log("done2");
//             break;
//         }
//     }
// });

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
events.levelTick.on(() => {
    tps += 1;
});
fs.watchFile(path.join(process.cwd(), "permissions.json"), (curr, prev) => {
    try {
        serverData.server.game.permissions = JSON.parse(fs.readFileSync(path.join(process.cwd(), "permissions.json"), "utf8"));
    } catch { }
});
events.serverClose.on(() => {
    fs.unwatchFile(path.join(process.cwd(), "permissions.json"));
});

// Player Info
events.packetAfter(MinecraftPacketIds.PlayerAuthInput).on((pk, ni) => {
    for (const [uuid, _ni] of selectedPlayers) {
        if (_ni.equals(ni)) {
            serverData.server.game.players[uuid].gameInfo!.pos.x = pk.pos.x;
            serverData.server.game.players[uuid].gameInfo!.pos.y = pk.pos.y;
            serverData.server.game.players[uuid].gameInfo!.pos.z = pk.pos.z;
            serverData.server.game.players[uuid].gameInfo!.rot.x = pk.pitch;
            serverData.server.game.players[uuid].gameInfo!.rot.y = pk.yaw;
            break;
        }
    }
});
events.entityHealthChange.on(event => {
    if (event.entity.isPlayer()) {
        const ni = event.entity.getNetworkIdentifier();
        for (const [uuid, _ni] of selectedPlayers) {
            if (_ni.equals(ni)) {
                serverData.server.game.players[uuid].gameInfo!.health.current = event.newHealth;
                serverData.server.game.players[uuid].gameInfo!.health.max = event.entity.getMaxHealth();
                break;
            }
        }
    }
});
// events.playerInventoryChange.on(event => {
//     const ni = event.player.getNetworkIdentifier();
//     for (const [uuid, _ni] of selectedPlayers) {
//         if (_ni.equals(ni)) {
//             serverData.server.game.players[uuid].gameInfo!.inv = new InventoryRenderer(event.player.getInventory());
//             panel.io.emit(SocketEvents.UpdateRequestedPlayerInventory);
//             break;
//         }
//     }
// });
events.objectiveCreate.on(objective => {
    serverData.server.game.objectives[objective.name] = {
        displayName: Utils.formatColorCodesToHTML(objective.displayName),
        pinned: "",
        scores: {},
    };
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
