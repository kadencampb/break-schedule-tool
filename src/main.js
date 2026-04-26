import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '../style.css';
import 'bootstrap'; // Bootstrap 4 JS — modal, collapse, dropdown (jQuery provided globally via vite.config inject plugin)

import { AppController } from './controllers/AppController.js';

document.addEventListener('DOMContentLoaded', () => {
    new AppController().init();
});
