import { SecsItemType } from "../enums/SecsItemType.js";
import { AbstractSecs2Item } from "./AbstractSecs2Item.js";

/**
 * @description
 * ASCII string item is a string item that contains only ASCII characters.
 * @example
 * new Secs2ItemAscii("Hello World");
 */
export class Secs2ItemAscii extends AbstractSecs2Item<string> {
	constructor(value: string) {
		super(SecsItemType.A, value);
	}

	override toSml(): string {
		return `<A [${this._value.length}] "${this._value}">`;
	}

	override toBuffer(): Buffer {
		const valueBuffer = Buffer.from(this._value, "ascii");
		const header = this.createHeader(valueBuffer.length);
		return Buffer.concat([header, valueBuffer]);
	}
}
