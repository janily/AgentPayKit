import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import {
  createBridgeController,
  type BridgeBootstrap,
} from "./bridge-controller";
import type { Eip1193Provider } from "./wallet/x402-signer";
import "./index.css";

declare global {
  interface Window {
    __AGENTPAY_BRIDGE__?: BridgeBootstrap;
    ethereum?: Eip1193Provider;
  }
}

const bootstrap = window.__AGENTPAY_BRIDGE__;
if (!bootstrap) throw new Error("BRIDGE_SESSION_MISSING");
if (!window.ethereum) throw new Error("METAMASK_PROVIDER_MISSING");
const controller = createBridgeController(bootstrap, window.ethereum);
window.addEventListener("pagehide", controller.close, { once: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App
      request={bootstrap.request}
      onApprove={controller.approve}
      onReject={() => void controller.reject()}
    />
  </StrictMode>,
);
