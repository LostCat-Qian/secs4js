import { Socket } from "net";
import {
	Secs1Communicator,
	Secs1CommunicatorConfig,
} from "./Secs1Communicator.js";

export interface Secs1OnTcpIpActiveCommunicatorConfig extends Secs1CommunicatorConfig {
	ip: string;
	port: number;
}

export class Secs1OnTcpIpActiveCommunicator extends Secs1Communicator {
	public ip: string;
	public port: number;

	private shouldStop = false;
	private reconnectTimer: NodeJS.Timeout | null = null;
	private connectionPromiseResolver: (() => void) | null = null;
	private pendingSocket: Socket | null = null;

	constructor(config: Secs1OnTcpIpActiveCommunicatorConfig) {
		super(config);
		this.ip = config.ip;
		this.port = config.port;
		this.on("disconnected", () => {
			if (!this.shouldStop) {
				this.logger.detail.warn(
					{
						protocol: "SECS-I-TCP/IP",
						ip: this.ip,
						port: this.port,
						timeoutT5: this.timeoutT5,
					},
					"connection lost; scheduling reconnect",
				);
				this.scheduleReconnect();
			}
		});
	}

	async open(): Promise<void> {
		if (this.stream && !this.stream.destroyed) return;
		if (this.pendingSocket && !this.pendingSocket.destroyed) return;

		this.shouldStop = false;

		return new Promise((resolve) => {
			this.connectionPromiseResolver = resolve;
			this.connect();
		});
	}

	private connect() {
		if (this.shouldStop) return;
		if (this.stream && !this.stream.destroyed) return;
		if (this.pendingSocket && !this.pendingSocket.destroyed) return;

		const socket = new Socket();
		socket.setNoDelay(true);
		this.pendingSocket = socket;

		const onError = (err: Error) => {
			socket.destroy();
			this.logger.detail.warn(
				{
					protocol: "SECS-I-TCP/IP",
					ip: this.ip,
					port: this.port,
					timeoutT5: this.timeoutT5,
					err,
				},
				"connection failed; scheduling reconnect",
			);
			if (!this.shouldStop) {
				this.scheduleReconnect();
			}
		};

		socket.once("error", onError);

		socket.once("close", () => {
			if (this.pendingSocket === socket) {
				this.pendingSocket = null;
			}
		});

		socket.connect(this.port, this.ip, () => {
			socket.removeListener("error", onError);
			if (this.pendingSocket === socket) {
				this.pendingSocket = null;
			}
			this.attachStream(socket);

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

	async close(): Promise<void> {
		this.shouldStop = true;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.pendingSocket) {
			this.pendingSocket.destroy();
			this.pendingSocket = null;
		}
		this.stop();
		await Promise.resolve();
	}
}
