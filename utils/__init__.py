"""Shared utilities with no GUI dependencies."""

from .message_types import (
    MessageTypeInfo,
    default_message_type,
    get_info,
    list_message_types,
)
from .naming import sanitize_identifier

__all__ = [
    "MessageTypeInfo",
    "default_message_type",
    "get_info",
    "list_message_types",
    "sanitize_identifier",
]
