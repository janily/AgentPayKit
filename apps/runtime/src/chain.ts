import {
  createPublicClient,
  http,
  parseAbiItem,
  type Address,
  type Hash,
} from "viem";
import { base, baseSepolia } from "viem/chains";

const authorizationUsedEvent = parseAbiItem(
  "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)",
);

export class BaseChainReader {
  private readonly readers: Record<
    "eip155:84532" | "eip155:8453",
    {
      receipt(hash: Hash): Promise<{
        status: "success" | "reverted";
        blockHash: Hash;
      }>;
      blockTimestamp(blockHash: Hash): Promise<bigint>;
      authorizationLogs(input: {
        asset: Address;
        authorizer: Address;
        nonce: Hash;
      }): Promise<
        Array<{ transactionHash: Hash | null; blockHash: Hash | null }>
      >;
    }
  >;

  constructor(options: { sepoliaRpcUrl: string; mainnetRpcUrl: string }) {
    const sepolia = createPublicClient({
      chain: baseSepolia,
      transport: http(options.sepoliaRpcUrl),
    });
    const mainnet = createPublicClient({
      chain: base,
      transport: http(options.mainnetRpcUrl),
    });
    const reader = (client: typeof sepolia | typeof mainnet) => ({
      receipt: async (hash: Hash) => {
        const receipt = await client.getTransactionReceipt({ hash });
        return { status: receipt.status, blockHash: receipt.blockHash };
      },
      blockTimestamp: async (blockHash: Hash) =>
        (await client.getBlock({ blockHash })).timestamp,
      authorizationLogs: async (input: {
        asset: Address;
        authorizer: Address;
        nonce: Hash;
      }) => {
        const logs = await client.getLogs({
          address: input.asset,
          event: authorizationUsedEvent,
          args: { authorizer: input.authorizer, nonce: input.nonce },
          fromBlock: 0n,
          toBlock: "latest",
          strict: true,
        });
        return logs.map((log) => ({
          transactionHash: log.transactionHash,
          blockHash: log.blockHash,
        }));
      },
    });
    this.readers = {
      "eip155:84532": reader(sepolia),
      "eip155:8453": reader(mainnet),
    };
  }

  private reader(network: string) {
    if (network === "eip155:84532" || network === "eip155:8453") {
      return this.readers[network];
    }
    throw new Error("UNSUPPORTED_SETTLEMENT_NETWORK");
  }

  async receipt(
    transactionHash: `0x${string}`,
    network: string,
  ): Promise<{
    state: "confirmed" | "reverted" | "not_found";
    confirmedAt?: string;
  }> {
    const reader = this.reader(network);
    try {
      const receipt = await reader.receipt(transactionHash as Hash);
      if (receipt.status !== "success") return { state: "reverted" };
      const timestamp = await reader.blockTimestamp(receipt.blockHash);
      return {
        state: "confirmed",
        confirmedAt: new Date(Number(timestamp) * 1_000).toISOString(),
      };
    } catch (error) {
      if (
        error instanceof Error &&
        /not found|could not be found/i.test(error.message)
      ) {
        return { state: "not_found" };
      }
      throw error;
    }
  }

  async confirm(
    transactionHash: `0x${string}`,
    network: string,
  ): Promise<{
    confirmed: boolean;
    confirmedAt?: string;
  }> {
    const receipt = await this.receipt(transactionHash, network);
    return receipt.state === "confirmed"
      ? { confirmed: true, confirmedAt: receipt.confirmedAt }
      : { confirmed: false };
  }

  async authorizationUsed(input: {
    network: string;
    asset: string;
    authorizer: `0x${string}`;
    nonce: `0x${string}`;
  }): Promise<
    | { used: false }
    | {
        used: true;
        transactionHash: `0x${string}`;
        confirmedAt: string;
      }
  > {
    const reader = this.reader(input.network);
    const logs = await reader.authorizationLogs({
      asset: input.asset as Address,
      authorizer: input.authorizer as Address,
      nonce: input.nonce as Hash,
    });
    const log = logs.at(-1);
    if (!log?.transactionHash || !log.blockHash) return { used: false };
    const timestamp = await reader.blockTimestamp(log.blockHash);
    return {
      used: true,
      transactionHash: log.transactionHash,
      confirmedAt: new Date(Number(timestamp) * 1_000).toISOString(),
    };
  }
}
