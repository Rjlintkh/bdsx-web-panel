const app = new Vue({
    el: "#app",
    data: {
        page: "Info",
        status: false,
        info: {
            announcement: {
                name: "",
                level: "",
                players: {
                    current: 0,
                    max: 10
                }
            },
            server: {
                name: "",
                level: "",
                players: {
                    current: 0,
                    max: 10
                },
                sessionId: "",
                version: "",
                port: "",
                plugins: []
            }
        },
        logs: [],
        chats: [],
        players: {},
        plugins: []
    },
    methods: {
        stop: () => socket.emit("control", "stop"),
        kill: () => socket.emit("control", "kill"),
        changesetting: ev => socket.emit("changesetting", { setting: ev.target.name, value: ev.target.value }),
        command: ev => {
            socket.emit("command", ev.target.value);
            ev.target.value = "";
        },
        chat: ev => {
            socket.emit("chat", ev.target.value);
            ev.target.value = "";
        },
        uninstall: ev => {
            mdui.confirm("Uninstall Plugin?",
                () => {
                    socket.emit("plugin.r", ev.target.dataset.plugin)
                    console.log(ev.target.dataset.plugin)
                }
            );
        }
    }
});

const socket = io();

socket.on("message", data => mdui.snackbar({ message: data }));
socket.on("status", data => app.status = data);
socket.on("info.announcement", data => app.info.announcement = data);
socket.on("info.server", data => app.info.server = data);
socket.on("log", data => app.logs.push(data));
socket.on("chat", data => app.chats.push(data));
socket.on("player", data => {
    switch (data.event) {
        case "join":
            app.players[data.uuid] = data;
            break;
        case "leave":
            delete app.players[data.uuid];
            break;
    }
});