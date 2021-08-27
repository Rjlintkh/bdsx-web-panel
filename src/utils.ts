import https = require("https");
import os = require("os");
import Jimp = require("jimp");
import { NetworkIdentifier } from "bdsx/bds/networkidentifier";
import { Packet } from "bdsx/bds/packet";

export namespace Utils {
    export const players = new Map<string, NetworkIdentifier>();
    const skins = new Map<string, NetworkIdentifier>();

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

    export async function readSkinBuffer(buffer: Buffer, width: number, height: number, uv?: [number, number], size: [number, number] = [width, height]): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            new Jimp(width, height, (err, image) => {
                if (err) {
                    console.error(err);
                    reject(err);
                }
                let offset = 0;
                const colors = new Array<number>();
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const rgba = Jimp.rgbaToInt(
                            buffer.readUInt8(offset),
                            buffer.readUInt8(offset + 1),
                            buffer.readUInt8(offset + 2),
                            buffer.readUInt8(offset + 3),
                            () => {}
                        );
                        colors.push(rgba);
                        offset += 4;
                        image.setPixelColor(rgba, x, y);
                    }
                }
                if (uv) {
                    image.crop(uv[0], uv[1], size[0], size[1]);
                }
                image.getBase64(Jimp.MIME_PNG, (err, base64Image) => {
                    if (err) {
                        console.error(err);
                        reject(err);
                    }
                    resolve(base64Image);
                });
            });
        });
    }
}