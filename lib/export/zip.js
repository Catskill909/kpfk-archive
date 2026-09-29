'use strict';

/**
 * A minimal .zip writer (PKWARE APPNOTE 6.3, deflate or stored, no zip64), so the
 * studio can hand over every stats table in one file without a dependency.
 * Enough for a few files of a few MB: the whole archive is built in memory.
 * Needs Node 22+ for zlib.crc32 (the Dockerfile runs 24).
 */
const zlib = require('zlib');

/** DOS date/time fields for a JS Date (local wall clock, as unzip tools show it). */
function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * @param {{name: string, data: Buffer|string}[]} files  names are plain file names (no folders)
 * @param {Date} [when]
 * @returns {Buffer}
 */
function buildZip(files, when = new Date(), { paths = false } = {}) {
  const { time, date } = dosTime(when);
  const locals = [], centrals = [];
  let offset = 0;
  // Plain file names only, unless the caller builds a container format with fixed inner paths
  // (the .xlsx writer: "xl/worksheets/sheet1.xml", "[Content_Types].xml"). Never "..".
  const ok = paths ? /^(?!.*\.\.)[A-Za-z0-9._\-[\]]+(\/[A-Za-z0-9._\-[\]]+)*$/ : /^[A-Za-z0-9._-]{1,200}$/;
  for (const f of files) {
    if (!ok.test(f.name)) throw new Error(`zip: bad file name ${JSON.stringify(f.name)}`);
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const packed = zlib.deflateRawSync(raw);
    const stored = packed.length >= raw.length;
    const body = stored ? raw : packed, method = stored ? 0 : 8;
    const crc = zlib.crc32(raw) >>> 0, name = Buffer.from(f.name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8); local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(method, 10); central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

module.exports = { buildZip };
