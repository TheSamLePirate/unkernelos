import { describe, it, expect } from "bun:test";
import { parseBrowserAddress } from "../src/core/browser-address.ts";
describe("OS browser address routing", () => {
  it("normalizes Internet URLs while preserving paths, queries and fragments", () => {
    expect(parseBrowserAddress("developer.mozilla.org/en-US/?a=1#top")).toEqual(
      {
        kind: "web",
        url: "https://developer.mozilla.org/en-US/?a=1#top",
        address: "https://developer.mozilla.org/en-US/?a=1#top",
      },
    );
    expect(parseBrowserAddress("http://host.localhost:8181/").kind).toBe("web");
  });
  it("routes localhost and guest shorthand to Linux without changing the guest path", () => {
    for (const url of [
      "http://localhost:3000/path?q=1#x",
      "127.0.0.1:3000/path?q=1#x",
      ":3000/path?q=1#x",
    ])
      expect(parseBrowserAddress(url)).toEqual({
        kind: "guest",
        port: 3000,
        path: "/path?q=1#x",
        address: "http://guest:3000/path?q=1#x",
      });
    expect(parseBrowserAddress("http://[::1]:8123/").kind).toBe("guest");
  });
  it("keeps executable schemes and URL credentials out of the browser bridge", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,hello",
      "file:///etc/passwd",
      "ftp://example.com",
      "https://user:secret@example.com",
    ])
      expect(() => parseBrowserAddress(url)).toThrow();
    expect(() => parseBrowserAddress("https://localhost:8443")).toThrow("HTTP");
    expect(parseBrowserAddress("about:blank").kind).toBe("home");
  });
});
