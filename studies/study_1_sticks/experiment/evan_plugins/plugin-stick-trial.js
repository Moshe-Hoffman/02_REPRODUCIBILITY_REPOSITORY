var jsPsychStickTrial = (function (jspsych) {
    'use strict';
  
    const info = {
        name: "stick-trial",

        // just take in a list of stick value and also a (boolean list of which ones are covered)

        parameters: {
            stick_lengths: {
                type: jspsych.ParameterType.ARRAY,
                // array: jsPsych.ParameterType.FLOAT,
                pretty_name: 'Stick Length Values',
                default: [],
                description: 'Relevant for advocate conditions, to solicit .'
              },
              stick_covered:{
                type: jspsych.ParameterType.ARRAY,
                pretty_name: 'Sticks Covered',
                default: [],
                description: 'list of 1s and 0s indicating which sticks should be covered... .'
            },
            censored_direction:{
                type: jspsych.ParameterType.STRING,
                pretty_name: 'Censored Direction',
                default: "high",
                description: 'Relevant for advocate conditions, to solicit .'
            },
         // number of sticks drawn
            N_Sticks_Drawn: {
                type: jspsych.ParameterType.INT,
                pretty_name: 'Number of Sticks Drawn',
                default: 10,
                decription: 'Number of Sticks Drawn for Judge to Select From'
            },
            // number of sticks advocate selects
            N_Sticks_Covered: {
                type: jspsych.ParameterType.INT,
                pretty_name: 'Number of Sticks Covered',
                default: 5,
                decription: 'Number of Sticks Judge Will Select'
            },
            trial_number: {
                type: jspsych.ParameterType.INT,
                pretty_name: 'Trial Number',
                default: 1,
                description: 'The trial number'
              },
              total_trials: {
                type: jspsych.ParameterType.INT,
                pretty_name: 'Total Trials',
                default: 1,
              }
        }
    };


class StickTrialPlugin {
    constructor(jsPsych) {
      this.jsPsych = jsPsych;
    }

    trial(display_element, trial) {

        console.log(trial.stick_covered)



       // initialize whether an acceptable guess has been entered
       var acceptable_guess_entered = false;

        // INITIALIZE DATA THAT WE'LL SAVE
        var trial_data = {}

        // to compute response times
        var response_time_guess = NaN;
        var startTimeGuess = NaN;
        var currentTime = NaN;
        var N_Bad_Guesses = 0;

        // estimate
        var estimate = NaN;


        // this will display the sticks... 
        function display_sticks(sticksHTML, stickLengths, stickCovered){
            var cover_sticks = false;
            for (var i = 0; i < stickLengths.length; i++) {
                // Add HTML for each stick, its length text, and checkbox
                sticksHTML += '<div class="stick-container">' +
                    '<div class="stick-wrapper">' +
                    '<div class="stick" style="height:' + stickLengths[i] + 'px;"></div>' +
                    '<div class="stick-length">' + stickLengths[i] + '</div>' +
                    '<div class="rectangle" style="' + (stickCovered[i] ? 'display: block;' : 'display: none;') + '"></div>' +
                    '</div>';

                sticksHTML+= '</div>'
   
            }
            return sticksHTML
        }

        // generate the whole screen
        function gen_display_screen(stickLengths, stickCovered){

            // START THE TRIAL
            var instruction_text_top = `<p><strong>Round ${trial.trial_number} of ${trial.total_trials}</strong></p>`;

            // add bold to the selection words... 
            if (trial.censored_direction == "high"){
                instruction_text_top += `In this round, ${trial.N_Sticks_Drawn} new sticks were drawn, with random values between 1 and 100. <br> Sticks are ordered (left to right) by height. </br> The tallest ${trial.N_Sticks_Covered} are covered.`
            }
            else if (trial.censored_direction == "low"){
                instruction_text_top += `In this round, ${trial.N_Sticks_Drawn} new sticks were drawn, with random values between 1 and 100. <br> Sticks are ordered (left to right) by height. </br> The shortest ${trial.N_Sticks_Covered} are covered.`
            }
            else if (trial.censored_direction == "random"){
                instruction_text_top += `In this round ${trial.N_Sticks_Drawn} new sticks were drawn, with random values between 1 and 100. <br> Sticks are ordered (left to right) by height. </br> ${trial.N_Sticks_Covered} randomly selected sticks are covered.`
            }

            // Create HTML for sticks and rectangles
            var sticksHTML = '';

            // console.log(instruction_text)

            // display the sticks
            sticksHTML = display_sticks(sticksHTML, stickLengths, stickCovered)

            var screen_html = '<div id="stick-trial-container">' +
            '<div id="instruction-text">' + instruction_text_top + '</div>' +
            '<div id="sticks-container">' + sticksHTML + '</div>';
            //'<button id="continue-btn" class="jspsych-btn">' + trial.button_label + '</button>' +
            //'</div>';
            
            var guess_preamble = `<p> Please enter your guess for the average stick length of <strong> all </strong> ${trial.N_Sticks_Drawn} sticks (<strong>including </strong> the ones that are covered). <\p>`;

            screen_html += guess_preamble +
            '<div id="guess-container">' +
                '<label for="stick-average-guess"></label>' +

                /*  ⬇︎  add the extra attributes here  */
                '<input  type="text"                              ' +
                        'id="stick-average-guess"                   ' +
                        // give every trial a different name so Chrome
                        // can’t match the field to earlier answers
                        'name="avg_guess_' + jsPsych.timelineVariable('idx') + '"       ' +
                        'inputmode="decimal"                        ' +
                        'autocomplete="off"                         ' +
                        'autocorrect="off"                          ' +
                        'spellcheck="false"                         >' +
            '</div></div>';


            screen_html += '<button id="continue-btn" class="jspsych-btn">' + 'Continue' + '</button>';

            return screen_html
        }


        // start by showing the screen
        display_element.innerHTML = gen_display_screen(trial.stick_lengths, trial.stick_covered);
        startTimeGuess = performance.now();

                
        // when the button is clicked, check if the guess is acceptable
        display_element.querySelector('#continue-btn').addEventListener('click', () => {

            console.log("Button Clicked!!")
            // check if an acceptable guess has been entered
            currentTime = performance.now();
            response_time_guess = Math.round(currentTime - startTimeGuess);

            // grab the text data
            var guessInput = document.getElementById('stick-average-guess');
            estimate = guessInput.value;    

            // CHECK IF A NUMBER WAS ENTERED - IF NOT RETURN TO STAGE 3
            if (isNumber(estimate)){

                trial_data = {
                    estimate: estimate,
                    response_time_guess: response_time_guess,
                    N_Bad_Guesses: N_Bad_Guesses          
                }

                // record the data and end the trial
                this.jsPsych.finishTrial(trial_data)

            }else{

                showWarning('Please enter a number for your guess.', () => {
                    // put anything you need to re-initialise here
                    startTimeGuess = performance.now();
                    N_Bad_Guesses += 1;
                    document.querySelector('#guess-input')?.focus();   // example
                });

                // re-activate the button
               display_element.querySelector('#continue-btn').disabled = false;

            }

      });
    }
  }

  StickTrialPlugin.info = info;

  return StickTrialPlugin;

})(jsPsychModule);
