export class FakeChain {
  private readonly authorizations = new Set<string>();

  recordAuthorizationUsed(paymentIdentifier: string): void {
    this.authorizations.add(paymentIdentifier);
  }

  hasAuthorizationUsed(paymentIdentifier: string): boolean {
    return this.authorizations.has(paymentIdentifier);
  }
}
