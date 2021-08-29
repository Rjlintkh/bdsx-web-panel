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
        modal: (title, content, primary, secondary, callback) => {
            const backdrop = document.createElement("div");
            backdrop.className = "modal-backdrop fade show";
            backdrop.style.zIndex = "1080";
            document.body.appendChild(backdrop);
            const modal = document.createElement("div");
            modal.className = "modal fade";
            modal.style.zIndex = "1090";
            modal.tabIndex = "-1";
            modal.role = "dialog";
            modal.setAttribute("aria-hidden", "true");
            modal.innerHTML = 
                `<div class="modal-dialog modal-dialog-centered" role="document">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="exampleModalLongTitle">${title}</h5>
                            <button type="button" class="close" data-dismiss aria-label="Close">
                            <span aria-hidden="true">&times;</span>
                            </button>
                        </div>
                        <div class="modal-body">
                            ${content}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-dismiss>${secondary}</button>
                            <button type="button" class="btn btn-primary">${primary}</button>
                        </div>
                    </div>
                </div>`;
            modal.querySelectorAll("button").forEach(element => {
                element.addEventListener("click", () => {
                    callback(element.getAttribute("data-dismiss") === null);
                    document.body.removeChild(backdrop);
                    modal.classList.remove("show");
                    setTimeout(() => {
                        document.body.removeChild(modal);
                    }, 150);
                });
            });
            document.body.appendChild(modal);
            modal.style.display = "block";
            setTimeout(() => {
                modal.classList.add("show");
            }, 150);
        },
        stopServer: () => {
            app.modal("Stop Server", "Are you sure you want to stop the server?", "Stop", "Cancel", confirm => {
                if (confirm) {
                    socket.emit("StopServer")
                }
            });
        },
        restartServer: () => {
            app.modal("Restart Server", "Are you sure you want to restart the server?", "Restart", "Cancel", confirm => {
                if (confirm) {
                    socket.emit("RestartServer")
                }
            });
        },
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
            app.modal("Install Plugin", `Are you sure you want to install the plugin ${plugin}?`, "Install", "Cancel", confirm => {
                if (confirm) {
                    socket.emit("InstallPlugin", plugin, version);
                }
            });
        },
        removePlugin: plugin => {
            app.modal("Remove Plugin", `Are you sure you want to remove the plugin ${plugin}?`, "Remove", "Cancel", confirm => {
                if (confirm) {
                    socket.emit("RemovePlugin", plugin);
                }
            });
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
            app.modal("Kick Player", `Are you sure you want to kick ${app.data.selectedPlayer.name}?`, "Kick", "Cancel", confirm => {
                if (confirm) {
                    socket.emit("KickPlayer", uuid, reason);
                }
            });
        },
        setScore: (sid, obj, score) => {
            socket.emit("SetScore", sid, obj, score);
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

socket.on("Toast", (message, type = "secondary", timeout = 3000) => {
    const toast = document.createElement("div");
    toast.className = `alert alert-${type} fixed-bottom mb-0`;
    toast.style.zIndex = "1070";
    toast.style.bottom = "-50px";
    toast.innerHTML = message;
    toast.style.transition = "bottom 0.3s";
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.bottom = "0";
    }, 300);
    setTimeout(() => {
        toast.style.bottom = "-50px";
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, timeout);
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