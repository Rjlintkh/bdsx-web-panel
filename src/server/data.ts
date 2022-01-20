import fs = require("fs");
import path = require("path");
import os = require("os");
import pidusage = require("pidusage")
import { GameRule } from "bdsx/bds/gamerules";
import { NetworkIdentifier } from "bdsx/bds/networkidentifier";
import { DeviceOS } from "bdsx/common";
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
        ping: number,
        pos: {
            x: number,
            y: number,
            z: number,
        },
        rot: {
            x: number,
            y: number,
        },
        biome: string,
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
            players: {
                [uuid: string]: PlayerData,
            },
            objectives: {
                [name: string]: {
                    displayName: string,
                    pinned: string,
                    scores: {
                        [id: number]: {
                            name: string,
                            value: number|string,
                        }
                    }
                }
            },
            permissions: any,
            options: {
                [category: string]: {
                    [name: string]: {
                        displayName: string,
                        type: GameRule.Type,
                        enum?: string[],
                        value: any,
                    }
                }
            }
        }
    },
    extra: any,
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
            options: {}
        }
    },
    extra: {}
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

export const selectedPlayers = new Array<[string, NetworkIdentifier]>();

require("./data/config");
require("./data/players");
require("./data/scores");
require("./data/server");
require("./data/texts");

require("./externs/blacklist");