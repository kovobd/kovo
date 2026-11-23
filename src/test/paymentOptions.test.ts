import { describe, it, expect } from "vitest";
import { resolvePaymentOptions, validateMethods, normalizeMethods } from "@/lib/checkoutOptions";

const m = (o: any) => ({ id: o.name.toLowerCase(), type: "online", description: "", receiver_number: "", logo: "", show_instructions: false, instructions: "", enabled: true, is_default: false, ...o });

describe("payment methods", () => {
  it("hides disabled methods and keeps admin order", () => {
    const r = resolvePaymentOptions([m({ name: "Nagad" }), m({ name: "COD", type: "cod", enabled: false }), m({ name: "bKash" })]);
    expect(r.methods.map((x) => x.id)).toEqual(["nagad", "bkash"]);
  });
  it("preselects the default method", () => {
    expect(resolvePaymentOptions([m({ name: "COD", type: "cod" }), m({ name: "bKash", is_default: true })]).defaultId).toBe("bkash");
  });
  it("falls back to first enabled when the default is off", () => {
    expect(resolvePaymentOptions([m({ name: "COD", is_default: true, enabled: false }), m({ name: "bKash" })]).defaultId).toBe("bkash");
  });
  it("offers Cash on Delivery when nothing is enabled", () => {
    expect(resolvePaymentOptions([m({ name: "bKash", enabled: false })]).methods.map((x) => x.id)).toEqual(["cod"]);
  });
  it("only shows instructions when switched on", () => {
    const r = resolvePaymentOptions([m({ name: "A", instructions: "x" }), m({ name: "B", instructions: "y", show_instructions: true })]);
    expect(r.methods.map((x) => x.instructions)).toEqual(["", "y"]);
  });
  it("drops receiver number for cash on delivery", () => {
    expect(normalizeMethods([m({ name: "COD", type: "cod", receiver_number: "01700000000" })])[0].receiver_number).toBe("");
  });
  it("requires a name", () => {
    expect(validateMethods([m({ name: " " })])).toMatch(/needs a name/);
  });
  it("rejects bad receiver numbers", () => {
    expect(validateMethods([m({ name: "bKash", receiver_number: "12345" })])).toMatch(/11-digit/);
    expect(validateMethods([m({ name: "bKash", receiver_number: "01712345678" })])).toBeNull();
  });
  it("requires at least one enabled method", () => {
    expect(validateMethods([m({ name: "bKash", enabled: false })])).toMatch(/at least one/);
  });
});
