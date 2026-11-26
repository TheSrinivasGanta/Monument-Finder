# MonumentFinder

## About the Project

MonumentFinder is a web application that helps users discover historic monuments in Schleswig-Holstein, Germany.

The application uses the user's current location to find nearby monuments, displays them on an interactive map, and provides walking routes to selected monuments.

## Features

- Interactive map using OpenLayers and OpenStreetMap.
- Find the user's current location using geolocation.
- Display nearby monuments in Schleswig-Holstein.
- Show at least three nearest monuments and all monuments within 1.5 km.
- Select a monument to view its information.
- Calculate walking routes to selected monuments.
- Display route distance, estimated duration, and walking instructions.
- Responsive layout for desktop, tablet, and mobile devices.

## Technologies Used

- Vue 3
- TypeScript
- Vite
- OpenLayers
- HTML and CSS
- WFS (Web Feature Service)
- WMS (Web Map Service)
- Valhalla routing service

## Data Sources

The application uses geospatial services provided by the Geodateninfrastruktur Schleswig-Holstein (GDI-SH).

**WFS – Monument data**

https://service.gdi-sh.de/SH_INSPIREDOWNLOAD_AI_PS

**WMS – Monument map layer**

https://service.gdi-sh.de/SH_INSPIREVIEW_AI_PS

The application uses the `Baudenkmal_SH` feature type from the WFS and the `PS.ProtectedSitesBaudenkmal` layer from the WMS.

## Installation

Make sure Node.js and npm are installed.

Clone the repository:

```bash
git clone https://github.com/TheSrinivasGanta/Monument-Finder.git
```

Open the project folder:

```bash
cd Monument-Finder
```

Install dependencies:

```bash
npm install
```

## Run the Development Server

```bash
npm run dev
```

Open the local URL displayed in the terminal.

## Production Build

```bash
npm run build
```

To preview the production build:

```bash
npm run preview
```

## Code Quality

ESLint is configured with the `@dataport/eslint-config-geodev` shared configuration.

Run the lint check:

```bash
npm run lint
```

## Repository

[MonumentFinder on GitHub](https://github.com/TheSrinivasGanta/Monument-Finder)
