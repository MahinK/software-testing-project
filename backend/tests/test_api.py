def make_requirement(client, **kw):
    body = {"title": "Withdraw cash", "module": "payments", **kw}
    r = client.post("/requirements", json=body)
    assert r.status_code == 201
    return r.json()


def test_generate_preview_does_not_persist(client):
    r = client.post(
        "/generate",
        json={"signature": "withdraw(amount)", "params": {"amount": {"min": 1, "max": 10000}}},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["function"] == "withdraw"
    assert len(body["cases"]) == 9
    assert all(c["test_case_id"] is None for c in body["cases"])
    assert client.get("/test-cases").json() == []


def test_generate_validates_param_specs(client):
    r = client.post(
        "/generate", json={"signature": "withdraw(amount)", "params": {"amt": {"min": 1, "max": 5}}}
    )
    assert r.status_code == 422
    assert r.json()["detail"] == {"missing_param_specs": ["amount"], "unknown_param_specs": ["amt"]}

    r = client.post(
        "/generate",
        json={"signature": "withdraw(amount)", "params": {"amount": {"min": 1, "max": 5}}, "persist": True},
    )
    assert r.status_code == 422


def test_full_verification_chain(client):
    req = make_requirement(client)
    assert req["code"] == "REQ-001"
    scenario = client.post(
        "/scenarios", json={"requirement_id": req["id"], "title": "Withdrawal limits"}
    ).json()

    gen = client.post(
        "/generate",
        json={
            "signature": "withdraw(amount)",
            "params": {"amount": {"min": 1, "max": 10000}},
            "persist": True,
            "requirement_id": req["id"],
            "scenario_id": scenario["id"],
            "priority": "P1",
        },
    ).json()
    codes = [c["code"] for c in gen["cases"]]
    assert codes[0] == "TC-001" and len(codes) == 9

    cases = client.get("/test-cases", params={"requirement_id": req["id"]}).json()
    assert {c["module"] for c in cases} == {"payments"}
    assert {c["status"] for c in cases} == {"Not Run"}

    # Everything passes except one boundary case.
    failing = next(c for c in cases if c["inputs"] == {"amount": 10001})
    for c in cases:
        if c["id"] != failing["id"]:
            client.post(f"/test-cases/{c['id']}/executions", json={"result": "Pass"})

    r = client.post(
        f"/test-cases/{failing['id']}/executions",
        json={"result": "Fail", "actual": "Accepted withdrawal of 10001"},
    )
    assert r.status_code == 201
    outcome = r.json()
    assert outcome["defect_created"] is True
    defect = outcome["defect"]
    assert defect["code"] == "BUG-001"
    assert defect["test_case_code"] == failing["code"]
    assert defect["severity"] == "High"  # derived from P1
    assert defect["expected"] == "Reject: withdraw(amount=10001)"
    assert defect["status"] == "Open"

    # A repeated failure reuses the open defect.
    again = client.post(f"/test-cases/{failing['id']}/executions", json={"result": "Fail"}).json()
    assert again["defect_created"] is False and again["defect"]["id"] == defect["id"]

    trace = client.get(f"/requirements/{req['id']}/trace").json()
    assert trace["verification_status"] == "FAILED"
    [s] = trace["scenarios"]
    traced = next(tc for tc in s["test_cases"] if tc["code"] == failing["code"])
    assert len(traced["executions"]) == 2
    assert traced["defects"][0]["code"] == "BUG-001"

    client.post("/coverage", json={"percent": 87.5})
    dash = client.get("/dashboard").json()
    assert dash["total_test_cases"] == 9
    assert dash["passed"] == 8 and dash["failed"] == 1
    assert dash["pass_percentage"] == 88.9
    assert dash["code_coverage"] == 87.5
    assert dash["open_defects"] == 1
    assert dash["defects_by_severity"] == {"High": 1}
    assert dash["defects_by_module"] == {"payments": 1}

    # Fix and re-run: defect resolved, requirement verified.
    client.patch(f"/defects/{defect['id']}", json={"status": "Resolved"})
    client.post(f"/test-cases/{failing['id']}/executions", json={"result": "Pass"})
    assert client.get(f"/requirements/{req['id']}/trace").json()["verification_status"] == "VERIFIED"
    assert client.get("/dashboard").json()["open_defects"] == 0


def test_test_case_crud_and_reference_checks(client):
    req = make_requirement(client)
    other = make_requirement(client, title="Deposit")
    foreign_scenario = client.post(
        "/scenarios", json={"requirement_id": other["id"], "title": "x"}
    ).json()
    suite = client.post("/suites", json={"name": "Smoke"}).json()
    assert client.post("/suites", json={"name": "Smoke"}).status_code == 409

    r = client.post(
        "/test-cases",
        json={"title": "Login works", "requirement_id": req["id"], "scenario_id": foreign_scenario["id"]},
    )
    assert r.status_code == 422

    tc = client.post(
        "/test-cases",
        json={"title": "Login works", "requirement_id": req["id"], "suite_id": suite["id"],
              "test_type": "regression", "priority": "P0"},
    ).json()
    assert tc["code"] == "TC-001" and tc["status"] == "Not Run"

    r = client.patch(f"/test-cases/{tc['id']}", json={"status": "Blocked", "title": "Login"})
    assert r.json()["status"] == "Blocked" and r.json()["title"] == "Login"
    assert client.patch(f"/test-cases/{tc['id']}", json={"title": None}).status_code == 422

    assert client.get("/test-cases", params={"suite_id": suite["id"]}).json()[0]["id"] == tc["id"]
    assert client.get("/dashboard").json()["regression"]["blocked"] == 1

    assert client.delete(f"/test-cases/{tc['id']}").status_code == 204
    assert client.get(f"/test-cases/{tc['id']}").status_code == 404


def test_demo_runs_generated_cases_against_uploaded_code(client):
    r = client.post("/demo")
    assert r.status_code == 201, r.text
    # 9 withdraw + 9 deposit + 17 transfer cases + 1 manual UI case.
    assert r.json() == {"test_cases": 36, "failed": 2, "defects_created": 2}
    assert client.post("/demo").status_code == 409

    defects = client.get("/defects").json()
    assert {d["expected"] for d in defects} == {
        "Reject: withdraw(amount=0)",
        "Accept: transfer(amount=5000, fee_percent=5.0)",
    }
    assert defects[0]["actual"].startswith("Accept (returned 10000)")

    dash = client.get("/dashboard").json()
    assert dash["blocked"] == 1 and dash["failed"] == 2 and dash["passed"] == 33
    assert dash["regression"] == {"total": 9, "passed": 9, "failed": 0, "blocked": 0, "not_run": 0}
    assert dash["code_coverage"] == 100.0

    report = client.get("/report").json()
    verdicts = [r["verification_status"] for r in report["requirements"]]
    assert verdicts == ["FAILED", "VERIFIED", "FAILED", "NOT_VERIFIED"]


def test_upload_validation_and_run(client):
    assert client.post("/uploads", json={"filename": "x.py", "source": "def f(:"}).status_code == 422
    assert client.post("/uploads", json={"filename": "x.py", "source": "X = 1"}).status_code == 422

    up = client.post(
        "/uploads",
        json={"filename": "calc.py", "source": "def half(n):\n    if n < 0:\n        raise ValueError\n    return n / 2\n\ndef _private(x): pass\n"},
    ).json()
    assert [f["signature"] for f in up["functions"]] == ["half(n)"]

    req = make_requirement(client)
    r = client.post(
        "/generate",
        json={"signature": "missing(n)", "params": {"n": {"min": 0, "max": 10}}, "upload_id": up["id"]},
    )
    assert r.status_code == 422

    client.post(
        "/generate",
        json={"signature": "half(n)", "params": {"n": {"min": 0, "max": 10}}, "upload_id": up["id"],
              "persist": True, "requirement_id": req["id"]},
    )
    run = client.post(f"/uploads/{up['id']}/run", json={"run_label": "ci"}).json()
    # half() rejects negatives but has no upper bound, so values above 10 fail.
    assert run["total"] == 9 and run["failed"] == 2 and run["defects_created"] == 2
    assert run["coverage"] == 88.9  # _private() never runs
