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
RULE_DETECTORS = {"process": process_matches, "recent_files": recent_files}


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
    return tools


def detect_status(tools):
    now = time.time()
    processes = []
    for process in psutil.process_iter(attrs=["name", "cmdline"]):
        try:
            processes.append({"name": process.info["name"] or "",
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
