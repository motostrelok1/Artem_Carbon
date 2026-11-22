#!/usr/bin/env python3
"""Ensure deploy bootstraps the updated script, not the prior shell's open file."""
import subprocess
import textwrap
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github/workflows/deploy-vds.yml"

class DeployBootstrapTests(unittest.TestCase):
    def test_checkout_precedes_exec_and_shell_is_valid(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("git -c safe.directory=\"$repo\" -C \"$repo\" fetch --depth=1 origin main", text)
        self.assertIn("git -c safe.directory=\"$repo\" -C \"$repo\" checkout -f FETCH_HEAD", text)
        self.assertIn("exec /usr/bin/bash \"$repo/scripts/deploy-full-vds.sh\"", text)
        self.assertLess(text.index("checkout -f FETCH_HEAD"), text.index("exec /usr/bin/bash"))
        # The last run: block is the SSH deployment command. Validate actual Bash quoting.
        command = textwrap.dedent(text.rsplit("        run: |\n", 1)[1])
        result = subprocess.run(
            ["bash", "-n"], input=command, capture_output=True, text=True
        )
        self.assertEqual(result.returncode, 0, result.stderr)

if __name__ == "__main__":
    unittest.main()
