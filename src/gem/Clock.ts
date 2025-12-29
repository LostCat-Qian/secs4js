import { AbstractSecs2Item } from "../core/secs2item/AbstractSecs2Item.js";
import { Secs2ItemAscii } from "../core/secs2item/Secs2ItemAscii.js";

export enum ClockType {
	A12 = "A12",
	A16 = "A16",
}

export class Clock {
	constructor(private datetime: Date) {}

	toA16(): Secs2ItemAscii {
		const year = this.datetime.getFullYear();
		const month = (this.datetime.getMonth() + 1).toString().padStart(2, "0");
		const day = this.datetime.getDate().toString().padStart(2, "0");
		const hour = this.datetime.getHours().toString().padStart(2, "0");
		const minute = this.datetime.getMinutes().toString().padStart(2, "0");
		const second = this.datetime.getSeconds().toString().padStart(2, "0");
		const cc = Math.floor(this.datetime.getMilliseconds() / 10)
			.toString()
			.padStart(2, "0");

		return new Secs2ItemAscii(
			`${year}${month}${day}${hour}${minute}${second}${cc}`,
		);
	}

	toA12(): Secs2ItemAscii {
		const year = this.datetime.getFullYear().toString().slice(-2);
		const month = (this.datetime.getMonth() + 1).toString().padStart(2, "0");
		const day = this.datetime.getDate().toString().padStart(2, "0");
		const hour = this.datetime.getHours().toString().padStart(2, "0");
		const minute = this.datetime.getMinutes().toString().padStart(2, "0");
		const second = this.datetime.getSeconds().toString().padStart(2, "0");

		return new Secs2ItemAscii(`${year}${month}${day}${hour}${minute}${second}`);
	}

	toDatetime(): Date {
		return this.datetime;
	}

	static now(): Clock {
		return new Clock(new Date());
	}

	static fromAscii(item: AbstractSecs2Item): Clock {
		if (!(item instanceof Secs2ItemAscii)) {
			throw new Error("Clock can only be parsed from ASCII item");
		}
		const val = item.value;
		const len = val.length;

		if (len === 12) {
			// YYMMDDHHMMSS
			const yy = parseInt(val.substring(0, 2), 10);
			const mm = parseInt(val.substring(2, 4), 10);
			const dd = parseInt(val.substring(4, 6), 10);
			const hh = parseInt(val.substring(6, 8), 10);
			const min = parseInt(val.substring(8, 10), 10);
			const ss = parseInt(val.substring(10, 12), 10);

			const year = Clock.getYear(yy);
			return new Clock(new Date(year, mm - 1, dd, hh, min, ss));
		} else if (len === 16) {
			// YYYYMMDDHHMMSSCC
			const year = parseInt(val.substring(0, 4), 10);
			const mm = parseInt(val.substring(4, 6), 10);
			const dd = parseInt(val.substring(6, 8), 10);
			const hh = parseInt(val.substring(8, 10), 10);
			const min = parseInt(val.substring(10, 12), 10);
			const ss = parseInt(val.substring(12, 14), 10);
			const cc = parseInt(val.substring(14, 16), 10);

			return new Clock(new Date(year, mm - 1, dd, hh, min, ss, cc * 10));
		}

		throw new Error("Unknown ClockType format");
	}

	private static getYear(yy: number): number {
		const nowYear = new Date().getFullYear();
		const century = Math.floor(nowYear / 100) * 100;
		const flacYear = nowYear % 100;

		if (flacYear < 25) {
			if (yy >= 75) return century - 100 + yy;
		} else if (flacYear >= 75) {
			if (yy < 25) return century + 100 + yy;
		}
		return century + yy;
	}
}
