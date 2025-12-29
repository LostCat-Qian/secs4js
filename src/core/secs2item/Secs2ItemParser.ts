import { SecsItemType } from "../enums/SecsItemType.js";
import { AbstractSecs2Item } from "./AbstractSecs2Item.js";
import { Secs2ItemFactory } from "./Secs2ItemFactory.js";
import { Secs2ItemNumeric } from "./Secs2ItemNumeric.js";

export class Secs2ItemParser {
	static fromBuffer(buffer: Buffer): {
		item: AbstractSecs2Item;
		consumed: number;
	} {
		if (buffer.length === 0) {
			throw new Error("Empty buffer");
		}

		const headerByte = buffer.readUInt8(0);
		const itemType = (headerByte & 0xfc) as SecsItemType; // Clear last 2 bits
		const lengthBytes = headerByte & 0x03;

		let length = 0;
		if (lengthBytes === 1) {
			length = buffer.readUInt8(1);
		} else if (lengthBytes === 2) {
			length = buffer.readUInt16BE(1);
		} else if (lengthBytes === 3) {
			length = buffer.readUIntBE(1, 3);
		} else {
			throw new Error(`Invalid length bytes count: ${lengthBytes.toString()}`);
		}

		const valueStart = 1 + lengthBytes;

		// Handle List items differently: length is number of items, not byte length
		if (itemType === SecsItemType.L) {
			const items: AbstractSecs2Item[] = [];
			let offset = valueStart;
			const numItems = length;

			for (let i = 0; i < numItems; i++) {
				if (offset >= buffer.length) {
					throw new Error(
						`Insufficient buffer for List items. Expected ${numItems} items, got incomplete data.`,
					);
				}
				const result = Secs2ItemParser.fromBuffer(buffer.subarray(offset));
				items.push(result.item);
				offset += result.consumed;
			}

			const item = Secs2ItemFactory.createListItem(...items);
			return { item, consumed: offset };
		}

		// For other types, length is byte length
		const valueEnd = valueStart + length;

		if (buffer.length < valueEnd) {
			throw new Error(
				`Insufficient buffer length. Expected ${valueEnd.toString()}, got ${buffer.length.toString()}`,
			);
		}

		const valueBuffer = buffer.subarray(valueStart, valueEnd);
		const consumed = valueEnd;

		let item: AbstractSecs2Item;

		switch (itemType) {
			case SecsItemType.A:
				item = Secs2ItemFactory.createAsciiItem(valueBuffer.toString("ascii"));
				break;
			case SecsItemType.B:
				item = Secs2ItemFactory.createBinaryItem(valueBuffer);
				break;
			case SecsItemType.BOOLEAN: {
				// Parse boolean array
				const bools = [];
				for (const byte of valueBuffer) {
					bools.push(byte !== 0);
				}
				item = Secs2ItemFactory.createBooleanItem(...bools);
				break;
			}
			case SecsItemType.I1:
			case SecsItemType.I2:
			case SecsItemType.I4:
			case SecsItemType.I8:
			case SecsItemType.U1:
			case SecsItemType.U2:
			case SecsItemType.U4:
			case SecsItemType.U8:
			case SecsItemType.F4:
			case SecsItemType.F8:
				item = Secs2ItemNumeric.fromTypeBuffer(itemType, valueBuffer);
				break;
			default:
				throw new Error(
					`Unknown item type: 0x${(itemType as number).toString(16)}`,
				);
		}

		return { item, consumed };
	}
}
