"""Sample banking module for the platform demo.

It contains two deliberate bugs for the generated EP/BVA tests to find:
* withdraw() accepts a withdrawal of 0
* transfer() rejects the maximum allowed fee of exactly 5%
"""

BALANCE = 10_000
DEPOSIT_LIMIT = 50_000
MAX_FEE_PERCENT = 5


def withdraw(amount):
    """Withdraw from the account. Valid when 1 <= amount <= BALANCE."""
    if amount < 0:  # BUG: should be `amount <= 0`
        raise ValueError("amount must be positive")
    if amount > BALANCE:
        raise ValueError("insufficient funds")
    return BALANCE - amount


def deposit(amount):
    """Deposit into the account. Valid when 1 <= amount <= DEPOSIT_LIMIT."""
    if amount <= 0:
        raise ValueError("amount must be positive")
    if amount > DEPOSIT_LIMIT:
        raise ValueError("deposit limit exceeded")
    return BALANCE + amount


def transfer(amount, fee_percent):
    """Transfer with a fee. Valid when 1 <= amount <= BALANCE and
    0 <= fee_percent <= MAX_FEE_PERCENT."""
    if not 1 <= amount <= BALANCE:
        raise ValueError("invalid transfer amount")
    if fee_percent < 0 or fee_percent >= MAX_FEE_PERCENT:  # BUG: should be `>`
        raise ValueError("invalid fee")
    return round(amount * (1 + fee_percent / 100), 2)
