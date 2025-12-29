import { AbstractSecs2Item } from "../core/secs2item/AbstractSecs2Item.js";
import { Secs2ItemAscii } from "../core/secs2item/Secs2ItemAscii.js";
import { Secs2ItemBinary } from "../core/secs2item/Secs2ItemBinary.js";
import { Secs2ItemBoolean } from "../core/secs2item/Secs2ItemBoolean.js";
import {
	createAsciiItem,
	createBinaryItem,
	createBooleanItem,
	createF4Item,
	createF8Item,
	createI1Item,
	createI2Item,
	createI4Item,
	createI8Item,
	createListItem,
	createU1Item,
	createU2Item,
	createU4Item,
	createU8Item,
} from "../core/secs2item/Secs2ItemFactory.js";
import { Secs2ItemList } from "../core/secs2item/Secs2ItemList.js";
import { Secs2ItemNumeric } from "../core/secs2item/Secs2ItemNumeric.js";

export function L(...items: AbstractSecs2Item[]): Secs2ItemList {
	return createListItem(...items);
}

export function A(value: string): Secs2ItemAscii {
	return createAsciiItem(value);
}

export function BOOLEAN(value: string): Secs2ItemBoolean {
	const booleanValues: boolean[] = [];
	const values = value.split("");
	values.map((v) => {
		if (v !== "TRUE" && v !== "FALSE") {
			throw new Error("BOOLEAN value must be TRUE or FALSE");
		}
		if (v === "TRUE") {
			booleanValues.push(true);
		} else {
			booleanValues.push(false);
		}
	});
	return createBooleanItem(...booleanValues);
}

export function B(value: string): Secs2ItemBinary {
	const stringToBytes = (s: string) =>
		s
			.split(/\s+/)
			.map((v) =>
				v.trim().startsWith("0x") ? parseInt(v, 16) : parseInt(v, 10),
			);

	const binaryValues: number[] = stringToBytes(value);
	return createBinaryItem(Buffer.from(binaryValues));
}

export function U1(...value: number[]): Secs2ItemNumeric {
	if (value.some((v) => v < 0)) {
		throw new Error("U1 value must be unsigned 8-bit integer");
	}
	return createU1Item(...value);
}

export function U2(...value: number[]): Secs2ItemNumeric {
	if (value.some((v) => v < 0)) {
		throw new Error("U2 value must be unsigned 16-bit integer");
	}
	return createU2Item(...value);
}

export function U4(...value: number[]): Secs2ItemNumeric {
	if (value.some((v) => v < 0)) {
		throw new Error("U4 value must be unsigned 32-bit integer");
	}
	return createU4Item(...value);
}

export function U8(...value: number[] | bigint[]): Secs2ItemNumeric {
	if (value.some((v) => v < 0)) {
		throw new Error("U8 value must be unsigned 64-bit integer");
	}
	return createU8Item(...value);
}

export function I1(...value: number[]): Secs2ItemNumeric {
	return createI1Item(...value);
}

export function I2(...value: number[]): Secs2ItemNumeric {
	return createI2Item(...value);
}

export function I4(...value: number[]): Secs2ItemNumeric {
	return createI4Item(...value);
}

export function I8(...value: number[] | bigint[]): Secs2ItemNumeric {
	return createI8Item(...value);
}

export function F4(...value: number[]): Secs2ItemNumeric {
	if (value.some((v) => v % 1 !== 0)) {
		throw new Error("F4 value must be float 32-bit number");
	}
	return createF4Item(...value);
}

export function F8(...value: number[]): Secs2ItemNumeric {
	return createF8Item(...value);
}
