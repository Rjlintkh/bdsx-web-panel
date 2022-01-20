import path = require("path");
import { events } from "bdsx/event";
import { serverProperties } from "bdsx/serverproperties";
import { serverData } from "./data";

export enum SocketEvents {
    // Login
    Login = "Login",
    Logout = "Logout",

    // Data
    SyncServerData = "SyncServerData",
    UpdateResourceUsage = "UpdateResourceUsage",

    // GUI
    Toast = "Toast",

    // Input
    InputChat = "InputChat",
    InputCommand = "InputCommand",

    // Server Control
    StopServer = "StopServer",
    RestartServer = "RestartServer",

    // Plugins
    CheckForPluginUpdates = "CheckForPluginUpdates",
    InstallPlugin = "InstallPlugin",
    RemovePlugin = "RemovePlugin",

    // Game
    StartRequestPlayerInfo = "StartRequestPlayerInfo",
    StopRequestPlayerInfo = "StopRequestPlayerInfo",
    UpdateRequestedPlayerInventory = "UpdateRequestedPlayerInventory",
    KickPlayer = "KickPlayer",
    SetScore = "SetScore",
    ChangeSetting = "ChangeSetting",

    // Blacklist
    AddBlacklistRule = "AddBlacklistRule",
    RemoveBlacklistRule = "RemoveBlacklistRule",
}


class ServerPanel {
    readonly express = require("express");
    readonly app = this.express();
    readonly http = require("http").createServer(this.app);
    readonly io = require("socket.io")(this.http);
    private sockets: any = {};
    private nextSocketId = 0;
    config = require("../../config.json");
    getPanelPort():number {
        if (this.config["same_port_with_bds"]) {
            return Number(serverProperties["server-port"]);
        } else {
            return this.config["port"];
        }
    }
    init() {
        this.log(`Setting up http server...`);
        this.app.get(this.config.path, (req: any, res: any) => {
            res.sendFile(path.join(__dirname, "../gui/index.html"));
        });
        this.app.get("/favicon.ico", (req: any, res: any) => {
            res.sendFile(path.join(process.cwd(), "../bdsx/images/icon.png"));
        });
        this.app.use(this.config.path, this.express.static(path.join(__dirname, "../gui")));
        const port = this.getPanelPort();
        this.http.listen(port);
        this.log(`Listening on port ${port}.`);
        this.http.on("connection", (socket: any) => {
            let socketId = this.nextSocketId++;
            this.sockets[socketId] = socket;
            socket.on("close", () => {
                delete this.sockets[socketId];
            });
            socket.setTimeout(5000);
        });
        require("./socket");
        events.serverStop.on(() => {
            panel.close();
        });
    }
    close() {
        serverData.status = 0;
        this.log("Closing connections...");
        setTimeout(() => {
            this.http.close();
            for (let socketId in this.sockets) {
                this.sockets[socketId].destroy();
            }
            this.log("Closed all connections.");
        }, 3000).unref();
    }
    log(...args: any) {
        console.log(`[BDSX Web Panel]`.green, ...arguments);
    }
    toastAll(message: string, type: string = "secondary", timeout: number = 3000) {
        this.io.emit(SocketEvents.Toast, message, type, timeout);
    }
}

export const panel = new ServerPanel();
