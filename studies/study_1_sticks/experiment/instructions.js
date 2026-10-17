// Initialize jsPsych
const jsPsych = initJsPsych();


// define condition here

var initial_bonus = 2;
var penalty_cents = 4;

// ENTER PARAMETERS FOR TASK - SHOULD THESE BE PRE-DRAWN?
var Max_Stick_Length = 100
var Min_Stick_Length = 1 

// condition is 
var N_Trials = 27;
var N_Sticks_Drawn = 10;
var Trial_N_Sticks_Covered = 6;

var page1_html = `<div class="instruction-page">
    <div class="title"><h2>Welcome to the Study!</h2></div>

    <div class="section">

        <p>In this study, we are interested in how people make judgements given limited information. </p>
        <p>You will complete <strong>${N_Trials} rounds</strong>. In each round, we will randomly draw a <strong>bundle of 10 sticks</strong>, each with a height between <strong>1 and 100</strong>.</p>
        
        <p>However, you <strong>won't see all the sticks</strong>—some will be <strong>covered</strong>:</p>
        <ul>
            <li>The visible sticks might be the <strong>tallest</strong>, the <strong>shortest</strong>, or <strong> randomly </strong> selected.</li>
            <li>The number of covered sticks will <strong>vary by round</strong> and whether they are the tallest, shortest or randomly selected will vary by round.</li>
        </ul>
    </div>

    <div class="section">
        <h3>Your Task</h3>
        <p>Your job in each round will be to estimate the <strong>average height</strong> of all <strong>10 sticks</strong>, including the covered ones.</p>
    </div>

    <div class="section">
        <h3>Payment</h3>
        <p>The closer your guess is to the correct average, the <strong>higher your final bonus</strong> will be.</p>
        <p>Your <strong>bonus</strong> will be determined as follows:</p>
        <ul>
            <li>One round will be selected at random to determine your bonus.</li>
            <li>You start with a <strong>${2}$ bonus</strong>.</li>
            <li>For each point (rounded down) that your guess differs from the true average, your bonus will decrease by <strong>${penalty_cents} cents</strong>.</li>
        </ul>
    </div>
</div>`


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

var stickLengths = generateRandomStickLengths(N_Sticks_Drawn, Max_Stick_Length, Min_Stick_Length);
var stickCovered = Array(stickLengths.length).fill(false);

var complete_sticks_HTML = '';
complete_sticks_HTML = display_sticks(complete_sticks_HTML, stickLengths, stickCovered);

// Assuming you'll want to show only a subset of sticks for the second display
// You'll need to modify this based on how you want to select the visible sticks
var visible_sticks_HTML = '';
//var visible_sticks = original_stick_values_for_selection.slice(-4); // showing only X tallest sticks
var random_indices = jsPsych.randomization.sampleWithoutReplacement(Array(stickLengths.length).fill().map((x,i)=>i), Trial_N_Sticks_Covered);
for (var i = 0; i < random_indices.length; i++){
    stickCovered[random_indices[i]] = true;
}

visible_sticks_HTML = display_sticks(visible_sticks_HTML, stickLengths, stickCovered);

// Calculate mean for the example
var mean = stickLengths.reduce((a, b) => a + b) / stickLengths.length;
var example_guess = 65; // You can set this to whatever value you want
var bonus_reduction = Math.round(Math.abs(mean - example_guess) * penalty_cents); // edit this

var page2_html = `
<div class="instruction-page">
    <div class="title"></div>
    <div class="section">
        <p>Here's an example to help you understand how it works:</p>
        <p>Imagine these are the heights of the 10 sticks that are drawn:</p>
    </div>
    <div class="section">
        <div class="sticks-display">
            ${complete_sticks_HTML}
        </div>
    </div>
    <div class="section">
        <p>The mean of this pile is ${mean.toFixed(0)}.</p>
        <p>Imagine that in this trial, 6 randomly selected sticks were covered.</p>
        <p>Then, this is what would be shown to you:</p>
    </div>
    <div class="section">
        <div class="sticks-display">
            ${visible_sticks_HTML}
        </div>
    </div>
    <div class="section">
        <p>Then you would be asked to guess the average of the 10 originally drawn sticks (including the 6 that you didn't see).</p>
        <p>If this round is selected, your bonus will be based on the distance between your estimate and the true average (47).</p>

        <p>Suppose you guess ${example_guess}. Recall, the correct average was ${mean.toFixed(0)}. Therefore, your bonus would be reduced by ${bonus_reduction} cents.</p>
    </div>
        <div class="section">
        <p>You will need to pass a quiz on these instructions before beginning the task.</p>
    </div>
</div>
`;

var page2_html = `<div class="instruction-page">
    <div class="title"><h2>Example</h2></div>

    <div class="section">
        <p>Here's an example to help you understand how the task works.</p>
        <p>Imagine these are the heights of the 10 sticks that were drawn:</p>
    </div>

    <div class="section">
        <div class="sticks-display">
            ${complete_sticks_HTML}
        </div>
    </div>

    <div class="section">
        <p>The average height of these sticks is <strong>${mean.toFixed(0)}</strong>.</p>
        <p>Now, suppose in this trial, <strong>6 randomly selected sticks</strong> were covered.</p>
        <p>This is what would be shown to you:</p>
    </div>

    <div class="section">
        <div class="sticks-display">
            ${visible_sticks_HTML}
        </div>
    </div>

    <div class="section">
        <p>Your task would be to estimate the <strong>average height</strong> of all 10 sticks, including the ones you couldn’t see.</p>
        <p>For example, if you guessed <strong>${example_guess}</strong> and the true mean was <strong>${mean.toFixed(0)}</strong>, your bonus would be reduced by <strong>${bonus_reduction} cents</strong>.</p>
    </div>

    <div class="section">
        <p><strong>Before beginning the task, you must pass a short quiz on these instructions.</strong></p>
    </div>
</div>`


var instruction_pages = [page1_html, page2_html];

var instruction_trial = {
    type: jsPsychInstructions,
    pages: instruction_pages,
    show_clickable_nav: true
}

var quiz_questions = [
    {
        prompt: "Each round, how many sticks will be drawn?",
        options: [
            "5",
            "10",
            "15",
            "20"
        ],
        correct: 1  // Correct answer: 10
    },
    {
        prompt: "Will you always see all 10 sticks in a round?",
        options: [
            "Yes, all sticks will always be visible.",
            "No, some sticks will be covered, and the number covered may vary by round.",
            "No, but the same number of sticks is always covered in every round.",
            "Yes, but only if I get the previous round correct."
        ],
        correct: 1  // Correct answer: Some sticks will be covered, and the number varies
    },
    {
        prompt: "How are the covered sticks selected?",
        options: [
            "They are always the tallest sticks.",
            "They are always the shortest sticks.",
            "They might be the tallest, shortest, or randomly selected."
        ],
        correct: 2  // Correct answer: Selection varies
    },
    {
        prompt: "What is your task in each round?",
        options: [
            "Guess the height of the tallest stick.",
            "Guess the average height of the sticks whose height you can see.",
            "Guess the average height of all sticks that were drawn, including those that are covered.",
            "Count the number of sticks taller than 50."
        ],
        correct: 2  // Correct answer: Estimate the full bundle’s average height
    },
    {
        prompt: "How does the payment work in this study?",
        options: [
            "You receive a flat payment of $2.",
            "You start with a $2 bonus, which remains the same regardless of your guesses.",
            `You start with a $${initial_bonus} bonus, reduced by ${penalty_cents} cents for each point your guess is off from the correct answer.`,
            "You earn 50 cents for each correct answer."
        ],
        correct: 2  // Correct answer: Bonus is reduced based on error
    }
];


 // Define the quiz trial

 var instruction_correct = false;

 var instruction_check = { // this runs the quiz
   type: jsPsychSurveyMultiChoice,
   questions: quiz_questions,

   // on finish check which if any questions were incorrect (note - change these so they're not global vars)
   on_finish: function(quiz_data) {

       quiz_responses = quiz_data.response;
       // console.log(quiz_responses)

       total_correct = 0;

       incorrect_questions =['<br> </br'];

 
     for (let i = 0; i < quiz_questions.length; i++) {

       // start w/ an empty array then push onto this incorrect responses

       var correct_response = quiz_questions[i].options[quiz_questions[i].correct];
       var participant_response = quiz_responses['Q'+i]

       if (correct_response === participant_response) {
         total_correct++;
       }else{
           incorrect_questions.push('<br>' + quiz_questions[i].prompt)
       }
     }

     jsPsych.data.addProperties({
       incorrect_questions: incorrect_questions
     });

     if (total_correct === quiz_questions.length){
       instruction_correct = true;
     }

   } // end on finish
 }; // end quiz trial

/* define a page for the incorrect response */
var showsplash = true;
var splash_screen = { // this  is the screen if you answer incorectly
   type: jsPsychHtmlButtonResponse,
   timing_post_trial: 0,
   //    button_html: '<button class="jspsych-btn" style="display:none">%choice%</button>',
   choices: ['Click here to read the instructions again'],
   is_html: true,
   stimulus: function(){
           var incor_q = jsPsych.data.get().last(1).select('incorrect_questions').values
           var next_stimulus = 'The following questions were answered incorrectly: ' + incor_q;
           return next_stimulus
       }
}

var conditional_splash = { // 
   timeline: [splash_screen],
   conditional_function: function(data) {
     return !instruction_correct // skip if correct
     }
 }

var intro_loop = [];
intro_loop.push(instruction_trial);
intro_loop.push(instruction_check);
intro_loop.push(conditional_splash);

var intro_loop_node = {
   timeline: intro_loop,
   conditional_function: function(data) {
       return !instruction_correct // skip if correct
 },
   loop_function: function(data) {
     var action = true;
     return !instruction_correct // stop looping if correct
     }
 }

 var finish_instruc_screen = {
   type: jsPsychHtmlButtonResponse,
   timing_post_trial: 0,
   //    button_html: '<button class="jspsych-btn" style="display:none">%choice%</button>',
   choices: ['Begin the task!'],
   is_html: true,
   stimulus: 'You passed the quiz! Great work. Press the button to begin the task.'
}

var instruction_timeline = []
instruction_timeline.push(intro_loop_node)
//instruction_timeline.push(finish_instruc_screen)
