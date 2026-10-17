
// ENTER PARAMETERS FOR TASK - SHOULD THESE BE PRE-DRAWN?
//var Max_Stick_Length = 100
//var Min_Stick_Length = 0 

// censored direction is going to vary accross trials.
// For each trial, we'll show sticks along with a rule... 

// This potentially varies accross subjects, but not accross trial... 
//var N_Trials = 10;

/* ---------- 0. Firebase + Firestore helpers ---------- */
import { db, authReady } from './firebaseSetup.js';
import {
  doc, setDoc, updateDoc, arrayUnion
} from 'https://www.gstatic.com/firebasejs/9.17.2/firebase-firestore.js';

let docRef; // will hold the Firestore document reference, global scope
const saveInterval = 3; // Save every 3 trials


// get the subject ID
const PROLIFIC_PID = window.location.search.includes('PROLIFIC_PID') ? getQueryVariable('PROLIFIC_PID') : Math.floor(Math.random() * 2000001);
const STUDY_ID = window.location.search.includes('STUDY_ID') ? getQueryVariable('STUDY_ID') : Math.floor(Math.random() * 2000001);
const SESSION_ID = window.location.search.includes('SESSION_ID') ? getQueryVariable('SESSION_ID') : Math.floor(Math.random() * 2000001);


async function saveDataset(trialNumber = null) {
  const allData = JSON.parse(jsPsych.data.get().json());

  await setDoc(
    docRef,
    {
      PROLIFIC_PID: PROLIFIC_PID,
        STUDY_ID: STUDY_ID,
        SESSION_ID: SESSION_ID,
      experiment_data_cumulative: allData,            // ← SAME field every time
      last_saved_trial          : trialNumber,        // optional meta
      timestamp                 : new Date().toISOString()
    },
    { merge: true }                                   // overwrite only these keys
  );
}


var end_screen = {
    type: jsPsychHtmlButtonResponse,
    timing_post_trial: 0,
    choices: ['End Task'],
    is_html: true,
    stimulus: function(){
        var task_data = jsPsych.data.get().json()
        //jsPsych.data.get().localSave('csv', 'experiment_data.csv');

        //var random_total_points = jsPsych.randomization.sampleWithoutReplacement(total_points_arr, 1);

        var string = 'You have finished the task. Thank you for your contribution to science! \
            <p> Your bonus will depend selection of a random round. You will receive it within 2 weeks. </p> \
            <p> <b> PLEASE CLICK END TASK TO SUBMIT THE TASK TO PROLIFIC </b> </p>';

        //db.collection('featuretask').doc(run_name).collection('subjects').doc(uid).collection('taskdata').doc('data').set({
        //bonus_points: random_total_points,
        //data:  task_data
       // })
    return string;
    },
    on_start: async function () {
    try {
      await saveDataset("final");                     // same field, last overwrite
      console.log("✓ Final data saved");
    } catch (err) {
      console.error("Final save failed:", err);
      alert("We’re retrying to save your data—please wait a moment.");
    }
  },
    on_finish: function(){
        window.location =  "https://app.prolific.com/submissions/complete?cc=C1379C4O"
    }
};


// Create an array to hold all trials
var timeline = [];

var full_screen = { // this plugin will prompt the full screen
    type: jsPsychFullscreen,
    fullscreen_mode: true
};

var preload = {
    type: jsPsychPreload,
    auto_preload: true ,
    max_load_time: 60000 // 1 minute
}

 timeline.push(full_screen);
timeline.push(consent_trial);
timeline.push(preload);

var include_instructions = true; // set to false to skip instructions
if (include_instructions){
    timeline.push(intro_loop_node)
    timeline.push(finish_instruc_screen)
}




var N_Sticks_Drawn = 10 // randomize... psuedo randomize - 27 trials per person.
var censored_directions = ["high", "low", "random"]
var N_Sticks_Covered_possibilities = [9, 8, 7, 6, 5, 4, 3, 2, 1]



var trial_censored_direction = []
var trial_n_sticks_covered = []

for (var CD_idx = 0; CD_idx < censored_directions.length; CD_idx++){
    var this_censored_direction = censored_directions[CD_idx];
    for (var N_idx = 0; N_idx < N_Sticks_Covered_possibilities.length; N_idx++){
        var this_n_sticks_covered = N_Sticks_Covered_possibilities[N_idx];
        trial_censored_direction.push(this_censored_direction);
        trial_n_sticks_covered.push(this_n_sticks_covered);
    }
}

var N_Trials = trial_censored_direction.length


// on authready, build the trials and timeline


authReady
  .then(async uid => {


    /* 3a. Firestore doc */
    docRef = doc(db, 'spin_task', 'ver1_prereg', 'subjects', uid);   // now global

    var stick_trials = []
    for (var t_idx = 0; t_idx < N_Trials; t_idx++){

        //console.log(trial_censored_direction[t_idx])

        // draw sticks for this trial
        var original_stick_values_for_selection = generateRandomStickLengths(N_Sticks_Drawn, Max_Stick_Length, Min_Stick_Length);

        // compute the mean of this vector
        var stick_mean = original_stick_values_for_selection.reduce((a, b) => a + b, 0) / original_stick_values_for_selection.length;

        // get number sticks selected for this trial
        var Trial_N_Sticks_Covered = trial_n_sticks_covered[t_idx];
        var stick_covered = Array(original_stick_values_for_selection.length).fill(false);


        // Use the censored direction to determine which sticks are covered
        if (trial_censored_direction[t_idx] == "high"){

            // make the stick_covered array. this should be an array with the same length as the original_stick_values_for_selection. it should be boolean, with true for the top Trial_Trial_N_Sticks_Covered indices and false for the other indices
            // the true values here should be at the end of the array
            for (var i = 0; i < Trial_N_Sticks_Covered; i++){
                stick_covered[original_stick_values_for_selection.length - 1 - i] = true;
            }
            
        } else if (trial_censored_direction[t_idx] == "low"){
            // first Trial_Trial_N_Sticks_Covered indices should be true
            for (var i = 0; i < Trial_N_Sticks_Covered; i++){
                stick_covered[i] = true;
            }

        } else if (trial_censored_direction[t_idx] == "random"){
            // first Trial_Trial_N_Sticks_Covered indices should be true
            var random_indices = jsPsych.randomization.sampleWithoutReplacement(Array(original_stick_values_for_selection.length).fill().map((x,i)=>i), Trial_N_Sticks_Covered);
            for (var i = 0; i < random_indices.length; i++){
                stick_covered[random_indices[i]] = true;
            }
        }

        // now set original stick values, at indexes wehre stick covered is true, to 0
        var stick_lengths = original_stick_values_for_selection.slice();
        for (var i = 0; i < stick_lengths.length; i++){
            if (stick_covered[i]){
                stick_lengths[i] = 0;
            }
        }

        var this_trial = {
            type: jsPsychStickTrial,
            stick_lengths: stick_lengths,
            stick_covered: stick_covered,
            censored_direction: trial_censored_direction[t_idx],
            N_Sticks_Drawn: N_Sticks_Drawn,
            N_Sticks_Covered: Trial_N_Sticks_Covered,
            total_trials: N_Trials,
            data: {
                stick_lengths: original_stick_values_for_selection,
                stick_covered: stick_covered,
                original_mean: stick_mean,
                censored_direction: trial_censored_direction[t_idx],
                N_Sticks_Drawn: N_Sticks_Drawn,
                N_Sticks_Covered: Trial_N_Sticks_Covered
            },
            // ADD THIS on_finish FUNCTION TO EACH TRIAL
            on_finish : async function () {
                const trialNumber = this.trial_number;            // value we injected earlier

                /* periodic autosave (unchanged) */
                if (trialNumber % saveInterval === 0) {
                    try      { await saveDataset(trialNumber); }
                    catch(e) { console.error("Autosave failed", e); }
                }

                /* ONE-OFF FINAL SAVE */
                if (trialNumber === N_Trials) {                   // ← last trial
                    try {
                    await saveDataset("final");                   // final overwrite
                    console.log("✓ Final data saved (last trial)");
                    } catch (e) {
                    console.error("Final save failed", e);
                    // optional: flag to the participant here, but the end screen is next
                    }
                }
            }



            // END OF ADDED on_finish FUNCTION
        }
        stick_trials.push(this_trial)
    }

    // shuffle the stick trials and then add a trial number to each
    stick_trials = jsPsych.randomization.shuffle(stick_trials);
    for (var i = 0; i < stick_trials.length; i++){
        stick_trials[i].trial_number = i + 1;
        stick_trials[i].data.trial_number = i + 1;
    }


    // append the stick trials to the timeline. stick_trials is a list. timeline is a list. i want to combine them to just one list
    timeline = timeline.concat(stick_trials);

    timeline.push(end_screen)

    jsPsych.run(timeline);

})
  .catch(err => {
    console.error('Firebase authentication failed:', err);
    document.body.innerHTML =
      '<h2 style="color:red;text-align:center;margin-top:40vh">' +
      'Authentication error—please reload.</h2>';
  });

  /* Optional: popup any otherwise-silent errors */
window.addEventListener('error', e => {
  alert(`A script error occurred:\n${e.message}\nSee console for details.`);
});
