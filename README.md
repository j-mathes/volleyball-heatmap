# Volleyball Heatmap

**Version 1.0**

This repository contains a web-based application for creating and visualizing volleyball heatmaps on a grid. It is designed for interactive data plotting with session management features.

## License

This work is licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](http://creativecommons.org/licenses/by-nc-sa/4.0/).

Copyright (c) 2025 Jared Mathes

**You are free to:**
- Share — copy and redistribute the material in any medium or format
- Adapt — remix, transform, and build upon the material

**Under the following terms:**
- **Attribution** — You must give appropriate credit, provide a link to the license, and indicate if changes were made.
- **NonCommercial** — You may not use the material for commercial purposes.
- **ShareAlike** — If you remix, transform, or build upon the material, you must distribute your contributions under the same license as the original.

## Description

Volleyball Heatmap displays a grid that represents a volleyball court playing area. 

Users can interact with the grid to add data points, which are visualized as either heatmap "clouds" and dots, or as numbered lines representing specific shot paths.

## Screen Captures

![StartPage](https://github.com/user-attachments/assets/5cb9fa71-ffc0-480d-a988-043a810181ee)

![SimpleHeatmap](https://github.com/user-attachments/assets/e9e04674-de7a-428e-824c-a60f65a9ab18)

![Charting](https://github.com/user-attachments/assets/e6511cdb-c33a-44eb-935f-3c3a8b029bf5)

## Features

-   **Two Operating Modes**:
    -   **Simple Heatmap**: Simple click-to-add heatmap points.
    -   **Heatmap and Charting**: Allows for drawing numbered lines between points, represenging a specific shot path.

-   **Interactive Canvas**:
    -   Click to add points in "Simple Heatmap" mode.
    -   Click and drag to draw lines in "Heatmap and Charting" mode.
    -   Real-time coordinate display in meters.

-   **Session Management**:
    -   **Save**: Downloads the current session as a JSON file. Each save creates a new download file. Files are named using the session name with mode-specific suffixes (_shm for Simple Heatmap, _hmc for Heatmap and Charting).
    -   **Load**: Load a previously saved session file to continue editing or view in read-only mode.
    -   **Combine Heatmaps**: Merge multiple session files of the same type into a single combined heatmap.
    -   **Undo/Redo**: Full support for undoing and redoing actions.
    -   **View-Only Mode**: Load sessions in a read-only state to prevent accidental changes.

-   **Rotation Tracking**:
    -   Assign rotations (1-6) to all heatmap points.
    -   Left-click rotation buttons to set current rotation for assignment.
    -   Right-click rotation buttons to filter display by specific rotations.
    -   Rotation information displayed alongside jersey numbers (e.g., "12 - R3" or "R3").
    -   Auto-add current rotation to filters when drawing with active filters enabled.

-   **Jersey Number Filtering**:
    -   Multi-select filtering - toggle multiple jersey numbers to filter display.
    -   Active filters shown with blue background and white text.
    -   Clear filters button appears when multiple filters are active.

-   **Rich UI Controls**:
    -   Clear all points.
    -   Toggle visibility of lines and numbers in charting mode.
    -   Filter display by jersey number (multi-select supported).
    -   Filter display by rotation (multi-select supported).
    -   Clear rotation filters button (shown when filters are active).
    -   Clear jersey number filters button (shown when 2+ filters are active).

-   **Session Safety**:
    -   Prompt to save when starting a new session with unsaved data.
    -   Custom confirmation dialog with Yes/No buttons.

-   **Keyboard Shortcuts**:
    -   `Ctrl/Cmd + Z`: Undo
    -   `Ctrl/Cmd + Y` or `Ctrl/Cmd + Shift + Z`: Redo
    -   `Ctrl/Cmd + S`: Save session
    -   Number keys (`0-9`) and `Backspace` for entering jersey numbers in charting mode.

## File Structure

-   `index.html`: The main entry point for the application.
-   `heatmap.js`: Contains all the application logic, including canvas rendering, state management, and UI interactions. The code is well-structured into classes for geometry, rendering, and session management.
-   `styles.css`: Defines the visual appearance of the application and UI elements.

## How to Use

1.  Clone this repository to your local machine.
2.  Open the `index.html` file in a modern web browser (like Chrome, Firefox, or Edge).
3.  You will be prompted to start a new session with three options:
    -   **Start Session**: Enter a session name and choose between "Simple Heatmap" and "Heatmap and Charting" modes.
    -   **Load Session**: Load a previously saved session file to continue editing or view in read-only mode.
    -   **Combine Heatmaps**: Merge multiple session files of the same type into a single combined heatmap.
4.  Interact with the grid to create your heatmap:
    -   In "Simple Heatmap" mode: Click to add points.
    -   In "Heatmap and Charting" mode: Click and drag to draw lines. Enter jersey numbers (0-99) before drawing.
5.  Use the rotation buttons (R1-R6) on the left side:
    -   **Left-click**: Assign the rotation to new points you add.
    -   **Right-click**: Toggle filtering to show only points with that rotation.
6.  Use jersey number buttons (when available) on the right side:
    -   **Click**: Toggle filtering to show only points with that jersey number.
7.  Use the "Clear Filters" buttons that appear when filters are active to reset filtering.
8.  Use the bottom controls to undo/redo, save, toggle line visibility, clear all, or start a new session.

## Configuration Options

The application includes configurable settings in the `CONFIG` object at the top of `heatmap.js`. You can adjust these values to customize behavior:

### Debug Settings (`CONFIG.debug`)

```javascript
debug: {
    enabled: false,           // Enable debug mode for development (default: false)
    assertionsEnabled: true,  // Enable runtime assertions (default: true)
    logLevel: 'warn'          // Logging level: 'error', 'warn', 'info', 'debug' (default: 'warn')
}
```

Debug mode is useful for development and troubleshooting:
- **enabled**: When `true`, enables debug logging and stores the app instance as `window.heatmapApp` for console access
- **assertionsEnabled**: When `true` (and debug enabled), runs runtime assertions to catch logic errors early
- **logLevel**: Controls which log messages are displayed in the console

### Validation Settings (`CONFIG.validation`)

```javascript
validation: {
    maxFileSize: 10485760,       // Max file size in bytes (default: 10MB)
    maxPointCount: 10000,        // Point count for performance warning (default: 10000)
    maxUndoStackSize: 1000,      // Max undo/redo history depth (default: 1000, 0 = unlimited)
    autoTrimUndoStack: true      // Auto-trim oldest history when limit reached (default: true)
}
```

#### Key Configuration Options:

- **maxFileSize**: Maximum allowed file size for loading sessions (in bytes). Default is 10MB (10 * 1024 * 1024).
  
- **maxPointCount**: When loading or combining files with more points than this value, the user will be warned about potential performance impacts. Default is 10,000 points.

- **maxUndoStackSize**: Maximum number of undo/redo actions to keep in memory. Set to `0` for unlimited history (not recommended for long sessions). Default is 1,000 actions, which provides excellent history while maintaining reasonable memory usage.

- **autoTrimUndoStack**: When `true` (default), automatically removes the oldest undo/redo entries when the stack exceeds `maxUndoStackSize`. When `false`, no automatic trimming occurs (stack can grow indefinitely if maxUndoStackSize is 0).

### Grid and Display Settings

You can also modify grid dimensions, colors, and visual properties in other sections of the CONFIG object:

- **CONFIG.debug**: Debug mode, assertions, and logging level
- **CONFIG.grid**: Canvas size, grid dimensions, and line properties
- **CONFIG.colors**: Color schemes for different zones and elements
- **CONFIG.drawing**: Cloud radius, line widths, fonts, and offsets

**Note**: Modifying configuration requires editing the JavaScript file directly. Changes take effect when you reload the page.

## Version Information

**Current Version:** 1.0

All session files are saved with version information to ensure future compatibility. The application automatically checks file versions when loading and can handle legacy files without version data.

### Version History

#### Version 1.0 (December 2025)
- Initial release
- **Core Features:**
  - Two operating modes: Simple Heatmap and Heatmap & Charting
  - Interactive canvas with click-to-add and drag-to-draw functionality
  - Rotation tracking (R1-R6) with multi-select filtering
  - Jersey number filtering with multi-select support
  - Session management: save, load, and combine heatmaps
  - View-only mode for reviewing sessions without editing
  - Full undo/redo support with configurable history depth (1000 actions default)
  - Real-time coordinate display in meters
  
- **Advanced Features:**
  - Browser compatibility detection
  - Input validation and sanitization
  - File size limits (10MB) and point count warnings (10,000 threshold)
  - Debug mode with configurable logging and assertions
  - Version tracking in saved files for future compatibility
  
- **User Interface:**
  - Modal-based workflow for session creation
  - Keyboard shortcuts (Ctrl+Z/Y for undo/redo, Ctrl+S for save)
  - Toggle line visibility in charting mode
  - Clear filters buttons when multiple filters active
  - Responsive design with touch-friendly controls

## Browser Compatibility

The application automatically checks for required browser features on startup:
- Canvas 2D rendering context
- FileReader API for loading files
- Blob and URL APIs for saving files
- JSON parsing and serialization
- LocalStorage (optional, for future features)

If your browser is missing required features, you'll see a clear error message with recommendations to use a modern browser like Chrome, Firefox, Edge, or Safari.

## Security Features

The application includes comprehensive input validation and sanitization:
- **Session names**: Automatically sanitized to remove problematic characters, limited to 50 characters
- **Jersey numbers**: Limited to 0-99, only numeric input accepted
- **Coordinates**: Validated and clamped to canvas bounds
- **File size limits**: 10MB maximum to prevent memory issues
- **Point count warnings**: Alert when loading large datasets (>10,000 points)

