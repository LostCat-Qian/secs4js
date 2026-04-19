import {
	A,
	U1,
	U2,
	U4,
	I1,
	I2,
	I4,
	I8,
	F4,
	F8,
	L,
	SmlParser,
	Secs2ItemAscii,
	Secs2ItemList,
	Secs2ItemNumeric,
	U8,
	BOOLEAN,
	Secs2ItemBoolean,
} from "../src/index.js";

function getItemValue() {
	const body = L(A("MDLN-A"), A("SOFTREV-1"));
	const firstA = body?.[0] as Secs2ItemAscii;
	console.log("MDLN: ", firstA.value);

	const smlBody = `
        <L
            <A "OK" >
            <U1 20 >
            <U2 1000 2000 >
            <U4 100000000 200000000 >
            <U8 1000000000000000 2000000000000 >
            <I1 10 20 >
            <I2 1000 -2000 >
            <I4 100 >
            <I8 -1234567890123456 9973232131213124 >
            <F4 3.14 -6.18 >
            <F8 1.234567890123456 6.18 >
            <B 0x10 0x20 >
            <Boolean TRUE FALSE >
            <L
                <A "Nested" >
                <F4 3.14 >
                <L
                    <A "More Nested">
                    <Boolean F>
                >
            >
        >
    `;
	const smlBodySecs2Items = SmlParser.parseBody(smlBody);
	const zeroItem = smlBodySecs2Items?.[0] as Secs2ItemAscii;
	const firstU1 = smlBodySecs2Items?.[1] as Secs2ItemNumeric;
	const secondItem = smlBodySecs2Items?.[2] as Secs2ItemNumeric;
	const eighthItem = smlBodySecs2Items?.[8] as Secs2ItemNumeric;
	const tenthItem = smlBodySecs2Items?.[10] as Secs2ItemNumeric;
	const twelfthItem = smlBodySecs2Items?.[12] as Secs2ItemNumeric;
	const nestedList = smlBodySecs2Items?.[13] as Secs2ItemList;
	const nestedListFirstItem = nestedList?.[0] as Secs2ItemAscii;
	console.log("ASCII value: ", zeroItem.value);
	console.log("U1 value: ", firstU1.value);
	console.log("U2 value: ", secondItem.value);
	console.log("I8 value: ", eighthItem.value);
	console.log("F8 value: ", tenthItem.value);
	console.log("BOOLEAN value: ", twelfthItem.value);
	console.log("NESTED ASCII value: ", nestedListFirstItem.value);
}

function newItemsTest() {
	const newItems = L(
		A("MDLN-A"),
		A("SOFTREV-1"),
		U1(20),
		U2(1000, 2000),
		U4(100000000, 200000000),
		U8(1000000000000000, 2000000000000),
		I1(10, 20),
		I2(1000, -2000),
		I4(100),
		I8(-1234567890123456, 9973232131213124),
		F4(3.14),
		F8(1.234567890123456, 6.18),
		BOOLEAN(true, false),
	);

	console.log((newItems[12] as Secs2ItemBoolean).value); // [true, false]
	console.log(newItems.toSml());
	// <L [13]
	// 	<A [6] "MDLN-A">
	// 	<A [9] "SOFTREV-1">
	// 	<U1 [1] 20>
	// 	<U2 [2] 1000 2000>
	// 	<U4 [2] 100000000 200000000>
	// 	<U8 [2] 1000000000000000 2000000000000>
	// 	<I1 [2] 10 20>
	// 	<I2 [2] 1000 -2000>
	// 	<I4 [1] 100>
	// 	<I8 [2] -1234567890123456 9973232131213124>
	// 	<F4 [1] 3.14>
	// 	<F8 [2] 1.234567890123456 6.18>
	// 	<BOOLEAN T F>
	// >
}

newItemsTest();
getItemValue();
