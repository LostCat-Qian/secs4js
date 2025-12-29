import { SecsItemType } from "../enums/SecsItemType.js";
import { AbstractSecs2Item } from "./AbstractSecs2Item.js";
import { Secs2ItemNumeric } from "./Secs2ItemNumeric.js";
import { Secs2ItemAscii } from "./Secs2ItemAscii.js";
import { Secs2ItemBinary } from "./Secs2ItemBinary.js";
import { Secs2ItemBoolean } from "./Secs2ItemBoolean.js";
import { Secs2ItemList } from "./Secs2ItemList.js";

export function createAsciiItem(value: string): Secs2ItemAscii {
	return new Secs2ItemAscii(value);
}

export function createBooleanItem(...value: boolean[]): Secs2ItemBoolean {
	return new Secs2ItemBoolean(value);
}

export function createBinaryItem(...value: Buffer[]): Secs2ItemBinary {
	return new Secs2ItemBinary(Buffer.concat(value));
}

export function createListItem(...items: AbstractSecs2Item[]): Secs2ItemList {
	return new Secs2ItemList(items);
}

export function createU1Item(...value: number[]): Secs2ItemNumeric {
	return new Secs2ItemNumeric(SecsItemType.U1, value);
}

export function createI1Item(...value: number[]): Secs2ItemNumeric {
	return new Secs2ItemNumeric(SecsItemType.I1, value);
}

export function createU2Item(...value: number[]): Secs2ItemNumeric {
	return new Secs2ItemNumeric(SecsItemType.U2, value);
}

export function createU4Item(...value: number[]): Secs2ItemNumeric {
	return new Secs2ItemNumeric(SecsItemType.U4, value);
}

export function createU8Item(...value: number[] | bigint[]): Secs2ItemNumeric {
	return new Secs2ItemNumeric(SecsItemType.U8, value);
}

export function createI2Item(...value: number[]): Secs2ItemNumeric {
	return new Secs2ItemNumeric(SecsItemType.I2, value);
}

export function createI4Item(...value: number[]): Secs2ItemNumeric {
	return new Secs2ItemNumeric(SecsItemType.I4, value);
}

export function createI8Item(...value: number[] | bigint[]): Secs2ItemNumeric {
	return new Secs2ItemNumeric(SecsItemType.I8, value);
}

export function createF4Item(...value: number[]): Secs2ItemNumeric {
	return new Secs2ItemNumeric(SecsItemType.F4, value);
}

export function createF8Item(...value: number[] | bigint[]): Secs2ItemNumeric {
	return new Secs2ItemNumeric(SecsItemType.F8, value);
}
