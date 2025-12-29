import { SecsMessage } from "../core/AbstractSecsMessage.js";
import { AbstractSecs2Item } from "../core/secs2item/AbstractSecs2Item.js";
import { HsmsControlType } from "./enums/HsmsControlType.js";
import { RejectReason } from "./enums/RejectReason.js";
import { Secs2ItemParser } from "../core/secs2item/Secs2ItemParser.js";

/**
 * @description HsmsMessage is the class that represents an HSMS message.
 * @param stream The stream number of the message.
 * @param func The function number of the message.
 * @param wBit The W-Bit of the message.
 * @param body The body of the message.
 * @param systemBytes The system bytes of the message.
 * @param deviceId The device ID of the message.
 * @param pType The P-Type of the message.
 * @param sType The S-Type of the message.
 */
export class HsmsMessage extends SecsMessage {
	constructor(
		stream: number,
		func: number,
		wBit: boolean,
		body: AbstractSecs2Item | null,
		systemBytes: number,
		deviceId: number,
		public readonly pType = 0,
		public readonly sType = 0,
	) {
		super(stream, func, wBit, body, systemBytes, deviceId);
	}

	/**
	 * @description Encodes the message to a buffer (Length + Header + Body).
	 */
	toBuffer(): Buffer {
		const bodyBuffer = this.body ? this.body.toBuffer() : Buffer.alloc(0);
		const header = Buffer.alloc(10);

		// Byte 0-1: Session ID (Device ID) or 0xFFFF
		if (this.isDataMessage()) {
			header.writeUInt16BE(this.deviceId, 0);
		} else {
			header.writeUInt16BE(0xffff, 0);
		}

		// Byte 2: Stream / WBit (only for Data)
		// Byte 3: Function (only for Data)
		if (this.isDataMessage()) {
			let b2 = this.stream;
			if (this.wBit) {
				b2 |= 0x80;
			}
			header.writeUInt8(b2, 2);
			header.writeUInt8(this.func, 3);
		} else {
			// For control messages, byte 2 and 3 depend on type
			// But typically 0 unless SelectStatus/RejectReason
			// We will handle specific construction in static methods
			// Here we assume pType and sType are set correctly for Control Messages
			// Wait, P-Type is Byte 4, S-Type is Byte 5.
			// Byte 2 and 3 are 0 for most control messages.
			// EXCEPT Select Response (Byte 3 = Status) and Reject (Byte 3 = Reason).
			// But those are stored in 'sType' or 'func' or similar?
			// In this class, I store pType and sType (Byte 4, 5).
			// Where do I store Byte 2 and 3 for Control Messages?
			// The Python code:
			// Select Response: h10bytes = ... 0x00, select_status ...
			// Reject: ... b2, reject_reason ...

			// I should allow passing byte 2 and 3 specifically or handle it via polymorphism.
			// To keep it simple, I will use 'stream' and 'func' to hold Byte 2 and 3 for Control Messages too,
			// even if they don't mean Stream/Function.

			header.writeUInt8(this.stream, 2);
			header.writeUInt8(this.func, 3);
		}

		// Byte 4: P-Type
		header.writeUInt8(this.pType, 4);

		// Byte 5: S-Type
		header.writeUInt8(this.sType, 5);

		// Byte 6-9: System Bytes
		header.writeUInt32BE(this.systemBytes, 6);

		const length = header.length + bodyBuffer.length;
		const lengthBuffer = Buffer.alloc(4);
		lengthBuffer.writeUInt32BE(length, 0);

		return Buffer.concat([lengthBuffer, header, bodyBuffer]);
	}

	/**
	 * @description Checks if the message is a data message.
	 * @description data message: deviceId not 0xFF 0xFF and header[4] and header[5] are 0.
	 * @returns True if the message is a data message, false otherwise.
	 */
	isDataMessage(): boolean {
		return (this.sType as HsmsControlType) === HsmsControlType.Data;
	}

	/**
	 * @description Creates an HsmsMessage from a buffer.
	 * @param buffer The buffer containing the message data.
	 * @returns The HsmsMessage object.
	 */
	static fromBuffer(buffer: Buffer): HsmsMessage {
		if (buffer.length < 14) {
			throw new Error("Buffer too short for HSMS message");
		}

		// Bytes 0-3: Length (ignored here, assumed to be correct or handled by framer)
		const header = buffer.subarray(4, 14);
		const bodyBuffer = buffer.subarray(14);

		const sessionId = header.readUInt16BE(0);
		const byte2 = header.readUInt8(2);
		const byte3 = header.readUInt8(3);
		const pType = header.readUInt8(4);
		const sType = header.readUInt8(5);
		const systemBytes = header.readUInt32BE(6);

		let stream = 0;
		let func = 0;
		let wBit = false;
		const deviceId = sessionId;
		let body: AbstractSecs2Item | null = null;

		if ((sType as HsmsControlType) === HsmsControlType.Data) {
			stream = byte2 & 0x7f;
			wBit = (byte2 & 0x80) !== 0;
			func = byte3;

			if (bodyBuffer.length > 0) {
				const result = Secs2ItemParser.fromBuffer(bodyBuffer);
				body = result.item;
			}
		} else {
			// Control Message
			// Mapping Byte 2/3 to stream/func to preserve data (e.g. Select Status)
			stream = byte2;
			func = byte3;
			// deviceId is usually ignored or 0xFFFF, but we keep what we read
		}

		return new HsmsMessage(
			stream,
			func,
			wBit,
			body,
			systemBytes,
			deviceId,
			pType,
			sType,
		);
	}

	// Factory methods for Control Messages
	/**
	 * @description Creates a Select Request message.
	 * @param systemBytes The system bytes of the message.
	 * @returns The HsmsMessage object.
	 */
	static selectReq(systemBytes: number): HsmsMessage {
		return new HsmsMessage(
			0,
			0,
			false,
			null,
			systemBytes,
			0xffff,
			0,
			HsmsControlType.SelectReq,
		);
	}

	/**
	 * @description Creates a Select Response message.
	 * @param req The Select Request message.
	 * @param status The status of the response.
	 * @returns The HsmsMessage object.
	 */
	static selectRsp(req: HsmsMessage, status: number): HsmsMessage {
		return new HsmsMessage(
			0,
			status,
			false,
			null,
			req.systemBytes,
			0xffff,
			0,
			HsmsControlType.SelectRsp,
		);
	}

	/**
	 * @description Creates a Deselect Request message.
	 * @param systemBytes The system bytes of the message.
	 * @returns The HsmsMessage object.
	 */
	static deselectReq(systemBytes: number): HsmsMessage {
		return new HsmsMessage(
			0,
			0,
			false,
			null,
			systemBytes,
			0xffff,
			0,
			HsmsControlType.DeselectReq,
		);
	}

	/**
	 * @description Creates a Deselect Response message.
	 * @param req The Deselect Request message.
	 * @param status The status of the response.
	 * @returns The HsmsMessage object.
	 */
	static deselectRsp(req: HsmsMessage, status: number): HsmsMessage {
		return new HsmsMessage(
			0,
			status,
			false,
			null,
			req.systemBytes,
			0xffff,
			0,
			HsmsControlType.DeselectRsp,
		);
	}

	/**
	 * @description Creates a Link Test Request message.
	 * @param systemBytes The system bytes of the message.
	 * @returns The HsmsMessage object.
	 */
	static linkTestReq(systemBytes: number): HsmsMessage {
		return new HsmsMessage(
			0,
			0,
			false,
			null,
			systemBytes,
			0xffff,
			0,
			HsmsControlType.LinkTestReq,
		);
	}

	/**
	 * @description Creates a Link Test Response message.
	 * @param req The Link Test Request message.
	 * @returns The HsmsMessage object.
	 */
	static linkTestRsp(req: HsmsMessage): HsmsMessage {
		return new HsmsMessage(
			0,
			0,
			false,
			null,
			req.systemBytes,
			0xffff,
			0,
			HsmsControlType.LinkTestRsp,
		);
	}

	/**
	 * @description Creates a Reject Request message.
	 * @param req The message that triggered the reject.
	 * @param reason The reason for the reject.
	 * @returns The HsmsMessage object.
	 */
	static rejectReq(req: HsmsMessage, reason: RejectReason): HsmsMessage {
		// Byte 2 (Stream) should be the sType of the rejected message if PType is not supported
		// But typically it's just mirroring or specific logic.
		// Python: b2 = h10bytes[4] (PType) if reason == NOT_SUPPORT_TYPE_P else h10bytes[5] (SType)
		const b2 = reason === RejectReason.NotSupportTypeP ? req.pType : req.sType;
		return new HsmsMessage(
			b2,
			reason,
			false,
			null,
			req.systemBytes,
			0xffff,
			0,
			HsmsControlType.RejectReq,
		);
	}

	/**
	 * @description Creates a Separate Request message.
	 * @param systemBytes The system bytes of the message.
	 * @returns The HsmsMessage object.
	 */
	static separateReq(systemBytes: number): HsmsMessage {
		return new HsmsMessage(
			0,
			0,
			false,
			null,
			systemBytes,
			0xffff,
			0,
			HsmsControlType.SeparateReq,
		);
	}
}
