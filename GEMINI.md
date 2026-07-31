BirdNET-Pi UI Upgrade: Project Handover & Architecture Brief

1. Project Overview & Architecture Strategy

Context & Long-Term Goal: The default BirdNET-Pi web interface is built entirely on legacy PHP. While functional, it is tightly coupled to the Raspberry Pi's operating system, rendering it sluggish, difficult to customize, and prone to breaking during system updates. Our ultimate, long-term vision is a complete, 100% replacement of the legacy PHP system. We want a modern, lightning-fast Single Page Application (SPA) that handles everything the old UI did, and much more.

Current Strategy (The Stepping Stone): We are currently employing a "Headless Hybrid" approach. We are leaving the PHP layer intact for now to safely handle deep, critical system-level bash commands (like restarting root services). Alongside it, we have built a lightweight, highly optimized Python "Sidecar Server" designed exclusively to serve our brand-new modern frontend for the daily viewing of data, media curation, and analytics. Eventually, this new architecture will swallow the system-admin duties as well.

Tech Stack Deep Dive:

Backend: Python 3 (birdnet_core.py). This runs via the native http.server module on localhost:9999.

Capabilities: It directly queries the local SQLite database (birds.db), rapidly parses the filesystem to serve audio files using os.walk, and utilizes the subprocess module to fetch live system thermals and command FFmpeg audio processing.

Frontend: A single index.html file using Vanilla HTML5 and JavaScript.

Styling & Data: Tailwind CSS and Chart.js (via CDN).

Why a monolith? There are absolutely no build steps, Node modules, or Webpack configurations used. This file is a standalone monolith. This allows the user to update their dashboard simply by dragging and dropping a single file into their Pi's directory.

2. UI/UX Design Guidelines

The new interface must feel like a premium, upgraded version of the original.

Color Palette (Flexible Green Aesthetic): The UI should generally adopt a dark, earthy, forest-green aesthetic inspired by the original BirdNET-Pi interface. However, the exact hex codes are open to refinement—the priority is ensuring the interface looks modern, clean, and highly readable. Avoid generic dark-mode grays, but don't feel locked into the exact legacy green if a slightly different shade looks better.

Hyperlinks & Numeric Highlights: Bright blue. This provides critical contrast against the green for readable data points (specifically used on the Overview page for "Today", "Species Detected Today", and "Total Number of Species").

Logo Implementation: Use the official BirdNET geometric bird logo embedded directly as an <svg> vector in the HTML sidebar. Strict Rule: The logo is exclusively Red and Black/Dark-Gray. There is absolutely no purple in the logo.

Imperial Units Priority: Weather data fetching and system temperature diagnostics must default to Imperial units (°F, mph, inches) to match the primary user's preference. A toggle must be present in the Analytics UI to switch to Metric.

3. Feature Specifications & State

A. The Python Backend (birdnet_core.py)

The server acts as an API layer and must include the following robust endpoints:

/api/detections: Reads the local SQLite database (birds.db) and returns a raw CSV string of recent detections.

/api/system: Executes shell commands to return live SoC Temperature, RAM usage, Disk capacity, and system Uptime.

/api/config: Reads ~/BirdNET-Pi/birdnet.conf.

/api/log: Streams journalctl -u birdnet_analysis.service.

/api/stream: Proxies the local Icecast audio stream. Must bypass browser CORS by piping the data chunk-by-chunk.

/api/gallery: Scans ~/BirdSongs/. It selectively skips StreamData buffers and mixes. It returns the 200 most recent audio files AND the absolute highest-confidence file for every unique species on the drive to ensure no species are missing from the "Best Recordings" list.

/api/compile (POST): Accepts a JSON payload with target species, minimum confidence, and file limit. Uses ffmpeg -f concat -c copy to stitch .mp3 files together rapidly without re-encoding. Saves to ~/BirdSongs/mixes/.

Media Routing: Intercepts requests for static .png (spectrograms) and .mp3/.wav files and serves them directly from the local filesystem to bypass security blocks. Crucial: Uses robust try/except blocks during os.walk to prevent corrupted files from crashing the server.

B. The HTML Frontend (index.html)

1. Data Parsing:

The internal JavaScript CSV parser must be extremely aggressive and fault-tolerant, using index-based fallbacks in case headers are malformed by SQLite.

2. Application Layout & Navigation:

Sidebar: Contains SVG Logo, Main Nav tabs, and a "Quick Stats" module mimicking the native UI side-panel (using bright blue text for values).

Audio Player: A compact HTML5 audio player anchored to the bottom of the sidebar, permanently connected to /api/stream. It replaces the old, intrusive "Zen Mode" page.

3. Module Specifics:

Dashboard: 24-hour bar chart, quick stats, and a clickable recent detections feed that launches the Detection Modal.

Analytics: Contains Accumulation Curve (Line), Weather Impact (Bar/Line combo via Open-Meteo), Time Matrix (Bubble chart: Species vs Hour), and System Health (Acoustic noise diagnostics).

Media Gallery: Tabs for Recent Captures, Today's List, and Best Recordings. Best Recordings must have functional sort buttons: Alphabetical, Occurrences, Confidence, Date.

Audio Compiler: Contains a Timeframe filter (7d, 30d, 180d, All Time) that dynamically updates three "Smart Suggestion" cards based only on the selected timeframe.

4. The Detection Modal (CRITICAL UI PARITY):

This modal replicates the native UI flow with modern enhancements. Focus completely on the Spectrogram and species identity.

Top Info Bar:

Left: A square, cropped image of the bird fetched via Wikipedia API (must include &redirects=1 in the API call to handle capitalization variances). Clicking this image triggers a full-screen Lightbox overlay.

Right: Species info and action icons.

Icons Required:

A "W" button (Wikipedia link).

An "i" info button (AllAboutBirds.org guide link) styled with a white background and black text.

A Chart icon styled with a black line and a red fill under the curve. Clicking this toggles a pop-out floating Line Graph showing "Detections Over Time" (with a 30d/180d/All dropdown).

Main Visual Body:

Displays the native .png static spectrogram image served directly from the Pi. Do not generate a canvas-based live spectrogram here.

A vertical playhead line that smoothly tracks across the image as the audio plays.

Audio Controls & Playback (Auto-Hiding):

A floating control bar (Play/Pause, scrubber, timer) anchored over the bottom of the spectrogram. It has opacity-0 by default and fades to opacity-100 on mouse hover.

Includes a "Settings/Gear" icon. Clicking this opens a floating popover menu containing granular audio adjustments manipulating the Web Audio API:

Gain Booster (Off, 6, 12, 18, 24, 30 dB)

High-Pass Filter (Off, 250Hz, 500Hz, 1KHz, 1.5KHz)

Low-Pass Filter (Off, 2KHz, 4KHz, 8KHz)

A native "Download Audio" hyperlink.

4. Known Bugs & Past Trauma to Avoid

The Canvas Formatting Bug: The AI must use standard Markdown file blocks with the exact titles index.html and birdnet_core.py (e.g., ````html:index.html`). Failure to do so prevents the collaborative Canvas UI from rendering.

The CDN Injection Bug: Never use Markdown hyperlink syntax [https://...](https://...) directly inside standard HTML <script src="..."> tags. Use standard absolute URLs.

SocketServer NameError: Ensure import socketserver is explicitly present at the top of birdnet_core.py.

Context Truncation: The HTML file is large. The AI must ensure it paces the generation and completes the file entirely, ending properly with </html> and followed by the mandatory


UPDATE:

BirdNET-Pi UI Upgrade: Project Handover & Architecture Brief

Project Overview & Architecture Strategy

Context & Long-Term Goal: The default BirdNET-Pi web interface is built entirely on legacy PHP. Our ultimate, long-term vision is a 100% replacement of the legacy PHP system with a modern, lightning-fast Single Page Application (SPA). This includes full feature parity: configuration, administration, data management, and service control.

Current Strategy (The Stepping Stone): We are employing a "Headless Hybrid" approach. We are leaving the PHP layer intact for deep system-level bash commands while our modern Python "Sidecar Server" (birdnet_core.py) rapidly expands to swallow all UI-driven configuration, database management, and service control responsibilities.

Tech Stack Deep Dive:

Backend: Python 3 (birdnet_core.py) running on localhost:9999.

Frontend: A single index.html monolith.

Styling & Data: Tailwind CSS and Chart.js (via CDN).

Engineering Philosophy: The file should, for now, remain a standalone monolith to support simple drag-and-drop updates. As the project scope grows, maintain clear, logical sectioning within index.html for markup, CSS, and specific functional handler blocks (e.g., config-forms, service-controls, species-management).

UI/UX Design Guidelines

Aesthetic: Dark, earthy, forest-green theme. Modern, clean, and readable.

Hyperlinks/Numeric Highlights: Bright blue.

Logo: Official BirdNET SVG vector. Strict Rule: Red and Black/Dark-Gray only (Zero purple).

Units: Default to Imperial (°F, mph, inches). Analytics UI must include a Metric toggle.

Engineering & Protocol Guidelines

Backend Expansion: All new settings must be handled via secure endpoints. Configuration updates (e.g., birdnet.conf) must be implemented with robust parsing that preserves existing file comments and formatting.

Error Handling: Use aggressive, fault-tolerant logic. Filesystem operations (os.walk) and subprocess calls must be wrapped in try/except blocks to ensure the backend remains stable if a corrupted file or unexpected service state is encountered.

Feature Parity: Implement missing features based on the Feature Gap Analysis, prioritizing System/Service controls, Advanced Settings, and Species List management.

Formatting Rules:

NEVER use the term "diff" in any context.

NEVER conclude a response with a "next step" prompt or suggestion.

Always use absolute URLs for CDNs.

Every file generation request must use the mandatory file block format with valid file paths.

Known Traps to Avoid

The Canvas Formatting Bug: Always use the mandatory file block format (```html:index.html). Failure to do so breaks the collaborative UI.

CDN Injection: Never use Markdown hyperlink syntax inside HTML script tags.

SocketServer: Always verify import socketserver is present.

Context Truncation: For large files, pace the generation to ensure the document is complete and ends with </html>.