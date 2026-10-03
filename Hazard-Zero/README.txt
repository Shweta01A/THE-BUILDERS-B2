HAZARD ZERO - 2D WAREHOUSE WALKER

HOW TO RUN
1. Double-click START-SERVER.bat (Windows) or run ./START-SERVER.sh (Mac/Linux).
2. Open http://localhost:8000 in Chrome or Edge.
   (The 360 VIEW button needs the local server. Pannellum loads from a CDN.)

CONTROLS
Left/Right arrows or A / D walk, Shift run, E inspect a hazard,
V or the 360 VIEW button opens a 360 view of the zone you are in.
Admin login: admin / admin123

HOW IT WORKS
One straight corridor, no branches. The employee only walks left and right.
The 8 zones are joined in a fixed order (left to right), each using one of your
realistic warehouse photos, and the worker sprite walks in front of them:
 1 oil  2 box  3 electrical  4 cable  5 chemical  6 emergency exit  7 fire  8 shelf
Hazards are never highlighted. Walk up to something unsafe and press E.
Pressing E where nothing is wrong shows "Nothing unusual here."
Securing an area puts cones and tape in front of it.

FILES
walker2d.js     the 2D walker (zones, character, camera, hazards)
script.js       login, score, risk, timer, questions, admin
index.html, style.css
assests/        your photos and worker-male.png / worker-female.png
old/warehouse3d.js   the previous Three.js version (no longer loaded)

CHANGING THINGS (top of walker2d.js)
ZONES   order of the zones, and hx = where the hazard sits inside its photo (0 to 1)
CHAR_H  character size      FEET_Y  how low on the screen the character stands
WALK / RUN  speeds          OVERLAP how softly photos blend together


UPDATE 2
- New side-view worker with real legs/arms, feet planted, always faces the way he walks.
- He walks INTO the picture toward the hazard and stops in front of it, facing it.
- To pick a hazard: walk up, an "E INSPECT" bubble appears. Press E or click the bubble.
  You can also CLICK the hazard in the picture and he walks there and inspects it.


UPDATE 3
- No E key any more. Click the hazard in the picture: your worker walks to it and the
  options panel opens so you can choose. Clicking the floor just walks there.


UPDATE 4
- E key is back. No pop-up notice: walk next to a hazard yourself and press E.
- Clicking the floor only walks there.
