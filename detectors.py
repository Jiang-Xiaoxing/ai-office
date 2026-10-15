"""Configuration-driven local activity detection. Never exports process arguments.

A running CLI counts as active, including its own input-wait time. File recency is
a heuristic, not proof that a model is generating. Register a new rule detector
here when a future tool offers a stronger activity signal.
"""
import datetime
import json
import re
import time
from pathlib import Path

import psutil


CLAUDE_PROVIDERS = {"deepseek", "openrouter"}
CLAUDE_LAUNCHER = re.compile(r'''(?:^|[/\s"'])cc-(deepseek|openrouter)\.cmd(?=$|[\s"'&|<>])''')


def claude_session(rule, processes, now):
    """Identify each Claude CLI by its nearest launch context, never by name alone.

    Only inspect command lines already in the local process snapshot. Do not read
    launcher contents, environment variables or credentials. A wrapper without a
    live Claude descendant, or an ambiguous/unmarked session, is not activity.
    """
    by_pid = {p["pid"]: p for p in processes if p.get("pid") is not None}
    for process in processes:
        name = process["name"].lower()
        command = process["command"].lower().replace("\\", "/")
        if name not in {"claude.exe", "claude"}:
            if name not in {"node.exe", "node"} or not re.search(
                    r"(?:^|/)@anthropic-ai/claude-code/", command):
                continue
        current, seen = process, set()
        for _ in range(32):
            pid = current.get("pid")
            if pid is not None and pid in seen:
                break
            seen.add(pid)
            providers = set(CLAUDE_LAUNCHER.findall(current["command"].lower().replace("\\", "/")))
            if providers:
                if providers == {rule["provider"]}:
                    return True
                break  # Another provider or both markers: never claim this CLI.
            parent = by_pid.get(current.get("ppid"))
            if parent is None:
                break
            # A reused PID must not attach a surviving CLI to an unrelated shell.
            if (parent.get("created") is not None and current.get("created") is not None
                    and parent["created"] > current["created"]):
                break
            current = parent
    return False


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


# Extension point: callable(rule, processes, now) -> bool. Rules within a tool OR together.
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
        for rule in tool["rules"]:
            try:
                if RULE_DETECTORS[rule["type"]](rule, processes, now):
                    active = True
                    break
            except (OSError, psutil.Error):
                continue
        agents.append({"id": tool["id"], "name": tool["name"],
                       "status": "working" if active else "idle"})
    return {"ts": int(now), "agents": agents}
