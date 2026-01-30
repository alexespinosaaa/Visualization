Hospital Risk Explorer – Interactive Dashboard

This project is an interactive D3.js dashboard for exploring hospital capacity risk,
staff wellbeing, and event impact over time. The tool supports visual analysis across
weeks of a year using multiple coordinated views.

--------------------------------------------------
Project Structure
--------------------------------------------------

EDA/
Contains exploratory notebooks and scripts used during the interim analysis phase.
These files are not required to run the final dashboard.

Hospital Beds Management/
Contains the original CSV datasets used by the dashboard.

index.html
Main entry point of the dashboard.

main.js
Central controller that manages global state, loads data, and coordinates
interactions between views.

data_processor_final.js
Processes raw CSV data into unified, view-ready datasets shared across all
visualizations.

view-*.js
Individual visualization modules:
- view-calendar.js: calendar heatmap (annual overview)
- view-timeseries.js: time series with brushing and zoom
- view-event-impact.js: event impact visualization (violin plots)
- view-scatter.js: scatterplot view
- view-scatterplot-linked.js: linked scatterplot interactions
- view-pcp.js: parallel coordinates plot

viz-utils.js
Shared utility functions such as scales, color mappings, and formatting helpers.

--------------------------------------------------
What the Dashboard Does
--------------------------------------------------

The dashboard supports coordinated exploration of hospital risk indicators:

- Calendar heatmap:
  Shows an annual overview to identify high-risk weeks based on KPIs such as
  refusals, occupancy, morale, and satisfaction.

- Time series view:
  Allows zooming and brushing to select a time range and clicking to select
  individual weeks.

- Event impact view:
  Compares KPI distributions across event types within the selected time window.

- Scatterplot and parallel coordinates views:
  Support multivariate analysis with linked brushing.

All views are coordinated. Interactions in one view update the others.

Tools and Environment

The project was developed using Visual Studio Code.
A local web server is required to run the dashboard due to ES module imports.

We used the VS Code Live Server extension to serve the files locally during
development and testing.

--------------------------------------------------
How to Run the Tool
--------------------------------------------------

1. Ensure the CSV files are located in the expected data folder and that filenames
   match those loaded in main.js.
2. Start a local web server in the project root.
   Recommended option: VS Code Live Server.
3. Open index.html through the local server (do not open the file directly).
4. If data does not load, check file paths and filenames in main.js.

Detailed setup instructions are available in INSTALL.md.

--------------------------------------------------
What We Implemented Ourselves
--------------------------------------------------

We implemented:
- The dashboard layout using HTML and CSS, including responsive sizing.
- A centralized state and dispatch pattern in main.js for coordinating views.
- All visualization views (calendar heatmap, time series, event impact,
  scatterplot, parallel coordinates).
- A custom data processing pipeline to combine and standardize multiple CSV
  sources.
- Interaction logic including week selection, time-range brushing, event
  filtering, zooming, and linked brushing.

The code is modular, with each visualization implemented in a separate file and
documented with comments.

--------------------------------------------------
What We Used From Others
--------------------------------------------------

- D3.js library for data loading, scales, axes, SVG rendering, brushing, and
  zoom interactions.
- Hospital Beds Management dataset (see dataset documentation in the data folder).

No external dashboard templates or third-party visualization code were reused.

--------------------------------------------------
Code Status
--------------------------------------------------

The dashboard runs correctly when served through a local web server.
All implemented views are functional and coordinated.
The EDA folder contains exploratory work only and does not affect execution of
the final tool.

--------------------------------------------------
Framework Used
--------------------------------------------------

D3.js (used directly, without wrapper frameworks)
