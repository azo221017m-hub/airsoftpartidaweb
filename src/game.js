// src/game.js - Canvas grid renderer and game state helpers

const COLORS = {
  bgDark: '#0a0a12',
  bgCell: '#0c0e1a',
  bgCellAlt: '#0e1020',
  gridLine: 'rgba(60,80,140,0.3)',
  wall: '#1a1f36',
  wallStroke: '#2a3060',
  cover: '#1a2a1a',
  coverStroke: '#2a4a2a',
  alpha: '#AAFF00',
  alphaGlow: 'rgba(170,255,0,0.35)',
  alphaFill: 'rgba(170,255,0,0.2)',
  bravo: '#ff4e4e',
  bravoGlow: 'rgba(255,78,78,0.35)',
  bravoFill: 'rgba(255,78,78,0.2)',
  neutral: '#c8ff00',
  neutralGlow: 'rgba(200,255,0,0.35)',
  moveHl: 'rgba(170,255,0,0.15)',
  moveHlBorder: 'rgba(170,255,0,0.6)',
  shootHl: 'rgba(255,78,78,0.12)',
  shootHlBorder: 'rgba(255,78,78,0.5)',
  selected: 'rgba(200,255,0,0.2)',
  selectedBorder: '#c8ff00',
  text: '#d0e0ff',
  dimText: '#5a6a8a',
  hpFull: '#00ff88',
  hpMid: '#c8ff00',
  hpLow: '#ff4e4e',
};

const UNIT_ICONS = {
  HEAVY: '⚔',
  SCOUT: '🏃',
  SNIPER: '🎯',
};

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.gameState = null;
    this.myTeam = null;
    this.selectedUnit = null;
    this.pendingAction = null; // 'move' | 'shoot'
    this.hoveredCell = null;
    this.validCells = [];
    this.flashCells = []; // [{x,y,color,until}]
    this.cellSize = 52; // Aumentado 30% desde 40
    this.gridSize = 15;
    this.gameLevel = 1; // 1 = Recluta, 2 = Ya sé poner BBs
    this.tacticalAdvantages = null; // Para nivel 2
    this.enemyCamouflage = false; // Estado de camuflaje del enemigo
    this._setupCanvas();
  }

  _setupCanvas() {
    const size = this.gridSize * this.cellSize;
    this.canvas.width = size;
    this.canvas.height = size;
  }

  updateState(gameState) {
    this.gameState = gameState;
    this.gridSize = gameState.gridSize;
    this._updateCellSize();
    this.render();
  }

  _updateCellSize() {
    const container = this.canvas.parentElement;
    if (!container) return;
    const available = Math.min(container.clientWidth - 24, container.clientHeight - 60);
    const cs = Math.floor(available / this.gridSize);
    this.cellSize = Math.max(31, Math.min(cs, 57)); // Aumentado 30%: de 24-44 a 31-57
    const size = this.gridSize * this.cellSize;
    this.canvas.width = size;
    this.canvas.height = size;
  }

  selectUnit(unit) {
    this.selectedUnit = unit;
    this.pendingAction = null;
    this.validCells = [];
    this.render();
  }

  setPendingAction(action) {
    this.pendingAction = action;
    this.validCells = action ? this._computeValidCells(action) : [];
    this.render();
  }

  _computeValidCells(action) {
    if (!this.selectedUnit || !this.gameState) return [];
    const unit = this.selectedUnit;
    const cells = [];
    const { gridSize, obstacles, units } = this.gameState;

    if (action === 'move') {
      for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
          const dist = Math.abs(x - unit.x) + Math.abs(y - unit.y);
          if (dist === 0 || dist > unit.moveRange) continue;
          const obs = obstacles.find(o => o.x === x && o.y === y);
          if (obs && obs.type === 'wall') continue;
          let occupied = false;
          for (const team of ['alpha', 'bravo']) {
            if (units[team].some(u => u.x === x && u.y === y && u.hp > 0)) { occupied = true; break; }
          }
          if (!occupied) cells.push({ x, y });
        }
      }
    } else if (action === 'shoot') {
      for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
          const dist = Math.abs(x - unit.x) + Math.abs(y - unit.y);
          if (dist === 0 || dist > unit.shootRange) continue;
          if (this._hasLOS(unit.x, unit.y, x, y)) cells.push({ x, y });
        }
      }
    }
    return cells;
  }

  _hasLOS(x1, y1, x2, y2) {
    if (!this.gameState) return false;
    const { obstacles } = this.gameState;
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;
    let cx = x1, cy = y1;
    while (cx !== x2 || cy !== y2) {
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
      if (cx === x2 && cy === y2) break;
      if (obstacles.some(o => o.x === cx && o.y === cy && o.type === 'wall')) return false;
    }
    return true;
  }

  setHoveredCell(x, y) {
    if (this.hoveredCell?.x === x && this.hoveredCell?.y === y) return;
    this.hoveredCell = (x >= 0 && y >= 0) ? { x, y } : null;
    this.render();
  }

  addFlash(x, y, color = COLORS.neutral, duration = 400) {
    this.flashCells.push({ x, y, color, until: Date.now() + duration });
    setTimeout(() => this.render(), 50);
    setTimeout(() => this.render(), 200);
    setTimeout(() => { this.flashCells = this.flashCells.filter(f => f.until > Date.now()); this.render(); }, duration + 50);
  }

  canvasToGrid(cx, cy) {
    const cs = this.cellSize;
    return {
      x: Math.floor(cx / cs),
      y: Math.floor(cy / cs),
    };
  }

  render() {
    if (!this.gameState) return;
    const { ctx, cellSize: cs, gridSize } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Background
    ctx.fillStyle = COLORS.bgDark;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw cells
    for (let x = 0; x < gridSize; x++) {
      for (let y = 0; y < gridSize; y++) {
        this._drawCell(x, y, cs);
      }
    }

    // Draw grid lines
    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gridSize; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs, gridSize * cs);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cs); ctx.lineTo(gridSize * cs, i * cs);
      ctx.stroke();
    }

    // Draw units
    const { units } = this.gameState;
    
    // Nivel 2: Niebla de guerra - solo mostrar unidades propias (excepto si radar está activo)
    const radarActive = this.tacticalAdvantages?.radar?.active;
    
    if (this.gameLevel === 2 && this.myTeam) {
      const myUnits = units[this.myTeam];
      for (const unit of myUnits) {
        this._drawUnit(unit, cs);
      }
      
      // Si el radar está activo, mostrar unidades enemigas SIN camuflaje activo
      if (radarActive) {
        const enemyTeam = this.myTeam === 'alpha' ? 'bravo' : 'alpha';
        const enemyUnits = units[enemyTeam];
        
        // Si el enemigo tiene camuflaje activo, NO mostrar sus unidades
        if (!this.enemyCamouflage) {
          for (const unit of enemyUnits) {
            this._drawUnit(unit, cs, true); // true = es enemigo visible por radar
          }
        }
      }
    } else {
      // Nivel 1: Mostrar todas las unidades
      for (const team of ['alpha', 'bravo']) {
        for (const unit of units[team]) {
          this._drawUnit(unit, cs);
        }
      }
    }

    // Coordinate labels on border
    this._drawCoordLabels(cs, gridSize);
  }

  _drawCell(x, y, cs) {
    const { ctx, gameState, validCells, hoveredCell, selectedUnit, flashCells } = this;
    const px = x * cs, py = y * cs;

    // Base color
    ctx.fillStyle = (x + y) % 2 === 0 ? COLORS.bgCell : COLORS.bgCellAlt;
    ctx.fillRect(px, py, cs, cs);

    // Obstacle
    const obs = gameState.obstacles.find(o => o.x === x && o.y === y);
    if (obs) {
      if (obs.type === 'wall') {
        ctx.fillStyle = COLORS.wall;
        ctx.fillRect(px, py, cs, cs);
        // Cross-hatch
        ctx.strokeStyle = COLORS.wallStroke;
        ctx.lineWidth = 1;
        for (let d = -cs; d < cs * 2; d += 8) {
          ctx.beginPath();
          ctx.moveTo(px + d, py);
          ctx.lineTo(px + d + cs, py + cs);
          ctx.stroke();
        }
        ctx.strokeStyle = COLORS.wallStroke;
        ctx.strokeRect(px + 1, py + 1, cs - 2, cs - 2);
      } else if (obs.type === 'cover') {
        ctx.fillStyle = COLORS.cover;
        ctx.fillRect(px, py, cs, cs);
        // Rock pattern
        ctx.fillStyle = COLORS.coverStroke;
        ctx.fillRect(px + 4, py + 4, cs - 8, cs - 8);
        ctx.strokeStyle = COLORS.coverStroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 1, py + 1, cs - 2, cs - 2);
        // Cover icon
        ctx.font = `${Math.floor(cs * 0.45)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#88aa55';
        ctx.fillText('🪨', px + cs / 2, py + cs / 2);
        ctx.globalAlpha = 1;
      }
    }

    // Valid cell highlight
    const isValid = validCells.some(c => c.x === x && c.y === y);
    if (isValid) {
      const isShoot = this.pendingAction === 'shoot';
      ctx.fillStyle = isShoot ? COLORS.shootHl : COLORS.moveHl;
      ctx.fillRect(px, py, cs, cs);
      ctx.strokeStyle = isShoot ? COLORS.shootHlBorder : COLORS.moveHlBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);
    }

    // Selected unit position
    if (selectedUnit && selectedUnit.x === x && selectedUnit.y === y) {
      ctx.fillStyle = COLORS.selected;
      ctx.fillRect(px, py, cs, cs);
      ctx.strokeStyle = COLORS.selectedBorder;
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, cs - 2, cs - 2);
    }

    // Hover highlight
    if (hoveredCell && hoveredCell.x === x && hoveredCell.y === y) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(px, py, cs, cs);
    }

    // Flash effect
    const flash = flashCells.find(f => f.x === x && f.y === y && f.until > Date.now());
    if (flash) {
      ctx.fillStyle = flash.color.replace(')', ',0.5)').replace('rgb', 'rgba');
      ctx.fillRect(px, py, cs, cs);
    }
  }

  _drawUnit(unit, cs, detectedByRadar = false) {
    const { ctx } = this;
    if (unit.hp <= 0) {
      // Draw skull for eliminated
      ctx.font = `${Math.floor(cs * 0.5)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.3;
      ctx.fillText('💀', unit.x * cs + cs / 2, unit.y * cs + cs / 2);
      ctx.globalAlpha = 1;
      return;
    }

    const px = unit.x * cs, py = unit.y * cs;
    const isAlpha = unit.team === 'alpha';
    const color = isAlpha ? COLORS.alpha : COLORS.bravo;
    const glow = isAlpha ? COLORS.alphaGlow : COLORS.bravoGlow;
    const fill = isAlpha ? COLORS.alphaFill : COLORS.bravoFill;
    const isSelected = this.selectedUnit?.id === unit.id;
    const isMyUnit = unit.team === this.myTeam;

    // Si es detectado por radar, ajustar opacidad
    if (detectedByRadar) {
      ctx.globalAlpha = 0.7;
    }

    // Background circle
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = isSelected ? 12 : 6;

    // Unit body
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(px + 3, py + 3, cs - 6, cs - 6, 4);
    ctx.fill();

    // Border (con blindaje si está activo)
    if (isMyUnit && this.tacticalAdvantages?.armor?.active) {
      ctx.strokeStyle = '#00d4ff'; // Color azul para blindaje
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 2]);
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 2 : 1.5;
      ctx.setLineDash([]);
    }
    ctx.stroke();

    ctx.restore();

    // Unit icon
    ctx.font = `${Math.floor(cs * 0.4)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(UNIT_ICONS[unit.type] || '●', px + cs / 2, py + cs / 2 - 2);

    // HP bar
    const barW = cs - 8;
    const barH = 3;
    const barX = px + 4;
    const barY = py + cs - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(barX, barY, barW, barH);
    const hpRatio = unit.hp / unit.maxHp;
    ctx.fillStyle = hpRatio > 0.6 ? COLORS.hpFull : hpRatio > 0.3 ? COLORS.hpMid : COLORS.hpLow;
    ctx.fillRect(barX, barY, Math.round(barW * hpRatio), barH);

    // Acted indicator
    if (unit.acted) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(px, py, cs, cs);
    }

    // Cover indicator
    if (unit.inCover && !unit.acted) {
      ctx.font = `${Math.floor(cs * 0.25)}px serif`;
      ctx.fillText('🪨', px + cs - 10, py + 10);
    }
    
    // Blindaje indicator (nivel 2)
    if (isMyUnit && this.tacticalAdvantages?.armor?.active) {
      ctx.font = `${Math.floor(cs * 0.2)}px serif`;
      ctx.fillText('🛡', px + 6, py + 10);
    }
    
    // Mira indicator (nivel 2)
    if (isMyUnit && this.tacticalAdvantages?.scope?.active) {
      ctx.font = `${Math.floor(cs * 0.2)}px serif`;
      ctx.fillText('🔭', px + cs - 10, py + cs - 8);
    }
    
    // Radar indicator (unidad detectada)
    if (detectedByRadar) {
      ctx.font = `${Math.floor(cs * 0.25)}px serif`;
      ctx.fillText('📡', px + cs / 2, py + 6);
    }
    
    // Restaurar alpha
    ctx.globalAlpha = 1;
  }

  _drawCoordLabels(cs, gridSize) {
    // Labels are drawn outside canvas in HTML, skip
  }
}

export function coordToXY(coord) {
  // Parse "A1" to {x:0,y:0}, "B3" to {x:2,y:1}
  if (!coord || coord.length < 2 || coord.length > 3) return null;
  const letter = coord[0].toUpperCase();
  const num = parseInt(coord.slice(1), 10);
  const y = letter.charCodeAt(0) - 65; // A=0, B=1...
  const x = num - 1;
  return { x, y };
}

export function xyToCoord(x, y) {
  const letter = String.fromCharCode(65 + y);
  return `${letter}${x + 1}`;
}

export function getUnitCoord(unit) {
  return xyToCoord(unit.x, unit.y);
}

export function getHpClass(hp, maxHp) {
  const ratio = hp / maxHp;
  if (hp <= 0) return 'hp-dead';
  if (ratio > 0.6) return 'hp-full';
  if (ratio > 0.3) return 'hp-mid';
  return 'hp-low';
}

export function buildHpPips(hp, maxHp) {
  let html = '';
  for (let i = 0; i < maxHp; i++) {
    const filled = i < hp;
    const cls = filled ? `filled ${hp / maxHp > 0.6 ? '' : hp / maxHp > 0.3 ? 'mid' : 'low'}` : '';
    html += `<span class="hp-pip ${cls}"></span>`;
  }
  return html;
}
