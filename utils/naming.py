"""Naming helpers shared across the app and generator."""

from __future__ import annotations

import re


def sanitize_identifier(name: str, fallback: str = "node") -> str:
    """Turn an arbitrary string into a valid C-style identifier.

    Used for C++ source-file names, executable names and callback names so the
    generated package always compiles regardless of what the user typed.

    Args:
        name: The raw user-supplied name.
        fallback: Value returned if ``name`` reduces to nothing usable.
    """
    cleaned = re.sub(r"[^0-9a-zA-Z_]", "_", name.strip())
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    if not cleaned:
        cleaned = fallback
    if cleaned[0].isdigit():
        cleaned = f"n_{cleaned}"
    return cleaned
