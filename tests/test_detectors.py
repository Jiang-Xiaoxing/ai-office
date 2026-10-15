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
from unittest.mock import Mock, patch

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

    def status_for(self, *items):
        processes = [Mock(info={"pid": pid, "ppid": ppid, "name": name, "cmdline": command,
                                "create_time": created})
                     for pid, ppid, name, command, created in items]
        with patch("detectors.psutil.process_iter", return_value=processes) as snapshot:
            payload = detect_status(self.tools[1:])
        self.assertEqual(set(snapshot.call_args.kwargs["attrs"]),
                         {"pid", "ppid", "name", "cmdline", "create_time"})
        self.assertEqual(set(payload), {"ts", "agents"})
        self.assertTrue(all(set(a) == {"id", "name", "status"} for a in payload["agents"]))
        return {a["id"]: a["status"] for a in payload["agents"]}

    @staticmethod
    def session(provider, base=100, native=True):
        return [(base, 0, "cmd.exe", ["cmd.exe", "/c", rf"D:\Tools\ClaudeCode\cc-{provider}.cmd"], 1),
                (base+1, base, "claude.exe" if native else "node.exe",
                 ["claude.exe"] if native else ["node.exe", r"D:\npm\@anthropic-ai\claude-code\cli.js"], 2)]

    def test_deepseek_and_openrouter_native_and_node_sessions_are_independent(self):
        for native in (True, False):
            for provider, active_id in (("deepseek", "claude-code"), ("openrouter", "openrouter")):
                with self.subTest(provider=provider, native=native):
                    state = self.status_for(*self.session(provider, native=native))
                    self.assertEqual(state, {tool: "working" if tool == active_id else "idle"
                                             for tool in ("openrouter", "claude-code")})
            self.assertEqual(self.status_for(*self.session("deepseek", native=native),
                                             *self.session("openrouter", base=200, native=native)),
                             {"openrouter": "working", "claude-code": "working"})

    def test_unmarked_claude_and_launcher_without_cli_are_idle(self):
        idle = {"openrouter": "idle", "claude-code": "idle"}
        self.assertEqual(self.status_for(), idle)
        self.assertEqual(self.status_for((1, 0, "claude.exe", ["claude.exe"], 1)), idle)
        self.assertEqual(self.status_for(self.session("openrouter")[0]), idle)
        self.assertEqual(self.status_for((1, 0, "codebuddy.exe", ["codebuddy"], 1)), idle)
        self.assertEqual(self.status_for((1, 0, "node.exe", ["other/claude-code.js", "cc-openrouter.cmd"], 1)), idle)

    def test_ancestor_markers_direct_markers_and_nearest_context(self):
        expected = {"openrouter": "working", "claude-code": "idle"}
        self.assertEqual(self.status_for((3, 0, "CLAUDE.EXE", ["claude", "CC-OPENROUTER.CMD"], 1)), expected)
        wrapper, cli = self.session("openrouter")
        self.assertEqual(self.status_for(wrapper, (150, 100, "cmd.exe", ["cmd", "/c", "claude"], 1.5),
                                        (cli[0], 150, *cli[2:])), expected)
        self.assertEqual(self.status_for((99, 0, "cmd.exe", ["cc-deepseek.cmd"], 0),
                                        (100, 99, *wrapper[2:]), cli), expected)

    def test_ambiguous_markers_missing_ancestors_cycles_and_pid_reuse_fail_closed(self):
        idle = {"openrouter": "idle", "claude-code": "idle"}
        for wrapper in (["cc-openrouter.cmd", "cc-deepseek.cmd"], ["cc-openrouter.cmd.bak"],
                        ["not-cc-openrouter.cmd"], ["cc-openrouter.cmd-other"]):
            self.assertEqual(self.status_for((100, 0, "cmd.exe", wrapper, 1),
                                            self.session("openrouter")[1]), idle)
        self.assertEqual(self.status_for(self.session("openrouter")[1]), idle)
        self.assertEqual(self.status_for((1, 2, "claude.exe", ["claude"], 1),
                                        (2, 1, "cmd.exe", ["cmd"], 1)), idle)
        self.assertEqual(self.status_for((100, 0, "cmd.exe", ["cc-openrouter.cmd"], 3),
                                        self.session("openrouter")[1]), idle)

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
            for rules in ([{"type": "unknown"}], [{"type": "process", "names": []}],
                          [{"type": "claude_session"}], [{"type": "claude_session", "provider": "other"}]):
                file.write_text(json.dumps({"tools": [{"id": "test", "name": "Test", "rules": rules}]}))
                with self.assertRaises(ValueError):
                    load_tools(file)
            file.write_text(json.dumps({"tools": [self.tools[0], self.tools[0]]}))
            with self.assertRaises(ValueError):
                load_tools(file)

    def test_status_never_exposes_process_commands(self):
        tool = {"id": "test", "name": "Test", "rules": [{"type": "process", "names": ["test.exe"]}]}
        process = Mock(info={"pid": 1, "ppid": 0, "name": "test.exe",
                             "cmdline": ["test.exe", "private-argument"], "create_time": 1})
        with patch("detectors.psutil.process_iter", return_value=[process]):
            payload = detect_status([tool])
        self.assertEqual(payload["agents"], [{"id": "test", "name": "Test", "status": "working"}])
        self.assertNotIn("private-argument", json.dumps(payload))
        self.assertEqual(set(payload), {"ts", "agents"})

    def test_live_independent_local_api(self):
        with urllib.request.urlopen(os.environ.get("OFFICE_URL", "http://127.0.0.1:8889").rstrip("/") + "/api/status") as response:
            data = json.load(response)
            self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual({a["id"] for a in data["agents"]}, {t["id"] for t in self.tools})
        self.assertTrue(all(a["status"] in ("working", "idle") for a in data["agents"]))


if __name__ == "__main__":
    unittest.main()
