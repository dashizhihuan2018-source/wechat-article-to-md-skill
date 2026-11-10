"""Developer packaging helper; Python is not needed to run the skill."""
from pathlib import Path
import argparse
import hashlib
import json
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument("output_directory", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
version = json.loads((root / "package.json").read_text())["version"]
files = ["SKILL.md", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md",
         "agents/openai.yaml", "references/environment.md", "references/reverse-evidence.md",
         "references/batch-report.md", "scripts/batch.cjs",
         "scripts/run.sh", "scripts/run.ps1", "scripts/wechat-to-md.cjs",
         "scripts/wechat-to-md.cjs.LEGAL.txt",
         "docs/assets/technical-path.png", "docs/assets/people-daily-case.png",
         "docs/assets/github-qr.png"]
args.output_directory.mkdir(parents=True, exist_ok=True)
zip_path = args.output_directory / f"wechat-article-to-md-skill-v{version}.zip"
with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name in sorted(files):
        archive.write(root / name, "wechat-article-to-md-skill/" + name)
skill_path = zip_path.with_suffix(".skill")
skill_path.write_bytes(zip_path.read_bytes())
hashes = "".join(f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n" for p in [zip_path, skill_path])
(args.output_directory / "SHA256SUMS.txt").write_text(hashes)
print(hashes, end="")
