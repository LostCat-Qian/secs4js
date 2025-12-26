// TypeScript 等效实现

/**
 * HSMS-SS 控制类型（PType + SType 组合）
 * 存储在 Header 的 Byte 4-5
 */
export class HsmsSsControlType {
	// 只读实例属性
	readonly PType: number;
	readonly SType: number;

	// 私有构造函数，防止外部直接实例化
	private constructor(pType: number, sType: number) {
		this.PType = pType;
		this.SType = sType;
	}

	// ========== 静态只读实例 ==========

	// 未定义类型
	static readonly Undefined = new HsmsSsControlType(0xff, 0xff);

	// 数据消息（携带 SECS-II 数据）
	static readonly Data = new HsmsSsControlType(0x00, 0x00);

	// 连接控制消息
	static readonly SelectReq = new HsmsSsControlType(0x00, 0x01);
	static readonly SelectRsp = new HsmsSsControlType(0x00, 0x02);
	static readonly DeselectReq = new HsmsSsControlType(0x00, 0x03);
	static readonly DeselectRsp = new HsmsSsControlType(0x00, 0x04);

	// 链路测试消息
	static readonly LinktestReq = new HsmsSsControlType(0x00, 0x05);
	static readonly LinktestRsp = new HsmsSsControlType(0x00, 0x06);

	// 拒绝消息
	static readonly RejectReq = new HsmsSsControlType(0x00, 0x07);

	// 分离请求
	static readonly SeparateReq = new HsmsSsControlType(0x00, 0x09);

	// 私有已知类型数组
	private static readonly KnownTypes: HsmsSsControlType[] = [
		HsmsSsControlType.Data,
		HsmsSsControlType.SelectReq,
		HsmsSsControlType.SelectRsp,
		HsmsSsControlType.DeselectReq,
		HsmsSsControlType.DeselectRsp,
		HsmsSsControlType.LinktestReq,
		HsmsSsControlType.LinktestRsp,
		HsmsSsControlType.RejectReq,
		HsmsSsControlType.SeparateReq,
	];

	// ========== 静态工厂方法 ==========

	/**
	 * 从字节解析控制类型
	 */
	static fromBytes(pType: number, sType: number): HsmsSsControlType {
		for (const known of HsmsSsControlType.KnownTypes) {
			if (known.PType === pType && known.SType === sType) {
				return known;
			}
		}
		return HsmsSsControlType.Undefined;
	}

	/**
	 * 从 Header Bytes 4-5 解析
	 */
	static fromHeaderBytes(
		headerBytes: Uint8Array | number[],
	): HsmsSsControlType {
		return HsmsSsControlType.fromBytes(headerBytes[4], headerBytes[5]);
	}

	// ========== 实例方法 ==========

	/**
	 * 判断是否为数据消息
	 */
	get isDataMessage(): boolean {
		return this === HsmsSsControlType.Data;
	}

	/**
	 * 判断是否为控制消息
	 */
	get isControlMessage(): boolean {
		return !this.isDataMessage && this !== HsmsSsControlType.Undefined;
	}

	get isSelectRequest(): boolean {
		return this === HsmsSsControlType.SelectReq;
	}

	get isSelectResponse(): boolean {
		return this === HsmsSsControlType.SelectRsp;
	}

	get isLinktestRequest(): boolean {
		return this === HsmsSsControlType.LinktestReq;
	}

	get isRejectRequest(): boolean {
		return this === HsmsSsControlType.RejectReq;
	}

	/**
	 * 字符串表示
	 */
	toString(): string {
		if (this === HsmsSsControlType.Data) return "DATA";
		if (this === HsmsSsControlType.SelectReq) return "SELECT.req";
		if (this === HsmsSsControlType.SelectRsp) return "SELECT.rsp";
		if (this === HsmsSsControlType.DeselectReq) return "DESELECT.req";
		if (this === HsmsSsControlType.DeselectRsp) return "DESELECT.rsp";
		if (this === HsmsSsControlType.LinktestReq) return "LINKTEST.req";
		if (this === HsmsSsControlType.LinktestRsp) return "LINKTEST.rsp";
		if (this === HsmsSsControlType.RejectReq) return "REJECT.req";
		if (this === HsmsSsControlType.SeparateReq) return "SEPARATE.req";
		return `Unknown(${this.PType.toString(16).toUpperCase()},${this.SType.toString(16).toUpperCase()})`;
	}

	// ========== 值相等性比较 ==========

	/**
	 * 比较两个控制类型是否相等（C# record struct 的值比较语义）
	 */
	equals(other: HsmsSsControlType): boolean {
		return this.PType === other.PType && this.SType === other.SType;
	}

	/**
	 * 支持 === 运算符的比较
	 */
	valueOf(): { PType: number; SType: number } {
		return { PType: this.PType, SType: this.SType };
	}
}
