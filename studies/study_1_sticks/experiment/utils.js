  // this should go somewhere else
  // Define a function to generate random stick lengths
  function generateRandomStickLengths(N_Sticks, max_length, min_length) {
    var lengths = [];
    for (var i = 0; i < N_Sticks; i++) {
      lengths.push(Math.floor(Math.random() * (max_length - min_length)) + min_length); // Random length between 20 and 120
    }

    lengths.sort(function(a, b) { return a - b; }); // Sort lengths in ascending order

    return lengths;
  }

  // check if a value is a number...
  function isNumber(value) {
    return !isNaN(value) && value.trim() !== '';
}

function getQueryVariable(variable)
{
       var query = window.location.search.substring(1);
       var vars = query.split("&");
       for (var i=0;i<vars.length;i++) {
               var pair = vars[i].split("=");
               if(pair[0] == variable){return pair[1];}
       }
       return(false);
}

function showWarning(message, callback){
  // 1. dark overlay
  const overlay = document.createElement('div');
  overlay.id = 'warn-overlay';
  Object.assign(overlay.style, {
    position : 'fixed',
    inset    : 0,
    background:'rgba(0,0,0,.5)',
    zIndex   : 9999,
    display  : 'flex',
    alignItems:'center',
    justifyContent:'center',
  });

  // 2. dialog box
  overlay.innerHTML = `
    <div style="
        background:#fff; padding:1.5rem 2rem; border-radius:8px;
        max-width:320px; text-align:center; font-size:1.1rem;">
      <p style="margin-bottom:1rem">${message}</p>
      <button id="warn-ok" style="
        padding:.4rem 1.2rem; font-size:1rem; cursor:pointer;">OK</button>
    </div>`;

  document.body.appendChild(overlay);

  // 3. dismiss + callback
  overlay.querySelector('#warn-ok').addEventListener('click', () => {
    overlay.remove();
    if (callback) callback();
  }, { once:true });
}