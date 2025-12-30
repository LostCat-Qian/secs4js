import { Server, Socket, createServer } from "net";
import {
	Secs1Communicator,
	Secs1CommunicatorConfig,
} from "./Secs1Communicator.js";

export interface Secs1OnTcpIpPassiveCommunicatorConfig extends Secs1CommunicatorConfig {
	ip: string;
	port: number;
}

export class Secs1OnTcpIpPassiveCommunicator extends Secs1Communicator {
	public ip: string;
	public port: number;

	private server: Server | null = null;

	constructor(config: Secs1OnTcpIpPassiveCommunicatorConfig) {
		super(config);
		this.ip = config.ip;
		this.port = config.port;
	}

	async open(): Promise<void> {
		if (this.server) return;

		return new Promise((resolve, reject) => {
			this.server = createServer((socket) => {
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
				this.handleIncomingSocket(socket);
			});

			this.server.on("error", (err) => {
				reject(err);
			});

			this.server.listen(this.port, this.ip, () => {
				resolve();
			});
		});
	}

	close(): Promise<void> {
		this.stop();
		if (this.server) {
			this.server.close();
			this.server = null;
		}
		return Promise.resolve();
	}

	private handleIncomingSocket(socket: Socket) {
		this.attachStream(socket);
	}
}
