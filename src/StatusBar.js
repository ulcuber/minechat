const STATUS_TIMEOUT = 3000;

/**
 * @typedef {import('@ulcoder/blessed/lib/events')} EventEmitter
 * @typedef {import('@ulcoder/blessed/lib/widgets/node')|EventEmitter} Node
 * @typedef {import('@ulcoder/blessed/lib/widgets/element')|Node} Element
 * @typedef {import('@ulcoder/blessed/lib/widgets/box')|Element} Box
*/
class StatusBar {
  /** @param {Box} box */
  constructor(box) {
    this.box = box;

    this.messages = [];

    this.timer = null;
  }

  next() {
    if (this.timer) return;

    const cb = () => {
      const message = this.messages.shift();
      if (message) {
        this.box.setContent(message);
      } else {
        this.box.setContent('');
      }

      this.timer = null;
      if (this.messages.length || this.box.getContent()) {
        this.next();
      }
    };

    if (!this.box.getContent()) {
      cb();
      return;
    }

    this.timer = setTimeout(cb, STATUS_TIMEOUT);
  }

  push(message) {
    this.messages.push(message);
    this.next();
  }

  now(message) {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const content = this.box.getContent();
    if (content) {
      this.messages.unshift(content);
    }

    this.box.setContent(message);
    this.next();
  }
}

module.exports = StatusBar;
