/**
 * Volleyball Heatmap
 * Version 1.1
 * Copyright (c) 2025 Jared Mathes
 * 
 * This work is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0
 * International License. To view a copy of this license, visit:
 * http://creativecommons.org/licenses/by-nc-sa/4.0/
 * 
 * Displays a 15m x 15m grid with:
 * - A centered 9m x 9m square
 * - A new rectangle above the square (9m x 3m, light gray)
 * - Dashed lines connecting the shapes
 * - Click functionality to add heatmap points with dot and cloud effect
 * - Session management with undo/redo and save/load
 */

(function() {
    'use strict';

    // =====================================================
    // CONFIGURATION OBJECT
    // =====================================================
    
    /**
     * @typedef {Object} AppConfig
     */
    const CONFIG = Object.freeze({
        version: '1.1',
        debug: {
            enabled: false, // Enable debug mode for development
            assertionsEnabled: true, // Enable runtime assertions
            logLevel: 'warn' // 'error', 'warn', 'info', 'debug'
        },
        grid: {
            size: 15, // Court width in meters (constant for both modes)
            canvasSize: 600, // Canvas width in pixels (constant for both modes)
            innerSquareSize: 9, // meters
            gridLineColor: '#e0e0e0',
            gridLineWidth: 1
        },
        drawing: {
            cloudRadius: 45, // pixels
            dotRadius: 1, // pixels
            dotColor: '#000000',
            dashedLineWidthMeters: 11,
            dashedLineStroke: 4, // pixels
            dashLength: 10, // pixels
            circleDiameter: 6, // pixels
            circleScale: 3, // multiplier for circle size
            chartingLineWidth: 1, // pixels
            numberFont: '14px Arial',
            numberColor: '#0000FF',
            numberOffsetX: 7,
            numberOffsetY: -7
        },
        colors: {
            outside: 'rgba(0, 128, 128, 0.85)', // teal
            insideAbove: 'rgb(255, 165, 0)', // orange
            insideBelow: 'rgb(255, 200, 128)', // light orange
            newRect: 'rgb(200, 200, 200)', // light gray
            innerSquareBorder: '#333',
            dashedLine: '#000000'
        },
        teamColors: {
            noTeam: '#000000', // black - when not tracking teams
            us: '#00AA00', // green - our team
            opp: '#0000FF' // blue - opponent team
        },
        gradient: {
            stops: [
                { offset: 0, color: 'rgba(255, 0, 0, 0.30)' },
                { offset: 0.3, color: 'rgba(255, 0, 0, 0.224)' },
                { offset: 0.5, color: 'rgba(200, 0, 150, 0.140)' },
                { offset: 0.7, color: 'rgba(128, 128, 255, 0.084)' },
                { offset: 1, color: 'rgba(173, 216, 230, 0)' }
            ]
        },
        zones: {
            horizontalLineOffset: 3, // meters from top of inner square
            attackLineExtensionMultiplier: 1.5
        },
        validation: {
            minRotation: 1,
            maxRotation: 6,
            validModes: ['simpleHeatmap', 'heatmapCharting'],
            minJerseyFiltersForClear: 2,
            maxFileSize: 10 * 1024 * 1024, // 10MB in bytes
            maxPointCount: 10000, // Performance warning threshold
            maxUndoStackSize: 1000, // Maximum undo/redo history (0 = unlimited)
            autoTrimUndoStack: true // Automatically trim oldest entries when limit reached
        }
    });

    // =====================================================
    // DEBUG UTILITIES
    // =====================================================
    
    /**
     * Debug logger with configurable levels
     */
    const Logger = {
        levels: { error: 0, warn: 1, info: 2, debug: 3 },
        
        log(level, message, ...args) {
            if (!CONFIG.debug.enabled) return;
            
            const configLevel = this.levels[CONFIG.debug.logLevel] || 1;
            const messageLevel = this.levels[level] || 1;
            
            if (messageLevel <= configLevel) {
                const method = level === 'debug' || level === 'info' ? 'log' : level;
                console[method](`[${level.toUpperCase()}]`, message, ...args);
            }
        },
        
        error(message, ...args) { this.log('error', message, ...args); },
        warn(message, ...args) { this.log('warn', message, ...args); },
        info(message, ...args) { this.log('info', message, ...args); },
        debug(message, ...args) { this.log('debug', message, ...args); }
    };
    
    /**
     * Runtime assertions for development
     * @param {boolean} condition - Condition to assert
     * @param {string} message - Error message if assertion fails
     */
    function assert(condition, message) {
        if (CONFIG.debug.enabled && CONFIG.debug.assertionsEnabled && !condition) {
            throw new Error(`Assertion failed: ${message}`);
        }
    }

    // =====================================================
    // BROWSER COMPATIBILITY CHECK
    // =====================================================
    
    /**
     * Check for required browser features
     * @returns {Object} Object with feature availability and missing features
     */
    function checkBrowserCompatibility() {
        const features = {
            fileReader: typeof FileReader !== 'undefined',
            blob: typeof Blob !== 'undefined',
            url: typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function',
            canvas: (function() {
                try {
                    const canvas = document.createElement('canvas');
                    return !!(canvas.getContext && canvas.getContext('2d'));
                } catch(e) {
                    return false;
                }
            })(),
            json: typeof JSON !== 'undefined' && typeof JSON.parse === 'function' && typeof JSON.stringify === 'function',
            localStorage: (function() {
                try {
                    const test = '__test__';
                    localStorage.setItem(test, test);
                    localStorage.removeItem(test);
                    return true;
                } catch(e) {
                    return false;
                }
            })()
        };
        
        const missing = Object.keys(features).filter(key => !features[key]);
        
        return {
            isCompatible: missing.length === 0,
            features: features,
            missing: missing
        };
    }
    
    /**
     * Display compatibility error to user
     * @param {Array<string>} missingFeatures - List of missing features
     */
    function showCompatibilityError(missingFeatures) {
        const message = `Your browser is missing required features:\n\n${missingFeatures.join('\n')}\n\nPlease use a modern browser like Chrome, Firefox, Edge, or Safari.`;
        alert(message);
        
        // Display error in page
        document.body.innerHTML = `
            <div style="max-width: 600px; margin: 50px auto; padding: 20px; font-family: Arial, sans-serif;">
                <h1 style="color: #d32f2f;">Browser Not Supported</h1>
                <p>Your browser is missing the following required features:</p>
                <ul>
                    ${missingFeatures.map(f => `<li><strong>${f}</strong></li>`).join('')}
                </ul>
                <p>Please use a modern browser such as:</p>
                <ul>
                    <li>Google Chrome</li>
                    <li>Mozilla Firefox</li>
                    <li>Microsoft Edge</li>
                    <li>Apple Safari</li>
                </ul>
            </div>
        `;
    }

    // =====================================================
    // INPUT SANITIZATION UTILITIES
    // =====================================================
    
    /**
     * Sanitize session name input
     * @param {string} name - Raw session name
     * @returns {string} Sanitized session name
     */
    function sanitizeSessionName(name) {
        if (!name || typeof name !== 'string') {
            return '';
        }
        
        // Trim whitespace
        name = name.trim();
        
        // Remove control characters and other problematic characters
        name = name.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
        
        // Remove characters that are problematic in filenames
        name = name.replace(/[<>:"/\\|?*]/g, '');
        
        // Limit length
        const maxLength = 50;
        if (name.length > maxLength) {
            name = name.substring(0, maxLength);
        }
        
        return name;
    }
    
    /**
     * Sanitize jersey number input
     * @param {string} jerseyNumber - Raw jersey number
     * @returns {string} Sanitized jersey number (0-99 or empty)
     */
    function sanitizeJerseyNumber(jerseyNumber) {
        if (!jerseyNumber || typeof jerseyNumber !== 'string') {
            return '';
        }
        
        // Remove all non-digit characters
        jerseyNumber = jerseyNumber.replace(/\D/g, '');
        
        // Limit to 2 digits
        if (jerseyNumber.length > 2) {
            jerseyNumber = jerseyNumber.substring(0, 2);
        }
        
        // Validate range (0-99)
        const num = parseInt(jerseyNumber, 10);
        if (isNaN(num) || num < 0 || num > 99) {
            return '';
        }
        
        return jerseyNumber;
    }
    
    /**
     * Validate and sanitize coordinate values
     * @param {number} value - Coordinate value
     * @param {number} max - Maximum allowed value
     * @returns {number} Sanitized coordinate
     */
    function sanitizeCoordinate(value, max) {
        // Ensure it's a number
        if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
            Logger.warn('Invalid coordinate value:', value);
            return 0;
        }
        
        // Clamp to valid range
        return Math.max(0, Math.min(max, value));
    }

    // =====================================================
    // GEOMETRY CALCULATOR CLASS
    // =====================================================
    
    /**
     * Calculates all grid geometry based on configuration
     */
    class GridGeometry {
        constructor(config, mode = 'simpleHeatmap') {
            assert(config && typeof config === 'object', 'Config must be an object');
            assert(CONFIG.validation.validModes.includes(mode), `Invalid mode: ${mode}`);
            
            this.config = config;
            this.mode = mode;
            
            Logger.debug('GridGeometry initialized with mode:', mode);
        }
        
        get scale() {
            // Scale is always based on 15 meters width
            return this.config.grid.canvasSize / this.config.grid.size;
        }
        
        get canvasWidth() {
            return this.config.grid.canvasSize;
        }
        
        get canvasHeight() {
            // For charting mode, height is 22m at the same scale
            if (this.mode === 'heatmapCharting') {
                return 22 * this.scale;
            }
            return this.config.grid.canvasSize;
        }
        
        get innerOffset() {
            // Inner square is always centered horizontally on the 15m width
            return (this.config.grid.size - this.config.grid.innerSquareSize) / 2;
        }
        
        get verticalOffset() {
            // In charting mode, shift everything down by 7 meters
            return this.mode === 'heatmapCharting' ? 7 * this.scale : 0;
        }
        
        get innerStart() {
            return this.innerOffset * this.scale;
        }
        
        get innerStartY() {
            return this.innerStart + this.verticalOffset;
        }
        
        get innerEnd() {
            return (this.innerOffset + this.config.grid.innerSquareSize) * this.scale;
        }
        
        get innerEndY() {
            return this.innerEnd + this.verticalOffset;
        }
        
        get innerWidth() {
            return this.innerEnd - this.innerStart;
        }
        
        get horizontalLineY() {
            return (this.innerOffset + this.config.zones.horizontalLineOffset) * this.scale + this.verticalOffset;
        }
        
        get newRectWidth() {
            return 9 * this.scale;
        }
        
        get newRectHeight() {
            return 3 * this.scale;
        }
        
        get newRectX() {
            return (this.config.grid.canvasSize - this.newRectWidth) / 2;
        }
        
        get newRectY() {
            return this.innerStart - this.newRectHeight + this.verticalOffset;
        }
        
        get dashedLineWidth() {
            return this.config.drawing.dashedLineWidthMeters * this.scale;
        }
        
        get centerLineY() {
            return this.newRectY + this.newRectHeight;
        }
        
        get centerLineX1() {
            return (this.config.grid.canvasSize - this.dashedLineWidth) / 2;
        }
        
        get centerLineX2() {
            return this.centerLineX1 + this.dashedLineWidth;
        }
        
        get attackLineExtensionLength() {
            return ((this.dashedLineWidth - this.config.grid.innerSquareSize * this.scale) / 2) 
                   * this.config.zones.attackLineExtensionMultiplier;
        }
        
        /**
         * Convert pixel coordinates to meters
         * @param {number} px - X coordinate in pixels
         * @param {number} py - Y coordinate in pixels
         * @returns {{x: string, y: string}}
         */
        pixelsToMeters(px, py) {
            return {
                x: (px / this.scale).toFixed(2),
                y: ((py / this.scale) - 3).toFixed(2)
            };
        }
        
        /**
         * Check if coordinates are within grid bounds
         * @param {number} x - X coordinate in pixels
         * @param {number} y - Y coordinate in pixels
         * @returns {boolean}
         */
        isWithinBounds(x, y) {
            return x >= 0 && x <= this.canvasWidth && 
                   y >= 0 && y <= this.canvasHeight;
        }
    }

    // =====================================================
    // CANVAS MANAGER CLASS
    // =====================================================
    
    /**
     * Manages canvas operations with error handling
     */
    class CanvasManager {
        /**
         * @param {string} canvasId
         * @throws {Error} If canvas element not found
         */
        constructor(canvasId) {
            this.canvas = document.getElementById(canvasId);
            if (!this.canvas) {
                throw new Error(`Canvas element '${canvasId}' not found`);
            }
            this.ctx = this.canvas.getContext('2d');
            if (!this.ctx) {
                throw new Error(`Could not get 2d context for canvas '${canvasId}'`);
            }
        }
        
        clear() {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        
        getWidth() {
            return this.canvas.width;
        }
        
        getHeight() {
            return this.canvas.height;
        }
        
        getBoundingRect() {
            return this.canvas.getBoundingClientRect();
        }
        
        setCursor(cursorStyle) {
            this.canvas.style.cursor = cursorStyle;
        }
    }

    // =====================================================
    // SESSION STATE CLASS
    // =====================================================
    
    /**
     * @typedef {Object} Point
     * @property {number} x - X coordinate in pixels
     * @property {number} y - Y coordinate in pixels
     * @property {number} rotation - Rotation number (1-6)
     * @property {Object} [line] - Optional line data for charting mode
     * @property {number} [line.startX] - Line start X coordinate
     * @property {number} [line.startY] - Line start Y coordinate
     * @property {number} [line.endX] - Line end X coordinate
     * @property {number} [line.endY] - Line end Y coordinate
     * @property {string} [jerseyNumber] - Optional jersey number label for the line (stored as string to support leading zeros or non-numeric identifiers)
     */
    
    /**
     * @typedef {Object} Action
     * @property {string} action - Action type ('add' or 'clear')
     * @property {Point} [point] - Point for add action
     * @property {Point[]} [points] - Points for clear action
     */
    
    /**
     * Manages session state with immutable operations
     */
    class SessionState {
        constructor() {
            this.name = '';
            this.mode = 'simpleHeatmap'; // 'simpleHeatmap' or 'heatmapCharting'
            this.points = [];
            this.undoStack = [];
            this.redoStack = [];
            this.isViewOnly = false;
            this.migrationInfo = null; // Store migration messages for user notification
            // trackRotation is managed by HeatmapApp, not stored in session state
        }
        
        /**
         * Trim undo stack to maximum size if auto-trim is enabled
         */
        trimUndoStack() {
            const maxSize = CONFIG.validation.maxUndoStackSize;
            const autoTrim = CONFIG.validation.autoTrimUndoStack;
            
            if (autoTrim && maxSize > 0 && this.undoStack.length > maxSize) {
                // Remove oldest entries
                this.undoStack = this.undoStack.slice(-maxSize);
            }
        }
        
        /**
         * Trim redo stack to maximum size if auto-trim is enabled
         */
        trimRedoStack() {
            const maxSize = CONFIG.validation.maxUndoStackSize;
            const autoTrim = CONFIG.validation.autoTrimUndoStack;
            
            if (autoTrim && maxSize > 0 && this.redoStack.length > maxSize) {
                // Remove oldest entries
                this.redoStack = this.redoStack.slice(-maxSize);
            }
        }
        
        /**
         * Add a point to the session
         * @param {Point} point
         */
        addPoint(point) {
            assert(point && typeof point === 'object', 'Point must be an object');
            assert(typeof point.x === 'number' && typeof point.y === 'number', 'Point must have numeric x/y');
            assert(typeof point.rotation === 'number', 'Point must have rotation');
            
            this.points.push(point);
            this.undoStack.push({ action: 'add', point });
            this.trimUndoStack();
            this.redoStack = [];
        }
        
        /**
         * Remove the last point
         * @returns {Point|null}
         */
        removeLastPoint() {
            return this.points.pop() || null;
        }
        
        /**
         * Clear all points
         */
        clearAllPoints() {
            if (this.points.length > 0) {
                this.undoStack.push({ action: 'clear', points: [...this.points] });
                this.trimUndoStack();
                this.redoStack = [];
            }
            this.points = [];
        }
        
        /**
         * Undo last action
         * @returns {boolean} True if undo was successful
         */
        undo() {
            if (this.undoStack.length === 0) return false;
            
            const action = this.undoStack.pop();
            this.redoStack.push(action);
            this.trimRedoStack();
            
            if (action.action === 'add') {
                this.points.pop();
            } else if (action.action === 'clear') {
                this.points = [...action.points];
            }
            
            return true;
        }
        
        /**
         * Redo last undone action
         * @returns {boolean} True if redo was successful
         */
        redo() {
            if (this.redoStack.length === 0) return false;
            
            const action = this.redoStack.pop();
            this.undoStack.push(action);
            this.trimUndoStack();
            
            if (action.action === 'add') {
                this.points.push(action.point);
            } else if (action.action === 'clear') {
                this.points = [];
            }
            
            return true;
        }
        
        /**
         * Check if undo is available
         * @returns {boolean}
         */
        canUndo() {
            return this.undoStack.length > 0;
        }
    
        // Rotation tracking is controlled by HeatmapApp
        
        /**
         * Check if redo is available
         * @returns {boolean}
         */
        canRedo() {
            return this.redoStack.length > 0;
        }
        
        /**
         * Get point count
         * @returns {number}
         */
        getPointCount() {
            return this.points.length;
        }
        
        /**
         * Get all points
         * @returns {Point[]}
         */
        getPoints() {
            return [...this.points];
        }
        
        /**
         * Load session data
         * @param {Object} data
         * @param {boolean} viewOnly
         */
        load(data, viewOnly) {
            this.name = data.name || 'Loaded Session';
            this.mode = data.mode;
            this.points = data.points || [];
            
            // Migrate older files: add explicit null jerseyNumber for lines without jersey numbers
            let pointsMigrated = 0;
            let teamMigrated = 0;
            this.points.forEach(point => {
                if (point.line && !point.hasOwnProperty('jerseyNumber')) {
                    point.jerseyNumber = null;
                    pointsMigrated++;
                }
                if (point.line && !point.hasOwnProperty('team')) {
                    point.team = null;
                    teamMigrated++;
                }
            });
            
            this.undoStack = data.undoStack || [];
            this.redoStack = data.redoStack || [];
            
            // Migrate undo/redo stacks
            const migrateStack = (stack) => {
                if (!stack || !Array.isArray(stack)) return { jersey: 0, team: 0 };
                let jerseyCount = 0;
                let teamCount = 0;
                stack.forEach(action => {
                    if (action.action === 'add' && action.point) {
                        if (action.point.line && !action.point.hasOwnProperty('jerseyNumber')) {
                            action.point.jerseyNumber = null;
                            jerseyCount++;
                        }
                        if (action.point.line && !action.point.hasOwnProperty('team')) {
                            action.point.team = null;
                            teamCount++;
                        }
                    } else if (action.action === 'clear' && action.points) {
                        action.points.forEach(point => {
                            if (point.line && !point.hasOwnProperty('jerseyNumber')) {
                                point.jerseyNumber = null;
                                jerseyCount++;
                            }
                            if (point.line && !point.hasOwnProperty('team')) {
                                point.team = null;
                                teamCount++;
                            }
                        });
                    }
                });
                return { jersey: jerseyCount, team: teamCount };
            };
            
            const undoResults = migrateStack(this.undoStack);
            const redoResults = migrateStack(this.redoStack);
            pointsMigrated += undoResults.jersey + redoResults.jersey;
            teamMigrated += undoResults.team + redoResults.team;ults.jersey;
            const totalTeamMigrated = teamMigrated;
            
            // Notify user if data was migrated
            if (totalMigrated > 0 || totalTeamMigrated > 0) {
                const messages = [];
                
                if (totalMigrated > 0) {
                    Logger.info(`Migrated ${totalMigrated} line(s) to include jersey number tracking`);
                    const parts = [];
                    if (pointsMigrated > 0) parts.push(`${pointsMigrated} current`);
                    if (undoResults.jersey > 0) parts.push(`${undoResults.jersey} undo`);
                    if (redoResults.jersey > 0) parts.push(`${redoResults.jersey} redo`);
                    messages.push(`${totalMigrated} charting line(s) migrated to include jersey number tracking (${parts.join(', ')})`);
                }
                
                if (totalTeamMigrated > 0) {
                    Logger.info(`Migrated ${totalTeamMigrated} line(s) to include team tracking`);
                    messages.push(`${totalTeamMigrated} charting line(s) migrated to include team tracking`);
                }
                
                this.migrationInfo = messages.length > 0 ? `File updated:\n${messages.join('\n')}` : null;
            }
            
            this.isViewOnly = viewOnly;
        }
        
        /**
         * Reset session
         * @param {string} name
         * @param {string} mode
         */
        reset(name, mode) {
            this.name = name || 'Untitled Session';
            this.mode = mode || 'simpleHeatmap';
            this.points = [];
            this.undoStack = [];
            this.redoStack = [];
            this.isViewOnly = false;
        }
        
        /**
         * Export session data
         * @returns {Object}
         */
        export() {
            return {
                version: CONFIG.version,
                name: this.name,
                mode: this.mode,
                points: this.points,
                undoStack: this.undoStack,
                redoStack: this.redoStack,
                savedAt: new Date().toISOString()
            };
        }
    }

    // =====================================================
    // GRID RENDERER CLASS
    // =====================================================
    
    /**
     * Handles all grid rendering operations
     */
    class GridRenderer {
        /**
         * @param {CanvasManager} canvasManager
         * @param {GridGeometry} geometry
         * @param {AppConfig} config
         */
        constructor(canvasManager, geometry, config) {
            this.canvas = canvasManager;
            this.geometry = geometry;
            this.config = config;
            this.ctx = canvasManager.ctx;
        }
        
        /**
         * Draw the complete grid
         */
        draw() {
            if (!this.ctx) {
                console.error('Canvas context not available');
                return;
            }
            this.canvas.clear();
            this.drawBackgrounds();
            this.drawGridLines();
            this.drawShapes();
            this.drawDashedLines();
        }
        
        /**
         * Draw background color zones
         */
        drawBackgrounds() {
            const g = this.geometry;
            
            // Outside area (teal)
            this.ctx.fillStyle = this.config.colors.outside;
            this.ctx.fillRect(0, 0, g.canvasWidth, g.canvasHeight);
            
            if (g.mode === 'heatmapCharting') {
                this.drawChartingBackgrounds();
            } else {
                this.drawSimpleHeatmapBackgrounds();
            }
        }
        
        /**
         * Draw backgrounds for simple heatmap mode
         */
        drawSimpleHeatmapBackgrounds() {
            const g = this.geometry;
            
            // Inside above horizontal line (orange)
            this.ctx.fillStyle = this.config.colors.insideAbove;
            this.ctx.fillRect(g.innerStart, g.innerStartY, g.innerWidth, g.horizontalLineY - g.innerStartY);
            
            // Inside below horizontal line (light orange)
            this.ctx.fillStyle = this.config.colors.insideBelow;
            this.ctx.fillRect(g.innerStart, g.horizontalLineY, g.innerWidth, g.innerEndY - g.horizontalLineY);
            
            // New rectangle (light gray)
            this.ctx.fillStyle = this.config.colors.newRect;
            this.ctx.fillRect(g.newRectX, g.newRectY, g.newRectWidth, g.newRectHeight);
        }
        
        /**
         * Draw backgrounds for charting mode
         */
        drawChartingBackgrounds() {
            const g = this.geometry;
            const centerY = g.centerLineY;
            
            // Bottom section (below center line)
            // Inside above horizontal line (orange)
            this.ctx.fillStyle = this.config.colors.insideAbove;
            this.ctx.fillRect(g.innerStart, centerY, g.innerWidth, g.horizontalLineY - centerY);
            
            // Inside below horizontal line (light orange)
            this.ctx.fillStyle = this.config.colors.insideBelow;
            this.ctx.fillRect(g.innerStart, g.horizontalLineY, g.innerWidth, g.innerEndY - g.horizontalLineY);
            
            // Top section (above center line) - mirrored
            // 3x9 rectangle (gray)
            const topSmallRectHeight = 3 * g.scale;
            const topSmallRectY = centerY - topSmallRectHeight;
            this.ctx.fillStyle = this.config.colors.newRect;
            this.ctx.fillRect(g.newRectX, topSmallRectY, g.newRectWidth, topSmallRectHeight);
            
            // 6x9 rectangle (gray) above the 3x9
            const topLargeRectHeight = 6 * g.scale;
            const topLargeRectY = topSmallRectY - topLargeRectHeight;
            this.ctx.fillStyle = this.config.colors.newRect;
            this.ctx.fillRect(g.newRectX, topLargeRectY, g.newRectWidth, topLargeRectHeight);
        }
        
        /**
         * Draw meter grid lines
         */
        drawGridLines() {
            const g = this.geometry;
            
            this.ctx.strokeStyle = this.config.grid.gridLineColor;
            this.ctx.lineWidth = this.config.grid.gridLineWidth;
            this.ctx.setLineDash([]);
            
            // Horizontal lines (width is always 15m)
            for (let i = 0; i <= this.config.grid.size; i++) {
                const pos = i * g.scale;
                this.ctx.beginPath();
                this.ctx.moveTo(pos, 0);
                this.ctx.lineTo(pos, g.canvasHeight);
                this.ctx.stroke();
            }
            
            // Vertical lines (height depends on mode)
            const verticalGridSize = g.mode === 'heatmapCharting' ? 22 : this.config.grid.size;
            for (let i = 0; i <= verticalGridSize; i++) {
                const pos = i * g.scale;
                this.ctx.beginPath();
                this.ctx.moveTo(0, pos);
                this.ctx.lineTo(g.canvasWidth, pos);
                this.ctx.stroke();
            }
        }
        
        /**
         * Draw main shapes (inner square, new rectangle, horizontal line)
         */
        drawShapes() {
            const g = this.geometry;
            
            this.ctx.strokeStyle = this.config.colors.innerSquareBorder;
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([]);
            
            if (g.mode === 'heatmapCharting') {
                this.drawChartingShapes();
            } else {
                this.drawSimpleHeatmapShapes();
            }
        }
        
        /**
         * Draw shapes for simple heatmap mode
         */
        drawSimpleHeatmapShapes() {
            const g = this.geometry;
            
            // Inner square
            this.ctx.strokeRect(g.innerStart, g.innerStartY, g.innerWidth, g.innerWidth);
            
            // New rectangle
            this.ctx.strokeRect(g.newRectX, g.newRectY, g.newRectWidth, g.newRectHeight);
            
            // Horizontal line
            this.ctx.beginPath();
            this.ctx.moveTo(g.innerStart, g.horizontalLineY);
            this.ctx.lineTo(g.innerEnd, g.horizontalLineY);
            this.ctx.stroke();
        }
        
        /**
         * Draw shapes for charting mode
         */
        drawChartingShapes() {
            const g = this.geometry;
            const centerY = g.centerLineY;
            
            // Bottom section rectangles and line
            const bottomSmallRectHeight = 3 * g.scale;
            const bottomLargeRectHeight = 6 * g.scale;
            
            // Bottom 3x9 rectangle
            this.ctx.strokeRect(g.newRectX, centerY, g.newRectWidth, bottomSmallRectHeight);
            
            // Bottom 6x9 rectangle
            this.ctx.strokeRect(g.newRectX, centerY + bottomSmallRectHeight, g.newRectWidth, bottomLargeRectHeight);
            
            // Bottom horizontal line
            this.ctx.beginPath();
            this.ctx.moveTo(g.innerStart, centerY + bottomSmallRectHeight);
            this.ctx.lineTo(g.innerEnd, centerY + bottomSmallRectHeight);
            this.ctx.stroke();
            
            // Top section rectangles and line (mirrored)
            const topSmallRectHeight = 3 * g.scale;
            const topLargeRectHeight = 6 * g.scale;
            const topSmallRectY = centerY - topSmallRectHeight;
            const topLargeRectY = topSmallRectY - topLargeRectHeight;
            
            // Top 3x9 rectangle
            this.ctx.strokeRect(g.newRectX, topSmallRectY, g.newRectWidth, topSmallRectHeight);
            
            // Top 6x9 rectangle
            this.ctx.strokeRect(g.newRectX, topLargeRectY, g.newRectWidth, topLargeRectHeight);
            
            // Top horizontal line (attack line)
            const topAttackLineY = topSmallRectY;
            this.ctx.beginPath();
            this.ctx.moveTo(g.innerStart, topAttackLineY);
            this.ctx.lineTo(g.innerEnd, topAttackLineY);
            this.ctx.stroke();
        }
        
        /**
         * Draw dashed lines with circles
         */
        drawDashedLines() {
            this.drawCenterLine();
            this.drawAttackLineExtensions();
        }
        
        /**
         * Draw center line between rectangles
         */
        drawCenterLine() {
            const g = this.geometry;
            
            this.ctx.strokeStyle = this.config.colors.dashedLine;
            this.ctx.lineWidth = this.config.drawing.dashedLineStroke;
            this.ctx.setLineDash([this.config.drawing.dashLength, this.config.drawing.dashLength]);
            
            this.ctx.beginPath();
            this.ctx.moveTo(g.centerLineX1, g.centerLineY);
            this.ctx.lineTo(g.centerLineX2, g.centerLineY);
            this.ctx.stroke();
            
            // Draw circles at ends
            this.ctx.setLineDash([]);
            this.ctx.fillStyle = this.config.colors.dashedLine;
            const radius = (this.config.drawing.circleDiameter / 2) * this.config.drawing.circleScale;
            
            this.ctx.beginPath();
            this.ctx.arc(g.centerLineX1, g.centerLineY, radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.beginPath();
            this.ctx.arc(g.centerLineX2, g.centerLineY, radius, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        /**
         * Draw attack line extensions
         */
        drawAttackLineExtensions() {
            const g = this.geometry;
            
            this.ctx.strokeStyle = this.config.colors.dashedLine;
            this.ctx.lineWidth = this.config.drawing.dashedLineStroke;
            this.ctx.setLineDash([this.config.drawing.dashLength, this.config.drawing.dashLength]);
            
            if (g.mode === 'heatmapCharting') {
                // Bottom attack line extensions
                const bottomAttackLineY = g.centerLineY + (3 * g.scale);
                
                // Left extension
                this.ctx.beginPath();
                this.ctx.moveTo(g.innerStart - g.attackLineExtensionLength, bottomAttackLineY);
                this.ctx.lineTo(g.innerStart, bottomAttackLineY);
                this.ctx.stroke();
                
                // Right extension
                this.ctx.beginPath();
                this.ctx.moveTo(g.innerEnd + g.attackLineExtensionLength, bottomAttackLineY);
                this.ctx.lineTo(g.innerEnd, bottomAttackLineY);
                this.ctx.stroke();
                
                // Top attack line extensions (mirrored)
                const topAttackLineY = g.centerLineY - (3 * g.scale);
                
                // Left extension
                this.ctx.beginPath();
                this.ctx.moveTo(g.innerStart - g.attackLineExtensionLength, topAttackLineY);
                this.ctx.lineTo(g.innerStart, topAttackLineY);
                this.ctx.stroke();
                
                // Right extension
                this.ctx.beginPath();
                this.ctx.moveTo(g.innerEnd + g.attackLineExtensionLength, topAttackLineY);
                this.ctx.lineTo(g.innerEnd, topAttackLineY);
                this.ctx.stroke();
            } else {
                // Simple heatmap mode - single set of extensions
                // Left extension
                this.ctx.beginPath();
                this.ctx.moveTo(g.innerStart - g.attackLineExtensionLength, g.horizontalLineY);
                this.ctx.lineTo(g.innerStart, g.horizontalLineY);
                this.ctx.stroke();
                
                // Right extension
                this.ctx.beginPath();
                this.ctx.moveTo(g.innerEnd + g.attackLineExtensionLength, g.horizontalLineY);
                this.ctx.lineTo(g.innerEnd, g.horizontalLineY);
                this.ctx.stroke();
            }
            
            this.ctx.setLineDash([]);
        }
    }

    // =====================================================
    // HEATMAP RENDERER CLASS
    // =====================================================
    
    /**
     * Handles heatmap cloud and dot rendering
     */
    class HeatmapRenderer {
        /**
         * @param {CanvasManager} heatmapCanvas
         * @param {CanvasManager} overlayCanvas
         * @param {AppConfig} config
         */
        constructor(heatmapCanvas, overlayCanvas, config) {
            this.heatmapCanvas = heatmapCanvas;
            this.overlayCanvas = overlayCanvas;
            this.config = config;
            this.heatmapCtx = heatmapCanvas.ctx;
            this.overlayCtx = overlayCanvas.ctx;
        }
        
        /**
         * Draw a heatmap cloud at position
         * @param {number} x
         * @param {number} y
         */
        drawCloud(x, y) {
            const gradient = this.heatmapCtx.createRadialGradient(
                x, y, 0, 
                x, y, this.config.drawing.cloudRadius
            );
            
            this.config.gradient.stops.forEach(stop => {
                gradient.addColorStop(stop.offset, stop.color);
            });
            
            this.heatmapCtx.fillStyle = gradient;
            this.heatmapCtx.beginPath();
            this.heatmapCtx.arc(x, y, this.config.drawing.cloudRadius, 0, Math.PI * 2);
            this.heatmapCtx.fill();
        }
        
        /**
         * Draw a dot at position
         * @param {number} x
         * @param {number} y
         */
        drawDot(x, y) {
            this.overlayCtx.fillStyle = this.config.drawing.dotColor;
            this.overlayCtx.beginPath();
            this.overlayCtx.arc(x, y, this.config.drawing.dotRadius, 0, Math.PI * 2);
            this.overlayCtx.fill();
        }
        
        /**
         * Draw a line from start to end position
         * @param {number} startX
         * @param {number} startY
         * @param {number} endX
         * @param {number} endY
         * @param {string} [color] - Optional color override
         */
        drawLine(startX, startY, endX, endY, team) {
            // Determine color based on team
            let color;
            if (team === 'us') {
                color = this.config.teamColors.us;
            } else if (team === 'opp') {
                color = this.config.teamColors.opp;
            } else {
                color = this.config.teamColors.noTeam;
            }
            
            this.overlayCtx.strokeStyle = color;
            this.overlayCtx.lineWidth = this.config.drawing.chartingLineWidth;
            this.overlayCtx.beginPath();
            this.overlayCtx.moveTo(startX, startY);
            this.overlayCtx.lineTo(endX, endY);
            this.overlayCtx.stroke();
        }
        
        /**
         * Draw a jersey number with rotation at position
         * @param {string} jerseyNumber
         * @param {number} rotation
         * @param {number} x
         * @param {number} y
         * @param {number} endX
         * @param {number} endY
         */
        drawJerseyNumber(jerseyNumber, rotation, x, y, endX, endY, team) {
            this.overlayCtx.font = this.config.drawing.numberFont;
            
            // Determine color based on team
            let color;
            if (team === 'us') {
                color = this.config.teamColors.us;
            } else if (team === 'opp') {
                color = this.config.teamColors.opp;
            } else {
                color = this.config.teamColors.noTeam;
            }
            
            this.overlayCtx.fillStyle = color;
            this.overlayCtx.textBaseline = 'middle'; // Center vertically by default
            
            // Create display text with rotation suffix
            let displayText = '';
            if (jerseyNumber && rotation) {
                displayText = `${jerseyNumber} - R${rotation}`;
            } else if (jerseyNumber && !rotation) {
                displayText = `${jerseyNumber}`;
            } else if (!jerseyNumber && rotation) {
                displayText = `R${rotation}`;
            } else {
                displayText = '';
            }
            if (!displayText) return;
            
            // Calculate line direction
            const dx = endX - x;
            const dy = endY - y;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            
            let textX, textY;
            
            // Determine if line is primarily vertical or horizontal
            if (absDy > absDx * 2) {
                // Vertical line (more than 2:1 ratio)
                this.overlayCtx.textAlign = 'center';
                textX = x;
                if (dy > 0) {
                    // Drawing downward - place above
                    textY = y + this.config.drawing.numberOffsetY;
                } else {
                    // Drawing upward - place below
                    textY = y - this.config.drawing.numberOffsetY;
                }
            } else if (absDx > absDy * 2) {
                // Horizontal line (more than 2:1 ratio)
                textY = y; // Center vertically
                if (dx > 0) {
                    // Drawing to the right - place on left
                    this.overlayCtx.textAlign = 'right';
                    textX = x - this.config.drawing.numberOffsetX;
                } else {
                    // Drawing to the left - place on right
                    this.overlayCtx.textAlign = 'left';
                    textX = x + this.config.drawing.numberOffsetX;
                }
            } else {
                // Diagonal line - offset opposite to the direction of the line
                this.overlayCtx.textAlign = 'center';
                
                // Offset in the opposite direction of the line
                if (dx > 0 && dy > 0) {
                    // Line goes down-right, offset up-left
                    textX = x - this.config.drawing.numberOffsetX;
                    textY = y + this.config.drawing.numberOffsetY;
                } else if (dx < 0 && dy > 0) {
                    // Line goes down-left, offset up-right
                    textX = x + this.config.drawing.numberOffsetX;
                    textY = y + this.config.drawing.numberOffsetY;
                } else if (dx > 0 && dy < 0) {
                    // Line goes up-right, offset down-left
                    textX = x - this.config.drawing.numberOffsetX;
                    textY = y - this.config.drawing.numberOffsetY;
                } else {
                    // Line goes up-left, offset down-right
                    textX = x + this.config.drawing.numberOffsetX;
                    textY = y - this.config.drawing.numberOffsetY;
                }
            }
            
            this.overlayCtx.fillText(displayText, textX, textY);
            
            // Reset to defaults
            this.overlayCtx.textAlign = 'left';
            this.overlayCtx.textBaseline = 'alphabetic';
        }
        
        /**
         * Redraw all points
         * @param {Point[]} points
         * @param {Set<string>} jerseyNumberFilters - Optional set of jersey numbers to show
         * @param {Set<number>} rotationFilters - Optional set of rotations to show
         * @param {boolean} showLines - Whether to show lines and jersey numbers
         */
        redrawAll(points, jerseyNumberFilters = null, rotationFilters = null, showLines = true) {
            if (!this.heatmapCtx || !this.overlayCtx) {
                console.error('Canvas contexts not available');
                return;
            }
            
            this.heatmapCanvas.clear();
            this.overlayCanvas.clear();
            
            points.forEach(point => {
                // Apply jersey number filter if active
                if (jerseyNumberFilters !== null && jerseyNumberFilters.size > 0) {
                    const pointJerseyNumber = (point.line && point.jerseyNumber !== null && point.jerseyNumber !== undefined) ? point.jerseyNumber : '-';
                    if (!jerseyNumberFilters.has(pointJerseyNumber)) {
                        return; // Skip this point
                    }
                }
                
                // Apply rotation filter if active
                if (rotationFilters !== null && rotationFilters.size > 0) {
                    // Treat null rotation as '-' and skip unless filter matches
                    const rotVal = (point.rotation === null || point.rotation === undefined) ? '-' : point.rotation;
                    if (!rotationFilters.has(rotVal)) {
                        return; // Skip this point
                    }
                }
                
                // Draw line first if it exists and lines are visible
                if (point.line && showLines) {
                    this.drawLine(point.line.startX, point.line.startY, point.line.endX, point.line.endY, point.team);
                    // Draw jersey number with rotation when tracked; if rotation untracked, only jersey
                    const rotationForDisplay = (point.rotation === null || point.rotation === undefined) ? null : point.rotation;
                    this.drawJerseyNumber(point.jerseyNumber || '', rotationForDisplay, point.line.startX, point.line.startY, point.line.endX, point.line.endY, point.team);
                }
                this.drawCloud(point.x, point.y);
                this.drawDot(point.x, point.y);
            });
        }
        
        /**
         * Clear all drawings
         */
        clear() {
            this.heatmapCanvas.clear();
            this.overlayCanvas.clear();
        }
    }

    // =====================================================
    // UI MANAGER CLASS
    // =====================================================
    
    /**
     * Manages UI elements and updates
     */
    class UIManager {
        constructor() {
            this.elements = {};
            this.eventListeners = [];
        }
        
        /**
         * Initialize a UI element with error handling
         * @param {string} id
         * @param {string} [errorMessage]
         * @returns {HTMLElement}
         * @throws {Error} If element not found
         */
        initElement(id, errorMessage) {
            const element = document.getElementById(id);
            if (!element) {
                const msg = errorMessage || `UI element '${id}' not found`;
                console.error(msg);
                throw new Error(msg);
            }
            this.elements[id] = element;
            return element;
        }
        
        /**
         * Get an initialized element
         * @param {string} id
         * @returns {HTMLElement}
         */
        getElement(id) {
            return this.elements[id];
        }
        
        /**
         * Add a managed event listener
         * @param {HTMLElement} element
         * @param {string} event
         * @param {Function} handler
         */
        addEventListener(element, event, handler) {
            element.addEventListener(event, handler);
            this.eventListeners.push({ element, event, handler });
        }
        
        /**
         * Update point count display
         * @param {number} count
         */
        updatePointCount(count) {
            const span = this.elements.clickCount;
            if (span) span.textContent = `Points: ${count}`;
        }
        
        /**
         * Update coordinates display
         * @param {string} text
         */
        updateCoordinates(text) {
            const span = this.elements.coordinates;
            if (span) span.textContent = text;
        }
        
        /**
         * Update jersey number input display
         * @param {string} text
         */
        updateJerseyNumberInput(text) {
            const span = this.elements.jerseyNumberInput;
            if (span) span.textContent = text || '-';
        }
        
        /**
         * Update jersey number list display
         * @param {Point[]} points
         * @param {Set<string>} activeFilters
         */
        updateJerseyNumberList(points, activeFilters = null) {
            const listEl = this.elements.jerseyNumberList;
            if (!listEl) return;
            
            // Count occurrences of each jersey number
            const jerseyNumberCounts = {};
            let blankCount = 0;
            
            points.forEach(point => {
                if (point.line) {
                    // Check for null or undefined jersey number
                    if (point.jerseyNumber !== null && point.jerseyNumber !== undefined) {
                        const num = point.jerseyNumber;
                        jerseyNumberCounts[num] = (jerseyNumberCounts[num] || 0) + 1;
                    } else {
                        blankCount++;
                    }
                }
            });
            
            // Sort jersey numbers in ascending order
            const sortedJerseyNumbers = Object.keys(jerseyNumberCounts)
                .map(n => parseInt(n, 10))
                .sort((a, b) => a - b);
            
            // Build the list HTML
            let html = '';
            
            // Add blank lines at top if any exist
            if (blankCount > 0) {
                const isActive = activeFilters && activeFilters.has('-');
                html += `<button class="jersey-number-list-item${isActive ? ' active' : ''}" data-jersey-number="-">- [${blankCount}]</button>`;
            }
            
            // Add lines with jersey numbers
            sortedJerseyNumbers.forEach(num => {
                const count = jerseyNumberCounts[num];
                const isActive = activeFilters && activeFilters.has(String(num));
                html += `<button class="jersey-number-list-item${isActive ? ' active' : ''}" data-jersey-number="${num}">${num} [${count}]</button>`;
            });
            
            listEl.innerHTML = html;
            
            // Show/hide clear filters button - only show if more than the minimum filters are active
            const clearBtn = this.elements.clearJerseyFiltersBtn;
            if (clearBtn) {
                clearBtn.style.display = (activeFilters && activeFilters.size >= CONFIG.validation.minJerseyFiltersForClear) ? 'flex' : 'none';
            }
        }
        
        /**
         * Update rotation list display
         * @param {number} assignedRotation - Currently assigned rotation (1-6)
         * @param {Set<number>} filteredRotations - Set of filtered rotations
         * @param {boolean} isViewOnly - Whether in view-only mode
         */
        updateRotationList(assignedRotation, filteredRotations, isViewOnly = false) {
            const listEl = this.elements.rotationList;
            if (!listEl) return;
            
            let html = '';
            for (let i = 1; i <= 6; i++) {
                const isAssigned = !isViewOnly && this.app && this.app.trackRotation && assignedRotation === i;
                const isFiltered = filteredRotations && filteredRotations.has(i);
                const classes = [];
                if (isAssigned) classes.push('assigned');
                if (this.app && !this.app.trackRotation) classes.push('disabled');
                if (isFiltered) classes.push('filtered');
                const className = classes.length > 0 ? ' ' + classes.join(' ') : '';
                html += `<button class="rotation-list-item${className}" data-rotation="${i}">R${i}</button>`;
            }
            
            listEl.innerHTML = html;
            
            // Show/hide clear filters button - only show if at least one filter is active
            const clearBtn = this.elements.clearRotationFiltersBtn;
            if (clearBtn) {
                clearBtn.style.display = (filteredRotations && filteredRotations.size > 0) ? 'flex' : 'none';
            }
        }
        
        /**
         * Update button states
         * @param {boolean} canUndo
         * @param {boolean} canRedo
         * @param {boolean} isViewOnly
         */
        updateButtons(canUndo, canRedo, isViewOnly) {
            const undoBtn = this.elements.undoBtn;
            const redoBtn = this.elements.redoBtn;
            const clearBtn = this.elements.clearBtn;
            const saveBtn = this.elements.saveBtn;
            
            if (undoBtn) undoBtn.disabled = !canUndo || isViewOnly;
            if (redoBtn) redoBtn.disabled = !canRedo || isViewOnly;
            if (clearBtn) clearBtn.disabled = isViewOnly;
            if (saveBtn) saveBtn.disabled = isViewOnly;

            // Update Track Rotation button state (toggle class instead of disabled)
            const trackRotationBtn = this.elements.trackRotationBtn;
            if (trackRotationBtn && this.app) {
                trackRotationBtn.classList.toggle('toggled-off', !this.app.trackRotation);
            }
            
            // Update Track Team button state
            const trackTeamBtn = this.elements.trackTeamBtn;
            if (trackTeamBtn && this.app) {
                trackTeamBtn.classList.toggle('toggled-off', !this.app.trackTeam);
            }
            
            // Show/hide team buttons based on trackTeam state and mode
            const teamButtons = this.elements.teamButtons;
            if (teamButtons && this.app) {
                const shouldShowTeamButtons = this.app.state.mode === 'heatmapCharting' && this.app.trackTeam;
                teamButtons.style.display = shouldShowTeamButtons ? 'flex' : 'none';
            }
        }
        
        /**
         * Update session title
         * @param {string} title
         */
        updateSessionTitle(title) {
            const titleEl = this.elements.sessionTitle;
            if (titleEl) titleEl.textContent = title;
        }
        
        /**
         * Show/hide view-only banner
         * @param {boolean} show
         */
        showViewOnlyBanner(show) {
            const banner = this.elements.viewOnlyBanner;
            if (banner) banner.style.display = show ? 'block' : 'none';
        }
        
        /**
         * Update mode banner
         * @param {string} mode
         */
        updateModeBanner(mode) {
            const banner = this.elements.modeBanner;
            if (banner) {
                const modeText = mode === 'heatmapCharting' ? 'HEATMAP AND CHARTING MODE' : 'SIMPLE HEATMAP MODE';
                banner.textContent = modeText;
                banner.style.display = 'block';
            }
        }
        
        /**
         * Show main application
         */
        showApp() {
            this.showModal(null, ['sessionModal', 'loadModal', 'mainContainer']);
        }
        
        /**
         * Show session modal
         */
        showSessionModal() {
            this.showModal('sessionModal', ['sessionModal', 'loadModal', 'mainContainer', 
                'combineModeModal', 'combineFilesModal', 'saveCombinedModal']);
            const sessionNameInput = this.elements.sessionNameInput;
            if (sessionNameInput) {
                sessionNameInput.value = '';
                sessionNameInput.focus();
            }
        }
        
        /**
         * Show load modal
         */
        showLoadModal() {
            this.showModal('loadModal', ['sessionModal', 'loadModal']);
            const fileInput = this.elements.fileInput;
            const fileNameDisplay = this.elements.fileNameDisplay;
            
            // Clear previous file selection
            if (fileInput) fileInput.value = '';
            if (fileNameDisplay) fileNameDisplay.textContent = 'No file chosen';
        }
        
        /**
         * Centralized modal display manager
         * @param {string|null} showModalId - ID of modal to show, or null to show mainContainer
         * @param {Array<string>} modalIds - Array of modal/container IDs to manage
         */
        showModal(showModalId, modalIds) {
            modalIds.forEach(id => {
                const element = this.elements[id];
                if (!element) return;
                
                if (id === 'mainContainer') {
                    element.style.display = (showModalId === null) ? 'block' : 'none';
                } else {
                    element.style.display = (id === showModalId) ? 'flex' : 'none';
                }
            });
        }
        
        /**
         * Cleanup all event listeners
         */
        cleanup() {
            this.eventListeners.forEach(({ element, event, handler }) => {
                element.removeEventListener(event, handler);
            });
            this.eventListeners = [];
        }
    }

    // =====================================================
    // FILE MANAGER CLASS
    // =====================================================
    
    /**
     * Handles file save/load operations
     */
    class FileManager {
        /**
         * Save session to JSON file
         * @param {Object} sessionData
         */
        static saveToFile(sessionData) {
            try {
                const blob = new Blob([JSON.stringify(sessionData, null, 2)], { 
                    type: 'application/json' 
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                
                // Use mode-specific file suffix
                const suffix = sessionData.mode === 'heatmapCharting' ? '_hmc' : '_shm';
                a.download = `${sessionData.name.replace(/[^a-z0-9]/gi, '_')}${suffix}.json`;
                
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (error) {
                console.error('Error saving file:', error);
                alert('Error saving session file. Please try again. If the problem persists, check your browser\'s download settings and available disk space.');
            }
        }
        
        /**
         * Load session from file
         * @param {File} file
         * @returns {Promise<Object>}
         */
        static loadFromFile(file) {
            return new Promise((resolve, reject) => {
                if (!file) {
                    reject(new Error('No file provided'));
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        
                        // Validate session data structure
                        FileManager.validateSessionData(data);
                        
                        resolve(data);
                    } catch (error) {
                        if (error.message.startsWith('Invalid session file:')) {
                            reject(error);
                        } else {
                            reject(new Error('Invalid JSON format: file is not valid JSON'));
                        }
                    }
                };
                reader.onerror = () => reject(new Error('Error reading file'));
                reader.readAsText(file);
            });
        }
        
        /**
         * Validate session data structure
         * @param {Object} data
         * @throws {Error} If validation fails
         */
        static validateSessionData(data) {
            if (!data || typeof data !== 'object') {
                throw new Error('Invalid session file: not a valid object');
            }
            
            // Check version compatibility
            if (data.version) {
                Logger.info('Loading session with version:', data.version);
                
                // Placeholder for future version compatibility checks
                // Example: if version is older than minimum supported version, throw error
                // For now, we accept all versions with a version field
                const isCompatible = FileManager.checkVersionCompatibility(data.version);
                if (!isCompatible) {
                    Logger.warn('Session version may not be fully compatible:', data.version);
                    // Could throw error here in the future:
                    // throw new Error(`Incompatible session version: ${data.version}. Current version: ${CONFIG.version}`);
                }
            } else {
                // File has no version info (created before versioning)
                Logger.warn('Session file has no version information. Assuming legacy format.');
            }
            
            if (!data.name || typeof data.name !== 'string') {
                throw new Error('Invalid session file: missing or invalid session name');
            }
            
            // Validate mode using CONFIG
            if (!data.mode || !CONFIG.validation.validModes.includes(data.mode)) {
                throw new Error(`Invalid session file: mode must be one of ${CONFIG.validation.validModes.join(', ')}`);
            }
            
            if (!Array.isArray(data.points)) {
                throw new Error('Invalid session file: points must be an array');
            }
            
            // Validate each point
            data.points.forEach((point, i) => {
                FileManager.validatePoint(point, i);
            });
            
            // Validate undo/redo stacks if present
            if (data.undoStack && !Array.isArray(data.undoStack)) {
                throw new Error('Invalid session file: undoStack must be an array');
            }
            
            if (data.redoStack && !Array.isArray(data.redoStack)) {
                throw new Error('Invalid session file: redoStack must be an array');
            }
        }
        
        /**
         * Validate a single point
         * @param {Object} point
         * @param {number} index
         * @throws {Error} If validation fails
         */
        static validatePoint(point, index) {
            if (!point || typeof point !== 'object') {
                throw new Error(`Invalid session file: point ${index} is not an object`);
            }
            
            if (typeof point.x !== 'number' || typeof point.y !== 'number') {
                throw new Error(`Invalid session file: point ${index} missing valid x/y coordinates`);
            }
            
            // Check if coordinates are within reasonable bounds (canvas size)
            const maxCanvasSize = CONFIG.grid.canvasSize * 2; // Allow some margin
            if (point.x < 0 || point.x > maxCanvasSize || point.y < 0 || point.y > maxCanvasSize) {
                console.warn(`Point ${index} has coordinates outside expected bounds: (${point.x}, ${point.y}). This may cause display issues.`);
            }
            
            const { minRotation, maxRotation } = CONFIG.validation;
            // Allow rotation to be null/undefined when not tracked
            if (point.rotation !== null && point.rotation !== undefined) {
                if (typeof point.rotation !== 'number' || point.rotation < minRotation || point.rotation > maxRotation) {
                    throw new Error(`Invalid session file: point ${index} missing valid rotation (must be ${minRotation}-${maxRotation})`);
                }
            }
        }
        
        /**
         * Check if a file version is compatible with current app version
         * Placeholder for future version compatibility logic
         * @param {string} fileVersion - Version string from the file
         * @returns {boolean} True if compatible, false otherwise
         */
        static checkVersionCompatibility(fileVersion) {
            // Placeholder implementation - currently accepts all versions
            // Future implementation could include:
            // - Parse version strings (e.g., '1.0', '1.2', '2.0')
            // - Compare against minimum supported version
            // - Check for breaking changes between versions
            // - Handle migration logic for older formats
            
            const currentVersion = CONFIG.version;
            Logger.debug('Version compatibility check:', { fileVersion, currentVersion });
            
            // For now, log and return true for all versions
            // In the future, this could return false for incompatible versions
            return true;
        }
    }

    // =====================================================
    // MAIN APPLICATION CLASS
    // =====================================================
    
    /**
     * Main application controller
     */
    class HeatmapApp {
        constructor(config) {
            this.config = config;
            this.geometry = new GridGeometry(config, 'simpleHeatmap');
            this.state = new SessionState();
            this.ui = new UIManager();
            this.ui.app = this;
            
            // Canvas managers
            this.gridCanvas = null;
            this.heatmapCanvas = null;
            this.overlayCanvas = null;
            
            // Renderers
            this.gridRenderer = null;
            this.heatmapRenderer = null;
            
            // Drawing state for charting mode
            this.isDrawing = false;
            this.lineStart = null;
            this.tempCanvas = null; // For temporary line preview
            this.tempCtx = null;
            this.currentJerseyNumber = ''; // Current jersey number being typed
            /**
             * Active jersey number filters for display.
             * 
             * User Interaction Model:
             * - Users can select multiple jersey numbers to filter by using the UI (e.g., checkboxes or multi-select dropdown).
             * - When multiple filters are active, the heatmap displays points that match ANY of the selected jersey numbers.
             * - If no filters are selected, all points are shown.
             * - The UI should clearly indicate which filters are active and allow toggling them on/off.
             */
            this.activeJerseyNumberFilters = new Set();
            this.linesVisible = true; // Toggle for line visibility
            this.trackRotation = true; // Toggle for rotation tracking
            this.trackTeam = true; // Toggle for team tracking
            
            // Rotation state
            this.currentRotation = 1; // Current rotation selected for assignment (1-6)
            this.activeRotationFilters = new Set(); // Active rotation filters for display (supports multiple)
            
            // Team state
            this.currentTeam = 'us'; // Current team selected for assignment ('us' or 'opp')
            
            // Session state tracking
            this.hasUnsavedChanges = false; // Track if current session has unsaved changes
            
            // Combine state
            this.combineMode = null; // Selected mode for combining
            this.combinedData = null; // Temporary storage for combined data
            this.combineFileList = []; // List of files to combine
        }
        
        /**
         * Update geometry based on mode
         * @param {string} mode
         */
        updateGeometry(mode) {
            this.geometry = new GridGeometry(this.config, mode);
            
            // Update canvas dimensions
            const canvasHeight = this.geometry.canvasHeight;
            [this.gridCanvas, this.heatmapCanvas, this.overlayCanvas].forEach(canvasManager => {
                if (canvasManager && canvasManager.canvas) {
                    canvasManager.canvas.height = canvasHeight;
                }
            });
            
            // Update temp canvas dimensions if it exists
            if (this.tempCanvas) {
                this.tempCanvas.height = canvasHeight;
            }
            
            // Update canvas container height
            const canvasContainer = document.querySelector('.canvas-container');
            if (canvasContainer) {
                canvasContainer.style.height = `${canvasHeight}px`;
            }
            
            // Update renderer references
            if (this.gridRenderer) {
                this.gridRenderer.geometry = this.geometry;
            }
            if (this.heatmapRenderer) {
                this.heatmapRenderer.geometry = this.geometry;
            }
        }
        
        /**
         * Initialize the application
         */
        init() {
            try {
                this.initCanvases();
                this.initUI();
                this.initEventListeners();
                this.gridRenderer.draw();
                this.updateUI();
            } catch (error) {
                console.error('Initialization error:', error);
                alert(`Application failed to initialize: ${error.message}`);
            }
        }
        
        /**
         * Initialize canvas managers
         */
        initCanvases() {
            this.gridCanvas = new CanvasManager('gridCanvas');
            this.heatmapCanvas = new CanvasManager('heatmapCanvas');
            this.overlayCanvas = new CanvasManager('overlayCanvas');
            
            this.gridRenderer = new GridRenderer(this.gridCanvas, this.geometry, this.config);
            this.heatmapRenderer = new HeatmapRenderer(this.heatmapCanvas, this.overlayCanvas, this.config);
            
            // Create temporary canvas for line preview
            this.tempCanvas = document.createElement('canvas');
            this.tempCanvas.width = this.overlayCanvas.canvas.width;
            this.tempCanvas.height = this.overlayCanvas.canvas.height;
            this.tempCanvas.style.position = 'absolute';
            this.tempCanvas.style.top = '0';
            this.tempCanvas.style.left = '0';
            this.tempCanvas.style.pointerEvents = 'none';
            this.tempCanvas.style.zIndex = '4'; // Above overlay canvas
            this.tempCtx = this.tempCanvas.getContext('2d');
            
            // Insert temp canvas after overlay canvas
            this.overlayCanvas.canvas.parentNode.appendChild(this.tempCanvas);
        }
        
        /**
         * Initialize UI elements
         */
        initUI() {
            // Main UI elements
            this.ui.initElement('clearBtn');
            this.ui.initElement('clickCount');
            this.ui.initElement('coordinates');
            this.ui.initElement('jerseyNumberInput');
            this.ui.initElement('undoBtn');
            this.ui.initElement('redoBtn');
            this.ui.initElement('toggleLinesBtn');
            this.ui.initElement('saveBtn');
            this.ui.initElement('newSessionBtn');
            this.ui.initElement('rotationList');
            this.ui.initElement('clearRotationFiltersBtn');
            this.ui.initElement('clearJerseyFiltersBtn');
            this.ui.initElement('trackRotationBtn');
            this.ui.initElement('trackTeamBtn');
            this.ui.initElement('teamButtons');
            this.ui.initElement('teamUsBtn');
            this.ui.initElement('teamOppBtn');
            
            // Modal elements
            this.ui.initElement('sessionModal');
            this.ui.initElement('loadModal');
            this.ui.initElement('saveConfirmModal');
            this.ui.initElement('sessionNameInput');
            this.ui.initElement('sessionModeTitle');
            this.ui.initElement('startSessionBtn');
            this.ui.initElement('loadSessionBtn');
            this.ui.initElement('fileInput');
            this.ui.initElement('fileNameDisplay');
            this.ui.initElement('confirmLoadBtn');
            this.ui.initElement('cancelLoadBtn');
            this.ui.initElement('confirmSaveYesBtn');
            this.ui.initElement('confirmSaveNoBtn');
            this.ui.initElement('mainContainer');
            this.ui.initElement('sessionTitle');
            this.ui.initElement('viewOnlyBanner');
            this.ui.initElement('modeBanner');
            this.ui.initElement('jerseyNumberList');
            
            // Combine modal elements
            this.ui.initElement('combineSessionBtn');
            this.ui.initElement('combineModeModal');
            this.ui.initElement('confirmCombineModeBtn');
            this.ui.initElement('cancelCombineModeBtn');
            this.ui.initElement('combineFilesModal');
            this.ui.initElement('combineModeDisplay');
            this.ui.initElement('combineFilesInput');
            this.ui.initElement('combineFilesDisplay');
            this.ui.initElement('addFilesBtn');
            this.ui.initElement('removeSelectedBtn');
            this.ui.initElement('confirmCombineBtn');
            this.ui.initElement('cancelCombineFilesBtn');
            this.ui.initElement('saveCombinedModal');
            this.ui.initElement('combinedSessionNameInput');
            this.ui.initElement('saveCombinedBtn');
            this.ui.initElement('cancelSaveCombinedBtn');
        }
        
        /**
         * Initialize event listeners
         */
        initEventListeners() {
            // Canvas events
            this.ui.addEventListener(
                this.overlayCanvas.canvas, 
                'click', 
                this.handleCanvasClick.bind(this)
            );
            this.ui.addEventListener(
                this.overlayCanvas.canvas, 
                'mousedown', 
                this.handleCanvasMouseDown.bind(this)
            );
            this.ui.addEventListener(
                this.overlayCanvas.canvas, 
                'mouseup', 
                this.handleCanvasMouseUp.bind(this)
            );
            this.ui.addEventListener(
                this.overlayCanvas.canvas, 
                'mousemove', 
                this.handleCanvasMouseMove.bind(this)
            );
            
            // Button events
            this.ui.addEventListener(
                this.ui.getElement('clearBtn'), 
                'click', 
                this.clearHeatmap.bind(this)
            );
            this.ui.addEventListener(
                this.ui.getElement('undoBtn'), 
                'click', 
                this.undo.bind(this)
            );
            this.ui.addEventListener(
                this.ui.getElement('redoBtn'), 
                'click', 
                this.redo.bind(this)
            );
            this.ui.addEventListener(
                this.ui.getElement('toggleLinesBtn'), 
                'click', 
                this.toggleLines.bind(this)
            );
            this.ui.addEventListener(
                this.ui.getElement('trackRotationBtn'),
                'click',
                this.toggleTrackRotation.bind(this)
            );
            this.ui.addEventListener(
                this.ui.getElement('trackTeamBtn'),
                'click',
                this.toggleTrackTeam.bind(this)
            );
            this.ui.addEventListener(
                this.ui.getElement('teamButtons'),
                'click',
                this.handleTeamClick.bind(this)
            );
            this.ui.addEventListener(
                this.ui.getElement('saveBtn'), 
                'click', 
                this.saveSession.bind(this)
            );
            this.ui.addEventListener(
                this.ui.getElement('newSessionBtn'), 
                'click', 
                () => {
                    // In view-only mode, skip save confirmation and go directly to session modal
                    if (this.state.isViewOnly) {
                        this.ui.showSessionModal();
                    } else if (this.hasUnsavedChanges) {
                        // Check if there are unsaved changes
                        this.showSaveConfirmModal();
                    } else {
                        this.ui.showSessionModal();
                    }
                }
            );
            
            // Session modal events (defensive wiring)
            const startBtn = this.ui.getElement('startSessionBtn');
            if (startBtn) {
                this.ui.addEventListener(startBtn, 'click', this.startNewSession.bind(this));
            } else {
                Logger.warn('Start Session button not found');
            }
            this.ui.addEventListener(
                this.ui.getElement('sessionNameInput'), 
                'keypress', 
                (e) => {
                    if (e.key === 'Enter') this.startNewSession();
                }
            );
            const loadBtn = this.ui.getElement('loadSessionBtn');
            if (loadBtn) {
                this.ui.addEventListener(loadBtn, 'click', () => this.ui.showLoadModal());
            } else {
                Logger.warn('Load Session button not found');
            }
            const combineBtn = this.ui.getElement('combineSessionBtn');
            if (combineBtn) {
                this.ui.addEventListener(combineBtn, 'click', () => this.showCombineModeModal());
            } else {
                Logger.warn('Combine Heatmaps button not found');
            }
            
            // Combine mode modal events
            this.ui.addEventListener(
                this.ui.getElement('confirmCombineModeBtn'),
                'click',
                this.handleCombineModeConfirm.bind(this)
            );
            this.ui.addEventListener(
                this.ui.getElement('cancelCombineModeBtn'),
                'click',
                () => this.ui.showSessionModal()
            );
            
            // Combine files modal events
            this.ui.addEventListener(
                this.ui.getElement('addFilesBtn'),
                'click',
                () => this.ui.getElement('combineFilesInput').click()
            );
            this.ui.addEventListener(
                this.ui.getElement('combineFilesInput'),
                'change',
                this.handleCombineFilesSelect.bind(this)
            );
            this.ui.addEventListener(
                this.ui.getElement('removeSelectedBtn'),
                'click',
                this.handleRemoveSelected.bind(this)
            );
            this.ui.addEventListener(
                this.ui.getElement('combineFilesDisplay'),
                'click',
                this.handleFileListClick.bind(this)
            );
            this.ui.addEventListener(
                this.ui.getElement('confirmCombineBtn'),
                'click',
                this.handleCombineFiles.bind(this)
            );
            this.ui.addEventListener(
                this.ui.getElement('cancelCombineFilesBtn'),
                'click',
                this.cancelCombineFiles.bind(this)
            );
            
            // Save combined modal events
            this.ui.addEventListener(
                this.ui.getElement('saveCombinedBtn'),
                'click',
                this.handleSaveCombined.bind(this)
            );
            this.ui.addEventListener(
                this.ui.getElement('cancelSaveCombinedBtn'),
                'click',
                () => this.ui.showSessionModal()
            );
            this.ui.addEventListener(
                this.ui.getElement('combinedSessionNameInput'),
                'keypress',
                (e) => {
                    if (e.key === 'Enter') this.handleSaveCombined();
                }
            );
            
            // Mode selection change event
            const modeRadios = document.querySelectorAll('input[name="sessionMode"]');
            modeRadios.forEach(radio => {
                this.ui.addEventListener(
                    radio,
                    'change',
                    this.handleModeChange.bind(this)
                );
            });
            
            // Load modal events
            this.ui.addEventListener(
                this.ui.getElement('confirmLoadBtn'), 
                'click', 
                this.loadSession.bind(this)
            );
            this.ui.addEventListener(
                this.ui.getElement('cancelLoadBtn'), 
                'click', 
                this.cancelLoad.bind(this)
            );
            
            // File input change event
            this.ui.addEventListener(
                this.ui.getElement('fileInput'),
                'change',
                this.handleFileSelect.bind(this)
            );
            
            // Keyboard shortcuts
            this.ui.addEventListener(
                document, 
                'keydown', 
                this.handleKeyboard.bind(this)
            );
            
            // Jersey number list button clicks (using event delegation)
            this.ui.addEventListener(
                this.ui.getElement('jerseyNumberList'),
                'click',
                this.handleJerseyNumberFilterClick.bind(this)
            );
            
            // Rotation list button clicks (using event delegation)
            this.ui.addEventListener(
                this.ui.getElement('rotationList'),
                'click',
                this.handleRotationClick.bind(this)
            );
            
            // Rotation list right-click (for filtering)
            this.ui.addEventListener(
                this.ui.getElement('rotationList'),
                'contextmenu',
                this.handleRotationRightClick.bind(this)
            );
            
            // Clear rotation filters button
            this.ui.addEventListener(
                this.ui.getElement('clearRotationFiltersBtn'),
                'click',
                () => this.handleClearFilters('rotation')
            );
            
            // Clear jersey number filters button
            this.ui.addEventListener(
                this.ui.getElement('clearJerseyFiltersBtn'),
                'click',
                () => this.handleClearFilters('jersey')
            );
            
            // Save confirmation modal events
            this.ui.addEventListener(
                this.ui.getElement('confirmSaveYesBtn'),
                'click',
                () => {
                    this.saveSession();
                    this.hideSaveConfirmModal();
                    this.ui.showSessionModal();
                }
            );
            this.ui.addEventListener(
                this.ui.getElement('confirmSaveNoBtn'),
                'click',
                () => {
                    this.hideSaveConfirmModal();
                    this.ui.showSessionModal();
                }
            );
        }
        
        /**
         * Handle canvas click (only for simpleHeatmap mode)
         * @param {MouseEvent} event
         */
        handleCanvasClick(event) {
            // In charting mode, use mousedown/mouseup for line drawing
            if (this.state.mode === 'heatmapCharting') return;
            if (this.state.isViewOnly) return;
            
            const rect = this.overlayCanvas.getBoundingRect();
            let x = event.clientX - rect.left;
            let y = event.clientY - rect.top;
            
            // Sanitize coordinates
            x = sanitizeCoordinate(x, this.geometry.canvasWidth);
            y = sanitizeCoordinate(y, this.geometry.canvasHeight);
            
            assert(this.geometry.isWithinBounds(x, y), 'Coordinates should be within bounds after sanitization');
            
            if (this.geometry.isWithinBounds(x, y)) {
                // If filters are active, automatically add current rotation to filter
                if (this.activeRotationFilters.size > 0) {
                    this.activeRotationFilters.add(this.currentRotation);
                }
                
                const rotationValue = this.trackRotation ? this.currentRotation : null;
                Logger.debug('Adding point at', x, y, 'rotation', rotationValue);
                this.state.addPoint({ x, y, rotation: rotationValue });
                this.hasUnsavedChanges = true;
                
                // Redraw all to respect filters
                this.refreshDisplay();
                
                const meters = this.geometry.pixelsToMeters(x, y);
                this.ui.updateCoordinates(`Position: (${meters.x}m, ${meters.y}m)`);
            }
        }
        
        /**
         * Handle canvas mouse down (for charting mode line drawing)
         * @param {MouseEvent} event
         */
        handleCanvasMouseDown(event) {
            if (this.state.mode !== 'heatmapCharting') return;
            if (this.state.isViewOnly) return;
            
            const rect = this.overlayCanvas.getBoundingRect();
            let x = event.clientX - rect.left;
            let y = event.clientY - rect.top;
            
            // Sanitize coordinates
            x = sanitizeCoordinate(x, this.geometry.canvasWidth);
            y = sanitizeCoordinate(y, this.geometry.canvasHeight);
            
            if (this.geometry.isWithinBounds(x, y)) {
                // If filters are active, automatically add current rotation to filter
                if (this.activeRotationFilters.size > 0) {
                    this.activeRotationFilters.add(this.currentRotation);
                }
                
                Logger.debug('Starting line at', x, y);
                this.isDrawing = true;
                this.lineStart = { x, y };
            }
        }
        
        /**
         * Handle canvas mouse up (for charting mode line drawing)
         * @param {MouseEvent} event
         */
        handleCanvasMouseUp(event) {
            if (this.state.mode !== 'heatmapCharting') return;
            if (this.state.isViewOnly) return;
            if (!this.isDrawing) return;
            
            const rect = this.overlayCanvas.getBoundingRect();
            let x = event.clientX - rect.left;
            let y = event.clientY - rect.top;
            
            // Sanitize coordinates
            x = sanitizeCoordinate(x, this.geometry.canvasWidth);
            y = sanitizeCoordinate(y, this.geometry.canvasHeight);
            
            // Clear temporary canvas
            this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
            
            if (this.geometry.isWithinBounds(x, y)) {
                // Create point with line data
                const point = {
                    x,
                    y,
                    rotation: this.trackRotation ? this.currentRotation : null,
                    line: {
                        startX: this.lineStart.x,
                        startY: this.lineStart.y,
                        endX: x,
                        endY: y
                    },
                    team: this.trackTeam ? this.currentTeam : null
                };
                
                // Always set jersey number (null if not entered)
                if (this.currentJerseyNumber) {
                    const sanitized = sanitizeJerseyNumber(this.currentJerseyNumber);
                    point.jerseyNumber = sanitized || null;
                } else {
                    point.jerseyNumber = null;
                }
                
                Logger.debug('Adding line point', point);
                
                this.state.addPoint(point);
                this.hasUnsavedChanges = true;
                
                // Redraw all to respect filters
                this.refreshDisplay();
                
                // Clear the current jersey number after use
                this.currentJerseyNumber = '';
                this.ui.updateJerseyNumberInput(this.currentJerseyNumber);
                
                const meters = this.geometry.pixelsToMeters(x, y);
                this.ui.updateCoordinates(`Position: (${meters.x}m, ${meters.y}m)`);
            }
            
            this.isDrawing = false;
            this.lineStart = null;
        }
        
        /**
         * Handle canvas mouse move
         * @param {MouseEvent} event
         */
        handleCanvasMouseMove(event) {
            const rect = this.overlayCanvas.getBoundingRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            
            if (this.geometry.isWithinBounds(x, y)) {
                const meters = this.geometry.pixelsToMeters(x, y);
                this.ui.updateCoordinates(`Position: (${meters.x}m, ${meters.y}m)`);
                
                // Draw temporary line preview in charting mode
                if (this.isDrawing && this.lineStart && this.state.mode === 'heatmapCharting') {
                    this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
                    
                    // Use team color for preview line
                    let previewColor;
                    if (this.trackTeam && this.currentTeam === 'us') {
                        previewColor = this.config.teamColors.us;
                    } else if (this.trackTeam && this.currentTeam === 'opp') {
                        previewColor = this.config.teamColors.opp;
                    } else {
                        previewColor = this.config.teamColors.noTeam;
                    }
                    
                    this.tempCtx.strokeStyle = previewColor;
                    this.tempCtx.lineWidth = this.config.drawing.chartingLineWidth;
                    this.tempCtx.beginPath();
                    this.tempCtx.moveTo(this.lineStart.x, this.lineStart.y);
                    this.tempCtx.lineTo(x, y);
                    this.tempCtx.stroke();
                }
            }
        }
        
        /**
         * Toggle line visibility
         */
        toggleLines() {
            this.linesVisible = !this.linesVisible;
            
            // Update button text
            const btn = this.ui.getElement('toggleLinesBtn');
            if (btn) {
                btn.textContent = this.linesVisible ? 'Hide Lines' : 'Show Lines';
            }
            
            // Redraw with current filter and visibility setting
            this.heatmapRenderer.redrawAll(this.state.getPoints(), this.activeJerseyNumberFilters, this.activeRotationFilters, this.linesVisible);
        }
        
        /**
         * Toggle rotation tracking on/off
         */
        toggleTrackRotation() {
            if (this.state.isViewOnly) return;
            
            this.trackRotation = !this.trackRotation;
            
            // Clear rotation filters when toggling off
            if (!this.trackRotation) {
                this.activeRotationFilters.clear();
            }
            
            // Update UI
            this.updateUI();
            this.refreshDisplay();
            
            Logger.info('Track rotation toggled:', this.trackRotation ? 'ON' : 'OFF');
        }
        
        /**
         * Toggle team tracking on/off
         */
        toggleTrackTeam() {
            if (this.state.isViewOnly) return;
            
            this.trackTeam = !this.trackTeam;
            
            // Update UI
            this.updateLineUIVisibility();
            this.updateUI();
            this.refreshDisplay();
            
            Logger.info('Track team toggled:', this.trackTeam ? 'ON' : 'OFF');
        }
        
        /**
         * Clear all heatmap points
         */
        clearHeatmap() {
            if (this.state.isViewOnly) return;
            
            this.state.clearAllPoints();
            this.hasUnsavedChanges = true;
            this.heatmapRenderer.clear();
            this.ui.updateCoordinates('Position: -');
            this.updateUI();
        }
        
        /**
         * Undo last action
         */
        undo() {
            if (this.state.undo()) {
                this.hasUnsavedChanges = true;
                this.refreshDisplay();
            }
        }
        
        /**
         * Redo last undone action
         */
        redo() {
            if (this.state.redo()) {
                this.hasUnsavedChanges = true;
                this.refreshDisplay();
            }
        }
        
        /**
         * Save current session
         */
        saveSession() {
            FileManager.saveToFile(this.state.export());
            this.hasUnsavedChanges = false; // Mark as saved
            Logger.info('Session saved, cleared unsaved changes flag');
        }
        
        /**
         * Load session from file
         */
        async loadSession() {
            const fileInput = this.ui.getElement('fileInput');
            const file = fileInput.files[0];
            
            if (!file) {
                alert('Please select a file to load.');
                return;
            }
            
            // Check file size
            if (file.size > CONFIG.validation.maxFileSize) {
                const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
                const maxMB = (CONFIG.validation.maxFileSize / (1024 * 1024)).toFixed(0);
                alert(`File is too large (${sizeMB}MB). Maximum file size is ${maxMB}MB.`);
                return;
            }
            
            const viewOnlyRadio = document.querySelector('input[name="loadMode"]:checked');
            const viewOnly = viewOnlyRadio && viewOnlyRadio.value === 'viewOnly';
            
            try {
                const data = await FileManager.loadFromFile(file);
                
                // Check point count for performance warning
                if (data.points && data.points.length > CONFIG.validation.maxPointCount) {
                    const proceed = confirm(
                        `This file contains ${data.points.length} points, which may affect performance. ` +
                        `Continue loading?`
                    );
                    if (!proceed) return;
                }
                
                this.state.load(data, viewOnly);
                
                // Show migration message if data was updated
                if (this.state.migrationInfo) {
                    alert(this.state.migrationInfo);
                    this.state.migrationInfo = null; // Clear after showing
                }
                
                this.updateGeometry(this.state.mode);
                this.gridRenderer.draw();
                this.updateSessionTitleWithMode();
                this.ui.showViewOnlyBanner(this.state.isViewOnly);
                this.overlayCanvas.setCursor(viewOnly ? 'default' : 'crosshair');
                
                this.currentJerseyNumber = '';
                this.activeJerseyNumberFilters.clear(); // Clear any active filters
                this.activeRotationFilters.clear(); // Clear rotation filters
                this.hasUnsavedChanges = false; // Reset when loading session
                this.ui.updateJerseyNumberInput(this.currentJerseyNumber);
                this.heatmapRenderer.redrawAll(this.state.getPoints());
                this.updateLineUIVisibility();
                this.updateUI();
                this.ui.showApp();
            } catch (error) {
                console.error('Error loading session:', error);
                const suggestion = error.message.includes('JSON') 
                    ? ' The file may be corrupted or not a valid JSON file.'
                    : error.message.includes('rotation')
                    ? ' The file may be from an older version or incompatible format.'
                    : ' Please ensure the file is a valid heatmap session file.';
                alert(`Error loading file: ${error.message}${suggestion}`);
            }
        }
        
        /**
         * Handle file select
         * @param {Event} event
         */
        handleFileSelect(event) {
            const fileInput = event.target;
            const fileNameDisplay = this.ui.getElement('fileNameDisplay');
            
            if (fileInput && fileInput.files && fileInput.files.length > 0) {
                if (fileNameDisplay) {
                    fileNameDisplay.textContent = fileInput.files[0].name;
                }
            } else {
                if (fileNameDisplay) {
                    fileNameDisplay.textContent = 'No file chosen';
                }
            }
        }
        
        /**
         * Handle mode change
         * @param {Event} event
         */
        handleModeChange(event) {
            const modeTitleEl = this.ui.getElement('sessionModeTitle');
            if (modeTitleEl && event.target.value) {
                const modeText = event.target.value === 'heatmapCharting' ? 'Heatmap and Charting' : 'Simple Heatmap';
                modeTitleEl.textContent = modeText;
            }
        }
        
        /**
         * Cancel load operation
         */
        cancelLoad() {
            const fileInput = this.ui.getElement('fileInput');
            const fileNameDisplay = this.ui.getElement('fileNameDisplay');
            if (fileInput) fileInput.value = '';
            if (fileNameDisplay) fileNameDisplay.textContent = 'No file chosen';
            this.ui.showSessionModal();
        }
        
        /**
         * Start a new session
         */
        startNewSession() {
            const input = this.ui.getElement('sessionNameInput');
            const rawName = input ? input.value : '';
            
            // Sanitize session name
            const name = sanitizeSessionName(rawName);
            
            // Validate session name
            if (!name) {
                alert('Please enter a valid session name.');
                if (input) input.focus();
                return;
            }
            
            Logger.info('Starting new session:', name);
            
            // Get selected mode
            const modeRadio = document.querySelector('input[name="sessionMode"]:checked');
            const mode = modeRadio ? modeRadio.value : 'simpleHeatmap';
            
            this.state.reset(name, mode);
            this.updateGeometry(mode);
            this.gridRenderer.draw();
            this.updateSessionTitleWithMode();
            this.ui.showViewOnlyBanner(false);
            this.overlayCanvas.setCursor('crosshair');
            
            this.heatmapRenderer.clear();
            this.currentJerseyNumber = '';
            this.currentRotation = 1; // Reset to rotation 1
            this.activeJerseyNumberFilters.clear(); // Clear any active filters
            this.activeRotationFilters.clear(); // Clear rotation filters
            this.hasUnsavedChanges = false; // Reset unsaved changes flag
            this.ui.updateCoordinates('Position: -');
            this.ui.updateJerseyNumberInput(this.currentJerseyNumber);
            this.updateLineUIVisibility();
            this.updateUI();
            this.ui.showApp();
        }
        
        /**
         * Show save confirmation modal
         */
        showSaveConfirmModal() {
            const saveConfirmModal = this.ui.getElement('saveConfirmModal');
            if (saveConfirmModal) saveConfirmModal.style.display = 'flex';
        }
        
        /**
         * Hide save confirmation modal
         */
        hideSaveConfirmModal() {
            const saveConfirmModal = this.ui.getElement('saveConfirmModal');
            if (saveConfirmModal) saveConfirmModal.style.display = 'none';
        }
        
        /**
         * Show combine mode selection modal
         */
        showCombineModeModal() {
            this.ui.showModal('combineModeModal', ['sessionModal', 'combineModeModal']);
        }
        
        /**
         * Handle combine mode confirmation
         */
        handleCombineModeConfirm() {
            const modeRadio = document.querySelector('input[name="combineMode"]:checked');
            const mode = modeRadio ? modeRadio.value : 'simpleHeatmap';
            
            // Store selected mode for validation
            this.combineMode = mode;
            
            // Update display
            const modeDisplay = this.ui.getElement('combineModeDisplay');
            if (modeDisplay) {
                const modeText = mode === 'heatmapCharting' ? 'Heatmap and Charting' : 'Simple Heatmap';
                modeDisplay.textContent = modeText;
            }
            
            // Show files selection modal
            this.ui.showModal('combineFilesModal', ['combineModeModal', 'combineFilesModal']);
            
            // Initialize empty file list
            this.combineFileList = [];
            this.updateFileListDisplay();
        }
        
        /**
         * Handle file selection for combine
         */
        handleCombineFilesSelect(event) {
            const fileInput = event.target;
            
            if (fileInput && fileInput.files && fileInput.files.length > 0) {
                // Add new files to the list
                Array.from(fileInput.files).forEach(file => {
                    // Check file size
                    if (file.size > CONFIG.validation.maxFileSize) {
                        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
                        const maxMB = (CONFIG.validation.maxFileSize / (1024 * 1024)).toFixed(0);
                        alert(`File "${file.name}" is too large (${sizeMB}MB). Maximum file size is ${maxMB}MB. Skipping.`);
                        return;
                    }
                    
                    // Check if file already exists in list
                    const exists = this.combineFileList.some(f => f.name === file.name && f.size === file.size);
                    if (!exists) {
                        this.combineFileList.push(file);
                    }
                });
                
                // Update display
                this.updateFileListDisplay();
                
                // Reset file input so same files can be selected again if needed
                fileInput.value = '';
            }
        }
        
        /**
         * Update the file list display
         */
        updateFileListDisplay() {
            const fileDisplay = this.ui.getElement('combineFilesDisplay');
            const removeBtn = this.ui.getElement('removeSelectedBtn');
            
            if (!fileDisplay) return;
            
            if (this.combineFileList.length === 0) {
                fileDisplay.textContent = 'No files chosen';
                if (removeBtn) removeBtn.style.display = 'none';
            } else {
                fileDisplay.innerHTML = this.combineFileList
                    .map((file, index) => `<div class="file-list-item" data-index="${index}">${file.name}</div>`)
                    .join('');
                if (removeBtn) removeBtn.style.display = 'inline-block';
            }
        }
        
        /**
         * Handle clicks on file list items to toggle selection
         */
        handleFileListClick(event) {
            const item = event.target.closest('.file-list-item');
            if (!item) return;
            
            item.classList.toggle('selected');
        }
        
        /**
         * Handle removing selected files
         */
        handleRemoveSelected() {
            const fileDisplay = this.ui.getElement('combineFilesDisplay');
            if (!fileDisplay) return;
            
            const selectedItems = fileDisplay.querySelectorAll('.file-list-item.selected');
            const indicesToRemove = Array.from(selectedItems)
                .map(item => parseInt(item.getAttribute('data-index')))
                .sort((a, b) => b - a); // Sort descending to remove from end first
            
            // Remove files from list
            indicesToRemove.forEach(index => {
                this.combineFileList.splice(index, 1);
            });
            
            // Update display
            this.updateFileListDisplay();
        }
        
        /**
         * Handle combining files
         */
        async handleCombineFiles() {
            if (this.combineFileList.length < 2) {
                alert('Please select at least 2 files to combine.');
                return;
            }
            
            try {
                const loadedSessions = [];
                
                // Load all files
                for (let i = 0; i < this.combineFileList.length; i++) {
                    const data = await FileManager.loadFromFile(this.combineFileList[i]);
                    loadedSessions.push(data);
                }
                
                // Validate all files are the same mode
                const firstMode = loadedSessions[0].mode;
                for (let i = 0; i < loadedSessions.length; i++) {
                    if (loadedSessions[i].mode !== this.combineMode) {
                        alert(`Error: File "${this.combineFileList[i].name}" is ${loadedSessions[i].mode} mode but you selected ${this.combineMode} mode. All files must match the selected mode.`);
                        return;
                    }
                    if (loadedSessions[i].mode !== firstMode) {
                        alert(`Error: All files must be the same type. File "${this.combineFileList[i].name}" is ${loadedSessions[i].mode} but the first file is ${firstMode}.`);
                        return;
                    }
                }
                
                // Combine all points and check total count
                const combinedPoints = [];
                for (const session of loadedSessions) {
                    if (session.points && Array.isArray(session.points)) {
                        combinedPoints.push(...session.points);
                    }
                }
                
                // Warn if combined point count is very large
                if (combinedPoints.length > CONFIG.validation.maxPointCount) {
                    const proceed = confirm(
                        `The combined file will contain ${combinedPoints.length} points, which may affect performance. ` +
                        `Continue combining?`
                    );
                    if (!proceed) return;
                }
                
                // Store combined data
                this.combinedData = {
                    mode: firstMode,
                    points: combinedPoints,
                    undoStack: [],
                    redoStack: []
                };
                
                // Show save modal
                const combineFilesModal = this.ui.getElement('combineFilesModal');
                this.ui.showModal('saveCombinedModal', ['combineFilesModal', 'saveCombinedModal']);
                const combinedNameInput = this.ui.getElement('combinedSessionNameInput');
                if (combinedNameInput) {
                    combinedNameInput.value = '';
                    combinedNameInput.focus();
                }
                
            } catch (error) {
                console.error('Error combining files:', error);
                const suggestion = error.message.includes('JSON')
                    ? ' One or more files may be corrupted.'
                    : error.message.includes('mode')
                    ? ' Ensure all files are the same heatmap type.'
                    : ' Please check that all files are valid heatmap session files.';
                alert(`Error combining files: ${error.message}${suggestion}`);
            }
        }
        
        /**
         * Handle saving combined heatmap
         */
        handleSaveCombined() {
            const nameInput = this.ui.getElement('combinedSessionNameInput');
            const name = nameInput ? nameInput.value.trim() || 'Combined Session' : 'Combined Session';
            
            if (!this.combinedData) {
                alert('No combined data to save.');
                return;
            }
            
            // Create session data
            const sessionData = {
                name: name,
                mode: this.combinedData.mode,
                points: this.combinedData.points,
                undoStack: [],
                redoStack: [],
                savedAt: new Date().toISOString()
            };
            
            // Save file
            FileManager.saveToFile(sessionData);
            
            // Clean up
            this.combinedData = null;
            this.combineMode = null;
            const fileInput = this.ui.getElement('combineFilesInput');
            if (fileInput) fileInput.value = '';
            
            // Show success and return to start
            const saveCombinedModal = this.ui.getElement('saveCombinedModal');
            if (saveCombinedModal) saveCombinedModal.style.display = 'none';
            
            alert('Combined heatmap saved successfully!');
            this.ui.showSessionModal();
        }
        
        /**
         * Cancel combine files operation
         */
        cancelCombineFiles() {
            const fileInput = this.ui.getElement('combineFilesInput');
            
            if (fileInput) fileInput.value = '';
            this.combineFileList = [];
            this.updateFileListDisplay();
            
            this.ui.showModal('combineModeModal', ['combineFilesModal', 'combineModeModal']);
        }
        
        /**
         * Handle rotation button left-click (assignment)
         * @param {MouseEvent} event
         */
        handleRotationClick(event) {
            if (this.state.isViewOnly) return;
            if (!this.trackRotation) return; // ignore when rotation tracking is off
            const button = event.target.closest('.rotation-list-item');
            if (!button) return;
            
            const rotation = parseInt(button.getAttribute('data-rotation'), 10);
            this.currentRotation = rotation;
            
            // If any filters are active, automatically add this rotation to the filter
            if (this.activeRotationFilters.size > 0) {
                this.activeRotationFilters.add(rotation);
                this.heatmapRenderer.redrawAll(
                    this.state.getPoints(), 
                    this.activeJerseyNumberFilters, 
                    this.activeRotationFilters,
                    this.linesVisible
                );
            }
            
            this.updateUI();
        }
        
        /**
         * Refresh display with current state and filters
         */
        refreshDisplay() {
            this.heatmapRenderer.redrawAll(
                this.state.getPoints(), 
                this.activeJerseyNumberFilters,
                this.activeRotationFilters, 
                this.linesVisible
            );
            this.updateUI();
        }
        
        /**
         * Handle rotation button right-click (filtering)
         * @param {MouseEvent} event
         */
        handleRotationRightClick(event) {
            event.preventDefault(); // Prevent context menu
            if (!this.trackRotation) return; // ignore filtering when rotation tracking is off
            const button = event.target.closest('.rotation-list-item');
            if (!button) return;
            
            const rotation = parseInt(button.getAttribute('data-rotation'), 10);
            
            // Toggle filter - add or remove from Set
            if (this.activeRotationFilters.has(rotation)) {
                this.activeRotationFilters.delete(rotation);
            } else {
                this.activeRotationFilters.add(rotation);
            }
            
            // Redraw with filters
            this.heatmapRenderer.redrawAll(
                this.state.getPoints(), 
                this.activeJerseyNumberFilters,
                this.activeRotationFilters, 
                this.linesVisible
            );
            this.updateUI();
        }
        
        /**
         * Handle clear filters button click
         * @param {string} filterType - Either 'rotation' or 'jersey'
         */
        handleClearFilters(filterType) {
            if (filterType === 'rotation') {
                this.activeRotationFilters.clear();
            } else if (filterType === 'jersey') {
                this.activeJerseyNumberFilters.clear();
            }
            
            this.refreshDisplay();
        }
        
        /**
         * Handle jersey number filter button clicks
         * @param {MouseEvent} event
         */
        handleJerseyNumberFilterClick(event) {
            const button = event.target.closest('.jersey-number-list-item');
            if (!button) return;
            
            const jerseyNumber = button.getAttribute('data-jersey-number');
            
            // Toggle filter - add or remove from Set
            if (this.activeJerseyNumberFilters.has(jerseyNumber)) {
                // Clicking active filter - remove it
                this.activeJerseyNumberFilters.delete(jerseyNumber);
            } else {
                // Activate new filter - add it
                this.activeJerseyNumberFilters.add(jerseyNumber);
            }
            
            // Redraw with filters
            this.refreshDisplay();
        }
        
        /**
         * Handle team button clicks
         * @param {MouseEvent} event
         */
        handleTeamClick(event) {
            if (this.state.isViewOnly) return;
            const button = event.target.closest('.team-btn');
            if (!button) return;
            
            const team = button.getAttribute('data-team');
            this.currentTeam = team;
            
            // Update button states
            const teamButtons = this.ui.getElement('teamButtons');
            if (teamButtons) {
                teamButtons.querySelectorAll('.team-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.getAttribute('data-team') === team);
                });
            }
            
            Logger.info('Team selected:', team);
        }
        
        /**
         * Handle keyboard shortcuts
         * @param {KeyboardEvent} event
         */
        handleKeyboard(event) {
            if (this.state.isViewOnly) return;
            
            // Handle jersey number input for charting mode
            if (this.state.mode === 'heatmapCharting') {
                // Handle digit keys (0-9)
                if (event.key >= '0' && event.key <= '9') {
                    // Only allow up to 2 digits
                    if (this.currentJerseyNumber.length < 2) {
                        const newValue = this.currentJerseyNumber + event.key;
                        const sanitized = sanitizeJerseyNumber(newValue);
                        if (sanitized) {
                            this.currentJerseyNumber = sanitized;
                            this.ui.updateJerseyNumberInput(this.currentJerseyNumber);
                        }
                        event.preventDefault();
                    }
                    return;
                }
                
                // Handle backspace
                if (event.key === 'Backspace' && this.currentJerseyNumber.length > 0) {
                    this.currentJerseyNumber = this.currentJerseyNumber.slice(0, -1);
                    this.ui.updateJerseyNumberInput(this.currentJerseyNumber);
                    event.preventDefault();
                    return;
                }
            }
            
            // Handle undo/redo/save shortcuts
            if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
                if (event.shiftKey) {
                    this.redo();
                } else {
                    this.undo();
                }
                event.preventDefault();
            } else if ((event.ctrlKey || event.metaKey) && event.key === 'y') {
                this.redo();
                event.preventDefault();
            } else if ((event.ctrlKey || event.metaKey) && event.key === 's') {
                this.saveSession();
                event.preventDefault();
            }
        }
        
        /**
         * Update UI state
         */
        updateUI() {
            this.ui.updatePointCount(this.state.getPointCount());
            this.ui.updateButtons(
                this.state.canUndo(), 
                this.state.canRedo(), 
                this.state.isViewOnly
            );
            this.ui.updateJerseyNumberList(this.state.getPoints(), this.activeJerseyNumberFilters);
            this.ui.updateRotationList(this.currentRotation, this.activeRotationFilters, this.state.isViewOnly);
        }
        
        /**
         * Update session title with mode
         */
        updateSessionTitleWithMode() {
            this.ui.updateSessionTitle(this.state.name);
            this.ui.updateModeBanner(this.state.mode);
            this.updateLineUIVisibility();
        }
        
        /**
         * Show/hide line-related UI elements based on mode
         */
        updateLineUIVisibility() {
            const isChartingMode = this.state.mode === 'heatmapCharting';
            const display = isChartingMode ? '' : 'none';
            
            const toggleLinesBtn = this.ui.getElement('toggleLinesBtn');
            const jerseyNumberInput = this.ui.getElement('jerseyNumberInput');
            const jerseyNumberList = this.ui.getElement('jerseyNumberList');
            const trackTeamBtn = this.ui.getElement('trackTeamBtn');
            const teamButtons = this.ui.getElement('teamButtons');
            const container = this.ui.getElement('mainContainer');
            
            if (toggleLinesBtn) toggleLinesBtn.style.display = display;
            if (jerseyNumberInput) jerseyNumberInput.style.display = display;
            if (jerseyNumberList) jerseyNumberList.style.display = display;
            if (trackTeamBtn) trackTeamBtn.style.display = display;
            // Always hide team buttons in simple mode
            if (teamButtons) {
                teamButtons.style.display = isChartingMode && this.trackTeam ? 'flex' : 'none';
            }
            
            // Adjust container padding based on mode
            // Both modes need left padding for rotation buttons, right padding only for charting mode
            if (container) {
                container.style.padding = isChartingMode ? '30px 120px 30px 120px' : '30px 30px 30px 120px';
            }
        }
        
        /**
         * Cleanup resources
         */
        cleanup() {
            this.ui.cleanup();
        }
    }

    // =====================================================
    // APPLICATION INITIALIZATION
    // =====================================================
    
    /**
     * Initialize the application when DOM is ready
     */
    function initApp() {
        // Check browser compatibility first
        const compatibility = checkBrowserCompatibility();
        if (!compatibility.isCompatible) {
            showCompatibilityError(compatibility.missing);
            return;
        }
        
        Logger.info('Browser compatibility check passed');
        
        try {
            const app = new HeatmapApp(CONFIG);
            app.init();
            
            // Store app instance globally for debugging (optional)
            if (CONFIG.debug.enabled) {
                window.heatmapApp = app;
                Logger.info('App instance available as window.heatmapApp');
            }
        } catch (error) {
            console.error('Fatal error initializing application:', error);
            Logger.error('Fatal initialization error', error);
            alert('Application failed to start. Please check the console for details.');
        }
    }
    
    // Start the application
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
    
})();
