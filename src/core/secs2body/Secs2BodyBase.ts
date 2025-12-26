export abstract class Secs2BodyBase {
	abstract toBytes(): Uint8Array;
	abstract fromBytes(bytes: ArrayBuffer): void;
}
