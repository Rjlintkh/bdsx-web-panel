import child_process = require("child_process");
import fs = require("fs");
import os = require("os");
import path = require("path");
import { bedrockServer } from "bdsx/launcher";
import { serverInstance } from "bdsx";
import { loadedPlugins } from "bdsx/plugins";
import { api } from "./api";
import { serverProperties, tmp } from "./data";
import { TextPacket } from "bdsx/bds/packets";

const app = require("express")();
const http = require("http").createServer(app);
export const io = require("socket.io")(http);
const nets = os.networkInterfaces();

app.get("/", (req: any, res: any) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/app.js", (req: any, res: any) => {
    res.sendFile(path.join(__dirname, "app.js"));
});

app.get("/favicon.ico", (req: any, res: any) => {
    res.sendFile(path.join(process.cwd(), "../bdsx/icon/icon.png"));
});

io.on("connection", (socket: any) => {
    for (let data of tmp.logs) {
        socket.emit("log", data);
    }
    for (let data of tmp.chats) {
        socket.emit("chat", data);
    }
    for (let [ni, player] of tmp.players) {
        socket.emit("player", player);
    }
    socket.emit("status", tmp.status);
    socket.emit("info.server", tmp.info.server);
    socket.emit("info.announcement", tmp.info.announcement);
    socket.on("command", (data: any) => {
        socket.emit("message", "Command sent");
        bedrockServer.executeCommandOnConsole(data);
    });
    socket.on("chat", (data: any) => {
        let pk = TextPacket.create();
        pk.type = 1;
        pk.name = "Server";
        pk.message = data;
        for (let [ni] of tmp.players) {
            pk.sendTo(ni);
        }
        pk.dispose();
        socket.emit("message", "Message sent");
        let _data = {
            name: "Server",
            message: data,
            time: new Date().toLocaleTimeString(),
        };
        tmp.chats.push(_data as never);
        io.emit("chat", _data);
    });
    socket.on("control", (data: any) => {
        switch (data) {
            case "stop":
                bedrockServer.stop();
                socket.emit("message", "Stopped server");
                break;
            case "kill":
                bedrockServer.forceKill(0);
        }
    });
    socket.on("plugin.r", (data: any) => {
        child_process.execSync(`npm r ${data}`, { cwd: path.join(process.cwd()) });
        tmp.info.server.plugins.splice(tmp.info.server.plugins.findIndex((plugin: any) => plugin.name === data), 1);
        io.emit("info.server", tmp.info.server);
        socket.emit("message", `Uninstalled plugin ${data}`);
    });
    socket.on("disconnect", () => {
    });
});

http.listen(Number(serverProperties["server-port"]));

const sockets: any = {};
let nextSocketId = 0;
http.on("connection", (socket: any) => {
    let socketId = nextSocketId++;
    sockets[socketId] = socket;
    socket.on("close", () => {
        delete sockets[socketId];
    });
    socket.setTimeout(5000);
});

bedrockServer.open.on(() => {
    tmp.status = true;
    io.emit("status", tmp.status);
    tmp.info.server.name = serverInstance.getMotd();
    for (let name in nets) {
        let iface = nets[name];
        for (let alias of iface) {
            if (alias.family === "IPv4" && alias.address !== "127.0.0.1" && !alias.internal) {
                if (!tmp.info.server.address) {
                    tmp.info.server.address = alias.address;
                }
            }
        }
    }
    tmp.info.server.port = api.RakNetInstance.getPort(serverInstance.networkHandler.instance);
    tmp.info.server.version = "v" + JSON.parse(fs.readFileSync(path.join(process.cwd(), "../bdsx/version-bds.json"), "utf-8"));
    tmp.info.server.bdsx = JSON.parse(fs.readFileSync(path.join(process.cwd(), "../bdsx/version-bdsx.json"), "utf-8"));
    tmp.info.server.sessionId = bedrockServer.sessionId;
    tmp.info.server.players.max = serverInstance.getMaxPlayers();
    for (let name of loadedPlugins) {
        let plugin = JSON.parse(fs.readFileSync(path.join(process.cwd(), "../node_modules/", name, "package.json"), "utf8"));
        let data = {
            name: name,
            version: plugin["version"],
            description: plugin["description"],
            author: plugin["author"]?.["name"] || plugin["author"] || "Unknown",
            extra: {
                license: plugin["license"] || "No license",
                bugs: plugin["bugs"]?.["url"],
                homepage: plugin["homepage"],
            }
        }
        tmp.info.server.plugins.push(data as never);
    }
    io.emit("info.server", tmp.info.server);
});

bedrockServer.close.on(() => {
    tmp.status = false;
    io.emit("status", tmp.status);
    setTimeout(() => {
        http.close();
        for (let socketId in sockets) {
            sockets[socketId].destroy();
        }
    }, 3000);
});

{
    const _process$stdout$write = process.stdout.write.bind(process.stdout);

    process.stdout.write = (buffer: any, callback: any) => {
        let data = {
            message: buffer.toString().replace(/(\[\d+m|\u001b)/g, ""),
            time: new Date().toLocaleTimeString(),
        };
        if (!tmp.info.server.level) {
            let match = data.message.match(/\[INFO\] opening .+/);
            if (match) {
                tmp.info.server.level = match[0].replace("[INFO] opening ", "");
            }
        }
        tmp.logs.push(data as never);
        io.emit("log", data);
        return _process$stdout$write(buffer, callback);
    };
}