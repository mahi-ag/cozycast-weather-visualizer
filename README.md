# CozyCast 🧶

Turn historical daily temperatures into a customizable crochet blanket pattern.

## Stack
React, TypeScript, Vite, CSS, Lucide icons, Open-Meteo Historical Weather & Geocoding APIs.

## Run locally
```bash
npm install
npm install lucide-react
npm run dev
```

## Features
- Search cities worldwide
- Fetch historical mean daily temperatures
- 7-band temperature-to-color mapping and three customizable palettes
- Three stitch styles and daily/weekly views
- Local storage persistence and shareable URL configuration
- SVG blanket and CSV pattern export
- Responsive design, loading and error states

## Data notes
Weather is historical daily **mean** temperature, in °C, from Open-Meteo. Weekly view averages available daily values in groups of seven. No AI forecasting is used. Historical data may be unavailable for some locations or dates.

## Attribution
Weather data by [Open-Meteo](https://open-meteo.com/).
