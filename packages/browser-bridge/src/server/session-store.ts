export interface BridgeDisplayRequest {
  invocationId: string;
  inputDigest: string;
  amount: string;
  payee: string;
  network: string;
  releaseId: string;
  dataDisclosure: string;
  paymentRequired: string;
}

export type BridgeSessionState = "pending" | "approved" | "rejected";

interface StoredSession {
  id: string;
  token: string;
  display: BridgeDisplayRequest;
  state: BridgeSessionState;
  expiresAt: number;
  paymentSignature?: string;
}

export interface BridgeSessionCompletion {
  state: "approved" | "rejected";
  paymentSignature?: string;
  reason?: "closed";
}

export class BridgeSessionError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "BridgeSessionError";
  }
}

function randomBase64Url(bytes: number): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function equalToken(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function exactDisplay(value: BridgeDisplayRequest): BridgeDisplayRequest {
  const allowed = [
    "invocationId",
    "inputDigest",
    "amount",
    "payee",
    "network",
    "releaseId",
    "dataDisclosure",
    "paymentRequired",
  ];
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new BridgeSessionError("UNSAFE_SESSION_FIELD");
  }
  for (const field of allowed) {
    if (typeof value[field as keyof BridgeDisplayRequest] !== "string") {
      throw new BridgeSessionError("INVALID_SESSION_DISPLAY");
    }
  }
  return { ...value };
}

export class SessionStore {
  private readonly sessions = new Map<string, StoredSession>();
  private readonly completions = new Map<
    string,
    (completion: BridgeSessionCompletion) => void
  >();
  readonly ttlMs: number;

  constructor(
    private readonly options: { now: () => number; ttlMs?: number } = {
      now: Date.now,
    },
  ) {
    this.ttlMs = options.ttlMs ?? 300_000;
  }

  create(display: BridgeDisplayRequest): {
    id: string;
    token: string;
    completion: Promise<BridgeSessionCompletion>;
  } {
    const id = randomBase64Url(16);
    const token = randomBase64Url(32);
    this.sessions.set(id, {
      id,
      token,
      display: exactDisplay(display),
      state: "pending",
      expiresAt: this.options.now() + this.ttlMs,
    });
    const completion = new Promise<BridgeSessionCompletion>((resolve) => {
      this.completions.set(id, resolve);
    });
    return { id, token, completion };
  }

  view(id: string): Readonly<StoredSession> {
    const session = this.sessions.get(id);
    if (!session) throw new BridgeSessionError("SESSION_NOT_FOUND");
    if (this.options.now() > session.expiresAt) {
      this.sessions.delete(id);
      throw new BridgeSessionError("SESSION_EXPIRED");
    }
    return session;
  }

  consume(
    id: string,
    token: string,
    state: Exclude<BridgeSessionState, "pending">,
    paymentSignature?: string,
  ): Readonly<StoredSession> {
    const session = this.view(id);
    if (session.state !== "pending") {
      throw new BridgeSessionError("SESSION_ALREADY_CONSUMED");
    }
    if (!equalToken(token, session.token)) {
      throw new BridgeSessionError("INVALID_SESSION_TOKEN");
    }
    const completed = { ...session, state, paymentSignature };
    this.completions.get(id)?.({
      state,
      ...(paymentSignature ? { paymentSignature } : {}),
    });
    this.completions.delete(id);
    this.sessions.delete(id);
    return completed;
  }

  close(id: string): void {
    this.completions.get(id)?.({ state: "rejected", reason: "closed" });
    this.completions.delete(id);
    this.sessions.delete(id);
  }

  destroyAll(): void {
    for (const id of this.sessions.keys()) this.close(id);
  }
}
