import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '../style.css';
import './bootstrap-shim.js'; // Sets window.$ / window.jQuery before bootstrap evaluates
import 'bootstrap'; // Bootstrap 4 JS — modal, collapse, dropdown

import { AppController } from './controllers/AppController.js';

document.addEventListener('DOMContentLoaded', () => {
    new AppController().init();
});
