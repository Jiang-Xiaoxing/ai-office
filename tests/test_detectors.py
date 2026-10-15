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

CLAUDE_IDS = ("openrouter", "claude-code", "claude-code-other")
IDLE = {tool: "idle" for tool in CLAUDE_IDS}
NONE_DETAIL = {tool: None for tool in CLAUDE_IDS}
DEEPSEEK_ENV = {"ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
                "ANTHROPIC_MODEL": "deepseek-v4-pro"}
OPENROUTER_ENV = {"ANTHROPIC_BASE_URL": "https://openrouter.ai/api",
                  "ANTHROPIC_MODEL": "nvidia/nemotron-3-ultra-550b-a55b:free"}


class DetectorTests(unittest.TestCase):
    def setUp(self):
        self.tools = load_tools(ROOT / "config" / "tools.json")

    def processes(self, tool, *items):
        return any(process_matches(rule, list(items), time.time()) for rule in
                   self.tools[tool]["rules"] if rule["type"] == "process")

    def detect(self, *items):
        env_by_pid = {}
        processes = []
        for item in items:
            pid, ppid, name, command, created = item[:5]
            env = item[5] if len(item) > 5 else {}
            env_by_pid[pid] = env
            processes.append(Mock(info={"pid": pid, "ppid": ppid, "name": name,
                                        "cmdline": command, "create_time": created}))
        with patch("detectors.psutil.process_iter", return_value=processes) as snapshot, \
             patch("detectors.psutil.Process",
                   side_effect=lambda pid: Mock(environ=Mock(return_value=env_by_pid.get(pid, {})))):
            payload = detect_status(self.tools[1:])
        self.assertEqual(set(snapshot.call_args.kwargs["attrs"]),
                         {"pid", "ppid", "name", "cmdline", "create_time"})
        self.assertEqual(set(payload), {"ts", "agents"})
        self.assertEqual({a["id"] for a in payload["agents"]}, set(CLAUDE_IDS))
        for agent in payload["agents"]:
            self.assertTrue({"id", "name", "status"} <= set(agent) <= {"id", "name", "status", "detail"})
        return {a["id"]: a for a in payload["agents"]}

    def status_for(self, *items):
        return {tool: agent["status"] for tool, agent in self.detect(*items).items()}

    def detail_for(self, *items):
        return {tool: agent.get("detail") for tool, agent in self.detect(*items).items()}

    @staticmethod
    def cli(pid, ppid, env=None, native=True):
        return (pid, ppid, "claude.exe" if native else "node.exe",
                ["claude.exe"] if native else ["node.exe", r"D:\npm\@anthropic-ai\claude-code\cli.js"],
                2, env or {})

    def test_codex_matches_any_codex_process(self):
        for command in ("codex app-server", "codex exec-server", "codex mcp-server", "codex sandbox",
                        "codex exec run", r"C:\Users\me\AppData\Local\OpenAI\Codex\bin\abcd\codex.exe -c x"):
            self.assertTrue(self.processes(0, {"name": "codex.exe", "command": command}))
        self.assertTrue(self.processes(0, {"name": "CODEX.EXE", "command": "codex --model local"}))
        self.assertFalse(self.processes(0, {"name": "other.exe", "command": "codex"}))

    def test_deepseek_and_openrouter_and_unknown_services_are_independent(self):
        for native in (True, False):
            deepseek = (100, 0, "cmd.exe", ["cmd.exe", "/c", "cc-deepseek-flash.cmd"], 1), \
                self.cli(101, 100, DEEPSEEK_ENV, native=native)
            openrouter = (200, 0, "cmd.exe", ["cmd.exe", "/c", "cc-openrouter.cmd"], 1), \
                self.cli(201, 200, OPENROUTER_ENV, native=native)
            with self.subTest(native=native):
                self.assertEqual(self.status_for(*deepseek), {**IDLE, "claude-code": "working"})
                self.assertEqual(self.status_for(*openrouter), {**IDLE, "openrouter": "working"})
                self.assertEqual(self.status_for(*deepseek, *openrouter),
                                 {"openrouter": "working", "claude-code": "working",
                                  "claude-code-other": "idle"})

    def test_unmarked_claude_is_working_under_other_role(self):
        # A live Claude Code CLI whose service cannot be read still counts as working.
        self.assertEqual(self.status_for(self.cli(101, 100)),
                         {**IDLE, "claude-code-other": "working"})
        self.assertEqual(self.detail_for(self.cli(101, 100)), {"openrouter": None, "claude-code": None,
                                                               "claude-code-other": None})
        # A launcher window without a live CLI, and unrelated processes, stay idle.
        self.assertEqual(self.status_for((1, 0, "cmd.exe", ["cmd.exe", "/c", "cc-deepseek.cmd"], 1)), IDLE)
        self.assertEqual(self.status_for((1, 0, "codebuddy.exe", ["codebuddy"], 1)), IDLE)
        self.assertEqual(self.status_for((1, 0, "node.exe", ["other/claude-code.js", "cc-openrouter.cmd"], 1)), IDLE)

    def test_flash_model_is_marked_and_other_models_are_not(self):
        flash_env = dict(DEEPSEEK_ENV, ANTHROPIC_MODEL="deepseek-v4-flash")
        self.assertEqual(self.detail_for((1, 0, "cmd.exe", ["cmd.exe", "/c", "cc-deepseek.cmd"], 1),
                                         self.cli(2, 1, flash_env)),
                         {**NONE_DETAIL, "claude-code": "Flash"})
        self.assertEqual(self.detail_for((1, 0, "cmd.exe", ["cmd.exe", "/c", "cc-deepseek.cmd"], 1),
                                         self.cli(2, 1, DEEPSEEK_ENV)),
                         {**NONE_DETAIL, "claude-code": None})

    def test_service_reads_env_then_command_line_then_ancestors(self):
        # Command-line fallback when the CLI's environment is unreadable but an
        # ancestor's command line names the service generically.
        self.assertEqual(self.status_for((1, 0, "cmd.exe", ["cmd.exe", "/c", "cc-openrouter.cmd"], 1),
                                         self.cli(2, 1, {}, native=True)),
                         {**IDLE, "openrouter": "working"})
        # Ancestor environment is consulted when the CLI itself has none.
        self.assertEqual(self.status_for((1, 0, "cmd.exe", ["cmd.exe", "/c", "cc-deepseek-flash.cmd"], 1, DEEPSEEK_ENV),
                                         self.cli(2, 1, {}, native=True)),
                         {**IDLE, "claude-code": "working"})

    def test_cycles_and_pid_reuse_fail_closed(self):
        # A cycle in the parent chain must not loop forever; a reused PID must not
        # attach a surviving CLI to an unrelated, newer shell.
        self.assertEqual(self.status_for((1, 2, "claude.exe", ["claude"], 1),
                                         (2, 1, "cmd.exe", ["cmd"], 1)),
                         {**IDLE, "claude-code-other": "working"})
        # A newer parent is a reused PID, so its marker is not trusted: the CLI
        # falls back to the generic "other" role rather than openrouter.
        self.assertEqual(self.status_for((100, 0, "cmd.exe", ["cmd.exe", "/c", "cc-openrouter.cmd"], 3),
                                         self.cli(101, 100, {}, native=True)),
                         {**IDLE, "claude-code-other": "working"})

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
                          [{"type": "claude_session"}], [{"type": "claude_session", "provider": "anthropic"}]):
                file.write_text(json.dumps({"tools": [{"id": "test", "name": "Test", "rules": rules}]}))
                with self.assertRaises(ValueError):
                    load_tools(file)
            file.write_text(json.dumps({"tools": [self.tools[0], self.tools[0]]}))
            with self.assertRaises(ValueError):
                load_tools(file)

    def test_configuration_accepts_other_claude_provider(self):
        self.assertEqual({tool["id"] for tool in self.tools},
                         {"codex", "openrouter", "claude-code", "claude-code-other"})

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
