module.exports = {
  /**
   * Get time in seconds since epoch
   */
  getLocalStamp() {
    return Date.now() / 1000;
  }
};
