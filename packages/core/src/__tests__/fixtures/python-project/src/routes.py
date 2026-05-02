"""API routes for the test application."""

from fastapi import FastAPI, Depends

app = FastAPI()


def auth_required():
    """Dependency that checks authentication."""
    pass


@app.get("/users")
def list_users():
    """List all users."""
    return []


@app.post("/users")
def create_user():
    """Create a new user."""
    return {}


@app.get("/users/{user_id}")
def get_user(user_id: int):
    """Get a user by ID."""
    return {}


@app.delete("/users/{user_id}", dependencies=[Depends(auth_required)])
def delete_user(user_id: int):
    """Delete a user. Requires authentication."""
    return {}


# Flask-style routes
from flask import Blueprint

bp = Blueprint("health", __name__)


@bp.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


@bp.route("/ready", methods=["GET", "POST"])
def readiness():
    """Readiness check."""
    return {"ready": True}
