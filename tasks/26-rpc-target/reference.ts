import { RpcTarget, WorkerEntrypoint } from "cloudflare:workers";
class Account extends RpcTarget {
  #balance = 0;
  constructor(private readonly name: string) { super(); }
  deposit(amount: number): number {
    if (typeof amount !== "number" || !(amount > 0)) throw new Error("invalid amount");
    return (this.#balance += amount);
  }
  withdraw(amount: number): number {
    if (typeof amount !== "number" || !(amount > 0)) throw new Error("invalid amount");
    if (amount > this.#balance) throw new Error("insufficient funds");
    return (this.#balance -= amount);
  }
  balance(): number { return this.#balance; }
  owner(): string { return this.name; }
}
export class Bank extends WorkerEntrypoint {
  open(owner: string): Account { return new Account(owner); }
}
export default {
  async fetch(): Promise<Response> { return new Response("not found", { status: 404 }); },
};
