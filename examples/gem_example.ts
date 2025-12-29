import {
	HsmsPassiveCommunicator,
	Gem,
	CommAck,
	OnlAck,
	SecsMessage,
} from "../src/index.js";

/*
 * This example demonstrates how to use the GEM module with HSMS communicators.
 * It simulates both a Host (Active) and an Equipment (Passive).
 */

async function main() {
	// 1. Setup Equipment (Passive)
	const equipComm = new HsmsPassiveCommunicator({
		ip: "127.0.0.1",
		port: 5001,
		deviceId: 1,
		isEquip: true,
		name: "Equipment",
	});

	const equipGem = new Gem(equipComm);
	equipGem.mdln = "MyEquip";
	equipGem.softrev = "1.0.0";

	// Handle incoming messages on Equipment side
	equipComm.on("message", (msg: SecsMessage) => {
		void (async () => {
			try {
				// S1F13: Establish Communications Request
				if (msg.stream === 1 && msg.func === 13) {
					console.log("[Equip] Received S1F13, replying S1F14...");
					await equipGem.s1f14(msg, CommAck.OK);
				}
				// S1F17: Request ON-LINE
				else if (msg.stream === 1 && msg.func === 17) {
					console.log("[Equip] Received S1F17, replying S1F18...");
					await equipGem.s1f18(msg, OnlAck.OK);
				}
				// S2F17: Date and Time Request
				else if (msg.stream === 2 && msg.func === 17) {
					console.log("[Equip] Received S2F17, replying S2F18...");
					await equipGem.s2f18Now(msg);
				} else {
					console.log(
						`[Equip] Received unhandled message S${msg.stream}F${msg.func}`,
					);
				}
			} catch (err) {
				console.error("[Equip] Error handling message:", err);
			}
		})();
	});

	await equipComm.open();

	// 2. Setup Host (Active)
	// const hostComm = new HsmsActiveCommunicator({
	// 	ip: "127.0.0.1",
	// 	port: 5000,
	// 	deviceId: 1,
	// 	isEquip: false,
	// 	name: "Host",
	// });

	// const hostGem = new Gem(hostComm);

	// // 3. Start communication
	// console.log("Starting communicators...");
	// await equipComm.open();
	// await hostComm.open();
	// console.log("Communicators connected.");

	// // Wait for 'selected' event on Host
	// await new Promise<void>((resolve) => {
	// 	if (hostComm.connectionState === "Selected") {
	// 		resolve();
	// 	} else {
	// 		hostComm.once("selected", () => resolve());
	// 	}
	// });
	// console.log("HSMS Selected.");

	// try {
	// 	// 4. Host sends S1F13 (Establish Communications)
	// 	console.log("[Host] Sending S1F13...");
	// 	const commAck = await hostGem.s1f13();
	// 	console.log(
	// 		`[Host] S1F13 reply received. CommAck: ${commAck === CommAck.OK ? "OK" : "Denied"}`,
	// 	);

	// 	// 5. Host sends S1F17 (Request ON-LINE)
	// 	console.log("[Host] Sending S1F17...");
	// 	const onlAck = await hostGem.s1f17();
	// 	console.log(
	// 		`[Host] S1F17 reply received. OnlAck: ${onlAck === OnlAck.OK ? "OK" : "Refused"}`,
	// 	);

	// 	// 6. Host sends S2F17 (Request Time)
	// 	console.log("[Host] Sending S2F17...");
	// 	const clock = await hostGem.s2f17();
	// 	console.log(
	// 		`[Host] S2F17 reply received. Equipment Time: ${clock.toDatetime().toISOString()}`,
	// 	);
	// } catch (err) {
	// 	console.error("[Host] GEM Scenario Error:", err);
	// } finally {
	// 	// Cleanup
	// 	await hostComm.close();
	// 	await equipComm.close();
	// }
}

main().catch(console.error);
