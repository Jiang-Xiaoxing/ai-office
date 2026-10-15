"""Concurrent tabs and disconnects must never accumulate detector scans."""
import asyncio
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server_app import StatusScan


class ScanTests(unittest.IsolatedAsyncioTestCase):
    async def test_concurrent_tabs_share_one_scan_and_disconnection_isolated(self):
        entered, release = threading.Event(), threading.Event()
        calls = []
        def detect(tools):
            calls.append(1)
            entered.set()
            release.wait(5)
            return {'ts': 1, 'agents': []}
        with patch('server_app.detect_status', detect):
            scans = StatusScan()
            readers = [asyncio.create_task(scans.read()) for _ in range(32)]
            await asyncio.to_thread(entered.wait, 5)
            readers[0].cancel()
            await asyncio.gather(readers[0], return_exceptions=True)
            self.assertFalse(scans.task.cancelled())
            release.set()
            results = await asyncio.gather(*readers[1:])
            self.assertEqual(len(calls), 1)
            self.assertTrue(all(r == results[0] for r in results))
            await asyncio.sleep(0)
            self.assertIsNone(scans.task)
            await scans.read()
            self.assertEqual(len(calls), 2, 'next request gets a fresh scan')
            await scans.close()
            self.assertIsNone(scans.task)

    async def test_failure_releases_the_slot(self):
        with patch('server_app.detect_status', side_effect=RuntimeError('scan failed')):
            scans = StatusScan()
            with self.assertRaises(RuntimeError):
                await scans.read()
            self.assertIsNone(scans.task)
        with patch('server_app.detect_status', return_value={'ts': 2, 'agents': []}):
            self.assertEqual((await scans.read())['ts'], 2)
            await scans.close()


if __name__ == '__main__':
    unittest.main()
