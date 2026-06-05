// ═══════════════════════════════════════════════════════
//  QRGen — pure-JS QR code encoder, no external deps
//  Fixed version: correct getTypeNumber capacity calculation
// ═══════════════════════════════════════════════════════
const QRGen = (() => {

  function drawQR(canvas, text) {
    try {
      const size = canvas.width || 120;
      const modules = encodeQR(text);
      if (!modules) { drawFallback(canvas, text); return; }
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      const n = modules.length;
      const quiet = 4;
      const total = n + quiet * 2;
      const cell = Math.max(1, Math.floor(size / total));
      const qrSize = cell * n;
      const off = Math.floor((size - qrSize) / 2);
      ctx.fillStyle = '#000000';
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++)
          if (modules[r][c]) ctx.fillRect(off + c * cell, off + r * cell, cell, cell);
    } catch (e) { drawFallback(canvas, text); }
  }

  function drawFallback(canvas, text) {
    const ctx = canvas.getContext('2d');
    const s = canvas.width || 120;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, s - 8, s - 8);
    [[10, 10], [10, s - 26], [s - 26, 10]].forEach(([x, y]) => {
      ctx.fillStyle = '#000'; ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#fff'; ctx.fillRect(x + 3, y + 3, 10, 10);
      ctx.fillStyle = '#000'; ctx.fillRect(x + 5, y + 5, 6, 6);
    });
    ctx.fillStyle = '#000';
    ctx.font = `bold ${s > 100 ? 9 : 7}px monospace`;
    ctx.textAlign = 'center';
    const words = text.split('-');
    words.forEach((w, i) => ctx.fillText(w, s / 2, s / 2 - ((words.length - 1) * 6) + i * 12));
  }

  function encodeQR(str) {
    try {
      const qr = new QRCodeModel(getTypeNumber(str, 1), 1);
      qr.addData(str); qr.make();
      const n = qr.getModuleCount(), m = [];
      for (let r = 0; r < n; r++) {
        m[r] = [];
        for (let c = 0; c < n; c++) m[r][c] = qr.isDark(r, c);
      }
      return m;
    } catch (e) { return null; }
  }

  // FIXED: uses actual RS block data capacity, not char-count-field bits
  function getTypeNumber(data, ecl) {
    for (let t = 1; t <= 40; t++) {
      const rsb = QRCodeModel.getRSBlocks(t, ecl);
      const totalDataBytes = rsb.reduce((s, b) => s + b.dataCount, 0);
      const ccBits = QRUtil.getLengthInBits(t, 4); // char count field width
      const maxBytes = Math.floor((totalDataBytes * 8 - 4 - ccBits) / 8);
      if (data.length <= maxBytes) return t;
    }
    return 40;
  }

  // ─── QRCodeModel ────────────────────────────────────────
  function QRCodeModel(tv, ecl) {
    this.typeNumber = tv; this.errorCorrectLevel = ecl;
    this.modules = null; this.moduleCount = 0;
    this.dataCache = null; this.dataList = [];
  }
  QRCodeModel.prototype = {
    addData(d) { this.dataList.push(new QR8bitByte(d)); this.dataCache = null; },
    isDark(r, c) { if (r < 0 || this.moduleCount <= r || c < 0 || this.moduleCount <= c) throw new Error(r + ',' + c); return this.modules[r][c]; },
    getModuleCount() { return this.moduleCount; },
    make() { this.makeImpl(false, this.getBestMaskPattern()); },
    makeImpl(test, mp) {
      this.moduleCount = this.typeNumber * 4 + 17;
      this.modules = Array.from({ length: this.moduleCount }, () => new Array(this.moduleCount).fill(null));
      this.setupPositionProbePattern(0, 0);
      this.setupPositionProbePattern(this.moduleCount - 7, 0);
      this.setupPositionProbePattern(0, this.moduleCount - 7);
      this.setupPositionAdjustPattern(); this.setupTimingPattern();
      this.setupTypeInfo(test, mp);
      if (this.typeNumber >= 7) this.setupTypeNumber(test);
      if (this.dataCache == null) this.dataCache = QRCodeModel.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
      this.mapData(this.dataCache, mp);
    },
    setupPositionProbePattern(row, col) {
      for (let r = -1; r <= 7; r++) {
        if (row + r <= -1 || this.moduleCount <= row + r) continue;
        for (let c = -1; c <= 7; c++) {
          if (col + c <= -1 || this.moduleCount <= col + c) continue;
          this.modules[row + r][col + c] = (0 <= r && r <= 6 && (c === 0 || c === 6)) || (0 <= c && c <= 6 && (r === 0 || r === 6)) || (2 <= r && r <= 4 && 2 <= c && c <= 4);
        }
      }
    },
    getBestMaskPattern() {
      let mp = 0, min = 0;
      for (let p = 0; p < 8; p++) { this.makeImpl(true, p); const l = QRUtil.getLostPoint(this); if (p === 0 || min > l) { min = l; mp = p; } }
      return mp;
    },
    setupTimingPattern() {
      for (let r = 8; r < this.moduleCount - 8; r++) if (this.modules[r][6] == null) this.modules[r][6] = (r % 2 === 0);
      for (let c = 8; c < this.moduleCount - 8; c++) if (this.modules[6][c] == null) this.modules[6][c] = (c % 2 === 0);
    },
    setupPositionAdjustPattern() {
      const p = QRUtil.getPatternPosition(this.typeNumber);
      for (let i = 0; i < p.length; i++) for (let j = 0; j < p.length; j++) {
        const r = p[i], c = p[j];
        if (this.modules[r][c] != null) continue;
        for (let pr = -2; pr <= 2; pr++) for (let pc = -2; pc <= 2; pc++)
          this.modules[r + pr][c + pc] = (pr === -2 || pr === 2 || pc === -2 || pc === 2 || (pr === 0 && pc === 0));
      }
    },
    setupTypeNumber(test) {
      const b = QRUtil.getBCHTypeNumber(this.typeNumber);
      for (let i = 0; i < 18; i++) { const m = !test && ((b >> i) & 1) === 1; this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = m; }
      for (let i = 0; i < 18; i++) { const m = !test && ((b >> i) & 1) === 1; this.modules[i % 3 + this.moduleCount - 8 - 3][Math.floor(i / 3)] = m; }
    },
    setupTypeInfo(test, mp) {
      const d = (this.errorCorrectLevel << 3) | mp, b = QRUtil.getBCHTypeInfo(d);
      for (let i = 0; i < 15; i++) {
        const m = !test && ((b >> i) & 1) === 1;
        if (i < 6) this.modules[i][8] = m; else if (i < 8) this.modules[i + 1][8] = m; else this.modules[this.moduleCount - 15 + i][8] = m;
      }
      for (let i = 0; i < 15; i++) {
        const m = !test && ((b >> i) & 1) === 1;
        if (i < 8) this.modules[8][this.moduleCount - i - 1] = m; else if (i < 9) this.modules[8][15 - i] = m; else this.modules[8][15 - i - 1] = m;
      }
      this.modules[this.moduleCount - 8][8] = !test;
    },
    mapData(data, mp) {
      let inc = -1, row = this.moduleCount - 1, bitIdx = 7, byteIdx = 0;
      for (let col = this.moduleCount - 1; col > 0; col -= 2) {
        if (col === 6) col--;
        while (true) {
          for (let c = 0; c < 2; c++) {
            if (this.modules[row][col - c] == null) {
              let d = false;
              if (byteIdx < data.length) d = ((data[byteIdx] >>> bitIdx) & 1) === 1;
              if (QRUtil.getMask(mp, row, col - c)) d = !d;
              this.modules[row][col - c] = d; bitIdx--;
              if (bitIdx === -1) { byteIdx++; bitIdx = 7; }
            }
          }
          row += inc;
          if (row < 0 || this.moduleCount <= row) { row -= inc; inc = -inc; break; }
        }
      }
    }
  };

  QRCodeModel.createData = function (tv, ecl, list) {
    const rsb = QRCodeModel.getRSBlocks(tv, ecl), buf = new QRBitBuffer();
    for (const d of list) { buf.put(d.mode, 4); buf.put(d.getLength(), QRUtil.getLengthInBits(tv, d.mode)); d.write(buf); }
    const total = rsb.reduce((s, b) => s + b.dataCount, 0);
    if (buf.getLengthInBits() > total * 8) throw new Error('overflow');
    if (buf.getLengthInBits() + 4 <= total * 8) buf.put(0, 4);
    while (buf.getLengthInBits() % 8 !== 0) buf.putBit(false);
    while (buf.getLengthInBits() < total * 8) { buf.put(236, 8); if (buf.getLengthInBits() < total * 8) buf.put(17, 8); }
    return QRCodeModel.createBytes(buf, rsb);
  };

  QRCodeModel.createBytes = function (buf, rsb) {
    let off = 0, maxDc = 0, maxEc = 0;
    const dcdata = [], ecdata = [];
    for (let r = 0; r < rsb.length; r++) {
      const dc = rsb[r].dataCount, ec = rsb[r].totalCount - dc;
      maxDc = Math.max(maxDc, dc); maxEc = Math.max(maxEc, ec);
      dcdata[r] = Array.from({ length: dc }, (_, i) => 0xff & buf.buffer[i + off]); off += dc;
      const rs = QRUtil.getErrorCorrectPolynomial(ec);
      const raw = new QRPolynomial(dcdata[r], rs.getLength() - 1);
      const mod = raw.mod(rs);
      ecdata[r] = Array.from({ length: rs.getLength() - 1 }, (_, i) => i < mod.getLength() ? mod.get(i) : 0);
    }
    const data = []; let idx = 0;
    for (let i = 0; i < maxDc; i++) for (let r = 0; r < rsb.length; r++) if (i < dcdata[r].length) data[idx++] = dcdata[r][i];
    for (let i = 0; i < maxEc; i++) for (let r = 0; r < rsb.length; r++) if (i < ecdata[r].length) data[idx++] = ecdata[r][i];
    return data;
  };

  QRCodeModel.getRSBlocks = function (tv, ecl) {
    const t = QRRSBlock.getRSBlocks(tv, ecl), l = [];
    for (let i = 0; i < t.length; i += 3) { const c = t[i], tc = t[i + 1], dc = t[i + 2]; for (let j = 0; j < c; j++) l.push(new QRRSBlock(tc, dc)); }
    return l;
  };

  // ─── QRRSBlock ───────────────────────────────────────────
  function QRRSBlock(tc, dc) { this.totalCount = tc; this.dataCount = dc; }
  QRRSBlock.RS_BLOCK_TABLE = [
    [1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],
    [1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],
    [1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],[4,43,19],[4,43,15],
    [2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],
    [2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],
    [4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],
    [4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],
    [5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12],[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],
    [1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],
    [3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],
    [4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13],
    [4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16],[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17],
    [8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16],[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17],
    [8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16],[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16],
    [7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16],[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16],
    [13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16],[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16],
    [17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16],[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17],
    [12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16],[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16],
    [17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16],[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16],
    [20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16],[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16]
  ];
  QRRSBlock.getRSBlocks = function (tv, ecl) {
    const d = QRRSBlock.getRsBlockTable(tv, ecl);
    if (!d) throw new Error('bad rs block');
    const r = [];
    for (let i = 0; i < d.length / 3; i++) { const c = d[i*3], tc = d[i*3+1], dc = d[i*3+2]; for (let j = 0; j < c; j++) r.push(new QRRSBlock(tc, dc)); }
    return r;
  };
  QRRSBlock.getRsBlockTable = function (tv, ecl) {
    const idx = (tv - 1) * 4;
    switch (ecl) { case 1: return QRRSBlock.RS_BLOCK_TABLE[idx]; case 0: return QRRSBlock.RS_BLOCK_TABLE[idx+1]; case 3: return QRRSBlock.RS_BLOCK_TABLE[idx+2]; case 2: return QRRSBlock.RS_BLOCK_TABLE[idx+3]; }
  };

  // ─── Helpers ─────────────────────────────────────────────
  function QRBitBuffer() { this.buffer = []; this.length = 0; }
  QRBitBuffer.prototype = {
    get(i) { return ((this.buffer[Math.floor(i / 8)] >>> (7 - i % 8)) & 1) === 1; },
    put(num, len) { for (let i = 0; i < len; i++) this.putBit(((num >>> (len - i - 1)) & 1) === 1); },
    getLengthInBits() { return this.length; },
    putBit(bit) {
      const bi = Math.floor(this.length / 8);
      if (this.buffer.length <= bi) this.buffer.push(0);
      if (bit) this.buffer[bi] |= 0x80 >>> (this.length % 8);
      this.length++;
    }
  };

  function QR8bitByte(d) { this.mode = 4; this.data = d; }
  QR8bitByte.prototype = { getLength() { return this.data.length; }, write(buf) { for (let i = 0; i < this.data.length; i++) buf.put(this.data.charCodeAt(i), 8); } };

  function QRPolynomial(num, shift) {
    let offset = 0;
    while (offset < num.length && num[offset] === 0) offset++;
    this.num = Array.from({ length: num.length - offset + shift }, (_, i) => i < num.length - offset ? num[i + offset] : 0);
  }
  QRPolynomial.prototype = {
    get(i) { return this.num[i]; },
    getLength() { return this.num.length; },
    multiply(e) {
      const n = new Array(this.getLength() + e.getLength() - 1).fill(0);
      for (let i = 0; i < this.getLength(); i++) for (let j = 0; j < e.getLength(); j++) n[i+j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)));
      return new QRPolynomial(n, 0);
    },
    mod(e) {
      if (this.getLength() - e.getLength() < 0) return this;
      const r = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
      const n = this.num.slice();
      for (let i = 0; i < e.getLength(); i++) n[i] ^= QRMath.gexp(QRMath.glog(e.get(i)) + r);
      return new QRPolynomial(n, 0).mod(e);
    }
  };

  const EXP_TABLE = (() => { const t = []; for (let i = 0; i < 8; i++) t[i] = 1 << i; for (let i = 8; i < 256; i++) t[i] = t[i-4]^t[i-5]^t[i-6]^t[i-8]; return t; })();
  const LOG_TABLE = (() => { const t = new Array(256).fill(0); for (let i = 0; i < 255; i++) t[EXP_TABLE[i]] = i; return t; })();
  const QRMath = {
    gexp(n) { while (n < 0) n += 255; while (n >= 256) n -= 255; return EXP_TABLE[n]; },
    glog(n) { if (n < 1) throw new Error('glog(' + n + ')'); return LOG_TABLE[n]; }
  };

  const QRUtil = {
    PATTERN_POSITION_TABLE: [
      [], [6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],
      [6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],
      [6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],
      [6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],
      [6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],
      [6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],
      [6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]
    ],
    getPatternPosition(tv) { return QRUtil.PATTERN_POSITION_TABLE[tv - 1]; },
    getMask(mp, i, j) {
      switch (mp) {
        case 0: return (i + j) % 2 === 0; case 1: return i % 2 === 0; case 2: return j % 3 === 0;
        case 3: return (i + j) % 3 === 0; case 4: return (Math.floor(i/2) + Math.floor(j/3)) % 2 === 0;
        case 5: return (i*j) % 2 + (i*j) % 3 === 0; case 6: return ((i*j)%2 + (i*j)%3) % 2 === 0;
        case 7: return ((i*j)%3 + (i+j)%2) % 2 === 0; default: throw new Error('bad maskPattern');
      }
    },
    getErrorCorrectPolynomial(ecl) {
      let a = new QRPolynomial([1], 0);
      for (let i = 0; i < ecl; i++) a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0));
      return a;
    },
    getLengthInBits(tv, mode) {
      if (tv < 10) { if (mode===1) return 10; if (mode===2) return 9; if (mode===4) return 8; if (mode===8) return 8; }
      else if (tv < 27) { if (mode===1) return 12; if (mode===2) return 11; if (mode===4) return 16; if (mode===8) return 10; }
      else { if (mode===1) return 14; if (mode===2) return 13; if (mode===4) return 16; if (mode===8) return 12; }
      throw new Error('mode:' + mode);
    },
    getLostPoint(qr) {
      const mc = qr.getModuleCount(); let lp = 0;
      for (let r = 0; r < mc; r++) for (let c = 0; c < mc; c++) {
        let sc = 0; const d = qr.isDark(r, c);
        for (let nr = -1; nr <= 1; nr++) for (let nc = -1; nc <= 1; nc++) {
          if (nr===0 && nc===0) continue;
          if (r+nr<0||mc<=r+nr||c+nc<0||mc<=c+nc) continue;
          if (qr.isDark(r+nr, c+nc) === d) sc++;
        }
        if (sc > 5) lp += (3 + sc - 5);
      }
      return lp;
    },
    getBCHTypeInfo(d) { let v = d << 10; while (QRUtil.getBCHDigit(v) - QRUtil.getBCHDigit(1335) >= 0) v ^= (1335 << (QRUtil.getBCHDigit(v) - QRUtil.getBCHDigit(1335))); return (d << 10) | v; },
    getBCHTypeNumber(d) { let v = d << 12; while (QRUtil.getBCHDigit(v) - QRUtil.getBCHDigit(7973) >= 0) v ^= (7973 << (QRUtil.getBCHDigit(v) - QRUtil.getBCHDigit(7973))); return (d << 12) | v; },
    getBCHDigit(d) { let n = 0; while (d !== 0) { n++; d >>>= 1; } return n; }
  };

  return { draw: drawQR };
})();

const Barcode39 = (() => {
  const MAP = {
    '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
    '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
    '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', 'A': 'wnnnnwnnw', 'B': 'nnwnnwnnw',
    'C': 'wnwnnwnnn', 'D': 'nnnnwwnnw', 'E': 'wnnnwwnnn', 'F': 'nnwnwwnnn',
    'G': 'nnnnnwwnw', 'H': 'wnnnnwwnn', 'I': 'nnwnnwwnn', 'J': 'nnnnwwwnn',
    'K': 'wnnnnnnww', 'L': 'nnwnnnnww', 'M': 'wnwnnnnwn', 'N': 'nnnnwnnww',
    'O': 'wnnnwnnwn', 'P': 'nnwnwnnwn', 'Q': 'nnnnnnwww', 'R': 'wnnnnnwwn',
    'S': 'nnwnnnwwn', 'T': 'nnnnwnwwn', 'U': 'wwnnnnnnw', 'V': 'nwwnnnnnw',
    'W': 'wwwnnnnnn', 'X': 'nwnnwnnnw', 'Y': 'wwnnwnnnn', 'Z': 'nwwnwnnnn',
    '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '$': 'nwnwnwnnn',
    '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn', '*': 'nwnnwnwnn'
  };

  function sanitise(text) {
    return String(text || '')
      .toUpperCase()
      .replace(/[^0-9A-Z. \-$/+%]/g, '-');
  }

  function draw(canvas, text) {
    const value = `*${sanitise(text)}*`;
    const ctx = canvas.getContext('2d');
    const w = canvas.width || 220;
    const h = canvas.height || 56;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    let units = 0;
    for (let i = 0; i < value.length; i++) {
      const pattern = MAP[value[i]] || MAP['-'];
      for (const ch of pattern) units += ch === 'w' ? 3 : 1;
      if (i < value.length - 1) units += 1;
    }
    const margin = 8;
    const barHeight = Math.max(24, h - 18);
    const narrow = Math.max(1, Math.floor((w - margin * 2) / units));
    const actualWidth = narrow * units;
    let x = Math.floor((w - actualWidth) / 2);

    ctx.fillStyle = '#000';
    for (let i = 0; i < value.length; i++) {
      const pattern = MAP[value[i]] || MAP['-'];
      for (let p = 0; p < pattern.length; p++) {
        const width = (pattern[p] === 'w' ? 3 : 1) * narrow;
        if (p % 2 === 0) ctx.fillRect(x, 4, width, barHeight);
        x += width;
      }
      if (i < value.length - 1) x += narrow;
    }

    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(sanitise(text), w / 2, h - 4);
  }

  return { draw };
})();
