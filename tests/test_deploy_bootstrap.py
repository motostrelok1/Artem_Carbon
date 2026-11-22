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
        invocation = "sudo -n /usr/bin/bash /opt/artems-carbon/repo/scripts/deploy-full-vds.sh"
        self.assertEqual(text.count(invocation), 2)
        self.assertNotIn("sudo -n /usr/bin/bash -c", text)
        # First run updates the repository with the legacy script; second
        # starts the script from the updated checkout using existing sudoers.
        # The last run: block is the SSH deployment command. Validate actual Bash quoting.
        command = textwrap.dedent(text.rsplit("        run: |\n", 1)[1])
        result = subprocess.run(
            ["bash", "-n"], input=command, capture_output=True, text=True
        )
        self.assertEqual(result.returncode, 0, result.stderr)

if __name__ == "__main__":
    unittest.main()
