import fs = require("fs");
import path = require("path");
import os = require("os");
import pidusage = require("pidusage")
import { MinecraftPacketIds } from "bdsx/bds/packetids";
import { TextPacket } from "bdsx/bds/packets";
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
    device: {
        type: DeviceOS,
        id: string,
    },
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
            }[]
        },
        game: {
            tps: number,
            players: Record<string, PlayerData>,
            objectives: Record<string, {
                displayName: string,
                scores: {
                    name: string,
                    value: number
                }
            }[]>,
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
    set: (data: any, path:string, value:any): boolean => {
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
            message: pk.message,
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
            log: buffer.toString().replace(/(\[\d+m|\u001b)/g, ""),
            time: new Date().getTime(),
        });
        return original(buffer, callback);
    };
}
events.packetAfter(MinecraftPacketIds.Login).on((pk, ni) => {
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
            device: {
                type: data.DeviceOS,
                id: data.DeviceId,
            }
        };
        Utils.players.set(uuid, ni);
    }
});
events.networkDisconnected.on(data => {
    for (const [uuid, ni] of Utils.players) {
        if (ni.equals(data)) {
            console.log(uuid, serverData.server.game.players);
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