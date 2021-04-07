import { bedrockServer } from "bdsx";
import "./src/server";

bedrockServer.open.on(() => {
    import("./src/events");
});