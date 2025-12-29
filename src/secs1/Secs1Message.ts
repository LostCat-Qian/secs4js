import { SecsMessage } from "../core/AbstractSecsMessage.js";
import { AbstractSecs2Item } from "../core/secs2item/AbstractSecs2Item.js";
import { Secs2ItemParser } from "../core/secs2item/Secs2ItemParser.js";
import { Secs1MessageBlock } from "./Secs1MessageBlock.js";

export class Secs1Message extends SecsMessage {
	constructor(
		stream: number,
		func: number,
		wBit: boolean,
		body: AbstractSecs2Item | null,
		systemBytes: number,
		deviceId: number,
		public readonly rBit = false,
	) {
		super(stream, func, wBit, body, systemBytes, deviceId);
	}

	/**
	 * @description Splits the message into SECS-I blocks.
	 */
	toBlocks(): Secs1MessageBlock[] {
		const bodyBuffer = this.body ? this.body.toBuffer() : Buffer.alloc(0);
		const blocks: Secs1MessageBlock[] = [];

		let pos = 0;
		let blockNum = 1;

		if (bodyBuffer.length === 0) {
			// Header only block? Or empty body block?
			// SECS-I allows empty body.
			blocks.push(
				Secs1MessageBlock.fromParts(
					this.deviceId,
					this.stream,
					this.func,
					this.wBit,
					true, // E-Bit
					blockNum,
					this.systemBytes,
					Buffer.alloc(0),
					this.rBit,
				),
			);
			return blocks;
		}

		while (pos < bodyBuffer.length) {
			const remaining = bodyBuffer.length - pos;
			const chunkSize = remaining > 244 ? 244 : remaining;
			const chunk = bodyBuffer.subarray(pos, pos + chunkSize);
			const isLast = pos + chunkSize >= bodyBuffer.length;

			blocks.push(
				Secs1MessageBlock.fromParts(
					this.deviceId,
					this.stream,
					this.func,
					this.wBit,
					isLast, // E-Bit
					blockNum,
					this.systemBytes,
					chunk,
					this.rBit,
				),
			);

			pos += chunkSize;
			blockNum++;
			if (blockNum > 0x7fff) {
				throw new Error("Block number overflow");
			}
		}

		return blocks;
	}

	/**
	 * Reassembles a SECS-I message from blocks.
	 */
	static fromBlocks(blocks: Secs1MessageBlock[]): Secs1Message {
		if (blocks.length === 0) {
			throw new Error("No blocks to reassemble");
		}

		// Sort by block number just in case (though usually they come in order)
		blocks.sort((a, b) => a.blockNumber - b.blockNumber);

		// Validate sequence
		for (let i = 0; i < blocks.length; i++) {
			if (blocks[i].blockNumber !== i + 1) {
				throw new Error(`Missing block ${i + 1}`);
			}
			// Check if all blocks belong to the same message (SystemBytes, Stream, Func, DeviceID)
			if (i > 0) {
				const prev = blocks[i - 1];
				const curr = blocks[i];
				if (
					prev.systemBytes !== curr.systemBytes ||
					prev.stream !== curr.stream ||
					prev.func !== curr.func ||
					prev.deviceId !== curr.deviceId
				) {
					throw new Error("Blocks do not belong to the same message");
				}
			}
		}

		if (!blocks[blocks.length - 1].eBit) {
			throw new Error("Last block missing E-Bit");
		}

		const first = blocks[0];
		const bodyBuffers = blocks.map((b) => b.body);
		const fullBodyBuffer = Buffer.concat(bodyBuffers);

		let body: AbstractSecs2Item | null = null;
		if (fullBodyBuffer.length > 0) {
			const result = Secs2ItemParser.fromBuffer(fullBodyBuffer);
			body = result.item;
		}

		return new Secs1Message(
			first.stream,
			first.func,
			first.wBit,
			body,
			first.systemBytes,
			first.deviceId,
			first.rBit,
		);
	}

	// Override toBuffer to return logical buffer (10-byte header + body)
	toBuffer(): Buffer {
		const bodyBuffer = this.body ? this.body.toBuffer() : Buffer.alloc(0);
		const header = Buffer.alloc(10);

		// Byte 0: R-Bit + DeviceID MSB
		let b0 = (this.deviceId >> 8) & 0x7f;
		if (this.rBit) b0 |= 0x80;
		header[0] = b0;

		// Byte 1: DeviceID LSB
		header[1] = this.deviceId & 0xff;

		// Byte 2: W-Bit + Stream
		let b2 = this.stream & 0x7f;
		if (this.wBit) b2 |= 0x80;
		header[2] = b2;

		// Byte 3: Function
		header[3] = this.func & 0xff;

		// Byte 4: E-Bit + BlockNum (Logical 0 or 1? For logical message, maybe 0)
		// Usually block number is per block. For a "Message Buffer", we don't have block number.
		// We'll leave it 0 or standard.
		header[4] = 0;
		header[5] = 0;

		// Byte 6-9: System Bytes
		header.writeUInt32BE(this.systemBytes, 6);

		return Buffer.concat([header, bodyBuffer]);
	}
}
