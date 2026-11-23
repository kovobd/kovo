import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bumpStorefrontVersion, getStorefrontVersion } from "@/lib/storefrontCache";

describe("storefront content publishing", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("changes the public content version after each admin save", () => {
    vi.setSystemTime(new Date("2026-11-23T05:30:00.000Z"));
    const published: string[] = [];
    window.addEventListener("mvbd:storefront-version-bumped", (event) => {
      published.push((event as CustomEvent<string>).detail);
    });

    const first = bumpStorefrontVersion();
    vi.setSystemTime(new Date("2026-11-23T05:30:01.000Z"));
    const second = bumpStorefrontVersion();

    expect(second).not.toBe(first);
    expect(getStorefrontVersion()).toBe(second);
    expect(published).toEqual([first, second]);
  });
});
