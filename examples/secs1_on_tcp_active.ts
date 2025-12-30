import { Secs1OnTcpIpActiveCommunicator } from "../src/index.js";

async function Secs1ActiveOnTcpTest() {
	const secs1ActiveOnTcp = new Secs1OnTcpIpActiveCommunicator({
		ip: "127.0.0.1",
		port: 8200,
		deviceId: 10,
		isEquip: false,
		log: {
			enabled: true,
			console: true,
			baseDir: "./secs4js-logs",
			retentionDays: 30,
			detailLevel: "trace",
			secs2Level: "info",
		},
	});

	await secs1ActiveOnTcp.open();
}

Secs1ActiveOnTcpTest().catch((err) => {
	console.error(err);
});
