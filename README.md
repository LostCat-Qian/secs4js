<h1 align="center">Secs4js</h1>

<p align="center">A simple, efficient, and user-friendly SECS/GEM protocol library implemented in TypeScript.</p>

## Introduction

This project is a TypeScript implementation of the SECS/GEM protocol, inspired by [pysemisecs](https://github.com/kenta-shimizu/pysemisecs).

A special thanks to the author **kenta-shimizu** for their open-source contribution.

Secs4js is a simple, efficient, and user-friendly SECS/GEM protocol library implemented in TypeScript. It provides a straightforward way to communicate with SECS/GEM devices, enabling you to easily read and write data using the SECS/GEM protocol.

## Supported Features

- SECS-I (SEMI-E4)
- SECS-I Virtual Serial Port (SECS-I on TCP/IP)
- SECS-II (SEMI-E5)
- GEM (SEMI-E30)
- HSMS-SS (SEMI-E37.1)
- **No HSMS-GS (SEMI-E37.2)**

## Installation

```shell
npm i secs4js

pnpm add secs4js

yarn add secs4js

bun add secs4js
```

## Getting Started from Source

If you want to run some examples, they can be found in the `examples` directory.

Run the following commands to start these examples:

```shell
pnpm dlx tsx examples/gem_example.ts

# ...
pnpm dlx tsx examples/<example_file_name>.ts
```

## Usage

### 1. Creating SECS-II Messages

I provide a concise, clear, and efficient way to create SECS-II message types. You can use the following code to import the required items:

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

Using these items, you can easily create SECS-II message types. For example, to create a message containing L, A, and U1 items, you can use the following code:

```ts
import { L, A, U1, SecsMessage } from "secs4js";

const body: AbstractSecs2Item = L(A("Hello, SECS/GEM!"), U1(123));
```

Doesn't this highly resemble SML text syntax?

All SECS-II messages are derived from the `AbstractSecs2Item` class, so you can use it to declare any SECS-II message of unknown type.

If you don't like this approach, you can also use SML text syntax or the factory methods we provide to create SECS-II messages.

Factory methods:

```ts
import { Secs2ItemFactory } from "secs4js";

// Create a message containing L, A, and U1 items
const newMsg = Secs2ItemFactory.createListItem(
	Secs2ItemFactory.createAsciiItem("Hello World"),
	Secs2ItemFactory.createU1Item(123),
);
```

SML Conversion Support:

You can use the `toSml` method of the `AbstractSecs2Item` class to convert SECS-II messages to SML text. For example:

```ts
console.log(newMsg.toSml());

// Output:
// <L
//     <A "Hello World">
//     <U1 123>
// >.
```

### 2. Creating SECS Messages

We provide two ways to create SECS-II messages:

1. Use the `SecsMessage` class to create SECS-II messages.
2. Create SECS-II messages by parsing SML syntax text. You can use the `SmlParser` static class to parse SML text and create corresponding SECS-II messages.

#### new SecsMessage(...)

> You can use the `SecsMessage` class to create SECS-II messages. The class constructor accepts the following parameters:
>
> - `stream`: Stream number, one byte, range 0-255.
> - `function`: Function number, one byte, range 0-255.
> - `wBit`: W-bit, a boolean indicating whether to enable W-bit (i.e., whether a reply is required).
> - `body`: SECS-II message body, an `AbstractSecs2Item` instance.
> - We will automatically generate the message's `length` and `systemBytes`, so you don't need to manage them manually.

```ts
import { SecsMessage } from "secs4js";

const newMsg = new SecsMessage(1, 13, true, L(L(A("Hello World"), U1(123))));
```

#### SmlParser

```ts
import { SmlParser } from "secs4js";

// Complete SML text
const sml = `
    S1F13 W
    <L
        <B 0x20>
        <A "Hello World">
    >.
    `;

// SML text containing only the message body
const smlBody = `
    <L
        <B 0x20>
        <A "Hello World">
    >.
    `;

// Parse complete SML text into a SecsMessage instance using the parse method
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

// Parse SML text containing only the message body into an AbstractSecs2Item instance using the parseBody method
const parsedBody = SmlParser.parseBody(smlBody);
console.log(parsedBody?.toSml());
```

### 3. Extracting Data from SECS-II Messages

Data extraction is performed using array indexers, and specific values are retrieved through the `.value` property.

We implement parsing conventions that align better with user expectations. For instance, `<BOOLEAN TRUE FALSE>` is parsed into a Boolean array `[true, false]`.

For single values, we return the value directly rather than wrapping it in an array. For example, `<U1 123>` is parsed as `123`.

For detailed usage, please refer to the code example below. Note that type assertions are required for each retrieved node to ensure TypeScript type safety.

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

## Sending and Replying to Messages

In this library, you can actively send messages and passively reply to messages.

For actively sent messages, a new `SystemBytes` will be automatically generated. For reply messages, the `SystemBytes` from the primary message will be automatically read and used for the reply.

- **Send:** `send(stream: number, func: number, wBit: boolean, body?: AbstractSecs2Item)`
- **Reply:** `reply(primaryMsg: SecsMessage, stream: number, func: number, body?: AbstractSecs2Item)`

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

For HSMS-SS protocol support, you can act as the passive end (Equipment) or the active end (HOST/EAP).

### Active

Quick start:

```ts
const active = new HsmsActiveCommunicator({
	ip: "127.0.0.1",
	port: 5000,
	deviceId: 10,
	isEquip: false,
	// If you need to customize the timeout values, you can add additional parameters
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

// When you need to receive and process messages, you can listen for the "message" event
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

// Interaction results with the simulator
// Our reply message:
// 2025-12-30 01:26:44.866:onReceivedEvent[TOOL] DeviceID=[10] SB=[6110]
// S1F2
// <L[2/1]
// 	<A[6/1] "MDLN-A">
// 	<A[9/1] "SOFTREV-1">
// >.

// Message actively sent by the simulator:
// 2025-12-30 01:26:44.864:OnSent[TOOL] DeviceID=[1] SB=[6110]

// S1F1 W.
// 2025-12-30 01:26:44.864:Send the Message successfully.

// Message replied by the simulator:
// 2025-12-30 01:26:40.449:OnSent[TOOL] DeviceID=[10] SB=[2]
// S1F2
// <L[0/1]>.

// Message we actively sent:
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

// 1. Set up Equipment side (Passive)
const equipComm = new HsmsPassiveCommunicator({
	ip: "127.0.0.1",
	port: 5000,
	deviceId: 1,
	isEquip: true,
	name: "Equipment",
});

// Use the GEM helper class (optional)
const equipGem = new Gem(equipComm);
equipGem.mdln = "MyEquip";
equipGem.softrev = "1.0.0";

// Handle received messages
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

Supports SECS-I communication via serial port.

**Note**:

- Serial port communication needs to be tested on devices that support the SECS-I protocol.
- Ensure the serial port path and baud rate match your device configuration.
- If you want to test locally first, we recommend using a **virtual serial port tool** to simulate serial port communication.

### Active

```ts
import { A, L, Secs1SerialCommunicator, SecsMessage } from "secs4js";

async function SerialActive() {
	const active = new Secs1SerialCommunicator({
		path: "COM5", // Serial port path
		baudRate: 9600, // Baud rate
		deviceId: 10,
		isEquip: false, // Whether it is equipment
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

// Communication results with the simulator
// Our reply message:
// 2025-12-30 01:35:40.187:onReceivedEvent[SERIAL_EQP] DeviceID=[10] SB=[5985]
// S1F2
// <L[2/1]
// 	<A[6/1] "MDLN-A">
// 	<A[9/1] "SOFTREV-1">
// >.

// Message actively sent by the simulator:
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

Supports SECS-I serial communication via TCP/IP (usually used for testing or connecting through a terminal server).

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
			// Handle message...
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
			// Process message and reply...
		})();
	});

	await passive.open();
	console.log("Passive server started");
}
```

## GEM

This library provides partial `GEM` (Generic Equipment Model) support. You can access commonly used GEM methods through the `Gem` object.

```ts
// 1. Set up equipment side (Passive)
const equipComm = new HsmsPassiveCommunicator({
	ip: "127.0.0.1",
	port: 5000,
	deviceId: 1,
	isEquip: true,
	name: "Equipment",
});

// Use the GEM helper class (optional)
const equipGem = new Gem(equipComm);
equipGem.mdln = "MyEquip";
equipGem.softrev = "1.0.0";

equipComm.on("message", (msg: SecsMessage) => {
	void (async () => {
		console.log(`Passive received: ${msg.toSml()}`);

		// Reply to Host using messages defined in the Generic Equipment Model
		if (msg.stream === 1 && msg.func === 1) {
			await equipGem.s1f2(msg);
		}
	})();
});
```

## Logging

Logging is implemented using the `Pino` library.

There are two types of logs: `DETAIL` logs that record all detailed information, and SECS-II `SML` logs that only record bidirectional communication. The default level for DETAIL logs is `DEBUG`, and the default level for SECS-II logs is `INFO`.

You can configure logging properties by passing the `log` configuration parameter when initializing the communicator.

```ts
const active = new HsmsActiveCommunicator({
	ip: "127.0.0.1",
	port: 5000,
	deviceId: 10,
	isEquip: false,
	log: {
		enabled: true, // Whether to enable logging
		console: true, // Whether to output logs to console
		baseDir: "./secs4js-logs", // Path for log storage
		retentionDays: 30, // Number of days to retain logs
		detailLevel: "trace", // Level for DETAIL logs
		secs2Level: "info", // Level for SECS-II logs
		maxHexBytes: 65536, // Maximum number of hex bytes to record
	},
});
```

## Development

If you are interested in this project, welcome to contribute your code!

Thank you for your contribution! 💖

> 💝 This project was generated using [`create-typescript-app`](https://github.com/JoshuaKGoldberg/create-typescript-app) and the [Bingo framework](https://create.bingo).
