import https = require("https");
import os = require("os");
import Jimp = require("jimp");
import { NetworkIdentifier } from "bdsx/bds/networkidentifier";
import { Packet } from "bdsx/bds/packet";

export namespace Utils {
    export const players = new Map<string, NetworkIdentifier>();
    const skins = new Map<string, NetworkIdentifier>();

    export function escapeUnsafeHTML(unsafe: string): string {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    export function formatConsoleCodesToHTML(text: string): string {
        return Utils.escapeUnsafeHTML(text).replace(/\u001b\[(\d)+m/g, m => {
            switch (m) {
            case "\u001b[22m":
            case "\u001b[23m":
            case "\u001b[24m":
            case "\u001b[27m":
            case "\u001b[28m":
            case "\u001b[29m":
            case "\u001b[39m":
                return "</span>";
            case "\u001b[30m":
                return `<span class="mc-0">`;
            case "\u001b[31m":
                return `<span class="mc-4">`;
            case "\u001b[32m":
                return `<span class="mc-2">`;
            case "\u001b[33m":
                return `<span class="mc-6">`;
            case "\u001b[34m":
                return `<span class="mc-1">`;
            case "\u001b[35m":
                return `<span class="mc-5">`;
            case "\u001b[36m":
                return `<span class="mc-3">`;
            case "\u001b[37m":
                return `<span class="mc-7">`;
            case "\u001b[90m":
                return `<span class="mc-8">`;
            case "\u001b[91m":
                return `<span class="mc-c">`;
            case "\u001b[92m":
                return `<span class="mc-a">`;
            case "\u001b[93m":
                return `<span class="mc-e">`;
            case "\u001b[94m":
                return `<span class="mc-9">`;
            case "\u001b[95m":
                return `<span class="mc-d">`;
            case "\u001b[96m":
                return `<span class="mc-b">`;
            case "\u001b[97m":
                return `<span class="mc-f">`;
            case "\u001b[0m":
                return `<span class="mc-r">`;
            case "\u001b[1m":
                return `<span class="mc-l">`;
            // case "\u001b[2m":
            //     return lazy();
            case "\u001b[3m":
                return `<span class="mc-o">`;
            case "\u001b[4m":
                return `<span class="mc-n">`;
            // case "\u001b[7m":
            //     return lazy();
            case "\u001b[8m":
                return `<span style="opacity: 0>`;
            case "\u001b[9m":
                return `<span class="mc-m">`;
            default:
                return "<span>";
            }
        });
    };

    export function formatColorCodesToHTML(text: string): string {
        let count = 0;
        const out = Utils.escapeUnsafeHTML(text).replace(/§./g, m => {
            count++;
            if (m[1] !== "r") {
                return `<span class="mc-${m[1]}">`;
            }
            return `${"</span>".repeat(count)}<span>`;
        });
        return `${out}${"</span>".repeat(count)}`;
    };

    export function formatPluginName(name: string): string {
        return name.replace(/^@.+\//, "").replace(/-/g, " ").replace(/\w\S*/g, m => m[0].toUpperCase() + m.substr(1).toLowerCase());
    }

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