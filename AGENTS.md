# Repository privacy rules

- Create commits and publish branches through local Git with this repository's `.githooks` enabled. Do not create commits through GitHub connector/API tools, which bypass these checks.
- Use the GitHub username `SSSZTTTT` and its non-private identity `268528693+SSSZTTTT@users.noreply.github.com` for both author and committer. Never use a personal email or real name in commit metadata.
- For each fresh clone, run `node scripts/install-git-privacy.cjs "268528693+SSSZTTTT@users.noreply.github.com" "SSSZTTTT"`. Keep configuration repository-local. Do not disable hooks or use `--no-verify` to bypass a privacy failure.
- Before publishing, run `node scripts/check.cjs` and `node scripts/git-privacy.cjs history HEAD`. A clean current file or current Git setting does not prove the past history is clean.
- Never print or commit actual private emails, spreadsheet IDs, credentials, or the private remediation backup. Report counts, booleans, and commit hashes instead.
- Preserve existing work and the site's data/behavior during privacy remediation. Rewriting already published history requires the user's authorization and an exact expected old SHA when pushing; do not silently overwrite new remote work.
