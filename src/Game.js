/* eslint-disable no-underscore-dangle */
const { resolve } = require('path');
const util = require('util');
const blessed = require('@ulcoder/blessed');
const notifier = require('node-notifier');

const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalXZ, GoalBlock } } = require('mineflayer-pathfinder');

const Logger = require('./Logger');
const ChatInput = require('./ChatInput');
const StatusBar = require('./StatusBar');

const DEFAULT_MAX_HEALTH = 20;

const NORMAL_WIDTH = 120;

const MOON_FULL = 0;
const MOON_WANING_GIBBOUS = 1;
const MOON_LAST_QUARTER = 2;
const MOON_WANING_CRESCENT = 3;
const MOON_NEW = 4;
const MOON_WAXING_CRESCENT = 5;
const MOON_FIRST_QUARTER = 6;
const MOON_WAXING_GIBBOUS = 7;

const PING_GOOD = 40;
const PING_NORMAL = 100;
const PING_WARN = 150;

const RESTART_TIMEOUT = 30000;

const MAX_COMPLETIONS = 20;

const MODAL_INDEX = 2;

const HALF_CIRCLE_DEG = 180;

function addDeg(rad, deg) {
  return rad + (Math.PI * deg) / HALF_CIRCLE_DEG;
}

function pos2str(position) {
  const x = Math.round(position.x);
  const y = Math.round(position.y);
  const z = Math.round(position.z);

  return `${x} ${y} ${z}`;
}

/**
 * @typedef {import('i18n').I18n} I18n
*/
class Game {
  /**
   * @param {I18n} i18n
  */
  constructor(i18n, host, port, username, password) {
    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;

    this.blured = false;
    this.isViewing = false;
    this.shouldAutoRestart = true;
    this.ended = false;
    this.prevFocus = null;

    this.focusColor = 'blue';

    this.players = {};

    console.log = this.log.bind(this);

    this.i18n = i18n;

    const USERNAME_REGEX = '(?:\\(.+\\)|\\[.+\\]|.)*?(\\w+)';
    this.chatRegex = new RegExp(`^${USERNAME_REGEX}\\s?[>:\\-»\\]\\)~]+\\s(.*)$`);

    this.connect();
    this.makeScreen();
    this.makeLayout();
    this.makeLogger();
    this.addDescription();
    this.registerEvents();
  }

  connect() {
    const options = {
      host: this.host,
      port: this.port,
      username: this.username,
    };

    this.bot = mineflayer.createBot(options);
  }

  makeScreen() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Chat',
    });
    this.screen.enableMouse();
    this.screen.program.setMouse({ sendFocus: true }, true);
  }

  makeLayout() {
    this.topBar = blessed.box({
      parent: this.screen,
      tags: true,
      width: '100%',
      height: 2,
      top: 0,
      left: 0,
    });

    this.loader = blessed.loading({
      parent: this.topBar,
      shrink: true,
      height: 1,
      right: 10,
    });

    this.timeBox = blessed.box({
      parent: this.topBar,
      shrink: true,
      tags: true,
      height: 1,
      right: 0,
    });

    this.tablist = blessed.box({
      parent: this.topBar,
      top: 1,
      height: 1,
    });
    this.header = blessed.box({
      parent: this.tablist,
      left: 0,
      width: '50%',
    });
    this.footer = blessed.box({
      parent: this.tablist,
      right: 0,
      width: '50%',
      align: 'right',
    });

    this.tabsBar = blessed.listbar({
      parent: this.topBar,
      name: 'tabs-bar',
      mouse: true,
      top: 2,
      width: '50%',
      height: 1,
      style: {
        selected: {
          bg: 'green',
        },
      },
    });
    const statusBarBox = blessed.box({
      parent: this.topBar,
      top: 2,
      right: 0,
      width: '50%',
      height: 1,
      align: 'right',
      padding: {
        right: 2,
      },
    });
    this.statusBar = new StatusBar(statusBarBox);

    this.main = blessed.layout({
      parent: this.screen,
      top: 3,
      width: '100%',
      height: '100%-6',
      layout: 'inline',
    });

    this.tabsBox = blessed.box({
      parent: this.main,
      height: '100%',
      width: '100%-18',
    });
    this.sidebar = blessed.box({
      parent: this.main,
    });
    this.collapse = blessed.button({
      parent: this.sidebar,
      name: 'sidebar-collapse',
      mouse: true,
      shrink: true,
      content: '>>',
      height: 1,
      padding: {
        left: 1,
        right: 1,
      },
      style: {
        focus: {
          bg: this.focusColor,
        },
        hover: {
          fg: 'cyan',
        },
      },
    });
    this.playersBox = blessed.box({
      parent: this.sidebar,
      top: 1,
      align: 'left',
      tags: true,
      mouse: true,
      shrink: true,
      scrollable: true,
      items: [],
      scrollbar: {
        ch: ' ',
        inverse: true,
      },
    });

    this.footerBox = blessed.box({
      parent: this.screen,
      bottom: 0,
      width: '100%',
      height: 4,
    });
    this.actionsForm = blessed.form({
      parent: this.footerBox,
      width: '100%',
      bottom: 1,
      style: {
        focus: {
          bg: this.focusColor,
        },
      },
    });
    this.makeActions(this.actionsForm);

    this.modal = blessed.message({
      parent: this.screen,
      name: 'message',
      tags: true,
      keys: true,
      hidden: true,
      shadow: true,
      scrollable: true,
      height: 'shrink',
      width: 'half',
      top: 'center',
      left: 'center',
      align: 'center',
      valign: 'middle',
      border: 'line',
      scrollbar: {
        ch: ' ',
        inverse: true,
      },
    });

    this.form = blessed.form({
      parent: this.footerBox,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
    });

    this.input = new ChatInput({
      parent: this.form,
      mouse: true,
      inputOnFocus: true,
      width: '100%-3',
      height: 1,
      bottom: 0,
      left: 1,
      name: 'message',
      padding: {
        left: 1,
        right: 1,
      },
      style: {
        bg: 'white',
        fg: 'white',
        focus: {
          bg: 'default',
        },
        hover: {
          bg: 'default',
        },
      },
    });
  }

  makeActions(parent) {
    this.actions = blessed.layout({
      parent,
      width: '100%',
      top: 0,
      align: 'center',
    });

    this.addPortal();

    this.viewButton = this.button({
      parent: this.actions,
      name: 'view',
      content: this.i18n.__('buttons.view'),
    });

    this.serveInventoryButton = this.button({
      parent: this.actions,
      name: 'serve-inventory',
      content: '[]',
    });

    this.lookLeftButton = this.button({
      parent: this.actions,
      name: 'look-left',
      content: '<',
    });

    this.lookRightButton = this.button({
      parent: this.actions,
      name: 'look-right',
      content: '>',
    });

    this.lookUpButton = this.button({
      parent: this.actions,
      name: 'look-up',
      content: '^',
    });

    this.lookDownButton = this.button({
      parent: this.actions,
      name: 'look-down',
      content: '_',
    });

    this.goLeftButton = this.button({
      parent: this.actions,
      name: 'go-left',
      content: '<',
    });

    this.goRightButton = this.button({
      parent: this.actions,
      name: 'go-right',
      content: '>',
    });

    this.goForwardButton = this.button({
      parent: this.actions,
      name: 'go-forward',
      content: '^',
    });

    this.goBackButton = this.button({
      parent: this.actions,
      name: 'go-back',
      content: '_',
    });

    this.inventoryButton = this.button({
      parent: this.actions,
      name: 'inventory',
      content: '[]',
    });

    this.gameButton = this.button({
      parent: this.actions,
      name: 'game-info',
      content: '?',
    });

    this.entitiesButton = this.button({
      parent: this.actions,
      name: 'entities',
      content: 'e',
    });

    this.startButton = this.button({
      parent: this.actions,
      name: 'start',
      content: 'Start',
      style: {
        fg: 'green',
        border: {
          fg: 'green',
        },
        focus: {
          border: {
            fg: this.focusColor,
          },
          fg: this.focusColor,
        },
        hover: {
          border: {
            fg: 'cyan',
          },
          fg: 'cyan',
        },
      },
    });
    this.stopButton = this.button({
      parent: this.actions,
      name: 'stop',
      content: 'Stop',
      style: {
        fg: 'yellow',
        border: {
          fg: 'yellow',
        },
        focus: {
          border: {
            fg: this.focusColor,
          },
          fg: this.focusColor,
        },
        hover: {
          border: {
            fg: 'cyan',
          },
          fg: 'cyan',
        },
      },
    });
    this.exitButton = this.button({
      parent: this.actions,
      name: 'exit',
      content: 'Exit',
      style: {
        fg: 'red',
        border: {
          fg: 'red',
        },
        focus: {
          border: {
            fg: this.focusColor,
          },
          fg: this.focusColor,
        },
        hover: {
          border: {
            fg: 'cyan',
          },
          fg: 'cyan',
        },
      },
    });
  }

  button(options) {
    return blessed.button({
      mouse: true,
      keys: true,
      shrink: true,
      height: 3,
      border: {
        type: 'line',
      },
      padding: {
        left: 1,
        right: 1,
      },
      style: {
        focus: {
          border: {
            fg: this.focusColor,
          },
          fg: this.focusColor,
        },
        hover: {
          border: {
            fg: 'cyan',
          },
          fg: 'cyan',
        },
      },
      ...options,
    });
  }

  makeLogger() {
    this.logger = new Logger(() => {
      const box = blessed.log({
        parent: this.tabsBox,
        scrollable: true,
        scrollOnInput: false,
        hidden: true,
        height: '100%-1',
        width: '100%-1',
        border: {
          type: 'line',
        },
        scrollbar: {
          ch: ' ',
          inverse: true,
        },
        items: [],
      });
      box.on('wheeldown', function onWheel() {
        // eslint-disable-next-line no-magic-numbers
        this.scroll(3);
        this.screen.render();
      });
      box.on('wheelup', function onWheel() {
        // eslint-disable-next-line no-magic-numbers
        this.scroll(-3);
        this.screen.render();
      });
      box.on('scroll', function onScroll() {
        // eslint-disable-next-line no-underscore-dangle
        this._userScrolled = true;
        if (this.getScrollPerc() === 100) {
          // eslint-disable-next-line no-underscore-dangle
          this._userScrolled = false;
        }
      });
      return box;
    });

    this.logger.on('created', (name) => {
      this.tabsBar.add({
        keys: [''],
        prefix: '',
        text: name,
        callback: () => {
          this.logger.activate(name);
        },
      });
    });

    this.chat = this.logger.channel('chat');
    this.system = this.logger.channel('system');
    this.tabsBar.selectTab(0);
  }

  toggleSidebar() {
    if (this.playersBox.visible) {
      this.collapse.setContent('<<');
      this.tabsBox.width = '100%-4';
    } else {
      this.collapse.setContent('>>');
      this.tabsBox.width = '100%-18';
      this.updatePlayers();
    }

    this.playersBox.toggle();
  }

  showBlock() {
    const block = this.bot.blockAtCursor();
    if (!block) {
      this.statusBar.now('Looking at Air');
      return;
    }

    this.statusBar.now(`Looking at ${block.displayName} (${block.name})`);
  }

  addDescription() {
    this.modal.set('description', 'Press Escape to hide');
    this.viewButton.set('description', 'Start Prismarine Viewer');
    this.serveInventoryButton.set('description', 'Serve Web Inventory');
    this.entitiesButton.set('description', 'Print names and coords of entities around');
    this.input.set('description', 'Tab to autocomplete, Up to history, Ctrl+Up to focus up');

    if (this.portalButton) {
      this.portalButton.set('description', 'Go to portal (for hub server)');
    }
  }

  registerEvents() {
    this.collapse.on('press', this.toggleSidebar.bind(this));
    this.collapse.key('down', () => {
      this.actionsForm.focusFirst();
    });

    this.screen._listenKeys(this.actionsForm);
    // eslint-disable-next-line complexity
    this.actionsForm.on('element keypress', (el, ch, key) => {
      const self = this.actionsForm;
      if ((key.name === 'tab' && !key.shift)
        || (key.name === 'right' && !(key.meta || key.ctrl))
        || (self.options.vi && key.name === 'j')
      ) {
        self.focusNext();
        return;
      }

      if ((key.name === 'tab' && key.shift)
        || (key.name === 'left' && !(key.meta || key.ctrl))
        || (self.options.vi && key.name === 'k')) {
        self.focusPrevious();
        return;
      }

      if (key.name === 'up') {
        this.collapse.focus();
      }
      if (key.name === 'down') {
        this.input.focus();
      }

      if (key.name === 'escape') {
        self.focus();
      }
    });

    this.input.on('submit', () => {
      this.form.submit();
    });
    this.input.on('completion', async () => {
      const value = this.input.getValue();
      const matches = await this.bot.tabComplete(value);
      const max = Math.min(MAX_COMPLETIONS, matches.length);
      if (matches.length === 1) {
        const args = value.split(' ');
        args.pop();
        args.push(matches[0].match);
        this.input.setValue(args.join(' '));
        return;
      }
      const completions = [];
      for (let index = 0; index < max; index += 1) {
        const { match } = matches[index];
        if (match) {
          completions.push(match);
        }
      }
      this.logger.active.info(completions.join(' '));
    });
    this.input.on('up', () => {
      this.actionsForm.focusFirst();
    });
    this.input.on('previous', () => {
      this.screen.focusPrevious();
    });

    this.screen.on('element focus', () => {
      const { focused } = this.screen;
      if (focused !== this.prevFocus) {
        this.prevFocus = focused;
        if (focused) {
          let msg = focused.name;
          const description = focused.get('description');
          if (description) {
            msg += `: ${description}`;
          }
          this.statusBar.now(msg || focused.type);
          this.render();
        } else {
          this.statusBar.now('Use Up/Down to focus, Ctrl+c to quit');
          this.render();
        }
      }
    });

    // eslint-disable-next-line complexity
    this.screen.on('keypress', (ch, key) => {
      if (key.name === 'pageup' && key.shift) {
        // eslint-disable-next-line no-magic-numbers
        this.logger.active.box.scroll(-(this.logger.active.box.height - 3));
        this.render();
        return;
      }
      if (key.name === 'pagedown' && key.shift) {
        // eslint-disable-next-line no-magic-numbers
        this.logger.active.box.scroll(this.logger.active.box.height - 3);
        this.render();
        return;
      }
      if (key.name === 'left' && (key.meta || key.ctrl)) {
        this.tabsBar.selectTab(this.tabsBar.selected - 1);
        this.render();
        return;
      }
      if (key.name === 'right' && (key.meta || key.ctrl)) {
        this.tabsBar.selectTab(this.tabsBar.selected + 1);
        this.render();
        return;
      }
      if (key.name === 'c' && key.ctrl) {
        this.quit();
        return;
      }
      // ctrl+h(hide)=backspace, ctrl+b(bar)-used in tmux, so ctrl+t(toggle)
      if (key.name === 't' && key.ctrl) {
        this.toggleSidebar();
        this.render();
        return;
      }
      if (!this.screen.focused || !this.screen.focused.name) {
        if (key.name === 'up') {
          this.collapse.focus();
        }
        if (key.name === 'down') {
          this.input.focus();
        }
        if (key.name === 'left') {
          this.actionsForm.focusFirst();
        }
        if (key.name === 'right') {
          this.actionsForm.focusLast();
        }
      }
    });

    this.screen.on('focus', () => {
      this.blured = false;
      if (this.playersBox.visible) {
        this.updateTablist();
        this.updatePlayers();
      }
      this.updateSelf();
    });

    this.screen.on('blur', () => {
      this.blured = true;
    });

    this.screen.on('resize', this.responsive.bind(this));

    this.viewButton.on('press', async () => {
      if (this.isViewing) {
        this.isViewing = false;
        this.bot.viewer.close();
        const msg = 'Prismarine viewer stopped';
        this.statusBar.now(msg);
        console.log(msg);
      } else {
        this.isViewing = true;

        const f = process.env.VIEWER_FIRST_PERSON;
        const { mineflayer: mineflayerViewer } = require('prismarine-viewer');
        mineflayerViewer(this.bot, { port: 3007, firstPerson: f !== 'false' && !!f });

        this.bot.on('path_update', (r) => {
          // eslint-disable-next-line no-magic-numbers
          const nodesPerTick = ((r.visitedNodes * 50) / r.time).toFixed(2);
          // eslint-disable-next-line no-magic-numbers
          console.log(`I can get there in ${r.path.length} moves. Computation took ${r.time.toFixed(2)} ms (${nodesPerTick} nodes/tick). ${r.status}`);
          // eslint-disable-next-line no-magic-numbers
          const path = [this.bot.entity.position.offset(0, 0.5, 0)];
          // eslint-disable-next-line no-restricted-syntax
          for (const node of r.path) {
            // eslint-disable-next-line no-magic-numbers
            path.push({ x: node.x, y: node.y + 0.5, z: node.z });
          }
          // eslint-disable-next-line no-magic-numbers
          this.bot.viewer.drawLine('path', path, 0xff00ff);
        });

        this.bot.viewer.on('blockClicked', (block, face, button) => {
          const SECOND_BUTTON = 2;
          if (button !== SECOND_BUTTON) return;

          const p = block.position.offset(0, 1, 0);

          const msg = `Clicked block ${block.displayName} (${block.name}) moving to ${p.x} ${p.y} ${p.z}`;
          this.statusBar.now(msg);
          this.logger.channel('game_info').info(msg);

          this.bot.pathfinder.setGoal(new GoalBlock(p.x, p.y, p.z));
        });
      }
    });

    this.serveInventoryButton.on('press', async () => {
      let msg = null;
      if (this.bot.webInventory?.isRunning) {
        try {
          await this.bot.webInventory.stop(() => {});
          msg = 'Web Inventory stopped';
        } catch (error) {
          console.log(error);
          msg = 'Cannot stop Web Inventory';
        } finally {
          this.statusBar.now(msg);
        }
      } else {
        if (!this.bot.webInventory) {
          require('mineflayer-web-inventory')(this.bot, {
            startOnLoad: false,
          });
        }
        try {
          await this.bot.webInventory.start(() => {});
          msg = 'Web Inventory started';
        } catch (error) {
          console.log(error);
          msg = 'Cannot start Web Inventory';
        } finally {
          this.statusBar.now(msg);
        }
      }
    });

    this.lookLeftButton.on('press', async () => {
      await this.bot.look(
        addDeg(this.bot.entity.yaw, process.env.LOOK_STEP_DEG),
        this.bot.entity.pitch,
      );
      this.showBlock();
    });
    this.lookRightButton.on('press', async () => {
      await this.bot.look(
        addDeg(this.bot.entity.yaw, -process.env.LOOK_STEP_DEG),
        this.bot.entity.pitch,
      );
      this.showBlock();
    });
    this.lookUpButton.on('press', async () => {
      await this.bot.look(
        this.bot.entity.yaw,
        addDeg(this.bot.entity.pitch, process.env.LOOK_STEP_DEG),
      );
      this.showBlock();
    });
    this.lookDownButton.on('press', async () => {
      await this.bot.look(
        this.bot.entity.yaw,
        addDeg(this.bot.entity.pitch, -process.env.LOOK_STEP_DEG),
      );
      this.showBlock();
    });

    this.goLeftButton.on('press', async () => {
      this.bot.setControlState('left', !this.bot.getControlState('left'));
      this.showBlock();
    });
    this.goRightButton.on('press', async () => {
      this.bot.setControlState('right', !this.bot.getControlState('right'));
      this.showBlock();
    });
    this.goForwardButton.on('press', async () => {
      this.bot.setControlState('forward', !this.bot.getControlState('forward'));
      this.showBlock();
    });
    this.goBackButton.on('press', async () => {
      this.bot.setControlState('back', !this.bot.getControlState('back'));
      this.showBlock();
    });

    this.inventoryButton.on('press', async () => {
      if (this.input._done) {
        this.input._reading = true;
        this.input._done(null, null);
      }
      if (this.modal.hidden) {
        this.modal.display('', 0, () => {
          //
        });

        const items = this.bot.inventory.items();
        if (
          // eslint-disable-next-line import/no-extraneous-dependencies
          require('minecraft-data')(this.bot.version).isNewerOrEqualTo('1.9')
          && this.bot.inventory.slots[45]) {
          items.push(this.bot.inventory.slots[45]);
        }

        this.modal.setContent('Items');
        items.forEach((item) => {
          this.modal.pushLine(`${item.displayName} (${item.name}) ${item.count}/${item.stackSize} ${item.durabilityUsed}`);
        });

        this.modal.setIndex(MODAL_INDEX);
      } else {
        this.modal.hide();
      }
      this.render();
    });
    this.gameButton.on('press', async () => {
      if (this.input._done) {
        this.input._reading = true;
        this.input._done(null, null);
      }
      if (this.modal.hidden) {
        this.modal.display('', 0, () => {
          //
        });

        this.modal.setContent('');
        this.modal.pushLine(`Level type: ${this.bot.game.levelType}`);
        this.modal.pushLine(`Game mode: ${this.bot.game.gameMode}`);
        this.modal.pushLine(`Hardcore: ${this.bot.game.hardcore}`);
        this.modal.pushLine(`Dimension: ${this.bot.game.dimension}`);
        this.modal.pushLine(`Difficulty: ${this.bot.game.difficulty}`);
        this.modal.pushLine(`Max players: ${this.bot.game.maxPlayers}`);
        this.modal.pushLine('');
        this.modal.pushLine(`Version: ${this.bot.version} (${this.bot.protocolVersion})`);

        const b = this.bot.targetDigBlock;
        if (b) {
          const pos = pos2str(b.position);
          this.modal.pushLine(`Can dig: ${b.displayName} (${b.name}): ${pos}`);
        }

        this.modal.setIndex(MODAL_INDEX);
      } else {
        this.modal.hide();
      }
      this.render();
    });

    this.entitiesButton.on('press', () => {
      const channel = this.logger.channel('entities');
      const stats = {};

      const myPos = pos2str(this.bot.entity.position);
      channel.info(`======= Entities around ${myPos} =======`);
      Object.values(this.bot.entities).forEach((entity) => {
        const pos = pos2str(entity.position);
        let name;
        switch (entity.type) {
          case 'mob':
            name = entity.displayName;
            break;
          case 'player':
            name = (new this.ChatMessage(entity.username || '')).toAnsi();
            break;
          case 'object':
            name = entity.objectType;
            break;
          default:
            name = entity.type;
            break;
        }
        const type = entity.type
          ? `${entity.type}:${entity.name}`
          : entity.id;
        if (!stats[type]) {
          stats[type] = 0;
        }
        stats[type] += 1;
        if (name === undefined) {
          channel.info(JSON.stringify(entity));
        } else {
          channel.info(`${type} ${name} ${pos}`);
        }
      });
      channel.info('======= Count =======');
      Object.entries(stats).forEach(([key, count]) => {
        channel.info(`${key}: ${count}`);
      });
    });

    this.startButton.on('press', () => {
      if (this.ended) {
        this.restart();
      }
    });
    this.stopButton.on('press', () => {
      this.shouldAutoRestart = false;
      this.bot.quit();
    });
    this.exitButton.on('press', this.quit.bind(this));

    this.form.on('submit', (data) => {
      if (data.message) {
        this.bot.chat(data.message);
      }
      this.input.clearValue();
      this.input.focus();
      this.render();
    });
  }

  addPortal() {
    const x = process.env.PORTAL_X;
    const z = process.env.PORTAL_Z;

    if (x && z) {
      this.portalButton = this.button({
        parent: this.actions,
        name: 'portal',
        content: this.i18n.__('buttons.portal'),
      });

      this.portalButton.on('press', async () => {
        const portal = new GoalXZ(x, z);

        try {
          await this.bot.pathfinder.goto(portal);
        } catch (error) {
          console.log(`${error}`);
        }

        this.updateSelf();
      });
    }
  }

  responsive() {
    if (this.screen.width >= NORMAL_WIDTH) {
      if (!this.playersBox.visible) {
        this.toggleSidebar();
      }
    } else if (this.playersBox.visible) {
      this.toggleSidebar();
    }
    this.render();
  }

  moonSymbol() {
    switch (this.bot.time.moonPhase) {
      case MOON_WAXING_CRESCENT:
        return ')'; // 🌒
      case MOON_FIRST_QUARTER:
        return '|)'; // 🌓
      case MOON_WAXING_GIBBOUS:
        return '||)'; // 🌔
      case MOON_FULL:
        return 'O'; // 🌕
      case MOON_WANING_GIBBOUS:
        return '(||'; // 🌖
      case MOON_LAST_QUARTER:
        return '(|'; // 🌗
      case MOON_WANING_CRESCENT:
        return '('; // 🌘
      case MOON_NEW:
        return '-'; // 🌑
      default:
        return '';
    }
  }

  // eslint-disable-next-line class-methods-use-this
  colorPing(ping) {
    if (ping < PING_GOOD) {
      return `{green-fg}${ping}{/green-fg}`;
    }

    if (ping < PING_NORMAL) {
      return ping;
    }

    if (ping < PING_WARN) {
      return `{yellow-fg}${ping}{/yellow-fg}`;
    }

    return `{red-fg}${ping}{/red-fg}`;
  }

  updateTablist() {
    this.header.setContent(this.bot.tablist?.header?.toAnsi());
    this.footer.setContent(this.bot.tablist?.footer?.toAnsi());
  }

  updatePlayers() {
    if (!this.bot.players) return;

    this.playersBox.setContent('');
    this.players = {};

    let pushed = 0;
    Object.entries(this.bot.players).forEach(([username, player]) => {
      pushed = this.pushOrSetPlayer(username, player.displayName, pushed);
    });
  }

  pushOrSetPlayer(username, displayName, p) {
    let pushed = p === undefined ? this.playersBox._clines.length : p;
    const stringDisplayName = displayName.toString();
    if (stringDisplayName.startsWith(username)) {
      if (!username.startsWith('~')) {
        if (this.players[username] === undefined) {
          this.players[username] = pushed;
          this.playersBox.pushLine(displayName.toAnsi());
          pushed += 1;
        } else {
          this.playersBox.setLine(this.players[username], displayName.toAnsi());
        }
      }
    } else {
      if (!username.startsWith('~')) {
        if (this.players[username] === undefined) {
          this.players[username] = pushed;
          this.playersBox.pushLine(username);
          pushed += 1;
        } else {
          this.playersBox.setLine(this.players[username], username);
        }
      }

      if (!stringDisplayName.startsWith('~')) {
        const key = stringDisplayName.split(':', 1)[0];
        if (this.players[key] === undefined) {
          this.players[key] = pushed;
          this.playersBox.pushLine(displayName.toAnsi());
          pushed += 1;
        } else {
          this.playersBox.setLine(this.players[key], displayName.toAnsi());
        }
      }
    }

    return pushed;
  }

  // eslint-disable-next-line complexity
  updateSelf() {
    if (this.blured) return;

    const me = this.bot.entity;

    if (!me) return;

    const pos = pos2str(me.position);
    const yaw = Math.round((me.yaw * HALF_CIRCLE_DEG) / Math.PI);
    const pitch = Math.round((me.pitch * HALF_CIRCLE_DEG) / Math.PI);

    const oxy = parseInt(this.bot.oxygenLevel || 0, 10);
    const health = parseInt(this.bot.health || 0, 10);
    const maxHealth = parseInt(me?.attributes?.['minecraft:generic.max_health']?.value || DEFAULT_MAX_HEALTH, 10);

    const food = parseInt(this.bot.food || 0, 10);
    const sat = parseInt(this.bot.foodSaturation || 0, 10);

    const expLevel = this.bot?.experience?.level || 0;
    const exp = this.bot?.experience?.points || 0;
    const progress = Math.floor((this.bot?.experience?.progress || 0) * 100);

    const state = me.onGround ? '_' : '|';
    let add = '';
    if (me.isInWater) {
      add = '{blue-bg}~{/blue-bg}';
    } else if (me.isInLava) {
      add = '{red-bg}={/red-bg}';
    } else if (me.isInWeb) {
      add = '{white-fg}#{/white-fg}';
    }

    const weather = this.bot.isRaining ? 'R' : 'S';
    const moon = this.moonSymbol();

    const content = `{bold}${me.username}{/bold} ${pos} (${yaw} ${pitch}) ${this.bot.game.dimension} {red-fg}${health}/${maxHealth}{/red-fg} {yellow-fg}${food}+${sat}{/yellow-fg} {blue-fg}o${oxy}{/blue-fg} {green-fg}*${expLevel}(${progress}%)/${exp}{/green-fg} ${state} ${add} ${weather} ${moon}`;
    this.topBar.setContent(content);

    this.render();
  }

  parseMessage(message) {
    let m;
    try {
      m = JSON.parse(message);
    } catch {
      m = message;
    }

    return new this.ChatMessage(m);
  }

  bindBotEvents() {
    this.bot.on('message', (message, position) => {
      let msg = null;

      if (message.translate) {
        let lang = this.getMcData().language;
        let format = lang[message.translate];
        if (!format) {
          lang = this.getMcData('1.17').language;
          format = lang[message.translate];
        }
        if (format) {
          msg = message.toAnsi(lang);
        } else {
          this.logger.channel('translate').info(`${msg} ${JSON.stringify(message.json)}`);
          const params = (message.with || []).map((p) => p.toAnsi());
          msg = this.translateMessage(message.translate, params);
        }
      } else {
        msg = message.toAnsi();
      }

      switch (position) {
        case 'chat':
          this.chat.info(msg);
          break;
        case 'system':
          if (this.chatRegex.test(message.toString())) {
            this.chat.info(msg);
          } else {
            this.system.info(msg);
          }
          break;
        case 'game_info':
          this.statusBar.push(msg);
          this.logger.channel('game_info').info(msg);
          break;
        default:
          this.logger.channel('messages').info(`${position} ${msg}`);
          break;
      }
    });

    this.bot.on('chat', (username, message) => {
      if (username === this.bot.username || username === 'f') return;
      notifier.notify({
        title: username,
        message,
      });
    });

    this.bot.on('whisper', (username, message) => {
      this.logger.channel(username).info(message);

      if (username === this.bot.username) return;
      notifier.notify({
        title: username,
        message,
      });
    });

    this.bot.on('title', (text) => {
      this.statusBar.push(`Title: ${text}`);
    });

    this.bot.on('kicked', (message) => {
      this.system.info(`Kicked: ${message}`);
    });

    this.bot.on('error', (error) => {
      const msg = `${error}`;
      console.log(msg);
      this.statusBar.push(msg);

      if (error.code === undefined) {
        this.ended = true;
        if (this.shouldAutoRestart) {
          setTimeout(this.restart.bind(this), RESTART_TIMEOUT);
        }
      }
    });

    this.bot.on('end', (message) => {
      this.ended = true;

      this.system.info(`End: ${message}`);

      if (this.shouldAutoRestart) {
        setTimeout(this.restart.bind(this), RESTART_TIMEOUT);
      }
    });

    this.bot.once('inject_allowed', () => {
      // eslint-disable-next-line import/no-extraneous-dependencies
      this.ChatMessage = require('prismarine-chat')(this.bot.version);

      this.loader.stop();
    });

    this.bot.once('spawn', () => {
      this.shouldAutoRestart = true;

      const defaultMove = new Movements(this.bot, this.getMcData());
      this.bot.pathfinder.setMovements(defaultMove);

      if (this.playersBox.visible) {
        this.updatePlayers();
      }

      this.updateTablist();

      this.render();
    });

    this.bot.on('time', () => {
      if (this.blured || !this.bot.time || !this.bot.player) return;

      // eslint-disable-next-line no-magic-numbers
      let time = (this.bot.time.timeOfDay % 24000) + 6000;
      // eslint-disable-next-line no-magic-numbers
      if (time > 24000) {
        // eslint-disable-next-line no-magic-numbers
        time -= 24000;
      }
      // eslint-disable-next-line no-magic-numbers
      const h = Math.floor(time / 1000);
      // eslint-disable-next-line no-magic-numbers
      let m = Math.floor(((time % 1000) * 3) / 50);
      // eslint-disable-next-line no-magic-numbers
      m = `${m}`.padStart(2, '0');

      const ping = this.colorPing(this.bot.player.ping);

      if (this.bot.time.isDay) {
        this.timeBox.setContent(`${ping} {white-bg}{black-fg}${h}:${m}{black-fg}{/white-bg}`);
      } else {
        this.timeBox.setContent(`${ping} {black-bg}{white-fg}${h}:${m}{white-fg}{/black-bg}`);
      }
      this.render();
    });

    this.bot.on('health', () => {
      this.updateSelf();
    });
    this.bot.on('breath', () => {
      this.updateSelf();
    });
    this.bot.on('move', () => {
      this.updateSelf();
    });
    this.bot.on('experience', () => {
      this.updateSelf();
    });
    this.bot.on('forcedMove', () => {
      this.statusBar.now('Teleported');
      this.bot.pathfinder.stop();
      this.updateSelf();
    });

    this.bot.on('playerJoined', (player) => {
      const { username } = player;
      if (username === this.bot.username) {
        return;
      }

      const chatUsername = this.parseMessage(username);
      const stringUsername = chatUsername.toString();

      if (!username.startsWith('~')) {
        if (!username.startsWith('§') && process.env.NOTIFY_JOIN) {
          notifier.notify({
            title: `${stringUsername} joined`,
            message: `${stringUsername} joined the game`,
          });
        }

        const message = new this.ChatMessage({
          color: 'yellow',
          translate: 'multiplayer.player.joined',
          with: [username],
        });
        let msg = `${message.toAnsi()}`;
        if (player.displayName.toString() !== stringUsername) {
          msg += `(${player.displayName.toAnsi()})`;
        }
        if (player.entity) {
          const pos = pos2str(player.entity.position);
          msg += ` ${pos}`;
        }
        this.system.info(msg);
        this.statusBar.push(msg);
      }

      this.pushOrSetPlayer(username, player.displayName);

      if (this.blured || !this.playersBox.visible) return;

      this.updateTablist();
      this.render();
    });

    this.bot.on('playerLeft', (player) => {
      const { username } = player;
      const message = new this.ChatMessage({
        color: 'yellow',
        translate: 'multiplayer.player.left',
        with: [username],
      });
      let msg = message.toAnsi();
      if (player.entity) {
        const pos = pos2str(player.entity.position);
        msg += ` ${pos}`;
      }
      if (this.logLeftPlayers) {
        this.system.info(msg);
      }
      this.statusBar.push(msg);

      if (this.blured || !this.playersBox.visible || player.username.startsWith('§')) return;

      this.updatePlayers();
      this.updateTablist();
      this.render();
    });

    this.bot.on('playerUpdated', (player) => {
      if (this.blured || !this.playersBox.visible) return;

      const { username } = player;

      this.pushOrSetPlayer(username, player.displayName);

      this.updateTablist();

      if (username === this.bot.username) {
        this.updateSelf();
      }
    });

    this.bot.on('rain', () => {
      this.updateSelf();
    });

    this.bot.on('sleep', () => {
      this.messages.pushLine('Sleeping');
    });

    this.bot.on('wake', () => {
      this.messages.pushLine('Waked up');
    });

    this.bot.on('windowOpen', (window) => {
      if (!window) return;

      const title = this.parseMessage(window.title);
      const msg = `Opened window ${title.toAnsi()} (${window.id}|${window.type})`;
      this.statusBar.now(msg);
      this.logger.channel('game_info').info(msg);
    });
    this.bot.on('windowClose', (window) => {
      if (!window) return;

      const title = this.parseMessage(window.title);
      const msg = `Closed window ${title.toAnsi()} (${window.id}|${window.type})`;
      this.statusBar.now(msg);
      this.logger.channel('game_info').info(msg);
    });

    if (process.env.ENABLE_MAP) {
      this.bot._client.on('map', ({ data }) => {
        const imagePath = resolve(__dirname, '..', 'map.png');
        require('./map')(data).writeImage(imagePath);
        this.image = blessed.overlayimage({
          parent: this.screen,
          file: imagePath,
        });
      });
    }
  }

  start() {
    this.loader.load(this.i18n.__('loading'));
    this.input.focus();
    this.responsive();

    this.bot.loadPlugin(pathfinder);
    this.bindBotEvents();
  }

  restart() {
    this.mcData = null;
    this.connect();
    this.start();
  }

  quit() {
    this.bot.quit();
    return process.exit(0);
  }

  log(d) {
    const message = `${util.format(d)}\n`;
    this.logger.channel('console').info(`${message}`);
  }

  render() {
    if (this.blured) return;
    this.screen.render();
  }

  translateMessage(translate, params) {
    return this.i18n.__(translate, params);
  }

  getMcData(v) {
    // eslint-disable-next-line import/no-extraneous-dependencies
    if (v) return require('minecraft-data')(v);

    if (!this.mcData) {
      // eslint-disable-next-line import/no-extraneous-dependencies
      this.mcData = require('minecraft-data')(this.bot.version);
    }

    return this.mcData;
  }
}

module.exports = Game;
