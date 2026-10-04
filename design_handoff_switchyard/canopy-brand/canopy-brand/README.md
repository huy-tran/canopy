# Canopy brand files

Logo: side view of a ute canopy on the tray. The two side windows stand for the API and FE panes.

## Files
- canopy.ico: Windows app icon (16–256, PNG-embedded). Use for electron-builder win.icon.
- png/canopy-{16…512}.png: app icon tiles. 16 and 24 use the simplified mark (no windows) so it stays crisp in the title bar and tray.
- svg/canopy-app-icon.svg, svg/canopy-app-icon-small.svg: app icon tiles.
- svg/canopy-mark-on-dark.svg, svg/canopy-mark-on-light.svg: mark without a tile.
- svg/canopy-lockup-on-dark.svg, svg/canopy-lockup-on-light.svg: mark + "Canopy" wordmark (Geist 600, -0.02em). The text is live, not outlined: install Geist, or outline it before print.

## Colours
- Ochre, mark on dark: #D9773A
- Ochre, mark on light: #C2622A
- Icon tile: #1C1A18
- Tray bar: mark colour at 55% opacity

## Usage
- Title bar: 16px simplified tile + "Canopy" in Geist 500, 12px.
- Clear space: at least one side-window height around the mark.
- Side windows always take the colour of whatever is behind the mark.
