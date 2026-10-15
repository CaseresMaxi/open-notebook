"""Account usage and operator-only policy management."""

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from api import firebase_auth
from open_notebook import usage
from open_notebook.ai.models import Model
from open_notebook.exceptions import InvalidInputError
from open_notebook.workspaces import platform_scope

router = APIRouter()


class Policy(BaseModel):
    monthly_tokens: int = Field(default=500000, ge=0, le=1000000000)
    monthly_calls: int = Field(default=1000, ge=0, le=1000000)
    monthly_images: int = Field(default=30, ge=0, le=100000)
    concurrent_calls: int = Field(default=3, ge=1, le=100)
    storage_bytes: int = Field(default=524288000, ge=0, le=1099511627776)
    model_id: str | None = Field(default=None, max_length=255)
    disabled: bool = False


def unlimited(user) -> bool:
    """Administrators and the installation owner are never blocked by limits."""
    email = (user.get("email") or "").casefold()
    return (
        user.get("admin") is True
        or (bool(email) and email in firebase_auth.admin_emails())
        or user["uid"] == firebase_auth.legacy_owner_uid()
        or (bool(email) and email == firebase_auth.owner_email())
    )


@router.get("/account/usage")
async def account_usage(request: Request):
    user = request.state.user
    summary = await run_in_threadpool(usage.summary, user["uid"])
    return {**summary, "unlimited": unlimited(user)}


@router.get("/admin/accounts")
async def accounts():
    users = await run_in_threadpool(usage.accounts)
    for user in users:
        user["usage"] = await run_in_threadpool(usage.summary, user["uid"])
        user["unlimited"] = unlimited(user)
    return users


@router.put("/admin/accounts/{uid}/policy")
async def update_policy(uid: str, policy: Policy, request: Request):
    if uid == request.state.user["uid"] and policy.disabled:
        raise InvalidInputError("You cannot pause your own administrator account")
    if policy.model_id:
        with platform_scope():
            model = await Model.get(policy.model_id)
        if model.type != "language":
            raise InvalidInputError("Study model must be a language model")
    await run_in_threadpool(usage.set_policy, uid, policy.model_dump())
    return await run_in_threadpool(usage.summary, uid)
