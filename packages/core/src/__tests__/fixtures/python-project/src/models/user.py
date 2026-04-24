"""User models for the test application."""

from dataclasses import dataclass
from enum import Enum


class UserRole(Enum):
    """User role enumeration."""
    ADMIN = "admin"
    USER = "user"
    GUEST = "guest"


@dataclass
class User:
    """Represents a user in the system."""
    id: int
    name: str
    email: str
    role: UserRole

    def display_name(self) -> str:
        """Get the display name for the user."""
        return f"{self.name} ({self.role.value})"

    def is_admin(self) -> bool:
        return self.role == UserRole.ADMIN


MAX_USERS = 1000
_internal_cache: dict = {}
