"""Export detector-derived browser fixtures; no real CLIs or providers are called."""
import json
import sys
from pathlib import Path
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from detectors import detect_status, load_tools


def simulate(providers):
    processes = []
    for index, provider in enumerate(providers):
        pid = 100 + index * 10
        for info in (
            {"pid": pid, "ppid": 0, "name": "cmd.exe", "create_time": 1,
             "cmdline": ["cmd.exe", "/c", rf"D:\Tools\ClaudeCode\cc-{provider}.cmd"]},
            {"pid": pid+1, "ppid": pid, "name": "claude.exe", "create_time": 2,
             "cmdline": ["claude.exe"]},
        ):
            processes.append(Mock(info=info))
    # Keep Codex idle independently of this machine's actual session files.
    tools = load_tools(ROOT / "config" / "tools.json")
    tools[0]["rules"] = [{"type": "process", "names": ["codex.exe"]}]
    with patch("detectors.psutil.process_iter", return_value=processes):
        return detect_status(tools)


if __name__ == "__main__":
    print(json.dumps({"deepseek": simulate(["deepseek"]),
                      "openrouter": simulate(["openrouter"]),
                      "both": simulate(["deepseek", "openrouter"]),
                      "idle": simulate([])}))
