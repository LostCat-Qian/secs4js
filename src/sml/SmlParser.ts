import { SecsMessage } from "../core/AbstractSecsMessage.js";
import { AbstractSecs2Item } from "../core/secs2item/AbstractSecs2Item.js";
import { SecsItemType } from "../core/enums/SecsItemType.js";
import { Secs2ItemAscii } from "../core/secs2item/Secs2ItemAscii.js";
import { Secs2ItemList } from "../core/secs2item/Secs2ItemList.js";
import { Secs2ItemBinary } from "../core/secs2item/Secs2ItemBinary.js";
import { Secs2ItemBoolean } from "../core/secs2item/Secs2ItemBoolean.js";
import { Secs2ItemNumeric } from "../core/secs2item/Secs2ItemNumeric.js";

/**
 * @description A cursor for SML parsing.
 */
class SmlCursor {
	constructor(
		public str: string,
		public pos = 0,
	) {}

	/**
	 * @description Returns the next character in the string without consuming it.
	 * @returns The next character in the string.
	 */
	peek(): string {
		return this.str[this.pos];
	}

	/**
	 * @description Consumes the next character in the string and returns it.
	 * @returns The consumed character.
	 */
	consume(): string {
		return this.str[this.pos++];
	}

	/**
	 * @description Returns true if the cursor is at the end of the string.
	 * @returns True if the cursor is at the end of the string.
	 */
	eof(): boolean {
		return this.pos >= this.str.length;
	}

	/**
	 * @description Skips whitespace characters in the string.
	 */
	skipWs() {
		while (!this.eof()) {
			while (!this.eof() && /\s/.test(this.peek())) this.pos++;
			if (this.str.startsWith("//", this.pos)) {
				this.pos += 2;
				while (!this.eof() && this.peek() !== "\n" && this.peek() !== "\r") {
					this.pos++;
				}
				if (this.peek() === "\r") this.pos++;
				if (this.peek() === "\n") this.pos++;
				continue;
			}
			break;
		}
	}

	/**
	 * @description Matches the next character in the string with the given character.
	 * @param char The character to match.
	 * @returns True if the next character in the string is the given character.
	 */
	match(char: string): boolean {
		if (this.peek() === char) {
			this.consume();
			return true;
		}
		return false;
	}
}

/**
 * @description A parser for SECS-II SML strings.
 */
export class SmlParser {
	private static readonly SML_REGEX = /^[Ss](\d+)[Ff](\d+)\s*(W?)\s*(.*)\.$/s;

	/**
	 * @description Parses an SML string into a SecsMessage.
	 * @param sml The SML string to parse.
	 * @returns The parsed SecsMessage.
	 */
	static parse(sml: string): SecsMessage {
		const trimmed = sml.trim();
		if (!trimmed.endsWith(".")) {
			throw new Error("Invalid SML format: SML must end with '.'");
		}
		if (!/^[Ss]\d+[Ff]\d+/.test(trimmed)) {
			throw new Error("Invalid SML format: SML must start with 'SxFy'");
		}
		const match = this.SML_REGEX.exec(trimmed);

		if (!match) {
			throw new Error("Invalid SML format. Must match 'SxFy [W] <Body>.'");
		}

		const stream = parseInt(match[1], 10);
		const func = parseInt(match[2], 10);
		const wBit = match[3].toUpperCase() === "W";
		const bodyStr = match[4].trim();

		const body = this.parseBody(bodyStr);

		return new SecsMessage(stream, func, wBit, body);
	}

	/**
	 * @description Parses an SML body string into a Secs2Item.
	 * @param smlBody The SML body string to parse.
	 * @returns The parsed Secs2Item.
	 */
	static parseBody(smlBody: string): AbstractSecs2Item | null {
		const trimmed = smlBody.trim();
		if (trimmed.length === 0) {
			return null;
		}
		const cursor = new SmlCursor(trimmed);
		return this.parseItem(cursor);
	}

	private static parseItem(cursor: SmlCursor): AbstractSecs2Item {
		cursor.skipWs();
		if (cursor.consume() !== "<") {
			throw new Error(`Expected '<' at pos ${(cursor.pos - 1).toString()}`);
		}

		cursor.skipWs();
		const typeStart = cursor.pos;
		while (!cursor.eof() && /[A-Z0-9]/.test(cursor.peek().toUpperCase())) {
			cursor.consume();
		}
		const typeStr = cursor.str.substring(typeStart, cursor.pos).toUpperCase();

		// Skip length [size]
		cursor.skipWs();
		if (cursor.peek() === "[") {
			while (!cursor.eof() && cursor.peek() !== "]") cursor.consume();
			if (cursor.peek() === "]") cursor.consume();
		}

		let item: AbstractSecs2Item;

		if (typeStr === "L") {
			const items: AbstractSecs2Item[] = [];

			while (true) {
				cursor.skipWs();
				if (cursor.peek() === ">") {
					cursor.consume();
					break;
				} else if (cursor.peek() === "<") {
					items.push(this.parseItem(cursor));
				} else {
					throw new Error(
						`Unexpected char in List: '${cursor.peek()}' at ${cursor.pos.toString()}`,
					);
				}
			}
			item = new Secs2ItemList(items);
		} else if (typeStr === "A") {
			cursor.skipWs();
			// Expect quoted string
			if (cursor.peek() === '"' || cursor.peek() === "'") {
				const quote = cursor.consume();
				const start = cursor.pos;
				while (!cursor.eof() && cursor.peek() !== quote) cursor.consume();
				if (cursor.eof()) {
					throw new Error(
						`Unterminated string value for type A at ${start.toString()}`,
					);
				}
				const val = cursor.str.substring(start, cursor.pos);
				cursor.consume();
				item = new Secs2ItemAscii(val);
			} else {
				// Empty string or unquoted? Standard says quoted.
				// Assuming empty if > follows immediately
				if (cursor.peek() === ">") {
					item = new Secs2ItemAscii("");
				} else {
					throw new Error(
						`Expected string value for type A at ${cursor.pos.toString()}`,
					);
				}
			}
			cursor.skipWs();
			if (cursor.consume() !== ">") throw new Error("Expected '>' ending A");
		} else if (typeStr === "B") {
			// Binary: 0xXX or XX
			const buffer: number[] = [];

			while (true) {
				cursor.skipWs();
				if (cursor.peek() === ">") {
					cursor.consume();
					break;
				}
				if (
					cursor.str.startsWith("0x", cursor.pos) ||
					cursor.str.startsWith("0X", cursor.pos)
				) {
					cursor.pos += 2;
				}
				if (cursor.pos + 2 > cursor.str.length) {
					throw new Error(`Invalid binary byte at ${cursor.pos.toString()}`);
				}
				const b0 = cursor.str[cursor.pos];
				const b1 = cursor.str[cursor.pos + 1];
				if (!/[0-9a-f]/i.test(b0) || !/[0-9a-f]/i.test(b1)) {
					throw new Error(`Invalid binary byte at ${cursor.pos.toString()}`);
				}
				const byteStr = b0 + b1;
				const byteVal = parseInt(byteStr, 16);
				buffer.push(byteVal);
				cursor.pos += 2;
			}
			item = new Secs2ItemBinary(Buffer.from(buffer));
		} else if (typeStr === "BOOLEAN") {
			const bools: boolean[] = [];

			while (true) {
				cursor.skipWs();
				if (cursor.peek() === ">") {
					cursor.consume();
					break;
				}
				// Read T/True/F/False
				const start = cursor.pos;
				while (!cursor.eof() && /[A-Z]/.test(cursor.peek().toUpperCase()))
					cursor.consume();
				const val = cursor.str.substring(start, cursor.pos).toUpperCase();
				if (["T", "TRUE"].includes(val)) bools.push(true);
				else if (["F", "FALSE"].includes(val)) bools.push(false);
				else throw new Error(`Invalid Boolean value ${val}`);
			}
			item = new Secs2ItemBoolean(bools.length === 1 ? bools[0] : bools);
		} else {
			// Numbers
			const nums: number[] = []; // or bigint
			// Simplified number parsing
			const isFloat = ["F4", "F8"].includes(typeStr);

			while (true) {
				cursor.skipWs();
				if (cursor.peek() === ">") {
					cursor.consume();
					break;
				}
				const start = cursor.pos;
				while (!cursor.eof() && /[0-9.\-+]/.test(cursor.peek()))
					cursor.consume();
				const valStr = cursor.str.substring(start, cursor.pos);
				const val = isFloat ? parseFloat(valStr) : Number(valStr); // Use BigInt if needed for U8/I8
				if (isNaN(val))
					throw new Error(`Invalid number ${valStr} at ${start.toString()}`);
				nums.push(val);
			}

			// Determine SecsItemType
			const type = SecsItemType[typeStr as keyof typeof SecsItemType];

			if (type === undefined) throw new Error(`Unknown type ${typeStr}`);

			item = new Secs2ItemNumeric(type, nums.length === 1 ? nums[0] : nums);
		}

		return item;
	}
}
