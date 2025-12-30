import { Duplex } from "stream";
import {
	AbstractSecsCommunicator,
	SecsCommunicatorConfig,
} from "../core/AbstractSecsCommunicator.js";
import { SecsMessage } from "../core/AbstractSecsMessage.js";
import { AbstractSecs2Item } from "../core/secs2item/AbstractSecs2Item.js";
import { Secs1Message } from "./Secs1Message.js";
import { Secs1MessageBlock } from "./Secs1MessageBlock.js";

export interface Secs1CommunicatorConfig extends SecsCommunicatorConfig {
	retry?: number;
	isMaster?: boolean;
}

const ENQ = 0x05;
const EOT = 0x04;
const ACK = 0x06;
const NAK = 0x15;

enum CommState {
	IDLE,
	WAIT_EOT,
	WAIT_ACK,
	WAIT_BLOCK_LENGTH,
	WAIT_BLOCK_DATA,
}

export abstract class Secs1Communicator extends AbstractSecsCommunicator {
	public retry: number;
	public isMaster: boolean;

	protected stream: Duplex | null = null;

	private state: CommState = CommState.IDLE;
	private buffer: Buffer = Buffer.alloc(0);

	private sendQueue: Buffer[] = [];
	private currentBlocks: Secs1MessageBlock[] = [];
	private currentBlockIndex = 0;
	private retryCount = 0;

	private receivedBlocks: Secs1MessageBlock[] = [];
	private expectedBlockNum = 1;
	private currentBlockLength = 0;

	private t1Timer: NodeJS.Timeout | null = null;
	private t2Timer: NodeJS.Timeout | null = null;
	private t4Timer: NodeJS.Timeout | null = null;

	constructor(config: Secs1CommunicatorConfig) {
		super(config);
		this.retry = config.retry ?? 3;
		this.isMaster = config.isMaster ?? false;
	}

	protected attachStream(stream: Duplex) {
		this.stream = stream;
		this.resetState();
		this.buffer = Buffer.alloc(0);
		this.logger.logState("SECS-I", "NotConnected", "Connected");

		stream.on("data", (data: Buffer) => {
			this.logger.logBytes("Received", "SECS-I", data, {
				chunkLength: data.length,
			});
			this.buffer = Buffer.concat([this.buffer, data]);
			if (
				this.state === CommState.WAIT_BLOCK_LENGTH ||
				this.state === CommState.WAIT_BLOCK_DATA
			) {
				this.startT1();
			}
			this.processBuffer();
		});

		stream.on("close", () => {
			this.rejectAllTransactions(new Error("Stream closed"));
			this.stream = null;
			this.emit("disconnected");
			this.logger.logState("SECS-I", "Connected", "NotConnected");
			this.stopAllTimers();
			this.resetState();
		});

		stream.on("error", (err: Error) => {
			this.emit("error", err);
		});

		this.emit("connected");
		this.processSendQueue();
	}

	protected stop() {
		const stream = this.stream;
		if (stream && !stream.destroyed) {
			stream.destroy();
		}
		this.stream = null;
		this.stopAllTimers();
		this.resetState();
	}

	protected override async sendBufferWithLogs(
		direction: "Sent" | "Received",
		protocol: string,
		buffer: Buffer,
		meta?: Record<string, unknown>,
	): Promise<void> {
		await super.sendBufferWithLogs(
			direction,
			protocol === "SECS" ? "SECS1" : protocol,
			buffer,
			{
				commState: CommState[this.state],
				...meta,
			},
		);
	}

	protected override sendBuffer(buffer: Buffer): Promise<void> {
		this.sendQueue.push(buffer);
		process.nextTick(() => this.processSendQueue());
		return Promise.resolve();
	}

	protected override createMessage(
		stream: number,
		func: number,
		wBit: boolean,
		body: AbstractSecs2Item | null,
		systemBytes: number,
	): SecsMessage {
		return new Secs1Message(
			stream,
			func,
			wBit,
			body,
			systemBytes,
			this.deviceId,
		);
	}

	private clearT1() {
		if (this.t1Timer) {
			clearTimeout(this.t1Timer);
			this.t1Timer = null;
		}
	}

	private clearT2() {
		if (this.t2Timer) {
			clearTimeout(this.t2Timer);
			this.t2Timer = null;
		}
	}

	private clearT4() {
		if (this.t4Timer) {
			clearTimeout(this.t4Timer);
			this.t4Timer = null;
		}
	}

	private stopAllTimers() {
		this.clearT1();
		this.clearT2();
		this.clearT4();
	}

	private startT1() {
		this.clearT1();
		if (this.timeoutT1 <= 0) return;
		this.t1Timer = setTimeout(() => {
			this.handleT1Timeout();
		}, this.timeoutT1 * 1000);
	}

	private startT2() {
		this.clearT2();
		if (this.timeoutT2 <= 0) return;
		const timeout = this.timeoutT2 * 1000;
		this.t2Timer = setTimeout(() => {
			this.handleT2Timeout();
		}, timeout);
	}

	private startT4() {
		this.clearT4();
		if (this.timeoutT4 <= 0) return;
		const timeout = this.timeoutT4 * 1000;
		this.t4Timer = setTimeout(() => {
			this.handleT4Timeout();
		}, timeout);
	}

	private handleT1Timeout() {
		this.logger.detail.warn({ protocol: "SECS-I" }, "t1 timeout");
		this.t1Timer = null;
		this.emit("error", new Error("T1 Timeout"));
		this.resetState();
	}

	private handleT2Timeout() {
		this.logger.detail.warn({ protocol: "SECS-I" }, "t2 timeout");
		this.t2Timer = null;
		if (this.state === CommState.WAIT_EOT) {
			this.retryCount++;
			if (this.retryCount > this.retry) {
				this.emit("error", new Error("Retry limit exceeded waiting for EOT"));
				this.resetState();
			} else {
				this.logger.detail.info(
					{
						protocol: "SECS-I",
						retryCount: this.retryCount,
						retry: this.retry,
					},
					"retrying ENQ",
				);
				this.sendByte(ENQ);
				this.startT2();
			}
			return;
		}

		if (this.state === CommState.WAIT_ACK) {
			this.retryCount++;
			if (this.retryCount > this.retry) {
				this.emit("error", new Error("Retry limit exceeded waiting for ACK"));
				this.resetState();
			} else {
				this.logger.detail.info(
					{
						protocol: "SECS-I",
						retryCount: this.retryCount,
						retry: this.retry,
					},
					"retrying block",
				);
				this.sendCurrentBlock();
			}
			return;
		}

		this.resetState();
	}

	private handleT4Timeout() {
		this.logger.detail.warn({ protocol: "SECS-I" }, "t4 timeout");
		this.t4Timer = null;
		this.resetState();
	}

	private resetState() {
		this.state = CommState.IDLE;
		this.receivedBlocks = [];
		this.expectedBlockNum = 1;
		this.currentBlockLength = 0;
		this.stopAllTimers();
	}

	private sendByte(byte: number) {
		const stream = this.stream;
		if (stream && !stream.destroyed) {
			const buf = Buffer.from([byte]);
			this.logger.logBytes("Sent", "SECS-I", buf);
			stream.write(buf);
		}
	}

	private processBuffer() {
		while (this.buffer.length > 0) {
			switch (this.state) {
				case CommState.IDLE: {
					const byte = this.buffer[0];
					this.buffer = this.buffer.subarray(1);
					if (byte === ENQ) {
						this.logger.detail.debug({ protocol: "SECS-I" }, "rx ENQ");
						this.sendByte(EOT);
						this.state = CommState.WAIT_BLOCK_LENGTH;
						this.receivedBlocks = [];
						this.expectedBlockNum = 1;
						this.startT1();
					}
					break;
				}
				case CommState.WAIT_EOT: {
					const byte = this.buffer[0];
					this.buffer = this.buffer.subarray(1);
					if (byte === EOT) {
						this.logger.detail.debug({ protocol: "SECS-I" }, "rx EOT");
						this.clearT2();
						this.currentBlockIndex = 0;
						this.sendCurrentBlock();
					} else if (byte === ENQ) {
						if (!this.isMaster) {
							this.logger.detail.debug(
								{ protocol: "SECS-I" },
								"rx ENQ while waiting EOT",
							);
							this.clearT2();
							this.sendByte(EOT);
							this.state = CommState.WAIT_BLOCK_LENGTH;
							this.receivedBlocks = [];
							this.expectedBlockNum = 1;
							this.startT1();
						}
					}
					break;
				}
				case CommState.WAIT_ACK: {
					const byte = this.buffer[0];
					this.buffer = this.buffer.subarray(1);
					if (byte === ACK) {
						this.logger.detail.debug({ protocol: "SECS-I" }, "rx ACK");
						this.clearT2();
						const currentBlock = this.currentBlocks[this.currentBlockIndex];
						if (currentBlock.eBit) {
							this.currentBlocks = [];
							this.retryCount = 0;
							this.state = CommState.IDLE;
							this.processSendQueue();
						} else {
							this.currentBlockIndex++;
							this.sendCurrentBlock();
						}
					} else if (byte === NAK) {
						this.logger.detail.warn({ protocol: "SECS-I" }, "rx NAK");
						this.clearT2();
						this.handleT2Timeout();
					}
					break;
				}
				case CommState.WAIT_BLOCK_LENGTH: {
					if (this.t4Timer) {
						this.clearT4();
						this.startT1();
					}
					const len = this.buffer[0];
					if (len < 10) {
						this.buffer = this.buffer.subarray(1);
					} else {
						this.currentBlockLength = len;
						this.buffer = this.buffer.subarray(1);
						this.state = CommState.WAIT_BLOCK_DATA;
						this.startT1();
					}
					break;
				}
				case CommState.WAIT_BLOCK_DATA: {
					if (this.buffer.length >= this.currentBlockLength + 2) {
						const blockData = this.buffer.subarray(
							0,
							this.currentBlockLength + 2,
						);
						this.buffer = this.buffer.subarray(this.currentBlockLength + 2);
						this.stopAllTimers();

						const fullBlockBuffer = Buffer.alloc(1 + blockData.length);
						fullBlockBuffer[0] = this.currentBlockLength;
						blockData.copy(fullBlockBuffer, 1);

						const block = new Secs1MessageBlock(fullBlockBuffer);
						if (block.isValid()) {
							if (block.blockNumber !== this.expectedBlockNum) {
								this.logger.detail.warn(
									{
										protocol: "SECS-I",
										expected: this.expectedBlockNum,
										got: block.blockNumber,
									},
									"wrong block number",
								);
								this.sendByte(NAK);
								this.state = CommState.IDLE;
								this.resetState();
							} else {
								this.sendByte(ACK);
								this.receivedBlocks.push(block);
								if (block.eBit) {
									try {
										const msg = Secs1Message.fromBlocks(this.receivedBlocks);
										this.handleMessage(msg);
									} catch (e) {
										this.emit(
											"error",
											e instanceof Error ? e : new Error(String(e)),
										);
									}
									this.resetState();
									this.processSendQueue();
								} else {
									this.expectedBlockNum++;
									this.state = CommState.WAIT_BLOCK_LENGTH;
									this.startT4();
								}
							}
						} else {
							this.logger.detail.warn(
								{ protocol: "SECS-I" },
								"invalid checksum",
							);
							this.sendByte(NAK);
							this.state = CommState.IDLE;
							this.resetState();
						}
					} else {
						return;
					}
					break;
				}
				default:
					return;
			}
		}
	}

	private sendCurrentBlock() {
		if (this.currentBlockIndex >= this.currentBlocks.length) return;
		const stream = this.stream;
		const block = this.currentBlocks[this.currentBlockIndex];
		if (stream && !stream.destroyed) {
			this.logger.logBytes("Sent", "SECS-I", block.buffer, {
				blockNumber: block.blockNumber,
				eBit: block.eBit,
				systemBytes: block.systemBytes,
				stream: block.stream,
				func: block.func,
			});
			stream.write(block.buffer);
			this.state = CommState.WAIT_ACK;
			this.startT2();
		}
	}

	private processSendQueue() {
		if (this.state !== CommState.IDLE) return;
		const stream = this.stream;
		if (!stream || stream.destroyed) return;
		if (this.sendQueue.length === 0) return;

		const buffer = this.sendQueue.shift();
		if (!buffer) return;

		try {
			const rBit = (buffer[0] & 0x80) === 0x80;
			const deviceId = ((buffer[0] & 0x7f) << 8) | buffer[1];
			const streamId = buffer[2] & 0x7f;
			const wBit = (buffer[2] & 0x80) === 0x80;
			const func = buffer[3];
			const systemBytes = buffer.readUInt32BE(6);
			const bodyBuffer = buffer.subarray(10);

			this.currentBlocks = [];
			let pos = 0;
			let blockNum = 1;

			if (bodyBuffer.length === 0) {
				this.currentBlocks.push(
					Secs1MessageBlock.fromParts(
						deviceId,
						streamId,
						func,
						wBit,
						true,
						blockNum,
						systemBytes,
						Buffer.alloc(0),
						rBit,
					),
				);
			} else {
				while (pos < bodyBuffer.length) {
					const remaining = bodyBuffer.length - pos;
					const chunkSize = remaining > 244 ? 244 : remaining;
					const chunk = bodyBuffer.subarray(pos, pos + chunkSize);
					const isLast = pos + chunkSize >= bodyBuffer.length;

					this.currentBlocks.push(
						Secs1MessageBlock.fromParts(
							deviceId,
							streamId,
							func,
							wBit,
							isLast,
							blockNum,
							systemBytes,
							chunk,
							rBit,
						),
					);
					pos += chunkSize;
					blockNum++;
				}
			}

			this.currentBlockIndex = 0;
			this.retryCount = 0;

			this.sendByte(ENQ);
			this.state = CommState.WAIT_EOT;
			this.startT2();
		} catch (e) {
			this.emit("error", e instanceof Error ? e : new Error(String(e)));
			this.processSendQueue();
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
