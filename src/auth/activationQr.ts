const VERSION = 8;
const SIZE = 21 + (VERSION - 1) * 4;
const DATA_CODEWORDS = 194;
const BLOCKS = 2;
const DATA_PER_BLOCK = 97;
const EC_PER_BLOCK = 24;
const ALIGNMENT_CENTERS = [6, 24, 42];

type Cell = boolean | null;

function appendBits(bits: number[], value: number, length: number) {
  for (let index = length - 1; index >= 0; index -= 1) {
    bits.push(((value >>> index) & 1) === 1 ? 1 : 0);
  }
}

function encodePayload(value: string): number[] {
  const bytes = new TextEncoder().encode(value);
  const maximumBytes = 192;
  if (bytes.length > maximumBytes) {
    throw new Error(
      'Ссылка активации слишком длинная для локального QR-кода.',
    );
  }

  const bits: number[] = [];
  appendBits(bits, 0b0100, 4); // byte mode
  appendBits(bits, bytes.length, 8);
  bytes.forEach(byte => appendBits(bits, byte, 8));

  const capacityBits = DATA_CODEWORDS * 8;
  const terminator = Math.min(4, capacityBits - bits.length);
  for (let index = 0; index < terminator; index += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const data: number[] = [];
  for (let offset = 0; offset < bits.length; offset += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      byte = (byte << 1) | bits[offset + bit];
    }
    data.push(byte);
  }

  const pads = [0xec, 0x11];
  let padIndex = 0;
  while (data.length < DATA_CODEWORDS) {
    data.push(pads[padIndex % 2]);
    padIndex += 1;
  }
  return data;
}

const GF_EXP = new Array<number>(512).fill(0);
const GF_LOG = new Array<number>(256).fill(0);

(function initGaloisField() {
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    GF_EXP[index] = value;
    GF_LOG[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let index = 255; index < 512; index += 1) {
    GF_EXP[index] = GF_EXP[index - 255];
  }
})();

function gfMultiply(left: number, right: number): number {
  if (left === 0 || right === 0) return 0;
  return GF_EXP[GF_LOG[left] + GF_LOG[right]];
}

function polynomialMultiply(left: number[], right: number[]): number[] {
  const result = new Array(left.length + right.length - 1).fill(0);
  for (let a = 0; a < left.length; a += 1) {
    for (let b = 0; b < right.length; b += 1) {
      result[a + b] ^= gfMultiply(left[a], right[b]);
    }
  }
  return result;
}

function generatorPolynomial(degree: number): number[] {
  let result = [1];
  for (let index = 0; index < degree; index += 1) {
    result = polynomialMultiply(result, [1, GF_EXP[index]]);
  }
  return result;
}

function errorCorrection(data: number[], degree: number): number[] {
  const generator = generatorPolynomial(degree);
  const work = [...data, ...new Array(degree).fill(0)];

  for (let offset = 0; offset < data.length; offset += 1) {
    const coefficient = work[offset];
    if (coefficient === 0) continue;
    for (let index = 0; index < generator.length; index += 1) {
      work[offset + index] ^=
        gfMultiply(generator[index], coefficient);
    }
  }
  return work.slice(data.length);
}

function interleavedCodewords(payload: string): number[] {
  const data = encodePayload(payload);
  const blocks = Array.from({ length: BLOCKS }, (_, block) =>
    data.slice(
      block * DATA_PER_BLOCK,
      (block + 1) * DATA_PER_BLOCK,
    ),
  );
  const ecc = blocks.map(block => errorCorrection(block, EC_PER_BLOCK));

  const result: number[] = [];
  for (let index = 0; index < DATA_PER_BLOCK; index += 1) {
    for (const block of blocks) result.push(block[index]);
  }
  for (let index = 0; index < EC_PER_BLOCK; index += 1) {
    for (const block of ecc) result.push(block[index]);
  }
  return result;
}

function bchDigit(value: number): number {
  let result = 0;
  while (value !== 0) {
    result += 1;
    value >>>= 1;
  }
  return result;
}

function formatBits(mask: number): number {
  const data = (0b01 << 3) | mask; // EC level L
  let value = data << 10;
  while (bchDigit(value) - bchDigit(0x537) >= 0) {
    value ^= 0x537 << (bchDigit(value) - bchDigit(0x537));
  }
  return ((data << 10) | value) ^ 0x5412;
}

function versionBits(): number {
  let value = VERSION << 12;
  while (bchDigit(value) - bchDigit(0x1f25) >= 0) {
    value ^= 0x1f25 << (bchDigit(value) - bchDigit(0x1f25));
  }
  return (VERSION << 12) | value;
}

function setFinder(matrix: Cell[][], row: number, col: number) {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const y = row + dy;
      const x = col + dx;
      if (y < 0 || y >= SIZE || x < 0 || x >= SIZE) continue;

      const inside = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      const dark =
        inside &&
        (dx === 0 ||
          dx === 6 ||
          dy === 0 ||
          dy === 6 ||
          (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      matrix[y][x] = dark;
    }
  }
}

function setAlignment(matrix: Cell[][], centerRow: number, centerCol: number) {
  if (matrix[centerRow][centerCol] !== null) return;
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      matrix[centerRow + dy][centerCol + dx] =
        distance === 2 || distance === 0;
    }
  }
}

function setFunctionPatterns(matrix: Cell[][]) {
  setFinder(matrix, 0, 0);
  setFinder(matrix, SIZE - 7, 0);
  setFinder(matrix, 0, SIZE - 7);

  for (const row of ALIGNMENT_CENTERS) {
    for (const col of ALIGNMENT_CENTERS) {
      setAlignment(matrix, row, col);
    }
  }

  for (let index = 8; index < SIZE - 8; index += 1) {
    if (matrix[6][index] === null) matrix[6][index] = index % 2 === 0;
    if (matrix[index][6] === null) matrix[index][6] = index % 2 === 0;
  }

  const version = versionBits();
  for (let index = 0; index < 18; index += 1) {
    const dark = ((version >>> index) & 1) === 1;
    const aRow = Math.floor(index / 3);
    const aCol = (index % 3) + SIZE - 11;
    matrix[aRow][aCol] = dark;
    matrix[aCol][aRow] = dark;
  }

  const format = formatBits(0);
  for (let index = 0; index < 15; index += 1) {
    const dark = ((format >>> index) & 1) === 1;

    if (index < 6) matrix[index][8] = dark;
    else if (index < 8) matrix[index + 1][8] = dark;
    else matrix[SIZE - 15 + index][8] = dark;

    if (index < 8) matrix[8][SIZE - index - 1] = dark;
    else if (index < 9) matrix[8][15 - index] = dark;
    else matrix[8][15 - index - 1] = dark;
  }

  matrix[SIZE - 8][8] = true;
}

function mask0(row: number, col: number): boolean {
  return (row + col) % 2 === 0;
}

export function createActivationQrMatrix(payload: string): boolean[][] {
  const matrix: Cell[][] = Array.from({ length: SIZE }, () =>
    new Array<Cell>(SIZE).fill(null),
  );
  setFunctionPatterns(matrix);

  const codewords = interleavedCodewords(payload);
  let byteIndex = 0;
  let bitIndex = 7;
  let row = SIZE - 1;
  let direction = -1;

  for (let col = SIZE - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;

    while (true) {
      for (let offset = 0; offset < 2; offset += 1) {
        const targetCol = col - offset;
        if (matrix[row][targetCol] !== null) continue;

        let dark = false;
        if (byteIndex < codewords.length) {
          dark = ((codewords[byteIndex] >>> bitIndex) & 1) === 1;
        }

        if (mask0(row, targetCol)) dark = !dark;
        matrix[row][targetCol] = dark;

        bitIndex -= 1;
        if (bitIndex < 0) {
          byteIndex += 1;
          bitIndex = 7;
        }
      }

      row += direction;
      if (row < 0 || row >= SIZE) {
        row -= direction;
        direction = -direction;
        break;
      }
    }
  }

  return matrix.map(line =>
    line.map(cell => {
      if (cell === null) {
        throw new Error('QR matrix contains an unassigned module');
      }
      return cell;
    }),
  );
}

export const ACTIVATION_QR_SIZE = SIZE;
