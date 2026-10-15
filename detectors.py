"""Configuration-driven local activity detection. Never exports process arguments.

A running CLI counts as active, including its own input-wait time. File recency is
a heuristic, not proof that a model is generating. Register a new rule detector
here when a future tool offers a stronger activity signal.
"""
import datetime
import json
import time
from pathlib import Path

import psutil


# Non-secret environment keys used only to classify which API service a Claude
# Code CLI is talking to, plus the model name for a "Flash" marker. Tokens and
# other credentials are never read and never leave this module.
CLAUDE_ENV_KEYS = (
    "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL", "CLAUDE_CODE_SUBAGENT_MODEL", "OR_MODEL",
)
CLAUDE_PROVIDERS = {"deepseek", "openrouter", "other"}


def _read_env(pid):
    """Read only the non-secret Claude Code environment keys for one PID."""
    try:
        environ = psutil.Process(pid).environ()
    except (psutil.Error, OSError):
        return {}
    return {key: environ[key] for key in CLAUDE_ENV_KEYS if key in environ}


def _classify_service(env, command):
    """Resolve the API service from base URL, then model name, then command line."""
    base_url = (env.get("ANTHROPIC_BASE_URL") or "").lower()
    model = (env.get("ANTHROPIC_MODEL") or "").lower()
    text = (command or "").lower().replace("\\", "/")
    for needle in ("openrouter", "deepseek"):
        if needle in base_url:
            return needle
    for needle in ("openrouter", "deepseek"):
        if needle in model:
            return needle
    for needle in ("openrouter", "deepseek"):
        if needle in text:
            return needle
    return None


def _model_name(env):
    for key in ("ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL",
                "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL",
                "CLAUDE_CODE_SUBAGENT_MODEL"):
        value = (env.get(key) or "").strip()
        if value:
            return value
    return ""


def _is_claude_cli(process):
    name = process["name"].lower()
    command = process["command"].lower().replace("\\", "/")
    if name in {"claude.exe", "claude"}:
        return True
    return name in {"node.exe", "node"} and "@anthropic-ai/claude-code/" in command


def _resolve_service(process, by_pid):
    """Return (service, model) for a Claude Code CLI.

    Read the CLI's own environment first; when that is unreadable or unmarked,
    fall back to the nearest ancestors' environment and command lines. The
    service is never inferred from a fixed launcher filename.
    """
    current = process
    env = {}
    seen = set()
    for _ in range(32):
        pid = current.get("pid")
        if pid is not None:
            if pid in seen:
                break
            seen.add(pid)
            env.update(_read_env(pid))
        service = _classify_service(env, current["command"])
        if service:
            return service, _model_name(env)
        parent = by_pid.get(current.get("ppid"))
        if parent is None:
            break
        # A reused PID must not attach a surviving CLI to an unrelated shell.
        if (parent.get("created") is not None and current.get("created") is not None
                and parent["created"] > current["created"]):
            break
        current = parent
    return None, _model_name(env)


def claude_session(rule, processes, now):
    """Report a live Claude Code CLI that matches `rule["provider"]`.

    Any running Claude Code CLI counts as active. Its service is read from the
    process environment (base URL / model name) and command line — never from a
    fixed launcher filename — so new `cc-*.cmd` wrappers need no config changes.
    A CLI whose service cannot be read falls back to the "other" Claude role.
    """
    wanted = rule["provider"]
    by_pid = {p["pid"]: p for p in processes if p.get("pid") is not None}
    for process in processes:
        if not _is_claude_cli(process):
            continue
        service, model = _resolve_service(process, by_pid)
        if (service or "other") == wanted:
            return {"service": service or "other", "model": model}
    return None


def process_matches(rule, processes, now):
    names = {name.lower() for name in rule["names"]}
    for process in processes:
        if process["name"].lower() not in names:
            continue
        command = process["command"].lower().replace("\\", "/")
        if any(part.lower() in command for part in rule.get("exclude", [])):
            continue
        if all(part.lower().replace("\\", "/") in command for part in rule.get("contains_all", [])):
            return True
    return False


def recent_files(rule, processes, now):
    root = Path(rule["root"]).expanduser()
    if rule.get("dated_directories"):
        today = datetime.date.fromtimestamp(now)
        roots = [root / day.strftime("%Y/%m/%d") for day in
                 (today-datetime.timedelta(days=i) for i in range(rule.get("lookback_days", 3)))]
    else:
        roots = [root]
    for directory in roots:
        try:
            for file in directory.glob(rule.get("pattern", "*")):
                try:
                    if file.is_file() and 0 <= now-file.stat().st_mtime < rule.get("active_seconds", 30):
                        return True
                except OSError:
                    continue
        except OSError:
            continue
    return False


# Extension point: callable(rule, processes, now) -> bool or a match dict. Rules
# within a tool OR together. A dict may carry extra display hints such as "model".
RULE_DETECTORS = {"process": process_matches, "recent_files": recent_files,
                  "claude_session": claude_session}


def load_tools(path):
    tools = json.loads(Path(path).read_text(encoding="utf-8-sig"))["tools"]
    ids = set()
    for tool in tools:
        if not tool.get("id") or tool["id"] in ids or not tool.get("name") or not tool.get("rules"):
            raise ValueError("Each tool needs a unique id, name and nonempty rules")
        ids.add(tool["id"])
        for rule in tool["rules"]:
            if rule.get("type") not in RULE_DETECTORS:
                raise ValueError(f'Unknown detector type: {rule.get("type")}')
            if rule["type"] == "process" and not rule.get("names"):
                raise ValueError("Process rules require names")
            if rule["type"] == "recent_files" and not rule.get("root"):
                raise ValueError("File rules require root")
            if rule["type"] == "claude_session" and rule.get("provider") not in CLAUDE_PROVIDERS:
                raise ValueError("Claude session rules require a supported provider")
    return tools


def _flash_detail(model):
    return "Flash" if model and "flash" in model.lower() else None


def detect_status(tools):
    now = time.time()
    processes = []
    for process in psutil.process_iter(attrs=["pid", "ppid", "name", "cmdline", "create_time"]):
        try:
            processes.append({"pid": process.info["pid"], "ppid": process.info["ppid"],
                              "created": process.info["create_time"], "name": process.info["name"] or "",
                              "command": " ".join(process.info["cmdline"] or [])})
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    agents = []
    for tool in tools:
        active = False
        detail = None
        for rule in tool["rules"]:
            try:
                result = RULE_DETECTORS[rule["type"]](rule, processes, now)
            except (OSError, psutil.Error):
                continue
            if not result:
                continue
            active = True
            if isinstance(result, dict):
                detail = _flash_detail(result.get("model"))
            break
        agent = {"id": tool["id"], "name": tool["name"], "status": "working" if active else "idle"}
        if detail:
            agent["detail"] = detail
        agents.append(agent)
    return {"ts": int(now), "agents": agents}
