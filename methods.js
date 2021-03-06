module.exports = {
  /**
   * Get time in seconds since epoch
   */
  getLocalStamp() {
    return Date.now() / 1000;
  },

  /**
   * Run
   * @param {Async Function} cb Callback function
   */
  runAtEveryMSInterval(cb, ms) {
    (async function loop() {
      await cb();
      let now = Date.now();
      var delay = ms - (now % ms);
      setTimeout(loop, delay);
    })();
  },

  sanitizeNameForURL(str) {
    return str
      .replace(/ /g, "-") // Replace all spaces with dashes (between words)
      .replace(/[^a-z0-9-]/gim, "") // Remove all non-alphanumerica chars
      .toLowerCase();
  }
};
