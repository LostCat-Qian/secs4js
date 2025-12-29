import {
	A,
	L,
	U1,
	Secs2ItemBinary,
	Secs2ItemList,
	SecsMessage,
	Secs2ItemFactory,
} from "../src/index.js";
import { SmlParser } from "../src/sml/SmlParser.js";

function testSecs2Item() {
	const secs2Item = L(L(A("Hello World"), U1(123)));
	console.log(secs2Item.toSml());
	const nested = secs2Item.value[0];
	if (nested instanceof Secs2ItemList) {
		const first = nested.value[0];
		console.log(first.type);
	}

	const sml = `
    S1F13
    <L
        <B 0x20>
        <A "Hello World">
    >.
    `;

	const smlBody = `
    <L
        <B 0x20>
        <A "Hello World">
    >.
    `;

	const parsedMessage = SmlParser.parse(sml);
	const firstBodyItem =
		parsedMessage.body instanceof Secs2ItemList
			? parsedMessage.body.value[0]
			: null;
	const bytes =
		firstBodyItem instanceof Secs2ItemBinary ? firstBodyItem.value : null;
	console.log(
		parsedMessage.stream,
		parsedMessage.func,
		parsedMessage.wBit,
		bytes,
	);

	const parsedBody = SmlParser.parseBody(smlBody);
	console.log(parsedBody?.toSml());
}

testSecs2Item();
