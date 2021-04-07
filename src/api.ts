import { RakNetInstance } from "bdsx/bds/raknetinstance";
import { RawTypeId } from "bdsx";
import { SYMOPT_UNDNAME } from "bdsx/common";
import { NativePointer, pdb, VoidPointer } from "bdsx/core";
import { ProcHacker } from "bdsx/prochacker";

import * as path from "path";
import { CxxStringWrapper } from "bdsx/pointer";

pdb.setOptions(SYMOPT_UNDNAME);
const hacker = ProcHacker.load(path.join(__dirname, "pdbcache.ini"), [
    "RakNetInstance::getPort",
]);
pdb.setOptions(0);
pdb.close();

export const api = {
    RakNetInstance: {
        getPort: hacker.js("RakNetInstance::getPort", RawTypeId.Int32, null, RakNetInstance),
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