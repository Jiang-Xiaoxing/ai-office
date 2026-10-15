"""Meaningful rule regressions using fake processes and D-drive temporary files."""
import datetime
import json
import os
import sys
import tempfile
import time
import unittest
import urllib.request
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from detectors import detect_status, load_tools, process_matches, recent_files


class DetectorTests(unittest.TestCase):
    def setUp(self):
        self.tools = load_tools(ROOT / "config" / "tools.json")

    def processes(self, tool, *items):
        return any(process_matches(rule, list(items), time.time()) for rule in
                   self.tools[tool]["rules"] if rule["type"] == "process")

    def test_codex_excludes_background_services(self):
        for service in ("app-server", "exec-server", "mcp-server", "sandbox"):
            self.assertFalse(self.processes(0, {"name": "codex.exe", "command": f"codex {service}"}))
        self.assertTrue(self.processes(0, {"name": "CODEX.EXE", "command": "codex --model local"}))
        self.assertFalse(self.processes(0, {"name": "other.exe", "command": "codex"}))

    def test_codebuddy_requires_matching_process_and_all_arguments(self):
        self.assertTrue(self.processes(1, {"name": "node.exe", "command": r"D:\npm\codebuddy-code\bin\codebuddy"}))
        self.assertFalse(self.processes(1, {"name": "node.exe", "command": "unrelated-web-server"}))
        self.assertFalse(self.processes(1, {"name": "node.exe", "command": "codebuddy-code readme"}))
        self.assertTrue(self.processes(1, {"name": "codebuddy.exe", "command": "codebuddy"}))

    def test_claude_native_and_node_variants(self):
        self.assertTrue(self.processes(2, {"name": "claude.exe", "command": "claude"}))
        self.assertTrue(self.processes(2, {"name": "node.exe", "command": "@anthropic-ai/claude-code/cli.js"}))
        self.assertFalse(self.processes(2, {"name": "node.exe", "command": "other/claude-code.js"}))

    def test_recent_file_window_date_rollover_and_future_mtime(self):
        temp_root = ROOT / ".browser-tmp"
        temp_root.mkdir(exist_ok=True)
        now = time.time()
        with tempfile.TemporaryDirectory(dir=temp_root) as directory:
            root = Path(directory)
            yesterday = datetime.date.fromtimestamp(now)-datetime.timedelta(days=1)
            folder = root / yesterday.strftime("%Y/%m/%d")
            folder.mkdir(parents=True)
            file = folder / "session.jsonl"
            file.write_text("{}", encoding="utf-8")
            rule = {"root": directory, "pattern": "*.jsonl", "dated_directories": True,
                    "lookback_days": 3, "active_seconds": 30}
            for age, expected in ((5, True), (31, False), (-90, False)):
                os.utime(file, (now-age, now-age))
                self.assertEqual(recent_files(rule, [], now), expected)

    def test_configuration_rejects_unknown_rule_and_duplicate_ids(self):
        temp_root = ROOT / ".browser-tmp"
        temp_root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=temp_root) as directory:
            file = Path(directory) / "tools.json"
            for rules in ([{"type": "unknown"}], [{"type": "process", "names": []}]):
                file.write_text(json.dumps({"tools": [{"id": "test", "name": "Test", "rules": rules}]}))
                with self.assertRaises(ValueError):
                    load_tools(file)
            file.write_text(json.dumps({"tools": [self.tools[0], self.tools[0]]}))
            with self.assertRaises(ValueError):
                load_tools(file)

    def test_status_never_exposes_process_commands(self):
        tool = {"id": "test", "name": "Test", "rules": [{"type": "process", "names": ["test.exe"]}]}
        with patch("detectors.psutil.process_iter", return_value=[]):
            payload = detect_status([tool])
        self.assertEqual(payload["agents"], [{"id": "test", "name": "Test", "status": "idle"}])
        self.assertEqual(set(payload), {"ts", "agents"})

    def test_live_independent_local_api(self):
        with urllib.request.urlopen("http://127.0.0.1:8889/api/status") as response:
            data = json.load(response)
            self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual({a["id"] for a in data["agents"]}, {t["id"] for t in self.tools})
        self.assertTrue(all(a["status"] in ("working", "idle") for a in data["agents"]))


if __name__ == "__main__":
    unittest.main()
