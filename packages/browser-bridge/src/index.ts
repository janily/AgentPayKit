export { default as BrowserBridgeApp } from "./App";
export { PaymentModal } from "./components/payment/PaymentModal";
export type { AppProps, BridgeRequest } from "./App";
export type { PaymentModalProps } from "./components/payment/PaymentModal";

export const PACKAGE_BOUNDARY = "@agentpaykit/browser-bridge" as const;
