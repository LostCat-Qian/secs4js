import { Socket } from "net";
import {
	HsmsCommunicator,
	HsmsCommunicatorConfig,
	HsmsState,
} from "./HsmsCommunicator.js";
import { HsmsMessage } from "./HsmsMessage.js";
import { RejectReason } from "./enums/RejectReason.js";
import { SelectStatus } from "./enums/SelectStatus.js";

/**
 * @description HsmsActiveCommunicator is a class that extends HsmsCommunicator and implements the active communicator logic.
 */
export class HsmsActiveCommunicator extends HsmsCommunicator {
	private shouldStop = false;
	private reconnectTimer: NodeJS.Timeout | null = null;
	private connectionPromiseResolver: (() => void) | null = null;
	private heartbeatTimer: NodeJS.Timeout | null = null;
	public heartbeatIntervalMs = 5000;

	constructor(config: HsmsCommunicatorConfig) {
		super(config);
		if (config.linkTestInterval !== undefined) {
			this.heartbeatIntervalMs = config.linkTestInterval;
		}
		this.on("disconnected", () => {
			this.stopHeartbeat();
			if (!this.shouldStop) {
				console.log(
					`Connection lost. Reconnecting in ${String(this.timeoutT5)}s...`,
				);
				this.scheduleReconnect();
			}
		});

		this.on("selected", () => {
			this.startHeartbeat();
		});
	}

	async open(): Promise<void> {
		if (this.socket && !this.socket.destroyed) {
			return; // Already open
		}

		this.shouldStop = false;

		return new Promise((resolve) => {
			this.connectionPromiseResolver = resolve;
			this.connect();
		});
	}

	private connect() {
		if (this.shouldStop) return;

		const socket = new Socket();

		const onError = (err: Error) => {
			socket.destroy();
			console.log(
				`Connection failed: ${err.message}. Retrying in ${String(this.timeoutT5)}s...`,
			);
			if (!this.shouldStop) {
				this.scheduleReconnect();
			}
		};

		socket.once("error", onError);

		socket.connect(this.port, this.ip, () => {
			socket.removeListener("error", onError);
			this.handleSocketEvents(socket);

			// Automatically send SelectReq upon connection
			void this.sendSelectReq()
				.then(() => {
					// Select success, state updated in handleSelectRsp
				})
				.catch((err) => {
					if (err instanceof Error) {
						console.error(`SelectReq failed: ${err.message}`);
					} else {
						console.error(`SelectReq failed: ${err}`);
					}
					// If Select fails, close connection to trigger reconnect logic
					if (!socket.destroyed) {
						socket.destroy();
					}
				});

			if (this.connectionPromiseResolver) {
				this.connectionPromiseResolver();
				this.connectionPromiseResolver = null;
			}
		});
	}

	private scheduleReconnect() {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
		}
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, this.timeoutT5 * 1000);
	}

	private async runHeartbeatLoop() {
		if (this.state !== HsmsState.Selected || this.shouldStop) return;

		try {
			await this.sendLinkTestReq();
		} catch (err) {
			console.error("Heartbeat failed, closing connection:", err);
			// Force close to trigger reconnect
			if (this.socket) {
				this.socket.destroy();
			}
			return; // Stop loop
		}

		if (this.state === HsmsState.Selected && !this.shouldStop) {
			this.heartbeatTimer = setTimeout(() => {
				void this.runHeartbeatLoop();
			}, this.heartbeatIntervalMs);
		}
	}

	private startHeartbeat() {
		this.stopHeartbeat();
		// Start first heartbeat after interval
		this.heartbeatTimer = setTimeout(() => {
			void this.runHeartbeatLoop();
		}, this.heartbeatIntervalMs);
	}

	private stopHeartbeat() {
		if (this.heartbeatTimer) {
			clearTimeout(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}

	protected override handleSelectReq(msg: HsmsMessage) {
		void this.sendReject(msg, RejectReason.NotSupportTypeS);
	}

	async untilConnected(): Promise<SelectStatus> {
		if (this.state === HsmsState.Selected) {
			return SelectStatus.Success;
		}
		return new Promise((resolve) => {
			const onSelected = () => {
				resolve(SelectStatus.Success);
			};
			this.once("selected", onSelected);
		});
	}

	async close(): Promise<void> {
		this.shouldStop = true;
		this.stopHeartbeat();
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.socket) {
			this.socket.end();
			this.socket.destroy();
			this.socket = null;
		}
		await Promise.resolve();
	}
}
