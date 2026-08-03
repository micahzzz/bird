# Mission Context
We recently refactored our monolithic frontend. `index.html` was split, and the CSS and JS logic were moved into `fastapi_app/static/style.css` and `fastapi_app/static/main.js`. 

# The Current Bug
The user interface is currently broken and displaying without styling or data. This is because the backend server (`birdnet_core.py`) is unaware of the new directory structure and is throwing 404 errors when `index.html` requests the `/static/` assets.

# Your Task
1. Read `birdnet_core.py`.
2. Locate the `do_GET` function.
3. Find the fallback routing block at the end of the function that serves `index.html`.
4. Add an `elif` statement to catch requests where the path starts with `/static/`. 
5. Rewrite those specific paths to prepend `/fastapi_app` so the server can locate the split files.
6. Push the modified `birdnet_core.py` to the Raspberry Pi and restart the `birdnet_core.service`.