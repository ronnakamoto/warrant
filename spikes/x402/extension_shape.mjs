import { x402ResourceServer } from "@x402/core/server";
import { x402HTTPResourceServer } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm";
import { ExactHederaScheme } from "@x402/hedera/exact/server";

const supported = await fetch("https://api.testnet.blocky402.com/supported").then((r) => r.json());
const health = await fetch("https://api.testnet.blocky402.com/health").then((r) => r.json());

const hederaKind = supported.kinds.find((k) => k.network === "hedera:testnet");

const server = new x402ResourceServer("https://api.testnet.blocky402.com");
server.register("eip155:*", new ExactEvmScheme());
try {
  server.register("hedera:*", new ExactHederaScheme());
} catch (e) {
  // constructor might need options
}

const warrantExtension = {
  key: "warrant",
  dynamicInfoFields: ["nonce", "issuedAt", "merkleRoot"],
  enrichPaymentRequiredResponse: async (declaration, context) => {
    return {
      info: {
        version: "1",
        nonce: "spike-nonce",
        issuedAt: new Date().toISOString(),
        merkleRoot: "0x" + "11".repeat(32),
        requireScope: 1,
        minTier: 1,
      },
      schema: { type: "object" },
    };
  },
};

server.registerExtension(warrantExtension);

const paymentRequired = await server.createPaymentRequiredResponse(
  [
    {
      scheme: "exact",
      network: "hedera:testnet",
      asset: "0.0.0",
      amount: "100000",
      payTo: "0.0.10311260",
      maxTimeoutSeconds: 300,
      extra: { feePayer: hederaKind?.extra?.feePayer ?? "0.0.7162784" },
    },
  ],
  { url: "https://translate.warrant.example/v1/translate", description: "translate" },
  undefined,
  {
    warrant: {
      info: { version: "1" },
      schema: { type: "object" },
    },
  },
);

const result = {
  facilitator: { supported, health },
  hederaKind,
  paymentRequiredKeys: Object.keys(paymentRequired ?? {}),
  paymentRequired,
  extensionInterface: {
    key: "warrant",
    mirrorsAgentkit: "agentkit",
    hooks: ["onBeforeVerify", "onAfterVerify", "onVerifyFailure"],
    clientRetryHeader: "PAYMENT-SIGNATURE (v2) plus custom warrant header",
  },
};

console.log(JSON.stringify(result, null, 2));
