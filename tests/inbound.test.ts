import { describe, expect, it, beforeEach } from "vitest";
import { authorized, parseInbound } from "@/lib/inbound";

const req = (auth?: string) => new Request("https://x/api/inbound/email", { method: "POST", headers: auth ? { authorization: auth } : {} });
const basic = (s: string) => "Basic " + Buffer.from(s).toString("base64");

describe("webhook password", () => {
  beforeEach(() => { process.env.INBOUND_WEBHOOK_SECRET = "s3cret"; });
  it("accepts the password from https://postmark:s3cret@host", () => expect(authorized(req(basic("postmark:s3cret")))).toBe(true));
  it("rejects wrong or missing passwords", () => {
    expect(authorized(req(basic("postmark:nope")))).toBe(false);
    expect(authorized(req())).toBe(false);
  });
});

describe("Postmark payload", () => {
  const body = {
    From: "Agent <agent@clearrockrealty.com>", FromFull: { Email: "Agent@ClearRockRealty.com" }, Subject: "Fwd: Executed contract",
    To: "abc123+9f8e7d6c5b4a@inbound.postmarkapp.com",
    ToFull: [{ Email: "abc123+9f8e7d6c5b4a@inbound.postmarkapp.com", MailboxHash: "9f8e7d6c5b4a" }],
    Attachments: [{ Name: "contract.pdf", ContentType: "application/pdf", Content: "JVBERi0=" }],
  };
  it("reads the token from MailboxHash, sender lowercased, attachments", () => {
    const m = parseInbound(body);
    expect(m.token).toBe("9f8e7d6c5b4a");
    expect(m.from).toBe("agent@clearrockrealty.com");
    expect(m.attachments[0]).toMatchObject({ name: "contract.pdf", type: "application/pdf" });
  });
  it("falls back to the +token in a custom-domain address", () => {
    expect(parseInbound({ ...body, ToFull: [{ Email: "contracts+ABC123@inbound.clearrockrealty.com" }], To: undefined }).token).toBe("abc123");
  });
});
