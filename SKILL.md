---
AIGC:
  ContentProducer: Minimax Agent AI
  ContentPropagator: Minimax Agent AI
  Label: AIGC
  ProduceID: 1dfa1ff41a5da84ecbe09809f55ae897
  PropagateID: 1dfa1ff41a5da84ecbe09809f55ae897
  ReservedCode1: 30440220023bd17e3ac0f805054f173a06357bf35233fa0903b182952ab16ab778d27b020220144d17c10504d0021eec32a380a50c022af8eb9ee6e60f13b3fa03a212bfe835
  ReservedCode2: 3045022100fae861f6bc08eac0df94113b56ab330db386b4a995960aff34f61773dc63f5850220625a4ef015f5c2e6c7493cb4468a44b0c74759a75c86422aa6ebeeedc498275b
description: SECS/GEM协议通信助手。当用户需要与半导体设备通信、使用SECS-I/SECS-II/HSMS协议、创建SECS消息、解析SML语法，或使用secs4js TypeScript库进行设备集成时使用。
name: secs4js-helper
---

# SECS/GEM Protocol Helper

## 核心功能

### 1. 创建 SECS-II 消息

使用简洁的函数式API创建SECS-II数据类型：

```ts
import { L, A, U1, U2, U4, I1, I2, F4, F8, B, BOOLEAN } from "secs4js";

// 创建复合消息
const body = L(A("MDLN-A"), U1(123), U2(1000, 2000));
```

**支持的数据类型：**

- `L` - List（列表）
- `A` - ASCII字符串
- `B` - Binary
- `BOOLEAN` - 布尔值
- `U1/U2/U4/U8` - 无符号整数
- `I1/I2/I4/I8` - 有符号整数
- `F4/F8` - 浮点数

### 2. 使用 SML 语法

SML (SECS Markup Language) 是一种人类可读的SECS消息表示方式：

```ts
import { SmlParser } from "secs4js";

// 解析完整SML消息
const msg = SmlParser.parse(`S1F13 W
<L
    <B 0x20>
    <A "Hello World">
>.`);

// 解析消息体
const body = SmlParser.parseBody(`<L
    <U1 20>
    <A "OK">
>.`);
```

### 3. 创建 SECS 消息

```ts
import { SecsMessage, L, A } from "secs4js";

// 创建带W-bit的请求消息
const request = new SecsMessage(1, 13, true, L(A("MDLN-A")));

// 转换为SML查看
console.log(request.toSml());
```

### 4. 数据提取

使用数组索引器提取嵌套数据：

```ts
const body = L(A("MDLN-A"), U1(20), U2(1000, 2000));

// 获取第一个ASCII项
const firstA = body[0] as Secs2ItemAscii;
console.log(firstA.value); // "MDLN-A"

// 获取U1值
const u1Value = body[1] as Secs2ItemNumeric;
console.log(u1Value.value); // 20
```

### 5. HSMS-SS 通信 (TCP/IP)

**作为Active端 (Host/EAP):**

```ts
import { HsmsActiveCommunicator, L, A } from "secs4js";

const host = new HsmsActiveCommunicator({
	ip: "192.168.1.100",
	port: 5000,
	deviceId: 10,
	isEquip: false,
});

host.on("message", async (msg) => {
	console.log(`Received: ${msg.toSml()}`);

	// 回复消息
	if (msg.stream === 1 && msg.func === 1) {
		await host.reply(msg, 1, 2, L(A("MDLN-A"), A("SOFTREV-1")));
	}
});

await host.open();
await host.untilConnected();
```

**作为Passive端 (Equipment):**

```ts
import { HsmsPassiveCommunicator, Gem } from "secs4js";

const equip = new HsmsPassiveCommunicator({
	ip: "0.0.0.0",
	port: 5000,
	deviceId: 1,
	isEquip: true,
	name: "Equipment",
});

const gem = new Gem(equip);
gem.mdln = "MyEquip";
gem.softrev = "1.0.0";

equip.on("message", async (msg) => {
	// S1F13: 建立通信请求
	if (msg.stream === 1 && msg.func === 13) {
		await gem.s1f14(msg, CommAck.OK);
	}
	// S1F17: 请求在线
	else if (msg.stream === 1 && msg.func === 17) {
		await gem.s1f18(msg, OnlAck.OK);
	}
});

await equip.open();
```

### 6. SECS-I 串口通信

```ts
import { Secs1SerialCommunicator } from "secs4js";

const serial = new Secs1SerialCommunicator({
	path: "COM5", // 串口路径
	baudRate: 9600,
	deviceId: 10,
	isEquip: true,
});

serial.on("message", async (msg) => {
	console.log(`Received: ${msg.toSml()}`);
});

await serial.open();
```

### 7. GEM 辅助功能

```ts
import { Gem, CommAck, OnlAck } from "secs4js";

const gem = new Gem(communicator);

// 设置设备标识
gem.mdln = "EQP-001";
gem.softrev = "v1.0.0";

// 常用GEM消息
await gem.s1f14(msg, CommAck.OK); // 通信建立回复
await gem.s1f18(msg, OnlAck.OK); // 在线请求回复
await gem.s2f18Now(msg); // 日期时间请求回复
await gem.s2f33(msg, data); // 变量数据设置
```

### 8. 发送与回复消息

```ts
// 主动发送消息
const reply = await communicator.send(1, 1, true, L(A("MDLN-A")));
console.log(`Reply: ${reply?.toSml()}`);

// 回复接收到的消息（自动使用原消息的SystemBytes）
await communicator.reply(primaryMsg, 1, 2, L(A("ACK")));
```

### 9. 日志配置

```ts
const comm = new HsmsPassiveCommunicator({
	ip: "0.0.0.0",
	port: 5000,
	deviceId: 1,
	isEquip: true,
	log: {
		enabled: true,
		console: true,
		baseDir: "./logs",
		retentionDays: 30,
		detailLevel: "trace",
		secs2Level: "info",
	},
});
```

## 快速参考

| 组件                       | 用途                   |
| -------------------------- | ---------------------- |
| `HsmsActiveCommunicator`   | HSMS主动端 (Host/EAP)  |
| `HsmsPassiveCommunicator`  | HSMS被动端 (Equipment) |
| `Secs1SerialCommunicator`  | SECS-I 串口通信        |
| `Secs1OnTcpIpCommunicator` | SECS-I over TCP/IP     |
| `Gem`                      | GEM辅助类              |
| `SecsMessage`              | SECS消息封装           |
| `SmlParser`                | SML语法解析器          |
| `Secs2ItemFactory`         | 工厂方法创建SECS-II项  |
