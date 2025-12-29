import { describe, expect, it, vi } from "vitest";
import { createServer } from "net";
import { once } from "node:events";
import { HsmsActiveCommunicator } from "./HsmsActiveCommunicator.js";
import { HsmsPassiveCommunicator } from "./HsmsPassiveCommunicator.js";

async function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close(() => reject(new Error("Failed to get free port")));
				return;
			}
			const port = address.port;
			server.close((err) => {
				if (err) reject(err);
				else resolve(port);
			});
		});
	});
}

describe("HsmsPassiveCommunicator reconnect", () => {
	it("accepts a new connection after previous disconnect", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
		const errorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const warnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => undefined);

		const port = await getFreePort();

		try {
			const passive = new HsmsPassiveCommunicator({
				ip: "127.0.0.1",
				port,
				deviceId: 1,
				isEquip: true,
				timeoutT5: 0.1,
				timeoutT6: 0.2,
				timeoutT7: 0.2,
				timeoutT8: 0.2,
				timeoutRebind: 0.05,
			});

			await passive.open();

			for (let i = 0; i < 3; i++) {
				const active = new HsmsActiveCommunicator({
					ip: "127.0.0.1",
					port,
					deviceId: 1,
					isEquip: false,
					timeoutT5: 0.05,
					timeoutT6: 0.2,
					timeoutT7: 0.2,
					timeoutT8: 0.2,
				});

				await active.open();
				await expect(active.untilConnected()).resolves.toBeDefined();

				const passiveDisconnected = once(passive, "disconnected");
				await active.close();
				await passiveDisconnected;
			}

			await passive.close();
		} finally {
			logSpy.mockRestore();
			errorSpy.mockRestore();
			warnSpy.mockRestore();
		}
	});
});
