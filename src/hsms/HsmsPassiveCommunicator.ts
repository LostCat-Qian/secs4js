import { Server, Socket, createServer } from "net";
import {
	HsmsCommunicator,
	HsmsCommunicatorConfig,
	HsmsState,
} from "./HsmsCommunicator.js";
import { HsmsMessage } from "./HsmsMessage.js";
import { HsmsControlType } from "./enums/HsmsControlType.js";
import { SelectStatus } from "./enums/SelectStatus.js";
import { RejectReason } from "./enums/RejectReason.js";

export interface HsmsPassiveCommunicatorConfig extends HsmsCommunicatorConfig {
	timeoutRebind?: number;
}

/**
 * @description HsmsPassiveCommunicator is the class that represents an HSMS passive communicator.
 */
export class HsmsPassiveCommunicator extends HsmsCommunicator {
	private server: Server | null = null;
	private shouldStop = false;
	private serverLoopPromise: Promise<void> | null = null;
	private timeoutRebind = 5;

	constructor(config: HsmsPassiveCommunicatorConfig) {
		super(config);
		if (config.timeoutRebind !== undefined) {
			this.timeoutRebind = config.timeoutRebind;
		}
	}

	/**
	 * @description Opens the passive communicator.
	 */
	async open(): Promise<void> {
		if (this.serverLoopPromise) {
			return;
		}

		this.shouldStop = false;

		let resolveFirstListen: (() => void) | null = null;
		const firstListen = new Promise<void>((resolve) => {
			resolveFirstListen = resolve;
		});

		this.serverLoopPromise = this.runServerLoop(() => {
			resolveFirstListen?.();
			resolveFirstListen = null;
		}).catch((err: unknown) => {
			this.emit("error", err instanceof Error ? err : new Error(String(err)));
		});

		await firstListen;
	}

	/**
	 * @description Runs the server loop.
	 * @param onFirstListening The callback function to be called when the first listening is completed.
	 * @returns A Promise that resolves when the server loop is stopped.
	 */
	private async runServerLoop(onFirstListening: () => void): Promise<void> {
		let first = true;
		while (!this.shouldStop) {
			try {
				await this.listenOnce(first ? onFirstListening : null);
			} catch (err) {
				if (!this.shouldStop) {
					this.emit(
						"error",
						err instanceof Error ? err : new Error(String(err)),
					);
				}
			}
			first = false;
			if (this.shouldStop) return;
			await new Promise((resolve) =>
				setTimeout(resolve, this.timeoutRebind * 1000),
			);
		}
	}

	/**
	 * @description Listens for a single connection.
	 * @param onListening The callback function to be called when the connection is established.
	 * @returns A Promise that resolves when the connection is closed.
	 */
	private async listenOnce(onListening: (() => void) | null): Promise<void> {
		return new Promise((resolve, reject) => {
			const server = createServer((socket) => {
				void this.handleIncomingSocket(socket);
			});
			this.server = server;

			const onError = (err: Error) => {
				this.server = null;
				reject(err);
			};

			server.once("error", onError);

			server.on("close", () => {
				if (this.server === server) {
					this.server = null;
				}
				resolve();
			});

			server.listen(this.port, this.ip, () => {
				server.removeListener("error", onError);
				onListening?.();
			});
		});
	}

	/**
	 * @description Handles an incoming socket connection.
	 * @param socket The socket object representing the incoming connection.
	 * @returns A Promise that resolves when the socket connection is handled.
	 */
	private async handleIncomingSocket(socket: Socket): Promise<void> {
		socket.setNoDelay(true);

		if (!this.socket || this.socket.destroyed) {
			const promoted = await this.handleSocketUntilSelected(socket);
			if (promoted) return;
			return;
		}

		await this.handleSocketUntilSelected(socket);
	}

	/**
	 * @description Handles a socket connection until it is selected.
	 * @param socket The socket object representing the connection.
	 * @returns A Promise that resolves with a boolean indicating whether the socket was promoted to selected.
	 */
	private async handleSocketUntilSelected(socket: Socket): Promise<boolean> {
		let buffer = Buffer.alloc(0);
		let t8Timer: NodeJS.Timeout | null = null;
		let t7Timer: NodeJS.Timeout | null = null;

		const clearT8 = () => {
			if (t8Timer) {
				clearTimeout(t8Timer);
				t8Timer = null;
			}
		};

		const resetT8 = () => {
			clearT8();
			if (this.timeoutT8 <= 0) return;
			t8Timer = setTimeout(() => {
				t8Timer = null;
				if (buffer.length > 0 && !socket.destroyed) {
					this.emit("error", new Error("T8 Timeout"));
					socket.destroy();
				}
			}, this.timeoutT8 * 1000);
		};

		const clearT7 = () => {
			if (t7Timer) {
				clearTimeout(t7Timer);
				t7Timer = null;
			}
		};

		const resetT7 = () => {
			clearT7();
			if (this.timeoutT7 <= 0) return;
			t7Timer = setTimeout(() => {
				t7Timer = null;
				if (!socket.destroyed) {
					socket.destroy();
				}
			}, this.timeoutT7 * 1000);
		};

		const sendSocketBuffer = async (buf: Buffer): Promise<void> => {
			await new Promise<void>((resolve, reject) => {
				socket.write(buf, (err) => {
					if (err) reject(err);
					else resolve();
				});
			});
		};

		const cleanup = () => {
			clearT8();
			clearT7();
		};

		const promoteToSelected = (selectReq: HsmsMessage) => {
			socket.removeListener("data", onData);
			socket.removeListener("close", onClose);
			socket.removeListener("end", onEnd);
			socket.removeListener("error", onError);
			cleanup();
			this.handleSocketEvents(socket);
			this.handleSelectReq(selectReq);
		};

		const handlePreSelectedMessage = async (msg: HsmsMessage) => {
			switch (msg.sType as HsmsControlType) {
				case HsmsControlType.Data: {
					const rsp = HsmsMessage.rejectReq(msg, RejectReason.NotSelected);
					await sendSocketBuffer(rsp.toBuffer());
					break;
				}
				case HsmsControlType.LinkTestReq: {
					const rsp = HsmsMessage.linkTestRsp(msg);
					await sendSocketBuffer(rsp.toBuffer());
					break;
				}
				case HsmsControlType.SeparateReq: {
					socket.destroy();
					break;
				}
				case HsmsControlType.SelectReq: {
					if (
						this.socket &&
						!this.socket.destroyed &&
						this.state === HsmsState.Selected
					) {
						const rsp = HsmsMessage.selectRsp(msg, SelectStatus.AlreadyUsed);
						await sendSocketBuffer(rsp.toBuffer());
					} else {
						promoteToSelected(msg);
					}
					break;
				}
				case HsmsControlType.SelectRsp:
				case HsmsControlType.LinkTestRsp: {
					const rsp = HsmsMessage.rejectReq(
						msg,
						RejectReason.TransactionNotOpen,
					);
					await sendSocketBuffer(rsp.toBuffer());
					break;
				}
				case HsmsControlType.RejectReq: {
					break;
				}
				default: {
					const reason =
						msg.pType !== 0
							? RejectReason.NotSupportTypeP
							: RejectReason.NotSupportTypeS;
					const rsp = HsmsMessage.rejectReq(msg, reason);
					await sendSocketBuffer(rsp.toBuffer());
					break;
				}
			}
		};

		let processing = false;
		const processIncoming = async () => {
			if (processing) return;
			processing = true;
			try {
				while (true) {
					if (buffer.length < 4) return;
					const length = buffer.readUInt32BE(0);
					if (length < 10) {
						this.emit("error", new Error("Receive message size < 10"));
						buffer = Buffer.alloc(0);
						socket.destroy();
						return;
					}
					if (buffer.length < 4 + length) return;

					const msgBuffer = buffer.subarray(0, 4 + length);
					buffer = buffer.subarray(4 + length);
					if (buffer.length === 0) clearT8();

					let msg: HsmsMessage;
					try {
						msg = HsmsMessage.fromBuffer(msgBuffer);
					} catch (err) {
						this.emit(
							"error",
							err instanceof Error ? err : new Error(String(err)),
						);
						socket.destroy();
						return;
					}

					resetT7();
					await handlePreSelectedMessage(msg);

					if (this.socket === socket && this.state === HsmsState.Selected) {
						return;
					}
				}
			} catch (err) {
				this.emit("error", err instanceof Error ? err : new Error(String(err)));
				socket.destroy();
			} finally {
				processing = false;
			}
		};

		const onData = (data: Buffer) => {
			buffer = Buffer.concat([buffer, data]);
			resetT8();
			void processIncoming();
		};

		const onClose = () => {
			cleanup();
		};

		const onEnd = () => {
			if (!socket.destroyed) {
				socket.destroy();
			}
		};

		const onError = (err: Error) => {
			this.emit("error", err);
		};

		socket.on("data", onData);
		socket.on("close", onClose);
		socket.on("end", onEnd);
		socket.on("error", onError);
		resetT7();

		await new Promise<void>((resolve) => {
			socket.once("close", () => resolve());
		});

		return this.socket === socket && this.state === HsmsState.Selected;
	}

	async close(): Promise<void> {
		this.shouldStop = true;
		// Close client connection first
		if (this.socket) {
			this.socket.end();
			this.socket.destroy();
			this.socket = null;
		}

		// Stop listening
		const server = this.server;
		if (server) {
			await new Promise<void>((resolve, reject) => {
				server.close((err) => {
					this.server = null;
					if (err) reject(err);
					else resolve();
				});
			});
		}

		if (this.serverLoopPromise) {
			const loop = this.serverLoopPromise;
			this.serverLoopPromise = null;
			await loop;
		}
	}
}
