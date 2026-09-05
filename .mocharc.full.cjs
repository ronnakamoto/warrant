/** Full circuit suite including Groth16 prove/verify. */
module.exports = {
  spec: ["circuits/test/**/*.test.mjs"],
  timeout: 600000,
  exit: true,
};
