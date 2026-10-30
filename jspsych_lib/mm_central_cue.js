/**
 * jspsych-mm-central-cue
 * Two-set sequential color working memory task with a CENTRAL cue.
 *
 * Trial sequence:
 *   ITI → set 1 (left two circles) → ISI → set 2 (right two circles) → ISI →
 *   central cue (one of the 4 colors shown at fixation) → post-cue delay →
 *     (a) continuous color report of a probed circle  (same_group / other_group trials), or
 *     (b) left/right button press: which side was the central color on?  (side_report trials)
 *
 * Item indices: 0,1 = temporal group 1 (left side), 2,3 = temporal group 2 (right side).
 * The probed item is never the centrally cued item.
 *
 * Adapted from the mm_chunking plugin (Tim Brady, Janna Wennberg).
 * Color wheel: Schurgin et al.
 */

var mm_central_css_added = false;

var jsPsychMMCentralCue = (function (jspsych) {

    const info = {
        name: 'mm-central-cue',
        parameters: {
            // --- Design ---
            cue_index: {
                type: jspsych.ParameterType.INT,
                default: 0,
                description: 'Index (0-3) of the item shown at the center as the cue.'
            },
            trial_condition: {
                type: jspsych.ParameterType.STRING,
                default: 'same_group',
                description: "'same_group' | 'other_group' | 'side_report'"
            },
            probe_index: {
                type: jspsych.ParameterType.INT,
                default: null,
                description: 'Index (0-3) of the probed item. Ignored on side_report trials.'
            },

            // --- Manually specified values (optional; random if empty) ---
            item_values: {
                type: jspsych.ParameterType.FLOAT,
                array: true,
                default: [],
                description: 'Pre-specified color values (0-359). Length must equal set_size.'
            },

            // --- Timing (ms) ---
            display_time:   { type: jspsych.ParameterType.INT, default: 1000, description: 'Duration each set of stimuli is shown.' },
            isi_time:       { type: jspsych.ParameterType.INT, default: 750,  description: 'ISI between sets, and between set 2 and the cue.' },
            cue_time:       { type: jspsych.ParameterType.INT, default: 750,  description: 'Duration the central cue is shown.' },
            post_cue_delay: { type: jspsych.ParameterType.INT, default: 500,  description: 'Delay after the central cue before the probe.' },
            iti:            { type: jspsych.ParameterType.INT, default: 1000, description: 'Inter-trial interval.' },
            feedback_time:  { type: jspsych.ParameterType.INT, default: 1500, description: 'Duration of feedback (if shown).' },

            // --- Layout ---
            set_size:  { type: jspsych.ParameterType.INT, default: 4,   description: 'Total number of items (fixed at 4 for this design).' },
            item_size: { type: jspsych.ParameterType.INT, default: 90,  description: 'Diameter of each item circle (px).' },
            radius:    { type: jspsych.ParameterType.INT, default: 160, description: 'Radius of the placeholder ring (px).' },

            // --- Color constraints ---
            min_difference_color: { type: jspsych.ParameterType.INT, default: 40,
                description: 'Min angular distance between any two colors on a trial.' },

            // --- Feedback ---
            feedback: { type: jspsych.ParameterType.BOOL, default: false,
                description: 'Show feedback after response.' },

            // --- Display ---
            bg_color: { type: jspsych.ParameterType.STRING, default: '#DDDDDD',
                description: 'Background color of the experiment box.' },

            // --- Metadata (passed through to data) ---
            is_practice: { type: jspsych.ParameterType.BOOL, default: false }
        }
    };

    class MMCentralCuePlugin {
        constructor(jsPsych) {
            this.jsPsych = jsPsych;
        }

        trial(display_element, trial) {
            const self = this;

            /* ---- CSS (added once) ---------------------------------------- */
            if (!mm_central_css_added) {
                const css = `
                    .rc-placeholder {
                        position: absolute;
                        border-radius: 50%;
                        outline: 2px solid #555;
                        outline-offset: 4px;
                        box-sizing: border-box;
                    }
                    .rc-placeholder.probed { outline: 4px solid #111; outline-offset: 4px; }

                    #rc-central {
                        position: absolute;
                        border-radius: 50%;
                        box-sizing: border-box;
                        display: none;
                        z-index: 11;
                    }

                    #rc-box {
                        display: flex;
                        margin: 0 auto;
                        align-items: center;
                        justify-content: center;
                        border: 1px solid #888;
                        position: relative;
                    }

                    #rc-fixation {
                        position: absolute;
                        font-size: 24px;
                        user-select: none;
                        z-index: 10;
                    }

                    #rc-report-wheel {
                        position: absolute;
                        top: 0; left: 0;
                        width: 100%; height: 100%;
                        pointer-events: none;
                    }
                    .rc-ring-guide {
                        position: absolute;
                        border-radius: 50%;
                        border: 2px solid #aaa;
                        pointer-events: none;
                    }
                    .rc-color-dot {
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        position: absolute;
                        cursor: pointer;
                        box-sizing: border-box;
                        pointer-events: all;
                    }
                    .rc-color-dot:hover { transform: scale(1.3); }

                    /* Side-report prompt */
                    #rc-side-prompt {
                        position: absolute;
                        display: none;
                        flex-direction: column;
                        align-items: center;
                        gap: 14px;
                        z-index: 12;
                        font-size: 18px;
                        text-align: center;
                    }
                    #rc-side-prompt .rc-side-buttons { display: flex; gap: 40px; }
                    #rc-side-prompt button {
                        font-family: inherit;
                        font-size: 18px;
                        padding: 10px 28px;
                        cursor: pointer;
                    }
                `;
                const style = document.createElement('style');
                style.textContent = css;
                document.head.appendChild(style);
                mm_central_css_added = true;
            }

            /* ---- Validate design ----------------------------------------- */
            const { item_size, radius, set_size } = trial;
            if (set_size !== 4) throw new Error('mm-central-cue: set_size must be 4.');
            const halfN = set_size / 2;
            const groupOf = (idx) => (idx < halfN ? 1 : 2);
            const cond = trial.trial_condition;
            const cueIdx = trial.cue_index;
            if (!['same_group', 'other_group', 'side_report'].includes(cond)) {
                throw new Error(`mm-central-cue: unknown trial_condition "${cond}".`);
            }
            if (cond !== 'side_report') {
                if (trial.probe_index === null || trial.probe_index === cueIdx) {
                    throw new Error('mm-central-cue: probe_index must be set and differ from cue_index.');
                }
                const sameGroup = groupOf(trial.probe_index) === groupOf(cueIdx);
                if ((cond === 'same_group') !== sameGroup) {
                    throw new Error(`mm-central-cue: probe_index ${trial.probe_index} inconsistent with ${cond} (cue ${cueIdx}).`);
                }
            }

            /* ---- Layout ---------------------------------------------------- */
            const boxSize = radius * 2 + item_size * 2 + 100;
            const center  = boxSize / 2;
            const colorWheelRadius = radius + item_size + 10;

            let html = `<div id="rc-box" style="
                width:${boxSize}px; height:${boxSize}px;
                background:${trial.bg_color};">`;

            // Placeholder i: 0 = top-left, 1 = bottom-left, 2 = bottom-right, 3 = top-right
            for (let i = 0; i < set_size; i++) {
                const angle = (Math.PI * 2 / set_size) * i + Math.PI * 5 / 4;
                const top  = center + Math.cos(angle) * radius - item_size / 2;
                const left = center + Math.sin(angle) * radius - item_size / 2;
                html += `<div id="rc-item-${i}" class="rc-placeholder"
                    style="top:${top}px; left:${left}px;
                           width:${item_size}px; height:${item_size}px;"></div>`;
            }

            html += `<div id="rc-central" style="
                        top:${center - item_size / 2}px; left:${center - item_size / 2}px;
                        width:${item_size}px; height:${item_size}px;"></div>
                     <span id="rc-fixation">+</span>
                     <div id="rc-side-prompt">
                        <div>Which side was this color on?</div>
                        <div class="rc-side-buttons">
                            <button id="rc-side-left"  data-side="left">Left</button>
                            <button id="rc-side-right" data-side="right">Right</button>
                        </div>
                     </div>
                     <div id="rc-report-wheel"></div>
                     </div>`;

            display_element.innerHTML = html;

            /* ---- Assign values & positions ------------------------------- */
            // positions[itemIdx] = placeholder location. Items 0,1 → left (0/1), items 2,3 → right (2/3).
            const positions = [
                ...self.jsPsych.randomization.shuffle([0, 1]),
                ...self.jsPsych.randomization.shuffle([2, 3])
            ];
            const values = trial.item_values.length === set_size
                ? trial.item_values
                : generateColorValues(set_size, trial.min_difference_color);

            const set1Items = [0, 1];
            const set2Items = [2, 3];
            const sideOfPos = (p) => (p === 0 || p === 1 ? 'left' : 'right');

            const cuePos   = positions[cueIdx];
            const cueVal   = values[cueIdx];
            const cueSide  = sideOfPos(cuePos);
            const cueGroup = groupOf(cueIdx);

            const isSide   = cond === 'side_report';
            const probeIdx = isSide ? null : trial.probe_index;
            const probePos = isSide ? null : positions[probeIdx];
            const probeVal = isSide ? null : values[probeIdx];
            const probeGroup = isSide ? null : groupOf(probeIdx);

            /* ---- Display helpers ----------------------------------------- */
            const showItem = (itemIdx) => {
                document.getElementById(`rc-item-${positions[itemIdx]}`)
                    .style.backgroundColor = colorFromDeg(values[itemIdx]);
            };
            const hideItem = (itemIdx) => {
                document.getElementById(`rc-item-${positions[itemIdx]}`)
                    .style.backgroundColor = '';
            };
            const fixation = document.getElementById('rc-fixation');
            const central  = document.getElementById('rc-central');

            /* ---- Sequence -------------------------------------------------- */
            const T = (fn, ms) => self.jsPsych.pluginAPI.setTimeout(fn, ms);

            const showSet1 = () => { set1Items.forEach(showItem); T(hideSet1, trial.display_time); };
            const hideSet1 = () => { set1Items.forEach(hideItem); T(showSet2, trial.isi_time); };
            const showSet2 = () => { set2Items.forEach(showItem); T(hideSet2, trial.display_time); };
            const hideSet2 = () => { set2Items.forEach(hideItem); T(showCue,  trial.isi_time); };

            const showCue = () => {
                fixation.style.visibility = 'hidden';
                central.style.backgroundColor = colorFromDeg(cueVal);
                central.style.display = 'block';
                T(hideCue, trial.cue_time);
            };
            const hideCue = () => {
                central.style.display = 'none';
                central.style.backgroundColor = '';
                fixation.style.visibility = 'visible';
                T(isSide ? showSideQuestion : showProbe, trial.post_cue_delay);
            };

            /* ---- Response: continuous color report ----------------------- */
            let startTime = null;
            let trial_rt = null;
            let err = null;
            let reported_value = null;
            let side_response = null;
            let side_correct = null;

            const showProbe = () => {
                startTime = performance.now();
                document.getElementById(`rc-item-${probePos}`).classList.add('probed');
                buildColorWheel({
                    probePos, colorWheelRadius, center, item_size,
                    display_element, onResponse: onColorResponse
                });
            };

            const onColorResponse = (reportedValue) => {
                trial_rt = performance.now() - startTime;
                reported_value = reportedValue;
                err = circularError(reported_value, probeVal, 360);

                if (trial.feedback) {
                    document.getElementById(`rc-item-${probePos}`).style.backgroundColor = colorFromDeg(probeVal);
                    fixation.textContent = `Error: ${Math.abs(err)}°`;
                    T(endTrial, trial.feedback_time);
                } else {
                    T(endTrial, 100);
                }
            };

            /* ---- Response: side report ------------------------------------ */
            const showSideQuestion = () => {
                fixation.style.visibility = 'hidden';
                const prompt = document.getElementById('rc-side-prompt');
                prompt.style.display = 'flex';
                startTime = performance.now();
                const buttons = prompt.querySelectorAll('button');
                const handle = function () {
                    buttons.forEach(b => { b.removeEventListener('click', handle); b.disabled = true; });
                    onSideResponse(this.getAttribute('data-side'));
                };
                buttons.forEach(b => b.addEventListener('click', handle));
            };

            const onSideResponse = (side) => {
                trial_rt = performance.now() - startTime;
                side_response = side;
                side_correct = side === cueSide;

                if (trial.feedback) {
                    document.getElementById('rc-side-prompt').style.display = 'none';
                    fixation.style.visibility = 'visible';
                    fixation.textContent = side_correct
                        ? 'Correct!'
                        : `Incorrect, it was on the ${cueSide}.`;
                    T(endTrial, trial.feedback_time);
                } else {
                    T(endTrial, 100);
                }
            };

            /* ---- End trial -------------------------------------------------- */
            let trialEnded = false;
            const endTrial = () => {
                if (trialEnded) return;
                trialEnded = true;
                const trialData = {
                    is_practice:     trial.is_practice,
                    trial_condition: cond,               // same_group | other_group | side_report
                    set_size,

                    cue_index:       cueIdx,
                    cue_group:       cueGroup,           // 1 = first (left) set, 2 = second (right) set
                    cue_pos:         cuePos,
                    cue_side:        cueSide,
                    cue_value:       cueVal,

                    probe_index:     probeIdx,
                    probe_group:     probeGroup,
                    probe_pos:       probePos,
                    probe_value:     probeVal,
                    reported_value:  reported_value,
                    error:           err,

                    side_response:   side_response,
                    side_correct:    side_correct,

                    trial_rt:        trial_rt,
                    all_positions:   positions,
                    all_values:      values,

                    display_time:    trial.display_time,
                    isi_time:        trial.isi_time,
                    cue_time:        trial.cue_time,
                    post_cue_delay:  trial.post_cue_delay,
                };
                display_element.innerHTML = '';
                self.jsPsych.finishTrial(trialData);
            };

            /* ---- Go ---------------------------------------------------------- */
            T(showSet1, trial.iti);
        }
    }

    /* ================================================================== */
    /*  Helpers                                                             */
    /* ================================================================== */

    function generateColorValues(n, minDiff) {
        const picked = [];
        for (let k = 0; k < n; k++) {
            let v = randInt(0, 359);
            let tries = 0;
            while (picked.some(a => circularDist(v, a, 360) < minDiff) && tries < 500) {
                v = randInt(0, 359);
                tries++;
            }
            picked.push(v);
        }
        return picked;
    }

    function buildColorWheel({ probePos, colorWheelRadius, center, item_size, display_element, onResponse }) {
        const wheelDiv = document.getElementById('rc-report-wheel');

        let html = `<div class="rc-ring-guide" style="
                width:${colorWheelRadius * 2}px; height:${colorWheelRadius * 2}px;
                top:${center - colorWheelRadius}px; left:${center - colorWheelRadius}px;"></div>`;

        for (let i = 0; i < 360; i++) {
            const rgb = getColorRGB(i);
            const { top, left } = polarToPx(i, colorWheelRadius, center, 10, 10);
            html += `<div class="rc-color-dot" data-value="${i}"
                style="top:${top}px; left:${left}px;
                       background:rgb(${rgb[0]},${rgb[1]},${rgb[2]});"></div>`;
        }
        wheelDiv.innerHTML = html;

        const innerBound = colorWheelRadius - item_size * 0.4;
        const outerBound = colorWheelRadius + 25;
        const probeCircle = document.getElementById(`rc-item-${probePos}`);

        // Live hover preview in the probed placeholder
        const updatePreview = (e) => {
            const box = display_element.querySelector('#rc-box');
            if (!box) return;
            const rect = box.getBoundingClientRect();
            const relX = e.clientX - rect.left - center;
            const relY = e.clientY - rect.top  - center;
            const dist = Math.sqrt(relX * relX + relY * relY);
            const angle = wrapAngle(Math.atan2(relY, relX) / Math.PI * 180, 360);
            probeCircle.style.backgroundColor =
                (dist >= innerBound && dist <= outerBound) ? colorFromDeg(Math.round(angle)) : '';
        };
        document.addEventListener('mousemove', updatePreview);

        const allDots = wheelDiv.querySelectorAll('.rc-color-dot');
        const handleClick = function () {
            document.removeEventListener('mousemove', updatePreview);
            allDots.forEach(d => d.removeEventListener('click', handleClick));
            onResponse(parseInt(this.getAttribute('data-value')));
        };
        allDots.forEach(d => d.addEventListener('click', handleClick));
    }

    function circularError(reported, target, space) {
        let err = reported - target;
        while (err >  space / 2) err -= space;
        while (err < -space / 2) err += space;
        return Math.round(err);
    }
    function circularDist(a, b, space) {
        const d = Math.abs(a - b) % space;
        return Math.min(d, space - d);
    }
    function wrapAngle(v, space) { return ((v % space) + space) % space; }
    function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function polarToPx(angleDeg, r, center, dotHalfW, dotHalfH) {
        const rad = angleDeg / 180 * Math.PI;
        return {
            top:  center + Math.sin(rad) * r - dotHalfH,
            left: center + Math.cos(rad) * r - dotHalfW,
        };
    }

    function colorFromDeg(deg) {
        deg = ((deg % 360) + 360) % 360;
        const rgb = getColorRGB(deg);
        return `rgb(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])})`;
    }

    // Schurgin et al. color wheel lookup table (360 entries)
    function getColorRGB(deg) {
        const colorsList = [
            [246,37,111],[246,37,110],[246,37,109],[246,37,107.5],[246,37,106],
            [246,37,104.5],[246,37,103],[246,37.5,102],[246,38,101],[246,38.5,99.5],
            [246,39,98],[246,39.5,96.5],[246,40,95],[246,41,94],[246,42,93],
            [245.5,42.5,91.5],[245,43,90],[245,44,89],[245,45,88],[245,46,86.5],
            [245,47,85],[244.5,47.5,84],[244,48,83],[243.5,49,81.5],[243,50,80],
            [242.5,51,79],[242,52,78],[242,53,76.5],[242,54,75],[241.5,55.5,74],
            [241,57,73],[240.5,58,71.5],[240,59,70],[239,60,69],[238,61,68],
            [237.5,62,66.5],[237,63,65],[236.5,64,64],[236,65,63],[235.5,66,62],
            [235,67,61],[234,68.5,60],[233,70,59],[232.5,71,57.5],[232,72,56],
            [231,73,55],[230,74,54],[229,75,53],[228,76,52],[227.5,77,51],
            [227,78,50],[226,79,49],[225,80,48],[224,81,46.5],[223,82,45],
            [222,83,44],[221,84,43],[220,85,42],[219,86,41],[218,87,40],
            [217,88,39],[216,89,38],[215,90,37],[214,91,36.5],[213,92,36],
            [212,93,35],[211,94,34],[210,95,33],[209,96,32],[208,97,31],
            [207,98,30],[205.5,98.5,29.5],[204,99,29],[203,100,28],[202,101,27],
            [201,102,26.5],[200,103,26],[198.5,103.5,25],[197,104,24],[196,105,23.5],
            [195,106,23],[194,107,22.5],[193,108,22],[191.5,108.5,21.5],[190,109,21],
            [189,110,20.5],[188,111,20],[186.5,111.5,19.5],[185,112,19],[183.5,113,19],
            [182,114,19],[181,114.5,19],[180,115,19],[178.5,115.5,19],[177,116,19],
            [176,117,19],[175,118,19],[173.5,118.5,19],[172,119,19],[170.5,119.5,19.5],
            [169,120,20],[168,120.5,20.5],[167,121,21],[165.5,121.5,21.5],[164,122,22],
            [162.5,123,22.5],[161,124,23],[160,124.5,24],[159,125,25],[157.5,125.5,25.5],
            [156,126,26],[154.5,126.5,27],[153,127,28],[152,127.5,28.5],[151,128,29],
            [149.5,128.5,30],[148,129,31],[146.5,129,32],[145,129,33],[144,129.5,34],
            [143,130,35],[141.5,130.5,36],[140,131,37],[138.5,131.5,38],[137,132,39],
            [135.5,132.5,40],[134,133,41],[133,133.5,42.5],[132,134,44],[130.5,134,45],
            [129,134,46],[127.5,134.5,47],[126,135,48],[125,135.5,49],[124,136,50],
            [122.5,136,51.5],[121,136,53],[119.5,136.5,54],[118,137,55],[117,137,56.5],
            [116,137,58],[114.5,137.5,59],[113,138,60],[111.5,138,61.5],[110,138,63],
            [109,138.5,64],[108,139,65],[106.5,139,66.5],[105,139,68],[103.5,139.5,69.5],
            [102,140,71],[101,140,72],[100,140,73],[98.5,140.5,74.5],[97,141,76],
            [95.5,141,77.5],[94,141,79],[93,141,80],[92,141,81],[90.5,141.5,82.5],
            [89,142,84],[88,142,85.5],[87,142,87],[85.5,142,88.5],[84,142,90],
            [82.5,142,91],[81,142,92],[80,142,93.5],[79,142,95],[77.5,142.5,96.5],
            [76,143,98],[75,143,99.5],[74,143,101],[72.5,143,102.5],[71,143,104],
            [70,143,105],[69,143,106],[67.5,143,107.5],[66,143,109],[65,143,110.5],
            [64,143,112],[63,143,113.5],[62,143,115],[61,143,116],[60,143,117],
            [58.5,143,118.5],[57,143,120],[56,143,121.5],[55,143,123],[54,143,124.5],
            [53,143,126],[52.5,143,127],[52,143,128],[51,143,129.5],[50,143,131],
            [49.5,143,132.5],[49,143,134],[48,143,135],[47,143,136],[46.5,143,137.5],
            [46,143,139],[46,142.5,140],[46,142,141],[45.5,142,142.5],[45,142,144],
            [45,142,145],[45,142,146],[45,142,147.5],[45,142,149],[45.5,141.5,150],
            [46,141,151],[46.5,141,152.5],[47,141,154],[47.5,141,155],[48,141,156],
            [49,140.5,157],[50,140,158],[50.5,140,159],[51,140,160],[52,139.5,161],
            [53,139,162],[54.5,139,163.5],[56,139,165],[57,138.5,165.5],[58,138,166],
            [59.5,138,167],[61,138,168],[62.5,137.5,169],[64,137,170],[65.5,137,171],
            [67,137,172],[68.5,136.5,173],[70,136,174],[71.5,135.5,174.5],[73,135,175],
            [75,135,176],[77,135,177],[78.5,134.5,177.5],[80,134,178],[82,133.5,179],
            [84,133,180],[85.5,132.5,180.5],[87,132,181],[89,132,181.5],[91,132,182],
            [92.5,131.5,182.5],[94,131,183],[96,130.5,183.5],[98,130,184],[100,129.5,184.5],
            [102,129,185],[104,128.5,185.5],[106,128,186],[107.5,127.5,186.5],[109,127,187],
            [111,126.5,187.5],[113,126,188],[115,125.5,188],[117,125,188],[119,124,188.5],
            [121,123,189],[123,122.5,189],[125,122,189],[127,121.5,189],[129,121,189],
            [130.5,120.5,189.5],[132,120,190],[134,119,190],[136,118,190],[138,117.5,190],
            [140,117,190],[142,116.5,190],[144,116,190],[145.5,115,189.5],[147,114,189],
            [149,113.5,189],[151,113,189],[153,112,189],[155,111,189],[156.5,110,188.5],
            [158,109,188],[160,108.5,188],[162,108,188],[163.5,107,187.5],[165,106,187],
            [167,105.5,186.5],[169,105,186],[170.5,104,185.5],[172,103,185],[174,102,184.5],
            [176,101,184],[177.5,100,183.5],[179,99,183],[180.5,98,182.5],[182,97,182],
            [184,96,181.5],[186,95,181],[187.5,94,180.5],[189,93,180],[190.5,92,179],
            [192,91,178],[193.5,90,177.5],[195,89,177],[196.5,88,176],[198,87,175],
            [199.5,86,174.5],[201,85,174],[202.5,84,173],[204,83,172],[205,82,171],
            [206,81,170],[207.5,80,169],[209,79,168],[210,78,167.5],[211,77,167],
            [212.5,76,166],[214,75,165],[215,73.5,164],[216,72,163],[217.5,71,162],
            [219,70,161],[220,69,159.5],[221,68,158],[222,67,157],[223,66,156],
            [224,64.5,155],[225,63,154],[226,62,153],[227,61,152],[228,60,150.5],
            [229,59,149],[230,58,148],[231,57,147],[232,56,146],[233,55,145],
            [233.5,54,143.5],[234,53,142],[235,51.5,141],[236,50,140],[236.5,49,138.5],
            [237,48,137],[237.5,47.5,136],[238,47,135],[239,46,133.5],[240,45,132],
            [240.5,44,131],[241,43,130],[241.5,42.5,128.5],[242,42,127],[242.5,41,125.5],
            [243,40,124],[243,39.5,123],[243,39,122],[243.5,38.5,120.5],[244,38,119],
            [244.5,37.5,118],[245,37,117],[245,37,115.5],[245,37,114],[245.5,37,112.5]
        ];
        const idx = Math.round(((deg % 360) + 360) % 360);
        return colorsList[Math.min(idx, 359)];
    }

    MMCentralCuePlugin.info = info;
    return MMCentralCuePlugin;
})(jsPsychModule);
