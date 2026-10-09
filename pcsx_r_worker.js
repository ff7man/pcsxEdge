/* Worker adapter for the PEOPS PCSX-ReARMed libretro core.  The public
 * message protocol intentionally mirrors the original streaming worker so the
 * existing BIOS, cloud, controls, memory-card, and save-state UI can stay.
 */
var Module = {
  noInitialRun: true,
  noExitRuntime: true,
  locateFile: function (path) { return 'core/' + path; },
  print: function (text) { postMessage({ cmd: 'print', txt: String(text) }); },
  printErr: function (text) { postMessage({ cmd: 'print', txt: '[error] ' + String(text) }); }
};

importScripts('core/pcsx_rearmed_peops.js');

var pixelFormat = 1;
var keyboardLo = 0xffff;
var keyboardHi = 0xffff;
var gamepadLo = 0xffff;
var gamepadHi = 0xffff;
var running = false;
var coreLoaded = false;
var biosLoaded = false;
var audioBuffer = [];
var paths = { system: 0, save: 0 };
var optionPointers = {};
var enc = new TextEncoder();

function stringPointer(value) {
  var bytes = enc.encode(value + '\0');
  var ptr = Module._malloc(bytes.length);
  Module.HEAPU8.set(bytes, ptr);
  return ptr;
}

function readString(ptr) {
  var end = ptr;
  while (Module.HEAPU8[end]) end++;
  return new TextDecoder().decode(Module.HEAPU8.subarray(ptr, end));
}

function environment(command, data) {
  switch (command) {
    case 9: // GET_SYSTEM_DIRECTORY
      Module.HEAPU32[data >> 2] = paths.system;
      return 1;
    case 10: // SET_PIXEL_FORMAT
      pixelFormat = Module.HEAP32[data >> 2];
      return pixelFormat === 1 || pixelFormat === 2 ? 1 : 0;
    case 15: { // GET_VARIABLE
      var key = readString(Module.HEAPU32[data >> 2]);
      if (key === 'pcsx_rearmed_memcard1' || key === 'pcsx_rearmed_memcard2') {
        optionPointers[key] = optionPointers[key] || stringPointer('libretro');
        Module.HEAPU32[(data + 4) >> 2] = optionPointers[key];
        return 1;
      }
      return 0;
    }
    case 18: // SET_SUPPORT_NO_GAME
      return 1;
    case 31: // GET_SAVE_DIRECTORY
      Module.HEAPU32[data >> 2] = paths.save;
      return 1;
    case 53: case 54: case 55: // core options
      return 0;
    default:
      return 0;
  }
}

function video(data, width, height, pitch) {
  if (!data || !width || !height) return;
  var bytes = Module.HEAPU8.slice(data, data + pitch * height);
  postMessage({ cmd: 'render', width: width, height: height, pitch: pitch,
    format: pixelFormat, pixels: bytes }, [bytes.buffer]);
}

function audioBatch(data, frames) {
  if (!frames) return 0;
  var bytes = Module.HEAPU8.slice(data, data + frames * 4);
  postMessage({ cmd: 'audio', frames: frames, samples: bytes }, [bytes.buffer]);
  return frames;
}

function inputState(port, device, index, id) {
  if (port !== 0 || device !== 1 || index !== 0) return 0;
  /* Keyboard/virtual controls use the frontend's canonical PSX bit layout. */
  var keyboardMap = [
    [1, 14], [1, 15], [0, 0], [0, 3], [0, 4], [0, 6], [0, 7], [0, 5],
    [1, 13], [1, 12], [1, 10], [1, 11], [1, 8], [1, 9]
  ];
  var entry = keyboardMap[id];
  var keyboardMask = keyboardLo | (keyboardHi << 8);
  if (entry && (keyboardMask & (1 << entry[1])) === 0) return 1;

  /* The existing browser Gamepad adapter uses the original PCSX two-byte
   * JoyKeyStatus layout, whose face/shoulder bits are packed differently. */
  var gamepadMap = [
    [1, 6], [1, 7], [0, 0], [0, 3], [0, 4], [0, 6], [0, 7], [0, 5],
    [1, 5], [1, 4], [1, 2], [1, 3], [1, 0], [1, 1]
  ];
  entry = gamepadMap[id];
  return entry && ((entry[0] ? gamepadHi : gamepadLo) & (1 << entry[1])) === 0 ? 1 : 0;
}

globalThis.frontendEnvironment = environment;
globalThis.frontendVideo = video;
globalThis.frontendAudioSample = function () {};
globalThis.frontendAudioBatch = audioBatch;
globalThis.frontendInputPoll = function () {};
globalThis.frontendInputState = inputState;

function initialize() {
  FS.mkdir('/system');
  FS.mkdir('/save');
  paths.system = stringPointer('/system');
  paths.save = stringPointer('/save');
  Module._frontend_init();
  postMessage({ cmd: 'setStatus', txt: 'worker ready' });
}

function installBios(bytes, name) {
  if (!bytes || bytes.byteLength !== 512 * 1024) throw new Error('BIOS must be exactly 512 KiB');
  var image = new Uint8Array(bytes);
  var safeName = String(name || 'bios.bin').replace(/[^A-Za-z0-9_.-]/g, '_');
  FS.writeFile('/system/' + safeName, image);
  ['scph5500.bin', 'scph5501.bin', 'scph5502.bin', 'scph1001.bin'].forEach(function (file) {
    FS.writeFile('/system/' + file, image);
  });
  biosLoaded = true;
  postMessage({ cmd: 'bios_ready', source: 'worker', name: name || 'bios.bin' });
}

function writeLocalFile(file) {
  var bytes = file instanceof ArrayBuffer ? new Uint8Array(file) : new Uint8Array(new FileReaderSync().readAsArrayBuffer(file));
  FS.writeFile('/' + file.name, bytes);
}

function remoteFileName(cueURL, line) {
  var match = line.match(/^\s*FILE\s+"([^"]+)"/i) || line.match(/^\s*FILE\s+([^\s]+)/i);
  return match ? match[1] : null;
}

async function installRemoteDisc(url) {
  var lower = url.split('?')[0].toLowerCase();
  if (!/\.cue$/i.test(lower)) {
    var name = decodeURIComponent(url.split('/').pop().split('?')[0]) || 'disc.bin';
    FS.createLazyFile('/', name, url, true, false);
    return '/' + name;
  }
  var response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('cue request returned HTTP ' + response.status);
  var cueText = await response.text();
  var cueName = decodeURIComponent(url.split('/').pop().split('?')[0]) || 'disc.cue';
  FS.writeFile('/' + cueName, new TextEncoder().encode(cueText));
  var base = url.substring(0, url.lastIndexOf('/') + 1);
  cueText.split(/\r?\n/).forEach(function (line) {
    var fileName = remoteFileName(url, line);
    if (!fileName) return;
    var fileURL = new URL(fileName, base).href;
    if (!FS.analyzePath('/' + fileName).exists) FS.createLazyFile('/', fileName, fileURL, true, false);
  });
  return '/' + cueName;
}

function startGame(path) {
  if (!biosLoaded) postMessage({ cmd: 'print', txt: '[core] no BIOS selected; the core may use HLE' });
  if (coreLoaded) Module._frontend_unload_game();
  var game = stringPointer(path);
  if (!Module._frontend_load_game(game)) throw new Error('core could not load ' + path);
  coreLoaded = true;
  running = true;
  postMessage({ cmd: 'setStatus', txt: 'running streamed disc' });
  runFrame();
}

function runFrame() {
  if (!running) return;
  var started = Date.now();
  Module._frontend_run();
  /* Target 60 Hz without adding a full 16 ms after the frame's own work. */
  var delay = Math.max(0, 16.667 - (Date.now() - started));
  setTimeout(runFrame, delay);
}

function memoryCard(card) {
  var ptr = Module._frontend_memory_card_ptr(card);
  var size = Module._frontend_memory_card_size();
  return ptr && size ? Module.HEAPU8.slice(ptr, ptr + size) : new Uint8Array(0);
}

function serialize() {
  var size = Module._frontend_serialize_size();
  var ptr = Module._malloc(size);
  if (!Module._frontend_serialize(ptr, size)) throw new Error('save state failed');
  var bytes = Module.HEAPU8.slice(ptr, ptr + size);
  Module._free(ptr);
  return bytes;
}

function handle(data) {
  if (data.cmd === 'padStatus') {
    var states = new Uint8Array(data.states);
    keyboardLo = states[6];
    keyboardHi = states[7];
    gamepadLo = states[8];
    gamepadHi = states[9];
    return;
  }
  if (data.cmd === 'loadbios') { installBios(data.bios, data.name); return; }
  if (data.cmd === 'loadurl') {
    installRemoteDisc(data.iso).then(startGame).catch(function (error) { postMessage({ cmd: 'setStatus', txt: 'stream error: ' + error.message }); });
    return;
  }
  if (data.cmd === 'loadfiles') {
    var files = data.files || [];
    files.forEach(writeLocalFile);
    var cue = files.find(function (file) { return /\.cue$/i.test(file.name); });
    startGame('/' + (cue ? cue.name : files[0].name));
    return;
  }
  if (data.cmd === 'export_memory_cards') {
    var cards = [memoryCard(1), memoryCard(2)];
    postMessage({ cmd: 'memory_cards', cards: cards, download: !!data.download }, cards.map(function (v) { return v.buffer; }));
    return;
  }
  if (data.cmd === 'import_memory_cards') {
    var imported = data.cards && data.cards[0];
    [imported, data.cards && data.cards[1]].forEach(function (card, index) {
      var cardPtr = Module._frontend_memory_card_ptr(index + 1);
      var cardSize = Module._frontend_memory_card_size();
      if (card && cardPtr && cardSize) Module.HEAPU8.set(new Uint8Array(card).subarray(0, cardSize), cardPtr);
    });
    return;
  }
  if (data.cmd === 'save_state') {
    var state = serialize();
    postMessage({ cmd: 'state_data', state: state, download: !!data.download }, [state.buffer]);
    return;
  }
  if (data.cmd === 'load_state') {
    var bytes = new Uint8Array(data.state);
    var ptr = Module._malloc(bytes.length);
    Module.HEAPU8.set(bytes, ptr);
    Module._frontend_unserialize(ptr, bytes.length);
    Module._free(ptr);
  }
}

onmessage = function (event) {
  try { handle(event.data); }
  catch (error) { postMessage({ cmd: 'setStatus', txt: 'core error: ' + error.message }); }
};

if (Module.calledRun || Module.runtimeInitialized) initialize();
else Module.onRuntimeInitialized = initialize;
