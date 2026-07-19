export { default as BrowserBridgeApp } from "./App";
export { PaymentModal } from "./components/payment/PaymentModal";
export { createBridgeController } from "./bridge-controller";
export { bridgeContentSecurityPolicy } from "./server/csp";
export { LoopbackBridgeServer } from "./server/loopback-server";
export { BridgeSessionError, SessionStore } from "./server/session-store";
export {
  OfficialX402WalletSigner,
  WalletApprovalError,
} from "./wallet/x402-signer";
export type { AppProps, BridgeRequest } from "./App";
export type { BridgeBootstrap } from "./bridge-controller";
export type { PaymentModalProps } from "./components/payment/PaymentModal";
export type {
  BridgeDisplayRequest,
  BridgeSessionCompletion,
  BridgeSessionState,
} from "./server/session-store";
export type { Eip1193Provider } from "./wallet/x402-signer";

export const PACKAGE_BOUNDARY = "@agentpaykit/browser-bridge" as const;
