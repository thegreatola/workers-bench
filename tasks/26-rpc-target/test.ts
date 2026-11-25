import { env } from "cloudflare:workers";
import { it, expect } from "vitest";
const BANK = (env as any).BANK as any;

it("deposit, withdraw and balance on one account", async () => {
  using acct = await BANK.open("ann");
  expect(await acct.owner()).toBe("ann");
  expect(await acct.balance()).toBe(0);
  expect(await acct.deposit(10)).toBe(10);
  expect(await acct.deposit(5.5)).toBe(15.5);
  expect(await acct.withdraw(3)).toBe(12.5);
  expect(await acct.balance()).toBe(12.5);
});
it("overdrafts are refused and change nothing", async () => {
  using acct = await BANK.open("bob");
  await acct.deposit(4);
  await expect(acct.withdraw(10)).rejects.toThrow(/insufficient funds/);
  expect(await acct.balance()).toBe(4);
});
it("bad amounts are refused", async () => {
  using acct = await BANK.open("cy");
  for (const a of [0, -5, Number.NaN]) await expect(acct.deposit(a)).rejects.toThrow(/invalid amount/);
  expect(await acct.balance()).toBe(0);
});
it("accounts are separate", async () => {
  using a = await BANK.open("dee");
  using b = await BANK.open("eli");
  await a.deposit(100);
  expect(await b.balance()).toBe(0);
  expect(await a.balance()).toBe(100);
});
