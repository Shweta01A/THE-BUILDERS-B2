/* =========================================================
   HAZARD ZERO
   COMPLETE GAME SCRIPT

   ---------------------------------------------------------
   CHANGES IN THIS VERSION (performance refactor)
   ---------------------------------------------------------
   1. BUG FIX: loadIntroPanorama() checked `if (intro)` instead
      of `if (introViewer)`. That's an undefined variable, so
      the destroy() call silently threw and was swallowed by
      the catch block — meaning the old intro WebGL context
      was never released. Over repeated restarts this leaks
      WebGL contexts (browsers cap these, commonly ~16) and
      causes things to slow down or glitch. Fixed below.

   2. PERFORMANCE: loadScene() used to call viewer.destroy()
      and construct a brand-new pannellum.viewer() for EVERY
      scene change — tearing down and rebuilding the whole
      WebGL canvas each time, with no preloading, so the next
      panorama only started downloading the moment the player
      clicked "next".

      Replaced with Pannellum's built-in multi-scene config:
      all panoramas are registered once (with preload: true)
      on ONE persistent viewer, created in initGameViewer().
      Moving between scenes now calls viewer.loadScene(id) on
      the same instance — no destroy/recreate, and upcoming
      scenes are fetched in the background while the current
      one is being viewed.

      New/changed functions: sceneId(), buildScenesConfig(),
      initGameViewer(), onSceneReady(), loadScene(), and the
      "Begin Training" click handler + moveToNextScene() (both
      updated to match the new loadScene(index) signature).

      Everything else — hazard hotspot logic, scoring, the
      timer, admin dashboard, login/registration, notifications
      — is unchanged.

   SCENES
   1 = Warehouse
   2 = Warehouse
   3 = OIL SPILL
   4 = UNSTABLE BOXES
   5 = ELECTRICAL FIRE
   6 = CABLE TRIP HAZARD
   7 = Chemical
   8 = FIRE HAZARD

   FEATURES
   - Employee login
   - Employee registration
   - Admin login
   - Admin dashboard
   - 360 degree Pannellum viewer
   - Hazard questions
   - Score system
   - Risk system
   - 3 wrong answer elimination
   - YOU ARE OUT notification
   - Congratulations completion notification
   - Progress saved to localStorage
   - Fullscreen
   - Exit training
   ========================================================= */


document.addEventListener("DOMContentLoaded", function () {

    console.log("=================================");
    console.log("HAZARD ZERO INITIALISING");
    console.log("=================================");


    /* =====================================================
       ASSETS
       ===================================================== */

    const warehouseImages = [
        "assests/assests.webp",
        "assests/assests1.webp",
        "assests/assests.png",
        "assests/assests2.png",
        "assests/assests3.png",
        "assests/cable.png",
        "assests/chemical.png",
        "assests/fire.png",
        "assests/emergencyexit.png",
        "assests/shelf.png"



    ];


    const workerImages = {
        male: "assests/worker-male.png",
        female: "assests/worker-female.png"
    };


    /* =====================================================
       GAME VARIABLES
       ===================================================== */

    let viewer = null;
    let introViewer = null;

    let currentScene = 0;

    let score = 0;
    let riskFactor = 0;
    let wrongDecisions = 0;

    // =====================================================
// TRAINING ATTEMPT / TIME TRACKING
// =====================================================

let trainingStartTime = null;
let trainingTimerActive = false;
let trainingAttempts = 0;
let trainingCompletionTime = 0;

    const MAX_WRONG_DECISIONS = 3;

    let hazardDecisionMade = false;
    let currentHazard = null;
    let currentEmployee = null;

    let lastSceneChange = 0;


    /* =====================================================
       EMPLOYEE STORAGE
       ===================================================== */

    function getEmployees() {

        try {

            const data =
                localStorage.getItem(
                    "hazardZeroEmployees"
                );

            if (!data) {
                return [];
            }

            const employees =
                JSON.parse(data);

            return Array.isArray(employees)
                ? employees
                : [];

        } catch (error) {

            console.error(
                "Employee storage error:",
                error
            );

            return [];

        }
    }


    function saveEmployees(employees) {

        try {

            localStorage.setItem(
                "hazardZeroEmployees",
                JSON.stringify(employees)
            );

        } catch (error) {

            console.error(
                "Could not save employees:",
                error
            );

        }
    }


    /* =====================================================
       SCREEN SYSTEM
       ===================================================== */

    function showScreen(id) {

        document
            .querySelectorAll(".screen")
            .forEach(function (screen) {

                screen.classList.add("hidden");

            });


        const target =
            document.getElementById(id);


        if (target) {

            target.classList.remove("hidden");

        } else {

            console.error(
                "Screen not found:",
                id
            );

        }
    }


    /* =====================================================
       CLEAR ERRORS
       ===================================================== */

    function clearErrors() {

        document
            .querySelectorAll(".error-message")
            .forEach(function (element) {

                element.textContent = "";
                element.style.color = "#ff7770";

            });

    }


    /* =====================================================
       LOGIN
       ===================================================== */

    const loginButton =
        document.getElementById(
            "employee-login-button"
        );


    if (loginButton) {

        loginButton.addEventListener(
            "click",
            employeeLogin
        );

    }


    function employeeLogin() {

        const idInput =
            document.getElementById(
                "login-employee-id"
            );


        const passwordInput =
            document.getElementById(
                "login-password"
            );


        const error =
            document.getElementById(
                "login-error"
            );


        const employeeId =
            idInput
                ? idInput.value.trim()
                : "";


        const password =
            passwordInput
                ? passwordInput.value
                : "";


        if (!employeeId || !password) {

            if (error) {

                error.textContent =
                    "Please enter your employee ID and password.";

            }

            return;
        }


        const employees =
            getEmployees();


        const employee =
            employees.find(function (item) {

                return (
                    String(item.id) === employeeId &&
                    String(item.password) === password
                );

            });


        if (!employee) {

            if (error) {

                error.textContent =
                    "Invalid employee ID or password.";

            }

            return;
        }


        if (error) {

            error.textContent = "";

        }


        currentEmployee = employee;


        resetTraining();

        startIntroduction();

    }


    /* =====================================================
       RESET TRAINING
       ===================================================== */

    function resetTraining() {

        score = 0;

        riskFactor = 0;

        wrongDecisions = 0;

        currentScene = 0;

        hazardDecisionMade = false;

        currentHazard = null;

    }


    /* =====================================================
       REGISTER
       ===================================================== */

    const showRegisterButton =
        document.getElementById(
            "show-register-button"
        );


    if (showRegisterButton) {

        showRegisterButton.addEventListener(
            "click",
            function () {

                clearErrors();

                showScreen(
                    "register-screen"
                );

            }
        );

    }


    const backLoginButton =
        document.getElementById(
            "back-to-login-button"
        );


    if (backLoginButton) {

        backLoginButton.addEventListener(
            "click",
            function () {

                clearErrors();

                showScreen(
                    "login-screen"
                );

            }
        );

    }


    const createAccountButton =
        document.getElementById(
            "create-account-button"
        );


    if (createAccountButton) {

        createAccountButton.addEventListener(
            "click",
            createAccount
        );

    }


    function createAccount() {

        const idElement =
            document.getElementById(
                "register-employee-id"
            );


        const nameElement =
            document.getElementById(
                "register-name"
            );


        const passwordElement =
            document.getElementById(
                "register-password"
            );


        const genderElement =
            document.querySelector(
                'input[name="gender"]:checked'
            );


        const error =
            document.getElementById(
                "register-error"
            );


        const id =
            idElement
                ? idElement.value.trim()
                : "";


        const name =
            nameElement
                ? nameElement.value.trim()
                : "";


        const password =
            passwordElement
                ? passwordElement.value
                : "";


        if (!id) {

            if (error) {

                error.textContent =
                    "Please enter an employee ID.";

            }

            return;
        }


        if (!name) {

            if (error) {

                error.textContent =
                    "Please enter your name.";

            }

            return;
        }


        if (!password) {

            if (error) {

                error.textContent =
                    "Please create a password.";

            }

            return;
        }


        if (password.length < 4) {

            if (error) {

                error.textContent =
                    "Password must contain at least 4 characters.";

            }

            return;
        }


        if (!genderElement) {

            if (error) {

                error.textContent =
                    "Please select male or female.";

            }

            return;
        }


        const employees =
            getEmployees();


        const exists =
            employees.some(function (employee) {

                return String(employee.id) === id;

            });


        if (exists) {

            if (error) {

                error.textContent =
                    "This employee ID already exists.";

            }

            return;
        }


        const employee = {

            id: id,

            name: name,

            password: password,

            gender: genderElement.value,

            score: 0,

            risk: 0,

            wrongDecisions: 0,

            completed: false

        };


        employees.push(employee);

        saveEmployees(employees);


        currentEmployee =
            employee;


        resetTraining();


        if (error) {

            error.style.color =
                "#32d583";

            error.textContent =
                "Account created successfully!";

        }


        setTimeout(function () {

            startIntroduction();

        }, 500);

    }


    /* =====================================================
       ADMIN
       ===================================================== */

    const showAdminButton =
        document.getElementById(
            "show-admin-button"
        );


    if (showAdminButton) {

        showAdminButton.addEventListener(
            "click",
            function () {

                clearErrors();

                showScreen(
                    "admin-screen"
                );

            }
        );

    }


    const adminBackButton =
        document.getElementById(
            "admin-back-button"
        );


    if (adminBackButton) {

        adminBackButton.addEventListener(
            "click",
            function () {

                clearErrors();

                showScreen(
                    "login-screen"
                );

            }
        );

    }


    const adminLoginButton =
        document.getElementById(
            "admin-login-button"
        );


    if (adminLoginButton) {

        adminLoginButton.addEventListener(
            "click",
            adminLogin
        );

    }


    function adminLogin() {

        const idElement =
            document.getElementById(
                "admin-id"
            );


        const passwordElement =
            document.getElementById(
                "admin-password"
            );


        const error =
            document.getElementById(
                "admin-error"
            );


        const id =
            idElement
                ? idElement.value.trim()
                : "";


        const password =
            passwordElement
                ? passwordElement.value
                : "";


        if (
            id === "admin" &&
            password === "admin123"
        ) {

            if (error) {

                error.textContent = "";

            }

            loadAdminDashboard();

        } else {

            if (error) {

                error.textContent =
                    "Invalid admin ID or password.";

            }

        }
    }


    /* =====================================================
       ADMIN DASHBOARD
       ===================================================== */

    function loadAdminDashboard() {

        showScreen(
            "admin-dashboard"
        );


        const employees =
            getEmployees();


        const completed =
            employees.filter(function (employee) {

                return employee.completed === true;

            });


        let averageScore = 0;
        let averageRisk = 0;


        if (employees.length > 0) {

            averageScore =
                employees.reduce(
                    function (total, employee) {

                        return (
                            total +
                            Number(employee.score || 0)
                        );

                    },
                    0
                ) / employees.length;


            averageRisk =
                employees.reduce(
                    function (total, employee) {

                        return (
                            total +
                            Number(employee.risk || 0)
                        );

                    },
                    0
                ) / employees.length;

        }


        const total =
            document.getElementById(
                "admin-total-employees"
            );


        const completedDisplay =
            document.getElementById(
                "admin-completed"
            );


        const averageScoreDisplay =
            document.getElementById(
                "admin-average-score"
            );


        const averageRiskDisplay =
            document.getElementById(
                "admin-average-risk"
            );


        if (total) {

            total.textContent =
                employees.length;

        }


        if (completedDisplay) {

            completedDisplay.textContent =
                completed.length;

        }


        if (averageScoreDisplay) {

            averageScoreDisplay.textContent =
                Math.round(averageScore);

        }


        if (averageRiskDisplay) {

            averageRiskDisplay.textContent =
                Math.round(averageRisk) + "%";

        }


        const table =
            document.getElementById(
                "employee-table-body"
            );


        if (!table) {

            return;

        }


        table.innerHTML = "";


        employees.forEach(function (employee) {

            const row =
                document.createElement("tr");


            row.innerHTML = `
            <td>${employee.id}</td>
            <td>${employee.name}</td>
            <td>${employee.gender}</td>
            <td>${employee.score || 0} / 400</td>
            <td>${employee.bestScore || 0} / 400</td>
            <td>${employee.attempts || 0}</td>
            <td>${employee.completionTime || "Not completed"}</td>
            <td>${employee.lastAttempt || "—"}</td>
            <td>${employee.risk || 0}%</td>
            <td>${employee.completed ? "COMPLETED" : "INCOMPLETE"}</td>

    
            `;


            table.appendChild(row);

        });

    }


    function escapeHTML(text) {

        const div =
            document.createElement("div");


        div.textContent =
            String(text);


        return div.innerHTML;

    }


    /* =====================================================
       ADMIN LOGOUT
       ===================================================== */

    const adminLogoutButton =
        document.getElementById(
            "admin-logout-button"
        );


    if (adminLogoutButton) {

        adminLogoutButton.addEventListener(
            "click",
            function () {

                showScreen(
                    "login-screen"
                );

            }
        );

    }
/* =====================================================
   INTRODUCTION
   ===================================================== */

function startIntroduction() {

    // =========================================
    // START TRAINING TIMER
    // =========================================

    trainingStartTime =
        Date.now();

    trainingTimerActive =
        true;


    // =========================================
    // SHOW INTRODUCTION
    // =========================================

    showScreen(
        "intro-screen"
    );


    // =========================================
    // SET WORKER IMAGE
    // =========================================

    const worker =
        document.getElementById(
            "worker-image"
        );


    if (
        worker &&
        currentEmployee
    ) {

        worker.src =
            currentEmployee.gender === "female"
                ? workerImages.female
                : workerImages.male;

    }


    // =========================================
    // SET INTRO TITLE
    // =========================================

    const introTitle =
        document.getElementById(
            "intro-title"
        );


    const introText =
        document.getElementById(
            "intro-text"
        );


    if (
        introTitle &&
        currentEmployee
    ) {

        introTitle.textContent =
            "Hello, my name is " +
            currentEmployee.name +
            ".";

    }


    // =========================================
    // INTRODUCTION TEXT
    // =========================================

    if (introText) {

        introText.textContent =
            "Welcome to Hazard Zero. " +
            "Today you will complete a warehouse safety inspection. " +
            "Look around carefully and identify hazards before making unsafe decisions.";

    }


    // =========================================
    // LOAD INTRO PANORAMA
    // =========================================

    loadIntroPanorama();


    // =========================================
    // WARM THE CACHE FOR SCENE 1 WHILE THE
    // PLAYER IS STILL READING THE INTRO TEXT
    // (scene 0 is already being loaded above by
    // the intro viewer itself, so it's covered)
    // =========================================

    prefetchImage(
        warehouseImages[1]
    );

}
    /* =====================================================
       INTRO 360 VIEWER
       ===================================================== */

    function loadIntroPanorama() {

        const container =
            document.getElementById(
                "intro-panorama"
            );


        if (!container) {

            console.warn(
                "Intro panorama container not found."
            );

            return;

        }


        try {

            /* -------------------------------------------------
               BUG FIX: this used to check `if (intro)` — an
               undefined variable — so the destroy() call below
               always threw and was swallowed by the catch,
               meaning the previous intro viewer's WebGL context
               was never released. Now correctly checks
               `introViewer`.
               ------------------------------------------------- */

            if (introViewer) {

                introViewer.destroy();

            }

        } catch (error) {

            console.warn(
                "Intro viewer cleanup error:",
                error
            );

        }


        introViewer = null;

        container.innerHTML = "";


        if (
            typeof pannellum ===
            "undefined"
        ) {

            console.error(
                "Pannellum is not loaded."
            );

            return;

        }


        try {

            introViewer =
                pannellum.viewer(
                    "intro-panorama",
                    {

                        type:
                            "equirectangular",

                        panorama:
                            warehouseImages[0],

                        autoLoad:
                            true,

                        showControls:
                            true,

                        showFullscreenCtrl:
                            false,

                        showZoomCtrl:
                            true,

                        hfov:
                            100,

                        pitch:
                            0,

                        yaw:
                            0,

                        draggable:
                            true,

                        mouseZoom:
                            true,

                        keyboardZoom:
                            true

                    }
                );


            introViewer.on(
                "load",
                function () {

                    setTimeout(function () {

                        try {

                            if (introViewer) {

                                introViewer.resize();

                            }

                        } catch (error) {}

                    }, 100);

                }
            );

        } catch (error) {

            console.error(
                "Intro Pannellum error:",
                error
            );

        }
    }


    /* =====================================================
       BEGIN TRAINING
       ===================================================== */

    const beginTrainingButton =
        document.getElementById(
            "begin-training-button"
        );


    if (beginTrainingButton) {

        beginTrainingButton.addEventListener(
            "click",
            function () {

                try {

                    if (introViewer) {

                        introViewer.destroy();

                    }

                } catch (error) {}


                introViewer = null;


                resetTraining();

                updateHUD();

                showScreen(
                    "game-screen"
                );
                
                startTrainingTimer();


                setupGameControls();


                /* ---------------------------------------------
                   CHANGED: used to call
                   loadScene(warehouseImages[0]), which built a
                   brand-new single-scene viewer. Now builds the
                   ONE multi-scene viewer that will be reused for
                   the rest of this training run.
                   --------------------------------------------- */

                initGameViewer();

            }
        );

    }


    /* =====================================================
       SCENE ID HELPER
       Converts a scene index (0-9) into the id used inside
       the Pannellum multi-scene config below, e.g. "scene0".
       ===================================================== */

    function sceneId(index) {

        return "scene" + index;

    }


    /* =====================================================
       BUILD MULTI-SCENE CONFIG
       NOTE: scenes are NOT all marked preload:true here on
       purpose. Doing that makes Pannellum kick off all 10
       panorama downloads at once the moment the viewer is
       created, which fights the FIRST scene (the one the
       player is actually waiting on) for bandwidth and
       browser connection slots. Instead, only the very next
       scene is prefetched at a time — see prefetchImage()
       and its call inside onSceneReady() below.
       ===================================================== */

    function buildScenesConfig() {

        const scenes = {};

        warehouseImages.forEach(function (path, index) {

            scenes[sceneId(index)] = {

                type: "equirectangular",

                panorama: path

            };

        });

        return scenes;

    }


    /* =====================================================
       PREFETCH NEXT SCENE
       Warms the browser's HTTP cache for one image at a time
       by requesting it in the background. Called from
       onSceneReady() for (currentScene + 1), so by the time a
       player finishes reading/answering the current scene and
       clicks "next", the next panorama is usually already
       sitting in cache and Pannellum's loadScene() has almost
       nothing left to fetch.
       ===================================================== */

    const prefetchedImages = {};

    function prefetchImage(path) {

        if (!path || prefetchedImages[path]) {

            return;

        }

        prefetchedImages[path] = true;

        const image = new Image();

        image.src = path;

    }


    /* =====================================================
       INITIALISE GAME VIEWER
       Called once per training run (from the "Begin Training"
       click). Builds ONE Pannellum instance covering every
       scene, so moving between scenes never tears down and
       rebuilds the whole WebGL canvas — it just swaps which
       scene is active on the same canvas.
       ===================================================== */

    function initGameViewer() {

        const panorama =
            document.getElementById(
                "panorama"
            );


        if (!panorama) {

            console.error(
                "#panorama was not found."
            );

            return;

        }


        panorama.style.opacity =
            "1";


        // Defensive cleanup in case a previous run's viewer
        // wasn't destroyed cleanly.

        try {

            if (viewer) {

                viewer.destroy();

            }

        } catch (error) {

            console.warn(
                "Viewer cleanup error:",
                error
            );

        }


        viewer = null;


        if (
            typeof pannellum ===
            "undefined"
        ) {

            console.error(
                "Pannellum library is not loaded."
            );

            return;

        }


        try {

            viewer =
                pannellum.viewer(
                    "panorama",
                    {

                        default: {

                            firstScene:
                                sceneId(0),

                            sceneFadeDuration:
                                200,

                            autoLoad:
                                true,

                            showControls:
                                true,

                            showFullscreenCtrl:
                                false,

                            showZoomCtrl:
                                true,

                            compass:
                                false,

                            hfov:
                                100,

                            pitch:
                                0,

                            yaw:
                                0,

                            minHfov:
                                50,

                            maxHfov:
                                120,

                            draggable:
                                true,

                            mouseZoom:
                                true,

                            doubleClickZoom:
                                false,

                            keyboardZoom:
                                true,

                            friction:
                                0.15

                        },

                        scenes:
                            buildScenesConfig()

                    }
                );


            // Fires once, when the very first scene finishes loading.

            viewer.on(
                "load",
                function () {

                    onSceneReady(
                        sceneId(currentScene)
                    );

                }
            );


            // Fires every time a later scene is switched to.

            viewer.on(
                "scenechange",
                function (id) {

                    onSceneReady(id);

                }
            );


            viewer.on(
                "error",
                function (error) {

                    console.error(
                        "Pannellum loading error:",
                        error
                    );

                    panorama.style.opacity =
                        "1";

                }
            );

        } catch (error) {

            console.error(
                "Pannellum creation error:",
                error
            );

            panorama.style.opacity =
                "1";

        }
    }


    /* =====================================================
       SCENE READY
       Shared handler for both the first scene ("load" event)
       and every scene switch after it ("scenechange" event).
       Anything that used to live inside the old loadScene()'s
       "load" callback — hiding panels, resizing, updating the
       HUD, adding the right hazard for the current scene —
       lives here now.
       ===================================================== */

    function onSceneReady(id) {

        console.log(
            "Scene ready:",
            id,
            "index:",
            currentScene
        );


        hazardDecisionMade = false;

        currentHazard = null;


        hideHazardPanel();

        hideResultPanel();


        const panorama =
            document.getElementById(
                "panorama"
            );


        if (panorama) {

            panorama.style.opacity =
                "1";

        }


        setTimeout(function () {

            resizeViewer();

        }, 100);


        updateHUD();


        if (currentScene === 2) {

            addOilHazard();

        }

        if (currentScene === 3) {

            addBoxHazard();

        }

        if (currentScene === 4) {

            addElectricalHazard();

        }

        if (currentScene === 5) {

            addCableHazard();

        }

        if (currentScene === 6) {

            addChemicalHazard();

        }

        if (currentScene === 7) {

            addFireHazard();

        }

        if (currentScene === 8) {

            addEmergencyHazard();

        }

        if (currentScene === 9) {

            addShelfHazard();

        }


        // Start fetching the NEXT scene's image now, while the
        // player is still looking at/answering this one.

        prefetchImage(
            warehouseImages[currentScene + 1]
        );

    }


    /* =====================================================
       LOAD SCENE
       Switches the ALREADY-RUNNING viewer to a new scene by
       index. No destroy, no recreate — just a scene swap on
       the same WebGL canvas, using a panorama that was already
       preloading in the background while the player was on the
       previous scene.
       ===================================================== */

    function loadScene(sceneIndex) {

        if (!viewer) {

            console.error(
                "Game viewer is not initialised yet — call initGameViewer() first."
            );

            return;

        }


        console.log(
            "Switching to scene:",
            sceneIndex + 1
        );


        hazardDecisionMade = false;

        currentHazard = null;


        hideHazardPanel();

        hideResultPanel();


        try {

            viewer.loadScene(
                sceneId(sceneIndex)
            );

        } catch (error) {

            console.error(
                "Scene switch error:",
                error
            );

        }

    }
    /* =====================================================
   5 MINUTE TRAINING TIMER
   ===================================================== */

let trainingTime = 5 * 60; // 5 minutes = 300 seconds

let trainingTimer = null;

let oneMinuteWarningShown = false;

let thirtySecondWarningShown = false;


/* =====================================================
   START TRAINING TIMER
   ===================================================== */

function startTrainingTimer() {

    // Stop any existing timer first
    stopTrainingTimer();


    // Reset timer
    trainingTime = 5 * 60;

    oneMinuteWarningShown = false;

    thirtySecondWarningShown = false;


    updateTimerDisplay();


    trainingTimer = setInterval(
        function () {

            trainingTime--;

            updateTimerDisplay();


            // =========================================
            // 1 MINUTE WARNING
            // =========================================

            if (
                trainingTime === 60 &&
                !oneMinuteWarningShown
            ) {

                oneMinuteWarningShown = true;


                showTimerNotification(
                    "⚠️ TIME WARNING",
                    "You have only 1 minute remaining to complete your safety training."
                );

            }


            // =========================================
            // 30 SECOND WARNING
            // =========================================

            if (
                trainingTime === 30 &&
                !thirtySecondWarningShown
            ) {

                thirtySecondWarningShown = true;


                showTimerNotification(
                    "🚨 URGENT",
                    "Only 30 seconds remaining! Complete the remaining hazards immediately."
                );

            }


            // =========================================
            // TIME'S UP
            // =========================================

            if (trainingTime <= 0) {

                trainingTime = 0;

                updateTimerDisplay();

                stopTrainingTimer();


                showTimerNotification(
                    "⏰ TIME'S UP!",
                    "You did not complete the training within the allocated time."
                );


                setTimeout(
                    function () {

                        finishTraining(false);

                    },
                    2000
                );

            }

        },
        1000
    );

}


/* =====================================================
   STOP TRAINING TIMER
   ===================================================== */

function stopTrainingTimer() {

    if (trainingTimer !== null) {

        clearInterval(
            trainingTimer
        );

        trainingTimer = null;

    }

}


/* =====================================================
   UPDATE TIMER DISPLAY
   ===================================================== */

function updateTimerDisplay() {

    const timerDisplay =
        document.getElementById(
            "timer-display"
        );


    if (!timerDisplay) {

        return;

    }


    const minutes =
        Math.floor(
            trainingTime / 60
        );


    const seconds =
        trainingTime % 60;


    timerDisplay.textContent =
        String(minutes).padStart(2, "0") +
        ":" +
        String(seconds).padStart(2, "0");


    // =========================================
    // CHANGE TIMER STATE
    // =========================================

    if (trainingTime <= 60) {

        timerDisplay.classList.add(
            "timer-danger"
        );

        timerDisplay.classList.remove(
            "timer-warning"
        );

    }

    else if (trainingTime <= 120) {

        timerDisplay.classList.add(
            "timer-warning"
        );

        timerDisplay.classList.remove(
            "timer-danger"
        );

    }

    else {

        timerDisplay.classList.remove(
            "timer-warning"
        );

        timerDisplay.classList.remove(
            "timer-danger"
        );

    }

}


/* =====================================================
   TIMER NOTIFICATION
   ===================================================== */

function showTimerNotification(
    title,
    message
) {

    // Remove previous timer notification
    const oldNotification =
        document.getElementById(
            "timer-notification"
        );


    if (oldNotification) {

        oldNotification.remove();

    }


    const notification =
        document.createElement(
            "div"
        );


    notification.id =
        "timer-notification";


    notification.innerHTML =

        "<strong>" +
        title +
        "</strong>" +

        "<span>" +
        message +
        "</span>";


    document.body.appendChild(
        notification
    );


    setTimeout(
        function () {

            if (notification) {

                notification.classList.add(
                    "hide"
                );


                setTimeout(
                    function () {

                        if (notification.parentNode) {

                            notification.remove();

                        }

                    },
                    400
                );

            }

        },
        5000
    );

}


    /* =====================================================
       RESIZE VIEWER
       ===================================================== */

    function resizeViewer() {

        if (!viewer) {

            return;

        }


        try {

            viewer.resize();

        } catch (error) {

            console.warn(
                "Viewer resize failed:",
                error
            );

        }
    }


    /* =====================================================
       SCENE NAVIGATION
       ===================================================== */

    function moveToNextScene() {

        const now =
            Date.now();


        if (
            now - lastSceneChange <
            800
        ) {

            return;

        }


        const hazardPanel =
            document.getElementById(
                "hazard-panel"
            );


        const resultPanel =
            document.getElementById(
                "result-panel"
            );


        if (
            hazardPanel &&
            !hazardPanel.classList.contains("hidden")
        ) {

            return;

        }


        if (
            resultPanel &&
            !resultPanel.classList.contains("hidden")
        ) {

            return;

        }


        lastSceneChange =
            now;


        if (currentScene < 9) {

            currentScene++;

            /* -------------------------------------------------
               CHANGED: used to be
               loadScene(warehouseImages[currentScene]) — an
               image path. loadScene() now takes the scene
               INDEX and switches the existing viewer to it.
               ------------------------------------------------- */

            loadScene(
                currentScene
            );

            return;

        }


        finishTraining();

    }


    /* =====================================================
       DOUBLE CLICK TO MOVE
       ===================================================== */

    const gameScreen =
        document.getElementById(
            "game-screen"
        );


    if (gameScreen) {

        gameScreen.addEventListener(
            "dblclick",
            function (event) {

                if (
                    event.target.closest("button") ||
                    event.target.closest(".pnlm-hotspot") ||
                    event.target.closest(".hazard-panel") ||
                    event.target.closest(".result-panel") ||
                    event.target.closest("#custom-fullscreen-button") ||
                    event.target.closest("#custom-exit-training")
                ) {

                    return;

                }


                moveToNextScene();

            }
        );

    }


    /* =====================================================
       NEXT BUTTON
       ===================================================== */

    const nextButton =
        document.getElementById(
            "next-scene-button"
        );


    if (nextButton) {

        nextButton.addEventListener(
            "click",
            function (event) {

                event.preventDefault();

                event.stopPropagation();

                moveToNextScene();

            }
        );

    }


    /* =====================================================
       HUD
       ===================================================== */

    function updateHUD() {

        const scoreDisplay =
            document.getElementById(
                "score-display"
            );


        const riskDisplay =
            document.getElementById(
                "risk-display"
            );


        const sceneDisplay =
            document.getElementById(
                "scene-display"
            );


        const wrongDisplay =
            document.getElementById(
                "wrong-display"
            );


        if (scoreDisplay) {

            scoreDisplay.textContent =
                score;

        }


        if (riskDisplay) {

            riskDisplay.textContent =
                riskFactor + "%";

        }


        if (sceneDisplay) {

            sceneDisplay.textContent =
                "SCENE " +
                (currentScene + 1);

        }


        if (wrongDisplay) {

            wrongDisplay.textContent =
                wrongDecisions +
                " / " +
                MAX_WRONG_DECISIONS;

        }


        const hud =
            document.querySelector(
                ".game-hud"
            );


        if (hud) {

            hud.style.display =
                "flex";

            hud.style.visibility =
                "visible";

            hud.style.opacity =
                "1";

            hud.style.zIndex =
                "999990";

        }

    }


    /* =====================================================
       HAZARD POSITIONS
       ===================================================== */

    const OIL_PITCH = -18;
    const OIL_YAW = 90;

    const BOX_PITCH = -5;
    const BOX_YAW = 118;

    const ELECTRICAL_PITCH = -5;
    const ELECTRICAL_YAW = 105;

    const CABLE_PITCH = -6;
    const CABLE_YAW = 35;

    const CHEMICAL_PITCH = -55;
    const CHEMICAL_YAW = 102;

    const FIRE_PITCH = -8;
    const FIRE_YAW = 75;

    const EMERGENCY_PITCH = -8;
    const EMERGENCY_YAW = 75;

    const SHELF_PITCH = -8;
    const SHELF_YAW = 35;

/* =====================================================
   OIL HAZARD
   ===================================================== */

const OIL_LOCATIONS = [
    { pitch: -15.80, yaw: 97.05 },
    { pitch: -10.39, yaw: 70.62 },
    { pitch: -12.49, yaw: 122.15 },
    { pitch: -9.27, yaw: 98.51 },
    { pitch: -16.98, yaw: 79.92 },
    { pitch: -21.66, yaw: 126.44 },
    { pitch: -15.19, yaw: 61.69 },
    { pitch: -25.44, yaw: 93.58 }
];


function addOilHazard() {

    if (!viewer || currentScene !== 2) {
        return;
    }

    // Remove old oil hotspots
    OIL_LOCATIONS.forEach(function(location, index) {

        try {
            viewer.removeHotSpot("oil-hazard-" + index);
        } catch (error) {}

    });


    // Create invisible clickable areas
    OIL_LOCATIONS.forEach(function(location, index) {

        viewer.addHotSpot({

            id: "oil-hazard-" + index,

            pitch: location.pitch,

            yaw: location.yaw,

            cssClass: "invisible-hazard",

            clickHandlerFunc: function(event) {

                if (event) {

                    event.preventDefault();
                    event.stopPropagation();

                }

                openOilHazard();

            }

        });

    });

}

    function openOilHazard() {

        if (hazardDecisionMade) {

            return;

        }


        currentHazard =
            "oil";


        const panel =
            document.getElementById(
                "hazard-panel"
            );


        if (!panel) {

            console.error(
                "Hazard panel not found."
            );

            return;

        }


        panel.dataset.hazard =
            "oil";


        setPanelText(
            panel,
            "OIL SPILL",
            "There is oil spilled on the warehouse floor. What will you do?",
            "⚠ Oil can cause slips, falls and serious injuries."
        );


        setHazardButtons("oil");

        showHazardPanel();

    }
/* =====================================================
   BOX HAZARD
   ===================================================== */

const BOX_LOCATIONS = [
    { pitch: -39.60, yaw: 116.84 },
    { pitch: -23.68, yaw: 122.63 },
    { pitch: 0.70, yaw: 121.61 },
    { pitch: -9.45, yaw: 121.30 },
    { pitch: 12.84, yaw: 121.10 },
    { pitch: 12.84, yaw: 121.10 }
];


function addBoxHazard() {

    if (
        !viewer ||
        currentScene !== 3
    ) {
        return;
    }


    // Remove existing box hotspots

    BOX_LOCATIONS.forEach(
        function (location, index) {

            try {

                viewer.removeHotSpot(
                    "box-hazard-" + index
                );

            } catch (error) {}

        }
    );


    // Create invisible clickable zones

    BOX_LOCATIONS.forEach(
        function (location, index) {

            viewer.addHotSpot({

                id:
                    "box-hazard-" + index,

                pitch:
                    location.pitch,

                yaw:
                    location.yaw,

                cssClass:
                    "invisible-hazard",

                clickHandlerFunc:
                    function (event) {

                        if (event) {

                            event.preventDefault();
                            event.stopPropagation();

                        }

                        openBoxHazard();

                    }

            });

        }
    );

}
    function openBoxHazard() {

        if (hazardDecisionMade) {

            return;

        }


        currentHazard =
            "box";


        const panel =
            document.getElementById(
                "hazard-panel"
            );


        if (!panel) {

            console.error(
                "Hazard panel not found."
            );

            return;

        }


        panel.dataset.hazard =
            "box";


        setPanelText(
            panel,
            "UNSTABLE BOXES",
            "There are boxes stacked unsafely. What will you do?",
            "⚠ Falling boxes can cause impact and crushing injuries."
        );


        setHazardButtons("box");

        showHazardPanel();

    }
/* =====================================================
   ELECTRICAL HAZARD
   ===================================================== */

const ELECTRICAL_LOCATIONS = [
    { pitch: 12.51, yaw: 99.71 },
    { pitch: 33.29, yaw: 103.68 },
    { pitch: 28.42, yaw: 95.65 },
    { pitch: 12.62, yaw: 96.33 },
    { pitch: -5.72, yaw: 111.81 },
    { pitch: 18.81, yaw: 101.60 },
    { pitch: 26.42, yaw: 101.33 },
    { pitch: -0.72, yaw: 99.49 }
];


function addElectricalHazard() {

    if (
        !viewer ||
        currentScene !== 4
    ) {
        return;
    }


    // Remove old electrical hotspots

    ELECTRICAL_LOCATIONS.forEach(
        function (location, index) {

            try {

                viewer.removeHotSpot(
                    "electrical-hazard-" + index
                );

            } catch (error) {}

        }
    );


    // Create invisible clickable areas

    ELECTRICAL_LOCATIONS.forEach(
        function (location, index) {

            viewer.addHotSpot({

                id:
                    "electrical-hazard-" + index,

                pitch:
                    location.pitch,

                yaw:
                    location.yaw,

                cssClass:
                    "invisible-hazard",

                clickHandlerFunc:
                    function (event) {

                        if (event) {

                            event.preventDefault();
                            event.stopPropagation();

                        }

                        openElectricalHazard();

                    }

            });

        }
    );

}
    function openElectricalHazard() {

        if (hazardDecisionMade) {

            return;

        }


        currentHazard =
            "electrical";


        const panel =
            document.getElementById(
                "hazard-panel"
            );


        if (!panel) {

            console.error(
                "Hazard panel not found."
            );

            return;

        }


        panel.dataset.hazard =
            "electrical";


        setPanelText(
            panel,
            "⚡ ELECTRICAL HAZARD",
            "You notice an electrical panel producing sparks and smoke. What should you do?",
            "⚠ Electrical faults can cause electric shock, burns and fire."
        );


        setHazardButtons("electrical");

        showHazardPanel();

    }
/* =====================================================
   CABLE HAZARD
   ===================================================== */

const CABLE_LOCATIONS = [
    { pitch: -18.48, yaw: -85.24 },
    { pitch: -28.38, yaw: -32.72 },
    { pitch: -38.45, yaw: -19.42 },
    { pitch: -34.72, yaw: -44.91 },
    { pitch: -53.74, yaw: -22.65 },
    { pitch: -29.81, yaw: 13.69 },
    { pitch: -22.69, yaw: 25.27 },
    { pitch: -21.69, yaw: 72.35 },
    { pitch: -17.47, yaw: 79.58 }
];


function addCableHazard() {

    if (
        !viewer ||
        currentScene !== 5
    ) {

        return;

    }


    // Remove existing cable hotspots

    CABLE_LOCATIONS.forEach(
        function (location, index) {

            try {

                viewer.removeHotSpot(
                    "cable-hazard-" + index
                );

            } catch (error) {}

        }
    );


    // Create invisible clickable areas

    CABLE_LOCATIONS.forEach(
        function (location, index) {

            viewer.addHotSpot({

                id:
                    "cable-hazard-" + index,

                pitch:
                    location.pitch,

                yaw:
                    location.yaw,

                cssClass:
                    "invisible-hazard",

                clickHandlerFunc:
                    function (event) {

                        if (event) {

                            event.preventDefault();
                            event.stopPropagation();

                        }

                        openCableHazard();

                    }

            });

        }
    );

}
    function openCableHazard() {

        if (hazardDecisionMade) {

            return;

        }


        currentHazard =
            "cable";


        const panel =
            document.getElementById(
                "hazard-panel"
            );


        if (!panel) {

            console.error(
                "Hazard panel not found."
            );

            return;

        }


        panel.dataset.hazard =
            "cable";


        setPanelText(
            panel,
            "CABLE TRIP HAZARD",
            "A cable has been poorly managed and is lying across the walkway. What will you do?",
            "⚠ Poorly managed cables can cause trips, falls and serious injuries."
        );


        setHazardButtons("cable");

        showHazardPanel();

    }


    /* =====================================================
       SET PANEL TEXT
       ===================================================== */

    function setPanelText(
        panel,
        titleText,
        descriptionText,
        warningText
    ) {

        const title =
            panel.querySelector(
                ".hazard-title"
            );


        const description =
            panel.querySelector(
                ".hazard-description"
            );


        const warning =
            panel.querySelector(
                ".hazard-warning"
            );


        if (title) {

            title.textContent =
                titleText;

        }


        if (description) {

            description.textContent =
                descriptionText;

        }


        if (warning) {

            warning.textContent =
                warningText;

        }

    }


    /* =====================================================
       HAZARD BUTTON TEXT
       ===================================================== */

    function setHazardButtons(hazard) {

        const safeButton =
            document.getElementById(
                "safe-choice"
            );


        const unsafeButton =
            document.getElementById(
                "unsafe-choice"
            );


        if (
            !safeButton ||
            !unsafeButton
        ) {

            console.error(
                "Hazard answer buttons not found."
            );

            return;

        }


        if (hazard === "oil") {

            safeButton.textContent =
                "A — Call someone for help and have the oil cleaned.";

            unsafeButton.textContent =
                "B — Ignore the oil and continue working.";

        }


        else if (hazard === "box") {

            safeButton.textContent =
                "A — Keep away, warn others and report the unstable boxes.";

            unsafeButton.textContent =
                "B — Ignore the unstable boxes and continue working underneath them.";

        }


        else if (hazard === "electrical") {

            safeButton.textContent =
                "A — Keep away, warn others and report the electrical hazard immediately.";

            unsafeButton.textContent =
                "B — Go closer and try to fix or switch off the electrical equipment yourself.";

        }


        else if (hazard === "cable") {

            safeButton.textContent =
                "A — Keep the area clear and report the poorly managed cable.";

            unsafeButton.textContent =
                "B — Step over the cable and continue working.";

        }
        else if (hazard === "chemical") {

            safeButton.textContent =
                    "A — Keep away, warn others and report the chemical spill immediately.";

            unsafeButton.textContent =
                    "B — Go closer and try to clean up the chemical spill yourself.";
            }
        else if (hazard === "fire") {
           
            safeButton.textContent =
                 "A — Tell the person to stop smoking, keep away from the gasoline and report the fire hazard.";

                 unsafeButton.textContent =
                    "B — Ignore the smoking and continue working near the gasoline.";
            }
        else if (hazard === "emergency") {

            safeButton.textContent =
             "A — Keep the exit clear and report the blocked emergency exit.";

             unsafeButton.textContent =
                "B — Ignore the blocked exit and continue working.";
            }
        else if (hazard === "shelf") {

            safeButton.textContent =
             "A — Stay clear, warn others and report the overloaded shelf.";
            unsafeButton.textContent =
            "B — Ignore the overloaded shelf and continue working nearby.";
            }


        makeButtonsNeutral(
            safeButton,
            unsafeButton
        );

    }


    /* =====================================================
       NEUTRAL BUTTON STYLE
       ===================================================== */

    function makeButtonsNeutral(
        safeButton,
        unsafeButton
    ) {

        const buttons = [
            safeButton,
            unsafeButton
        ];


        buttons.forEach(function (button) {

            if (!button) {

                return;

            }


            button.classList.remove(
                "correct",
                "wrong",
                "safe",
                "unsafe",
                "correct-answer",
                "wrong-answer",
                "selected",
                "success",
                "danger"
            );


            button.style.background =
                "rgba(35,35,35,0.95)";


            button.style.backgroundColor =
                "rgba(35,35,35,0.95)";


            button.style.color =
                "#ffffff";


            button.style.border =
                "1px solid rgba(255,255,255,0.25)";


            button.style.boxShadow =
                "none";


            button.style.transform =
                "none";


            button.style.cursor =
                "pointer";


            button.style.pointerEvents =
                "auto";


            button.style.opacity =
                "1";


            button.style.visibility =
                "visible";

        });

    }


    /* =====================================================
       SHOW HAZARD PANEL
       ===================================================== */

    function showHazardPanel() {

        const panel =
            document.getElementById(
                "hazard-panel"
            );


        if (!panel) {

            return;

        }


        hideResultPanel();


        panel.classList.remove(
            "hidden"
        );


        panel.style.display =
            "block";


        panel.style.visibility =
            "visible";


        panel.style.opacity =
            "1";


        panel.style.pointerEvents =
            "auto";


        panel.style.zIndex =
            "999995";

    }


    /* =====================================================
       HIDE HAZARD PANEL
       ===================================================== */

    function hideHazardPanel() {

        const panel =
            document.getElementById(
                "hazard-panel"
            );


        if (!panel) {

            return;

        }


        panel.classList.add(
            "hidden"
        );


        panel.style.display =
            "none";


        panel.style.visibility =
            "hidden";


        panel.style.pointerEvents =
            "none";

    }


    /* =====================================================
       SAFE ANSWER BUTTON
       ===================================================== */

    const safeButton =
        document.getElementById(
            "safe-choice"
        );


    if (safeButton) {

        safeButton.addEventListener(
            "click",
            function (event) {

                event.preventDefault();
                event.stopPropagation();

                makeHazardDecision("safe");

            }
        );

    }


    /* =====================================================
       UNSAFE ANSWER BUTTON
       ===================================================== */

    const unsafeButton =
        document.getElementById(
            "unsafe-choice"
        );


    if (unsafeButton) {

        unsafeButton.addEventListener(
            "click",
            function (event) {

                event.preventDefault();
                event.stopPropagation();

                makeHazardDecision("unsafe");

            }
        );

    }


    /* =====================================================
       HAZARD DECISION
       ===================================================== */

    function makeHazardDecision(decision) {

        if (hazardDecisionMade) {

            return;

        }


        if (!currentHazard) {

            console.error(
                "No current hazard selected."
            );

            return;

        }


        hazardDecisionMade =
            true;


        const hazardType =
            currentHazard;


        console.log(
            "Decision:",
            decision,
            "Hazard:",
            hazardType
        );


        removeAllHazardHotspots();

        hideHazardPanel();


        /* =================================================
           SAFE
           ================================================= */

        if (decision === "safe") {

            score += 50;


            riskFactor =
                Math.max(
                    0,
                    riskFactor - 10
                );


            let message =
                "";


            if (hazardType === "oil") {

                message =
                    "Excellent! You identified the oil spill and called for help so the area could be cleaned safely.";

            }


            else if (hazardType === "box") {

                message =
                    "Excellent! You stayed away from the unstable boxes, warned others and reported the hazard.";

            }


            else if (hazardType === "electrical") {

                message =
                    "Excellent! You stayed away from the electrical hazard, warned others and reported it instead of attempting to handle dangerous equipment yourself.";

            }


            else if (hazardType === "cable") {

                message =
                    "Excellent! You recognised the cable as a trip hazard, kept the area clear and reported it.";

            }
           
            else if (hazardType === "chemical") {
            message =
                 "Excellent! You stayed away from the chemical spill, warned others and reported the hazard instead of attempting to clean it yourself.";

                }
            else if (hazardType === "fire") {
            message =
                "Excellent! You recognised the fire hazard, stopped the unsafe behaviour and reported the danger.";
            }
            else if (hazardType === "emergency") {
            message =
                 "Excellent! You recognised that the emergency exit was blocked and reported the obstruction so the escape route could be kept clear.";
                }
            else if (hazardType === "shelf") {
            message =
              "Excellent! You recognised the overloaded shelf, kept away from the danger and reported the storage hazard.";
            }
            


            showResult(
                true,
                "EXCELLENT DECISION",
                message,
                "+50 POINTS"
            );

        }


        /* =================================================
           UNSAFE
           ================================================= */

        else {

            wrongDecisions++;


            score =
                Math.max(
                    0,
                    score - 30
                );


            riskFactor =
                Math.min(
                    100,
                    riskFactor + 50
                );


            let message =
                "";


            if (hazardType === "oil") {

                message =
                    "Ignoring the oil spill creates a serious slip-and-fall hazard.";

            }


            else if (hazardType === "box") {

                message =
                    "Ignoring unstable boxes can expose you to falling-object and crushing injuries.";

            }


            else if (hazardType === "electrical") {

                message =
                    "Trying to touch or repair sparking electrical equipment could cause electric shock, severe burns or fire.";

            }


            else if (hazardType === "cable") {

                message =
                    "Stepping over a poorly managed cable can cause you to trip, fall and suffer serious injuries.";

            }
            else if (hazardType === "chemical") {
               message =
                     "Approaching or attempting to clean a chemical spill yourself could expose you to harmful chemicals, burns, poisoning or dangerous fumes.";
                }
            else if (hazardType === "fire") {
                message =
                     "Smoking near gasoline can ignite flammable vapours and cause a serious fire, explosion or severe burns.";
                }
            else if (hazardType === "emergency") {
               message =
                   "Ignoring a blocked emergency exit could prevent people from escaping quickly and safely during an emergency.";
                }
            else if (hazardType === "shelf") {
            message =
                 "Ignoring an overloaded shelf could allow items to fall and cause serious impact or crushing injuries.";
            }

            updateHUD();

            saveProgress();


            /* =============================================
               THIRD WRONG ANSWER
               ============================================= */

            if (
                wrongDecisions >=
                MAX_WRONG_DECISIONS
            ) {

                showOutNotification();

                return;

            }


            /* =============================================
               NORMAL WRONG ANSWER
               ============================================= */

            showResult(
                false,
                "UNSAFE DECISION",
                message,
                "-30 POINTS"
            );

        }


        updateHUD();

        saveProgress();

    }
 /* =====================================================
   CHEMICAL SPILL HAZARD
   ===================================================== */

const CHEMICAL_LOCATIONS = [
    { pitch: -31.99, yaw: 33.47 },
    { pitch: -62.99, yaw: 62.50 },
    { pitch: -29.88, yaw: 101.44 },
    { pitch: -30.73, yaw: 39.27 },
    { pitch: -52.67, yaw: 41.46 },
    { pitch: -40.31, yaw: 46.37 },
    { pitch: -39.89, yaw: 74.92 },
    { pitch: 35.97, yaw: 99.19 }
];


function addChemicalHazard() {

    if (
        !viewer ||
        currentScene !== 6
    ) {

        return;

    }


    // Remove existing chemical hotspots

    CHEMICAL_LOCATIONS.forEach(
        function (location, index) {

            try {

                viewer.removeHotSpot(
                    "chemical-hazard-" + index
                );

            } catch (error) {}

        }
    );


    // Create invisible clickable areas

    CHEMICAL_LOCATIONS.forEach(
        function (location, index) {

            viewer.addHotSpot({

                id:
                    "chemical-hazard-" + index,

                pitch:
                    location.pitch,

                yaw:
                    location.yaw,

                cssClass:
                    "invisible-hazard",

                clickHandlerFunc:
                    function (event) {

                        if (event) {

                            event.preventDefault();
                            event.stopPropagation();

                        }

                        openChemicalHazard();

                    }

            });

        }
    );

}
function openChemicalHazard() {

    if (hazardDecisionMade) {

        return;

    }


    currentHazard =
        "chemical";


    const panel =
        document.getElementById(
            "hazard-panel"
        );


    if (!panel) {

        console.error(
            "Hazard panel not found."
        );

        return;

    }


    panel.dataset.hazard =
        "chemical";


    setPanelText(
        panel,
        "CHEMICAL SPILL",
        "A chemical is leaking from a large drum and has spilled onto the warehouse floor. What will you do?",
        "⚠ Chemical spills can cause burns, poisoning, harmful fumes and other serious injuries."
    );


    setHazardButtons("chemical");

    showHazardPanel();

}
/* =====================================================
   FIRE HAZARD
   ===================================================== */

const FIRE_LOCATIONS = [
    { pitch: 10.92, yaw: 54.75 },
    { pitch: 17.20, yaw: 56.99 },
    { pitch: -9.84, yaw: 61.19 }
];


function addFireHazard() {

    if (
        !viewer ||
        currentScene !== 7
    ) {

        return;

    }


    // Remove existing fire hotspots

    FIRE_LOCATIONS.forEach(
        function (location, index) {

            try {

                viewer.removeHotSpot(
                    "fire-hazard-" + index
                );

            } catch (error) {}

        }
    );


    // Create invisible clickable areas

    FIRE_LOCATIONS.forEach(
        function (location, index) {

            viewer.addHotSpot({

                id:
                    "fire-hazard-" + index,

                pitch:
                    location.pitch,

                yaw:
                    location.yaw,

                cssClass:
                    "invisible-hazard",

                clickHandlerFunc:
                    function (event) {

                        if (event) {

                            event.preventDefault();
                            event.stopPropagation();

                        }

                        openFireHazard();

                    }

            });

        }
    );

}
function openFireHazard() {

    if (hazardDecisionMade) {

        return;

    }


    currentHazard =
        "fire";


    const panel =
        document.getElementById(
            "hazard-panel"
        );


    if (!panel) {

        console.error(
            "Hazard panel not found."
        );

        return;

    }


    panel.dataset.hazard =
        "fire";


    setPanelText(
        panel,
        "🔥 FIRE HAZARD",
        "A person is smoking near flammable gasoline. What will you do?",
        "⚠ Smoking near gasoline can ignite flammable vapours and cause a serious fire or explosion."
    );


    setHazardButtons("fire");

    showHazardPanel();

}
/* =====================================================
   EMERGENCY EXIT HAZARD
   ===================================================== */

const EMERGENCY_LOCATIONS = [
    { pitch: -43.87, yaw: 66.51 },
    { pitch: -44.57, yaw: 30.13 },
    { pitch: -27.48, yaw: 33.54 },
    { pitch: -10.69, yaw: 32.80 },
    { pitch: 5.87,   yaw: 59.40 },
    { pitch: -13.12, yaw: 55.91 },
    { pitch: -0.54,  yaw: 41.08 },
    { pitch: 19.51,  yaw: 49.95 }
];


function addEmergencyHazard() {

    if (
        !viewer ||
        currentScene !== 8
    ) {

        return;

    }


    // Remove existing emergency hotspots

    EMERGENCY_LOCATIONS.forEach(
        function (location, index) {

            try {

                viewer.removeHotSpot(
                    "emergency-hazard-" + index
                );

            } catch (error) {}

        }
    );


    // Create invisible clickable areas

    EMERGENCY_LOCATIONS.forEach(
        function (location, index) {

            viewer.addHotSpot({

                id:
                    "emergency-hazard-" + index,

                pitch:
                    location.pitch,

                yaw:
                    location.yaw,

                cssClass:
                    "invisible-hazard",

                clickHandlerFunc:
                    function (event) {

                        if (event) {

                            event.preventDefault();
                            event.stopPropagation();

                        }

                        openEmergencyHazard();

                    }

            });

        }
    );

}
function openEmergencyHazard() {

    if (hazardDecisionMade) {

        return;

    }


    currentHazard =
        "emergency";


    const panel =
        document.getElementById(
            "hazard-panel"
        );


    if (!panel) {

        console.error(
            "Hazard panel not found."
        );

        return;

    }


    panel.dataset.hazard =
        "emergency";


    setPanelText(
        panel,
        "🚪 BLOCKED EMERGENCY EXIT",
        "The emergency exit is blocked by boxes and other materials. What will you do?",
        "⚠ Blocked emergency exits can prevent people from escaping safely during a fire or other emergency."
    );


    setHazardButtons("emergency");

    showHazardPanel();

}
/* =====================================================
   OVERLOADED SHELF HAZARD
   ===================================================== */

const SHELF_LOCATIONS = [
    { pitch: 31.69,  yaw: 16.31 },
    { pitch: -23.39, yaw: 15.25 },
    { pitch: -11.07, yaw: 23.65 },
    { pitch: 25.05,  yaw: 5.13 },
    { pitch: -26.76, yaw: 23.32 }
];


function addShelfHazard() {

    if (
        !viewer ||
        currentScene !== 9
    ) {

        return;

    }


    // Remove existing shelf hotspots

    SHELF_LOCATIONS.forEach(
        function (location, index) {

            try {

                viewer.removeHotSpot(
                    "shelf-hazard-" + index
                );

            } catch (error) {}

        }
    );


    // Create invisible clickable areas

    SHELF_LOCATIONS.forEach(
        function (location, index) {

            viewer.addHotSpot({

                id:
                    "shelf-hazard-" + index,

                pitch:
                    location.pitch,

                yaw:
                    location.yaw,

                cssClass:
                    "invisible-hazard",

                clickHandlerFunc:
                    function (event) {

                        if (event) {

                            event.preventDefault();
                            event.stopPropagation();

                        }

                        openShelfHazard();

                    }

            });

        }
    );

}
function openShelfHazard() {

    if (hazardDecisionMade) {

        return;

    }


    currentHazard =
        "shelf";


    const panel =
        document.getElementById(
            "hazard-panel"
        );


    if (!panel) {

        console.error(
            "Hazard panel not found."
        );

        return;

    }


    panel.dataset.hazard =
        "shelf";


    setPanelText(
        panel,
        "⚠ OVERLOADED SHELF",
        "A storage shelf is overloaded and some items appear unstable. What will you do?",
        "⚠ Overloaded or unstable shelves can cause items to fall and seriously injure people nearby."
    );


    setHazardButtons("shelf");

    showHazardPanel();

}


    /* =====================================================
       REMOVE ALL HOTSPOTS
       ===================================================== */

    function removeAllHazardHotspots() {

        if (!viewer) {

            return;

        }


        const hotspots = [
            "oil-hazard",
            "box-hazard",
            "electrical-hazard",
            "cable-hazard",
            "chemical-hazard",
            "fire-hazard",
            "emergency-hazard",
            "shelf-hazard"

        ];


        hotspots.forEach(function (id) {

            try {

                viewer.removeHotSpot(id);

            } catch (error) {}

        });

    }


    /* =====================================================
       RESULT PANEL
       ===================================================== */

    function showResult(
        success,
        title,
        description,
        points
    ) {

        const panel =
            document.getElementById(
                "result-panel"
            );


        if (!panel) {

            console.error(
                "Result panel not found."
            );

            return;

        }


        const icon =
            document.getElementById(
                "result-icon"
            );


        const resultTitle =
            document.getElementById(
                "result-title"
            );


        const resultDescription =
            document.getElementById(
                "result-description"
            );


        const resultPoints =
            document.getElementById(
                "result-points"
            );


        if (icon) {

            icon.textContent =
                success
                    ? "✓"
                    : "!";

        }


        if (resultTitle) {

            resultTitle.textContent =
                title;

        }


        if (resultDescription) {

            resultDescription.textContent =
                description;

        }


        if (resultPoints) {

            resultPoints.textContent =
                points;

        }


        panel.classList.remove(
            "hidden"
        );


        panel.style.display =
            "block";


        panel.style.visibility =
            "visible";


        panel.style.opacity =
            "1";


        panel.style.pointerEvents =
            "auto";


        panel.style.zIndex =
            "999996";


        updateHUD();

    }


    /* =====================================================
       HIDE RESULT PANEL
       ===================================================== */

    function hideResultPanel() {

        const panel =
            document.getElementById(
                "result-panel"
            );


        if (!panel) {

            return;

        }


        panel.classList.add(
            "hidden"
        );


        panel.style.display =
            "none";


        panel.style.visibility =
            "hidden";


        panel.style.pointerEvents =
            "none";

    }


    /* =====================================================
       NORMAL RESULT CONTINUE
       ===================================================== */

    const resultContinue =
        document.getElementById(
            "result-continue"
        );


    if (resultContinue) {

        resultContinue.addEventListener(
            "click",
            function (event) {

                event.preventDefault();
                event.stopPropagation();


                hideResultPanel();


                if (
                    wrongDecisions >=
                    MAX_WRONG_DECISIONS
                ) {

                    finishTraining(false);

                    return;

                }


                moveToNextScene();

            }
        );

    }


    /* =====================================================
       BIG "YOU ARE OUT" NOTIFICATION
       ===================================================== */

    function showOutNotification() {

        removeGameNotification();


        const overlay =
            document.createElement("div");


        overlay.id =
            "hazard-zero-notification";


        overlay.innerHTML = `

            <div class="hz-notification-box">

                <div class="hz-notification-icon">
                    !
                </div>

                <h1>
                    YOU'RE OUT
                </h1>

                <h2>
                    TRAINING FAILED
                </h2>

                <p>
                    You made 3 unsafe decisions.
                </p>

                <p class="hz-small-text">
                    You have reached the maximum number
                    of wrong decisions allowed.
                    Your safety training session has ended.
                </p>

                <div class="hz-stats">

                    <div>
                        <strong>${score}</strong>
                        <span>FINAL SCORE</span>
                    </div>

                    <div>
                        <strong>${riskFactor}%</strong>
                        <span>RISK LEVEL</span>
                    </div>

                    <div>
                        <strong>${wrongDecisions}/3</strong>
                        <span>WRONG ANSWERS</span>
                    </div>

                </div>

                <button
                    id="hz-out-button"
                    type="button"
                >
                    EXIT TRAINING
                </button>

            </div>

        `;


        document.body.appendChild(
            overlay
        );


        addNotificationStyles();


        const button =
            document.getElementById(
                "hz-out-button"
            );


        if (button) {

            button.addEventListener(
                "click",
                function () {

                    removeGameNotification();

                    finishTraining(false);

                }
            );

        }

    }


    /* =====================================================
       CONGRATULATIONS NOTIFICATION
       ===================================================== */

    function showCongratulationsNotification() {

        removeGameNotification();


        const overlay =
            document.createElement("div");


        overlay.id =
            "hazard-zero-notification";


        overlay.innerHTML = `

            <div class="hz-notification-box hz-success">

                <div class="hz-notification-icon hz-success-icon">
                    ✓
                </div>

                <h1>
                    CONGRATULATIONS!
                </h1>

                <h2>
                    TRAINING COMPLETED
                </h2>

                <p>
                    Excellent work, ${escapeHTML(
                        currentEmployee
                            ? currentEmployee.name
                            : "Employee"
                    )}!
                </p>

                <p class="hz-small-text">
                    You successfully completed the
                    Hazard Zero warehouse safety training.
                </p>

                <div class="hz-stats">

                    <div>
                        <strong>${score}</strong>
                        <span>FINAL SCORE</span>
                    </div>

                    <div>
                        <strong>${riskFactor}%</strong>
                        <span>RISK LEVEL</span>
                    </div>

                    <div>
                        <strong>${wrongDecisions}/3</strong>
                        <span>WRONG ANSWERS</span>
                    </div>

                </div>

                <button
                    id="hz-success-button"
                    type="button"
                >
                    VIEW RESULTS
                </button>

            </div>

        `;


        document.body.appendChild(
            overlay
        );


        addNotificationStyles();


        const button =
            document.getElementById(
                "hz-success-button"
            );


        if (button) {

            button.addEventListener(
                "click",
                function () {

                    removeGameNotification();

                    finishTraining(true);

                }
            );

        }

    }


    /* =====================================================
       NOTIFICATION CSS
       ===================================================== */

    function addNotificationStyles() {

        if (
            document.getElementById(
                "hazard-zero-notification-style"
            )
        ) {

            return;

        }


        const style =
            document.createElement("style");


        style.id =
            "hazard-zero-notification-style";


        style.textContent = `

            #hazard-zero-notification {

                position: fixed;

                inset: 0;

                width: 100vw;

                height: 100vh;

                background:
                    rgba(0, 0, 0, 0.82);

                display: flex;

                align-items: center;

                justify-content: center;

                z-index: 999999999;

                font-family:
                    Arial,
                    Helvetica,
                    sans-serif;

                padding: 20px;

                box-sizing: border-box;

            }


            .hz-notification-box {

                width: min(620px, 94vw);

                background:
                    linear-gradient(
                        145deg,
                        #202020,
                        #0c0c0c
                    );

                border:
                    1px solid
                    rgba(255,255,255,0.2);

                border-radius: 20px;

                padding: 42px 35px;

                text-align: center;

                color: white;

                box-shadow:
                    0 25px 80px
                    rgba(0,0,0,0.8);

                animation:
                    hzPop 0.25s ease-out;

                box-sizing: border-box;

            }


            .hz-notification-icon {

                width: 78px;

                height: 78px;

                margin:
                    0 auto 18px auto;

                border-radius: 50%;

                display: flex;

                align-items: center;

                justify-content: center;

                background: #d92d20;

                color: white;

                font-size: 48px;

                font-weight: 900;

                border:
                    4px solid
                    rgba(255,255,255,0.9);

                box-shadow:
                    0 0 30px
                    rgba(217,45,32,0.65);

            }


            .hz-success-icon {

                background: #1f9d55;

                box-shadow:
                    0 0 30px
                    rgba(31,157,85,0.65);

            }


            .hz-notification-box h1 {

                margin:
                    0 0 8px 0;

                font-size: 38px;

                font-weight: 900;

                letter-spacing: 1px;

            }


            .hz-notification-box h2 {

                margin:
                    0 0 22px 0;

                font-size: 18px;

                color:
                    rgba(255,255,255,0.65);

                letter-spacing: 2px;

            }


            .hz-notification-box p {

                font-size: 19px;

                line-height: 1.5;

                margin:
                    8px 0;

            }


            .hz-small-text {

                color:
                    rgba(255,255,255,0.62);

                font-size: 15px !important;

            }


            .hz-stats {

                display: flex;

                gap: 12px;

                justify-content: center;

                margin:
                    28px 0;

                flex-wrap: wrap;

            }


            .hz-stats div {

                min-width: 120px;

                padding: 15px 12px;

                border:
                    1px solid
                    rgba(255,255,255,0.12);

                border-radius: 12px;

                background:
                    rgba(255,255,255,0.05);

            }


            .hz-stats strong {

                display: block;

                font-size: 25px;

                margin-bottom: 5px;

            }


            .hz-stats span {

                display: block;

                font-size: 10px;

                color:
                    rgba(255,255,255,0.5);

                letter-spacing: 1px;

            }


            #hz-out-button,
            #hz-success-button {

                width: 100%;

                padding: 15px 20px;

                border: none;

                border-radius: 10px;

                background: #ffffff;

                color: #111111;

                font-size: 15px;

                font-weight: 800;

                cursor: pointer;

                transition:
                    transform 0.15s ease,
                    opacity 0.15s ease;

            }


            #hz-out-button:hover,
            #hz-success-button:hover {

                transform:
                    translateY(-2px);

                opacity: 0.9;

            }


            @keyframes hzPop {

                from {

                    opacity: 0;

                    transform:
                        scale(0.92);

                }

                to {

                    opacity: 1;

                    transform:
                        scale(1);

                }

            }

        `;


        document.head.appendChild(
            style
        );

    }


    /* =====================================================
       REMOVE NOTIFICATION
       ===================================================== */

    function removeGameNotification() {

        const notification =
            document.getElementById(
                "hazard-zero-notification"
            );


        if (notification) {

            notification.remove();

        }

    }
/* =====================================================
   SAVE PROGRESS
   ===================================================== */

function saveProgress() {

    if (!currentEmployee) {

        return;

    }


    const employees =
        getEmployees();


    const index =
        employees.findIndex(
            function (employee) {

                return (
                    String(employee.id) ===
                    String(currentEmployee.id)
                );

            }
        );


    if (index === -1) {

        return;

    }


    // =========================================
    // SAVE CURRENT SCORE
    // =========================================

    employees[index].score =
        Number(score) || 0;


    // =========================================
    // SAVE BEST SCORE
    // =========================================

    employees[index].bestScore =
        Math.max(
            Number(employees[index].bestScore) || 0,
            Number(score) || 0
        );


    // =========================================
    // SAVE RISK
    // =========================================

    employees[index].risk =
        Number(riskFactor) || 0;


    // =========================================
    // SAVE WRONG DECISIONS
    // =========================================

    employees[index].wrongDecisions =
        Number(wrongDecisions) || 0;


    // =========================================
    // UPDATE CURRENT EMPLOYEE
    // =========================================

    currentEmployee =
        employees[index];


    // =========================================
    // SAVE
    // =========================================

    saveEmployees(
        employees
    );

}

/* =====================================================
   FINISH TRAINING
   ===================================================== */

function finishTraining(success) {

    console.log("TRAINING FINISHED");
    // =====================================================
// CALCULATE TRAINING COMPLETION TIME
// =====================================================

let completionTimeSeconds = 0;

if (trainingStartTime) {

    completionTimeSeconds =
        Math.floor(
            (Date.now() - trainingStartTime) / 1000
        );

}

const completionMinutes =
    Math.floor(
        completionTimeSeconds / 60
    );

const completionSeconds =
    completionTimeSeconds % 60;

const completionTimeText =
    completionMinutes +
    " min " +
    completionSeconds +
    " sec";

    // Stop the training timer
    stopTrainingTimer();


    // =========================================
    // DETERMINE SUCCESS
    // =========================================

    if (typeof success !== "boolean") {

        success =
            wrongDecisions < MAX_WRONG_DECISIONS;

    }
// =========================================
// SAVE EMPLOYEE DATA
// =========================================

if (currentEmployee) {

    // =========================================
    // CURRENT SCORE
    // =========================================

    currentEmployee.score =
        Number(score) || 0;


    // =========================================
    // RISK FACTOR
    // =========================================

    currentEmployee.risk =
        Number(riskFactor) || 0;


    // =========================================
    // WRONG DECISIONS
    // =========================================

    currentEmployee.wrongDecisions =
        Number(wrongDecisions) || 0;


    // =========================================
    // COMPLETION STATUS
    // =========================================

    currentEmployee.completed =
        Boolean(success) &&
        wrongDecisions < MAX_WRONG_DECISIONS;


    // =========================================
    // INCREASE ATTEMPT COUNT
    // =========================================

    currentEmployee.attempts =
        (Number(currentEmployee.attempts) || 0) + 1;


    // =========================================
    // BEST SCORE
    // =========================================

    currentEmployee.bestScore =
        Math.max(
            Number(currentEmployee.bestScore) || 0,
            Number(score) || 0
        );


    // =========================================
    // LAST ATTEMPT DATE / TIME
    // =========================================

    currentEmployee.lastAttempt =
        new Date().toLocaleString();


    // =========================================
    // COMPLETION TIME
    // =========================================

    currentEmployee.completionTime =
        completionTimeText;


    // =========================================
    // SAVE EMPLOYEE TO STORAGE
    // =========================================

    const employees =
        getEmployees();


    const index =
        employees.findIndex(
            function (employee) {

                return (
                    String(employee.id) ===
                    String(currentEmployee.id)
                );

            }
        );


    if (index !== -1) {

        employees[index] =
            currentEmployee;


        saveEmployees(
            employees
        );

    }

}
    // =========================================
    // UPDATE FINAL SCORE
    // =========================================

    const finalScore =
        document.getElementById(
            "final-score"
        );


    const finalRisk =
        document.getElementById(
            "final-risk"
        );


    if (finalScore) {

        finalScore.textContent =
            score + " / 400";

    }


    if (finalRisk) {

        finalRisk.textContent =
            riskFactor + "%";

    }


    // =========================================
    // UPDATE FINISH SCREEN TITLE
    // =========================================

    const finishTitle =
        document.querySelector(
            "#finish-screen h1"
        );


    if (finishTitle) {

        finishTitle.textContent =
            "🎉 CONGRATULATIONS!";

    }


    // =========================================
    // UPDATE FINISH SCREEN ICON
    // =========================================

    const finishIcon =
        document.querySelector(
            "#finish-screen .finish-icon"
        );


    if (finishIcon) {

        finishIcon.textContent =
            "🏆";

    }


    // =========================================
    // UPDATE MAIN FINISH MESSAGE
    // =========================================

    const finishDescription =
        document.querySelector(
            "#finish-screen .finish-card > p"
        );


    if (finishDescription) {

        finishDescription.textContent =
            "Your training is finished!";

    }


    // =========================================
    // CREATE RESULT MESSAGE
    // =========================================

    let resultMessage =
        document.getElementById(
            "finish-result-message"
        );


    if (!resultMessage) {

        resultMessage =
            document.createElement("p");

        resultMessage.id =
            "finish-result-message";

        resultMessage.className =
            "finish-result-message";


        const finalStats =
            document.querySelector(
                "#finish-screen .final-stats"
            );


        if (finalStats) {

            finalStats.insertAdjacentElement(
                "afterend",
                resultMessage
            );

        }

    }


    // =========================================
    // SCORE MESSAGE
    // =========================================
if (!success) {

    resultMessage.textContent =
        "Training completed. Please review the hazards and try again.";

}

else if (score >= 320) {

    resultMessage.textContent =
        "Excellent work! You demonstrated a strong understanding of workplace hazards. 🎯";

}

else if (score >= 200) {

    resultMessage.textContent =
        "Good job! You have successfully completed the Hazard Awareness Training. 👍";

}

else {

    resultMessage.textContent =
        "Training completed. Consider reviewing the hazards and trying again.";

}

    // =========================================
    // DESTROY MAIN 360 VIEWER
    // =========================================

    try {

        if (viewer) {

            viewer.destroy();

        }

    } catch (error) {

        console.log(
            "Viewer cleanup error:",
            error
        );

    }


    viewer = null;


    // =========================================
    // DESTROY INTRO 360 VIEWER
    // =========================================

    try {

        if (introViewer) {

            introViewer.destroy();

        }

    } catch (error) {

        console.log(
            "Intro viewer cleanup error:",
            error
        );

    }


    introViewer = null;


    // =========================================
    // EXIT FULLSCREEN
    // =========================================

    if (
        document.fullscreenElement
    ) {

        document
            .exitFullscreen()
            .catch(
                function () {}
            );

    }


    // =========================================
    // HIDE GAME PANELS
    // =========================================

    hideHazardPanel();

    hideResultPanel();


    // =========================================
    // SHOW FINISH SCREEN
    // =========================================

    showScreen(
        "finish-screen"
    );

}
/* =====================================================
   EXIT TRAINING
   ===================================================== */

function exitTraining() {

    const shouldExit =
        confirm(
            "Exit this training session?"
        );


    if (!shouldExit) {

        return;

    }


    // =========================================
    // STOP TRAINING TIMER
    // =========================================

    if (
        typeof stopTrainingTimer === "function"
    ) {

        stopTrainingTimer();

    }


    trainingTimerActive = false;

    trainingStartTime = null;


    // =========================================
    // SAVE CURRENT PROGRESS
    // =========================================

    saveProgress();


    // =========================================
    // DESTROY MAIN VIEWER
    // =========================================

    try {

        if (viewer) {

            viewer.destroy();

        }

    } catch (error) {

        console.log(
            "Viewer cleanup error:",
            error
        );

    }


    viewer = null;


    // =========================================
    // DESTROY INTRO VIEWER
    // =========================================

    try {

        if (introViewer) {

            introViewer.destroy();

        }

    } catch (error) {

        console.log(
            "Intro viewer cleanup error:",
            error
        );

    }


    introViewer = null;


    // =========================================
    // EXIT FULLSCREEN
    // =========================================

    if (
        document.fullscreenElement
    ) {

        document
            .exitFullscreen()
            .catch(
                function () {}
            );

    }


    // =========================================
    // HIDE HAZARD / RESULT PANELS
    // =========================================

    hideHazardPanel();

    hideResultPanel();

    removeGameNotification();


    // =========================================
    // HIDE GAME SCREEN
    // =========================================

    const gameScreen =
        document.getElementById(
            "game-screen"
        );


    if (gameScreen) {

        gameScreen.classList.add(
            "hidden"
        );

    }


    // =========================================
    // HIDE HUD
    // =========================================

    const hud =
        document.querySelector(
            ".game-hud"
        );


    if (hud) {

        hud.style.display =
            "none";

    }


    // =========================================
    // HIDE CUSTOM EXIT BUTTON
    // =========================================

    const customExit =
        document.getElementById(
            "custom-exit-training"
        );


    if (customExit) {

        customExit.style.display =
            "none";

    }


    // =========================================
    // HIDE FULLSCREEN BUTTON
    // =========================================

    const fullscreenButton =
        document.getElementById(
            "custom-fullscreen-button"
        );


    if (fullscreenButton) {

        fullscreenButton.style.display =
            "none";

    }


    // =========================================
    // RETURN TO LOGIN
    // =========================================

    showScreen(
        "login-screen"
    );

}
    /* =====================================================
       EXIT BUTTON
       ===================================================== */

    function setupExitButton() {

        const game =
            document.getElementById(
                "game-screen"
            );


        if (!game) {

            return;

        }


        let exitButton =
            document.getElementById(
                "custom-exit-training"
            );


        if (!exitButton) {

            exitButton =
                document.createElement(
                    "button"
                );


            exitButton.id =
                "custom-exit-training";


            exitButton.type =
                "button";


            exitButton.textContent =
                "EXIT TRAINING";


            exitButton.addEventListener(
                "click",
                function (event) {

                    event.preventDefault();
                    event.stopPropagation();

                    exitTraining();

                }
            );


            game.appendChild(
                exitButton
            );

        }


        exitButton.style.display =
            "block";


        exitButton.style.position =
            "fixed";


        exitButton.style.top =
            "20px";


        exitButton.style.left =
            "20px";


        exitButton.style.zIndex =
            "999999";


        exitButton.style.padding =
            "10px 16px";


        exitButton.style.background =
            "rgba(10,10,10,0.90)";


        exitButton.style.color =
            "#ffffff";


        exitButton.style.border =
            "1px solid rgba(255,255,255,0.35)";


        exitButton.style.borderRadius =
            "8px";


        exitButton.style.cursor =
            "pointer";


        exitButton.style.fontWeight =
            "700";


        exitButton.style.fontSize =
            "13px";

    }


    /* =====================================================
       FULLSCREEN BUTTON
       ===================================================== */

    function setupFullscreen() {

        const game =
            document.getElementById(
                "game-screen"
            );


        if (!game) {

            return;

        }


        let fullscreenButton =
            document.getElementById(
                "custom-fullscreen-button"
            );


        if (!fullscreenButton) {

            fullscreenButton =
                document.createElement(
                    "button"
                );


            fullscreenButton.id =
                "custom-fullscreen-button";


            fullscreenButton.type =
                "button";


            fullscreenButton.textContent =
                "⛶ FULLSCREEN";


            fullscreenButton.addEventListener(
                "click",
                function (event) {

                    event.preventDefault();
                    event.stopPropagation();

                    toggleFullscreen();

                }
            );


            game.appendChild(
                fullscreenButton
            );

        }


        fullscreenButton.style.display =
            "block";


        fullscreenButton.style.position =
            "fixed";


        fullscreenButton.style.top =
            "20px";


        fullscreenButton.style.right =
            "20px";


        fullscreenButton.style.zIndex =
            "999999";


        fullscreenButton.style.padding =
            "10px 16px";


        fullscreenButton.style.background =
            "rgba(10,10,10,0.90)";


        fullscreenButton.style.color =
            "#ffffff";


        fullscreenButton.style.border =
            "1px solid rgba(255,255,255,0.35)";


        fullscreenButton.style.borderRadius =
            "8px";


        fullscreenButton.style.cursor =
            "pointer";


        fullscreenButton.style.fontWeight =
            "700";


        fullscreenButton.style.fontSize =
            "13px";

    }


    /* =====================================================
       GAME CONTROLS
       ===================================================== */

    function setupGameControls() {

        setupFullscreen();

        setupExitButton();

        updateFullscreenUI();

        updateHUD();

    }


    /* =====================================================
       TOGGLE FULLSCREEN
       ===================================================== */

    function toggleFullscreen() {

        if (!document.fullscreenElement) {

            const element =
                document.documentElement;


            if (
                element.requestFullscreen
            ) {

                element
                    .requestFullscreen()
                    .then(function () {

                        setTimeout(
                            function () {

                                resizeViewer();
                                updateHUD();

                            },
                            150
                        );

                    })
                    .catch(function (error) {

                        console.error(
                            "Fullscreen failed:",
                            error
                        );

                    });

            }

        }

        else {

            if (document.exitFullscreen) {

                document
                    .exitFullscreen()
                    .then(function () {

                        setTimeout(
                            function () {

                                resizeViewer();
                                updateHUD();

                            },
                            150
                        );

                    })
                    .catch(function () {});

            }

        }

    }


    /* =====================================================
       FULLSCREEN CHANGE
       ===================================================== */

    document.addEventListener(
        "fullscreenchange",
        function () {

            updateFullscreenUI();


            setTimeout(
                function () {

                    resizeViewer();
                    updateHUD();

                },
                100
            );


            setTimeout(
                function () {

                    resizeViewer();
                    updateHUD();

                },
                500
            );

        }
    );


    /* =====================================================
       FULLSCREEN UI
       ===================================================== */

    function updateFullscreenUI() {

        const fullscreenButton =
            document.getElementById(
                "custom-fullscreen-button"
            );


        if (fullscreenButton) {

            fullscreenButton.style.display =
                "block";


            fullscreenButton.style.visibility =
                "visible";


            fullscreenButton.style.opacity =
                "1";


            fullscreenButton.style.zIndex =
                "999999";


            if (
                document.fullscreenElement
            ) {

                fullscreenButton.textContent =
                    "✕ EXIT FULLSCREEN";

            }

            else {

                fullscreenButton.textContent =
                    "⛶ FULLSCREEN";

            }

        }


        const exitButton =
            document.getElementById(
                "custom-exit-training"
            );


        if (exitButton) {

            exitButton.style.display =
                "block";


            exitButton.style.visibility =
                "visible";


            exitButton.style.opacity =
                "1";


            exitButton.style.zIndex =
                "999999";

        }


        const hud =
            document.querySelector(
                ".game-hud"
            );


        if (hud) {

            hud.style.position =
                "fixed";

            hud.style.top =
                "0";

            hud.style.left =
                "0";

            hud.style.width =
                "100%";

            hud.style.zIndex =
                "999990";

            hud.style.visibility =
                "visible";

            hud.style.opacity =
                "1";

            hud.style.display =
                "flex";

        }


        const hazardPanel =
            document.getElementById(
                "hazard-panel"
            );


        if (hazardPanel) {

            hazardPanel.style.zIndex =
                "999995";

        }


        const resultPanel =
            document.getElementById(
                "result-panel"
            );


        if (resultPanel) {

            resultPanel.style.zIndex =
                "999996";

        }

    }


    /* =====================================================
       KEYBOARD
       ===================================================== */

    document.addEventListener(
        "keydown",
        function (event) {

            if (
                event.key ===
                "Escape"
            ) {

                setTimeout(
                    function () {

                        resizeViewer();
                        updateHUD();

                    },
                    150
                );

            }

        }
    );


    /* =====================================================
       RESTART
       ===================================================== */

    const restartButton =
        document.getElementById(
            "restart-button"
        );


    if (restartButton) {

        restartButton.addEventListener(
            "click",
            function () {

                removeGameNotification();


                resetTraining();


                if (currentEmployee) {

                    currentEmployee.score =
                        0;


                    currentEmployee.risk =
                        0;


                    currentEmployee.wrongDecisions =
                        0;


                    currentEmployee.completed =
                        false;


                    const employees =
                        getEmployees();


                    const index =
                        employees.findIndex(
                            function (employee) {

                                return (
                                    String(employee.id) ===
                                    String(currentEmployee.id)
                                );

                            }
                        );


                    if (index !== -1) {

                        employees[index] =
                            currentEmployee;

                        saveEmployees(
                            employees
                        );

                    }

                }


                startIntroduction();

            }
        );

    }


    /* =====================================================
       BACK TO HOME
       ===================================================== */

    const backToHomeButton =
        document.getElementById(
            "back-to-home-button"
        );


    if (backToHomeButton) {

        backToHomeButton.addEventListener(
            "click",
            function () {

                removeGameNotification();


                hideHazardPanel();

                hideResultPanel();


                try {

                    if (viewer) {

                        viewer.destroy();

                    }

                } catch (error) {

                    console.log(
                        "Viewer cleanup error:",
                        error
                    );

                }


                viewer = null;


                try {

                    if (introViewer) {

                        introViewer.destroy();

                    }

                } catch (error) {

                    console.log(
                        "Intro viewer cleanup error:",
                        error
                    );

                }


                introViewer = null;


                currentEmployee = null;


                resetTraining();


                showScreen(
                    "login-screen"
                );

            }
        );

    }


    /* =====================================================
       INITIALISE
       ===================================================== */

    showScreen(
        "login-screen"
    );


    console.log(
        "✓ Hazard Zero initialized successfully."
    );

});