import https = require("https");
import os = require("os");
import { NetworkIdentifier } from "bdsx/bds/networkidentifier";
import { Packet } from "bdsx/bds/packet";

export namespace Utils {
    export const players = new Map<string, NetworkIdentifier>();

    export function parseProperties(properties: string): { [key: string]: string } {
        let retval: {[key: string]: string} = {};
        for (let line of properties.replace(/#.+|\r/g, "").split("\n")) {
            if (line.match("=")) {
                retval[line.split("=")[0]] = line.split("=").splice(1).join("=");
            }
        }
        return retval;
    };

    export function getAddress(): string | null {
        const nets = os.networkInterfaces();
        for (const name in nets) {
            const iface = nets[name];
            for (const alias of iface) {
                if (alias.family === "IPv4" && alias.address !== "127.0.0.1" && !alias.internal) {
                    return alias.address;
                }
            }
        }
        return null;
    };

    export function broadcastPacket(pk: Packet) {
        for (const [uuid, ni] of Utils.players) {
            pk.sendTo(ni);
        }
        pk.dispose();
    };

    export async function fetchPlugin(plugin: string) {
        return new Promise<any>((resolve, reject) => {
            https.get(`https://registry.npmjs.org/${plugin}`, res => {
                let data = "";
                res.on("data", chunk => {
                    data += chunk;
                });
                res.on("end", () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.error) {
                            resolve(null);
                        } else {
                            resolve(json);
                        }
                    } catch {
                        resolve(null);
                    }
                });
            });
        });
    }

    export async function fetchAllPlugins() {
        return new Promise<any>((resolve, reject) => {
            https.get("https://registry.npmjs.com/-/v1/search?text=@bdsx/", res => {
                let data = "";
                res.on("data", chunk => {
                    data += chunk;
                });
                res.on("end", () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.error || json.total === 0) {
                            resolve(null);
                        } else {
                            resolve(json.objects);
                        }
                    } catch {
                        resolve(null);
                    }
                });
            });
        });
    }

    export async function checkForPluginUpdates(plugin: string, version: string): Promise<string | "not on npm" | "up to date"> {
        const json = await fetchPlugin(plugin);
        if (json === null) {
            return "not on npm";
        }
        const latest = json["dist-tags"].latest;
        if (version === latest) {
            return "up to date";
        }
        return latest;
    }
}