// @ts-nocheck

// Unused page

import { PlayerInventory } from "bdsx/bds/inventory";

export class InventoryRenderer {
    static size = [176, 166]
    static top_origin = [8, 84]
    static item_offset = [18, 18]
    static inventorySlotPos(slot: number) {
        let _slot = slot;
        let x = 0;
        let y = 0;
        while (_slot > 8) {
            _slot -= 9;
            y++;
        }
        x = _slot;
        const pos = InventoryRenderer.top_origin;
        pos[0] += x * InventoryRenderer.item_offset[0];
        pos[1] += y * InventoryRenderer.item_offset[1];
        if (y === 3) {
            pos[1] += 4;
        }
        return pos;
    }
    options = {
        controls: {
            zoom: false,
            rotate: false,
            pan: false,
        },
        canvas:{
            height: InventoryRenderer.size[0] * 2, 
            width: InventoryRenderer.size[1] * 2,
        }
    }
    content = [
        {
            name: "base",
            texture: "/gui/container/inventory",
            uv: [0, 0, InventoryRenderer.size[0], InventoryRenderer.size[1]],
            pos: [0, 0],
            layer: 0,
        }
    ]
    constructor(inventory: PlayerInventory) {
        for (const [index, item] of inventory.getSlots().toArray().entries()) {
            if (!item.isNull()) {
                this.content.push({
                    name: "item",
                    texture: "/item/apple", //item.isBlock() ? `/block/${item.getRawNameId()}` : `/item/${item.getRawNameId()}`,
                    uv: [0, 0, 16, 16],
                    pos: InventoryRenderer.inventorySlotPos(index),
                    layer: 1,
                })
            }
        }
    }
}