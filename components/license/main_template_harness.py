#!/usr/bin/env python3
"""
Behavioral harness for components/license/main.py.template, run by hooks/useGroupLicensing.test.tsx.

Executes the real template functions against an in-memory fake of the Admin SDK Directory API and the
Discovery Engine license APIs. The fake applies license writes to its own state and enforces seat limits,
so operation polling, end-state verification, seat accounting, and the safety guards are exercised for real.
Nothing here touches the network. Exit code is non-zero if any check fails.
"""
import contextlib
import io
import json
import os
import sys
import textwrap
import traceback
import types
import urllib.parse
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, "main.py.template")

# --- Stub flask and google.auth so the template loads without those packages installed ---
flask_mod = types.ModuleType("flask")


class _DummyFlask:
    def __init__(self, name):
        self.name = name

    def route(self, *args, **kwargs):
        def dec(f):
            return f

        return dec


flask_mod.Flask = _DummyFlask
flask_mod.request = None
flask_mod.jsonify = lambda x: x
google_mod = types.ModuleType("google")
auth_mod = types.ModuleType("google.auth")
auth_mod.default = lambda scopes=None: (None, "proj")
transport_mod = types.ModuleType("google.auth.transport")
treq_mod = types.ModuleType("google.auth.transport.requests")
treq_mod.AuthorizedSession = object
google_mod.auth = auth_mod
auth_mod.transport = transport_mod
transport_mod.requests = treq_mod
sys.modules.update({
    "flask": flask_mod,
    "google": google_mod,
    "google.auth": auth_mod,
    "google.auth.transport": transport_mod,
    "google.auth.transport.requests": treq_mod,
})

try:
    import requests

    NetworkTimeout = requests.exceptions.ReadTimeout
except ImportError:  # the template then retries built-in TimeoutError, so the check stays meaningful
    NetworkTimeout = TimeoutError

BASE = "https://discoveryengine.googleapis.com/v1"
PARENT = "projects/my-proj/locations/global/userStores/default_user_store"
TIER = "SUBSCRIPTION_TIER_ENTERPRISE"
CFG = f"projects/180054373655/locations/global/licenseConfigs/{TIER}"
GROUP = "eng@example.com"
FILTER_QS = "filter=" + urllib.parse.quote("licenseAssignmentState = ASSIGNED", safe="")


def load_ns(**overrides):
    with open(TEMPLATE, encoding="utf-8") as f:
        code = f.read()
    ns = {"__name__": "group_licensing_harness"}
    exec(compile(code, "main.py.template", "exec"), ns)
    sleeps = []
    ns.update({
        "PROJECT_ID": "my-proj",
        "PROJECT_NUMBER": "180054373655",
        "LOCATION": "global",
        "RETRY_BASE_DELAY_SECONDS": 0.0,
        "LRO_POLL_INTERVAL_SECONDS": 0.0,
        "_sleep": sleeps.append,
        "_SLEEPS": sleeps,
    })
    ns.update(overrides)
    return ns


class Resp:
    def __init__(self, status, data, headers=None):
        self.status_code = status
        self._data = data
        self.text = data if isinstance(data, str) else json.dumps(data)
        self.headers = headers or {}

    def json(self):
        if isinstance(self._data, str):
            raise ValueError("body is not JSON")
        return self._data


def assigned(principal, config=CFG):
    return {"userPrincipal": principal, "licenseAssignmentState": "ASSIGNED", "licenseConfig": config}


def users(n, prefix="user"):
    return [f"{prefix}{i:05d}@example.com" for i in range(n)]


def config_for(groups, tier=TIER, project="my-proj"):
    return {"projects": {project: [{"subscription_tier": tier, "location": "global", "groups": groups}]}}


class FakeGoogle:
    """Stateful fake of the Directory members API and the Discovery Engine license APIs."""

    def __init__(self, groups=None, licenses=None, configs=None, *, pollable=True, reject_filter=False,
                 op_error_chunks=(), polls_until_done=1, hooks=None, config_json=None):
        self.groups = {k.lower(): list(v) for k, v in (groups or {}).items()}
        self.licenses = {r["userPrincipal"].lower(): dict(r) for r in (licenses or [])}
        self.configs = configs if configs is not None else {TIER: {"licenseCount": "100000", "state": "ACTIVE"}}
        self.pollable = pollable
        self.reject_filter = reject_filter
        self.op_error_chunks = set(op_error_chunks)
        self.polls_until_done = polls_until_done
        self.hooks = hooks or []
        self.config_json = config_json
        self.ops = {}
        self.outstanding = set()
        self.max_outstanding_at_submit = 0
        self.calls = {k: 0 for k in ("dir", "ul_list", "usage", "config_get", "batch", "op_poll", "gcs", "other")}
        self.urls = []
        self.payloads = []
        self.headers = {}

    def used(self, config_id):
        return sum(
            1 for r in self.licenses.values()
            if r.get("licenseAssignmentState") == "ASSIGNED" and (r.get("licenseConfig") or "").split("/")[-1] == config_id
        )

    def state_of(self, principal):
        return self.licenses.get(principal.lower(), {}).get("licenseAssignmentState")

    def _hooked(self, method, url, payload=None):
        for hook in self.hooks:
            result = hook(method, url, self, payload)
            if result is not None:
                return result
        return None

    def get(self, url, timeout=None):
        self.urls.append(("GET", url))
        hooked = self._hooked("get", url)
        if hooked is not None:
            return hooked
        parsed = urllib.parse.urlparse(url)
        path, query = parsed.path, urllib.parse.parse_qs(parsed.query)
        if parsed.netloc == "storage.googleapis.com":
            self.calls["gcs"] += 1
            return Resp(200, self.config_json)
        if "/admin/directory/v1/groups/" in path and path.endswith("/members"):
            self.calls["dir"] += 1
            group = urllib.parse.unquote(path.split("/groups/")[1].rsplit("/members", 1)[0]).lower()
            if group not in self.groups:
                return Resp(404, {"error": {"code": 404, "message": "Resource Not Found: groupKey"}})
            members = self.groups[group]
            size = min(int(query.get("maxResults", ["200"])[0]), 200)
            start = int(query.get("pageToken", ["0"])[0])
            body = {"members": [m if isinstance(m, dict) else {"email": m, "type": "USER"} for m in members[start:start + size]]}
            if start + size < len(members):
                body["nextPageToken"] = str(start + size)
            return Resp(200, body)
        if path.endswith("/licenseConfigsUsageStats"):
            self.calls["usage"] += 1
            ids = sorted({(r.get("licenseConfig") or "").split("/")[-1] for r in self.licenses.values()} - {""})
            return Resp(200, {"licenseConfigUsageStats": [
                {"licenseConfig": f"projects/180054373655/locations/global/licenseConfigs/{cid}", "usedLicenseCount": str(self.used(cid))}
                for cid in ids
            ]})
        if "/licenseConfigs/" in path:
            self.calls["config_get"] += 1
            config_id = path.rsplit("/", 1)[-1]
            if config_id not in self.configs:
                return Resp(404, {"error": {"code": 404, "message": "LicenseConfig not found"}})
            return Resp(200, dict(self.configs[config_id], name=f"projects/180054373655/locations/global/licenseConfigs/{config_id}"))
        if path.endswith("/userLicenses"):
            self.calls["ul_list"] += 1
            flt = query.get("filter", [None])[0]
            if flt is not None and self.reject_filter:
                return Resp(400, {"error": {"code": 400, "message": "Invalid filter"}})
            records = sorted(self.licenses.values(), key=lambda r: r["userPrincipal"].lower())
            if flt is not None:
                if flt != "licenseAssignmentState = ASSIGNED":
                    return Resp(400, {"error": {"code": 400, "message": f"Unexpected filter {flt!r}"}})
                records = [r for r in records if r.get("licenseAssignmentState") == "ASSIGNED"]
            size = min(int(query.get("pageSize", ["100"])[0]), 1000)
            start = int(query.get("pageToken", ["0"])[0])
            body = {"userLicenses": [dict(r) for r in records[start:start + size]]}
            if start + size < len(records):
                body["nextPageToken"] = str(start + size)
            return Resp(200, body)
        if "/operations/" in path:
            self.calls["op_poll"] += 1
            if not self.pollable:
                return Resp(404, {"error": {"code": 404, "message": "Method not found."}})
            name = path.split("/v1/", 1)[1]
            entry = self.ops.get(name)
            if entry is None:
                return Resp(404, {"error": {"code": 404, "message": "Operation not found"}})
            if entry["remaining"] > 1:
                entry["remaining"] -= 1
                return Resp(200, {"name": name, "done": False})
            self.outstanding.discard(name)
            return Resp(200, entry["final"])
        self.calls["other"] += 1
        return Resp(404, {})

    def post(self, url, json=None, timeout=None):
        self.urls.append(("POST", url))
        hooked = self._hooked("post", url, json)
        if hooked is not None:
            return hooked
        if not url.endswith(":batchUpdateUserLicenses"):
            self.calls["other"] += 1
            return Resp(404, {})
        self.calls["batch"] += 1
        chunk = self.calls["batch"]
        self.payloads.append(json)
        self.max_outstanding_at_submit = max(self.max_outstanding_at_submit, len(self.outstanding))
        name = f"{PARENT}/operations/batch-update-user-licenses-{chunk}"
        if chunk in self.op_error_chunks:
            final = {"name": name, "done": True, "error": {"code": 13, "message": f"Internal error processing chunk {chunk}"}}
        else:
            success, failures = 0, []
            # Seats in use, maintained incrementally while this batch is applied.
            in_use = Counter(
                (r.get("licenseConfig") or "").split("/")[-1]
                for r in self.licenses.values()
                if r.get("licenseAssignmentState") == "ASSIGNED"
            )
            for update in json["inlineSource"]["userLicenses"]:
                principal = update["userPrincipal"]
                key = principal.lower()
                config_name = update.get("licenseConfig")
                current = self.licenses.get(key, {})
                current_id = ""
                if current.get("licenseAssignmentState") == "ASSIGNED":
                    current_id = (current.get("licenseConfig") or "").split("/")[-1]
                if not config_name:
                    record = dict(current or {"userPrincipal": principal})
                    record["licenseAssignmentState"] = "NO_LICENSE"
                    record.pop("licenseConfig", None)
                    self.licenses[key] = record
                    if current_id:
                        in_use[current_id] -= 1
                    success += 1
                    continue
                config_id = config_name.split("/")[-1]
                license_config = self.configs.get(config_id)
                if license_config is None or license_config.get("state", "ACTIVE") != "ACTIVE":
                    failures.append({"code": 9, "message": f"License config {config_id} is not usable for {principal}"})
                    continue
                if current_id != config_id:
                    if in_use[config_id] >= int(license_config["licenseCount"]):
                        failures.append({"code": 9, "message": f"No licenses left in {config_id} for {principal}"})
                        continue
                    if current_id:
                        in_use[current_id] -= 1
                    in_use[config_id] += 1
                self.licenses[key] = assigned(principal, config_name)
                success += 1
            final = {
                "name": name,
                "done": True,
                "metadata": {"successCount": str(success), "failureCount": str(len(failures))},
                "response": {"errorSamples": failures[:10]},
            }
        self.ops[name] = {"final": final, "remaining": self.polls_until_done}
        self.outstanding.add(name)
        return Resp(200, {"name": name, "done": False, "metadata": {
            "@type": "type.googleapis.com/google.cloud.discoveryengine.v1.BatchUpdateUserLicensesMetadata"}})

    def assigned_principals(self):
        return sorted(p for p, r in self.licenses.items() if r.get("licenseAssignmentState") == "ASSIGNED")


def expect_raises(exc_type, fn, *args, **kwargs):
    try:
        fn(*args, **kwargs)
    except exc_type as exc:  # the expected failure path; returned so the caller can assert on it
        return exc
    raise AssertionError(f"expected {exc_type.__name__} to be raised")


TESTS = []


def check(name):
    def register(fn):
        TESTS.append((name, fn))
        return fn

    return register


# ----------------------------------------------------------------------------------------------------------
@check("get_highest_tier honors precedence, falls back for custom LicenseConfig IDs, and handles empty input")
def t_highest_tier():
    ns = load_ns()
    assert ns["get_highest_tier"]({"SUBSCRIPTION_TIER_SEARCH", "SUBSCRIPTION_TIER_ENTERPRISE"}) == "SUBSCRIPTION_TIER_ENTERPRISE"
    assert ns["get_highest_tier"]({"custom-license-cfg-id-123"}) == "custom-license-cfg-id-123"
    assert ns["get_highest_tier"](set()) is None


@check("list_group_members: derived membership, maxResults=200, URL-encoding, USER-only, no service accounts, lowercase, dedupe, 429 retried")
def t_list_members():
    ns = load_ns()
    state = {"first": True}

    def transient_429(method, url, fake, payload):
        if method == "get" and "/members" in url and state["first"]:
            state["first"] = False
            return Resp(429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED"}})
        return None

    fake = FakeGoogle(groups={"eng team@example.com": [
        {"email": "Alice@Example.com ", "type": "USER"},
        {"email": "NewJoiner@Example.com", "type": "USER"},
        {"email": "alice@example.com", "type": "USER"},
        {"email": "nested-group@example.com", "type": "GROUP"},
        {"email": "license-grouper-sa@my-proj.iam.gserviceaccount.com", "type": "USER"},
    ]}, hooks=[transient_429])
    members = ns["list_group_members"](fake, "eng team@example.com")
    assert members == ["alice@example.com", "newjoiner@example.com"], members
    member_urls = [u for m, u in fake.urls if "/members" in u]
    assert len(member_urls) == 2, f"expected one 429 retry then success, got {len(member_urls)} calls"
    assert "includeDerivedMembership=true" in member_urls[0] and "maxResults=200" in member_urls[0]
    assert "eng%20team%40example.com" in member_urls[0]


@check("adder diffing: skips users already on the right tier, polls the operation, verifies the end state")
def t_adder_diffing():
    ns = load_ns()
    fake = FakeGoogle(groups={GROUP: ["alice@example.com", "newjoiner@example.com"]},
                      licenses=[assigned("alice@example.com")])
    summary = ns["run_adder"](fake, BASE, PARENT, config_for([GROUP]))
    assert fake.calls["batch"] == 1
    assert fake.payloads[0]["inlineSource"]["userLicenses"] == [{"userPrincipal": "newjoiner@example.com", "licenseConfig": CFG}]
    assert fake.calls["op_poll"] >= 1, "operation was never polled"
    assert summary["alreadyCorrect"] == 1 and summary["plannedAssignments"] == 1
    assert summary["write"]["succeeded"] == 1 and summary["verification"]["missingAssignments"] == 0
    assert fake.state_of("newjoiner@example.com") == "ASSIGNED"
    return f"polls={fake.calls['op_poll']}, verification reads={fake.calls['ul_list'] - 1}"


@check("adder leaves licenses on unmanaged tiers alone by default; OVERRIDE_UNMANAGED_ASSIGNMENTS replaces them")
def t_unmanaged_tier():
    vip_cfg = "projects/180054373655/locations/global/licenseConfigs/vip-manual-tier"
    ns = load_ns()
    fake = FakeGoogle(groups={GROUP: ["vip@example.com"]}, licenses=[assigned("vip@example.com", vip_cfg)])
    summary = ns["run_adder"](fake, BASE, PARENT, config_for([GROUP]))
    assert fake.calls["batch"] == 0 and summary["skippedUnmanaged"] == 1
    assert fake.licenses["vip@example.com"]["licenseConfig"] == vip_cfg

    ns = load_ns(OVERRIDE_UNMANAGED_ASSIGNMENTS=True)
    fake = FakeGoogle(groups={GROUP: ["vip@example.com"]}, licenses=[assigned("vip@example.com", vip_cfg)])
    ns["run_adder"](fake, BASE, PARENT, config_for([GROUP]))
    assert fake.licenses["vip@example.com"]["licenseConfig"] == CFG


@check("seat pre-check assigns only the available seats (deterministic order) and fails the run listing who was left out")
def t_seat_precheck():
    ns = load_ns()
    members = users(10)
    fake = FakeGoogle(groups={GROUP: members}, configs={TIER: {"licenseCount": "7", "state": "ACTIVE"}})
    err = expect_raises(ns["LicenseSyncError"], ns["run_adder"], fake, BASE, PARENT, config_for([GROUP]))
    sent = [u["userPrincipal"] for p in fake.payloads for u in p["inlineSource"]["userLicenses"]]
    assert sent == members[:7], sent
    assert "Seat shortfall" in str(err) and "needed 10, available 7" in str(err) and members[7] in str(err), str(err)
    assert err.summary["seatShortfalls"][0]["skipped"] == 3
    assert fake.assigned_principals() == sorted(members[:7])
    return "7 of 10 assigned, run failed with shortfall"


@check("a non-ACTIVE license config blocks its assignments before any write and fails the run")
def t_inactive_config():
    ns = load_ns()
    fake = FakeGoogle(groups={GROUP: users(3)}, configs={TIER: {"licenseCount": "100", "state": "EXPIRED"}})
    err = expect_raises(ns["LicenseSyncError"], ns["run_adder"], fake, BASE, PARENT, config_for([GROUP]))
    assert fake.calls["batch"] == 0
    assert "license config state is EXPIRED" in str(err), str(err)


@check("per-user failures reported in the finished operation (failureCount, errorSamples) fail the run")
def t_operation_failure_count():
    ns = load_ns()

    def hide_config(method, url, fake, payload):
        if method == "get" and "/licenseConfigs/" in url and not url.endswith("UsageStats"):
            return Resp(404, {"error": {"code": 404}})
        return None

    fake = FakeGoogle(groups={GROUP: users(4)}, configs={TIER: {"licenseCount": "2", "state": "ACTIVE"}}, hooks=[hide_config])
    err = expect_raises(ns["LicenseSyncError"], ns["run_adder"], fake, BASE, PARENT, config_for([GROUP]))
    assert "2 of 4 user license update(s) failed" in str(err) and "No licenses left" in str(err), str(err)
    assert any("seat pre-check skipped" in w for w in err.summary["warnings"]), err.summary["warnings"]
    assert err.summary["write"]["failed"] == 2 and err.summary["verification"]["missingAssignments"] == 2


@check("operation-level errors are reported per chunk while the remaining chunks still run (polled and immediate)")
def t_operation_errors():
    ns = load_ns(BATCH_SIZE=2)
    fake = FakeGoogle(groups={GROUP: users(5)}, op_error_chunks={1})
    err = expect_raises(ns["LicenseSyncError"], ns["run_adder"], fake, BASE, PARENT, config_for([GROUP]))
    assert fake.calls["batch"] == 3, fake.calls
    assert "chunk 1 returned LRO error" in str(err), str(err)
    assert len(fake.assigned_principals()) == 3

    ns = load_ns()
    state = {"posts": 0}

    def immediate_error(method, url, fake, payload):
        if method == "post":
            state["posts"] += 1
            if state["posts"] == 1:
                return Resp(200, {"error": {"code": 7, "message": "Quota exceeded for chunk 1"}})
        return None

    fake = FakeGoogle(hooks=[immediate_error])
    revocations = [{"userPrincipal": f"user{i}@example.com"} for i in range(150)]
    err = expect_raises(ns["LicenseSyncError"], ns["batch_update_licenses"], fake, BASE, PARENT, revocations)
    assert "chunk 1 returned LRO error" in str(err) and state["posts"] == 2, (str(err), state)


@check("operations that cannot be polled fall back to end-state verification (success path)")
def t_unpollable_success():
    ns = load_ns(BATCH_SIZE=2)
    fake = FakeGoogle(groups={GROUP: users(5)}, pollable=False)
    summary = ns["run_adder"](fake, BASE, PARENT, config_for([GROUP]))
    assert summary["write"]["unverifiedChunks"] == 3 and summary["verification"]["missingAssignments"] == 0
    assert len(fake.assigned_principals()) == 5


@check("operations that cannot be polled + silently failed writes are caught by end-state verification")
def t_unpollable_failure():
    ns = load_ns(VERIFY_MAX_ATTEMPTS=2)

    def hide_config(method, url, fake, payload):
        if method == "get" and "/licenseConfigs/" in url and not url.endswith("UsageStats"):
            return Resp(404, {"error": {"code": 404}})
        return None

    fake = FakeGoogle(groups={GROUP: users(4)}, configs={TIER: {"licenseCount": "3", "state": "ACTIVE"}},
                      pollable=False, hooks=[hide_config])
    err = expect_raises(ns["LicenseSyncError"], ns["run_adder"], fake, BASE, PARENT, config_for([GROUP]))
    assert "1 assignment(s) not visible after the verification window" in str(err), str(err)
    assert fake.calls["ul_list"] == 1 + 2, f"expected 1 planning read + 2 verification reads, got {fake.calls['ul_list']}"


@check("cleanup revokes only departed users on managed tiers and ignores never-licensed states (server-side ASSIGNED filter)")
def t_cleanup_states():
    ns = load_ns()
    fake = FakeGoogle(groups={GROUP: ["alice@example.com", "newjoiner@example.com"]}, licenses=[
        assigned("alice@example.com"),
        assigned("departed@example.com"),
        assigned("vip-manual@example.com", "projects/180054373655/locations/global/licenseConfigs/other-unmanaged-tier"),
        {"userPrincipal": "unassigned@example.com", "licenseAssignmentState": "NO_LICENSE"},
        {"userPrincipal": "attempted@example.com", "licenseAssignmentState": "NO_LICENSE_ATTEMPTED_LOGIN"},
        {"userPrincipal": "blocked@example.com", "licenseAssignmentState": "BLOCKED"},
    ])
    summary = ns["run_cleanup"](fake, BASE, PARENT, config_for([GROUP]))
    assert fake.calls["batch"] == 1
    assert fake.payloads[0]["inlineSource"]["userLicenses"] == [{"userPrincipal": "departed@example.com"}]
    assert fake.payloads[0]["deleteUnassignedUserLicenses"] is False
    assert any(FILTER_QS in u for m, u in fake.urls if "/userLicenses" in u), "ASSIGNED filter not sent"
    assert summary["managedLicenses"] == 2 and summary["plannedRevocations"] == 1
    assert fake.state_of("departed@example.com") == "NO_LICENSE"
    assert fake.state_of("attempted@example.com") == "NO_LICENSE_ATTEMPTED_LOGIN"
    assert fake.state_of("blocked@example.com") == "BLOCKED"


@check("cleanup falls back to an unfiltered listing with client-side filtering when the server rejects the filter")
def t_cleanup_filter_fallback():
    ns = load_ns()
    fake = FakeGoogle(groups={GROUP: ["alice@example.com"]}, reject_filter=True, licenses=[
        assigned("alice@example.com"),
        assigned("departed@example.com"),
        {"userPrincipal": "attempted@example.com", "licenseAssignmentState": "NO_LICENSE_ATTEMPTED_LOGIN"},
    ])
    ns["run_cleanup"](fake, BASE, PARENT, config_for([GROUP]))
    assert fake.payloads[0]["inlineSource"]["userLicenses"] == [{"userPrincipal": "departed@example.com"}]
    assert any("/userLicenses" in u and "filter=" not in u for m, u in fake.urls), "no unfiltered fallback listing"


@check("cleanup fails closed with no configured groups or no configured tier (no writes)")
def t_cleanup_fail_closed():
    ns = load_ns()
    fake = FakeGoogle(licenses=[assigned("alice@example.com")])
    err = expect_raises(RuntimeError, ns["run_cleanup"], fake, BASE, PARENT, config_for([]))
    assert isinstance(err, ns["SafetyGuardError"]) and "Refusing to revoke all licenses" in str(err)
    no_tier = {"projects": {"my-proj": [{"location": "global", "groups": [GROUP]}]}}
    err = expect_raises(ns["SafetyGuardError"], ns["run_cleanup"], fake, BASE, PARENT, no_tier)
    assert "no subscription_tier is configured" in str(err)
    assert fake.calls["batch"] == 0


@check("cleanup refuses to run when a configured group returns 0 members (ALLOW_EMPTY_GROUPS opts out)")
def t_cleanup_empty_group():
    licenses = [assigned(u) for u in users(20)]
    ns = load_ns()
    fake = FakeGoogle(groups={GROUP: users(20), "empty@example.com": []}, licenses=licenses)
    err = expect_raises(ns["SafetyGuardError"], ns["run_cleanup"], fake, BASE, PARENT, config_for([GROUP, "empty@example.com"]))
    assert "empty@example.com" in str(err) and fake.calls["batch"] == 0

    ns = load_ns(ALLOW_EMPTY_GROUPS=True)
    fake = FakeGoogle(groups={GROUP: users(20), "empty@example.com": []}, licenses=licenses)
    summary = ns["run_cleanup"](fake, BASE, PARENT, config_for([GROUP, "empty@example.com"]))
    assert any("returned 0 members" in w for w in summary["warnings"]) and summary["plannedRevocations"] == 0


@check("cleanup refuses mass revocations above max(MIN_REVOCATION_ALLOWANCE, MAX_REVOCATION_PERCENT) and proceeds at the limit")
def t_cleanup_revocation_limit():
    licenses = [assigned(u) for u in users(100)]
    ns = load_ns(MIN_REVOCATION_ALLOWANCE=50, MAX_REVOCATION_PERCENT=5.0)
    fake = FakeGoogle(groups={GROUP: users(40)}, licenses=licenses)
    err = expect_raises(ns["SafetyGuardError"], ns["run_cleanup"], fake, BASE, PARENT, config_for([GROUP]))
    assert "60 revocations exceed the safety limit of 50" in str(err), str(err)
    assert fake.calls["batch"] == 0 and len(fake.assigned_principals()) == 100

    ns = load_ns(MIN_REVOCATION_ALLOWANCE=60, MAX_REVOCATION_PERCENT=5.0)
    fake = FakeGoogle(groups={GROUP: users(40)}, licenses=licenses)
    summary = ns["run_cleanup"](fake, BASE, PARENT, config_for([GROUP]))
    assert summary["plannedRevocations"] == 60 and len(fake.assigned_principals()) == 40
    return "60 > 50 blocked; 60 <= 60 applied"


@check("dry run reports planned assignments and revocations without writing")
def t_dry_run():
    ns = load_ns()
    fake = FakeGoogle(groups={GROUP: users(3)})
    summary = ns["run_adder"](fake, BASE, PARENT, config_for([GROUP]), dry_run=True)
    assert summary["dryRun"] is True and summary["plannedAssignments"] == 3 and fake.calls["batch"] == 0

    fake = FakeGoogle(groups={GROUP: ["alice@example.com"]}, licenses=[assigned("alice@example.com"), assigned("departed@example.com")])
    summary = ns["run_cleanup"](fake, BASE, PARENT, config_for([GROUP]), dry_run=True)
    assert summary["plannedRevocations"] == 1 and fake.calls["batch"] == 0
    assert fake.state_of("departed@example.com") == "ASSIGNED"


@check("network timeouts are retried instead of aborting the run")
def t_network_retry():
    ns = load_ns()
    state = {"attempts": 0}

    def flaky(method, url, fake, payload):
        if method == "get" and "/members" in url:
            state["attempts"] += 1
            if state["attempts"] == 2:
                raise NetworkTimeout("Read timed out. (read timeout=30)")
        return None

    fake = FakeGoogle(groups={GROUP: users(450)}, hooks=[flaky])
    summary = ns["run_adder"](fake, BASE, PARENT, config_for([GROUP]))
    assert state["attempts"] == 4, f"3 pages + 1 retry expected, got {state['attempts']}"
    assert summary["plannedAssignments"] == 450 and len(fake.assigned_principals()) == 450
    return f"exception type={NetworkTimeout.__module__}.{NetworkTimeout.__name__}"


@check("Directory 403 userRateLimitExceeded is retried; a real 403 PERMISSION_DENIED is not")
def t_403_handling():
    ns = load_ns()
    state = {"n": 0}

    def rate_limited_once(method, url, fake, payload):
        if method == "get" and "/members" in url and state["n"] == 0:
            state["n"] += 1
            return Resp(403, {"error": {"code": 403, "errors": [{"reason": "userRateLimitExceeded"}], "message": "Quota"}})
        return None

    fake = FakeGoogle(groups={GROUP: users(5)}, hooks=[rate_limited_once])
    assert len(ns["list_group_members"](fake, GROUP)) == 5

    attempts = {"n": 0}

    def denied(method, url, fake, payload):
        if method == "get" and "/members" in url:
            attempts["n"] += 1
            return Resp(403, {"error": {"code": 403, "status": "PERMISSION_DENIED", "message": "Not authorized"}})
        return None

    fake = FakeGoogle(groups={GROUP: users(5)}, hooks=[denied])
    expect_raises(PermissionError, ns["list_group_members"], fake, GROUP)
    assert attempts["n"] == 1, attempts


@check("Retry-After is honored, and exhausted rate-limit retries raise a quota error (not a permission error)")
def t_retry_after_and_exhaustion():
    ns = load_ns()
    state = {"n": 0}

    def retry_after_once(method, url, fake, payload):
        if method == "get" and "/members" in url and state["n"] == 0:
            state["n"] += 1
            return Resp(429, {"error": {"code": 429}}, headers={"Retry-After": "7"})
        return None

    ns["list_group_members"](FakeGoogle(groups={GROUP: users(2)}, hooks=[retry_after_once]), GROUP)
    assert 7.0 in ns["_SLEEPS"], ns["_SLEEPS"]

    ns = load_ns(MAX_HTTP_RETRIES=3)
    attempts = {"n": 0}

    def always_rate_limited(method, url, fake, payload):
        if method == "get" and "/members" in url:
            attempts["n"] += 1
            return Resp(403, {"error": {"code": 403, "errors": [{"reason": "quotaExceeded"}]}})
        return None

    err = expect_raises(RuntimeError, ns["list_group_members"], FakeGoogle(groups={GROUP: users(2)}, hooks=[always_rate_limited]), GROUP)
    assert not isinstance(err, PermissionError) and "quota/rate limit still exceeded" in str(err) and attempts["n"] == 4


@check("persistent network errors propagate after MAX_HTTP_RETRIES attempts")
def t_network_exhaustion():
    ns = load_ns(MAX_HTTP_RETRIES=2)
    attempts = {"n": 0}

    def always_down(method, url, fake, payload):
        attempts["n"] += 1
        raise NetworkTimeout("Read timed out.")

    expect_raises(NetworkTimeout, ns["list_group_members"], FakeGoogle(groups={GROUP: users(2)}, hooks=[always_down]), GROUP)
    assert attempts["n"] == 3, attempts


@check("a group referenced under both the project ID and project number keys is listed once")
def t_duplicate_group_keys():
    ns = load_ns()
    config = {"projects": {
        "my-proj": [{"subscription_tier": TIER, "location": "global", "groups": [GROUP]}],
        "180054373655": [{"subscription_tier": TIER, "location": "global", "groups": ["ENG@example.com"]}],
    }}
    fake = FakeGoogle(groups={GROUP: users(3)})
    ns["run_adder"](fake, BASE, PARENT, config)
    assert fake.calls["dir"] == 1, fake.calls


@check("stale groups under PROJECT_NUMBER or a prior subscription_tier are ignored when PROJECT_ID and SUBSCRIPTION_TIER are set")
def t_ignore_stale_project_number_and_tier_entries():
    ns = load_ns(SUBSCRIPTION_TIER="internal_gemini_ent_plus")
    config = {"projects": {
        "my-proj": [
            {"subscription_tier": "SUBSCRIPTION_TIER_ENTERPRISE", "location": "global", "groups": ["stale-tier-group@example.com"]},
            {"subscription_tier": "internal_gemini_ent_plus", "location": "global", "groups": ["active-group@example.com"]},
        ],
        "180054373655": [
            {"subscription_tier": "internal_gemini_ent_plus", "location": "global", "groups": ["stale-projnum-group@example.com"]},
        ],
    }}
    fake = FakeGoogle(
        groups={"active-group@example.com": users(2)},
        configs={"internal_gemini_ent_plus": {"licenseCount": "100", "state": "ACTIVE"}},
    )
    summary = ns["run_adder"](fake, BASE, PARENT, config)
    assert fake.calls["dir"] == 1, fake.calls
    assert summary["groupMemberCounts"] == {"active-group@example.com": 2}, summary["groupMemberCounts"]
    assert summary["plannedAssignments"] == 2



@check("at most MAX_INFLIGHT_OPERATIONS batch operations are unfinished when a new chunk is submitted")
def t_inflight_window():
    ns = load_ns(BATCH_SIZE=1, MAX_INFLIGHT_OPERATIONS=2)
    fake = FakeGoogle(groups={GROUP: users(6)}, polls_until_done=3)
    ns["run_adder"](fake, BASE, PARENT, config_for([GROUP]))
    assert fake.calls["batch"] == 6 and fake.max_outstanding_at_submit <= 1, fake.max_outstanding_at_submit
    assert len(fake.assigned_principals()) == 6


@check("an operation that never finishes is reported instead of hanging the run")
def t_lro_timeout():
    ns = load_ns(LRO_TIMEOUT_SECONDS=-1)
    fake = FakeGoogle(groups={GROUP: users(2)}, polls_until_done=10 ** 9)
    err = expect_raises(ns["LicenseSyncError"], ns["run_adder"], fake, BASE, PARENT, config_for([GROUP]))
    assert "did not finish within" in str(err), str(err)


@check("10,000-user group: O(pages) API calls, every operation polled, end state verified, steady state makes 0 writes")
def t_scale_10k():
    ns = load_ns()
    members = users(10_000)
    fake = FakeGoogle(groups={GROUP: members})
    summary = ns["run_adder"](fake, BASE, PARENT, config_for([GROUP]))
    assert fake.calls["dir"] == 50 and fake.calls["batch"] == 100 and fake.calls["op_poll"] >= 100, fake.calls
    assert summary["write"]["succeeded"] == 10_000 and summary["verification"]["missingAssignments"] == 0
    assert fake.calls["ul_list"] == 1 + 10, fake.calls  # planning read (empty store) + one 10-page verification read
    first = dict(fake.calls)
    for key in fake.calls:
        fake.calls[key] = 0
    summary = ns["run_adder"](fake, BASE, PARENT, config_for([GROUP]))
    assert fake.calls["batch"] == 0 and summary["alreadyCorrect"] == 10_000
    return f"first run: dir={first['dir']} batch={first['batch']} polls={first['op_poll']} license pages={first['ul_list']}"


@check("handle_trigger: 409 when busy, 200 with summary, 412 on a safety abort, 500 on incomplete sync, dryRun body honored")
def t_handle_trigger():
    class StubRequest:
        def __init__(self, body=None, args=None):
            self._body = body
            self.args = args or {}

        def get_json(self, silent=False):
            return self._body

    os.environ["CONFIG_GCS_URI"] = "gs://my-bucket/config/entitlements.json"

    def trigger(job_type, fake, body=None):
        out = io.StringIO()
        ns = load_ns(JOB_TYPE=job_type, request=StubRequest(body), AuthorizedSession=lambda creds: fake)
        with contextlib.redirect_stdout(out):
            resp = ns["handle_trigger"]()
        return ns, resp, out.getvalue()

    ns = load_ns()
    ns["_JOB_LOCK"].acquire()
    try:
        body, status = ns["handle_trigger"]()
        assert status == 409 and "already running" in body["message"]
    finally:
        ns["_JOB_LOCK"].release()

    fake = FakeGoogle(groups={GROUP: users(3)}, config_json=config_for([GROUP]))
    _, (body, status), stdout = trigger("adder", fake)
    assert status == 200 and body["summary"]["plannedAssignments"] == 3 and fake.headers.get("X-Goog-User-Project") == "my-proj"
    assert body["summary"]["assignedUsersSample"] == users(3) and body["summary"]["groupMemberCounts"] == {GROUP: 3}
    report_lines = [line for line in stdout.splitlines() if line.startswith("GROUP_LICENSING_REPORT_JSON: ")]
    assert len(report_lines) == 1, stdout
    parsed_report = json.loads(report_lines[0].split("GROUP_LICENSING_REPORT_JSON: ", 1)[1])
    assert parsed_report["status"] == "success" and parsed_report["httpStatus"] == 200
    assert parsed_report["summary"]["assignedUsersSample"] == users(3)

    fake = FakeGoogle(groups={GROUP: users(3)}, config_json=config_for([GROUP]))
    _, (body, status), _ = trigger("adder", fake, body={"dryRun": True})
    assert status == 200 and body["summary"]["dryRun"] is True and fake.calls["batch"] == 0

    # Cloud Run Functions inline editor (functions-framework) passes flask.Request as first positional arg
    ns_fn = load_ns(JOB_TYPE="adder", AuthorizedSession=lambda creds: fake)
    fn_body, fn_status = ns_fn["handle_trigger"](StubRequest({"dryRun": True}))
    assert fn_status == 200 and fn_body["summary"]["dryRun"] is True and fake.calls["batch"] == 0

    fake = FakeGoogle(groups={GROUP: [], "other@example.com": users(2)}, licenses=[assigned(u) for u in users(2)],
                      config_json=config_for([GROUP, "other@example.com"]))
    _, (body, status), stdout = trigger("cleanup", fake)
    assert status == 412 and body["status"] == "aborted" and fake.calls["batch"] == 0
    aborted_report = json.loads([l for l in stdout.splitlines() if l.startswith("GROUP_LICENSING_REPORT_JSON: ")][0].split("GROUP_LICENSING_REPORT_JSON: ", 1)[1])
    assert aborted_report["status"] == "aborted" and aborted_report["httpStatus"] == 412

    fake = FakeGoogle(groups={GROUP: users(5)}, configs={TIER: {"licenseCount": "2", "state": "ACTIVE"}},
                      config_json=config_for([GROUP]))
    _, (body, status), stdout = trigger("adder", fake)
    assert status == 500 and "Seat shortfall" in body["message"] and body["summary"]["seatShortfalls"][0]["skipped"] == 3
    err_report = json.loads([l for l in stdout.splitlines() if l.startswith("GROUP_LICENSING_REPORT_JSON: ")][0].split("GROUP_LICENSING_REPORT_JSON: ", 1)[1])
    assert err_report["status"] == "error" and err_report["httpStatus"] == 500


def main():
    passed = failed = 0
    for name, fn in TESTS:
        buf = io.StringIO()
        try:
            with contextlib.redirect_stdout(buf):
                detail = fn()
        except AssertionError as exc:  # a failed expectation: report it and keep running the remaining checks
            failed += 1
            print(f"[FAIL] {name}: {exc}")
            print(textwrap.indent(buf.getvalue()[-2000:], "    | "))
        except Exception:  # an unexpected error inside a check: report it as a failure with its traceback
            failed += 1
            print(f"[FAIL] {name}: unexpected exception")
            print(textwrap.indent(traceback.format_exc(), "    "))
            print(textwrap.indent(buf.getvalue()[-2000:], "    | "))
        else:
            passed += 1
            print(f"[PASS] {name}" + (f" ({detail})" if detail else ""))
    print(f"HARNESS: {passed} passed / {failed} failed / 0 skipped")
    if failed == 0:
        print("PYTHON_HARNESS_OK")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
