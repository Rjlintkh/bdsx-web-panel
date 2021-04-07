
import fs = require("fs");
import path = require("path");
import { utils } from "./api"

export const tmp = {
    started: false,
    status: false,
    info: {
        announcement: {
            name: "",
            level: "",
            players: {
                current: 0,
                max: -1,
            }
        },
        server: {
            name: "",
            level: "",
            address: "",
            port: 0,
            version: "",
            bdsx: "",
            sessionId: "",
            players: {
                current: 0,
                max: -1,
            },
            plugins: []
        },
    },
    logs: [],
    chats: [],
    players: new Map()
}

export const serverProperties = utils.parseProperties(fs.readFileSync(path.join(process.cwd(), "server.properties"), "utf8"));