import { Socket } from "net";
import {
	AbstractSecsCommunicator,
	SecsCommunicatorConfig,
	SecsCommunicatorEvents,
} from "../core/AbstractSecsCommunicator.js";
import { SecsMessage } from "../core/AbstractSecsMessage.js";
import { AbstractSecs2Item } from "../core/secs2item/AbstractSecs2Item.js";
import { HsmsMessage } from "./HsmsMessage.js";
import { HsmsControlType } from "./enums/HsmsControlType.js";
import { SelectStatus } from "./enums/SelectStatus.js";
import { RejectReason } from "./enums/RejectReason.js";

export enum HsmsState {
	NotConnected = "NotConnected",
	Connected = "Connected", // TCP Connected
	Selected = "Selected", // HSMS Selected
}

/**
 * @description HsmsCommunicatorConfig is the configuration interface for HsmsCommunicator.
 * @param ip The IP address of the remote device.
 * @param port The port number of the remote device.
 * @param linkTestInterval The interval in milliseconds to send link test messages.
 */
export interface HsmsCommunicatorConfig extends SecsCommunicatorConfig {
	ip: string;
	port: number;
	linkTestInterval?: number;
}

export interface HsmsCommunicatorEvents extends SecsCommunicatorEvents {
	selected: [];
	deselected: [];
}

export abstract class HsmsCommunicator extends AbstractSecsCommunicator<HsmsCommunicatorEvents> {
	public ip: string;
	public port: number;

	protected socket: Socket | null = null;
	protected state: HsmsState = HsmsState.NotConnected;
	private buffer: Buffer = Buffer.alloc(0);
	private t7Timer: NodeJS.Timeout | null = null;
	private t8Timer: NodeJS.Timeout | null = null;

	// T6 Timer (Control Transaction)
	// We use the same _transactions map for Control messages if they expect reply

	public get connectionState(): HsmsState {
		return this.state;
	}

	constructor(config: HsmsCommunicatorConfig) {
		super(config);
		this.ip = config.ip;
		this.port = config.port;
	}

	protected override async sendBufferWithLogs(
		direction: "Sent" | "Received",
		protocol: string,
		buffer: Buffer,
		meta?: Record<string, unknown>,
	): Promise<void> {
		await super.sendBufferWithLogs(
			direction,
			protocol === "SECS" ? "HSMS" : protocol,
			buffer,
			{
				hsmsState: this.state,
				...meta,
			},
		);
	}

	protected async sendBuffer(buffer: Buffer): Promise<void> {
		const socket = this.socket;
		if (!socket || socket.destroyed) {
			throw new Error("Socket not connected");
		}
		return new Promise((resolve, reject) => {
			socket.write(buffer, (err) => {
				if (err) reject(err);
				else resolve();
			});
		});
	}

	protected createMessage(
		stream: number,
		func: number,
		wBit: boolean,
		body: AbstractSecs2Item | null,
		systemBytes: number,
	): SecsMessage {
		// For Data messages, pType=0, sType=0 (Data)
		return new HsmsMessage(
			stream,
			func,
			wBit,
			body,
			systemBytes,
			this.deviceId,
			0,
			HsmsControlType.Data,
		);
	}

	protected handleSocketEvents(socket: Socket) {
		this.socket = socket;
		const prev = this.state;
		this.state = HsmsState.Connected;
		this.logger.logState("HSMS", prev, this.state, {
			remoteAddress: socket.remoteAddress,
			remotePort: socket.remotePort,
		});
		this.resetT7Timer();
		this.emit("connected");

		socket.on("data", (data) => {
			this.logger.logBytes("Received", "HSMS", data, {
				remoteAddress: socket.remoteAddress,
				remotePort: socket.remotePort,
				chunkLength: data.length,
			});
			this.buffer = Buffer.concat([this.buffer, data]);
			this.resetT8Timer();
			this.processBuffer();
			if (this.buffer.length === 0) {
				this.clearT8Timer();
			}
		});

		socket.on("close", () => {
			this.rejectAllTransactions(new Error("Socket closed"));
			this.clearT7Timer();
			this.clearT8Timer();
			this.buffer = Buffer.alloc(0);
			const prevState = this.state;
			this.state = HsmsState.NotConnected;
			this.logger.logState("HSMS", prevState, this.state, {
				remoteAddress: socket.remoteAddress,
				remotePort: socket.remotePort,
			});
			this.socket = null;
			this.emit("disconnected");
		});

		socket.on("end", () => {
			if (this.socket && !this.socket.destroyed) {
				this.socket.destroy();
			}
		});

		socket.on("error", (err) => {
			this.emit("error", err);
			if (!socket.destroyed) {
				socket.destroy();
			}
		});
	}

	private resetT7Timer() {
		this.clearT7Timer();
		if (this.timeoutT7 <= 0) return;
		this.t7Timer = setTimeout(() => {
			this.t7Timer = null;
			if (this.state === HsmsState.Selected) return;
			const socket = this.socket;
			if (socket && !socket.destroyed) {
				this.emit("error", new Error("T7 Timeout"));
				socket.destroy();
			}
		}, this.timeoutT7 * 1000);
	}

	private clearT7Timer() {
		if (this.t7Timer) {
			clearTimeout(this.t7Timer);
			this.t7Timer = null;
		}
	}

	private resetT8Timer() {
		this.clearT8Timer();
		if (this.timeoutT8 <= 0) return;
		this.t8Timer = setTimeout(() => {
			this.t8Timer = null;
			const socket = this.socket;
			if (socket && !socket.destroyed && this.buffer.length > 0) {
				this.emit("error", new Error("T8 Timeout"));
				socket.destroy();
			}
		}, this.timeoutT8 * 1000);
	}

	private clearT8Timer() {
		if (this.t8Timer) {
			clearTimeout(this.t8Timer);
			this.t8Timer = null;
		}
	}

	private processBuffer() {
		while (true) {
			if (this.buffer.length < 4) return;

			const length = this.buffer.readUInt32BE(0);
			if (length < 10) {
				const socket = this.socket;
				this.emit("error", new Error("Receive message size < 10"));
				this.buffer = Buffer.alloc(0);
				if (socket && !socket.destroyed) {
					socket.destroy();
				}
				return;
			}
			if (this.buffer.length < 4 + length) return;

			const msgBuffer = this.buffer.subarray(0, 4 + length);
			this.buffer = this.buffer.subarray(4 + length);

			try {
				this.logger.logBytes("Received", "HSMS", msgBuffer, {
					frameLength: length,
				});
				const msg = HsmsMessage.fromBuffer(msgBuffer);
				this.processHsmsMessage(msg);
			} catch (err) {
				if (err instanceof Error) {
					this.emit(
						"error",
						new Error(`Failed to parse HSMS message: ${err.message}`),
					);
				} else {
					this.emit(
						"error",
						new Error(`Failed to parse HSMS message: ${String(err)}`),
					);
				}
			}
		}
	}

	private processHsmsMessage(msg: HsmsMessage) {
		// Handle Control Messages
		if (msg.sType !== HsmsControlType.Data) {
			this.logger.detail.debug(
				{
					protocol: "HSMS",
					controlType: msg.sType,
					pType: msg.pType,
					systemBytes: msg.systemBytes,
					deviceId: msg.deviceId,
				},
				"control",
			);
			this.handleControlMessage(msg);
			return;
		}

		// Handle Data Messages
		if (this.state !== HsmsState.Selected) {
			this.logger.logSecs2(
				"Received",
				msg.toSml(),
				this.deviceId,
				msg.systemBytes,
				msg.toBuffer(),
			);
			void this.sendReject(msg, RejectReason.NotSelected);
			return;
		}

		super.handleMessage(msg);
	}

	private handleControlMessage(msg: HsmsMessage) {
		switch (msg.sType as HsmsControlType) {
			case HsmsControlType.SelectReq:
				this.handleSelectReq(msg);
				break;
			case HsmsControlType.SelectRsp:
				this.handleSelectRsp(msg);
				break;
			case HsmsControlType.DeselectReq:
				this.handleDeselectReq(msg);
				break;
			case HsmsControlType.DeselectRsp:
				this.handleDeselectRsp(msg);
				break;
			case HsmsControlType.LinkTestReq:
				this.handleLinkTestReq(msg);
				break;
			case HsmsControlType.LinkTestRsp:
				this.handleLinkTestRsp(msg);
				break;
			case HsmsControlType.SeparateReq:
				this.handleSeparateReq(msg);
				break;
			case HsmsControlType.RejectReq:
				break;
			default:
				void this.sendReject(
					msg,
					msg.pType !== 0
						? RejectReason.NotSupportTypeP
						: RejectReason.NotSupportTypeS,
				);
				break;
		}
	}

	protected handleSelectReq(msg: HsmsMessage) {
		// Subclasses might override, but default behavior:
		// If already selected, return Actived/AlreadyUsed?
		// If not, accept.

		// Note: HSMS-SS says only one host.
		if (this.state === HsmsState.Selected) {
			void this.sendSelectRsp(msg, SelectStatus.Actived); // Or AlreadyUsed?
		} else {
			this.logger.logState("HSMS", this.state, HsmsState.Selected, {
				systemBytes: msg.systemBytes,
			});
			this.state = HsmsState.Selected;
			this.clearT7Timer();
			void this.sendSelectRsp(msg, SelectStatus.Success);
			this.emit("selected");
		}
	}

	protected handleSelectRsp(msg: HsmsMessage) {
		// Check if we are waiting for this.
		// Usually managed by sendSelectReq promise.
		const tx = this._transactions.get(msg.systemBytes);
		if (tx) {
			// If status is Success, set state to Selected
			// msg.func holds the status (byte 3) if we mapped it correctly in HsmsMessage.fromBuffer
			// In HsmsMessage.fromBuffer, for Control msg, func = byte 3.
			const status = msg.func as SelectStatus;
			if (status === SelectStatus.Success || status === SelectStatus.Actived) {
				this.logger.logState("HSMS", this.state, HsmsState.Selected, {
					selectStatus: status,
					systemBytes: msg.systemBytes,
				});
				this.state = HsmsState.Selected;
				this.clearT7Timer();
				this.emit("selected");
			}
			clearTimeout(tx.timer);
			this._transactions.delete(msg.systemBytes);
			tx.resolve(msg);
		} else {
			void this.sendReject(msg, RejectReason.TransactionNotOpen);
		}
	}

	protected handleLinkTestReq(msg: HsmsMessage) {
		void this.sendLinkTestRsp(msg);
	}

	protected handleLinkTestRsp(msg: HsmsMessage) {
		const tx = this._transactions.get(msg.systemBytes);
		if (tx) {
			clearTimeout(tx.timer);
			this._transactions.delete(msg.systemBytes);
			tx.resolve(msg);
		} else {
			void this.sendReject(msg, RejectReason.TransactionNotOpen);
		}
	}

	protected handleDeselectReq(msg: HsmsMessage) {
		if (this.state === HsmsState.Selected) {
			this.logger.logState("HSMS", this.state, HsmsState.Connected, {
				systemBytes: msg.systemBytes,
			});
			this.state = HsmsState.Connected;
			this.resetT7Timer();
			void this.sendDeselectRsp(msg, SelectStatus.Success);
			this.emit("deselected");
			return;
		}
		void this.sendDeselectRsp(msg, SelectStatus.NotReady);
	}

	protected handleDeselectRsp(msg: HsmsMessage) {
		const tx = this._transactions.get(msg.systemBytes);
		if (tx) {
			const status = msg.func as SelectStatus;
			if (status === SelectStatus.Success) {
				this.logger.logState("HSMS", this.state, HsmsState.Connected, {
					systemBytes: msg.systemBytes,
				});
				this.state = HsmsState.Connected;
				this.resetT7Timer();
				this.emit("deselected");
			}
			clearTimeout(tx.timer);
			this._transactions.delete(msg.systemBytes);
			tx.resolve(msg);
		} else {
			void this.sendReject(msg, RejectReason.TransactionNotOpen);
		}
	}

	protected handleSeparateReq(_msg: HsmsMessage) {
		const socket = this.socket;
		const prev = this.state;
		this.state = HsmsState.Connected;
		this.logger.logState("HSMS", prev, this.state);
		this.clearT7Timer();
		if (socket && !socket.destroyed) {
			socket.destroy();
		}
	}

	// Helper senders
	protected async sendSelectRsp(req: HsmsMessage, status: number) {
		const rsp = HsmsMessage.selectRsp(req, status);
		await this.sendBufferWithLogs("Sent", "HSMS", rsp.toBuffer(), {
			controlType: HsmsControlType.SelectRsp,
			status,
			systemBytes: rsp.systemBytes,
		});
	}

	protected async sendDeselectRsp(req: HsmsMessage, status: number) {
		const rsp = HsmsMessage.deselectRsp(req, status);
		await this.sendBufferWithLogs("Sent", "HSMS", rsp.toBuffer(), {
			controlType: HsmsControlType.DeselectRsp,
			status,
			systemBytes: rsp.systemBytes,
		});
	}

	protected async sendLinkTestRsp(req: HsmsMessage) {
		const rsp = HsmsMessage.linkTestRsp(req);
		await this.sendBufferWithLogs("Sent", "HSMS", rsp.toBuffer(), {
			controlType: HsmsControlType.LinkTestRsp,
			systemBytes: rsp.systemBytes,
		});
	}

	protected async sendReject(req: HsmsMessage, reason: RejectReason) {
		const rsp = HsmsMessage.rejectReq(req, reason);
		await this.sendBufferWithLogs("Sent", "HSMS", rsp.toBuffer(), {
			controlType: HsmsControlType.RejectReq,
			reason,
			systemBytes: rsp.systemBytes,
		});
	}

	override async send(
		stream: number,
		func: number,
		wBit: boolean,
		body: AbstractSecs2Item | null = null,
	): Promise<SecsMessage | null> {
		if (this.state !== HsmsState.Selected) {
			throw new Error("HSMS not selected");
		}
		return super.send(stream, func, wBit, body);
	}

	// Public control methods
	public async sendSelectReq(): Promise<SelectStatus> {
		const systemBytes = this.getNextSystemBytes();
		const msg = HsmsMessage.selectReq(systemBytes);

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this._transactions.delete(systemBytes);
				const socket = this.socket;
				if (socket && !socket.destroyed) socket.destroy();
				reject(new Error("T6 Timeout waiting for Select Rsp"));
			}, this.timeoutT6 * 1000);

			this._transactions.set(systemBytes, {
				resolve: (rsp) => {
					resolve(rsp.func as SelectStatus);
				},
				reject,
				timer,
			});

			this.sendBufferWithLogs("Sent", "HSMS", msg.toBuffer(), {
				controlType: HsmsControlType.SelectReq,
				systemBytes,
			}).catch((err: unknown) => {
				clearTimeout(timer);
				this._transactions.delete(systemBytes);
				reject(err instanceof Error ? err : new Error(String(err)));
			});
		});
	}

	public async sendLinkTestReq(): Promise<void> {
		const systemBytes = this.getNextSystemBytes();
		const msg = HsmsMessage.linkTestReq(systemBytes);

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this._transactions.delete(systemBytes);
				const socket = this.socket;
				if (socket && !socket.destroyed) socket.destroy();
				reject(new Error("T6 Timeout waiting for LinkTest Rsp"));
			}, this.timeoutT6 * 1000);

			this._transactions.set(systemBytes, {
				resolve: () => {
					resolve();
				},
				reject,
				timer,
			});

			this.sendBufferWithLogs("Sent", "HSMS", msg.toBuffer(), {
				controlType: HsmsControlType.LinkTestReq,
				systemBytes,
			}).catch((err: unknown) => {
				clearTimeout(timer);
				this._transactions.delete(systemBytes);
				reject(err instanceof Error ? err : new Error(String(err)));
			});
		});
	}

	public async sendSeparateReq(): Promise<void> {
		const systemBytes = this.getNextSystemBytes();
		const msg = HsmsMessage.separateReq(systemBytes);
		await this.sendBufferWithLogs("Sent", "HSMS", msg.toBuffer(), {
			controlType: HsmsControlType.SeparateReq,
			systemBytes,
		});
		const socket = this.socket;
		const prev = this.state;
		this.state = HsmsState.Connected;
		this.logger.logState("HSMS", prev, this.state, { systemBytes });
		this.clearT7Timer();
		if (socket && !socket.destroyed) {
			socket.destroy();
		}
	}

	private rejectAllTransactions(err: Error) {
		for (const [systemBytes, tx] of this._transactions) {
			clearTimeout(tx.timer);
			tx.reject(err);
			this._transactions.delete(systemBytes);
		}
	}
}
