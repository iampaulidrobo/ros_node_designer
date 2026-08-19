"""Data model for a directed connection between two nodes."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict


@dataclass(frozen=True)
class Connection:
    """A directed link from a publisher node to a subscriber node.

    The direction is always publisher (``from_id``) -> subscriber (``to_id``).
    Validation of that rule lives in :class:`model.graph.Graph`.
    """

    from_id: str
    to_id: str

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to the project JSON schema (``{"from": ..., "to": ...}``)."""
        return {"from": self.from_id, "to": self.to_id}

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Connection":
        """Reconstruct a :class:`Connection` from serialized data."""
        return cls(from_id=str(data["from"]), to_id=str(data["to"]))
