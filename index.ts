import { events } from "bdsx/event";
import "./src/server";

events.serverOpen.on(() => {
    import("./src/events");
});