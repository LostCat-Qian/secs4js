import fs from "fs";
import path from "path";
import { Writable, Transform } from "stream";
import pino, { type LevelWithSilent, type Logger } from "pino";

export type SecsLogDirection = "Received" | "Sent";

export interface SecsLoggerConfig {
	enabled?: boolean;
	console?: boolean;
	baseDir?: string;
	retentionDays?: number;
	detailLevel?: LevelWithSilent;
	secs2Level?: LevelWithSilent;
	maxHexBytes?: number;
}

export interface SecsLoggerContext {
	name: string;
	deviceId: number;
	isEquip: boolean;
}

function formatDate(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${String(y)}-${m}-${d}`;
}

function formatDateTime(date: Date): string {
	const ymd = formatDate(date);
	const hh = String(date.getHours()).padStart(2, "0");
	const mm = String(date.getMinutes()).padStart(2, "0");
	const ss = String(date.getSeconds()).padStart(2, "0");
	const ms = String(date.getMilliseconds()).padStart(3, "0");
	return `${ymd} ${hh}:${mm}:${ss}.${ms}`;
}

function tryParseYmdDirName(dirName: string): Date | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dirName);
	if (!m) return null;
	const year = Number(m[1]);
	const month = Number(m[2]);
	const day = Number(m[3]);
	if (
		!Number.isFinite(year) ||
		!Number.isFinite(month) ||
		!Number.isFinite(day)
	)
		return null;
	const dt = new Date(year, month - 1, day);
	if (dt.getFullYear() !== year) return null;
	if (dt.getMonth() !== month - 1) return null;
	if (dt.getDate() !== day) return null;
	return dt;
}

function normalizeSmlForSingleLine(sml: string): string {
	return sml.trim();
}

function bufferToHex(buffer: Buffer, maxHexBytes: number): string {
	const len = buffer.length;
	const max = Math.max(0, maxHexBytes);
	const slice = len <= max ? buffer : buffer.subarray(0, max);
	const hex = slice.toString("hex");
	const suffix = len <= max ? "" : `…(+${String(len - max)} bytes)`;
	return `${hex}${suffix}`;
}

class PrettyPrintTransformStream extends Transform {
	private pending = "";

	constructor() {
		super();
	}

	override _transform(
		chunk: Buffer | string,
		_encoding: BufferEncoding,
		callback: (error?: Error | null) => void,
	): void {
		try {
			const str = typeof chunk === "string" ? chunk : chunk.toString("utf8");
			this.pending += str;
			this.flush();
			callback();
		} catch (e) {
			callback(e instanceof Error ? e : new Error(String(e)));
		}
	}

	override _flush(callback: (error?: Error | null) => void): void {
		callback();
	}

	private flush(): void {
		while (true) {
			const idx = this.pending.indexOf("\n");
			if (idx < 0) break;
			const line = this.pending.slice(0, idx);
			this.pending = this.pending.slice(idx + 1);
			if (line.length === 0) continue;
			const obj = JSON.parse(line) as Record<string, unknown>;
			const formatted = this.formatLine(obj);
			this.push(formatted);
		}
	}

	private formatLine(obj: Record<string, unknown>): string {
		const time = this.formatTime(obj.time);
		const level = this.formatLevel(obj.level as number);
		const extra = this.formatExtra(obj);
		const msg = this.formatMessage(obj);

		return `${time} ${level} ${extra} | ${msg}\n`;
	}

	private formatTime(timeValue: unknown): string {
		if (typeof timeValue === "number") {
			return formatDateTime(new Date(timeValue));
		}
		if (typeof timeValue === "string") {
			return formatDateTime(new Date(timeValue));
		}
		return formatDateTime(new Date());
	}

	private formatLevel(level: number): string {
		const levels: Record<number, string> = {
			10: "TRACE",
			20: "DEBUG",
			30: "INFO ",
			40: "WARN ",
			50: "ERROR",
			60: "FATAL",
		};
		return levels[level] ?? "UNKNOWN";
	}

	private formatExtra(obj: Record<string, unknown>): string {
		const parts: string[] = [];

		if (typeof obj.protocol === "string") {
			parts.push(obj.protocol);
		}
		if (typeof obj.dir === "string") {
			parts.push(obj.dir);
		}
		if (typeof obj.prev === "string" && typeof obj.next === "string") {
			parts.push(`${obj.prev} -> ${obj.next}`);
		}

		return parts.join(" ");
	}

	private formatMessage(obj: Record<string, unknown>): string {
		const msgValue = obj.msg;
		if (typeof msgValue === "string" && msgValue.trim().length > 0) {
			return msgValue;
		}

		const excludeKeys = new Set([
			"time",
			"level",
			"msg",
			"name",
			"deviceId",
			"isEquip",
			"protocol",
			"dir",
			"prev",
			"next",
		]);

		const pairs: string[] = [];
		for (const [key, value] of Object.entries(obj)) {
			if (excludeKeys.has(key)) continue;
			if (Buffer.isBuffer(value)) {
				pairs.push(`${key}=${value.toString("hex")}`);
			} else if (typeof value === "string") {
				pairs.push(`${key}=${value}`);
			} else if (typeof value === "number" || typeof value === "boolean") {
				pairs.push(`${key}=${String(value)}`);
			} else {
				pairs.push(`${key}=${this.formatValue(value)}`);
			}
		}

		return pairs.join(" ");
	}

	private formatValue(value: unknown): string {
		if (value === null) return "null";
		if (value === undefined) return "undefined";
		if (typeof value === "string") return value;
		if (typeof value === "number" || typeof value === "boolean") {
			return String(value);
		}
		if (Buffer.isBuffer(value)) {
			return value.toString("hex");
		}
		if (typeof value === "object") {
			try {
				return JSON.stringify(value);
			} catch {
				return "[object]";
			}
		}
		return String(value as string | number | bigint | boolean);
	}
}

class DailyRotatingFileStream extends Writable {
	private readonly baseDir: string;
	private readonly fileNameForDate: (ymd: string) => string;
	private readonly retentionDays: number;
	private currentYmd: string | null = null;
	private currentStream: fs.WriteStream | null = null;
	private cleanupYmd: string | null = null;
	private pending = "";

	constructor(params: {
		baseDir: string;
		fileNameForDate: (ymd: string) => string;
		retentionDays: number;
	}) {
		super();
		this.baseDir = params.baseDir;
		this.fileNameForDate = params.fileNameForDate;
		this.retentionDays = params.retentionDays;
	}

	override _write(
		chunk: Buffer | string,
		encoding: BufferEncoding,
		callback: (error?: Error | null) => void,
	): void {
		try {
			const str = typeof chunk === "string" ? chunk : chunk.toString("utf8");
			this.pending += str;
			this.flushCompleteLines();
			callback();
		} catch (e) {
			callback(e instanceof Error ? e : new Error(String(e)));
		}
	}

	override _final(callback: (error?: Error | null) => void): void {
		try {
			if (this.pending.length > 0) {
				this.ensureStreamForNow();
				this.currentStream?.write(this.pending);
				this.pending = "";
			}
			this.currentStream?.end(() => callback());
			this.currentStream = null;
		} catch (e) {
			callback(e instanceof Error ? e : new Error(String(e)));
		}
	}

	private flushCompleteLines() {
		while (true) {
			const idx = this.pending.indexOf("\n");
			if (idx < 0) break;
			const line = this.pending.slice(0, idx + 1);
			this.pending = this.pending.slice(idx + 1);
			this.ensureStreamForNow();
			this.currentStream?.write(line);
		}
	}

	private ensureStreamForNow() {
		const now = new Date();
		const ymd = formatDate(now);
		if (this.currentYmd === ymd && this.currentStream) return;

		if (this.currentStream) {
			this.currentStream.end();
			this.currentStream = null;
		}

		const dir = path.join(this.baseDir, ymd);
		fs.mkdirSync(dir, { recursive: true });
		const filePath = path.join(dir, this.fileNameForDate(ymd));
		this.currentStream = fs.createWriteStream(filePath, { flags: "a" });
		this.currentYmd = ymd;

		if (this.retentionDays > 0 && this.cleanupYmd !== ymd) {
			this.cleanupYmd = ymd;
			queueMicrotask(() => {
				this.cleanupOldDirs(now).catch(() => undefined);
			});
		}
	}

	private async cleanupOldDirs(now: Date): Promise<void> {
		const retentionDays = this.retentionDays;
		if (retentionDays <= 0) return;

		let entries: fs.Dirent[];
		try {
			entries = await fs.promises.readdir(this.baseDir, {
				withFileTypes: true,
			});
		} catch {
			return;
		}

		const cutoff = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
			0,
			0,
			0,
			0,
		);
		cutoff.setDate(cutoff.getDate() - retentionDays);

		for (const ent of entries) {
			if (!ent.isDirectory()) continue;
			const dirName = ent.name;
			const dirDate = tryParseYmdDirName(dirName);
			if (!dirDate) continue;
			if (dirDate >= cutoff) continue;
			const full = path.join(this.baseDir, dirName);
			try {
				await fs.promises.rm(full, { recursive: true, force: true });
			} catch {
				continue;
			}
		}
	}
}

class Secs2LineTransformStream extends Writable {
	private readonly target: DailyRotatingFileStream;
	private pending = "";

	constructor(target: DailyRotatingFileStream) {
		super();
		this.target = target;
	}

	override _write(
		chunk: Buffer | string,
		encoding: BufferEncoding,
		callback: (error?: Error | null) => void,
	): void {
		try {
			const str = typeof chunk === "string" ? chunk : chunk.toString("utf8");
			this.pending += str;
			this.flush();
			callback();
		} catch (e) {
			callback(e instanceof Error ? e : new Error(String(e)));
		}
	}

	override _final(callback: (error?: Error | null) => void): void {
		try {
			this.flush(true);
			this.target.end(() => callback());
		} catch (e) {
			callback(e instanceof Error ? e : new Error(String(e)));
		}
	}

	private flush(flushAll = false) {
		while (true) {
			const idx = this.pending.indexOf("\n");
			if (idx < 0) {
				if (flushAll && this.pending.length > 0) {
					this.handleLine(this.pending);
					this.pending = "";
				}
				return;
			}
			const line = this.pending.slice(0, idx);
			this.pending = this.pending.slice(idx + 1);
			if (line.length === 0) continue;
			this.handleLine(line);
		}
	}

	private handleLine(jsonLine: string) {
		let obj: unknown;
		try {
			obj = JSON.parse(jsonLine);
		} catch {
			return;
		}

		if (!obj || typeof obj !== "object") return;
		const rec = obj as Record<string, unknown>;
		const timeValue = rec.time;
		const dirValue = rec.dir;
		const smlValue = rec.sml;
		const deviceIdValue = rec.deviceId;
		const systemBytesValue = rec.systemBytes;

		const dir =
			dirValue === "Sent" || dirValue === "Received" ? dirValue : null;
		const sml = typeof smlValue === "string" ? smlValue : null;
		if (!dir || !sml) return;

		let date: Date;
		if (typeof timeValue === "number") {
			date = new Date(timeValue);
		} else if (typeof timeValue === "string") {
			date = new Date(timeValue);
		} else {
			date = new Date();
		}

		const deviceId = typeof deviceIdValue === "number" ? deviceIdValue : 0;
		const systemBytes =
			typeof systemBytesValue === "number" ? systemBytesValue : 0;

		const out = `${formatDateTime(date)} ${dir} DeviceID: ${deviceId} SystemBytes: ${systemBytes} \n${normalizeSmlForSingleLine(sml)}\n`;
		this.target.write(out);
	}
}

class DisabledSecsLogger {
	detail: Logger;
	secs2: Logger;
	constructor() {
		this.detail = pino({ enabled: false });
		this.secs2 = pino({ enabled: false });
	}

	logSecs2(_direction: SecsLogDirection, _sml: string): void {
		return;
	}

	logBytes(
		_direction: SecsLogDirection,
		_protocol: string,
		_buffer: Buffer,
		_meta?: Record<string, unknown>,
	): void {
		return;
	}

	logState(
		_protocol: string,
		_prev: string,
		_next: string,
		_meta?: Record<string, unknown>,
	): void {
		return;
	}

	close(): void {
		return;
	}
}

export class SecsLogger {
	static disabled(): SecsLogger {
		return new DisabledSecsLogger() as unknown as SecsLogger;
	}

	static create(
		config: SecsLoggerConfig | undefined,
		ctx: SecsLoggerContext,
	): SecsLogger {
		const enabled = config?.enabled ?? false;
		const consoleEnabled = config?.console ?? false;
		if (!enabled) return SecsLogger.disabled();

		const baseDir = config?.baseDir
			? path.resolve(config.baseDir)
			: path.resolve(process.cwd(), "logs");
		const retentionDays = config?.retentionDays ?? 7;
		const detailLevel = config?.detailLevel ?? "debug";
		const secs2Level = config?.secs2Level ?? "info";

		const detailStream = new DailyRotatingFileStream({
			baseDir,
			fileNameForDate: (ymd) => `${ymd}-DETAIL.log`,
			retentionDays,
		});

		const secs2Target = new DailyRotatingFileStream({
			baseDir,
			fileNameForDate: (ymd) => `${ymd}-SECS-II.log`,
			retentionDays,
		});
		const secs2Stream = new Secs2LineTransformStream(secs2Target);

		const bindings = {
			name: ctx.name,
			deviceId: ctx.deviceId,
			isEquip: ctx.isEquip,
		};

		const detailPrettyStream = new PrettyPrintTransformStream();
		detailPrettyStream.pipe(detailStream);
		const detailStreams: pino.StreamEntry[] = [
			{ stream: detailPrettyStream as pino.DestinationStream },
		];
		if (consoleEnabled) {
			const consolePrettyStream = new PrettyPrintTransformStream();
			consolePrettyStream.pipe(process.stdout);
			detailStreams.push({
				stream: consolePrettyStream,
				level: detailLevel as pino.Level,
			});
		}
		const detail = pino(
			{ level: detailLevel, base: bindings },
			pino.multistream(detailStreams),
		);

		const secs2ToDetailPrettyStream = new PrettyPrintTransformStream();
		secs2ToDetailPrettyStream.pipe(detailStream);
		const secs2Streams: pino.StreamEntry[] = [
			{ stream: secs2Stream as pino.DestinationStream },
			{ stream: secs2ToDetailPrettyStream as pino.DestinationStream },
		];
		if (consoleEnabled) {
			secs2Streams.push({
				stream: process.stdout,
				level: secs2Level as pino.Level,
			});
		}
		const secs2 = pino(
			{
				level: secs2Level,
				base: bindings,
				messageKey: "msg",
			},
			pino.multistream(secs2Streams),
		);

		return new SecsLogger({
			config: { ...config, baseDir, retentionDays },
			detail,
			secs2,
			detailStream,
			secs2Target,
			secs2Stream,
		});
	}

	public readonly detail: Logger;
	private readonly secs2: Logger;
	private readonly detailStream: DailyRotatingFileStream;
	private readonly secs2Target: DailyRotatingFileStream;
	private readonly secs2Stream: Secs2LineTransformStream;
	private readonly maxHexBytes: number;

	private constructor(params: {
		config: SecsLoggerConfig;
		detail: Logger;
		secs2: Logger;
		detailStream: DailyRotatingFileStream;
		secs2Target: DailyRotatingFileStream;
		secs2Stream: Secs2LineTransformStream;
	}) {
		this.detail = params.detail;
		this.secs2 = params.secs2;
		this.detailStream = params.detailStream;
		this.secs2Target = params.secs2Target;
		this.secs2Stream = params.secs2Stream;
		this.maxHexBytes = params.config.maxHexBytes ?? 64 * 1024;
	}

	logSecs2(
		direction: SecsLogDirection,
		sml: string,
		deviceId: number,
		systemBytes: number,
		buffer?: Buffer,
	): void {
		this.secs2.info(
			{
				dir: direction,
				sml: normalizeSmlForSingleLine(sml),
				deviceId,
				systemBytes,
				hex: buffer ? bufferToHex(buffer, this.maxHexBytes) : undefined,
			},
			"",
		);
	}

	logBytes(
		direction: SecsLogDirection,
		protocol: string,
		buffer: Buffer,
		meta?: Record<string, unknown>,
	): void {
		this.detail.trace(
			{
				protocol,
				dir: direction,
				byteLength: buffer.length,
				hex: bufferToHex(buffer, this.maxHexBytes),
				...meta,
			},
			"bytes",
		);
	}

	logState(
		protocol: string,
		prev: string,
		next: string,
		meta?: Record<string, unknown>,
	): void {
		this.detail.info({ protocol, prev, next, ...meta }, "state");
	}

	close(): void {
		this.secs2.flush();
		this.detail.flush();
		this.secs2Stream.end();
		this.secs2Target.end();
		this.detailStream.end();
	}
}
