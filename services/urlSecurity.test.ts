// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  getSecureHostname,
  isGoogleApiEndpoint,
  isGoogleHostedRuntime,
  mayReceiveGoogleCredentials,
  buildValidatedUrl,
} from "./urlSecurity";

/**
 * These are the exact payloads that defeated the previous
 * `url.includes(".run.app")` check. Each one must be rejected.
 */
const BYPASS_VECTORS = [
  "https://untrusted.example.com/.run.app",
  "https://untrusted.example.com/path/.run.app",
  "https://untrusted.example.com/?redirect=.run.app",
  "https://untrusted.example.com/#.run.app",
  "https://untrusted.example.com/.googleapis.com",
  "https://untrusted.example.com/?x=.cloudfunctions.net",
  "https://run.app.untrusted.example.com",
  "https://googleapis.com.untrusted.example.com",
  "https://notreally-run.app.untrusted.example.com",
];

describe("getSecureHostname", () => {
  it("rejects non-HTTPS schemes, which would expose the token in cleartext", () => {
    expect(getSecureHostname("http://foo.run.app")).toBeNull();
    expect(getSecureHostname("ftp://foo.run.app")).toBeNull();
  });

  it("rejects javascript: and data: URIs", () => {
    expect(getSecureHostname("javascript:alert(1)")).toBeNull();
    expect(getSecureHostname("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects embedded credentials used to disguise the real host", () => {
    expect(getSecureHostname("https://user:pass@foo.run.app")).toBeNull();
    expect(getSecureHostname("https://trusted.run.app@untrusted.example.com")).toBeNull();
  });

  it("rejects malformed, empty and non-string input", () => {
    expect(getSecureHostname("")).toBeNull();
    expect(getSecureHostname("not a url")).toBeNull();
    expect(getSecureHostname("//foo.run.app")).toBeNull();
    // Note: no @ts-expect-error needed -- tsconfig has `strict: false`, so
    // `null`/`undefined` are assignable to `string`. That is precisely why the
    // runtime guard in getSecureHostname exists rather than relying on types.
    expect(getSecureHostname(null as unknown as string)).toBeNull();
    expect(getSecureHostname(undefined as unknown as string)).toBeNull();
  });

  it("normalizes case and the trailing fully-qualified dot", () => {
    expect(getSecureHostname("https://FOO.RUN.APP")).toBe("foo.run.app");
    expect(getSecureHostname("https://foo.run.app.")).toBe("foo.run.app");
  });
});

describe("mayReceiveGoogleCredentials", () => {
  it.each(BYPASS_VECTORS)("rejects the bypass vector %s", (url) => {
    expect(mayReceiveGoogleCredentials(url)).toBe(false);
  });

  it("accepts genuine Google API hosts", () => {
    expect(mayReceiveGoogleCredentials("https://discoveryengine.googleapis.com/v1/x")).toBe(true);
    expect(mayReceiveGoogleCredentials("https://storage.googleapis.com/bucket")).toBe(true);
  });

  it("accepts genuine Google-hosted runtimes in both Cloud Run URL formats", () => {
    // Legacy format: <service>-<project-hash>-<region-code>.a.run.app
    expect(mayReceiveGoogleCredentials("https://svc-abc123-uc.a.run.app/mcp")).toBe(true);
    // Current format: <service>-<project-number>.<region>.run.app
    expect(
      mayReceiveGoogleCredentials("https://oracle-mcp-server-123456789012.us-central1.run.app/mcp"),
    ).toBe(true);
    expect(mayReceiveGoogleCredentials("https://fn-uc.cloudfunctions.net/handler")).toBe(true);
  });

  it("does not treat the bare apex domains as trusted", () => {
    expect(mayReceiveGoogleCredentials("https://run.app")).toBe(false);
    expect(mayReceiveGoogleCredentials("https://cloudfunctions.net")).toBe(false);
  });

  it("requires HTTPS even for otherwise-trusted hosts", () => {
    expect(mayReceiveGoogleCredentials("http://svc-abc123-uc.a.run.app")).toBe(false);
    expect(mayReceiveGoogleCredentials("http://discoveryengine.googleapis.com")).toBe(false);
  });
});

describe("isGoogleApiEndpoint vs isGoogleHostedRuntime", () => {
  it("keeps first-party APIs distinct from customer-deployable runtimes", () => {
    // This distinction matters: *.run.app is deployable by ANY GCP customer,
    // so callers may want to apply stricter consent there.
    expect(isGoogleApiEndpoint("https://bigquery.googleapis.com")).toBe(true);
    expect(isGoogleHostedRuntime("https://bigquery.googleapis.com")).toBe(false);

    expect(isGoogleApiEndpoint("https://x-uc.a.run.app")).toBe(false);
    expect(isGoogleHostedRuntime("https://x-uc.a.run.app")).toBe(true);
  });
});

describe("buildValidatedUrl", () => {
  it("returns null rather than building a URL against an invalid origin", () => {
    expect(buildValidatedUrl("http://untrusted.example.com", "/invoke")).toBeNull();
    expect(buildValidatedUrl("not a url", "/invoke")).toBeNull();
    expect(buildValidatedUrl("", "/invoke")).toBeNull();
  });

  it("strips trailing slashes so the joined path is well formed", () => {
    expect(buildValidatedUrl("https://svc-uc.a.run.app/", "/invoke")).toBe(
      "https://svc-uc.a.run.app/invoke",
    );
    expect(buildValidatedUrl("https://svc-uc.a.run.app///", "/invoke")).toBe(
      "https://svc-uc.a.run.app/invoke",
    );
  });

  it("permits any HTTPS origin -- trust is the caller's separate decision", () => {
    // buildValidatedUrl only guarantees a well-formed HTTPS URL. Deciding
    // whether to attach credentials is mayReceiveGoogleCredentials' job.
    expect(buildValidatedUrl("https://self-hosted.example.com", "/invoke")).toBe(
      "https://self-hosted.example.com/invoke",
    );
  });
});
