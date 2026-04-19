<h1 align="center">Secs4js</h1>

<p align="center">一个简单、高效、用户友好的SECS/GEM协议库，使用TypeScript实现。</p>

## 介绍

本项目是一个使用TypeScript实现的SECS/GEM协议库，灵感来源于 [pysemisecs](https://github.com/kenta-shimizu/pysemisecs)。

非常感谢作者 **kenta-shimizu** 的开源贡献。

Secs4js是一个简单、高效、用户友好的SECS/GEM协议库，使用TypeScript实现。它提供了一种与SECS/GEM设备通信的简单方式，使您能够轻松地使用SECS/GEM协议读写数据。

我基于README文件创建了一个可供AI使用的SKILL.md文件，在根目录下，如果您有需要可以进行使用，正常配置好您的SKILLs即可。

## 支持的功能

- SECS-I (SEMI-E4)
- SECS-I 虚拟串口 (SECS-I on TCP/IP)
- SECS-II (SEMI-E5)
- GEM (SEMI-E30)
- HSMS-SS (SEMI-E37.1)
- **不支持 HSMS-GS (SEMI-E37.2)**

## 安装

```shell
npm i secs4js

pnpm add secs4js

yarn add secs4js

bun add secs4js
```

## 从源代码开始

如果您希望运行一些例子，那么可以在 `examples` 目录下找到。

运行以下命令来启动这些例子：

```shell
pnpm dlx tsx examples/gem_example.ts

# ...
pnpm dlx tsx examples/<example_file_name>.ts
```

## 使用方法

### 1. 创建SECS-II消息

我提供了一种简洁、清晰、高效的方式来创建SECS-II的消息类型。您可以使用以下代码导入所需的项：

```ts
import {
	B,
	BOOLEAN,
	U1,
	U2,
	U4,
	U8,
	I1,
	I2,
	I4,
	I8,
	F4,
	F8,
	A,
	L,
} from "secs4js";
```

使用这些项，您可以轻松地创建SECS-II的消息类型。例如，要创建一个包含L、A、U1项的消息，您可以使用以下代码：

```ts
import { L, A, U1, SecsMessage } from "secs4js";

const body: AbstractSecs2Item = L(A("Hello, SECS/GEM!"), U1(123));
```

这是不是与SML文本语法高度一致？

所有的SECS-II消息都来抽象自 `AbstractSecs2Item` 类，所以你可以在任何未知具体类型的SECS-II消息中使用它来声明。

如果你不喜欢这种方式，您也可以使用SML文本语法或者我们提供的工厂方法来创建SECS-II消息。

工厂方法：

```ts
import { Secs2ItemFactory } from "secs4js";

// 创建一个包含L、A、U1项的消息
const newMsg = Secs2ItemFactory.createListItem(
	Secs2ItemFactory.createAsciiItem("Hello World"),
	Secs2ItemFactory.createU1Item(123),
);
```

SML转换支持：

您可以使用 `AbstractSecs2Item` 类的 `toSml` 方法将SECS-II消息转换为SML文本。例如：

```ts
console.log(newMsg.toSml());

// 输出结果：
// <L
//     <A "Hello World">
//     <U1 123>
// >.
```

### 2. 创建SECS Message

我们提供了两种方式来创建SECS-II消息：

1. 使用 `SecsMessage` 类来创建SECS-II消息。
2. 通过对 SML 语法进行文本解析来创建SECS-II消息。您可以使用 `SmlParser` 静态类来解析SML文本并创建对应的SECS-II消息。

#### new SecsMessage(...)

> 您可以使用 `SecsMessage` 类来创建SECS-II消息。该类的构造函数接受以下参数：
>
> - `stream`：流号，一个字节，范围为 0-255。
> - `function`: 功能号，一个字节，范围为 0-255。
> - `wBit`：W位，一个布尔值，指示是否启用W位（即是否需要回复）。
> - `body`：SECS-II消息体，一个 `AbstractSecs2Item` 实例。
> - 我们会自动生成消息的 `length` 和 `systemBytes`，您无需手动管理。

```ts
import { SecsMessage } from "secs4js";

const newMsg = new SecsMessage(1, 13, true, L(L(A("Hello World"), U1(123))));
```

#### SmlParser

```ts
import { SmlParser } from "secs4js";

// 完整的SML文本
const sml = `
    S1F13 W
    <L
        <B 0x20>
        <A "Hello World">
    >.
    `;

// 仅包含消息体的SML文本
const smlBody = `
    <L
        <B 0x20>
        <A "Hello World">
    >.
    `;

// 通过 parse 方法解析完整的SML文本为 SecsMessage 实例
const parsedMessage = SmlParser.parse(sml);
const firstBodyItem =
	parsedMessage.body instanceof Secs2ItemList
		? parsedMessage.body.value[0]
		: null;
const bytes =
	firstBodyItem instanceof Secs2ItemBinary ? firstBodyItem.value : null;
console.log(
	parsedMessage.stream,
	parsedMessage.func,
	parsedMessage.wBit,
	bytes,
);

// 通过 parseBody 方法解析仅包含消息体的SML文本为 AbstractSecs2Item 实例
const parsedBody = SmlParser.parseBody(smlBody);
console.log(parsedBody?.toSml());
```

### 3. 从 SECS-II 消息中提取数据

提取数据采用数组索引器的方式，然后通过 `.value` 属性获取具体的值。
我们会做一些更适配用户习惯的解析，例如 `<BOOLEAN TRUE FALSE>` 会被解析为 `[true, false]` 布尔数组。
如果是单个值的话我们会直接返回这个值，而不是包裹在数组中，例如 `<U1 123>` 会被解析为 `123`。

详细的用法可以参考下面的代码示例，需要注意的是针对于每一个获取到的节点，需要进行类型断言，以确保 TypeScript 的类型安全。

```ts
import {
	A,
	L,
	Secs2ItemAscii,
	Secs2ItemList,
	Secs2ItemNumeric,
	SmlParser,
} from "secs4js";

function getItemValue() {
	const body = L(A("MDLN-A"), A("SOFTREV-1"));
	const firstA = body?.[0] as Secs2ItemAscii;
	console.log("MDLN: ", firstA.value);

	const smlBody = `
        <L
            <A "OK" >
            <U1 20 >
            <U2 1000 2000 >
            <U4 100000000 200000000 >
            <U8 1000000000000000 2000000000000 >
            <I1 10 20 >
            <I2 1000 -2000 >
            <I4 100 >
            <I8 -1234567890123456 9973232131213124 >
            <F4 3.14 -6.18 >
            <F8 1.234567890123456 6.18 >
            <B 0x10 0x20 >
            <Boolean TRUE FALSE >
            <L
                <A "Nested" >
                <F4 3.14 >
                <L
                    <A "More Nested">
                    <Boolean F>
                >
            >
        >
    `;
	const smlBodySecs2Items = SmlParser.parseBody(smlBody);
	const zeroItem = smlBodySecs2Items?.[0] as Secs2ItemAscii;
	const firstU1 = smlBodySecs2Items?.[1] as Secs2ItemNumeric;
	const secondItem = smlBodySecs2Items?.[2] as Secs2ItemNumeric;
	const eighthItem = smlBodySecs2Items?.[8] as Secs2ItemNumeric;
	const tenthItem = smlBodySecs2Items?.[10] as Secs2ItemNumeric;
	const twelfthItem = smlBodySecs2Items?.[12] as Secs2ItemNumeric;
	const nestedList = smlBodySecs2Items?.[13] as Secs2ItemList;
	const nestedListFirstItem = nestedList?.[0] as Secs2ItemAscii;
	console.log("ASCII value: ", zeroItem.value);
	console.log("U1 value: ", firstU1.value);
	console.log("U2 value: ", secondItem.value);
	console.log("I8 value: ", eighthItem.value);
	console.log("F8 value: ", tenthItem.value);
	console.log("BOOLEAN value: ", twelfthItem.value);
	console.log("NESTED ASCII value: ", nestedListFirstItem.value);
}

getItemValue();
```

通过 Helper 提供的辅助方法创建 SECS-II 消息体。

```ts
function newItemsTest() {
	const newItems = L(
		A("MDLN-A"),
		A("SOFTREV-1"),
		U1(20),
		U2(1000, 2000),
		U4(100000000, 200000000),
		U8(1000000000000000, 2000000000000),
		I1(10, 20),
		I2(1000, -2000),
		I4(100),
		I8(-1234567890123456, 9973232131213124),
		F4(3.14),
		F8(1.234567890123456, 6.18),
		BOOLEAN(true, false),
	);

	console.log((newItems[12] as Secs2ItemBoolean).value); // [true, false]
	console.log(newItems.toSml());
	// <L [13]
	// 	<A [6] "MDLN-A">
	// 	<A [9] "SOFTREV-1">
	// 	<U1 [1] 20>
	// 	<U2 [2] 1000 2000>
	// 	<U4 [2] 100000000 200000000>
	// 	<U8 [2] 1000000000000000 2000000000000>
	// 	<I1 [2] 10 20>
	// 	<I2 [2] 1000 -2000>
	// 	<I4 [1] 100>
	// 	<I8 [2] -1234567890123456 9973232131213124>
	// 	<F4 [1] 3.14>
	// 	<F8 [2] 1.234567890123456 6.18>
	// 	<BOOLEAN T F>
	// >
}
```

## 发送消息与回复消息

在库中，您可以进行消息的主动发送和被动回复。
主动发送的消息我们会自动生成新的 `SystemBytes`，作为回复的消息会自动读取主消息的 `SystemBytes` 并采用这个值进行回复。

- 发送：`send(stream: number, func: number, wBit: boolean, body?: AbstractSecs2Item)`
- 回复：`reply(primaryMsg: SecsMessage, stream: number, func: number, body?: AbstractSecs2Item)`

```ts
active.on("message", (msg: SecsMessage) => {
	void (async () => {
		console.log(`Active received: ${msg.toSml()}`);

		await active.send(2, 18, true, L());

		if (msg.stream === 1 && msg.func === 1) {
			await active.reply(msg, 1, 2, L(A("MDLN-A"), A("SOFTREV-1")));
		}
		if (msg.stream === 1 && msg.func === 13) {
			await active.reply(msg, 1, 14, L(A("ACK")));
		}
	})();
});
```

## HSMS-SS

对 HSMS-SS 协议的支持，您可以作为被动端（设备）或主动端（HOST/EAP）。

### Active

快速开始：

```ts
const active = new HsmsActiveCommunicator({
	ip: "127.0.0.1",
	port: 5000,
	deviceId: 10,
	isEquip: false,
	// 如果你对超时时间需要进行自定义，也可以添加额外的参数
	// timeoutT1: 10,
	// ...
});

active.on("connected", () => console.log("Active TCP Connected"));
active.on("disconnected", () => console.log("Active Disconnected"));
active.on("selected", () => console.log("Active Selected (HSMS Ready)"));

await active.open();
console.log("Active opened");

// Active will automatically send SelectReq and start heartbeat

await active.untilConnected(); // Wait for Select success

// 当需要在接收到消息并进行处理时，您可以监听 "message" 事件
active.on("message", (msg: SecsMessage) => {
	void (async () => {
		console.log(`Active received: ${msg.toSml()}`);
		if (msg.stream === 1 && msg.func === 1) {
			await active.reply(msg, 1, 2, L(A("MDLN-A"), A("SOFTREV-1")));
		}
		if (msg.stream === 1 && msg.func === 13) {
			await active.reply(msg, 1, 14, L(A("ACK")));
		}
	})();
});

const reply = await active.send(1, 1, true);
console.log(`Active received reply: ${reply?.toSml()}`);

// 与模拟器的交互运行结果
// 我们回复的消息：
// 2025-12-30 01:26:44.866:onReceivedEvent[TOOL] DeviceID=[10] SB=[6110]
// S1F2
// <L[2/1]
// 	<A[6/1] "MDLN-A">
// 	<A[9/1] "SOFTREV-1">
// >.

// 模拟器主动发送的消息：
// 2025-12-30 01:26:44.864:OnSent[TOOL] DeviceID=[1] SB=[6110]

// S1F1 W.
// 2025-12-30 01:26:44.864:Send the Message successfully.

// 模拟器回复的消息：
// 2025-12-30 01:26:40.449:OnSent[TOOL] DeviceID=[10] SB=[2]
// S1F2
// <L[0/1]>.

// 我们主动发送的消息：
// 2025-12-30 01:26:40.445:Do not find Tool in QutoReply List by Tool[TOOL] SFName=[S1F1]
// 2025-12-30 01:26:40.444:onReceivedEvent[TOOL] DeviceID=[10] SB=[2]
// S1F1 W.
```

### Passive

```ts
import {
	HsmsPassiveCommunicator,
	SecsMessage,
	CommAck,
	OnlAck,
	Gem,
} from "secs4js";

// 1. 设置设备端 (Passive)
const equipComm = new HsmsPassiveCommunicator({
	ip: "127.0.0.1",
	port: 5000,
	deviceId: 1,
	isEquip: true,
	name: "Equipment",
});

// 使用 GEM 助手类（可选）
const equipGem = new Gem(equipComm);
equipGem.mdln = "MyEquip";
equipGem.softrev = "1.0.0";

// 处理接收到的消息
equipComm.on("message", (msg: SecsMessage) => {
	void (async () => {
		try {
			// S1F13: Establish Communications Request
			if (msg.stream === 1 && msg.func === 13) {
				console.log("[Equip] Received S1F13, replying S1F14...");
				await equipGem.s1f14(msg, CommAck.OK);
			}
			// S1F17: Request ON-LINE
			else if (msg.stream === 1 && msg.func === 17) {
				console.log("[Equip] Received S1F17, replying S1F18...");
				await equipGem.s1f18(msg, OnlAck.OK);
			}
			// S2F17: Date and Time Request
			else if (msg.stream === 2 && msg.func === 17) {
				console.log("[Equip] Received S2F17, replying S2F18...");
				await equipGem.s2f18Now(msg);
			} else {
				console.log(
					`[Equip] Received unhandled message S${msg.stream}F${msg.func}`,
				);
			}
		} catch (err) {
			console.error("[Equip] Error handling message:", err);
		}
	})();
});

await equipComm.open();
console.log("Passive opened and listening");
```

## SECS-I Serial

支持通过串口进行 SECS-I 通信。

**注意**：

- 串口通信需要在支持 SECS-I 协议的设备上进行测试。
- 确保串口路径和波特率与您的设备配置匹配。
- 如果您想先进行本地测试，那么我们推荐您使用**虚拟串口工具**来模拟串口通信。

### Active

```ts
import { A, L, Secs1SerialCommunicator, SecsMessage } from "secs4js";

async function SerialActive() {
	const active = new Secs1SerialCommunicator({
		path: "COM5", // 串口路径
		baudRate: 9600, // 波特率
		deviceId: 10,
		isEquip: false, // 是否为设备
	});

	active.on("message", (msg: SecsMessage) => {
		void (async () => {
			console.log(`Active received: ${msg.toSml()}`);
			if (msg.stream === 1 && msg.func === 1) {
				await active.reply(msg, 1, 2, L(A("MDLN-A"), A("SOFTREV-1")));
			}
		})();
	});

	active.on("connected", () => {
		console.log("Active connected");
	});

	await active.open();
	console.log("Active opened");
}

SerialActive().catch((err) => console.error(err));

// 与模拟器的通信结果
// 我们回复的消息：
// 2025-12-30 01:35:40.187:onReceivedEvent[SERIAL_EQP] DeviceID=[10] SB=[5985]
// S1F2
// <L[2/1]
// 	<A[6/1] "MDLN-A">
// 	<A[9/1] "SOFTREV-1">
// >.

// 模拟器主动发送的消息：
// 2025-12-30 01:35:40.155:OnSent[SERIAL_EQP] DeviceID=[1] SB=[5985]

// S1F1 W.
// 2025-12-30 01:35:40.095:Send the Message successfully.
```

### Passive

```ts
import { Secs1SerialCommunicator, SecsMessage, L, A } from "secs4js";

async function SerialPassive() {
	const passive = new Secs1SerialCommunicator({
		path: "COM5",
		baudRate: 9600,
		deviceId: 10,
		isEquip: true,
	});

	passive.on("message", (msg: SecsMessage) => {
		void (async () => {
			if (msg.stream === 1 && msg.func === 1) {
				await passive.reply(msg, 1, 2, L(A("MDLN-A"), A("SOFTREV-1")));
			}
			console.log(`Passive received: ${msg.toSml()}`);
		})();
	});

	await passive.open();
	console.log("Passive opened");
}

SerialPassive().catch((err) => console.error(err));
```

## SECS-I On TCP/IP

支持通过 TCP/IP 模拟串口 SECS-I 通信（通常用于测试或通过终端服务器连接）。

### Active

```ts
import { Secs1OnTcpIpActiveCommunicator, SecsMessage, L, A } from "secs4js";

async function TcpActive() {
	const active = new Secs1OnTcpIpActiveCommunicator({
		ip: "127.0.0.1",
		port: 5000,
		deviceId: 10,
		isEquip: false,
	});

	active.on("message", (msg: SecsMessage) => {
		void (async () => {
			console.log(`Active received: ${msg.toSml()}`);
			// 处理消息...
		})();
	});

	active.on("connected", () => {
		console.log("Active connected");
	});

	await active.open();
}
```

### Passive

```ts
import { Secs1OnTcpIpPassiveCommunicator, SecsMessage, L, A } from "secs4js";

async function TcpPassive() {
	const passive = new Secs1OnTcpIpPassiveCommunicator({
		ip: "0.0.0.0",
		port: 5000,
		deviceId: 10,
		isEquip: true,
	});

	passive.on("message", (msg: SecsMessage) => {
		void (async () => {
			console.log(`Passive received: ${msg.toSml()}`);
			// 处理消息并回复...
		})();
	});

	await passive.open();
	console.log("Passive server started");
}
```

## Gem

提供部分 `Gem` 支持，你可以通过 Gem 对象获取部分常用的 Gem 方法。

```ts
// 1. 设置设备端 (Passive)
const equipComm = new HsmsPassiveCommunicator({
	ip: "127.0.0.1",
	port: 5000,
	deviceId: 1,
	isEquip: true,
	name: "Equipment",
});

// 使用 GEM 助手类（可选）
const equipGem = new Gem(equipComm);
equipGem.mdln = "MyEquip";
equipGem.softrev = "1.0.0";

equipComm.on("message", (msg: SecsMessage) => {
	void (async () => {
		console.log(`Passive received: ${msg.toSml()}`);
		// 通过通用设备模型定义的消息回复Host端
		if (msg.stream === 1 && msg.func === 1) {
			await equipGem.s1f2(msg);
		}
	})();
});
```

## 日志

日志使用 `Pino` 库进行记录。
日志分为两种，第一种是记录所有详细信息的 `DETAIL` 日志，第二种是仅记录双端交流的SECS-II `SML` 日志，DETAIL日志的默认级别为 `DEBUG`，SECS-II日志的默认级别为 `INFO`。

您可以在初始化通信器时通过传递 `log` 配置参数来配置日志的属性。

```ts
const active = new HsmsActiveCommunicator({
	ip: "127.0.0.1",
	port: 5000,
	deviceId: 10,
	isEquip: false,
	log: {
		enabled: true, // 是否启用日志记录
		console: true, // 是否输出日志到控制台
		baseDir: "./secs4js-logs", // 日志存储的路径
		retentionDays: 30, // 日志保留的天数
		detailLevel: "trace", // DETAIL日志的级别
		secs2Level: "info", // SECS-II日志的级别
		maxHexBytes: 65536, // 最大记录的十六进制字节数
	},
});
```

## 开发

如果您对本项目感兴趣，欢迎贡献您的代码！

感谢您的贡献！💖

> 💝 此项目使用 [`create-typescript-app`](https://github.com/JoshuaKGoldberg/create-typescript-app) 和 [Bingo框架](https://create.bingo) 生成。
