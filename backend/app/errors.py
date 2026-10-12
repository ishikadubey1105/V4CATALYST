class ApiError(Exception):
    """Rendered as `{ "code": ..., "message": ... }` with the given HTTP status (see main.py)."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def forbidden(message: str = "You do not have permission to do that.") -> ApiError:
    return ApiError(403, "FORBIDDEN", message)


def not_found(what: str) -> ApiError:
    return ApiError(404, "NOT_FOUND", f"{what} not found")


def bad_request(message: str) -> ApiError:
    return ApiError(400, "BAD_REQUEST", message)
