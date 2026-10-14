# -*- coding: utf-8 -*-
"""
AI 办公室后端 —— 端口 8889
像素风 AI 工具状态看板：检测 Codex / CodeBuddy / Claude Code 是否在干活。
绑 127.0.0.1，外网不可达。
启动: D:\\ai-office\\venv\\Scripts\\pythonw.exe D:\\ai-office\\server_app.py
"""
import os
import sys
import time
import json
import glob
import datetime
from pathlib import Path

import psutil
from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

BASE_DIR = Path(__file__).parent.resolve()
STATIC_DIR = BASE_DIR / "static"
HOME = Path.home()
CODEX_SESSIONS = HOME / ".codex" / "sessions"

app = FastAPI(title="AI Office")

# --------------------------------------------------------------------------- #
#  工具检测器注册表 —— 想加新工具就往 TOOLS 里加一个 dict
#  每个 dict 需要字段:
#    id        : 唯一标识 (英文, 用于前端)
#    name      : 显示名 (中文)
#    check     : 无参数函数 -> bool, True=干活中, False=空闲
# --------------------------------------------------------------------------- #

ACTIVE_WINDOW_SECONDS = 30   # Codex 会话文件 30 秒内修改过视为干活中


def _check_codex() -> bool:
    """Codex CLI: 看近期会话文件是否在活跃写入, 或 codex.exe(非后台子进程)在跑."""
    # 1) 扫今天的会话目录
    now = time.time()
    today = datetime.date.today()
    for delta in range(3):           # 今天 + 往前两天兜底
        d = today - datetime.timedelta(days=delta)
        sess_dir = CODEX_SESSIONS / str(d.year) / f"{d.month:02d}" / f"{d.day:02d}"
        if not sess_dir.is_dir():
            continue
        for f in glob.glob(str(sess_dir / "*.jsonl")):
            try:
                if now - os.path.getmtime(f) < ACTIVE_WINDOW_SECONDS:
                    return True
            except OSError:
                continue
    # 2) 有 codex.exe 进程(排除 app-server/exec-server/mcp-server 后台进程)
    for p in psutil.process_iter(attrs=["name", "cmdline"]):
        try:
            name = (p.info["name"] or "").lower()
            if name != "codex.exe":
                continue
            cmdline = " ".join(p.info["cmdline"] or [])
            if any(kw in cmdline.lower() for kw in ("app-server", "exec-server", "mcp-server", "sandbox")):
                continue
            return True
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return False


def _check_codebuddy() -> bool:
    """CodeBuddy CLI: node.exe 运行 codebuddy-code/bin/codebuddy 命令行."""
    for p in psutil.process_iter(attrs=["name", "cmdline"]):
        try:
            name = (p.info["name"] or "").lower()
            if name != "node.exe":
                continue
            cmdline = " ".join(p.info["cmdline"] or [])
            if "codebuddy-code" in cmdline.lower() and "bin" in cmdline.lower() and "codebuddy" in cmdline.lower():
                return True
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return False


def _check_claude_code() -> bool:
    """Claude Code: 进程名 claude.exe 存在即干活."""
    for p in psutil.process_iter(attrs=["name"]):
        try:
            if (p.info["name"] or "").lower() == "claude.exe":
                return True
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return False


TOOLS = [
    {"id": "codex",       "name": "Codex",       "check": _check_codex},
    {"id": "codebuddy",   "name": "CodeBuddy",   "check": _check_codebuddy},
    {"id": "claude-code", "name": "Claude Code", "check": _check_claude_code},
]


@app.get("/api/status")
def api_status():
    """返回各工具状态 + 时间戳."""
    agents = []
    for tool in TOOLS:
        try:
            active = bool(tool["check"]())
        except Exception:
            active = False
        agents.append({"id": tool["id"], "name": tool["name"], "status": "working" if active else "idle"})
    return {"ts": int(time.time()), "agents": agents}


@app.get("/api/healthz")
def healthz():
    return JSONResponse({"ok": True})


# ---- 静态前端 ---- #
if STATIC_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def index():
    index_file = STATIC_DIR / "index.html"
    if index_file.is_file():
        return FileResponse(str(index_file), media_type="text/html; charset=utf-8")
    return JSONResponse({"error": "index.html not found"}, status_code=404)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8889, log_level="warning")
