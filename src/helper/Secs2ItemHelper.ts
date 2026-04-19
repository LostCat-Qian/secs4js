import { AbstractSecs2Item } from "../core/secs2item/AbstractSecs2Item.js";
import { Secs2ItemAscii } from "../core/secs2item/Secs2ItemAscii.js";
import { Secs2ItemBinary } from "../core/secs2item/Secs2ItemBinary.js";
import { Secs2ItemBoolean } from "../core/secs2item/Secs2ItemBoolean.js";
import { Secs2ItemFactory } from "../core/secs2item/Secs2ItemFactory.js";
import { Secs2ItemList } from "../core/secs2item/Secs2ItemList.js";
import { Secs2ItemNumeric } from "../core/secs2item/Secs2ItemNumeric.js";

/**
 * @description Creates a SECS-II list item.
 * @param items The items in the list.
 * @returns The SECS-II list item.
 */
export function L(...items: AbstractSecs2Item[]): Secs2ItemList {
	return Secs2ItemFactory.createListItem(...items);
}

/**
 * @description Creates a SECS-II ASCII item.
 * @param value The value of the item.
 * @returns The SECS-II ASCII item.
 */
export function A(value: string): Secs2ItemAscii {
	return Secs2ItemFactory.createAsciiItem(value);
}

/**
 * @description Creates a SECS-II boolean item.
 * @param value The value of the item.
 * @returns The SECS-II boolean item.
 */
export function BOOLEAN(...value: boolean[]): Secs2ItemBoolean {
	return Secs2ItemFactory.createBooleanItem(...value);
}

/**
 * @description Creates a SECS-II binary item.
 * @param value The value of the item.
 * @returns The SECS-II binary item.
 */
export function B(value: string | Buffer): Secs2ItemBinary {
	const valueType = typeof value;
	if (valueType === "string") {
		const stringToBytes = (s: string) =>
			s
				.split(/\s+/)
				.map((v) =>
					v.trim().startsWith("0x") ? parseInt(v, 16) : parseInt(v, 10),
				);

		const binaryValues: number[] = stringToBytes(value as string);
		return Secs2ItemFactory.createBinaryItem(Buffer.from(binaryValues));
	}

	return Secs2ItemFactory.createBinaryItem(value as Buffer);
}

/**
 * @description Creates a SECS-II unsigned 8-bit integer item.
 * @param value The value of the item.
 * @returns The SECS-II unsigned 8-bit integer item.
 */
export function U1(...value: number[]): Secs2ItemNumeric {
	if (value.some((v) => v < 0)) {
		throw new Error("U1 value must be unsigned 8-bit integer");
	}
	return Secs2ItemFactory.createU1Item(...value);
}

/**
 * @description Creates a SECS-II unsigned 16-bit integer item.
 * @param value The value of the item.
 * @returns The SECS-II unsigned 16-bit integer item.
 */
export function U2(...value: number[]): Secs2ItemNumeric {
	if (value.some((v) => v < 0)) {
		throw new Error("U2 value must be unsigned 16-bit integer");
	}
	return Secs2ItemFactory.createU2Item(...value);
}

/**
 * @description Creates a SECS-II unsigned 32-bit integer item.
 * @param value The value of the item.
 * @returns The SECS-II unsigned 32-bit integer item.
 */
export function U4(...value: number[]): Secs2ItemNumeric {
	if (value.some((v) => v < 0)) {
		throw new Error("U4 value must be unsigned 32-bit integer");
	}
	return Secs2ItemFactory.createU4Item(...value);
}

/**
 * @description Creates a SECS-II unsigned 64-bit integer item.
 * @param value The value of the item.
 * @returns The SECS-II unsigned 64-bit integer item.
 */
export function U8(...value: number[] | bigint[]): Secs2ItemNumeric {
	if (value.some((v) => v < 0)) {
		throw new Error("U8 value must be unsigned 64-bit integer");
	}
	return Secs2ItemFactory.createU8Item(...value);
}

/**
 * @description Creates a SECS-II signed 8-bit integer item.
 * @param value The value of the item.
 * @returns The SECS-II signed 8-bit integer item.
 */
export function I1(...value: number[]): Secs2ItemNumeric {
	return Secs2ItemFactory.createI1Item(...value);
}

/**
 * @description Creates a SECS-II signed 16-bit integer item.
 * @param value The value of the item.
 * @returns The SECS-II signed 16-bit integer item.
 */
export function I2(...value: number[]): Secs2ItemNumeric {
	return Secs2ItemFactory.createI2Item(...value);
}

/**
 * @description Creates a SECS-II signed 32-bit integer item.
 * @param value The value of the item.
 * @returns The SECS-II signed 32-bit integer item.
 */
export function I4(...value: number[]): Secs2ItemNumeric {
	return Secs2ItemFactory.createI4Item(...value);
}

/**
 * @description Creates a SECS-II signed 64-bit integer item.
 * @param value The value of the item.
 * @returns The SECS-II signed 64-bit integer item.
 */
export function I8(...value: number[] | bigint[]): Secs2ItemNumeric {
	return Secs2ItemFactory.createI8Item(...value);
}

/**
 * @description Creates a SECS-II float 32-bit number item.
 * @param value The value of the item.
 * @returns The SECS-II float 32-bit number item.
 */
export function F4(...value: number[]): Secs2ItemNumeric {
	return Secs2ItemFactory.createF4Item(...value);
}

/**
 * @description Creates a SECS-II float 64-bit number item.
 * @param value The value of the item.
 * @returns The SECS-II float 64-bit number item.
 */
export function F8(...value: number[]): Secs2ItemNumeric {
	return Secs2ItemFactory.createF8Item(...value);
}
