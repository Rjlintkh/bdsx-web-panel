<<<<<<< HEAD
import "./src/server/main";
=======
import { events } from "bdsx/event";
import "./src/server";

events.serverOpen.on(() => {
    import("./src/events");
});
>>>>>>> 477bfd30c98b2ced27ecbb6ba2a4b4ab4276130b
