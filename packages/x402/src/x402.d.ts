import type {} from "@x402/core/server";

declare module "@x402/core/server" {
  export type ResourceServerExtension = {
    key: string;
    dynamicInfoFields?: string[];
    enrichPaymentRequiredResponse?: (
      declaration: unknown,
      context: unknown,
    ) => Promise<unknown>;
  };
}
