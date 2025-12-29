import { AbstractSecsCommunicator } from "../core/AbstractSecsCommunicator.js";
import { SecsMessage } from "../core/AbstractSecsMessage.js";
import { Secs2ItemAscii } from "../core/secs2item/Secs2ItemAscii.js";
import { Secs2ItemBinary } from "../core/secs2item/Secs2ItemBinary.js";
import { Secs2ItemList } from "../core/secs2item/Secs2ItemList.js";
import { Clock, ClockType } from "./Clock.js";

export enum CommAck {
	OK = 0x0,
	DENIED = 0x1,
}

export enum OflAck {
	OK = 0x0,
}

export enum OnlAck {
	OK = 0x0,
	REFUSE = 0x1,
	ALREADY_ONLINE = 0x2,
}

export enum TiAck {
	OK = 0x0,
	NOT_DONE = 0x1,
}

export class Gem {
	private static readonly DEFAULT_MDLN = "      ";
	private static readonly DEFAULT_SOFTREV = "      ";
	private static readonly DEFAULT_CLOCK_TYPE = ClockType.A16;

	public mdln: string = Gem.DEFAULT_MDLN;
	public softrev: string = Gem.DEFAULT_SOFTREV;
	public clockType: ClockType = Gem.DEFAULT_CLOCK_TYPE;

	constructor(public comm: AbstractSecsCommunicator<any>) {}

	// S1F13 - Establish Communications Request
	async s1f13(): Promise<number> {
		let body: Secs2ItemList;
		if (this.comm.isEquip) {
			body = new Secs2ItemList([
				new Secs2ItemAscii(this.mdln),
				new Secs2ItemAscii(this.softrev),
			]);
		} else {
			body = new Secs2ItemList([]);
		}

		const reply = await this.comm.send(1, 13, true, body);
		if (reply && reply.body instanceof Secs2ItemList) {
			const list = reply.body;
			if (list.value.length > 0 && list.value[0] instanceof Secs2ItemBinary) {
				const bin = list.value[0];
				return bin.value[0];
			}
		}
		throw new Error("S1F14 invalid response or not COMMACK");
	}

	// S1F14 - Establish Communications Acknowledge
	async s1f14(primaryMsg: SecsMessage, commAck: CommAck): Promise<void> {
		let body: Secs2ItemList;
		if (this.comm.isEquip) {
			body = new Secs2ItemList([
				new Secs2ItemBinary(Buffer.from([commAck])),
				new Secs2ItemList([
					new Secs2ItemAscii(this.mdln),
					new Secs2ItemAscii(this.softrev),
				]),
			]);
		} else {
			body = new Secs2ItemList([
				new Secs2ItemBinary(Buffer.from([commAck])),
				new Secs2ItemList([]),
			]);
		}
		await this.comm.reply(primaryMsg, 1, 14, body);
	}

	// S1F15 - Request OFF-LINE
	async s1f15(): Promise<number> {
		const reply = await this.comm.send(1, 15, true);
		if (reply && reply.body instanceof Secs2ItemBinary) {
			return reply.body.value[0];
		}
		throw new Error("S1F16 invalid response or not OFLACK");
	}

	// S1F16 - OFF-LINE Acknowledge
	async s1f16(primaryMsg: SecsMessage): Promise<void> {
		await this.comm.reply(
			primaryMsg,
			1,
			16,
			new Secs2ItemBinary(Buffer.from([OflAck.OK])),
		);
	}

	// S1F17 - Request ON-LINE
	async s1f17(): Promise<number> {
		const reply = await this.comm.send(1, 17, true);
		if (reply && reply.body instanceof Secs2ItemBinary) {
			return reply.body.value[0];
		}
		throw new Error("S1F18 invalid response or not ONLACK");
	}

	// S1F18 - ON-LINE Acknowledge
	async s1f18(primaryMsg: SecsMessage, onlAck: OnlAck): Promise<void> {
		await this.comm.reply(
			primaryMsg,
			1,
			18,
			new Secs2ItemBinary(Buffer.from([onlAck])),
		);
	}

	// S2F17 - Date and Time Request
	async s2f17(): Promise<Clock> {
		const reply = await this.comm.send(2, 17, true);
		if (reply?.body instanceof Secs2ItemAscii) {
			return Clock.fromAscii(reply.body);
		}
		throw new Error("S2F18 invalid response or not time");
	}

	// S2F18 - Date and Time Data
	async s2f18(
		primaryMsg: SecsMessage,
		clock: Clock = Clock.now(),
	): Promise<void> {
		const body =
			this.clockType === ClockType.A12 ? clock.toA12() : clock.toA16();
		await this.comm.reply(primaryMsg, 2, 18, body);
	}

	async s2f18Now(primaryMsg: SecsMessage): Promise<void> {
		return this.s2f18(primaryMsg, Clock.now());
	}

	// S2F31 - Date and Time Set Request
	async s2f31(clock: Clock): Promise<number> {
		const body =
			this.clockType === ClockType.A12 ? clock.toA12() : clock.toA16();
		const reply = await this.comm.send(2, 31, true, body);
		if (reply && reply.body instanceof Secs2ItemBinary) {
			return reply.body.value[0];
		}
		throw new Error("S2F32 invalid response or not TIACK");
	}

	async s2f31Now(): Promise<number> {
		return this.s2f31(Clock.now());
	}

	// S2F32 - Date and Time Set Acknowledge
	async s2f32(primaryMsg: SecsMessage, tiAck: TiAck): Promise<void> {
		await this.comm.reply(
			primaryMsg,
			2,
			32,
			new Secs2ItemBinary(Buffer.from([tiAck])),
		);
	}

	// S9Fx Helpers
	async s9f1(refMsg: SecsMessage): Promise<void> {
		await this.s9fy(refMsg, 1);
	}
	async s9f3(refMsg: SecsMessage): Promise<void> {
		await this.s9fy(refMsg, 3);
	}
	async s9f5(refMsg: SecsMessage): Promise<void> {
		await this.s9fy(refMsg, 5);
	}
	async s9f7(refMsg: SecsMessage): Promise<void> {
		await this.s9fy(refMsg, 7);
	}
	async s9f9(refMsg: SecsMessage): Promise<void> {
		await this.s9fy(refMsg, 9);
	}
	async s9f11(refMsg: SecsMessage): Promise<void> {
		await this.s9fy(refMsg, 11);
	}

	private async s9fy(refMsg: SecsMessage, func: number): Promise<void> {
		const header = this.getHeader10Bytes(refMsg);
		await this.comm.send(9, func, false, new Secs2ItemBinary(header));
	}

	private getHeader10Bytes(msg: SecsMessage): Buffer {
		const buffer = Buffer.alloc(10);
		// Session ID (Device ID)
		buffer.writeUInt16BE(msg.deviceId & 0x7fff, 0);

		// Stream + W-bit
		let streamByte = msg.stream & 0x7f;
		if (msg.wBit) {
			streamByte |= 0x80;
		}
		buffer.writeUInt8(streamByte, 2);

		// Function
		buffer.writeUInt8(msg.func, 3);

		// P-Type, S-Type (Assuming 0 for now)
		buffer.writeUInt8(0, 4);
		buffer.writeUInt8(0, 5);

		// System Bytes
		if (typeof msg.systemBytes === "number") {
			buffer.writeUInt32BE(msg.systemBytes, 6);
		} else {
			// Assuming Buffer
			const sysBuf = msg.systemBytes as Buffer;
			sysBuf.copy(buffer, 6, 0, 4);
		}

		return buffer;
	}
}
