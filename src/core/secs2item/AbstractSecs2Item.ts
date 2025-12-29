import { SecsItemType } from "../enums/SecsItemType.js";

export abstract class AbstractSecs2Item<T = unknown> {
	[index: number]: any;

	constructor(
		public readonly type: SecsItemType,
		protected readonly _value: T,
	) {
		return new Proxy(this, {
			get: (target, prop, receiver) => {
				if (typeof prop === "string") {
					const index = Number(prop);
					if (Number.isInteger(index) && index >= 0) {
						return target.getByIndex(index);
					}
				}
				return Reflect.get(target, prop, receiver);
			},
		});
	}

	get value(): T {
		return this._value;
	}

	protected getByIndex(index: number): unknown {
		const v = this._value;
		if (Array.isArray(v) || Buffer.isBuffer(v) || typeof v === "string") {
			return v[index];
		}
		// Scalar value
		if (index === 0) {
			return v;
		}
		return undefined;
	}

	/**
	 * Returns the SML representation of the item.
	 */
	abstract toSml(): string;

	/**
	 * Returns the SECS-II encoded buffer of the item.
	 */
	abstract toBuffer(): Buffer;

	/**
	 * Helper to create the header (Type + LengthBytes)
	 */
	protected createHeader(length: number): Buffer {
		let headerByte = this.type;
		let lengthBytes: Buffer;

		if (length > 0xffffff) {
			throw new Error(`Length ${length.toString()} is too large for SECS item`);
		}

		if (length > 0xffff) {
			// 3 bytes length
			headerByte |= 0x03;
			lengthBytes = Buffer.alloc(4);
			lengthBytes.writeUInt8(headerByte, 0);
			lengthBytes.writeUIntBE(length, 1, 3);
		} else if (length > 0xff) {
			// 2 bytes length
			headerByte |= 0x02;
			lengthBytes = Buffer.alloc(3);
			lengthBytes.writeUInt8(headerByte, 0);
			lengthBytes.writeUInt16BE(length, 1);
		} else {
			// 1 byte length
			headerByte |= 0x01;
			lengthBytes = Buffer.alloc(2);
			lengthBytes.writeUInt8(headerByte, 0);
			lengthBytes.writeUInt8(length, 1);
		}
		return lengthBytes;
	}
}
