/** @type {import('mocha').MochaOptions} */
module.exports = {
  spec: ["circuits/test/**/*.test.mjs"],
  timeout: 300000,
  exit: true,
  // Keep prove suite opt-in for fast default CI; run via test:circuit:full
  ignore: ["circuits/test/**/*prove*.test.mjs"],
};
