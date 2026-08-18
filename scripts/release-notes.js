#!/usr/bin/env node

const {
  buildReleaseNotes,
  getCommitLog,
  getPreviousTag,
} = require("../src/helpers/releaseNotes");
const { version } = require("../package.json");

const previousTag = getPreviousTag();
const commits = getCommitLog(previousTag);
process.stdout.write(buildReleaseNotes({ version, commits, previousTag }));