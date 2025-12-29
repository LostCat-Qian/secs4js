import { SerialPort } from "serialport";
import {
	Secs1Communicator,
	Secs1CommunicatorConfig,
} from "./Secs1Communicator.js";

export interface Secs1SerialCommunicatorConfig extends Secs1CommunicatorConfig {
	path: string;
	baudRate: number;
}

export class Secs1SerialCommunicator extends Secs1Communicator {
	private port: SerialPort | null = null;

	public path: string;
	public baudRate: number;

	constructor(config: Secs1SerialCommunicatorConfig) {
		super(config);
		this.path = config.path;
		this.baudRate = config.baudRate;
	}

	async open(): Promise<void> {
		if (this.port?.isOpen) return;

		const port = new SerialPort({
			path: this.path,
			baudRate: this.baudRate,
			autoOpen: false,
		});
		this.port = port;

		return new Promise((resolve, reject) => {
			const onError = (err: Error) => {
				reject(err);
			};

			port.once("error", onError);
			port.open((err) => {
				port.removeListener("error", onError);
				if (err) {
					reject(err);
					return;
				}
				this.attachStream(port);
				resolve();
			});
		});
	}

	async close(): Promise<void> {
		this.stop();

		const port = this.port;
		this.port = null;
		if (!port) return;

		if (!port.isOpen) {
			port.destroy();
			return;
		}

		await new Promise<void>((resolve, reject) => {
			port.close((err) => {
				if (err) reject(err);
				else resolve();
			});
		});

		port.destroy();
	}
}
