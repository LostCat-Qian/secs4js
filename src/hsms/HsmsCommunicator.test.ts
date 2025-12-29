import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import { Socket } from "net";
import { HsmsCommunicator, HsmsState } from "./HsmsCommunicator.js";
import { HsmsMessage } from "./HsmsMessage.js";

class TestSocket extends EventEmitter {
	public destroyed = false;

	write(_data: Buffer, cb?: (err?: Error) => void) {
		cb?.();
		return true;
	}

	destroy() {
		if (this.destroyed) return this;
		this.destroyed = true;
		this.emit("close");
		return this;
	}
}

class TestHsmsCommunicator extends HsmsCommunicator {
	async open(): Promise<void> {
		await Promise.resolve();
	}

	async close(): Promise<void> {
		await Promise.resolve();
	}

	protected async sendBuffer(_buffer: Buffer): Promise<void> {
		await Promise.resolve();
	}

	public exposeHandleSocketEvents(socket: Socket) {
		this.handleSocketEvents(socket);
	}

	public exposeHandleSelectReq(msg: HsmsMessage) {
		this.handleSelectReq(msg);
	}

	public getState() {
		return this.state;
	}
}

describe("HsmsCommunicator T7", () => {
	it("destroys socket on T7 timeout when not selected", () => {
		vi.useFakeTimers();
		const comm = new TestHsmsCommunicator({
			deviceId: 1,
			isEquip: false,
			ip: "127.0.0.1",
			port: 5000,
			timeoutT7: 1,
			timeoutT8: 0,
		});

		const socket = new TestSocket();
		const errors: string[] = [];
		comm.on("error", (err: unknown) => {
			if (err instanceof Error) {
				errors.push(err.message);
				return;
			}
			errors.push(String(err));
		});

		comm.exposeHandleSocketEvents(socket as unknown as Socket);
		expect(comm.getState()).toBe(HsmsState.Connected);

		vi.advanceTimersByTime(1000);

		expect(socket.destroyed).toBe(true);
		expect(errors).toContain("T7 Timeout");
		vi.useRealTimers();
	});

	it("clears T7 timer on select", () => {
		vi.useFakeTimers();
		const comm = new TestHsmsCommunicator({
			deviceId: 1,
			isEquip: false,
			ip: "127.0.0.1",
			port: 5000,
			timeoutT7: 1,
			timeoutT8: 0,
		});

		const socket = new TestSocket();
		comm.exposeHandleSocketEvents(socket as unknown as Socket);
		comm.exposeHandleSelectReq(HsmsMessage.selectReq(1));
		expect(comm.getState()).toBe(HsmsState.Selected);

		vi.advanceTimersByTime(1000);

		expect(socket.destroyed).toBe(false);
		vi.useRealTimers();
	});
});
