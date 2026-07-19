import type { Hex } from "viem";

import { releaseSigningMessage, type ReleasePayload } from "./release-builder";

export interface SignedRelease {
  payload: ReleasePayload;
  signature: { algorithm: "EIP191"; signer: `0x${string}`; value: Hex };
}

export async function signRelease(
  payload: ReleasePayload,
  wallet: {
    address: `0x${string}`;
    signMessage(input: { message: string }): Promise<Hex>;
  },
): Promise<SignedRelease> {
  return {
    payload,
    signature: {
      algorithm: "EIP191",
      signer: wallet.address,
      value: await wallet.signMessage({
        message: releaseSigningMessage(payload),
      }),
    },
  };
}
