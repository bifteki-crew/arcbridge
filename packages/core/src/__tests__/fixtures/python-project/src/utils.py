"""Utility functions."""

import hashlib
from typing import Optional


def format_name(first: str, last: str) -> str:
    """Format a full name from parts."""
    return f"{first} {last}"


def parse_int_safe(value: str) -> Optional[int]:
    """Safely parse a string to int, returning None on failure."""
    try:
        return int(value)
    except ValueError:
        return None


async def async_helper() -> None:
    """An async utility function."""
    pass


MAX_RETRIES = 3
DEFAULT_TIMEOUT = 30
