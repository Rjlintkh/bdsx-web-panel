import { RakNetInstance } from "bdsx/bds/raknetinstance";
import { NativePointer, pdb, VoidPointer } from "bdsx/core";
import { ProcHacker } from "bdsx/prochacker";

import * as path from "path";
import { CxxStringWrapper } from "bdsx/pointer";
import { UNDNAME_NAME_ONLY } from "../../bdsx/dbghelp";
import { int32_t } from "../../bdsx/nativetype";

const hacker = ProcHacker.load(path.join(__dirname, "pdbcache.ini"), [
    "RakNetInstance::getPort",
], UNDNAME_NAME_ONLY);
pdb.setOptions(0);
pdb.close();

export const api = {
    RakNetInstance: {
        getPort: hacker.js("RakNetInstance::getPort", int32_t, null, RakNetInstance),
    }
}

export const utils = {
    parseProperties: (properties: string) => {
        let retval: {[key: string]: string} = {};
        for (let line of properties.replace(/#.+|\r/g, "").split("\n")) {
            if (line.match("=")) {
                retval[line.split("=")[0]] = line.split("=").splice(1).join("=");
            }
        }
        return retval;
    }
}