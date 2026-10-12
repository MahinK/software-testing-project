import pytest

from app.generator import ACCEPT, BVA, EP, REJECT, ParamSpec, generate_cases, parse_signature


def by_value(cases, name):
    return {c.inputs[name]: c for c in cases}


@pytest.mark.parametrize(
    "signature, expected",
    [
        ("withdraw(amount)", ("withdraw", ["amount"])),
        ("def transfer(self, amount: float, fee=0) -> bool:", ("transfer", ["amount", "fee"])),
        ("f(*, x, y)", ("f", ["x", "y"])),
    ],
)
def test_parse_signature(signature, expected):
    assert parse_signature(signature) == expected


@pytest.mark.parametrize("bad", ["withdraw", "withdraw()", "1abc(x)", "f(x-y)"])
def test_parse_signature_rejects_bad_input(bad):
    with pytest.raises(ValueError):
        parse_signature(bad)


def test_withdraw_example_from_problem_statement():
    # withdraw(amount) where 1 <= amount <= balance (10_000)
    cases = generate_cases([ParamSpec("amount", min=1, max=10_000)])
    values = by_value(cases, "amount")

    # Robust BVA around both bounds.
    assert values[0].expected_outcome == REJECT and values[0].technique == BVA
    assert values[1].expected_outcome == ACCEPT
    assert values[2].expected_outcome == ACCEPT
    assert values[9_999].expected_outcome == ACCEPT
    assert values[10_000].expected_outcome == ACCEPT
    assert values[10_001].expected_outcome == REJECT  # amount > balance

    # EP: one valid representative, one from each invalid class.
    assert values[5_000].technique == EP and values[5_000].expected_outcome == ACCEPT
    ep_invalid = [c for c in cases if c.technique == EP and c.expected_outcome == REJECT]
    assert len(ep_invalid) == 2
    assert any(c.inputs["amount"] < 0 for c in ep_invalid)
    assert any(c.inputs["amount"] > 10_001 for c in ep_invalid)

    assert len(cases) == 9


def test_single_fault_assumption_with_two_params():
    cases = generate_cases([ParamSpec("a", 0, 100), ParamSpec("b", 10, 20)])
    assert len(cases) == 8 * 2 + 1
    for c in cases[1:]:
        varied = [k for k in ("a", "b") if c.inputs[k] != cases[0].inputs[k]]
        assert len(varied) == 1


def test_float_steps_are_exact():
    cases = generate_cases([ParamSpec("rate", min=0.1, max=0.5, type="float")])
    values = set(by_value(cases, "rate"))
    assert {0.09, 0.1, 0.11, 0.49, 0.5, 0.51} <= values


def test_narrow_range_drops_duplicates_and_out_of_range_interior_points():
    cases = generate_cases([ParamSpec("x", min=5, max=5)])
    values = by_value(cases, "x")
    assert values[5].expected_outcome == ACCEPT
    assert values[4].expected_outcome == REJECT
    assert values[6].expected_outcome == REJECT
    assert all(
        (c.expected_outcome == ACCEPT) == (c.inputs["x"] == 5) for c in cases
    )
    assert len(values) == len(cases)


@pytest.mark.parametrize(
    "kwargs",
    [
        {"min": 10, "max": 1},
        {"min": 0, "max": 1, "step": 0},
        {"min": 0.5, "max": 1, "type": "int"},
    ],
)
def test_invalid_specs(kwargs):
    with pytest.raises(ValueError):
        ParamSpec("x", **kwargs)
