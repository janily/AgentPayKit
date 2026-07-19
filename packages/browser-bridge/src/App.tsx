import { PaymentModal } from "./components/payment/PaymentModal";

export interface BridgeRequest {
  amount: string;
  payee: string;
  network: string;
  inputDigest: string;
  releaseId: string;
  dataDisclosure: string;
}

export interface AppProps {
  request?: BridgeRequest;
  onApprove?: () => void | Promise<void>;
  onReject?: () => void;
}

const previewRequest: BridgeRequest = {
  amount: "0.01",
  payee: "0x1111111111111111111111111111111111111111",
  network: "Base Sepolia · eip155:84532",
  inputDigest:
    "sha256:7a1bb14e7287978e8f5d105f7f456c9efcd1356b0fdc69db986e83a88dd6f4c2",
  releaseId: `rel_${"8f2a1c".repeat(10)}8f2a`,
  dataDisclosure: "Input is sent only to the selected skill runtime.",
};

export default function App({
  request = previewRequest,
  onApprove = () => undefined,
  onReject = () => undefined,
}: AppProps) {
  return (
    <main className="min-h-[100dvh] bg-zinc-100 px-4 py-8 text-zinc-950 sm:px-8 sm:py-12">
      <div className="mx-auto grid w-full max-w-6xl gap-10 md:grid-cols-[minmax(0,0.75fr)_minmax(28rem,1fr)] md:items-start">
        <aside className="pt-2 md:pt-12">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            AgentPayKit Browser Bridge
          </p>
          <h2 className="mt-4 max-w-md text-4xl font-semibold leading-none tracking-tighter text-zinc-950 md:text-5xl">
            One invocation. One explicit signature.
          </h2>
          <p className="mt-6 max-w-[48ch] text-base leading-7 text-zinc-600">
            This loopback page is the boundary between your coding agent and
            MetaMask. Verify the amount, destination, network, and digest before
            approving.
          </p>
        </aside>

        <PaymentModal {...request} onApprove={onApprove} onReject={onReject} />
      </div>
    </main>
  );
}
