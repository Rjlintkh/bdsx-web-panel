const loading = "Loading...";

const app = new Vue({
    el: "#app",
    data: {
        page: "Overview",
        data: {
            status: 0,
            machine: {
                os: loading,
                name: loading,
                network: {
                    ip: loading,
                    port: 0
                }
            },
            process: {
                sessionId: loading,
                pid: 0,
                cwd: loading,
                user: loading,
                usage: {
                    cpu: [],
                    ram: []
                }
            },
            server: {
                version: loading,
                protocol: 0,
                bdsx: loading,
                uptime: 0,
                announcement: {
                    name: loading,
                    level: loading,
                    players: {
                        current: 0,
                        max: 0,
                    }
                },
                info: {
                    name: loading,
                    level: loading,
                    players: {
                        current: 0,
                        max: 0,
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
                    objectives: {}
                }
            }
        }
    },
    methods: {
        stopServer: () => socket.emit("StopServer"),
        restartServer: () => socket.emit("RestartServer"),
        command: ev => {
            socket.emit("InputCommand", ev.target.value);
            ev.target.value = "";
        },
        chat: ev => {
            socket.emit("InputChat", ev.target.value);
            ev.target.value = "";
        },
        checkForPluginUpdates: (plugin, version) => {
            socket.emit("CheckForPluginUpdates", plugin, version);
        },
        installPlugin: (plugin, version) => {
            socket.emit("InstallPlugin", plugin, version);
        },
        removePlugin: plugin => {
            socket.emit("RemovePlugin", plugin);
        },
        selectPlayer: player => {
            if (app.data.selectedPlayer?.uuid === player.uuid) {
                app.data.selectedPlayer = undefined;
                socket.emit("StopRequestPlayerInfo", player.uuid);
            } else {
                app.data.selectedPlayer = player;
                socket.emit("StartRequestPlayerInfo", player.uuid);
                // setTimeout(() => {
                //     new GuiRender(player, document.getElementById("inventory-render"));
                // }, 1000);
            }
        },
        kickPlayer: (uuid, reason = null) => {
            socket.emit("KickPlayer", uuid, reason);
        },
    }
});

const socket = io();
socket.on("SyncServerData", data => {
    if (data.path.length === 0) {
        app.data = data.value;
    }
    let obj = app.data;
    while (data.path.length > 1) {
        obj = obj[data.path.shift()];
    }
    if (data.delete) {
        delete obj[data.path[0]];
    } else {
        obj[data.path[0]] = data.value;
    }
});

const ramChart = new Chart(
    document.getElementById("resource-usage-chart"),
    {
        type: "line",
        data: {
            labels: [],
            datasets: [{
                label: "RAM (%)",
                pointRadius: 0,
                backgroundColor: "rgba(255, 99, 132, 0.3)",
                borderColor: "rgb(255, 99, 132)",
                data: [],
            },
            {
                label: "CPU (%)",
                pointRadius: 0,
                backgroundColor: "rgba(137, 209, 254, 0.3)",
                borderColor: "rgb(137, 209, 254)",
                data: [],
            }]
        },
        options: {
            hover: {
                mode: "label"
            },
            scales: {
                yAxes: [{
                    display: true,
                    ticks: {
                        beginAtZero: true,
                        steps: 10,
                        stepValue: 5,
                        max: 100
                    }
                }]
            },
        }
    }
);

socket.on("UpdateResourceUsage", () => {
    ramChart.data.labels = app.data.process.usage.ram.map(e => new Date(e.time).toUTCString().slice(-12, -7));
    ramChart.data.datasets[0].data = app.data.process.usage.ram.map(e => e.percent);
    ramChart.data.datasets[1].data = app.data.process.usage.cpu.map(e => e.percent);
    ramChart.update();
});
// socket.on("UpdateRequestedPlayerInventory", () => {
//     if (app.data.selectedPlayer) {
//         document.getElementById("inventory-render").innerHTML = "";
//         const guiRender = new GuiRender(app.data.selectedPlayer.gameInfo.inv.options, document.getElementById("inventory-render"));
//         guiRender.render(app.data.selectedPlayer.gameInfo.inv.content);
//     }
// });
socket.on("StopRequestPlayerInfo", uuid => {
    if (app.data.selectedPlayer?.uuid === uuid) {
        app.data.selectedPlayer = undefined;
    }
});

socket.on("Toast", message => {
    console.info("toast", message);
});

socket.on("disconnect", function () {
    app.data.status = 0;
    app.data.selectedPlayer = undefined;
});

window.addEventListener("beforeunload", () => {
    if (app.data.selectedPlayer?.uuid) {
        socket.emit("StopRequestPlayerInfo", player.uuid);
    }
 }, false);