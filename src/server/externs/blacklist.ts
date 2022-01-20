import { MinecraftPacketIds } from "bdsx/bds/packetids";
import { serverInstance } from "bdsx/bds/server";
import { events } from "bdsx/event";
import { bedrockServer } from "bdsx/launcher";
import { serverData } from "../data";
import fs = require("fs");
import path = require("path");

class BlacklistEntry {
    gamertag: string;
    altnames = new Array<string>();
    xuid: string;
    uuid: string;
    clientIds = new Array<string>();
    ip = new Array<string>();
}

class Blacklist {
    players = new Array<BlacklistEntry>();
    rules = {
        gamertag: new Array<string>(),
        xuid: new Array<string>(),
        uuid: new Array<string>(),
        clientIds: new Array<string>(),
        ip: new Array<string>(),
    };
}

export let blacklist: Blacklist;

function uniquePush(arr: Array<any>, val: any) {
    if (arr.indexOf(val) === -1) {
        arr.push(val);
    }
}

function loadBlacklist() {
    try {
        serverData.extra.blacklist = require("./blacklist.data.json");
    } catch {
        serverData.extra.blacklist = new Blacklist();
    }
}

function saveBlacklist() {
    try {
        fs.writeFileSync(path.join(__dirname, "./blacklist.data.json"), JSON.stringify(serverData.extra.blacklist, null, 4));
        return true;
    } catch { }
    return false;
}

export function addBlacklistRule<RULE extends keyof Blacklist["rules"]>(rule: RULE, content: string | string[]) {
    const rules = (serverData.extra.blacklist as Blacklist).rules;
    if (typeof content === "string") {
        uniquePush(rules[rule], content);
    } else {
        for (const e of content) {
            uniquePush(rules[rule], e);
        }
    }
    return saveBlacklist();
}

export function removeBlacklistRule<RULE extends keyof Blacklist["rules"]>(rule: RULE, content: string | string[]) {
    const rules = (serverData.extra.blacklist as Blacklist).rules;
    if (typeof content === "string") {
        const index = rules[rule].indexOf(content);
        if (index !== -1) {
            rules[rule].splice(index, 1);
        }
    } else {
        for (const e of content) {
            const index = rules[rule].indexOf(e);
            if (index !== -1) {
                rules[rule].splice(index, 1);
            }
        }
    }
    return saveBlacklist();
}

bedrockServer.afterOpen().then(() => {
    loadBlacklist();
});

events.packetAfter(MinecraftPacketIds.Login).on((pk, ni) => {
    const connreq = pk.connreq;
    if (connreq) {
        const cert = connreq.cert.json.value();
        const data = connreq.getJsonValue()!;

        const gamertag = cert["extraData"]["displayName"];
        const uuid = cert["extraData"]["identity"];
        const xuid = cert["extraData"]["XUID"];
        const clientId = data.ClientRandomId.toString();
        const ip = ni.getAddress().split("|")[0];

        let found = false;

        const entry = (serverData.extra.blacklist as Blacklist).players.find(e => {
            if (e.uuid === uuid ||
            (e.xuid === xuid ||
            (e.clientIds.includes(clientId) ||
            (e.gamertag === gamertag || e.altnames.includes(gamertag))))) {
                found = true;
                return true;
            }
        }) ?? new BlacklistEntry();

        entry.gamertag ||= gamertag;
        uniquePush(entry.altnames, gamertag);
        entry.xuid ||= xuid;
        entry.uuid ||= uuid;
        uniquePush(entry.clientIds, clientId);
        uniquePush(entry.ip, ip);

        if (!found) {
            (serverData.extra.blacklist as Blacklist).players.push(entry);
        }
        saveBlacklist();

        const rules = (serverData.extra.blacklist as Blacklist).rules;
        if (rules.clientIds.includes(clientId) ||
        rules.gamertag.includes(gamertag) ||
        rules.ip.includes(ip) ||
        rules.uuid.includes(uuid) ||
        rules.xuid.includes(xuid)) {
            serverInstance.disconnectClient(ni, "You are blacklisted.");
        }
    }
});