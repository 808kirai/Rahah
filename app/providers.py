"""sign in with google and apple

both hand the page a signed token about the student, which the page sends here. the token is
checked against the provider's published keys, for this app's client id, and not expired, before
anything in it is trusted
"""

from dataclasses import dataclass

import jwt

google_keys_url = "https://www.googleapis.com/oauth2/v3/certs"
apple_keys_url = "https://appleid.apple.com/auth/keys"
google_issuers = ("accounts.google.com", "https://accounts.google.com")
apple_issuer = "https://appleid.apple.com"


class provider_error(Exception):
    """a token that can't be trusted, the message is shown to the student as it is"""


@dataclass
class identity:
    sub: str  # the provider's own id for the student, which never changes
    email: str | None  # only when the provider says it's been checked
    name: str


# the key sets are fetched once and kept, the client looks up a new key when the provider rotates them
_key_clients: dict[str, jwt.PyJWKClient] = {}


def _claims(token: str, keys_url: str, audience: str, issuers) -> dict:
    client = _key_clients.setdefault(keys_url, jwt.PyJWKClient(keys_url, cache_keys=True, lifespan=3600))
    try:
        key = client.get_signing_key_from_jwt(token)
        return jwt.decode(token, key.key, algorithms=["RS256"], audience=audience, issuer=issuers, leeway=60)
    except (jwt.PyJWTError, jwt.PyJWKClientError) as error:
        raise provider_error("That sign in couldn't be checked. Try again.") from error


def verify_google(token: str, client_id: str) -> identity:
    claims = _claims(token, google_keys_url, client_id, list(google_issuers))
    email = claims.get("email") if claims.get("email_verified") else None
    return identity(sub=str(claims["sub"]), email=email, name=claims.get("name") or claims.get("given_name") or "")


def verify_apple(token: str, client_id: str, name: str = "") -> identity:
    # apple sends the name only the first time, from the page, so it comes in beside the token
    claims = _claims(token, apple_keys_url, client_id, apple_issuer)
    verified = claims.get("email_verified") in (True, "true")
    return identity(sub=str(claims["sub"]), email=claims.get("email") if verified else None, name=name)
