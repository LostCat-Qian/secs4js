import { Secs1OnTcpIpPassiveCommunicator } from "../src/index.js";

async function Secs1PassiveOnTcpTest() {
	const secs1PassiveOnTcp = new Secs1OnTcpIpPassiveCommunicator({
		ip: "127.0.0.1",
		port: 8201,
		deviceId: 10,
		isEquip: true,
		log: {
			enabled: true,
			console: true,
			baseDir: "./secs4js-logs",
			retentionDays: 30,
			detailLevel: "trace",
			secs2Level: "info",
		},
	});

	await secs1PassiveOnTcp.open();
}

Secs1PassiveOnTcpTest().catch((err) => {
	console.error(err);
});
