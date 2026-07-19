import { useState } from "react";

export interface PaymentModalProps {
  amount: string;
  payee: string;
  network: string;
  inputDigest: string;
  releaseId: string;
  dataDisclosure: string;
  onApprove: () => void | Promise<void>;
  onReject: () => void;
}

function truncate(value: string, prefix = 10, suffix = 8): string {
  if (value.length <= prefix + suffix + 1) return value;
  return `${value.slice(0, prefix)}…${value.slice(-suffix)}`;
}

function approvalError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : undefined;
  if (code === "WRONG_WALLET_NETWORK") {
    return "MetaMask is connected to the wrong network. Switch networks and try again.";
  }
  if (code === "INSUFFICIENT_USDC_BALANCE") {
    return "This wallet does not have enough USDC for the invocation.";
  }
  if (code === "WALLET_REJECTED") {
    return "The wallet signature was rejected. No payment was submitted.";
  }
  return "Wallet approval did not complete. No payment was submitted.";
}

export function PaymentModal({
  amount,
  payee,
  network,
  inputDigest,
  releaseId,
  dataDisclosure,
  onApprove,
  onReject,
}: PaymentModalProps) {
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string>();

  async function approve() {
    setError(undefined);
    setIsApproving(true);
    try {
      await onApprove();
    } catch (failure) {
      setError(approvalError(failure));
      setIsApproving(false);
    }
  }

  return (
    <section
      aria-labelledby="payment-title"
      className="w-full max-w-xl border border-zinc-200 bg-white shadow-[0_28px_80px_-40px_rgba(24,24,27,0.35)]"
    >
      <div className="border-b border-zinc-200 px-6 py-5 sm:px-8">
        <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Local wallet approval
        </p>
        <h1
          id="payment-title"
          className="text-2xl font-semibold tracking-tight text-zinc-950"
        >
          Review this invocation
        </h1>
        <p className="mt-2 max-w-[58ch] text-sm leading-6 text-zinc-600">
          AgentPayKit shows only signed payment metadata. Your original input
          stays outside this page.
        </p>
      </div>

      <dl className="divide-y divide-zinc-100 px-6 sm:px-8">
        <div className="grid grid-cols-[7.5rem_1fr] gap-4 py-4">
          <dt className="text-sm text-zinc-500">Amount</dt>
          <dd className="font-mono text-lg font-semibold text-zinc-950">
            {amount} USDC
          </dd>
        </div>
        <div className="grid grid-cols-[7.5rem_1fr] gap-4 py-4">
          <dt className="text-sm text-zinc-500">Payee</dt>
          <dd
            className="break-all font-mono text-sm text-zinc-800"
            title={payee}
          >
            {truncate(payee)}
          </dd>
        </div>
        <div className="grid grid-cols-[7.5rem_1fr] gap-4 py-4">
          <dt className="text-sm text-zinc-500">Network</dt>
          <dd className="font-mono text-sm text-zinc-800">{network}</dd>
        </div>
        <div className="grid grid-cols-[7.5rem_1fr] gap-4 py-4">
          <dt className="text-sm text-zinc-500">Input digest</dt>
          <dd
            className="break-all font-mono text-sm text-zinc-800"
            title={inputDigest}
          >
            {truncate(inputDigest)}
          </dd>
        </div>
        <div className="grid grid-cols-[7.5rem_1fr] gap-4 py-4">
          <dt className="text-sm text-zinc-500">Release</dt>
          <dd
            className="break-all font-mono text-sm text-zinc-800"
            title={releaseId}
          >
            {truncate(releaseId)}
          </dd>
        </div>
        <div className="grid grid-cols-[7.5rem_1fr] gap-4 py-4">
          <dt className="text-sm text-zinc-500">Data use</dt>
          <dd className="text-sm leading-6 text-zinc-700">{dataDisclosure}</dd>
        </div>
      </dl>

      {error ? (
        <p
          role="alert"
          className="mx-6 border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800 sm:mx-8"
        >
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 px-6 py-6 sm:grid-cols-2 sm:px-8">
        <button
          type="button"
          onClick={onReject}
          disabled={isApproving}
          className="border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 transition duration-200 hover:bg-zinc-50 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={approve}
          disabled={isApproving}
          className="bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition duration-200 hover:bg-emerald-800 active:translate-y-px disabled:cursor-wait disabled:bg-emerald-900"
        >
          {isApproving ? "Waiting for wallet…" : "Approve in MetaMask"}
        </button>
      </div>
    </section>
  );
}
