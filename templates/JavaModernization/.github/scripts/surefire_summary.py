#!/usr/bin/env python3
"""Sum Maven Surefire results for every module under a directory.

Prints GitHub Actions output lines: tests, failures, errors, skipped, reports.
Usage: surefire_summary.py asset-manager >> "$GITHUB_OUTPUT"
"""
import pathlib
import sys
import xml.etree.ElementTree as ET


def main():
    root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    totals = {"tests": 0, "failures": 0, "errors": 0, "skipped": 0}
    reports = 0
    for report in root.rglob("target/surefire-reports/TEST-*.xml"):
        suite = ET.parse(report).getroot()
        reports += 1
        for key in totals:
            totals[key] += int(suite.attrib.get(key, 0))
    for key, value in totals.items():
        print(f"{key}={value}")
    print(f"reports={reports}")


if __name__ == "__main__":
    main()
