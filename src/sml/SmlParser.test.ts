import { describe, expect, it } from "vitest";
import { SmlParser } from "./SmlParser.js";
import { Secs2ItemAscii } from "../core/secs2item/Secs2ItemAscii.js";
import { Secs2ItemBinary } from "../core/secs2item/Secs2ItemBinary.js";
import { Secs2ItemList } from "../core/secs2item/Secs2ItemList.js";
import { Secs2ItemNumeric } from "../core/secs2item/Secs2ItemNumeric.js";

describe("SmlParser enhancements", () => {
	it("throws clear error when full SML missing trailing dot", () => {
		expect(() => SmlParser.parse("S1F13\n<L>\n")).toThrow(
			"SML must end with '.'",
		);
	});

	it("throws clear error when full SML missing SxFy header", () => {
		expect(() => SmlParser.parse("<L>.")).toThrow("SML must start with 'SxFy'");
	});

	it("parses SML body with // line comments", () => {
		const smlBody = `
			<L
				<U4 0> // 这是一行注释
				<L // 这是一个L类型
					<A "Hello"> // 这也是一行注释
				>
			>\n`;

		const parsed = SmlParser.parseBody(smlBody);
		expect(parsed).toBeInstanceOf(Secs2ItemList);
		const outer = parsed as Secs2ItemList;
		expect(outer.value.length).toBe(2);
		expect(outer.value[0]).toBeInstanceOf(Secs2ItemNumeric);
		expect(outer.value[1]).toBeInstanceOf(Secs2ItemList);
		const inner = outer.value[1] as Secs2ItemList;
		expect(inner.value.length).toBe(1);
		expect(inner.value[0]).toBeInstanceOf(Secs2ItemAscii);
		expect((inner.value[0] as Secs2ItemAscii).value).toBe("Hello");
	});

	it("parses A with single-quoted strings", () => {
		const parsed = SmlParser.parseBody(`<A 'Hello World'>`);
		expect(parsed).toBeInstanceOf(Secs2ItemAscii);
		expect((parsed as Secs2ItemAscii).value).toBe("Hello World");
	});

	it("parses B with hex bytes without 0x prefix", () => {
		const parsed = SmlParser.parseBody(`<B 00 0A 10>`);
		expect(parsed).toBeInstanceOf(Secs2ItemBinary);
		expect(Array.from((parsed as Secs2ItemBinary).value)).toEqual([
			0x00, 0x0a, 0x10,
		]);
	});

	it("parses empty-content items for SEMI-allowed types", () => {
		const parsed = SmlParser.parseBody(`
			<L
				<U4>
				<A>
				<B>
				<U1>
				<U2>
				<U8>
				<I1>
				<I2>
				<I4>
				<I8>
				<F4>
				<F8>
				<L>
			>
		`);

		expect(parsed).toBeInstanceOf(Secs2ItemList);
		const outer = parsed as Secs2ItemList;
		expect(outer.value.length).toBe(13);

		const u4 = outer.value[0];
		expect(u4).toBeInstanceOf(Secs2ItemNumeric);
		expect((u4 as Secs2ItemNumeric).valueAsArray).toEqual([]);

		const a = outer.value[1];
		expect(a).toBeInstanceOf(Secs2ItemAscii);
		expect((a as Secs2ItemAscii).value).toBe("");

		const b = outer.value[2];
		expect(b).toBeInstanceOf(Secs2ItemBinary);
		expect((b as Secs2ItemBinary).value.length).toBe(0);
	});
});
