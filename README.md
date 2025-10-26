# SVG Color Replacer Plugin

A plugin for Obsidian that automatically adapts SVG image and mathematical formula colors to match dark theme styling.

## How it works

1. When a note loads, the plugin finds all SVG elements
2. For each SVG:
	- Gets the current Obsidian background color
	- Replaces white color with this background color (hides white parts)
	- Replaces black color with white (makes black text visible)
3. Marks processed elements to avoid re-processing on updates

## What gets processed

- `fill`, `stroke`, `color` attributes
- Inline styles (CSS inside `style=""`)
- Text elements (`<text>`, `<tspan>`)
- SVGs in both regular form and encoded in data-URLs

## Installation

1. Copy the plugin folder to `.obsidian/plugins/`
2. In Obsidian, open Settings → Community plugins → Reload plugins
3. Enable the "SVG Color Replacer" plugin

