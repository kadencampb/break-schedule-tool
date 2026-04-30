// Bootstrap 4's JS expects $ and jQuery as globals on window. ES modules don't
// hoist runtime assignments, so we put them on window in this dedicated module
// and import it BEFORE 'bootstrap' in main.js. The dep graph guarantees this
// module's body executes before bootstrap's.
import jQuery from 'jquery';

window.$ = jQuery;
window.jQuery = jQuery;
