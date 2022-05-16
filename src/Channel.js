/* eslint-disable no-magic-numbers */

/**
 * @typedef {import('blessed/lib/widgets/log')} BlessedLog
 */
class Channel {
  /**
   * @param {BlessedLog} box
  */
  constructor(box) {
    this.box = box;

    this.unread = 0;
  }

  /**
   * @param {string} content
  */
  info(content) {
    this.unread += 1;

    const now = new Date();
    const h = now.getHours().toString();
    const m = now.getMinutes().toString().padStart(2, '0');
    const s = now.getSeconds().toString().padStart(2, '0');
    this.box.pushLine(`${h}:${m}:${s} ${content}`);
  }

  read() {
    this.unread = 0;
  }
}

module.exports = Channel;
