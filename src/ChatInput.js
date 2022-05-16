/* eslint-disable no-underscore-dangle */
const blessed = require('@ulcoder/blessed');

function ChatInput(options) {
  if (!(this instanceof blessed.node)) {
    return new ChatInput(options);
  }

  // eslint-disable-next-line no-param-reassign
  options = options || {};

  blessed.textbox.call(this, options);

  this.history = [];
  this.historyIndex = 0;
}

// eslint-disable-next-line no-proto
ChatInput.prototype.__proto__ = blessed.textbox.prototype;

// eslint-disable-next-line
ChatInput.prototype._listener = async function listener(ch, key) {
  if (key.meta) {
    this._done(null, null);
    return;
  }
  if (key.name === 'enter') {
    if (
      this.value
      // deduplicate
      && (!this.history.length || this.history[this.history.length - 1] !== this.value)
    ) {
      this.history.push(this.value);
      this.historyIndex = this.history.length;
    }
    this._done(null, this.value);
    return;
  }
  if (key.name === 'tab' && !key.shift) {
    this.emit('completion');
    return;
  }
  if (key.name === 'up' && key.ctrl) {
    this._done(null, null);
    this.emit('up');
    return;
  }
  if (key.name === 'tab' && key.shift) {
    this._done(null, null);
    this.emit('previous');
    return;
  }
  if (key.name === 'up') {
    if (this.historyIndex > 0) {
      this.historyIndex -= 1;
      this.setValue(this.history[this.historyIndex]);
    }
    return;
  }
  if (key.name === 'down') {
    if (this.historyIndex < this.history.length) {
      this.historyIndex += 1;
    }
    if (this.historyIndex < this.history.length) {
      this.setValue(this.history[this.historyIndex]);
    } else {
      if (
        this.value
        && (!this.history.length || this.history[this.history.length - 1] !== this.value)
      ) {
        this.history.push(this.value);
        this.historyIndex = this.history.length;
      }
      this.clearValue();
    }
    return;
  }
  if (key.ctrl) {
    this._done(null, null);
    return;
  }
  // eslint-disable-next-line consistent-return
  return this.__olistener(ch, key);
};

module.exports = ChatInput;
