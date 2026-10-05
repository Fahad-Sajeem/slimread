import os

MAX_RETRIES = 3


def helper(x):
    """Return x doubled."""
    return x * 2


class AuthService:
    """Handles login."""

    def __init__(self, db):
        self.db = db

    @staticmethod
    def hash(pw):
        return pw[::-1]

    def login(self, user, pw):
        token = self.db.get(user)
        if token is None:
            return helper(0)
        return token


async def fetch_all(urls):
    return [u for u in urls]
