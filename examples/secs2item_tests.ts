import { A, L, U1 } from "../src/index.js";

function testSecs2ItemAscii() {
	const secs2Item = L(L(A("Hello World"), U1(123)));
	console.log(secs2Item.toSml());
	console.log(secs2Item[0][0].type);
}

testSecs2ItemAscii();
