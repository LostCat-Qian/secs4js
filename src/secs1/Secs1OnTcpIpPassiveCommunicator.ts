import { Server, Socket, createServer } from "net";
import {
	Secs1Communicator,
	Secs1CommunicatorConfig,
} from "./Secs1Communicator.js";

export interface Secs1OnTcpIpPassiveCommunicatorConfig extends Secs1CommunicatorConfig {
	ip: string;
	port: number;
	timeoutRebind?: number;
}

export class Secs1OnTcpIpPassiveCommunicator extends Secs1Communicator {
	public ip: string;
	public port: number;

	private server: Server | null = null;
	private shouldStop = false;
	private serverLoopPromise: Promise<void> | null = null;
	private timeoutRebind = 5;

	constructor(config: Secs1OnTcpIpPassiveCommunicatorConfig) {
		super(config);
		this.ip = config.ip;
		this.port = config.port;
		if (config.timeoutRebind !== undefined) {
			this.timeoutRebind = config.timeoutRebind;
		}
	}

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
				if (!this.shouldStop) {
					await new Promise((resolve) =>
						setTimeout(resolve, this.timeoutRebind * 1000),
					);
				}
			}
			first = false;
			if (this.shouldStop) return;
		}
	}

	private async listenOnce(onListening: (() => void) | null): Promise<void> {
		return new Promise((resolve, reject) => {
			const server = createServer((socket) => {
				void this.handleIncomingSocket(socket);
			});
			this.server = server;

			let hasConnected = false;
			let settled = false;

			const cleanup = () => {
				server.removeListener("error", onServerError);
				server.removeListener("close", onServerClose);
				this.removeListener("connected", onConnected);
				this.removeListener("disconnected", onDisconnected);
			};

			const finish = (err?: Error) => {
				if (settled) return;
				settled = true;
				if (this.server === server) {
					this.server = null;
				}
				cleanup();
				if (err) reject(err);
				else resolve();
			};

			const closeServer = () => {
				if (settled) return;
				if (!server.listening) {
					finish();
					return;
				}
				server.close((closeErr) => {
					if (closeErr) finish(closeErr);
					else finish();
				});
			};

			const onServerError = (_err: Error) => {
				closeServer();
			};

			const onServerClose = () => {
				finish();
			};

			const onConnected = () => {
				hasConnected = true;
			};

			const onDisconnected = () => {
				if (!hasConnected) return;
				closeServer();
			};

			server.on("error", onServerError);
			server.on("close", onServerClose);
			this.on("connected", onConnected);
			this.on("disconnected", onDisconnected);

			server.listen(this.port, this.ip, () => {
				onListening?.();
			});
		});
	}

	private handleIncomingSocket(socket: Socket): Promise<void> {
		return new Promise((resolve) => {
			if (this.stream && !this.stream.destroyed) {
				this.logger.detail.warn(
					{
						protocol: "SECS-I-TCP/IP",
						remoteAddress: socket.remoteAddress,
						remotePort: socket.remotePort,
					},
					"rejecting new connection (single session)",
				);
				socket.destroy();
				resolve();
				return;
			}
			this.logger.detail.info(
				{
					protocol: "SECS-I-TCP/IP",
					remoteAddress: socket.remoteAddress,
					remotePort: socket.remotePort,
				},
				"accepted connection",
			);
			this.attachStream(socket);
			resolve();
		});
	}

	close(): Promise<void> {
		this.shouldStop = true;
		this.stop();
		const server = this.server;
		if (server) {
			return new Promise<void>((resolve) => {
				server.close(() => {
					this.server = null;
					resolve();
				});
			});
		}
		if (this.serverLoopPromise) {
			const loop = this.serverLoopPromise;
			this.serverLoopPromise = null;
			return loop;
		}
		return Promise.resolve();
	}
}
