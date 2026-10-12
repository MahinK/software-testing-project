"""Automated test-case generation using Equivalence Partitioning (EP) and
Boundary Value Analysis (BVA).

Each numeric parameter has one valid equivalence class, the closed range
[min, max], and two invalid classes: below min and above max.

Cases follow the single-fault assumption. One parameter varies at a time and
every other parameter keeps its nominal (mid-range) value. For each parameter
this produces:

* EP: one representative from each invalid class
* robust BVA: min - step, min, min + step, max - step, max, max + step

There is also one all-nominal case for the valid class. A function with n
parameters gets at most 8n + 1 cases, and duplicates are dropped.

Example: withdraw(amount) with amount in [1, balance] gives amount = 0
(rejected) and amount = balance + 1 (rejected, the "amount > balance" class).
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from decimal import ROUND_FLOOR, Decimal
from typing import Literal

Number = int | float

ACCEPT = "Accept"
REJECT = "Reject"

EP = "Equivalence Partitioning"
BVA = "Boundary Value Analysis"

_SIGNATURE = re.compile(r"^\s*(?:def\s+)?([A-Za-z_]\w*)\s*\((.*)\)\s*(?:->[^:]*)?:?\s*$")


@dataclass(frozen=True)
class ParamSpec:
    name: str
    min: Number
    max: Number
    type: Literal["int", "float"] = "int"
    # Smallest meaningful increment; defaults to 1 for ints and 0.01 for floats.
    step: Number | None = None

    def __post_init__(self) -> None:
        if self.min > self.max:
            raise ValueError(f"{self.name}: min ({self.min}) is greater than max ({self.max})")
        if self.step is not None and self.step <= 0:
            raise ValueError(f"{self.name}: step must be positive")
        if self.type == "int" and any(
            v is not None and v != int(v) for v in (self.min, self.max, self.step)
        ):
            raise ValueError(f"{self.name}: int parameters need whole-number min, max and step")


@dataclass(frozen=True)
class GeneratedCase:
    inputs: dict[str, Number]
    technique: str
    partition: str
    expected_outcome: str
    expected_valid: bool = field(repr=False)


def parse_signature(signature: str) -> tuple[str, list[str]]:
    """Return (function name, parameter names) for e.g. "withdraw(amount: int)"."""
    m = _SIGNATURE.match(signature)
    if not m:
        raise ValueError(f"not a function signature: {signature!r}")
    names: list[str] = []
    for raw in m.group(2).split(","):
        raw = raw.strip()
        if raw in ("", "self", "cls", "/", "*"):
            continue
        name = re.split(r"[:=]", raw, maxsplit=1)[0].strip().lstrip("*")
        if not name.isidentifier():
            raise ValueError(f"invalid parameter {raw!r} in {signature!r}")
        names.append(name)
    if not names:
        raise ValueError(f"{signature!r} has no parameters to generate inputs for")
    return m.group(1), names


class _Param:
    """A ParamSpec with its numeric values in Decimal, so float steps such as
    0.01 stay exact."""

    def __init__(self, spec: ParamSpec):
        self.spec = spec
        self.lo = Decimal(str(spec.min))
        self.hi = Decimal(str(spec.max))
        if spec.step is not None:
            self.step = Decimal(str(spec.step))
        else:
            self.step = Decimal(1) if spec.type == "int" else Decimal("0.01")
        # Midpoint, rounded down to the nearest step above min.
        steps_to_mid = ((self.hi - self.lo) / 2 / self.step).to_integral_value(ROUND_FLOOR)
        self.nominal = self.lo + steps_to_mid * self.step

    def value(self, d: Decimal) -> Number:
        return int(d) if self.spec.type == "int" else float(d)

    def in_range(self, d: Decimal) -> bool:
        return self.lo <= d <= self.hi

    def candidates(self) -> list[tuple[Decimal, str, str, bool]]:
        """(value, technique, partition label, meant to be valid), in order."""
        lo, hi, s, nom = self.lo, self.hi, self.step, self.nominal
        # Invalid-class representatives: nominal reflected across each bound,
        # but always at least two steps outside it so they differ from the
        # robust-BVA boundary values.
        invalid_low = min(lo - (nom - lo), lo - 2 * s)
        invalid_high = max(hi + (hi - nom), hi + 2 * s)
        return [
            (invalid_low, EP, "invalid class (below range)", False),
            (lo - s, BVA, "just below minimum", False),
            (lo, BVA, "at minimum", True),
            (lo + s, BVA, "just above minimum", True),
            (hi - s, BVA, "just below maximum", True),
            (hi, BVA, "at maximum", True),
            (hi + s, BVA, "just above maximum", False),
            (invalid_high, EP, "invalid class (above range)", False),
        ]


def generate_cases(specs: Sequence[ParamSpec]) -> list[GeneratedCase]:
    if not specs:
        raise ValueError("at least one parameter is required")
    if len({s.name for s in specs}) != len(specs):
        raise ValueError("parameter names must be unique")

    params = [_Param(s) for s in specs]
    nominal = {p.spec.name: p.value(p.nominal) for p in params}
    cases: list[GeneratedCase] = []
    seen: set[tuple[tuple[str, Number], ...]] = set()

    def add(inputs: dict[str, Number], technique: str, partition: str, valid: bool) -> None:
        key = tuple(sorted(inputs.items()))
        if key in seen:
            return
        seen.add(key)
        outcome = ACCEPT if valid else REJECT
        cases.append(GeneratedCase(inputs, technique, partition, outcome, valid))

    add(nominal, EP, "all parameters in valid class (nominal)", True)

    for p in params:
        for value, technique, label, meant_valid in p.candidates():
            # min + step / max - step leave the range when it is narrower than one step.
            if meant_valid and not p.in_range(value):
                continue
            add({**nominal, p.spec.name: p.value(value)}, technique, f"{p.spec.name} {label}", meant_valid)

    return cases
