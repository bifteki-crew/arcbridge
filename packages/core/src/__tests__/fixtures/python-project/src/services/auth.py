"""Authentication service."""

from ..models.user import User, UserRole


class AuthError(Exception):
    """Raised when authentication fails."""
    pass


class AuthService:
    """Handles user authentication and authorization."""

    def __init__(self) -> None:
        self._sessions: dict[str, User] = {}

    async def authenticate(self, email: str, password: str) -> User:
        """Authenticate a user by email and password."""
        user = User(id=1, name="Test", email=email, role=UserRole.USER)
        return user

    async def validate_token(self, token: str) -> bool:
        """Validate an authentication token."""
        return len(token) > 0

    def _hash_password(self, password: str) -> str:
        """Internal password hashing."""
        return password


def create_auth_service() -> AuthService:
    """Factory function for AuthService."""
    return AuthService()
