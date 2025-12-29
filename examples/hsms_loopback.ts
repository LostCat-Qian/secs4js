import { HsmsActiveCommunicator } from "../src/hsms/HsmsActiveCommunicator.js";
import { A, L, SecsMessage } from "../src/index.js";

async function main() {
	// const passive = new HsmsPassiveCommunicator({
	// 	ip: "127.0.0.1",
	// 	port: 5000,
	// 	deviceId: 10,
	// 	isEquip: true,
	// });

	// passive.on("message", (msg: SecsMessage) => {
	// 	void (async () => {
	// 		console.log(`Passive received: ${msg.toSml()}`);
	// 		if (msg.stream === 1 && msg.func === 1) {
	// 			await passive.reply(
	// 				msg,
	// 				1,
	// 				2,
	// 				createListItem(
	// 					createAsciiItem("MDLN-A"),
	// 					createAsciiItem("SOFTREV-1"),
	// 				),
	// 			);
	// 			console.log("Passive replied S1F2");
	// 		}
	// 	})();
	// });

	// await passive.open();
	// setTimeout(() => {
	// 	return 0;
	// }, 10000000);
	// console.log("Passive opened");

	const active = new HsmsActiveCommunicator({
		ip: "127.0.0.1",
		port: 5000,
		deviceId: 10,
		isEquip: false,
	});

	active.on("connected", () => console.log("Active TCP Connected"));
	active.on("disconnected", () => console.log("Active Disconnected"));
	active.on("selected", () => console.log("Active Selected (HSMS Ready)"));

	await active.open();
	console.log("Active opened");

	// Active will automatically send SelectReq and start heartbeat

	await active.untilConnected(); // Wait for Select success

	active.on("message", (msg: SecsMessage) => {
		void (async () => {
			console.log(`Active received: ${msg.toSml()}`);
			if (msg.stream === 1 && msg.func === 1) {
				await active.reply(msg, 1, 2, L(A("MDLN-A"), A("SOFTREV-1")));
			}
			if (msg.stream === 1 && msg.func === 13) {
				await active.reply(msg, 1, 14, L(A("ACK")));
			}
		})();
	});

	const reply = await active.send(1, 1, true);
	console.log(`Active received reply: ${reply?.toSml()}`);

	// Keep running to allow testing disconnect/reconnect manually
	setTimeout(() => {
		return 0;
	}, 10000000);
}

main().catch(console.error);
