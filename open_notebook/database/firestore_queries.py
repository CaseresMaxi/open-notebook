"""Compatibility operations for existing domain queries during the Firebase migration.

This is an internal, deliberately limited query adapter, not a general SQL engine.
Unsupported expressions fail explicitly. Values are bound separately and all
operations use the server-selected Firestore scope. Complex graph/search queries
have named implementations rather than attempting to interpret graph syntax.
"""

import re
from collections import Counter
from datetime import datetime, timezone
from typing import Any

import numpy as np

from open_notebook.database import firestore_store as store
from open_notebook.exceptions import ConfigurationError


def field(row, name):
    for part in name.split("."):
        row = row.get(part) if isinstance(row, dict) else None
    return row


def value(expression, params, row=None):
    expression = expression.strip()
    if expression.startswith("string::lowercase(") and expression.endswith(")"):
        return str(value(expression[18:-1], params, row) or "").lower()
    if expression.startswith("string::trim(") and expression.endswith(")"):
        return str(value(expression[13:-1], params, row) or "").strip()
    if expression.startswith("array::len(") and expression.endswith(")"):
        return len(value(expression[11:-1], params, row) or [])
    if expression.startswith("$"):
        if expression[1:] not in params:
            raise ConfigurationError("Missing bound query parameter")
        return store.normalize(params[expression[1:]])
    if expression in {"none", "null"}:
        return None
    if expression == "time::now()":
        return datetime.now(timezone.utc)
    if expression in {"true", "false"}:
        return expression == "true"
    if expression in {"''", '""'}:
        return ""
    if expression.isdigit():
        return int(expression)
    if re.fullmatch(r"[a-z_][a-z0-9_.]*", expression) and row is not None:
        return field(row, expression)
    raise ConfigurationError("Unsupported Firestore query expression")


def matches(row, condition, params):
    if not condition:
        return True
    for term in re.split(r"\s+and\s+", condition):
        match = re.fullmatch(
            r"(.+?)\s*( != | >= | > | = | is | in |!=|>=|>|=)\s*(.+)", term.strip()
        )
        if not match:
            raise ConfigurationError("Unsupported Firestore filter")
        left, op, right = match.groups()
        a, b = value(left, params, row), value(right, params, row)
        op = op.strip()
        passed = {
            "=": lambda: a == b,
            "is": lambda: a == b,
            "!=": lambda: a != b,
            "in": lambda: a in (b or []),
            ">": lambda: a is not None and b is not None and a > b,
            ">=": lambda: a is not None and b is not None and a >= b,
        }[op]()
        if not passed:
            return False
    return True


def ordered(rows, clause):
    for part in reversed((clause or "").split(",")):
        parts = part.strip().split()
        if not parts:
            continue
        name = parts[0]
        reverse = len(parts) > 1 and parts[1] == "desc"
        rows.sort(
            key=lambda row: (
                field(row, name) is not None,
                field(row, name)
                if isinstance(field(row, name), (int, float, bool))
                else str(field(row, name) or ""),
            ),
            reverse=reverse,
        )
    return rows


async def edges(table, target, side="out"):
    return await store.records(table, [(side, "==", target)])


async def linked(table, target):
    result = []
    for edge in await edges(table, target):
        record = await store.get(edge["in"])
        if record:
            result.append(record)
    return result


async def search(params, *, vector):
    scoped = params.get("notebook_ids") or []
    source_ids: set[str] | None = None
    note_ids: set[str] | None = None
    if scoped:
        source_ids, note_ids = set(), set()
        for notebook in scoped:
            source_ids.update(e["in"] for e in await edges("reference", str(notebook)))
            note_ids.update(e["in"] for e in await edges("artifact", str(notebook)))
    sources = (
        {r["id"]: r for r in await store.records("source")}
        if params.get("source")
        else {}
    )
    candidates: list[tuple[dict[str, Any], str, str, str]] = []
    if sources:
        if not vector:
            candidates.extend(
                (
                    r,
                    r["id"],
                    r.get("title", ""),
                    (r.get("full_text") or "") + " " + r.get("title", ""),
                )
                for r in sources.values()
                if source_ids is None or r["id"] in source_ids
            )
        for table in ("source_embedding", "source_insight"):
            for r in await store.records(table):
                parent = sources.get(r.get("source"))
                if not parent or (
                    source_ids is not None and parent["id"] not in source_ids
                ):
                    continue
                title = parent.get("title", "")
                if table == "source_insight":
                    title = r.get("insight_type", "") + " - " + title
                candidates.append((r, parent["id"], title, r.get("content", "")))
    if params.get("note"):
        candidates.extend(
            (r, r["id"], r.get("title", ""), r.get("content", ""))
            for r in await store.records("note")
            if note_ids is None or r["id"] in note_ids
        )
    result: list[dict[str, Any]] = []
    query = np.asarray(params.get("embed", []), dtype=float)
    terms = re.findall(r"\w+", str(params.get("keyword", "")).casefold())
    for record, parent, title, content in candidates:
        if vector:
            embedding = np.asarray(record.get("embedding") or [], dtype=float)
            if len(embedding) != len(query) or not len(query):
                continue
            norm = np.linalg.norm(embedding) * np.linalg.norm(query)
            score = float(np.dot(embedding, query) / norm) if norm else 0
            if score < params.get("minimum_score", 0.2):
                continue
        else:
            text = (title + " " + content).casefold()
            score = sum(text.count(term) for term in terms)
            if not score:
                continue
        rid = parent if record["id"].startswith("source_embedding:") else record["id"]
        result.append(
            {
                "id": rid,
                "parent_id": parent,
                "title": title,
                "content": content,
                "similarity" if vector else "relevance": score,
            }
        )
    score_field = "similarity" if vector else "relevance"
    result.sort(key=lambda r: (-r[score_field], r["id"]))
    # Match the existing grouped search contract: best hit per record.
    unique: dict[str, Any] = {}
    for row in result:
        unique.setdefault(row["id"], row)
    return list(unique.values())[: int(params["results"])]


async def query(query_str, params=None):
    params = store.normalize(params or {})
    q = " ".join(query_str.strip().rstrip(";").lower().split())
    if q == "return 1":
        await store.client().document("product_platform/default").get()
        return [1]
    if "fn::text_search(" in q or "fn::vector_search(" in q:
        return await search(params, vector="fn::vector_search(" in q)
    if "count(<-reference.in)" in q:
        target_match = re.search(r"from (\$\w+|notebook)", q)
        if not target_match:
            raise ConfigurationError("Unsupported notebook query target")
        target = target_match.group(1)
        rows = (
            await store.records("notebook")
            if target == "notebook"
            else [await store.get(value(target, params))]
        )
        rows = [r for r in rows if r]
        for r in rows:
            r["source_count"] = len(await edges("reference", r["id"]))
            r["note_count"] = len(await edges("artifact", r["id"]))
        return ordered(rows, q.split("order by ")[-1] if "order by " in q else "")
    if "as assigned_others" in q:
        records = await linked("reference", params["notebook_id"])
        return [
            {
                "id": r["id"],
                "assigned_others": sum(
                    e["out"] != params["notebook_id"]
                    for e in await edges("reference", r["id"], "in")
                ),
            }
            for r in records
        ]
    for alias, relation in (
        ("source", "reference"),
        ("note", "artifact"),
        ("chat_session", "refers_to"),
    ):
        if f"as {alias} from {relation}" in q:
            rows = ordered(await linked(relation, params["id"]), "updated desc")
            if "omit " in q:
                omitted = q.split("omit ")[1].split(" from ")[0]
                for row in rows:
                    for name in omitted.split(","):
                        row.pop(name.strip().split(".")[-1], None)
            return [{alias: [r] if alias == "chat_session" else r} for r in rows]
    if q.startswith("select source.* from"):
        record = await store.get(params["id"])
        parent = await store.get(record["source"]) if record else None
        return [{"source": parent}] if parent else []
    if "as title_sort" in q:
        rows = (
            await linked("reference", params["notebook_id"])
            if "notebook_id" in params
            else await store.records("source")
        )
        insights = Counter(
            r.get("source") for r in await store.records("source_insight")
        )
        embedded = {r.get("source") for r in await store.records("source_embedding")}
        for r in rows:
            asset = r.get("asset") or {}
            r.update(
                title_sort=(r.get("title") or "").lower(),
                type="file"
                if asset.get("file_path")
                else "link"
                if asset.get("url")
                else "text",
                insights_count=insights[r["id"]],
                embedded=r["id"] in embedded,
            )
            if r.get("command"):
                # Commands live in the platform queue, never in a user's record tree.
                from open_notebook.workspaces import platform_scope

                with platform_scope():
                    r["command"] = await store.get(r["command"])
                command = r["command"]
                if (
                    command
                    and command.get("enqueue_pending")
                    and command.get("status") == "queued"
                ):
                    from open_notebook.workspace_commands import get_command_status

                    r["command"] = vars(await get_command_status(command["id"]))
        order = q.split("order by ")[1].split(" limit ")[0]
        return ordered(rows, order)[
            params["offset"] : params["offset"] + params["limit"]
        ]
    if "array::distinct(" in q:
        ids = list(
            dict.fromkeys(
                r["source"]
                for r in await store.records("source_embedding")
                if r.get("embedding")
            )
        )
        return [len(ids)] if "count(" in q else ids
    if q.startswith("delete chat_quiz_attempt where exam_id in ("):
        quizzes = await store.records(
            "chat_quiz", [("session_id", "==", params["quiz_session_id"])]
        )
        for quiz in quizzes:
            for row in await store.records(
                "chat_quiz_attempt", [("exam_id", "==", quiz["id"])]
            ):
                await store.delete(row["id"])
        return []
    if q.startswith("relate "):
        match = re.fullmatch(r"relate (\$\w+)->(\w+)->(\$\w+)(?: content (\$\w+))?", q)
        if not match:
            raise ConfigurationError("Unsupported relation")
        source, relation, target, content = match.groups()
        rid = (
            relation
            + ":"
            + store.identifier(f"{value(source, params)}|{value(target, params)}")
        )
        return [
            await store.put(
                rid,
                {
                    **(value(content, params) if content else {}),
                    "in": value(source, params),
                    "out": value(target, params),
                },
                merge=True,
            )
        ]
    if q.startswith("create source_insight content"):
        return [
            await store.create(
                "source_insight",
                {
                    "source": params["source_id"],
                    "insight_type": params["insight_type"],
                    "content": params["content"],
                },
            )
        ]
    match = re.fullmatch(r"(upsert|update) (\$\w+|\w+:\w+) (merge|content|set) (.+)", q)
    if match:
        action, target, mode, expression = match.groups()
        rid = value(target, params) if target.startswith("$") else target
        # A table UPSERT allocates a new ID; explicit IDs preserve singletons.
        if ":" not in str(rid):
            return [await store.create(str(rid), value(expression, params))]
        if mode == "set":
            name, expression = expression.split(" = ", 1)
            data = {name: value(expression, params)}
        else:
            data = value(expression, params)
        if action == "update" and not await store.get(rid):
            return []
        return [await store.put(rid, data, merge=mode != "content")]
    if q.startswith("delete "):
        match = re.fullmatch(r"delete (?:from )?(\w+)(?: where (.+))?", q)
        if not match:
            raise ConfigurationError("Unsupported deletion")
        table, where = match.groups()
        for row in await filtered(table, where or "", params):
            await store.delete(row["id"])
        return []
    match = re.fullmatch(r"select (.+?) from (?:only )?(\$\w+|\w+:\w+|\w+)(.*)", q)
    if not match:
        raise ConfigurationError("Unsupported query in Firestore mode")
    projection, target, tail = match.groups()
    clauses = re.fullmatch(
        r"(?: where (.*?))?(?: group (?:by (.*?)|all))?(?: order by (.*?))?(?: limit (\$\w+|\d+))?(?: start (\$\w+|\d+))?(?: fetch (\w+))?",
        tail,
    )
    if not clauses:
        raise ConfigurationError("Unsupported Firestore select clauses")
    where, grouping, order, limit, offset, fetch = clauses.groups()
    if target.startswith("$") or ":" in target:
        rid = value(target, params) if target.startswith("$") else target
        record = await store.get(rid)
        rows = [record] if record and matches(record, where or "", params) else []
    else:
        rows = await filtered(target, where or "", params)
    if grouping:
        grouped: dict[Any, list[dict[str, Any]]] = {}
        for row in rows:
            grouped.setdefault(row.get(grouping), []).append(row)
        result = []
        for key, members in grouped.items():
            projected = {}
            for item in projection.split(","):
                parts = item.strip().split(" as ")
                expr, alias = parts[0], parts[-1]
                if expr == "count()":
                    projected[alias] = len(members)
                elif expr.startswith("math::max("):
                    projected[alias] = max(field(r, expr[10:-1]) for r in members)
                elif expr == grouping:
                    projected[alias] = key
                else:
                    raise ConfigurationError("Unsupported grouped projection")
            result.append(projected)
        return result
    if "count()" in projection:
        alias = projection.split(" as ")[-1]
        return [len(rows)] if projection.startswith("value ") else [{alias: len(rows)}]
    rows = ordered(rows, order)
    start = int(value(offset, params)) if offset else 0
    end = start + int(value(limit, params)) if limit else None
    rows = rows[start:end]
    if fetch:
        for row in rows:
            if row.get(fetch):
                row[fetch] = await store.get(row[fetch])
    if projection.startswith("* omit "):
        for row in rows:
            for key in projection[7:].split(","):
                row.pop(key.strip(), None)
        return rows
    if projection == "*":
        return rows
    if projection.startswith("value "):
        return [value(projection[6:], params, r) for r in rows]
    result = []
    for row in rows:
        projected = {}
        for item in projection.split(","):
            parts = item.strip().split(" as ")
            projected[parts[-1] if len(parts) > 1 else parts[0]] = value(
                parts[0], params, row
            )
        result.append(projected)
    return result


async def filtered(table, condition, params):
    filters = []
    # Push equality filters to Firestore. Other predicates are evaluated after a
    # bounded read, avoiding composite indexes during the small private MVP.
    for term in re.split(r"\s+and\s+", condition):
        match = re.fullmatch(r"(\w+)\s*=\s*(\$\w+)", term)
        if match:
            name, expression = match.groups()
            filters.append((name, "==", value(expression, params)))
    return [
        r for r in await store.records(table, filters) if matches(r, condition, params)
    ]
