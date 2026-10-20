#!/usr/bin/env python3
"""Turn the raw output of standard Java tools into assessment facts.

No AI. Every value comes from a file in the repository, a tool output file, or a public
metadata service (Maven Central, OSV.dev). The agents read these facts; they do not discover them.

summarize: read the raw tool outputs and the source tree, write facts.json and facts.md.
osv:       query OSV.dev for known vulnerabilities in the resolved dependency trees.

Usage:
  modernize_facts.py summarize --project asset-manager --raw facts/raw --out facts \
      [--repo owner/name --sha <commit>]
  modernize_facts.py osv --trees facts/raw --out facts/osv.json
"""
import argparse
import datetime
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

POM_NS = {"m": "http://maven.apache.org/POM/4.0.0"}

# javax packages that moved to jakarta.* in Jakarta EE 9+. Everything else under javax ships with the JDK.
JAKARTA_PACKAGES = (
    "javax.persistence", "javax.servlet", "javax.validation", "javax.transaction", "javax.ws.rs",
    "javax.jms", "javax.mail", "javax.inject", "javax.websocket", "javax.el", "javax.faces",
    "javax.xml.bind", "javax.activation", "javax.enterprise", "javax.interceptor", "javax.json",
    "javax.ejb", "javax.batch", "javax.security.enterprise", "javax.xml.ws", "javax.jws",
)
# javax.annotation is split: the Common Annotations moved, javax.annotation.processing is JDK.
JAKARTA_ANNOTATIONS = ("PostConstruct", "PreDestroy", "Resource", "Resources", "Generated", "Priority", "ManagedBean")

SPRING_STEREOTYPES = {
    "controllers": r"@(Rest)?Controller\b",
    "services": r"@Service\b",
    "repositories": r"@Repository\b|extends\s+(Jpa|Crud|PagingAndSorting)Repository",
    "entities": r"@Entity\b",
    "configurations": r"@Configuration\b",
    "listeners": r"@RabbitListener\b|@KafkaListener\b|@JmsListener\b|@EventListener\b",
    "scheduled": r"@Scheduled\b",
}

PRERELEASE = re.compile(r"(?i)-(M\d+|RC\d*|alpha|beta|SNAPSHOT|CR\d*)")


def text(node, path):
    found = node.find(path, POM_NS)
    return found.text.strip() if found is not None and found.text else None


def read_pom(path):
    root = ET.parse(path).getroot()
    deps = []
    for dep in root.findall("m:dependencies/m:dependency", POM_NS):
        deps.append({
            "group": text(dep, "m:groupId"),
            "artifact": text(dep, "m:artifactId"),
            "version": text(dep, "m:version"),
            "scope": text(dep, "m:scope") or "compile",
        })
    plugins = []
    for plugin in root.findall("m:build/m:plugins/m:plugin", POM_NS):
        plugins.append({"group": text(plugin, "m:groupId") or "org.apache.maven.plugins", "artifact": text(plugin, "m:artifactId"), "version": text(plugin, "m:version")})
    props = {}
    props_node = root.find("m:properties", POM_NS)
    if props_node is not None:
        for child in props_node:
            props[child.tag.split("}")[-1]] = (child.text or "").strip()
    return {
        "artifact": text(root, "m:artifactId"),
        "packaging": text(root, "m:packaging") or "jar",
        "parent": {"group": text(root, "m:parent/m:groupId"), "artifact": text(root, "m:parent/m:artifactId"), "version": text(root, "m:parent/m:version")},
        "modules": [m.text.strip() for m in root.findall("m:modules/m:module", POM_NS)],
        "properties": props,
        "dependencies": deps,
        "plugins": plugins,
    }


def line_of(path, pattern):
    regex = re.compile(pattern)
    for number, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
        if regex.search(line):
            return number
    return None


def rel(path, base):
    return pathlib.Path(path).resolve().relative_to(base.resolve()).as_posix()


def build_facts(project, repo_root):
    root_pom = project / "pom.xml"
    parent = read_pom(root_pom)
    wrapper = project / ".mvn" / "wrapper" / "maven-wrapper.properties"
    maven = None
    if wrapper.exists():
        match = re.search(r"apache-maven-([\d.]+)-bin", wrapper.read_text())
        maven = match.group(1) if match else None
    modules = []
    for name in parent["modules"]:
        pom = read_pom(project / name / "pom.xml")
        pom["name"] = name
        pom["pom_path"] = rel(project / name / "pom.xml", repo_root)
        for dep in pom["dependencies"]:
            if dep["version"]:
                dep["line"] = line_of(project / name / "pom.xml", rf"<artifactId>{re.escape(dep['artifact'])}</artifactId>")
        modules.append(pom)
    return {
        "pom_path": rel(root_pom, repo_root),
        "java_version": parent["properties"].get("java.version"),
        "java_version_line": line_of(root_pom, r"<java\.version>"),
        "spring_boot_version": parent["parent"]["version"] if parent["parent"]["artifact"] == "spring-boot-starter-parent" else None,
        "spring_boot_line": line_of(root_pom, r"<artifactId>spring-boot-starter-parent</artifactId>"),
        "maven_wrapper": maven,
        "wrapper_path": rel(wrapper, repo_root) if wrapper.exists() else None,
        "modules": modules,
    }


def count_loc(path):
    return sum(1 for line in path.read_text(encoding="utf-8", errors="replace").splitlines() if line.strip())


def inventory(project, modules, repo_root):
    result = []
    for module in modules:
        base = project / module["name"]
        main = sorted((base / "src" / "main" / "java").rglob("*.java"))
        test = sorted((base / "src" / "test" / "java").rglob("*.java"))
        stereotypes = {key: 0 for key in SPRING_STEREOTYPES}
        for source in main:
            body = source.read_text(encoding="utf-8", errors="replace")
            for key, pattern in SPRING_STEREOTYPES.items():
                if re.search(pattern, body):
                    stereotypes[key] += 1
        config = []
        for resource in sorted((base / "src" / "main" / "resources").glob("application*.*")):
            keys = [line.split("=", 1)[0].strip() for line in resource.read_text(encoding="utf-8", errors="replace").splitlines()
                    if "=" in line and not line.lstrip().startswith("#")]
            config.append({"path": rel(resource, repo_root), "keys": keys})
        templates = sorted((base / "src" / "main" / "resources" / "templates").rglob("*.html")) if (base / "src" / "main" / "resources" / "templates").exists() else []
        result.append({
            "module": module["name"],
            "main_files": len(main),
            "main_loc": sum(count_loc(p) for p in main),
            "test_files": len(test),
            "test_loc": sum(count_loc(p) for p in test),
            "templates": len(templates),
            "spring": stereotypes,
            "config": config,
        })
    return result


def classify_javax(package, symbol):
    if package.startswith("javax.annotation.processing"):
        return "keep"
    if package == "javax.annotation" or package.startswith("javax.annotation."):
        return "jakarta" if symbol in JAKARTA_ANNOTATIONS or symbol == "*" else "keep"
    return "jakarta" if package.startswith(JAKARTA_PACKAGES) else "keep"


def javax_inventory(project, repo_root):
    regex = re.compile(r"^\s*import\s+(?:static\s+)?(javax\.[\w.]+?)\.(\w+|\*)\s*;")
    rows = []
    for source in sorted(project.rglob("*.java")):
        if "target" in source.parts:
            continue
        for number, line in enumerate(source.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            match = regex.match(line)
            if match:
                package, symbol = match.group(1), match.group(2)
                rows.append({
                    "path": rel(source, repo_root), "line": number, "import": f"{package}.{symbol}",
                    "package": package, "action": classify_javax(package, symbol),
                })
    return rows


def baseline_tests(raw, project):
    cases = []
    totals = {"tests": 0, "failures": 0, "errors": 0, "skipped": 0}
    report_root = raw / "baseline-tests" if (raw / "baseline-tests").exists() else project
    for report in sorted(report_root.rglob("TEST-*.xml")):
        suite = ET.parse(report).getroot()
        module = next((p for p in report.parts if p in ("web", "worker")), report.parts[-4] if len(report.parts) > 3 else "")
        for key in totals:
            totals[key] += int(suite.attrib.get(key, 0))
        for case in suite.findall("testcase"):
            status, message = "passed", ""
            for kind in ("failure", "error", "skipped"):
                node = case.find(kind)
                if node is not None:
                    status = {"failure": "failed", "error": "error", "skipped": "skipped"}[kind]
                    detail = node.attrib.get("message") or (node.text or "")
                    message = (node.attrib.get("type", "") + ": " + first_line(detail, 400)).strip(": ")
                    break
            cases.append({
                "module": module, "class": case.attrib.get("classname", ""), "name": case.attrib.get("name", ""),
                "status": status, "time": float(case.attrib.get("time", 0) or 0), "message": first_line(message, 240),
            })
    return {"jdk": "8", "totals": totals, "cases": cases}


def first_line(value, limit):
    lines = [line.strip() for line in (value or "").splitlines() if line.strip()]
    value = lines[0] if lines else ""
    return value if len(value) <= limit else value[: limit - 3] + "..."


def plural(count, word):
    return f"{count} {word}" if count == 1 else f"{count} {word}s"


def parse_tree(path):
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    direct, resolved = [], {}
    for line in lines[1:]:
        match = re.match(r"^([| ]*)[+\\]- (.+)$", line)
        if not match:
            continue
        depth = len(match.group(1)) // 3
        parts = match.group(2).split(" ")[0].split(":")
        if len(parts) < 5:
            continue
        group, artifact = parts[0], parts[1]
        # group:artifact:type:version:scope or group:artifact:type:classifier:version:scope
        version, scope = (parts[3], parts[4]) if len(parts) == 5 else (parts[4], parts[5])
        entry = {"group": group, "artifact": artifact, "version": version, "scope": scope, "depth": depth}
        resolved[f"{group}:{artifact}"] = entry
        if depth == 0:
            direct.append(entry)
    return {"root": lines[0] if lines else "", "direct": direct, "resolved": list(resolved.values())}


def parse_updates(path):
    updates, pending = [], None
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        match = re.match(r"^\s+([\w.\-]+:[\w.\-]+)\s*\.*\s*(?:([\w.\-]+)\s*->\s*([\w.\-]+))?\s*$", line)
        if match and match.group(2):
            updates.append({"coordinate": match.group(1), "current": match.group(2), "latest": match.group(3)})
            pending = None
        elif match:
            pending = match.group(1)
        elif pending:
            cont = re.match(r"^\s+([\w.\-]+)\s*->\s*([\w.\-]+)\s*$", line)
            if cont:
                updates.append({"coordinate": pending, "current": cont.group(1), "latest": cont.group(2)})
            pending = None
    for item in updates:
        item["prerelease"] = bool(PRERELEASE.search(item["latest"]))
    return updates


def parse_jdeps(path):
    findings, current = {}, None
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        header = re.match(r"^(\S+)\s+->\s+(.+)$", line)
        if header and not line.startswith(" "):
            current = header.group(1)
            findings.setdefault(current, {"artifact": current, "apis": set(), "kinds": set(), "examples": []})
            continue
        row = re.match(r"^\s+(\S+)\s+->\s+(\S+)\s+(.+)$", line)
        if row and current:
            entry = findings[current]
            entry["apis"].add(row.group(2))
            entry["kinds"].add(row.group(3).strip())
            if len(entry["examples"]) < 3:
                entry["examples"].append(f"{row.group(1)} -> {row.group(2)}")
    result = []
    for entry in findings.values():
        if not entry["apis"]:
            continue
        result.append({"artifact": entry["artifact"], "apis": sorted(entry["apis"]), "kinds": sorted(entry["kinds"]), "examples": entry["examples"],
                       "removed": any("removed" in k for k in entry["kinds"])})
    return result


def parse_jdeprscan(path):
    rows = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith(("class ", "error:", "warning:")) and "deprecated" in line:
            rows.append(line.strip())
    return rows


def parse_rewrite(raw):
    patch = raw / "rewrite.patch"
    log = raw / "rewrite.log"
    result = {"available": patch.exists() and patch.stat().st_size > 0, "files": [], "estimate_saved": None, "recipes": [], "target_boot": None}
    if log.exists():
        body = log.read_text(encoding="utf-8", errors="replace")
        match = re.search(r"Estimate time saved: (.+)", body)
        result["estimate_saved"] = match.group(1).strip() if match else None
        match = re.search(r"Using active recipe\(s\) \[(.+?)\]", body)
        result["recipes"] = [r.strip() for r in match.group(1).split(",")] if match else []
    if not result["available"]:
        return result
    current = None
    in_parent = False
    for line in patch.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("diff --git"):
            current = {"path": line.split(" b/", 1)[1], "added": 0, "removed": 0}
            result["files"].append(current)
            in_parent = False
        elif current and line.startswith("+") and not line.startswith("+++"):
            current["added"] += 1
            if in_parent and "<version>" in line and not result["target_boot"]:
                result["target_boot"] = re.sub(r"\s|</?version>", "", line[1:])
        elif current and line.startswith("-") and not line.startswith("---"):
            current["removed"] += 1
        if "spring-boot-starter-parent" in line:
            in_parent = True
    return result


PRIORITY = {"1": "High", "2": "Medium", "3": "Low"}


def parse_spotbugs(raw, project):
    """Read spotbugs-<module>.xml files. Returns None when SpotBugs did not run."""
    files = sorted(pathlib.Path(raw).glob("spotbugs-*.xml"))
    if not files:
        return None
    items = []
    for path in files:
        module = path.stem[len("spotbugs-"):]
        try:
            root = ET.parse(path).getroot()
        except ET.ParseError:
            continue
        for bug in root.findall("BugInstance"):
            cls = bug.find("Class")
            method = bug.find("Method")
            line = bug.find("SourceLine")
            source = line.attrib.get("sourcepath", "") if line is not None else ""
            items.append({
                "module": module, "type": bug.attrib.get("type", ""), "category": bug.attrib.get("category", ""),
                "priority": PRIORITY.get(bug.attrib.get("priority", ""), bug.attrib.get("priority", "")),
                "rank": int(bug.attrib.get("rank", 20)),
                "class": cls.attrib.get("classname", "") if cls is not None else "",
                "method": method.attrib.get("name", "") if method is not None else "",
                "path": f"{pathlib.PurePosixPath(project.as_posix()) / module / 'src/main/java' / source}" if source else "",
                "line": int(line.attrib["start"]) if line is not None and line.attrib.get("start", "").isdigit() else None,
            })
    return {"available": True, "tool": "SpotBugs 4.10.5.0 (spotbugs-maven-plugin)", "items": items}


def spotbugs_key(item):
    # Line numbers move between versions, so match on what the bug is and where it lives.
    return (item["module"], item["type"], item["class"], item["method"])


def compare_spotbugs(before, after):
    remaining = {}
    for item in before:
        remaining.setdefault(spotbugs_key(item), []).append(item)
    new = []
    for item in after:
        bucket = remaining.get(spotbugs_key(item))
        if bucket:
            bucket.pop()
        else:
            new.append(item)
    fixed = [i for bucket in remaining.values() for i in bucket]
    return new, fixed


def maven_latest(group, artifact, pattern):
    url = f"https://repo.maven.apache.org/maven2/{group.replace('.', '/')}/{artifact}/maven-metadata.xml"
    try:
        with urllib.request.urlopen(url, timeout=20) as response:
            root = ET.fromstring(response.read())
    except (urllib.error.URLError, ET.ParseError, TimeoutError):
        return None
    versions = [v.text for v in root.findall("versioning/versions/version") if v.text and re.fullmatch(pattern, v.text)]
    return max(versions, key=lambda v: [int(x) for x in re.findall(r"\d+", v)]) if versions else None


def summarize(args):
    project = pathlib.Path(args.project)
    repo_root = pathlib.Path(args.repo_root or ".")
    raw = pathlib.Path(args.raw)
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    build = build_facts(project, repo_root)
    trees, updates, jdeps, jdeprscan = {}, [], [], {}
    for module in [m["name"] for m in build["modules"]]:
        tree = raw / f"dependency-tree-{module}.txt"
        if tree.exists():
            trees[module] = parse_tree(tree)
        upd = raw / f"dependency-updates-{module}.txt"
        if upd.exists():
            updates += [dict(u, module=module) for u in parse_updates(upd)]
        jd = raw / f"jdeps-{module}.txt"
        if jd.exists():
            for row in parse_jdeps(jd):
                row["module"] = module
                jdeps.append(row)
        js = raw / f"jdeprscan-{module}.txt"
        if js.exists():
            jdeprscan[module] = parse_jdeprscan(js)
    # One row per artifact even if both modules pull it in.
    merged = {}
    for row in jdeps:
        key = row["artifact"]
        if key in merged:
            merged[key]["modules"] = sorted(set(merged[key]["modules"]) | {row["module"]})
        else:
            merged[key] = dict(row, modules=[row["module"]])
            merged[key].pop("module")
    osv = json.loads((raw / "osv.json").read_text()) if (raw / "osv.json").exists() else {"available": False, "items": []}

    facts = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "repository": args.repo,
        "commit": args.sha,
        "project": project.as_posix(),
        "build": build,
        "inventory": inventory(project, build["modules"], repo_root),
        "baseline": baseline_tests(raw, project),
        "dependencies": {m: {"direct": t["direct"], "resolved_count": len(t["resolved"])} for m, t in trees.items()},
        "updates": updates,
        "targets": {
            "spring_boot_3_5_latest": maven_latest("org.springframework.boot", "spring-boot-starter-parent", r"3\.5\.\d+"),
            "maven_3_9_latest": maven_latest("org.apache.maven", "apache-maven", r"3\.9\.\d+"),
        },
        "jdk21": {"internal_api": sorted(merged.values(), key=lambda r: (not r["removed"], r["artifact"])), "deprecated_for_removal": jdeprscan},
        "javax": javax_inventory(project, repo_root),
        "preview": parse_rewrite(raw),
        "vulnerabilities": osv,
        "spotbugs": parse_spotbugs(raw, project) or {"available": False, "items": []},
    }
    (out / "facts.json").write_text(json.dumps(facts, indent=2), encoding="utf-8")
    (out / "facts.md").write_text(render_markdown(facts, raw), encoding="utf-8")
    print(f"facts: {len(facts['javax'])} javax imports, {facts['baseline']['totals']['tests']} baseline tests, "
          f"{len(facts['jdk21']['internal_api'])} jdeps artifacts, {len(osv.get('items', []))} known vulnerabilities, "
          f"{len(facts['spotbugs']['items']) if facts['spotbugs']['available'] else 'no'} SpotBugs findings, "
          f"preview={'yes' if facts['preview']['available'] else 'no'}")


def link(facts, path, line=None):
    if not facts.get("repository") or not facts.get("commit"):
        return f"`{path}`" + (f":{line}" if line else "")
    anchor = f"#L{line}" if line else ""
    label = pathlib.PurePosixPath(path).name + (f":{line}" if line else "")
    return f"[{label}](https://github.com/{facts['repository']}/blob/{facts['commit']}/{path}{anchor})"


def render_markdown(facts, raw=None):
    """Evidence appendix. The assessment report embeds it; it is also committed with the plan."""
    b = facts["build"]
    lines = ["## Evidence measured by tools", "",
             f"Measured on commit `{(facts.get('commit') or 'local')[:12]}` at {facts['generated_at']}. No AI produced any number in this section.", ""]

    lines += ["### Build", "", "| Item | Value | Source |", "|---|---|---|",
              f"| Java release | {b['java_version']} | {link(facts, b['pom_path'], b['java_version_line'])} |",
              f"| Spring Boot parent | {b['spring_boot_version']} | {link(facts, b['pom_path'], b['spring_boot_line'])} |",
              f"| Maven Wrapper | {b['maven_wrapper']} | `{b['wrapper_path']}` |",
              f"| Modules | {', '.join(m['name'] for m in b['modules'])} | `{b['pom_path']}` |",
              f"| Latest Spring Boot 3.5.x on Maven Central | {facts['targets']['spring_boot_3_5_latest'] or 'unavailable'} | maven-metadata.xml |",
              f"| Latest Maven 3.9.x on Maven Central | {facts['targets']['maven_3_9_latest'] or 'unavailable'} | maven-metadata.xml |", ""]

    lines += ["### Code inventory", "", "| Module | Main classes | Main LOC | Test classes | Test LOC | Controllers | Services | Repositories | Entities | Listeners | Templates |",
              "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for m in facts["inventory"]:
        s = m["spring"]
        lines.append(f"| {m['module']} | {m['main_files']} | {m['main_loc']} | {m['test_files']} | {m['test_loc']} | {s['controllers']} | {s['services']} | {s['repositories']} | {s['entities']} | {s['listeners']} | {m['templates']} |")
    lines.append("")

    base = facts["baseline"]
    t = base["totals"]
    lines += ["### Baseline tests on JDK 8", "", f"`./mvnw test` on `main`: {plural(t['tests'], 'test')}, {plural(t['failures'], 'failure')}, {plural(t['errors'], 'error')}, {t['skipped']} skipped. The upgrade must be no worse than this.", ""]
    if base["cases"]:
        lines += ["| Module | Test | Result | Message |", "|---|---|---|---|"]
        for c in base["cases"]:
            lines.append(f"| {c['module']} | `{c['class'].split('.')[-1]}.{c['name']}` | {c['status']} | {c['message'].replace('|', '/') or ''} |")
        lines.append("")
    no_tests = [m["module"] for m in facts["inventory"] if m["test_files"] == 0]
    if no_tests:
        lines += [f"Modules with no tests: {', '.join(no_tests)}. Their behavior is not covered by the baseline.", ""]

    lines += ["### javax imports", ""]
    jakarta = [r for r in facts["javax"] if r["action"] == "jakarta"]
    keep = [r for r in facts["javax"] if r["action"] == "keep"]
    lines += [f"{plural(len(jakarta), 'import')} in {plural(len({r['path'] for r in jakarta}), 'file')} {'moves' if len(jakarta) == 1 else 'move'} to `jakarta.*`. "
              f"{plural(len(keep), 'import')} {'stays' if len(keep) == 1 else 'stay'} because the package ships with the JDK.", ""]
    if facts["javax"]:
        lines += ["| File | Line | Import | Action |", "|---|---:|---|---|"]
        for r in facts["javax"]:
            lines.append(f"| {link(facts, r['path'], r['line'])} | {r['line']} | `{r['import']}` | {'move to jakarta' if r['action'] == 'jakarta' else 'keep, JDK package'} |")
        lines.append("")

    lines += ["### Direct dependencies", ""]
    for module, data in facts["dependencies"].items():
        lines += [f"`{module}`: {len(data['direct'])} direct, {data['resolved_count']} resolved in total.", "",
                  "| Artifact | Resolved version | Scope |", "|---|---|---|"]
        for d in data["direct"]:
            lines.append(f"| `{d['group']}:{d['artifact']}` | {d['version']} | {d['scope']} |")
        lines.append("")
    pinned = [(m["name"], d) for m in b["modules"] for d in m["dependencies"] if d.get("version")]
    if pinned:
        lines += ["Explicit version overrides in module POMs (the Spring Boot BOM does not set these):", ""]
        for module, d in pinned:
            lines.append(f"- {module}: `{d['group']}:{d['artifact']}` {d['version']} ({link(facts, next(x['pom_path'] for x in b['modules'] if x['name'] == module), d.get('line'))})")
        lines.append("")
    stable = [u for u in facts["updates"] if not u["prerelease"]]
    if facts["updates"]:
        lines += ["Newer versions on Maven Central (versions-maven-plugin; pre-releases hidden):", "", "| Module | Artifact | Current | Newest stable |", "|---|---|---|---|"]
        for u in stable:
            lines.append(f"| {u['module']} | `{u['coordinate']}` | {u['current']} | {u['latest']} |")
        hidden = len(facts["updates"]) - len(stable)
        lines.append("")
        if hidden:
            lines += [f"{hidden} updates point to a pre-release only and are hidden.", ""]

    lines += ["### Java 21 readiness (jdeps, jdeprscan)", ""]
    if facts["jdk21"]["internal_api"]:
        lines += ["`jdeps --jdk-internals --multi-release 21` on the compiled classes and their runtime classpath:", "",
                  "| Artifact | Modules | JDK API used | Kind |", "|---|---|---|---|"]
        for r in facts["jdk21"]["internal_api"]:
            lines.append(f"| `{r['artifact']}` | {', '.join(r['modules'])} | {', '.join('`' + a + '`' for a in r['apis'][:4])} | {'removed in JDK 21' if r['removed'] else ', '.join(r['kinds'])} |")
        lines.append("")
    else:
        lines += ["`jdeps` found no use of JDK internal APIs.", ""]
    dep = facts["jdk21"]["deprecated_for_removal"]
    if any(dep.values()):
        lines += ["`jdeprscan --release 21 --for-removal`:", ""] + [f"- {m}: {row}" for m, rows in dep.items() for row in rows] + [""]
    else:
        lines += ["`jdeprscan --release 21 --for-removal` found no application code that uses APIs marked for removal.", ""]

    osv = facts["vulnerabilities"]
    lines += ["### Known vulnerabilities in the current dependency tree (OSV.dev)", ""]
    if not osv.get("available"):
        lines += ["OSV.dev could not be reached. No vulnerability data in this report.", ""]
    elif not osv["items"]:
        lines += [f"No known vulnerabilities for the {osv.get('queried', 0)} resolved artifacts.", ""]
    else:
        groups = vulnerability_groups(osv["items"])
        counts = severity_counts(osv["items"])
        lines += [f"{len(osv['items'])} advisories affect {len(groups)} of the {osv.get('queried', 0)} resolved artifacts "
                  f"({', '.join(f'{v} {k.lower()}' for k, v in counts.items() if v)}). Most arrive transitively through the Spring Boot 2.7 BOM, "
                  "so the BOM upgrade is expected to clear many of them. The pipeline repeats this scan after the upgrade.", "",
                  "| Artifact | Version | Scope | Advisories | Highest | Version that fixes all | ", "|---|---|---|---:|---|---|"]
        for g in groups[:15]:
            lines.append(f"| `{g['package']}` | {g['version']} | {g['scope']} | {g['count']} | {g['highest']} | {g['fixed'] or 'none listed'} |")
        lines.append("")
        if len(groups) > 15:
            lines += ["<details>", f"<summary>{len(groups) - 15} more artifacts</summary>", "", "| Artifact | Version | Scope | Advisories | Highest | Version that fixes all | ", "|---|---|---|---:|---|---|"]
            for g in groups[15:]:
                lines.append(f"| `{g['package']}` | {g['version']} | {g['scope']} | {g['count']} | {g['highest']} | {g['fixed'] or 'none listed'} |")
            lines += ["", "</details>", ""]

    p = facts["preview"]
    sb = facts.get("spotbugs", {"available": False, "items": []})
    lines += ["### Static analysis baseline (SpotBugs)", ""]
    if not sb.get("available"):
        lines += ["SpotBugs did not run. No static analysis baseline in this report.", ""]
    elif not sb["items"]:
        lines += [f"{sb['tool']} found no bug patterns in the compiled classes.", ""]
    else:
        categories = {}
        for i in sb["items"]:
            categories[i["category"]] = categories.get(i["category"], 0) + 1
        lines += [f"{sb['tool']} on the JDK 8 build: {plural(len(sb['items']), 'bug pattern')} "
                  f"({', '.join(f'{v} {k.lower().replace(chr(95), chr(32))}' for k, v in sorted(categories.items()))}). "
                  "These exist before any change. The pipeline runs SpotBugs again after the upgrade and reports what is new and what is fixed.", "",
                  "| Module | Where | Bug pattern | Category | Priority |", "|---|---|---|---|---|"]
        for i in sorted(sb["items"], key=lambda x: (x["rank"], x["module"], x["class"])):
            where = link(facts, i["path"], i["line"]) if i["path"] else f"`{i['class']}`"
            lines.append(f"| {i['module']} | {where} | `{i['type']}` | {i['category']} | {i['priority']} |")
        lines.append("")

    lines += ["### Preview of the change (OpenRewrite dry run)", ""]
    if p["available"]:
        lines += [f"Recipes: {', '.join('`' + r + '`' for r in p['recipes'])}. Dry run only: nothing was applied. "
                  f"The agents use this as a reference, not as the final change. OpenRewrite estimates {p['estimate_saved'] or 'n/a'} of manual work saved.", "",
                  "| File | Lines added | Lines removed |", "|---|---:|---:|"]
        for f in p["files"]:
            lines.append(f"| `{f['path']}` | {f['added']} | {f['removed']} |")
        lines.append("")
        patch = pathlib.Path(raw or ".") / "rewrite.patch"
        if patch.exists():
            lines += ["<details>", "<summary>Full preview diff</summary>", "", "```diff", patch.read_text(encoding="utf-8", errors="replace").rstrip(), "```", "", "</details>", ""]
    else:
        lines += ["The OpenRewrite dry run did not produce a patch. See the `rewrite.log` evidence file.", ""]
    return "\n".join(lines) + "\n"


def severity_rank(value):
    return {"CRITICAL": 0, "HIGH": 1, "MODERATE": 2, "MEDIUM": 2, "LOW": 3}.get((value or "").upper(), 4)


def severity_counts(items):
    counts = {"CRITICAL": 0, "HIGH": 0, "MODERATE": 0, "LOW": 0, "UNKNOWN": 0}
    for item in items:
        key = (item["severity"] or "UNKNOWN").upper().replace("MEDIUM", "MODERATE")
        counts[key if key in counts else "UNKNOWN"] += 1
    return counts


def version_key(value):
    return [int(x) for x in re.findall(r"\d+", value)][:4]


def vulnerability_groups(items):
    groups = {}
    for item in items:
        g = groups.setdefault(item["package"], {"package": item["package"], "version": item["version"], "scope": item["scope"], "count": 0, "highest": "UNKNOWN", "needed": [], "unfixed": 0})
        g["count"] += 1
        if severity_rank(item["severity"]) < severity_rank(g["highest"]):
            g["highest"] = item["severity"].upper()
        newer = [f for f in item["fixed"] if version_key(f) > version_key(item["version"])]
        if newer:
            g["needed"].append(min(newer, key=version_key))
        else:
            g["unfixed"] += 1
    result = []
    for g in groups.values():
        # The version that clears every advisory is the highest of each advisory's lowest fix.
        needed = g.pop("needed")
        g["fixed"] = max(needed, key=version_key) if needed else None
        result.append(g)
    return sorted(result, key=lambda g: (severity_rank(g["highest"]), -g["count"], g["package"]))


def osv(args):
    resolved = {}
    for tree in sorted(pathlib.Path(args.trees).glob("dependency-tree-*.txt")):
        for entry in parse_tree(tree)["resolved"]:
            resolved[f"{entry['group']}:{entry['artifact']}"] = entry
    packages = sorted(resolved.values(), key=lambda e: (e["group"], e["artifact"]))
    result = {"available": False, "queried": len(packages), "items": []}
    if not packages:
        pathlib.Path(args.out).write_text(json.dumps(result, indent=2))
        print("osv: no dependency trees found")
        return
    query = {"queries": [{"package": {"ecosystem": "Maven", "name": f"{p['group']}:{p['artifact']}"}, "version": p["version"]} for p in packages]}
    try:
        batch = post_json("https://api.osv.dev/v1/querybatch", query)
        details = {}
        for package, hit in zip(packages, batch.get("results", [])):
            for vuln in hit.get("vulns", []) or []:
                vid = vuln["id"]
                if vid not in details:
                    details[vid] = get_json(f"https://api.osv.dev/v1/vulns/{vid}")
                name = f"{package['group']}:{package['artifact']}"
                info = details[vid]
                fixed = sorted({ev["fixed"] for aff in info.get("affected", []) if aff.get("package", {}).get("name") == name
                                for rng in aff.get("ranges", []) for ev in rng.get("events", []) if "fixed" in ev})
                cve = next((a for a in info.get("aliases", []) if a.startswith("CVE-")), None)
                result["items"].append({
                    "id": cve or vid, "osv_id": vid, "package": name, "version": package["version"], "scope": package["scope"],
                    "severity": (info.get("database_specific", {}) or {}).get("severity") or "UNKNOWN",
                    "summary": first_line(info.get("summary") or info.get("details") or "", 140), "fixed": fixed,
                })
        result["available"] = True
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        result["error"] = str(error)
    pathlib.Path(args.out).write_text(json.dumps(result, indent=2))
    print(f"osv: queried {len(packages)} artifacts, {len(result['items'])} advisories, available={result['available']}")


def verify(args):
    """Compare the upgraded branch with the approved baseline. Writes Markdown and GitHub outputs."""
    before = json.loads(pathlib.Path(args.before).read_text(encoding="utf-8"))
    project = pathlib.Path(args.project)
    raw = pathlib.Path(args.raw)
    after_build = build_facts(project, pathlib.Path("."))
    after_tests = baseline_tests(raw, project)
    after_javax = [r for r in javax_inventory(project, pathlib.Path(".")) if r["action"] == "jakarta"]
    after_osv = json.loads((raw / "osv.json").read_text()) if (raw / "osv.json").exists() else {"available": False, "items": []}
    jars = sorted(p.name for p in project.glob("*/target/*.jar") if not p.name.endswith("-plain.jar"))
    sb_before = before.get("spotbugs", {"available": False, "items": []})
    sb_after = parse_spotbugs(raw, project) or {"available": False, "items": []}
    sb_new, sb_fixed = compare_spotbugs(sb_before["items"], sb_after["items"]) if sb_before["available"] and sb_after["available"] else ([], [])

    b, a = before["baseline"]["totals"], after_tests["totals"]
    tests_ok = a["failures"] + a["errors"] <= b["failures"] + b["errors"] and a["tests"] >= b["tests"]
    before_javax = len([r for r in before["javax"] if r["action"] == "jakarta"])
    adv_before = len(before["vulnerabilities"].get("items", [])) if before["vulnerabilities"].get("available") else None
    adv_after = len(after_osv.get("items", [])) if after_osv.get("available") else None

    def trend(old, new, lower_is_better=True):
        if old is None or new is None or old == new:
            return "same" if old == new else "n/a"
        return "better" if (new < old) == lower_is_better else "worse"

    lines = ["<!-- modernize-verification -->", "## Verification on JDK 21", "",
             f"Result: {'PASS' if tests_ok else 'WORSE THAN BASELINE'}. Measured by Maven, Surefire, SpotBugs and OSV.dev on the branch, compared with the approved baseline in `evidence/facts.json`. No AI.", "",
             "```diff",
             f"- Java {before['build']['java_version']}, Spring Boot {before['build']['spring_boot_version']}",
             f"+ Java {after_build['java_version']}, Spring Boot {after_build['spring_boot_version']}",
             f"- tests on JDK 8:  {b['tests']} run, {b['failures']} failed, {b['errors']} errors",
             f"+ tests on JDK 21: {a['tests']} run, {a['failures']} failed, {a['errors']} errors",
             f"- javax imports to migrate: {before_javax}",
             f"+ javax imports to migrate: {len(after_javax)}",
             f"- known advisories: {adv_before if adv_before is not None else 'n/a'}",
             f"+ known advisories: {adv_after if adv_after is not None else 'n/a'}",
             "```", "",
             "| Check | Before: JDK 8, `main` | After: JDK 21, this branch | Trend |", "|---|---|---|---|",
             f"| Java release | {before['build']['java_version']} | {after_build['java_version']} | |",
             f"| Spring Boot parent | {before['build']['spring_boot_version']} | {after_build['spring_boot_version']} | |",
             f"| Maven Wrapper | {before['build']['maven_wrapper']} | {after_build['maven_wrapper']} | |",
             f"| Tests run | {b['tests']} | {a['tests']} | {trend(b['tests'], a['tests'], lower_is_better=False)} |",
             f"| Failures | {b['failures']} | {a['failures']} | {trend(b['failures'], a['failures'])} |",
             f"| Errors | {b['errors']} | {a['errors']} | {trend(b['errors'], a['errors'])} |",
             f"| Skipped | {b['skipped']} | {a['skipped']} | {trend(b['skipped'], a['skipped'])} |",
             f"| `javax` imports still to migrate | {before_javax} | {len(after_javax)} | {trend(before_javax, len(after_javax))} |",
             f"| Known advisories, OSV.dev | {adv_before if adv_before is not None else 'n/a'} | {adv_after if adv_after is not None else 'n/a'} | {trend(adv_before, adv_after)} |",
             f"| SpotBugs bug patterns | {len(sb_before['items']) if sb_before['available'] else 'n/a'} | {len(sb_after['items']) if sb_after['available'] else 'n/a'} | "
             f"{(f'{len(sb_new)} new, {len(sb_fixed)} fixed' if sb_before['available'] and sb_after['available'] else 'n/a')} |",
             f"| Jars packaged | | {', '.join(jars) or 'none'} | |", ""]

    before_cases = {(c["class"], c["name"]): c for c in before["baseline"]["cases"]}
    after_cases = {(c["class"], c["name"]): c for c in after_tests["cases"]}
    keys = sorted(set(before_cases) | set(after_cases))
    if keys:
        lines += ["### Tests, case by case", "", "| Test | Before | After | Message after |", "|---|---|---|---|"]
        for key in keys:
            old, new = before_cases.get(key), after_cases.get(key)
            lines.append(f"| `{key[0].split('.')[-1]}.{key[1]}` | {old['status'] if old else 'new'} | {new['status'] if new else 'missing'} | {(new or {}).get('message', '').replace('|', '/')} |")
        lines.append("")
    if after_javax:
        lines += ["### Remaining javax imports", ""] + [f"- `{r['path']}:{r['line']}` {r['import']}" for r in after_javax] + [""]
    if sb_before["available"] and sb_after["available"]:
        lines += ["### SpotBugs, before and after", "",
                  f"{plural(len(sb_new), 'bug pattern')} introduced by the upgrade, {len(sb_fixed)} fixed. Matched on module, pattern, class and method, because line numbers move."]
        if sb_new:
            lines += ["", "New after the upgrade (the Standards reviewer must address each one):", "",
                      "| Module | Where | Bug pattern | Category | Priority |", "|---|---|---|---|---|"]
            lines += [f"| {i['module']} | `{i['path']}:{i['line']}` | `{i['type']}` | {i['category']} | {i['priority']} |" for i in sb_new]
        if sb_fixed:
            lines += ["", "<details>", f"<summary>{plural(len(sb_fixed), 'bug pattern')} no longer reported</summary>", "",
                      "| Module | Class | Bug pattern | Category |", "|---|---|---|---|"]
            lines += [f"| {i['module']} | `{i['class']}` | `{i['type']}` | {i['category']} |" for i in sb_fixed]
            lines += ["", "</details>"]
        lines.append("")
    if after_osv.get("available") and after_osv.get("items"):
        groups = vulnerability_groups(after_osv["items"])
        counts = severity_counts(after_osv["items"])
        lines += ["### Advisories that remain after the upgrade", "",
                  f"{len(after_osv['items'])} advisories in {len(groups)} artifacts ({', '.join(f'{v} {k.lower()}' for k, v in counts.items() if v)}). "
                  "Out of scope for this run unless the plan says otherwise; listed so a human can decide on follow-up work.", "",
                  "<details>", "<summary>Remaining advisories by artifact</summary>", "",
                  "| Artifact | Version | Scope | Advisories | Highest | Version that fixes all |", "|---|---|---|---:|---|---|"]
        for g in groups:
            lines.append(f"| `{g['package']}` | {g['version']} | {g['scope']} | {g['count']} | {g['highest']} | {g['fixed'] or 'none listed'} |")
        lines += ["", "</details>", ""]
    pathlib.Path(args.out).write_text("\n".join(lines) + "\n", encoding="utf-8")
    detail = (f"JDK 21: {plural(a['tests'], 'test')}, {plural(a['failures'], 'failure')}, {plural(a['errors'], 'error')}. "
              f"Baseline: {plural(b['tests'], 'test')}, {plural(b['failures'], 'failure')}, {plural(b['errors'], 'error')}. "
              f"Advisories {adv_before if adv_before is not None else 'n/a'} -> {adv_after if adv_after is not None else 'n/a'}.")
    if args.github_output:
        with open(args.github_output, "a", encoding="utf-8") as handle:
            handle.write(f"status={'done' if tests_ok else 'failed'}\ndetail={detail}\n")
    print(detail)


def post_json(url, payload):
    request = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read())


def get_json(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.loads(response.read())


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    s = sub.add_parser("summarize")
    s.add_argument("--project", required=True)
    s.add_argument("--raw", required=True)
    s.add_argument("--out", required=True)
    s.add_argument("--repo-root", default=".")
    s.add_argument("--repo")
    s.add_argument("--sha")
    o = sub.add_parser("osv")
    o.add_argument("--trees", required=True)
    o.add_argument("--out", required=True)
    v = sub.add_parser("verify")
    v.add_argument("--before", required=True, help="evidence/facts.json from the approved assessment")
    v.add_argument("--project", required=True)
    v.add_argument("--raw", required=True, help="after-upgrade surefire reports in baseline-tests/, dependency trees, osv.json")
    v.add_argument("--out", required=True)
    v.add_argument("--github-output")
    args = parser.parse_args()
    {"summarize": summarize, "osv": osv, "verify": verify}[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
